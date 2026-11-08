import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { TotpService } from './totp.service.js';
import { lockRecoveryUser, recoveryHash, recoveryFrontend } from './totp-recovery-operations.js';
import { transactionalMail } from '../mail/transactional-mail.js';

@Injectable()
export class RecoveryEmailService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService, private readonly totp: TotpService) {}
  async status(userId: string) {
    const [value]: { email: string | null; verified: boolean; pendingEmail: string | null; availableAt: Date | null }[] = await this.db.query(`SELECT recovery_email AS email, (recovery_email IS NOT NULL AND recovery_email_verified_at IS NOT NULL) AS verified,
      CASE WHEN recovery_email_expires_at > now() AND recovery_email_auth_version = auth_version THEN pending_recovery_email ELSE NULL END AS "pendingEmail", recovery_email_verified_at AS "availableAt"
      FROM users WHERE id = $1 AND is_active AND deleted_at IS NULL`, [userId]);
    if (!value) throw new UnauthorizedException('Conta indisponível.');
    return value;
  }
  private async audit(manager: EntityManager, id: string, action: string) {
    await manager.query('INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $1)', [id, action, 'user']);
  }
  async request(userId: string, authVersion: number, email: string | null, password: string, code?: string) {
    const normalized = email?.trim().toLowerCase() ?? null;
    const base = recoveryFrontend(this.config.getOrThrow<string>('FRONTEND_URL'));
    const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const result = await this.db.transaction(async manager => {
      const user = await lockRecoveryUser(manager, userId);
      if (!user || user.auth_version !== authVersion || (user.login_locked_until && user.login_locked_until.getTime() > Date.now())) return null;
      const failed = async () => {
        await manager.query(`UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
          login_locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE login_locked_until END WHERE id = $1`, [user.id]);
        return null;
      };
      if (Buffer.byteLength(password, 'utf8') > 72 || !(await bcrypt.compare(password, user.password_hash))) return failed();
      if (!normalized && (!user.recovery_email || !user.recovery_email_verified_at)) throw new ConflictException('Não há e-mail de recuperação confirmado para remover.');
      if (normalized && (normalized === user.email.toLowerCase() || normalized === user.recovery_email?.toLowerCase())) throw new BadRequestException('Use outro endereço, diferente do principal e do e-mail de recuperação atual.');
      if (user.totp_enabled && !(await this.totp.verifyLogin(userId, code, manager))) return failed();
      const token = randomBytes(32).toString('base64url'), cancel = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      await manager.query(`UPDATE users SET pending_recovery_email = $1, recovery_email_token_hash = $2, recovery_email_cancel_hash = $3,
        recovery_email_expires_at = $4, recovery_email_auth_version = auth_version WHERE id = $5`, [normalized, recoveryHash(token), recoveryHash(cancel), expiresAt, userId]);
      if (normalized) {
        await transactionalMail(manager, jwtSecret, { to: normalized, subject: 'Confirme seu e-mail de recuperação — Grifório',
          text: `Confirme este endereço como e-mail de recuperação em até 30 minutos: ${base}/confirmar-email-recuperacao#token=${token}\nSe não solicitou, ignore. Este link não permite entrar na conta.`, expiresAt: expiresAt.getTime() });
      } else {
        await transactionalMail(manager, jwtSecret, { to: user.recovery_email!, subject: 'Confirme a remoção do e-mail de recuperação — Grifório',
          text: `Para remover este e-mail de recuperação, confirme em até 30 minutos: ${base}/confirmar-email-recuperacao#remove=${token}\nSe não solicitou, ignore. Seu autenticador permanecerá ativo.`, expiresAt: expiresAt.getTime() });
      }
      for (const to of new Set([user.email, ...(normalized ? [user.recovery_email] : [])].filter((value): value is string => !!value))) {
        await transactionalMail(manager, jwtSecret, { to, subject: 'Alteração de e-mail de recuperação solicitada — Grifório', text: `Foi solicitada uma alteração do e-mail de recuperação. Se não reconhece a operação, cancele antes da confirmação: ${base}/confirmar-email-recuperacao#cancel=${cancel}\nO endereço atual continua válido até a confirmação.`, expiresAt: expiresAt.getTime() });
      }
      await this.audit(manager, userId, 'auth.recovery_email_requested');
      await manager.query('UPDATE users SET failed_login_attempts = 0, login_locked_until = NULL WHERE id = $1', [user.id]);
      return { sent: true };
    });
    if (!result) throw new UnauthorizedException('Senha, sessão ou código atual do autenticador inválido, ou conta temporariamente bloqueada.');
    return result;
  }
  async confirm(token: string, cancel = false, remove = false) {
    return this.db.transaction(async manager => {
      // No token values in SQL strings, audit payloads or logs.
      const column = cancel ? 'recovery_email_cancel_hash' : 'recovery_email_token_hash';
      const found: { id: string }[] = await manager.query(`SELECT id FROM users WHERE ${column} = $1`, [recoveryHash(token)]);
      if (!found[0]) throw new UnauthorizedException('Confirmação inválida ou expirada.');
      const user = await lockRecoveryUser(manager, found[0].id);
      if (!user) throw new UnauthorizedException('Confirmação inválida ou expirada.');
      const [pending]: { pending_recovery_email: string | null; recovery_email_expires_at: Date; recovery_email_auth_version: number; recovery_email_token_hash: string | null; recovery_email_cancel_hash: string | null }[] = await manager.query('SELECT pending_recovery_email, recovery_email_expires_at, recovery_email_auth_version, recovery_email_token_hash, recovery_email_cancel_hash FROM users WHERE id = $1', [user.id]);
      if (!pending || pending[column] !== recoveryHash(token) || !pending.recovery_email_expires_at || pending.recovery_email_expires_at.getTime() <= Date.now() || pending.recovery_email_auth_version !== user.auth_version) throw new UnauthorizedException('Confirmação inválida ou expirada.');
      if (!cancel && remove) {
        if (pending.pending_recovery_email !== null || !user.recovery_email || !user.recovery_email_verified_at) throw new ConflictException('Solicitação de remoção inválida.');
        await manager.query(`UPDATE users SET recovery_email = NULL, recovery_email_verified_at = NULL, recovery_email_available_at = NULL,
          totp_pending_secret = NULL, totp_pending_expires_at = NULL WHERE id = $1`, [user.id]);
        await manager.query('UPDATE totp_recovery_grants SET consumed_at = now(), pending_secret = NULL WHERE user_id = $1 AND consumed_at IS NULL', [user.id]);
        const secret = this.config.getOrThrow<string>('JWT_SECRET');
        for (const to of new Set([user.email, user.recovery_email])) {
          await transactionalMail(manager, secret, { to, subject: 'E-mail de recuperação removido — Grifório', text: 'O e-mail de recuperação foi removido. O autenticador continua ativo, mas a recuperação pelo e-mail não está disponível. Se não reconhece esta operação, contate o responsável pela plataforma.', expiresAt: Date.now() + 24 * 60 * 60_000 });
        }
      } else if (!cancel) {
        if (!pending.pending_recovery_email || pending.pending_recovery_email.toLowerCase() === user.email.toLowerCase()) throw new ConflictException('O e-mail de recuperação deve ser diferente do principal.');
        await manager.query(`UPDATE users SET recovery_email = pending_recovery_email, recovery_email_verified_at = now(), recovery_email_available_at = now(),
          totp_pending_secret = NULL, totp_pending_expires_at = NULL WHERE id = $1`, [user.id]);
        await manager.query('UPDATE totp_recovery_grants SET consumed_at = now(), pending_secret = NULL WHERE user_id = $1 AND consumed_at IS NULL', [user.id]);
        const secret = this.config.getOrThrow<string>('JWT_SECRET');
        for (const to of new Set([user.email, user.recovery_email, pending.pending_recovery_email].filter((value): value is string => !!value))) {
          await transactionalMail(manager, secret, { to, subject: 'E-mail de recuperação confirmado — Grifório', text: 'O e-mail de recuperação foi cadastrado ou alterado e já pode ser usado. Se não reconhece esta operação, contate o responsável pela plataforma. O autenticador atual continua ativo.', expiresAt: Date.now() + 24 * 60 * 60_000 });
        }
      }
      await manager.query(`UPDATE users SET pending_recovery_email = NULL, recovery_email_token_hash = NULL, recovery_email_cancel_hash = NULL,
        recovery_email_expires_at = NULL, recovery_email_auth_version = NULL WHERE id = $1`, [user.id]);
      await this.audit(manager, user.id, cancel ? 'auth.recovery_email_cancelled' : remove ? 'auth.recovery_email_removed' : 'auth.recovery_email_verified');
      return cancel ? { cancelled: true } : remove ? { removed: true } : { verified: true };
    });
  }
}
