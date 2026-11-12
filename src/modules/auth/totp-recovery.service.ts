import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import bcrypt from 'bcrypt';
import { setTimeout as delay } from 'node:timers/promises';
import { TotpService } from './totp.service.js';
import { authorizeRecovery, lockRecoveryUser, recoveryHash, type RecoveryConfig, type RecoveryDestination } from './totp-recovery-operations.js';
import { transactionalMail } from '../mail/transactional-mail.js';

type Grant = { id: string; user_id: string; email: string; recovery_email: string | null; role: string; auth_version: number; created_at: Date; available_at: Date; expires_at: Date; attempts: number; consumed_at: Date | null; pending_secret: string | null; pending_expires_at: Date | null };

@Injectable()
export class TotpRecoveryService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService, private readonly totp: TotpService) {}
  private settings(): RecoveryConfig {
    return { frontendUrl: this.config.getOrThrow<string>('FRONTEND_URL'), jwtSecret: this.config.getOrThrow<string>('JWT_SECRET') };
  }

  async request(email: string, password: string) {
    const started = Date.now();
    try {
      const result = await this.db.transaction(async manager => {
        const found: { id: string }[] = await manager.query('SELECT id FROM users WHERE email = $1 AND is_active AND email_verified AND deleted_at IS NULL', [email.trim().toLowerCase()]);
        const user = found[0] ? await lockRecoveryUser(manager, found[0].id) : undefined;
        const valid = await bcrypt.compare(password, user?.password_hash ?? '$2b$12$1V0Y5v5dUHYeOwtoasAswuk3ESkRespVkPTfR2TzRFdg.y65Vxk/S');
        if (user && !valid) await manager.query(`UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
          login_locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE login_locked_until END
          WHERE id = $1 AND (login_locked_until IS NULL OR login_locked_until <= now())`, [user.id]);
        if (!user || !valid || Buffer.byteLength(password, 'utf8') > 72 || (user.login_locked_until && user.login_locked_until.getTime() > Date.now())) return null;
        if (!user.totp_enabled) return { status: 'not_enabled' as const, message: 'Esta conta não possui autenticador ativo. Nenhum e-mail foi enviado. Volte à entrada para acessar com sua senha.' };
        if (user.role === 'SUPER_ADMIN' || !user.recovery_email || !user.recovery_email_verified_at) return { status: 'assisted_required' as const, message: 'Não há recuperação automática disponível para esta conta. Nenhum e-mail foi enviado. Entre com um código reserva ou solicite análise assistida de titularidade.' };
        const recent: { retry_at: Date }[] = await manager.query("SELECT created_at + interval '30 minutes' AS retry_at FROM totp_recovery_grants WHERE user_id = $1 AND created_at > now() - interval '30 minutes' ORDER BY created_at DESC LIMIT 1", [user.id]);
        if (recent.length) return { status: 'cooldown' as const, message: 'Uma solicitação recente impede um novo envio por 30 minutos. Confira o e-mail de recuperação ou aguarde o horário informado.', retryAt: recent[0].retry_at.toISOString() };
        await authorizeRecovery(manager, user, { selfService: true, reason: 'Recuperação solicitada com senha atual e e-mail de recuperação previamente verificado.' }, this.settings(), 'secondary');
        return { status: 'sent' as const, message: 'Instruções enviadas ao e-mail de recuperação confirmado. O e-mail principal recebeu um aviso de segurança. Confira também a pasta de spam.' };
      });
      if (!result) throw new UnauthorizedException('E-mail ou senha inválidos, ou conta temporariamente indisponível.');
      return result;
    } finally { await delay(Math.max(0, 500 - (Date.now() - started))); }
  }

  async authorize(actorId: string, authVersion: number, targetId: string, code: string, reason: string, destination: RecoveryDestination = 'primary') {
    if (actorId === targetId) throw new ForbiddenException('Não é permitido autorizar sua própria recuperação.');
    return this.db.transaction(async manager => {
      // All multi-user operations acquire locks in a stable order.
      const locked = new Map<string, Awaited<ReturnType<typeof lockRecoveryUser>>>();
      for (const id of [actorId, targetId].sort()) locked.set(id, await lockRecoveryUser(manager, id));
      const actor = locked.get(actorId), target = locked.get(targetId);
      if (!actor || actor.role !== 'SUPER_ADMIN' || actor.auth_version !== authVersion || !actor.totp_enabled || !actor.recovery_email || !actor.recovery_email_verified_at) throw new ForbiddenException('Autorização administrativa inválida.');
      if (!target) throw new ConflictException('Conta ativa e verificada não encontrada.');
      if (target.role === 'SUPER_ADMIN') throw new ForbiddenException('SUPER_ADMIN exige o procedimento no servidor.');
      if (!(await this.totp.verifyLogin(actorId, code, manager, undefined))) {
        // verifyLogin with its own transaction would deadlock while this row is locked.
        throw new UnauthorizedException('Código TOTP inválido.');
      }
      return authorizeRecovery(manager, target, { actorId, authVersion, code, reason }, this.settings(), destination);
    });
  }

  async cancel(token: string) {
    return this.db.transaction(async manager => {
      // Locate without a lock, then take user -> grant locks consistently with issue/complete.
      const found: { user_id: string }[] = await manager.query('SELECT user_id FROM totp_recovery_grants WHERE cancel_hash = $1', [recoveryHash(token)]);
      if (!found[0]) throw new UnauthorizedException('Autorização inválida ou expirada.');
      const user = await lockRecoveryUser(manager, found[0].user_id);
      const rows: { id: string }[] = await manager.query(`WITH cancelled AS (UPDATE totp_recovery_grants SET consumed_at = now(), pending_secret = NULL
        WHERE cancel_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING id) SELECT id FROM cancelled`, [recoveryHash(token)]);
      if (!rows[0] || !user) throw new UnauthorizedException('Autorização inválida ou expirada.');
      await manager.query("INSERT INTO audit_logs(actor_id, action, target_type, target_id, details) VALUES (NULL, 'auth.totp_recovery_cancelled', 'user', $1, $2::jsonb)", [user.id, JSON.stringify({ grantId: rows[0].id })]);
      return { cancelled: true };
    });
  }

  async recover(token: string, password: string, code?: string) {
    const result = await this.db.transaction(async manager => {
      const found: { user_id: string }[] = await manager.query('SELECT user_id FROM totp_recovery_grants WHERE token_hash = $1', [recoveryHash(token)]);
      if (!found[0]) return null;
      const user = await lockRecoveryUser(manager, found[0].user_id);
      const rows: Grant[] = await manager.query('SELECT * FROM totp_recovery_grants WHERE token_hash = $1 FOR UPDATE', [recoveryHash(token)]);
      const grant = rows[0];
      if (!user || !grant || grant.consumed_at || grant.expires_at.getTime() <= Date.now() || grant.attempts >= 10 || grant.auth_version !== user.auth_version || grant.email !== user.email || grant.role !== user.role || grant.recovery_email !== user.recovery_email) return null;
      if (user.login_locked_until && user.login_locked_until.getTime() > Date.now()) return null;
      // Persist attempts even when credentials fail; do not throw until after commit.
      await manager.query('UPDATE totp_recovery_grants SET attempts = attempts + 1 WHERE id = $1', [grant.id]);
      if (Buffer.byteLength(password, 'utf8') > 72 || !(await bcrypt.compare(password, user.password_hash))) return null;
      if (code === undefined) {
        const { encryptedSecret, ...setup } = await this.totp.prepareRecovery(user.email);
        await manager.query('UPDATE totp_recovery_grants SET pending_secret = $1, pending_expires_at = $2 WHERE id = $3', [encryptedSecret, new Date(Date.now() + 600_000), grant.id]);
        return setup;
      }
      if (!grant.pending_secret || !grant.pending_expires_at || grant.pending_expires_at.getTime() <= Date.now()) return null;
      const recoveryCodes = await this.totp.replaceRecoveredFactor(manager, user.id, grant.pending_secret, code);
      if (!recoveryCodes) return null;
      await manager.query('UPDATE totp_recovery_grants SET consumed_at = now(), pending_secret = NULL WHERE user_id = $1 AND consumed_at IS NULL', [user.id]);
      await manager.query("INSERT INTO audit_logs(actor_id, action, target_type, target_id, details) VALUES (NULL, 'auth.totp_recovered', 'user', $1, $2::jsonb)", [user.id, JSON.stringify({ grantId: grant.id })]);
      await transactionalMail(manager, this.settings().jwtSecret, { to: user.email, subject: 'Seu autenticador foi substituído — Grifório', text: 'A recuperação do seu autenticador foi concluída. Todas as sessões e os códigos de recuperação antigos foram invalidados. Entre com sua senha e o novo autenticador. Se não reconhece esta operação, contate imediatamente o responsável pela plataforma.', expiresAt: Date.now() + 24 * 60 * 60_000 });
      if (user.recovery_email && user.recovery_email !== user.email) await transactionalMail(manager, this.settings().jwtSecret, { to: user.recovery_email, subject: 'Seu autenticador foi substituído — Grifório', text: 'A recuperação foi concluída. Todas as sessões e os códigos antigos foram invalidados. Aguarde o próximo código do novo autenticador para entrar.', expiresAt: Date.now() + 24 * 60 * 60_000 });
      return { recovered: true as const, recoveryCodes };
    });
    if (!result) throw new UnauthorizedException('Autorização, senha ou código inválido. A autorização pode ter expirado ou atingido o limite de tentativas.');
    return result;
  }
}
