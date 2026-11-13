import { HttpException, HttpStatus, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import { Redis } from 'ioredis';

@Injectable()
export class VerificationCodeService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly secret: string;
  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
    this.redis = new Redis(config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'), { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1000 });
    this.redis.on('error', () => undefined);
  }
  generate(): string { return randomInt(0, 1000000).toString().padStart(6, '0'); }
  hash(email: string, code: string): string {
    return createHmac('sha256', this.secret).update('email-verification-code-v1\0').update(email.trim().toLowerCase()).update('\0').update(code).digest('hex');
  }
  async checkAttempt(email: string): Promise<void> {
    const key = `email-verification-attempts:${createHmac('sha256', this.secret).update('email-verification-attempts-v1\0').update(email.trim().toLowerCase()).digest('hex')}`;
    let count: number;
    try {
      count = Number(await this.redis.eval("local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 86400) end; return n", 1, key));
    } catch { throw new ServiceUnavailableException('Verifica\u00e7\u00e3o temporariamente indispon\u00edvel.'); }
    if (count > 5) throw new HttpException('Muitas tentativas. Aguarde 24 horas antes de tentar novamente.', HttpStatus.TOO_MANY_REQUESTS);
  }
  onModuleDestroy(): void { this.redis.disconnect(); }
}
