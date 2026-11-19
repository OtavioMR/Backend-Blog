import { Body, Controller, Patch, Post, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreatePostDto } from '../modules/posts/dto/create-post.dto.js';
import { UpdatePostDto } from '../modules/posts/dto/update-post.dto.js';
import { configureHttpSecurity } from './http-security.js';

@Controller('posts')
class ContentProbeController {
  @Post()
  create(@Body(new ValidationPipe({ expectedType: CreatePostDto })) body: CreatePostDto) {
    return { content: body.content };
  }

  @Patch(':id')
  update(@Body(new ValidationPipe({ expectedType: UpdatePostDto })) body: UpdatePostDto) {
    return { content: body.content };
  }
}

describe('limite HTTP do conteúdo de contos', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ContentProbeController] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttpSecurity(app, 'http://localhost:5173', '');
    await app.init();
  });

  afterAll(async () => app.close());

  it.each(['post', 'patch'] as const)('%s aceita 100 mil caracteres UTF-8 e rejeita 100.001', async method => {
    const path = method === 'post' ? '/posts' : '/posts/synthetic';
    const content = 'á'.repeat(100000);
    const response = await request(app.getHttpServer())[method](path)
      .send({ title: 'Conto sintético', content }).expect(method === 'post' ? 201 : 200);
    expect(response.body.content).toBe(content);
    const rejected = await request(app.getHttpServer())[method](path)
      .send({ title: 'Conto sintético', content: content + 'a' }).expect(400);
    expect(rejected.body.message).toContain('content must be shorter than or equal to 100000 characters');
  });

  it('aceita escapes Unicode JSON no limite de caracteres', async () => {
    const body = '{"title":"Conto sintético","content":"' + '\\u00e1'.repeat(100000) + '"}';
    const response = await request(app.getHttpServer()).post('/posts')
      .set('Content-Type', 'application/json').send(body).expect(201);
    expect(response.body.content).toBe('á'.repeat(100000));
  });

  it('mantém um teto de 1 MiB para o corpo JSON', async () => {
    await request(app.getHttpServer()).post('/posts')
      .send({ title: 'Conto sintético', content: 'a'.repeat(1024 * 1024) }).expect(413);
  });
});
