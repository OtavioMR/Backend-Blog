import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import supertest from 'supertest';
import { DataSource } from 'typeorm';
import { unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';

const request = supertest;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aZkAAAAASUVORK5CYII=',
  'base64',
);

describe('Comentários e foto: fluxo completo', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  const userIds: string[] = [];
  const postIds: string[] = [];
  const commentIds: string[] = [];
  const photos: string[] = [];
  const suffix = randomUUID();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(join(process.cwd(), 'uploads', 'profile-photos'), {
      prefix: '/uploads/profile-photos/',
      dotfiles: 'deny',
      index: false,
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    db = module.get(DataSource);
  });

  afterAll(async () => {
    try {
      for (const id of [...commentIds].reverse())
        await db.query('DELETE FROM comments WHERE id = $1', [id]);
      for (const id of postIds)
        await db.query('DELETE FROM posts WHERE id = $1', [id]);
      for (const id of userIds)
        await db.query('DELETE FROM users WHERE id = $1', [id]);
      for (const name of photos)
        await unlink(join(process.cwd(), 'uploads', 'profile-photos', name));
    } finally {
      await app?.close();
    }
  });

  it('testa upload, post, comentários, respostas, permissões e desativação', async () => {
    async function register(name: string) {
      const email = `${name.toLowerCase()}-${suffix}@example.com`;
      const password = 'Password123!';
      const created = await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({ name, email, password })
        .expect(201);
      userIds.push(created.body.id);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return {
        id: created.body.id as string,
        token: login.body.access_token as string,
      };
    }
    const owner = await register('Owner');
    const reader = await register('Reader');
    const other = await register('Other');
    const admin = await register('Admin');
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [
      'AUTHOR',
      owner.id,
    ]);
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [
      'AUTHOR',
      other.id,
    ]);
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [
      'ADMIN',
      admin.id,
    ]);
    const auth = (token: string) => `Bearer ${token}`;

    await request(app.getHttpServer())
      .post(`/api/v1/users/${owner.id}/profile-photo`)
      .set('Authorization', auth(reader.token))
      .attach('file', png, 'photo.png')
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/users/${owner.id}/profile-photo`)
      .set('Authorization', auth(owner.token))
      .attach('file', Buffer.from('invalid'), 'photo.png')
      .expect(400);
    const photo = await request(app.getHttpServer())
      .post(`/api/v1/users/${owner.id}/profile-photo`)
      .set('Authorization', auth(owner.token))
      .attach('file', png, 'photo.png')
      .expect(201);
    expect(photo.body.profilePhoto).toMatch(
      /^\/uploads\/profile-photos\/.+\.png$/,
    );
    photos.push(basename(photo.body.profilePhoto));
    const image = await request(app.getHttpServer())
      .get(photo.body.profilePhoto)
      .expect(200);
    expect(image.body.equals(png)).toBe(true);

    const post = await request(app.getHttpServer())
      .post('/api/v1/posts')
      .set('Authorization', auth(owner.token))
      .send({
        title: 'Post de teste',
        content: 'Conteúdo para validar comentários.',
        published: true,
      })
      .expect(201);
    const postId: string = post.body.id;
    postIds.push(postId);
    expect(post.body.commentsEnabled).toBe(true);
    await request(app.getHttpServer())
      .post(`/api/v1/posts/${postId}/comments`)
      .send({ content: 'sem login' })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', auth(reader.token))
      .send({ content: ' '.repeat(5) })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', auth(reader.token))
      .send({ content: 'a'.repeat(1001) })
      .expect(400);

    const root = await request(app.getHttpServer())
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', auth(owner.token))
      .send({ content: 'Comentário original' })
      .expect(201);
    commentIds.push(root.body.id);
    expect(root.body.author.profilePhoto).toBe(photo.body.profilePhoto);
    const reply = await request(app.getHttpServer())
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', auth(reader.token))
      .send({ content: 'Primeira resposta', replyToId: root.body.id })
      .expect(201);
    commentIds.push(reply.body.id);
    const nested = await request(app.getHttpServer())
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', auth(other.token))
      .send({ content: 'Segunda resposta', replyToId: reply.body.id })
      .expect(201);
    commentIds.push(nested.body.id);
    expect(nested.body).toMatchObject({
      rootId: root.body.id,
      replyToId: reply.body.id,
      replyToAuthor: { id: reader.id },
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/comments/${reply.body.id}`)
      .set('Authorization', auth(other.token))
      .send({ content: 'não permitido' })
      .expect(403);
    const edited = await request(app.getHttpServer())
      .patch(`/api/v1/comments/${reply.body.id}`)
      .set('Authorization', auth(reader.token))
      .send({ content: 'Resposta editada' })
      .expect(200);
    expect(edited.body.editedAt).toBeTruthy();
    await request(app.getHttpServer())
      .delete(`/api/v1/comments/${reply.body.id}`)
      .set('Authorization', auth(other.token))
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/comments/${reply.body.id}`)
      .set('Authorization', auth(owner.token))
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', auth(reader.token))
      .send({ content: 'não permitido', replyToId: reply.body.id })
      .expect(400);
    const list = await request(app.getHttpServer())
      .get(`/api/v1/posts/${postId}/comments`)
      .expect(200);
    expect(list.body.data[0].replies.data).toMatchObject([
      {
        id: reply.body.id,
        content: 'Comentário excluído',
        author: { id: reader.id },
      },
      { id: nested.body.id, replyToAuthor: { id: reader.id } },
    ]);
    expect(JSON.stringify(list.body)).not.toContain('Resposta editada');
    const page = await request(app.getHttpServer())
      .get(
        `/api/v1/posts/${postId}/comments/${root.body.id}/replies?page=2&limit=1`,
      )
      .expect(200);
    expect(page.body.data[0].id).toBe(nested.body.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/posts/${postId}`)
      .set('Authorization', auth(owner.token))
      .send({ commentsEnabled: false })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/posts/${postId}/comments`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', auth(owner.token))
      .send({ content: 'bloqueado' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/comments/${root.body.id}`)
      .set('Authorization', auth(owner.token))
      .send({ content: 'bloqueado' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/posts/${postId}`)
      .set('Authorization', auth(owner.token))
      .send({ commentsEnabled: true })
      .expect(200);
    const restored = await request(app.getHttpServer())
      .get(`/api/v1/posts/${postId}/comments`)
      .expect(200);
    expect(restored.body.data[0].replies.data[0].content).toBe(
      'Comentário excluído',
    );
    await request(app.getHttpServer())
      .delete(`/api/v1/comments/${root.body.id}`)
      .set('Authorization', auth(owner.token))
      .expect(204);
    const finalList = await request(app.getHttpServer())
      .get(`/api/v1/posts/${postId}/comments`)
      .expect(200);
    expect(finalList.body.data[0]).toMatchObject({
      content: 'Comentário excluído',
      author: { id: owner.id },
      replies: { data: [{ id: reply.body.id }, { id: nested.body.id }] },
    });

    const secondPost = await request(app.getHttpServer())
      .post('/api/v1/posts')
      .set('Authorization', auth(other.token))
      .send({
        title: 'Outro post',
        content: 'Outro conteúdo para o teste.',
        published: true,
      })
      .expect(201);
    postIds.push(secondPost.body.id);
    await request(app.getHttpServer())
      .post(`/api/v1/posts/${secondPost.body.id}/comments`)
      .set('Authorization', auth(reader.token))
      .send({ content: 'incompatível', replyToId: nested.body.id })
      .expect(400);
    await request(app.getHttpServer())
      .get(
        `/api/v1/posts/${secondPost.body.id}/comments/${root.body.id}/replies`,
      )
      .expect(404);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', auth(reader.token))
      .send({ content: 'Novo comentário' })
      .expect(201);
    commentIds.push(first.body.id);
    for (let i = 0; i < 6; i++) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', auth(reader.token))
        .send({ content: `Resposta ${i}`, replyToId: first.body.id })
        .expect(201);
      commentIds.push(response.body.id);
    }
    for (let i = 0; i < 20; i++) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', auth(reader.token))
        .send({ content: `Comentário ${i}` })
        .expect(201);
      commentIds.push(response.body.id);
    }
    const page1 = await request(app.getHttpServer())
      .get(`/api/v1/posts/${postId}/comments`)
      .expect(200);
    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/posts/${postId}/comments?page=2`)
      .expect(200);
    expect(page1.body.data).toHaveLength(20);
    expect(page1.body.meta.hasNextPage).toBe(true);
    expect(page2.body.data).toHaveLength(2);
    const pagedRoot = page2.body.data.find(
      (item: { id: string }) => item.id === first.body.id,
    );
    expect(pagedRoot.replies.data).toHaveLength(5);
    expect(pagedRoot.replies.meta.hasNextPage).toBe(true);
    const more = await request(app.getHttpServer())
      .get(`/api/v1/posts/${postId}/comments/${first.body.id}/replies?page=2`)
      .expect(200);
    expect(more.body.data).toHaveLength(1);
    await request(app.getHttpServer())
      .delete(`/api/v1/comments/${first.body.id}`)
      .set('Authorization', auth(admin.token))
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/api/v1/posts/${postId}`)
      .set('Authorization', auth(admin.token))
      .send({ commentsEnabled: false })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/posts/${postId}/comments`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/posts/${postId}`)
      .set('Authorization', auth(admin.token))
      .send({ commentsEnabled: true })
      .expect(200);
  }, 30000);
});
