import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from '../../users/enums/user.enum.js';

describe('RolesGuard', () => {
  const context = (role: UserRole) => ({ getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) }) as any;
  it('admite ADMIN e SUPER_ADMIN em operações administrativas e rejeita leitores e autores', () => {
    const guard = new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue([UserRole.ADMIN]) } as any);
    expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
    expect(guard.canActivate(context(UserRole.SUPER_ADMIN))).toBe(true);
    expect(() => guard.canActivate(context(UserRole.READER))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context(UserRole.AUTHOR))).toThrow(ForbiddenException);
  });
  it('não permite ADMIN em operações exclusivas de SUPER_ADMIN', () => {
    const guard = new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue([UserRole.SUPER_ADMIN]) } as any);
    expect(() => guard.canActivate(context(UserRole.ADMIN))).toThrow(ForbiddenException);
    expect(guard.canActivate(context(UserRole.SUPER_ADMIN))).toBe(true);
  });
});
