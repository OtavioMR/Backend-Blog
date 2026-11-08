import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from '../../users/enums/user.enum.js';

describe('RolesGuard', () => {
  const context = (role: UserRole, totpEnabled = true) => ({ getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => ({ user: { role, totpEnabled } }) }) }) as any;
  it('admite ADMIN e SUPER_ADMIN em operações administrativas e rejeita leitores e autores', () => {
    const guard = new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue([UserRole.ADMIN]) } as any);
    expect(guard.canActivate(context(UserRole.ADMIN, true))).toBe(true);
    expect(guard.canActivate(context(UserRole.SUPER_ADMIN, true))).toBe(true);
    expect(() => guard.canActivate(context(UserRole.READER))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context(UserRole.AUTHOR))).toThrow(ForbiddenException);
  });
  it('não permite ADMIN em operações exclusivas de SUPER_ADMIN', () => {
    const guard = new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue([UserRole.SUPER_ADMIN]) } as any);
    expect(() => guard.canActivate(context(UserRole.ADMIN, true))).toThrow(ForbiddenException);
    expect(guard.canActivate(context(UserRole.SUPER_ADMIN, true))).toBe(true);
  });
  it('permite ADMIN e SUPER_ADMIN em rotas destinadas a AUTHOR', () => {
    const guard = new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue([UserRole.AUTHOR]) } as any);
    expect(guard.canActivate(context(UserRole.SUPER_ADMIN, true))).toBe(true);
    expect(guard.canActivate(context(UserRole.ADMIN, true))).toBe(true);
    expect(guard.canActivate(context(UserRole.AUTHOR, true))).toBe(true);
    expect(() => guard.canActivate(context(UserRole.READER))).toThrow(ForbiddenException);
  });
  it('permite todas as funções em rotas destinadas a READER', () => {
    const guard = new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue([UserRole.READER]) } as any);
    expect(guard.canActivate(context(UserRole.SUPER_ADMIN, true))).toBe(true);
    expect(guard.canActivate(context(UserRole.ADMIN, true))).toBe(true);
    expect(guard.canActivate(context(UserRole.AUTHOR, true))).toBe(true);
    expect(guard.canActivate(context(UserRole.READER, true))).toBe(true);
  });
});
