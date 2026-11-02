import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity.js';
import { AuditService } from '../audit/audit.service.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buffer: Buffer): string {
  let bits = 0, value = 0, result = '';
  for (const byte of buffer) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function counterCode(secret: Buffer, counter: number): string {
  const data = Buffer.alloc(8); data.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', secret).update(data).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
@Injectable()
export class TotpService {
  constructor(private readonly dataSource: DataSource, private readonly config: ConfigService, private readonly audit: AuditService) {}
  private key(): Buffer {
    const key = this.config.get<string>('TOTP_ENCRYPTION_KEY');
    if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new ServiceUnavailableException('TOTP não está configurado.');
    return Buffer.from(key, 'hex');
  }
  private encrypt(secret: Buffer): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }
  private decrypt(value: string): Buffer {
    const input = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key(), input.subarray(0, 12));
    cipher.setAuthTag(input.subarray(12, 28));
    return Buffer.concat([cipher.update(input.subarray(28)), cipher.final()]);
  }
  private match(secret: Buffer, code: string | undefined, last: string | null): number | null {
    if (!code || !/^\d{6}$/.test(code)) return null;
    const current = Math.floor(Date.now() / 30000);
    for (const counter of [current - 1, current, current + 1]) {
      if (last !== null && counter <= Number(last)) continue;
      if (timingSafeEqual(Buffer.from(counterCode(secret, counter)), Buffer.from(code))) return counter;
    }
    return null;
  }
  private async lockedUser(manager: EntityManager, id: string): Promise<User> {
    const user = await manager.getRepository(User).createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.totpSecret', 'u.totpPendingSecret', 'u.totpPendingExpiresAt', 'u.totpLastCounter'])
      .where('u.id = :id AND u.is_active = true AND u.deleted_at IS NULL', { id }).setLock('pessimistic_write').getOne();
    if (!user) throw new UnauthorizedException('Conta indisponível.');
    return user;
  }
  async setup(userId: string, password: string) {
    if (Buffer.byteLength(password, 'utf8') > 72) throw new UnauthorizedException('Credenciais inválidas.');
    return this.dataSource.transaction(async manager => {
      const user = await this.lockedUser(manager, userId);
      if (!(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Credenciais inválidas.');
      if (user.totpEnabled) throw new ConflictException('TOTP já está ativado.');
      const secret = randomBytes(20), encoded = base32(secret);
      await manager.getRepository(User).update(userId, { totpPendingSecret: this.encrypt(secret), totpPendingExpiresAt: new Date(Date.now() + 10 * 60_000) });
      return { secret: encoded, otpauthUri: `otpauth://totp/${encodeURIComponent(`Backend Blog:${user.email}`)}?secret=${encoded}&issuer=Backend%20Blog&algorithm=SHA1&digits=6&period=30`, expiresIn: 600 };
    });
  }
  async enable(userId: string, code: string) {
    return this.dataSource.transaction(async manager => {
      const user = await this.lockedUser(manager, userId);
      if (user.totpEnabled) throw new ConflictException('TOTP já está ativado.');
      if (!user.totpPendingSecret || !user.totpPendingExpiresAt || user.totpPendingExpiresAt.getTime() <= Date.now()) throw new BadRequestException('Configuração TOTP expirada.');
      const counter = this.match(this.decrypt(user.totpPendingSecret), code, null);
      if (counter === null) throw new UnauthorizedException('Código inválido.');
      await manager.getRepository(User).update(userId, { totpEnabled: true, totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpPendingExpiresAt: null, totpLastCounter: String(counter), authVersion: () => 'auth_version + 1' });
      await this.audit.record(manager, userId, 'auth.totp_enabled', 'user', userId);
      return { enabled: true };
    });
  }
  async verifyLogin(userId: string, code?: string): Promise<boolean> {
    return this.dataSource.transaction(async manager => {
      const user = await this.lockedUser(manager, userId);
      if (!user.totpEnabled || !user.totpSecret) return false;
      const counter = this.match(this.decrypt(user.totpSecret), code, user.totpLastCounter);
      if (counter === null) return false;
      await manager.getRepository(User).update(userId, { totpLastCounter: String(counter) });
      return true;
    });
  }
  async disable(userId: string, password: string, code: string) {
    if (Buffer.byteLength(password, 'utf8') > 72) throw new UnauthorizedException('Credenciais inválidas.');
    return this.dataSource.transaction(async manager => {
      const user = await this.lockedUser(manager, userId);
      if (!user.totpEnabled || !user.totpSecret || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Credenciais inválidas.');
      const counter = this.match(this.decrypt(user.totpSecret), code, user.totpLastCounter);
      if (counter === null) throw new UnauthorizedException('Credenciais inválidas.');
      await manager.getRepository(User).update(userId, { totpEnabled: false, totpSecret: null, totpPendingSecret: null, totpPendingExpiresAt: null, totpLastCounter: null, authVersion: () => 'auth_version + 1' });
      await this.audit.record(manager, userId, 'auth.totp_disabled', 'user', userId);
      return { enabled: false };
    });
  }
}
