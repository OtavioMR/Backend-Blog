import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { TotpService, generateRecoveryCodes, hashRecoveryCode } from './totp.service.js';
import { UserRole } from '../users/enums/user.enum.js';
import bcrypt from 'bcrypt';
import { generateSync } from 'otplib';

describe('TotpService', () => {
  let service: TotpService;
  let mockUsers: Map<string, any>;
  let mockRecoveryCodes: any[];
  let mockAudit: any;
  let mockConfig: any;
  let mockDataSource: any;

  const validEncryptionKey = 'ac11ef7cb2b1340920e937ec56d4782f8ed9e13becba2ddfac79a958b90b2180';

  beforeEach(async () => {
    mockUsers = new Map();
    mockRecoveryCodes = [];
    mockAudit = { record: vi.fn() };
    mockConfig = {
      get: vi.fn((key: string) => {
        if (key === 'TOTP_ENCRYPTION_KEY') return validEncryptionKey;
        return null;
      }),
    };

    const passwordHash = await bcrypt.hash('Password123!', 10);
    mockUsers.set('user-1', {
      id: 'user-1',
      email: 'user1@example.com',
      passwordHash,
      isActive: true,
      role: UserRole.READER,
      totpEnabled: false,
      recoveryEmail: 'recovery@example.invalid',
      recoveryEmailVerifiedAt: new Date(),
      totpSecret: null,
      totpPendingSecret: null,
      totpPendingExpiresAt: null,
      totpLastCounter: null,
      authVersion: 1,
    });

    const userRepo = {
      createQueryBuilder: () => ({
        addSelect: () => ({
          where: () => ({
            setLock: () => ({
              getOne: async () => mockUsers.get('user-1'),
            }),
          }),
        }),
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const u = mockUsers.get(id);
        if (u) {
          Object.assign(u, updates);
        }
      }),
    };

    const recoveryRepo = {
      create: (dto: any) => ({ ...dto, id: 'rec-' + Math.random() }),
      save: vi.fn(async (entities: any | any[]) => {
        const arr = Array.isArray(entities) ? entities : [entities];
        mockRecoveryCodes.push(...arr);
        return entities;
      }),
      findOne: vi.fn(async ({ where }: any) => {
        return mockRecoveryCodes.find(
          (r) =>
            r.userId === where.userId &&
            r.codeHash === where.codeHash &&
            (where.usedAt === undefined || r.usedAt === null),
        );
      }),
      delete: vi.fn(async ({ userId }: any) => {
        mockRecoveryCodes = mockRecoveryCodes.filter((r) => r.userId !== userId);
      }),
    };

    mockDataSource = {
      transaction: async (cb: any) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity.name === 'User') return userRepo;
            if (entity.name === 'UserRecoveryCode') return recoveryRepo;
            return userRepo;
          },
        };
        return cb(manager);
      },
    };

    service = new TotpService(mockDataSource as any, mockConfig as any, mockAudit as any);
  });

  it('gera configuração inicial com secret base32, URI Grifório e QR Code em DataURL', async () => {
    const res = await service.setup('user-1', 'Password123!');
    expect(res).toHaveProperty('secret');
    expect(res.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(res.otpauthUri).toContain('otpauth://totp/Grif%C3%B3rio:user1%40example.com');
    expect(res.otpauthUri).toContain(`secret=${res.secret}`);
    expect(res.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(res.expiresIn).toBe(600);

    const u = mockUsers.get('user-1');
    expect(u.totpPendingSecret).toBeTruthy();
    expect(u.totpPendingExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejeita setup se a senha estiver incorreta', async () => {
    await expect(service.setup('user-1', 'WrongPassword!')).rejects.toThrow(UnauthorizedException);
  });
  it('exige e-mail de recuperação confirmado no setup e novamente na ativação', async () => {
    const user = mockUsers.get('user-1');
    user.recoveryEmailVerifiedAt = null;
    await expect(service.setup('user-1', 'Password123!')).rejects.toThrow(ConflictException);
    user.recoveryEmailVerifiedAt = new Date();
    const setup = await service.setup('user-1', 'Password123!');
    user.recoveryEmail = null;
    await expect(service.enable('user-1', generateSync({ secret: setup.secret }))).rejects.toThrow(ConflictException);
  });

  it('ativa o TOTP com código de 6 dígitos válido e emite códigos de recuperação', async () => {
    const setupRes = await service.setup('user-1', 'Password123!');
    const validCode = generateSync({ secret: setupRes.secret });

    const enableRes = await service.enable('user-1', validCode);
    expect(enableRes.enabled).toBe(true);
    expect(enableRes.recoveryCodes).toHaveLength(8);
    for (const code of enableRes.recoveryCodes) {
      expect(code).toMatch(/^[a-f0-9]{4}-[a-f0-9]{4}$/);
    }

    const u = mockUsers.get('user-1');
    expect(u.totpEnabled).toBe(true);
    expect(u.totpPendingSecret).toBeNull();
    expect(mockRecoveryCodes).toHaveLength(8);
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'auth.totp_enabled',
      'user',
      'user-1',
    );
  });

  it('rejeita ativação com código de 6 dígitos incorreto', async () => {
    await service.setup('user-1', 'Password123!');
    await expect(service.enable('user-1', '000000')).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita ativação se a configuração pendente expirou', async () => {
    await service.setup('user-1', 'Password123!');
    const u = mockUsers.get('user-1');
    u.totpPendingExpiresAt = new Date(Date.now() - 1000); // Expirado

    await expect(service.enable('user-1', '123456')).rejects.toThrow(BadRequestException);
  });

  it('valida código no login e impede reutilização na mesma janela (anti-replay)', async () => {
    const setupRes = await service.setup('user-1', 'Password123!');
    const code = generateSync({ secret: setupRes.secret });
    await service.enable('user-1', code);

    // Primeiro uso com o mesmo código ou código já aceito deve ser rejeitado por replay
    const reused = await service.verifyLogin('user-1', code);
    expect(reused).toBe(false);
  });

  it('valida código de recuperação de uso único e o invalida após consumo', async () => {
    const setupRes = await service.setup('user-1', 'Password123!');
    const code = generateSync({ secret: setupRes.secret });
    const enableRes = await service.enable('user-1', code);

    const firstRecovery = enableRes.recoveryCodes[0];
    const ok = await service.verifyRecoveryCode('user-1', firstRecovery);
    expect(ok).toBe(true);

    // Segunda tentativa com o mesmo código de recuperação deve falhar (single use)
    const secondTry = await service.verifyRecoveryCode('user-1', firstRecovery);
    expect(secondTry).toBe(false);
  });

  it('impede desativação de 2FA para contas com função administrativa (ADMIN / SUPER_ADMIN)', async () => {
    const setupRes = await service.setup('user-1', 'Password123!');
    const code = generateSync({ secret: setupRes.secret });
    await service.enable('user-1', code);

    // Torna a conta ADMIN
    const u = mockUsers.get('user-1');
    u.role = UserRole.ADMIN;

    await expect(service.disable('user-1', 'Password123!', code)).rejects.toThrow(ForbiddenException);
  });

  it('permite desativação para usuário comum com senha e código válidos', async () => {
    const setupRes = await service.setup('user-1', 'Password123!');
    const code = generateSync({ secret: setupRes.secret });
    const enableRes = await service.enable('user-1', code);

    const recoveryCode = enableRes.recoveryCodes[1];
    const res = await service.disable('user-1', 'Password123!', recoveryCode);
    expect(res.enabled).toBe(false);

    const u = mockUsers.get('user-1');
    expect(u.totpEnabled).toBe(false);
    expect(u.totpSecret).toBeNull();
    expect(mockRecoveryCodes).toHaveLength(0);
  });

  it('regenera códigos de recuperação com senha e código TOTP', async () => {
    const setupRes = await service.setup('user-1', 'Password123!');
    const code = generateSync({ secret: setupRes.secret });
    await service.enable('user-1', code);

    // Gera novo código
    const newCode = generateSync({ secret: setupRes.secret, epoch: Math.floor(Date.now() / 1000) + 30 });
    const regen = await service.regenerateRecoveryCodes('user-1', 'Password123!', newCode);
    expect(regen.recoveryCodes).toHaveLength(8);
  });
});
