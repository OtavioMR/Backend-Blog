import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import bcrypt from 'bcrypt';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { User } from '../users/entities/user.entity.js';
import { UserRecoveryCode } from './entities/recovery-code.entity.js';
import { isAdministrator } from '../users/enums/user.enum.js';
import { AuditService } from '../audit/audit.service.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString('hex').toLowerCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

@Injectable()
export class TotpService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private key(): Buffer {
    const key = this.config.get<string>('TOTP_ENCRYPTION_KEY');
    if (!key || !/^[a-f0-9]{64}$/i.test(key)) {
      throw new ServiceUnavailableException('TOTP não está configurado.');
    }
    return Buffer.from(key, 'hex');
  }

  private encrypt(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }

  private decrypt(value: string): string {
    const input = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key(), input.subarray(0, 12));
    cipher.setAuthTag(input.subarray(12, 28));
    const plaintext = Buffer.concat([cipher.update(input.subarray(28)), cipher.final()]);
    if (plaintext.length === 20) {
      return base32(plaintext);
    }
    return plaintext.toString('utf8');
  }

  private match(secret: string, code: string | undefined, lastCounter: string | null): number | null {
    if (!code || !/^\d{6}$/.test(code)) return null;
    try {
      const check = verifySync({
        token: code,
        secret,
        epochTolerance: 30, // Tolerância de 1 passo de 30 segundos
      }) as { valid: boolean; timeStep?: number; epoch?: number };
      if (!check || !check.valid || check.timeStep === undefined) return null;
      if (lastCounter !== null && check.timeStep <= Number(lastCounter)) {
        return null; // Replay prevention
      }
      return check.timeStep;
    } catch {
      return null;
    }
  }

  // Recovery grants keep provisioning separate from the still-active authenticator.
  async prepareRecovery(email: string) {
    const secret = generateSecret();
    const otpauthUri = generateURI({ issuer: 'Grifório', label: email, secret });
    const qrCode = await QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: 'M', margin: 2, width: 280 });
    return { secret, otpauthUri, qrCode, encryptedSecret: this.encrypt(secret), expiresIn: 600 };
  }

  async replaceRecoveredFactor(manager: EntityManager, userId: string, encryptedSecret: string, code: string): Promise<string[] | null> {
    const timeStep = this.match(this.decrypt(encryptedSecret), code, null);
    if (timeStep === null) return null;
    const codes = generateRecoveryCodes(8);
    const repo = manager.getRepository(UserRecoveryCode);
    await repo.delete({ userId });
    await repo.save(codes.map(plain => repo.create({ userId, codeHash: hashRecoveryCode(plain), usedAt: null })));
    await manager.getRepository(User).update(userId, {
      totpEnabled: true, totpSecret: encryptedSecret, totpPendingSecret: null, totpPendingExpiresAt: null,
      totpLastCounter: String(timeStep), authVersion: () => 'auth_version + 1', refreshTokenHash: null,
      resetPasswordTokenHash: null, resetPasswordExpiresAt: null,
      pendingEmail: null, emailChangeTokenHash: null, emailChangeExpiresAt: null,
    });
    await manager.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
    return codes;
  }

  private async lockedUser(manager: EntityManager, id: string): Promise<User> {
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect([
        'u.passwordHash',
        'u.totpSecret',
        'u.totpPendingSecret',
        'u.totpPendingExpiresAt',
        'u.totpLastCounter',
        'u.recoveryEmail',
        'u.recoveryEmailVerifiedAt',
      ])
      .where('u.id = :id AND u.is_active = true AND u.deleted_at IS NULL', { id })
      .setLock('pessimistic_write')
      .getOne();
    if (!user) throw new UnauthorizedException('Conta indisponível.');
    return user;
  }

  async setup(userId: string, password: string) {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockedUser(manager, userId);
      if (!(await bcrypt.compare(password, user.passwordHash))) {
        throw new UnauthorizedException('Credenciais inválidas.');
      }
      if (user.totpEnabled) {
        throw new ConflictException('A autenticação em dois fatores já está ativada.');
      }
      if (isAdministrator(user.role) && (!user.recoveryEmail || !user.recoveryEmailVerifiedAt)) throw new ConflictException('Contas administrativas precisam de e-mail de recuperação confirmado antes de ativar o 2FA.');
      const secret = generateSecret();
      const otpauthUri = generateURI({
        issuer: 'Grifório',
        label: user.email,
        secret,
      });
      const qrCode = await QRCode.toDataURL(otpauthUri, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280,
        color: { dark: '#000000', light: '#ffffff' },
      });
      await manager.getRepository(User).update(userId, {
        totpPendingSecret: this.encrypt(secret),
        totpPendingExpiresAt: new Date(Date.now() + 10 * 60_000),
      });
      return { secret, otpauthUri, qrCode, expiresIn: 600 };
    });
  }

  async enable(userId: string, code: string) {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockedUser(manager, userId);
      if (user.totpEnabled) {
        throw new ConflictException('A autenticação em dois fatores já está ativada.');
      }
      if (isAdministrator(user.role) && (!user.recoveryEmail || !user.recoveryEmailVerifiedAt)) throw new ConflictException('Contas administrativas precisam de e-mail de recuperação confirmado antes de ativar o 2FA.');
      if (
        !user.totpPendingSecret ||
        !user.totpPendingExpiresAt ||
        user.totpPendingExpiresAt.getTime() <= Date.now()
      ) {
        throw new BadRequestException('A configuração do autenticador expirou. Inicie o cadastro novamente.');
      }
      const secret = this.decrypt(user.totpPendingSecret);
      const timeStep = this.match(secret, code, null);
      if (timeStep === null) {
        throw new UnauthorizedException('Código de autenticação inválido.');
      }

      const recoveryCodes = generateRecoveryCodes(8);
      const recoveryEntities = recoveryCodes.map((plain) => {
        return manager.getRepository(UserRecoveryCode).create({
          userId,
          codeHash: hashRecoveryCode(plain),
          usedAt: null,
        });
      });
      await manager.getRepository(UserRecoveryCode).delete({ userId });
      await manager.getRepository(UserRecoveryCode).save(recoveryEntities);

      await manager.getRepository(User).update(userId, {
        totpEnabled: true,
        totpSecret: user.totpPendingSecret,
        totpPendingSecret: null,
        totpPendingExpiresAt: null,
        totpLastCounter: String(timeStep),
        authVersion: () => 'auth_version + 1',
      });
      await this.audit.record(manager, userId, 'auth.totp_enabled', 'user', userId);
      return { enabled: true, recoveryCodes };
    });
  }

  private async verifyLoginWithManager(manager: EntityManager, user: User, code?: string): Promise<boolean> {
    if (!code) return false;
    if (!user.totpEnabled || !user.totpSecret) return false;
    const secret = this.decrypt(user.totpSecret);
    const timeStep = this.match(secret, code, user.totpLastCounter);
    if (timeStep === null) return false;
    await manager.getRepository(User).update(user.id, { totpLastCounter: String(timeStep) });
    return true;
  }

  private async verifyRecoveryCodeWithManager(manager: EntityManager, userId: string, code: string): Promise<boolean> {
    if (!code) return false;
    const normalized = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.length < 8) return false;
    const codeHash = hashRecoveryCode(code);
    const recoveryRepo = manager.getRepository(UserRecoveryCode);
    const recovery = await recoveryRepo.findOne({
      where: { userId, codeHash, usedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!recovery) return false;
    recovery.usedAt = new Date();
    await recoveryRepo.save(recovery);
    await this.audit.record(manager, userId, 'auth.recovery_code_used', 'user', userId);
    return true;
  }

  private async verify2faOrRecoveryWithManager(manager: EntityManager, user: User, code: string): Promise<boolean> {
    if (!code) return false;
    const clean = code.trim();
    if (/^\d{6}$/.test(clean)) {
      return this.verifyLoginWithManager(manager, user, clean);
    }
    return this.verifyRecoveryCodeWithManager(manager, user.id, clean);
  }

  async verifyLogin(userId: string, code?: string, existingManager?: EntityManager, existingUser?: User): Promise<boolean> {
    if (!code) return false;
    if (existingManager) {
      return this.verifyLoginWithManager(existingManager, existingUser ?? await this.lockedUser(existingManager, userId), code);
    }
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockedUser(manager, userId);
      return this.verifyLoginWithManager(manager, user, code);
    });
  }

  async verifyRecoveryCode(userId: string, code: string, existingManager?: EntityManager): Promise<boolean> {
    if (existingManager) {
      return this.verifyRecoveryCodeWithManager(existingManager, userId, code);
    }
    return this.dataSource.transaction(async (manager) => {
      return this.verifyRecoveryCodeWithManager(manager, userId, code);
    });
  }

  async verify2faOrRecovery(userId: string, code: string, existingManager?: EntityManager, existingUser?: User): Promise<boolean> {
    if (existingManager && existingUser) {
      return this.verify2faOrRecoveryWithManager(existingManager, existingUser, code);
    }
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockedUser(manager, userId);
      return this.verify2faOrRecoveryWithManager(manager, user, code);
    });
  }

  async disable(userId: string, password: string, code: string) {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockedUser(manager, userId);
      if (
        !user.totpEnabled ||
        !user.totpSecret ||
        !(await bcrypt.compare(password, user.passwordHash))
      ) {
        throw new UnauthorizedException('Credenciais inválidas.');
      }
      if (isAdministrator(user.role)) {
        throw new ForbiddenException(
          'Contas com privilégios administrativos são obrigadas a manter a autenticação de dois fatores ativa. Para desativar, solicite a revogação do acesso administrativo.',
        );
      }
      const valid = await this.verify2faOrRecoveryWithManager(manager, user, code);
      if (!valid) {
        throw new UnauthorizedException('Código de autenticação ou de recuperação inválido.');
      }
      await manager.getRepository(UserRecoveryCode).delete({ userId });
      await manager.getRepository(User).update(userId, {
        totpEnabled: false,
        totpSecret: null,
        totpPendingSecret: null,
        totpPendingExpiresAt: null,
        totpLastCounter: null,
        authVersion: () => 'auth_version + 1',
      });
      await this.audit.record(manager, userId, 'auth.totp_disabled', 'user', userId);
      return { enabled: false };
    });
  }

  async regenerateRecoveryCodes(userId: string, password: string, code: string) {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockedUser(manager, userId);
      if (
        !user.totpEnabled ||
        !user.totpSecret ||
        !(await bcrypt.compare(password, user.passwordHash))
      ) {
        throw new UnauthorizedException('Credenciais inválidas.');
      }
      const valid = await this.verifyLoginWithManager(manager, user, code);
      if (!valid) {
        throw new UnauthorizedException('Código de autenticação inválido.');
      }
      const recoveryCodes = generateRecoveryCodes(8);
      await manager.getRepository(UserRecoveryCode).delete({ userId });
      const recoveryEntities = recoveryCodes.map((plain) => {
        return manager.getRepository(UserRecoveryCode).create({
          userId,
          codeHash: hashRecoveryCode(plain),
          usedAt: null,
        });
      });
      await manager.getRepository(UserRecoveryCode).save(recoveryEntities);
      await this.audit.record(manager, userId, 'auth.recovery_codes_regenerated', 'user', userId);
      return { recoveryCodes };
    });
  }
}
