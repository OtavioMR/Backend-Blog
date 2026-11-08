import { randomBytes, createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { transactionalMail } from '../mail/transactional-mail.js';

export const recoveryHash = (value: string) => createHash('sha256').update(value).digest('hex');
export type RecoveryConfig = { frontendUrl: string; jwtSecret: string };
export type RecoveryAuthority = { actorId: string; authVersion: number; code: string; reason: string } | { operator: string; reason: string } | { selfService: true; reason: string };

export function recoveryFrontend(value: string): string {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' && !loopback) || url.username || url.password || url.search || url.hash) throw new ServiceUnavailableException('Configure FRONTEND_URL com HTTPS em produção.');
  return value.replace(/\/+$/, '');
}

export async function lockRecoveryUser(manager: EntityManager, id: string) {
  const rows: { id: string; email: string; role: string; auth_version: number; password_hash: string; totp_enabled: boolean; login_locked_until: Date | null; recovery_email: string | null; recovery_email_verified_at: Date | null; recovery_email_available_at: Date | null }[] = await manager.query(
    'SELECT id, email, role, auth_version, password_hash, totp_enabled, login_locked_until, recovery_email, recovery_email_verified_at, recovery_email_available_at FROM users WHERE id = $1 AND is_active AND email_verified AND deleted_at IS NULL FOR UPDATE', [id]);
  return rows[0];
}

export async function authorizeRecovery(manager: EntityManager, user: NonNullable<Awaited<ReturnType<typeof lockRecoveryUser>>>, authority: RecoveryAuthority, config: RecoveryConfig) {
  const reason = authority.reason.trim();
  if (reason.length < 10 || reason.length > 1000) throw new BadRequestException('Registre a verificação de identidade e a referência do atendimento (10 a 1000 caracteres).');
  if (!user.totp_enabled) throw new ConflictException('A conta não possui autenticador ativo.');
  if (user.role === 'SUPER_ADMIN' && !('operator' in authority)) throw new ForbiddenException('SUPER_ADMIN exige o procedimento no servidor.');
  if (user.role !== 'SUPER_ADMIN' && (!user.recovery_email || !user.recovery_email_verified_at)) throw new ConflictException('A conta não possui e-mail de recuperação verificado.');
  if ('actorId' in authority && (user.id === authority.actorId || user.role === 'SUPER_ADMIN')) throw new ForbiddenException('A recuperação de SUPER_ADMIN exige o procedimento no servidor.');
  const base = recoveryFrontend(config.frontendUrl);
  const destination = user.recovery_email && user.recovery_email_verified_at ? user.recovery_email : user.email;
  const token = randomBytes(32).toString('base64url');
  const cancel = randomBytes(32).toString('base64url');
  const availableAt = new Date();
  const expiresAt = new Date(availableAt.getTime() + 24 * 60 * 60_000);
  await manager.query('UPDATE totp_recovery_grants SET consumed_at = now(), pending_secret = NULL WHERE user_id = $1 AND consumed_at IS NULL', [user.id]);
  const grants: { id: string }[] = await manager.query(`INSERT INTO totp_recovery_grants(user_id, token_hash, cancel_hash, auth_version, email, role, available_at, expires_at, recovery_email)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, [user.id, recoveryHash(token), recoveryHash(cancel), user.auth_version, user.email, user.role, availableAt, expiresAt, user.recovery_email]);
  const link = `${base}/recuperar-autenticador#token=${token}`;
  const cancelLink = `${base}/recuperar-autenticador#cancel=${cancel}`;
  await transactionalMail(manager, config.jwtSecret, { to: destination, subject: 'Recuperação do autenticador autorizada — Grifório',
    text: `Uma recuperação do seu autenticador foi solicitada. Seu autenticador continua ativo.\nDisponível a partir de ${availableAt.toISOString()} e válida até ${expiresAt.toISOString()}.\nPara configurar o novo autenticador, use sua senha atual: ${link}\nSe não reconhece esta solicitação, cancele imediatamente: ${cancelLink}\nNão compartilhe estes links.`, expiresAt: expiresAt.getTime() });
  if (destination !== user.email) await transactionalMail(manager, config.jwtSecret, { to: user.email, subject: 'Aviso de recuperação do autenticador — Grifório', text: `Foi solicitada uma recuperação do autenticador. O link de acesso foi enviado somente ao e-mail de recuperação. Se não reconhece, cancele: ${cancelLink}\nSeu autenticador permanece ativo até a conclusão.`, expiresAt: expiresAt.getTime() });
  await manager.query(`INSERT INTO audit_logs(actor_id, action, target_type, target_id, details) VALUES ($1, 'auth.totp_recovery_authorized', 'user', $2, $3::jsonb)`,
    ['actorId' in authority ? authority.actorId : 'selfService' in authority ? user.id : null, user.id, JSON.stringify({ grantId: grants[0].id, reason, ...('operator' in authority ? { operator: authority.operator } : {}), selfService: 'selfService' in authority, availableAt, expiresAt })]);
  return { authorized: true, availableAt: availableAt.toISOString(), expiresAt: expiresAt.toISOString() };
}
