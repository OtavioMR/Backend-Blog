import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RateLimitModule } from './rate-limit.module.js';

@Controller('rate-limit-test')
class TestController {
  @Get()
  get() {
    return 'ok';
  }
}

describe('rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [RateLimitModule],
      controllers: [TestController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 100 requests and rejects the next with a retry time', async () => {
    for (let i = 0; i < 100; i++) {
      await supertest(app.getHttpServer()).get('/rate-limit-test').expect(200);
    }
    const response = await supertest(app.getHttpServer())
      .get('/rate-limit-test')
      .expect(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});
