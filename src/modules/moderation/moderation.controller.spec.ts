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
