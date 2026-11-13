import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ModerationController } from './moderation.controller.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('alteração de privilégios com TOTP', () => {
  it('não altera a função com código inválido e usa código válido uma única vez', async () => {
    const service = { changeRole: vi.fn().mockResolvedValue({ id: 'target', role: UserRole.ADMIN }) };
    const totp = { verifyLogin: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(false) };
    const controller = new ModerationController(service as any, totp as any);
    const request = { user: { userId: 'actor', role: UserRole.SUPER_ADMIN } } as any;
    const dto = { role: UserRole.ADMIN, reason: 'Promoção aprovada' };
    await expect(controller.changeRole('target', request, dto, '123456')).rejects.toThrow(UnauthorizedException);
    expect(service.changeRole).not.toHaveBeenCalled();
    await expect(controller.changeRole('target', request, dto, '123456')).resolves.toMatchObject({ role: UserRole.ADMIN });
    await expect(controller.changeRole('target', request, dto, '123456')).rejects.toThrow(UnauthorizedException);
    expect(service.changeRole).toHaveBeenCalledOnce();
  });
});

describe('restauração de usuário com TOTP', () => {
  it('rejeita restauração quando código TOTP é ausente ou inválido', async () => {
    const service = { restore: vi.fn().mockResolvedValue({ suspended: false }) };
    const totp = { verifyLogin: vi.fn().mockResolvedValue(false) };
    const controller = new ModerationController(service as any, totp as any);
    const request = { user: { userId: 'actor', role: UserRole.ADMIN, authVersion: 1 } } as any;

    await expect(controller.restore('target-id', request, undefined)).rejects.toThrow(UnauthorizedException);
    expect(totp.verifyLogin).toHaveBeenCalledWith('actor', undefined);
    expect(service.restore).not.toHaveBeenCalled();

    await expect(controller.restore('target-id', request, '000000')).rejects.toThrow(UnauthorizedException);
    expect(totp.verifyLogin).toHaveBeenCalledWith('actor', '000000');
    expect(service.restore).not.toHaveBeenCalled();
  });

  it('restaura usuário com sucesso quando código TOTP é válido', async () => {
    const service = { restore: vi.fn().mockResolvedValue({ suspended: false }) };
    const totp = { verifyLogin: vi.fn().mockResolvedValue(true) };
    const controller = new ModerationController(service as any, totp as any);
    const request = { user: { userId: 'actor', role: UserRole.ADMIN, authVersion: 2 } } as any;

    const result = await controller.restore('target-id', request, '123456');

    expect(totp.verifyLogin).toHaveBeenCalledWith('actor', '123456');
    expect(service.restore).toHaveBeenCalledWith('actor', 'target-id', 2);
    expect(result).toEqual({ suspended: false });
  });

  it('não permite restauração após uso único do código TOTP', async () => {
    const service = { restore: vi.fn().mockResolvedValue({ suspended: false }) };
    const totp = { verifyLogin: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) };
    const controller = new ModerationController(service as any, totp as any);
    const request = { user: { userId: 'actor', role: UserRole.ADMIN, authVersion: 1 } } as any;

    await expect(controller.restore('target-id', request, '123456')).resolves.toEqual({ suspended: false });
    await expect(controller.restore('target-id', request, '123456')).rejects.toThrow(UnauthorizedException);
    expect(service.restore).toHaveBeenCalledOnce();
  });
});
