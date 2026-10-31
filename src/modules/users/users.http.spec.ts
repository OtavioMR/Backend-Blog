import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import supertest from 'supertest';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { UserRole } from './enums/user.enum.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { MailService } from '../mail/mail.service.js';

describe('Atualização de credenciais HTTP', () => {
  let app: INestApplication;
  const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const user = { id, email: 'antigo@example.com', isActive: true, role: UserRole.READER };
  const repository: any = { findOne: vi.fn(), save: vi.fn(async (value) => value) };
  const mail = { sendEmailChangeConfirmation: vi.fn() };

  beforeAll(async () => {
    const hash = await bcrypt.hash('senha-atual', 4);
    repository.findOne.mockImplementation(async ({ where }: any) => where.id ? { ...user } : null);
    repository.createQueryBuilder = vi.fn(() => ({
      addSelect() { return this; }, where() { return this; }, andWhere() { return this; },
      getOne: async () => ({ ...user, passwordHash: hash }),
    }));
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: repository },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { getOrThrow: () => 'https://example.com' } }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = { userId: id, role: UserRole.READER };
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('exige senha atual e rejeita senha incorreta', async () => {
    await supertest(app.getHttpServer()).patch(`/users/${id}`).send({ password: 'nova-senha' }).expect(400);
    await supertest(app.getHttpServer()).patch(`/users/${id}`).send({ email: 'novo@example.com', currentPassword: 'errada' }).expect(401);
  });

  it('solicita confirmação sem mudar o endereço existente', async () => {
    const response = await supertest(app.getHttpServer()).patch(`/users/${id}`)
      .send({ email: 'novo@example.com', currentPassword: 'senha-atual' }).expect(200);
    expect(response.body.email).toBe('antigo@example.com');
    expect(mail.sendEmailChangeConfirmation).toHaveBeenCalledWith('novo@example.com', expect.stringContaining('/confirm-email-change?token='));
  });

  it('recusa formato inválido de token', async () => {
    await supertest(app.getHttpServer()).post('/users/confirm-email-change').send({ token: 'invalid' }).expect(400);
  });
});
