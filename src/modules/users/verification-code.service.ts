import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import { DataSource } from 'typeorm';

@Injectable()
export class VerificationCodeService {
  private readonly secret: string;
  constructor(config: ConfigService, private readonly db: DataSource) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }
  generate(): string { return randomInt(0, 1000000).toString().padStart(6, '0'); }
  hash(email: string, code: string): string {
    return createHmac('sha256', this.secret).update('email-verification-code-v1\0').update(email.trim().toLowerCase()).update('\0').update(code).digest('hex');
  }
  async checkAttempt(email: string): Promise<void> {
    const key = `email-verification-attempts:${createHmac('sha256', this.secret).update('email-verification-attempts-v1\0').update(email.trim().toLowerCase()).digest('hex')}`;
    let count: number;
    try {
      const [row]: { attempts: number }[] = await this.db.query(`INSERT INTO security_attempts(key, attempts, expires_at)
        VALUES($1, 1, clock_timestamp() + interval '24 hours') ON CONFLICT(key) DO UPDATE SET
        attempts = CASE WHEN security_attempts.expires_at <= clock_timestamp() THEN 1 ELSE LEAST(security_attempts.attempts + 1, 6) END,
        expires_at = CASE WHEN security_attempts.expires_at <= clock_timestamp() THEN clock_timestamp() + interval '24 hours' ELSE security_attempts.expires_at END
        RETURNING attempts`, [key]);
      count = row.attempts;
    } catch { throw new ServiceUnavailableException('Verifica\u00e7\u00e3o temporariamente indispon\u00edvel.'); }
    if (count > 5) throw new HttpException('Muitas tentativas. Aguarde 24 horas antes de tentar novamente.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
