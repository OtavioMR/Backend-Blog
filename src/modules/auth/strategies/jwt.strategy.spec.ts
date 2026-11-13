import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';
import { UserRole } from '../../users/enums/user.enum.js';

describe('JwtStrategy', () => {
  it('rejeita sessões anteriores após alteração de permissões e consulta a role atual', async () => {
    const users = { findById: vi.fn().mockResolvedValue({ id: 'user', email: 'test@example.com', isActive: true, authVersion: 2, role: UserRole.READER }) };
    const sessions = { exists: vi.fn().mockResolvedValue(true) };
    const strategy = new JwtStrategy({ getOrThrow: () => 'test-secret' } as any, users as any, sessions as any);
    const payload = { sub: 'user', email: 'test@example.com', role: UserRole.ADMIN, authVersion: 1, sid: 'session' };
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate({ ...payload, authVersion: 2 })).resolves.toMatchObject({ role: UserRole.READER });
    sessions.exists.mockResolvedValue(false);
    await expect(strategy.validate({ ...payload, authVersion: 2 })).rejects.toThrow(UnauthorizedException);
  });
  it('uses current verified email state without exposing the secondary address in the request identity', async () => {
    const user = { id: 'user', email: 'primary@example.invalid', isActive: true, authVersion: 0, role: UserRole.ADMIN, totpEnabled: true, emailVerified: true, recoveryEmail: 'secondary@example.invalid', recoveryEmailVerifiedAt: new Date() };
    const strategy = new JwtStrategy({ getOrThrow: () => 'synthetic-secret' } as any, { findById: async () => user } as any, { exists: async () => true } as any);
    const payload = { sub: 'user', email: user.email, role: UserRole.ADMIN, authVersion: 0, sid: 'session' };
    const identity = await strategy.validate(payload);
    expect(identity).toMatchObject({ emailVerified: true, recoveryEmailVerified: true });
    expect(identity).not.toHaveProperty('recoveryEmail');
    Object.assign(user, { recoveryEmailVerifiedAt: null });
    expect(await strategy.validate(payload)).toMatchObject({ role: UserRole.READER, recoveryEmailVerified: false });
    expect(user.role).toBe(UserRole.ADMIN);
    Object.assign(user, { recoveryEmailVerifiedAt: new Date(), totpEnabled: false });
    expect((await strategy.validate(payload)).role).toBe(UserRole.READER);
    Object.assign(user, { totpEnabled: true, emailVerified: false });
    expect((await strategy.validate(payload)).role).toBe(UserRole.READER);
    Object.assign(user, { emailVerified: true });
    expect((await strategy.validate(payload)).role).toBe(UserRole.ADMIN);
  });
});
