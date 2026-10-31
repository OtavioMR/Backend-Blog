import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupSwagger } from '../docs/index.js';
import { configureHttpSecurity } from './http-security.js';

@Controller('probe')
class ProbeController {
  @Get()
  get() {
    return 'ok';
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class TestModule {}

describe('HTTP security', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttpSecurity(app, 'https://frontend.example/path');
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('adds security headers, including to static Swagger responses', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs/');
    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toContain(
      "script-src 'self'",
    );
    expect(response.headers['strict-transport-security']).toBeDefined();
    const script = await request(app.getHttpServer()).get(
      '/api/docs/swagger-ui-init.js',
    );
    expect(script.status).toBe(200);
    expect(script.headers['x-content-type-options']).toBe('nosniff');
  });

  it.each([
    ['https://frontend.example', true],
    ['https://attacker.example', false],
  ])('handles preflight from %s', async (origin, allowed) => {
    const response = await request(app.getHttpServer())
      .options('/probe')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');
    expect(response.headers['access-control-allow-origin']).toBe(
      allowed ? origin : undefined,
    );
    if (allowed)
      expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rate limits each client IP supplied by the trusted proxy independently', async () => {
    const first = () =>
      request(app.getHttpServer())
        .get('/probe')
        .set('X-Forwarded-For', '203.0.113.1');
    expect((await first()).status).toBe(200);
    expect((await first()).status).toBe(429);
    expect(
      (
        await request(app.getHttpServer())
          .get('/probe')
          .set('X-Forwarded-For', '203.0.113.2')
      ).status,
    ).toBe(200);
  });
});
