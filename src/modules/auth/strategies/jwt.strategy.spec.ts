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
});
