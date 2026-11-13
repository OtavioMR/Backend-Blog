import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { VerificationCodeService } from './verification-code.service.js';

const redis = vi.hoisted(() => ({ eval: vi.fn(), on: vi.fn(), disconnect: vi.fn() }));
vi.mock('ioredis', () => ({ Redis: vi.fn(function () { return redis; }) }));
describe('VerificationCodeService', () => {
  it('gera seis d\u00edgitos e vincula o hash ao e-mail', () => {
    const service = new VerificationCodeService({ get: () => 'redis://localhost', getOrThrow: () => 'test-secret' } as unknown as ConfigService);
    expect(service.generate()).toMatch(/^\d{6}$/);
    expect(service.hash('TEST@example.com', '012345')).toBe(service.hash('test@example.com', '012345'));
    expect(service.hash('test@example.com', '012345')).not.toBe(service.hash('other@example.com', '012345'));
  });
  it('bloqueia ap\u00f3s cinco tentativas e falha de modo seguro sem Redis', async () => {
    const service = new VerificationCodeService({ get: () => 'redis://localhost', getOrThrow: () => 'test-secret' } as unknown as ConfigService);
    redis.eval.mockResolvedValueOnce(5).mockResolvedValueOnce(6).mockRejectedValueOnce(new Error('offline'));
    await expect(service.checkAttempt('test@example.com')).resolves.toBeUndefined();
    await expect(service.checkAttempt('test@example.com')).rejects.toThrow('Muitas tentativas');
    await expect(service.checkAttempt('test@example.com')).rejects.toThrow('temporariamente');
  });
});
