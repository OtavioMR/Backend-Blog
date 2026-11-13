import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from '../../users/enums/user.enum.js';

describe('RolesGuard', () => {
  const context = (role: UserRole, totpEnabled = true, emailVerified = true, recoveryEmailVerified = true) => ({ getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => ({ user: { role, totpEnabled, emailVerified, recoveryEmailVerified } }) }) }) as any;
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
  it('bloqueia operações administrativas sem segundo fator ativo', () => {
    const guard = new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue([UserRole.ADMIN]) } as any);
    expect(() => guard.canActivate(context(UserRole.ADMIN, false))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context(UserRole.SUPER_ADMIN, false))).toThrow(ForbiddenException);
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
  it.each([UserRole.ADMIN, UserRole.SUPER_ADMIN])('bloqueia %s sem ambos os e-mails verificados', role => {
    const guard = new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue([UserRole.ADMIN]) } as any);
    expect(() => guard.canActivate(context(role, true, false, true))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context(role, true, true, false))).toThrow(ForbiddenException);
    expect(guard.canActivate(context(role, true, true, true))).toBe(true);
  });
});
