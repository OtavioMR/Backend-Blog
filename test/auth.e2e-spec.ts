import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/modules/users/entities/user.entity.js';
import { configureDateSerialization } from '../src/common/utils/date-serializer.js';

// ESM / CJS interop for supertest in NodeNext environment
const request =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

describe('Auth E2E Test Suite (Secure Cookies, Refresh Token Rotation, Logout)', () => {
  let app: INestApplication;
  let usersRepository: Repository<User>;

  const testUser = {
    name: 'E2E Test User',
    email: `e2e_auth_${Date.now()}_${Math.random().toString(36).substring(2, 8)}@example.com`,
    password: 'Password123!',
  };

  let initialAccessToken: string;
  let initialRefreshToken: string;
  let rotatedAccessToken: string;
  let rotatedRefreshToken: string;

  beforeAll(async () => {
    configureDateSerialization();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Production bootstrap parity with src/main.ts
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    usersRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );

    // Register a fresh test user for isolated auth lifecycle verification
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send(testUser);

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body).toHaveProperty('id');
    expect(registerResponse.body.email).toBe(testUser.email.toLowerCase());
  });

  afterAll(async () => {
    try {
      if (usersRepository && testUser.email) {
        await usersRepository.delete({ email: testUser.email.toLowerCase() });
      }
    } catch {
      // Best-effort cleanup to prevent leaking test records
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  describe('1. Login Endpoint (POST /api/v1/auth/login)', () => {
    it('should return 400 Bad Request when login body is missing or invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 401 Unauthorized for non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent.user.e2e@example.com',
          password: 'Password123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/E-mail ou senha inválidos/i);
    });

    it('should return 401 Unauthorized for invalid password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword999!',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/E-mail ou senha inválidos/i);
    });

    it('should return access_token in body and refreshToken strictly in httpOnly secure cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect([200, 201]).toContain(response.status);

      // Access token must be in the JSON body
      expect(response.body).toHaveProperty('access_token');
      expect(typeof response.body.access_token).toBe('string');
      expect(response.body.access_token.length).toBeGreaterThan(20);
      expect(response.body.token_type).toBe('Bearer');
      expect(typeof response.body.expires_in).toBe('number');

      // Refresh token must NEVER be exposed in the body
      expect(response.body).not.toHaveProperty('refresh_token');

      // Refresh token must be in the Set-Cookie header with secure flags
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const refreshCookie = (cookies as string[]).find((c) =>
        c.startsWith('refreshToken='),
      );
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toMatch(/HttpOnly/i);
      expect(refreshCookie).toMatch(/Path=\/api\/v1\/auth/i);
      expect(refreshCookie).toMatch(/SameSite=Strict/i);

      // Extract cookie value for subsequent tests
      const match = refreshCookie!.match(/refreshToken=([^;]+)/);
      expect(match).not.toBeNull();
      initialRefreshToken = match![1];
      initialAccessToken = response.body.access_token;
    });
  });

  describe('2. Refresh Token Endpoint (POST /api/v1/auth/refresh)', () => {
    it('should return 401 Unauthorized when refresh cookie is missing', async () => {
      const response = await request(app.getHttpServer()).post(
        '/api/v1/auth/refresh',
      );

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/Refresh token não fornecido/i);
    });

    it('should return 401 Unauthorized when refresh cookie is malformed', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', ['refreshToken=malformed.token.value']);

      expect(response.status).toBe(401);
    });

    it('should return 401 Unauthorized when refresh cookie has invalid signature or is forged', async () => {
      const forgedToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJmYWtlQGV4YW1wbGUuY29tIn0.forged_signature';

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${forgedToken}`]);

      expect(response.status).toBe(401);
    });

    it('should return new access_token in body and rotate refreshToken cookie', async () => {
      expect(initialRefreshToken).toBeDefined();

      // Ensure timestamp boundary cross for JWT uniqueness
      await new Promise((resolve) => setTimeout(resolve, 1050));

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${initialRefreshToken}`]);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).not.toHaveProperty('refresh_token');
      expect(typeof response.body.access_token).toBe('string');
      expect(response.body.token_type).toBe('Bearer');

      // Verify new Set-Cookie header contains rotated refreshToken
      const cookies = response.headers['set-cookie'] as string[];
      expect(cookies).toBeDefined();

      const newRefreshCookie = cookies.find((c) =>
        c.startsWith('refreshToken='),
      );
      expect(newRefreshCookie).toBeDefined();
      expect(newRefreshCookie).toMatch(/HttpOnly/i);

      const match = newRefreshCookie!.match(/refreshToken=([^;]+)/);
      expect(match).not.toBeNull();
      rotatedRefreshToken = match![1];

      // Security invariant: rotated token must differ from old one
      expect(rotatedRefreshToken).not.toBe(initialRefreshToken);
      expect(response.body.access_token).not.toBe(initialAccessToken);

      rotatedAccessToken = response.body.access_token;
    });

    it('should reject reused old refresh token after rotation (401 Unauthorized)', async () => {
      expect(initialRefreshToken).toBeDefined();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${initialRefreshToken}`]);

      expect(response.status).toBe(401);
    });
  });

  describe('3. Logout & Revocation (POST /api/v1/auth/logout)', () => {
    it('should return 401 Unauthorized when logout is attempted without Bearer token', async () => {
      const response = await request(app.getHttpServer()).post(
        '/api/v1/auth/logout',
      );

      expect(response.status).toBe(401);
    });

    it('should successfully logout with valid Bearer access token and clear cookie', async () => {
      expect(rotatedAccessToken).toBeDefined();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${rotatedAccessToken}`);

      expect([200, 204]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('message');
      }

      // Verify Set-Cookie clears the refreshToken cookie
      const cookies = response.headers['set-cookie'] as string[];
      expect(cookies).toBeDefined();
      const clearedCookie = cookies.find((c) => c.startsWith('refreshToken=;'));
      expect(clearedCookie).toBeDefined();
    });

    it('should reject refresh token after logout has revoked it in database (401 Unauthorized)', async () => {
      expect(rotatedRefreshToken).toBeDefined();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${rotatedRefreshToken}`]);

      expect(response.status).toBe(401);
    });
  });
});
