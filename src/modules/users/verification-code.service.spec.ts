import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { VerificationCodeService } from './verification-code.service.js';

const db = { query: vi.fn() };
describe('VerificationCodeService', () => {
  it('gera seis d\u00edgitos e vincula o hash ao e-mail', () => {
    const service = new VerificationCodeService({ getOrThrow: () => 'test-secret' } as unknown as ConfigService, db as never);
    expect(service.generate()).toMatch(/^\d{6}$/);
    expect(service.hash('TEST@example.com', '012345')).toBe(service.hash('test@example.com', '012345'));
    expect(service.hash('test@example.com', '012345')).not.toBe(service.hash('other@example.com', '012345'));
  });
  it('bloqueia ap\u00f3s cinco tentativas e falha de modo seguro sem PostgreSQL', async () => {
    const service = new VerificationCodeService({ getOrThrow: () => 'test-secret' } as unknown as ConfigService, db as never);
    db.query.mockResolvedValueOnce([{ attempts: 5 }]).mockResolvedValueOnce([{ attempts: 6 }]).mockRejectedValueOnce(new Error('offline'));
    await expect(service.checkAttempt('test@example.com')).resolves.toBeUndefined();
    await expect(service.checkAttempt('test@example.com')).rejects.toThrow('Muitas tentativas');
    await expect(service.checkAttempt('test@example.com')).rejects.toThrow('temporariamente');
  });
});
