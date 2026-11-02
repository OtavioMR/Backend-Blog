import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { UserRole } from '../users/enums/user.enum.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService, TokenPairResult } from './auth.service.js';
import { TotpService } from './totp.service.js';

type Provider = 'google' | 'github';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
@Injectable()
export class SocialAuthService {
  constructor(private readonly dataSource: DataSource, private readonly config: ConfigService, private readonly auth: AuthService, private readonly totp: TotpService, private readonly audit: AuditService, private readonly usersService: UsersService) {}
  private provider(value: string): Provider {
    if (value !== 'google' && value !== 'github') throw new BadRequestException('Provedor não suportado.');
    return value;
  }
  private settings(provider: Provider) {
    const prefix = provider.toUpperCase();
    const clientId = this.config.get<string>(`${prefix}_CLIENT_ID`), clientSecret = this.config.get<string>(`${prefix}_CLIENT_SECRET`), redirectUri = this.config.get<string>(`${prefix}_CALLBACK_URL`);
    if (!clientId || !clientSecret || !redirectUri) throw new ServiceUnavailableException('Provedor de login social não configurado.');
    let url: URL;
    try { url = new URL(redirectUri); } catch { throw new ServiceUnavailableException('Configuração de callback social inválida.'); }
    if (!['https:', 'http:'].includes(url.protocol) || (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new ServiceUnavailableException('Configuração de callback social inválida.');
    return { clientId, clientSecret, redirectUri };
  }
  async start(rawProvider: string, link?: { id: string; authVersion: number; sessionId: string }) {
    const provider = this.provider(rawProvider), config = this.settings(provider);
    const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
    await this.dataSource.query('DELETE FROM oauth_states WHERE expires_at < CURRENT_TIMESTAMP');
    await this.dataSource.query("INSERT INTO oauth_states(state_hash, provider, verifier, link_user_id, link_auth_version, link_session_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + interval '10 minutes')", [hash(state), provider, verifier, link?.id ?? null, link?.authVersion ?? null, link?.sessionId ?? null]);
    const url = new URL(provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: provider === 'google' ? 'openid email profile' : 'read:user user:email', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return { state, url: url.toString() };
  }
  private async json(url: string, init: RequestInit): Promise<any> {
    let response: Response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) }); }
    catch { throw new ServiceUnavailableException('Provedor de identidade indisponível.'); }
    if (!response.ok) throw new UnauthorizedException('Falha na autenticação social.');
    try { return await response.json(); } catch { throw new UnauthorizedException('Falha na autenticação social.'); }
  }
  private async identity(provider: Provider, code: string, verifier: string) {
    const config = this.settings(provider);
    const token = await this.json(provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, code_verifier: verifier, redirect_uri: config.redirectUri, grant_type: 'authorization_code' }) });
    if (typeof token.access_token !== 'string') throw new UnauthorizedException('Falha na autenticação social.');
    const headers = { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json', 'User-Agent': 'Backend-Blog' };
    if (provider === 'google') {
      const profile = await this.json('https://openidconnect.googleapis.com/v1/userinfo', { headers });
      if (typeof profile.sub !== 'string' || typeof profile.email !== 'string' || profile.email_verified !== true) throw new UnauthorizedException('É necessário um e-mail verificado.');
      return { subject: profile.sub, email: profile.email.trim().toLowerCase(), name: String(profile.name || profile.email).slice(0, 100) };
    }
    const [profile, emails] = await Promise.all([this.json('https://api.github.com/user', { headers }), this.json('https://api.github.com/user/emails', { headers })]);
    const primary = Array.isArray(emails) ? emails.find((email: any) => email.primary && email.verified && typeof email.email === 'string') : null;
    if (!primary || (typeof profile.id !== 'number' && typeof profile.id !== 'string')) throw new UnauthorizedException('É necessário um e-mail verificado.');
    return { subject: String(profile.id), email: primary.email.trim().toLowerCase(), name: String(profile.name || profile.login || primary.email).slice(0, 100) };
  }
  async callback(rawProvider: string, code: string, state: string, cookie: string, userAgent?: string): Promise<{ tokens?: TokenPairResult; challenge?: string; linked?: boolean }> {
    const provider = this.provider(rawProvider);
    if (!code || code.length > 4096 || !state || !cookie || state.length > 256 || cookie.length > 256 || !timingSafeEqual(Buffer.from(hash(state)), Buffer.from(hash(cookie)))) throw new UnauthorizedException('Estado OAuth inválido.');
    const states = await this.dataSource.query('WITH consumed AS (DELETE FROM oauth_states WHERE state_hash = $1 AND provider = $2 AND expires_at > CURRENT_TIMESTAMP RETURNING verifier, link_user_id, link_auth_version, link_session_id) SELECT * FROM consumed', [hash(state), provider]);
    if (!states.length) throw new UnauthorizedException('Estado OAuth inválido.');
    const identity = await this.identity(provider, code, states[0].verifier);
    const user = await this.dataSource.transaction(async manager => {
      const existing = await manager.query('SELECT user_id FROM social_identities WHERE provider = $1 AND subject = $2', [provider, identity.subject]);
      if (states[0].link_user_id) {
        const linked = await manager.getRepository(User).findOneBy({ id: states[0].link_user_id, isActive: true });
        if (!linked || linked.authVersion !== states[0].link_auth_version || !linked.emailVerified || linked.email.toLowerCase() !== identity.email) throw new UnauthorizedException('A conta não pode ser vinculada.');
        const sessions = await manager.query('SELECT id FROM auth_sessions WHERE id = $1 AND user_id = $2 AND auth_version = $3 AND expires_at > CURRENT_TIMESTAMP FOR UPDATE', [states[0].link_session_id, linked.id, linked.authVersion]);
        if (!sessions.length) throw new UnauthorizedException('A conta não pode ser vinculada.');
        if (existing.length) throw new ConflictException('Identidade social já vinculada.');
        try { await manager.query('INSERT INTO social_identities(provider, subject, user_id) VALUES ($1, $2, $3)', [provider, identity.subject, linked.id]); }
        catch (error) { if ((error as any).code === '23505') throw new ConflictException('Identidade social já vinculada.'); throw error; }
        await this.audit.record(manager, linked.id, 'auth.social_linked', 'user', linked.id, { provider });
        return { user: linked, linked: true };
      }
      if (existing.length) {
        const linked = await manager.getRepository(User).findOneBy({ id: existing[0].user_id, isActive: true });
        if (!linked || !linked.emailVerified) throw new UnauthorizedException('Conta indisponível.');
        return { user: linked, linked: false };
      }
      if (await manager.getRepository(User).findOne({ where: { email: identity.email }, withDeleted: true })) throw new ConflictException('Entre na conta e vincule este provedor explicitamente.');
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
      const created = await manager.getRepository(User).save(manager.getRepository(User).create({ email: identity.email, name: identity.name, passwordHash, emailVerified: true, isActive: true, role: UserRole.READER }));
      await manager.query('INSERT INTO social_identities(provider, subject, user_id) VALUES ($1, $2, $3)', [provider, identity.subject, created.id]);
      await this.audit.record(manager, created.id, 'auth.social_registered', 'user', created.id, { provider });
      return { user: created, linked: false };
    }).catch(error => {
      if ((error as { code?: string; driverError?: { code?: string } }).code === '23505' || (error as { driverError?: { code?: string } }).driverError?.code === '23505') throw new ConflictException('Conta social já existe ou exige vínculo explícito.');
      throw error;
    });
    if (user.linked) return { linked: true };
    if (user.user.loginLockedUntil && new Date(user.user.loginLockedUntil).getTime() > Date.now()) throw new UnauthorizedException('Conta indisponível.');
    if (user.user.totpEnabled) {
      const challenge = randomBytes(32).toString('base64url');
      await this.dataSource.query('DELETE FROM oauth_challenges WHERE expires_at < CURRENT_TIMESTAMP');
      await this.dataSource.query("INSERT INTO oauth_challenges(token_hash, user_id, auth_version, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + interval '5 minutes')", [hash(challenge), user.user.id, user.user.authVersion]);
      return { challenge };
    }
    return { tokens: await this.auth.createSession(user.user, userAgent) };
  }
  async finishChallenge(challenge: string, code: string, userAgent?: string) {
    if (!challenge || challenge.length > 256) throw new UnauthorizedException('Desafio inválido.');
    const user = await this.dataSource.transaction(async manager => {
      const rows = await manager.query('SELECT user_id, auth_version FROM oauth_challenges WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP FOR UPDATE', [hash(challenge)]);
      if (!rows.length) throw new UnauthorizedException('Desafio ou código inválido.');
      const current = await manager.getRepository(User).findOneBy({ id: rows[0].user_id, isActive: true });
      if (!current || current.authVersion !== rows[0].auth_version || (current.loginLockedUntil && new Date(current.loginLockedUntil).getTime() > Date.now())) throw new UnauthorizedException('Desafio ou código inválido.');
      if (!(await this.totp.verifyLogin(current.id, code))) {
        await this.usersService.recordFailedLogin(current.id);
        throw new UnauthorizedException('Desafio ou código inválido.');
      }
      if (!(await this.usersService.clearFailedLogins(current.id))) throw new UnauthorizedException('Desafio ou código inválido.');
      await manager.query('DELETE FROM oauth_challenges WHERE token_hash = $1', [hash(challenge)]);
      const user = await manager.getRepository(User).findOneBy({ id: rows[0].user_id, isActive: true });
      if (!user || user.authVersion !== rows[0].auth_version) throw new UnauthorizedException('Conta indisponível.');
      return user;
    });
    return this.auth.createSession(user, userAgent);
  }
}
