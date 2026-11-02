import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import dataSource from '../../database/data-source.js';
import { Post } from './entities/post.entity.js';
import { Comment } from '../comments/entities/comment.entity.js';
import { PostViewsService } from './post-views.service.js';
import { CommentLikesService } from '../comments/comment-likes.service.js';
import { AuthorFollowsService } from './author-follows.service.js';
import { SavedCollectionsService } from './saved-collections.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { User } from '../users/entities/user.entity.js';
import { NewsletterService } from '../newsletter/newsletter.service.js';
import { MailService } from '../mail/mail.service.js';
import { MailQueueService } from '../mail/mail-queue.service.js';
import { PostSchedulerService } from './post-scheduler.service.js';
import { PostInteractionsService } from './post-interactions.service.js';
import { PostInteraction } from './entities/post-interaction.entity.js';
import { PostRevisionsService } from './post-revisions.service.js';
import { PostsService } from './posts.service.js';
import { Category } from '../categories/entities/category.entity.js';
import { TagsService } from '../tags/tags.service.js';
import { UserRole } from '../users/enums/user.enum.js';
import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';
import { PostSeriesService } from './post-series.service.js';
import { CommentsService } from '../comments/comments.service.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('engagement PostgreSQL integration', () => {
  let runner: QueryRunner;
  const user = randomUUID(), follower = randomUUID(), post = randomUUID(), comment = randomUUID();
  beforeAll(async () => {
    dataSource.setOptions({ migrations: [] });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner();
    await runner.startTransaction();
    await runner.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [user, 'Test', `${user}@example.test`, 'hash']);
    await runner.query("UPDATE users SET role = 'AUTHOR', first_post_approved = true WHERE id = $1", [user]);
    await runner.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [follower, 'Follower', `${follower}@example.test`, 'hash']);
    await runner.query('INSERT INTO posts (id, author_id, title, slug, content, published, published_at) VALUES ($1, $2, $3, $4, $5, true, now())', [post, user, 'Test', `test-${post}`, 'Content']);
    await runner.query('INSERT INTO comments (id, post_id, author_id, content) VALUES ($1, $2, $3, $4)', [comment, post, user, 'Comment']);
  });
  afterAll(async () => { if (runner) { await runner.rollbackTransaction(); await runner.release(); } if (dataSource.isInitialized) await dataSource.destroy(); });
  it('deduplicates views and ranks the post', async () => {
    const service = new PostViewsService(runner.manager.getRepository(Post), { getOrThrow: () => 'secret' } as unknown as ConfigService);
    expect(await service.record(post, '127.0.0.1')).toEqual({ counted: true, total: 1 });
    expect(await service.record(post, '127.0.0.1')).toEqual({ counted: false, total: 1 });
    await runner.query("INSERT INTO post_views(post_id, visitor_hash, viewed_on) VALUES ($1, 'inside', (now() AT TIME ZONE 'UTC')::date - 6), ($1, 'outside', (now() AT TIME ZONE 'UTC')::date - 7)", [post]);
    const result = await service.trending({ page: 1, limit: 100 });
    expect(result.data.find(item => item.id === post)?.views).toBe(2);
  });
  it('makes likes idempotent and allows removal', async () => {
    const service = new CommentLikesService(runner.manager.getRepository(Comment));
    await service.set(comment, user, true); await service.set(comment, user, true);
    expect(await service.status(comment, user)).toEqual({ liked: true, likes: 1 });
    await service.set(comment, user, false);
    expect(await service.status(comment, user)).toEqual({ liked: false, likes: 0 });
  });
  it('follows authors idempotently and filters the personalized feed', async () => {
    const service = new AuthorFollowsService(runner.manager.getRepository(Post));
    expect((await service.feed(follower, {})).data).toEqual([]);
    await service.follow(user, follower); await service.follow(user, follower);
    expect(await service.status(user, follower)).toEqual({ following: true });
    expect((await service.feed(follower, {})).data.map(item => item.id)).toContain(post);
    await service.unfollow(user, follower);
    expect((await service.feed(follower, {})).data).toEqual([]);
    await expect(service.follow(user, user)).rejects.toThrow();
  });
  it('keeps collections private and hides articles that are no longer saved', async () => {
    const service = new SavedCollectionsService(runner.manager.getRepository(Post));
    const collection = await service.create(follower, 'Reading') as { id: string };
    await expect(service.add(collection.id, post, follower)).rejects.toThrow();
    await runner.query('INSERT INTO post_interactions (post_id, user_id, saved) VALUES ($1, $2, true)', [post, follower]);
    await service.add(collection.id, post, follower); await service.add(collection.id, post, follower);
    expect((await service.listPosts(collection.id, follower, {})).data).toHaveLength(1);
    await expect(service.listPosts(collection.id, user, {})).rejects.toThrow();
    await runner.query('UPDATE post_interactions SET saved = false WHERE post_id = $1 AND user_id = $2', [post, follower]);
    expect((await service.listPosts(collection.id, follower, {})).data).toHaveLength(0);
    expect(await service.rename(collection.id, follower, 'Renamed')).toMatchObject({ name: 'Renamed' });
    await expect(service.rename(collection.id, user, 'Forbidden')).rejects.toThrow();
    await service.remove(collection.id, follower);
    await expect(service.listPosts(collection.id, follower, {})).rejects.toThrow();
  });
  it('loads the public relationships of saved posts', async () => {
    const category = randomUUID(), inactive = randomUUID(), tag = randomUUID();
    await runner.query('INSERT INTO categories (id, name, slug, is_active) VALUES ($1, $2, $3, true), ($4, $5, $6, false)', [category, `cat-${category}`, `cat-${category}`, inactive, `cat-${inactive}`, `cat-${inactive}`]);
    await runner.query('INSERT INTO tags (id, name, slug) VALUES ($1, $2, $3)', [tag, 'Test tag', `tag-${tag}`]);
    await runner.query('INSERT INTO post_categories (post_id, category_id) VALUES ($1, $2), ($1, $3)', [post, category, inactive]);
    await runner.query('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)', [post, tag]);
    await runner.query('UPDATE post_interactions SET saved = true WHERE post_id = $1 AND user_id = $2', [post, follower]);
    const service = new PostInteractionsService(runner.manager.getRepository(Post), runner.manager.getRepository(PostInteraction));
    const result = await service.saved(follower, {});
    expect(result.data[0].author).toMatchObject({ id: user, name: 'Test' });
    expect(result.data[0].author.email).toBeUndefined();
    expect(result.data[0].categories.map(item => item.id)).toEqual([category]);
    expect(result.data[0].tags.map(item => item.id)).toEqual([tag]);
  });
  it('creates notifications once per event and isolates the recipient', async () => {
    await runner.query('DELETE FROM notifications WHERE recipient_id IN ($1, $2)', [user, follower]);
    await runner.query('INSERT INTO author_follows (author_id, follower_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user, follower]);
    await runner.query('INSERT INTO post_interactions (post_id, user_id, liked) VALUES ($1, $2, true) ON CONFLICT (post_id, user_id) DO UPDATE SET liked = true', [post, follower]);
    await runner.query('UPDATE post_interactions SET liked = true WHERE post_id = $1 AND user_id = $2', [post, follower]);
    await runner.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [comment, follower]);
    const replyTarget = randomUUID();
    await runner.query('INSERT INTO comments (id, post_id, author_id, content) VALUES ($1, $2, $3, $4)', [replyTarget, post, follower, 'Hi']);
    await runner.query('INSERT INTO comments (post_id, author_id, content, reply_to_id, root_id) VALUES ($1, $2, $3, $4, $4)', [post, user, 'Reply', replyTarget]);
    const service = new NotificationsService(runner.manager.getRepository(User));
    const result = await service.list(user, {});
    expect(result.unread).toBe(4);
    const notifications = result.data as { id: string; type: string }[];
    expect(notifications.map(item => item.type).sort()).toEqual(['comment', 'comment_like', 'follow', 'post_like']);
    expect(((await service.list(follower, {})).data as { type: string }[]).map(item => item.type)).toEqual(['reply']);
    await expect(service.read(notifications[0].id, follower)).rejects.toThrow();
    await service.read(notifications[0].id, user);
    expect((await service.list(user, {})).unread).toBe(3);
    await service.readAll(user);
    expect((await service.list(user, {})).unread).toBe(0);
  });
  it('requires confirmation, queues manual and scheduled publications, retries and unsubscribes', async () => {
    await runner.query("UPDATE newsletter_deliveries SET next_attempt_at = now() + interval '1 day' WHERE sent_at IS NULL");
    const sendNewsletterConfirmation = vi.fn().mockResolvedValue(undefined);
    const sendNewsletterPost = vi.fn().mockRejectedValueOnce(new Error('SMTP unavailable')).mockResolvedValue(undefined);
    const enqueueNewsletter = vi.fn().mockResolvedValue(undefined);
    const service = new NewsletterService(runner.manager.getRepository(User), { sendNewsletterConfirmation, sendNewsletterPost } as unknown as MailService, { getOrThrow: () => 'secret' } as unknown as ConfigService, { enqueueNewsletter, registerNewsletterHandler: vi.fn() } as unknown as MailQueueService);
    const email = `${randomUUID()}@example.test`;
    await service.subscribe(email);
    const token = sendNewsletterConfirmation.mock.calls[0][1] as string;
    const subscriber = (await runner.query('SELECT id, confirmed FROM newsletter_subscribers WHERE email = $1', [email]))[0];
    expect(subscriber.confirmed).toBe(false);
    await service.confirm(token);
    await expect(service.confirm(token)).rejects.toThrow();
    const manual = randomUUID(), scheduled = randomUUID();
    await runner.query('INSERT INTO posts (id, author_id, title, slug, content, published) VALUES ($1, $2, $3, $4, $5, true)', [manual, user, 'Manual', `manual-${manual}`, 'Content']);
    await runner.query('INSERT INTO posts (id, author_id, title, slug, content, published, scheduled_at) VALUES ($1, $2, $3, $4, $5, false, now())', [scheduled, user, 'Scheduled', `scheduled-${scheduled}`, 'Content']);
    await new PostSchedulerService(runner.manager.getRepository(Post)).publishDue();
    expect((await runner.query('SELECT post_id FROM newsletter_deliveries WHERE subscriber_id = $1', [subscriber.id])).length).toBe(2);
    await service.deliverPending();
    expect(enqueueNewsletter).toHaveBeenCalledTimes(2);
    for (const [delivery] of enqueueNewsletter.mock.calls) await service.processDelivery(delivery);
    const rows = await runner.query('SELECT attempts, sent_at FROM newsletter_deliveries WHERE subscriber_id = $1 ORDER BY sent_at NULLS FIRST', [subscriber.id]);
    expect(rows[0].attempts).toBe(1); expect(rows[0].sent_at).toBeNull(); expect(rows[1].sent_at).not.toBeNull();
    const unsubscribeToken = sendNewsletterPost.mock.calls[1][3] as string;
    await service.unsubscribe(unsubscribeToken);
    expect((await runner.query('SELECT confirmed FROM newsletter_subscribers WHERE id = $1', [subscriber.id]))[0].confirmed).toBe(false);
    expect((await runner.query('SELECT post_id FROM newsletter_deliveries WHERE subscriber_id = $1 AND sent_at IS NULL', [subscriber.id])).length).toBe(0);
  });
  it('captures, protects and restores article revisions', async () => {
    const repository = runner.manager.getRepository(Post);
    const postService = new PostsService(repository, runner.manager.getRepository(Category), {} as TagsService);
    const service = new PostRevisionsService(repository, postService);
    const owner = { userId: user, email: 'owner@example.test', role: UserRole.AUTHOR };
    const other = { userId: follower, email: 'other@example.test', role: UserRole.AUTHOR };
    const original = await service.list(post, owner, {});
    expect(original.data).toHaveLength(1);
    const originalId = original.data[0].id;
    await expect(service.list(post, other, {})).rejects.toThrow();
    await runner.query('UPDATE posts SET title = $2, content = $3 WHERE id = $1', [post, 'Changed title', 'Changed content']);
    await runner.query('UPDATE posts SET published = published WHERE id = $1', [post]);
    expect((await service.list(post, owner, {})).data).toHaveLength(2);
    expect((await service.detail(post, originalId, owner)).title).toBe('Test');
    await service.restore(post, originalId, owner);
    const restored = await runner.query('SELECT title, content FROM posts WHERE id = $1', [post]);
    expect(restored[0]).toEqual({ title: 'Test', content: 'Content' });
    expect((await service.list(post, owner, {})).data).toHaveLength(3);
    await expect(service.detail(post, randomUUID(), owner)).rejects.toThrow();
  });

  it('paginates filtered posts without skipping timestamps in the same millisecond', async () => {
    const ids = [randomUUID(), randomUUID()];
    const term = `cursor${randomUUID().replace(/-/g, '')}`;
    await runner.query(`INSERT INTO posts (id, author_id, title, slug, content, published, published_at) VALUES
      ($1, $3, $4, $5, 'content', true, '2099-01-01T00:00:00.123456Z'),
      ($2, $3, $4, $6, 'content', true, '2099-01-01T00:00:00.123123Z')`, [...ids, user, term, `cursor-${ids[0]}`, `cursor-${ids[1]}`]);
    const service = new PostsService(runner.manager.getRepository(Post), runner.manager.getRepository(Category), {} as TagsService);
    const first = await service.findAll({ search: term, limit: 1, cursor: 'start' });
    expect(first.data[0].id).toBe(ids[0]);
    if (!('nextCursor' in first.meta) || !first.meta.nextCursor) throw new Error('Cursor ausente');
    const second = await service.findAll({ search: term, limit: 1, cursor: first.meta.nextCursor });
    expect(second.data.map(item => item.id)).toEqual([ids[1]]);
    const partial = await service.findAll({ search: term.slice(0, -5), limit: 100 });
    expect(partial.data.map(item => item.id)).toEqual(expect.arrayContaining(ids));
  });

  it('ranks title matches first and uses GIN for selective full-text and partial searches', async () => {
    const term = `search${randomUUID().replace(/-/g, '')}`;
    const titleId = randomUUID(), contentId = randomUUID();
    await runner.query(`INSERT INTO posts (id, author_id, title, slug, content, published, published_at) VALUES
      ($1, $3, $4, $5, 'other content', true, now() - interval '1 day'),
      ($2, $3, 'Other title', $6, $4, true, now())`, [titleId, contentId, user, term, `rank-${titleId}`, `rank-${contentId}`]);
    const service = new PostsService(runner.manager.getRepository(Post), runner.manager.getRepository(Category), {} as TagsService);
    expect((await service.findAll({ search: term })).data.map(item => item.id)).toEqual([titleId, contentId]);
    await runner.query(`INSERT INTO posts (author_id, title, slug, content, published, published_at)
      SELECT $1, 'Unrelated entry ' || i, $2 || i, repeat('ordinary padding text ', 60), true, now()
      FROM generate_series(1, 5000) i`, [user, `plan-${user}-`]);
    await runner.query('ANALYZE posts');
    const plan = await runner.query(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM posts
      WHERE search_vector @@ websearch_to_tsquery('blog_portuguese'::regconfig, $1)
      OR search_text LIKE blog_search_text($2)`, [term, `%${term}%`]);
    const serialized = JSON.stringify(plan);
    expect(serialized).toContain('Bitmap Index Scan');
    expect(serialized).toContain('idx_posts_search_vector');
    expect(serialized).toContain('idx_posts_search_text');
    expect(serialized).not.toContain('Seq Scan');
    // Remove the large fixture before subsequent pagination tests.
    await runner.query('DELETE FROM posts WHERE slug LIKE $1', [`plan-${user}-%`]);
  }, 30_000);

  it('reads five consecutive cursor pages without duplicates or missing entries', async () => {
    const term = `fivepages${randomUUID().replace(/-/g, '')}`;
    const inserted: { id: string }[] = await runner.query(`INSERT INTO posts (author_id, title, slug, content, published, published_at)
      SELECT $1::uuid, $2::varchar, $2::varchar || i, 'cursor content', true, now() FROM generate_series(1, 25) i RETURNING id`, [user, term]);
    const service = new PostsService(runner.manager.getRepository(Post), runner.manager.getRepository(Category), {} as TagsService);
    let cursor = 'start';
    const seen: string[] = [];
    for (let page = 0; page < 5; page++) {
      const result = await service.findAll({ search: term, cursor, limit: 5 });
      expect(result.data).toHaveLength(5);
      if (!('nextCursor' in result.meta)) throw new Error('Cursor metadata absent');
      expect(result.meta.hasMore).toBe(page < 4);
      seen.push(...result.data.map(item => item.id));
      cursor = result.meta.nextCursor ?? '';
    }
    expect(new Set(seen).size).toBe(25);
    expect(seen.sort()).toEqual(inserted.map(item => item.id).sort());
  });

  it('paginates comments without skipping timestamps in the same millisecond', async () => {
    const ids = [randomUUID(), randomUUID()];
    await runner.query(`INSERT INTO comments (id, post_id, author_id, content, created_at) VALUES
      ($1, $3, $4, 'first', '2099-01-01T00:00:00.123456Z'),
      ($2, $3, $4, 'second', '2099-01-01T00:00:00.123123Z')`, [...ids, post, user]);
    const service = new CommentsService(runner.manager.getRepository(Comment), runner.manager.getRepository(Post));
    const first = await service.list(post, 1, 1, 'start');
    expect(first.data[0].id).toBe(ids[0]);
    if (!('nextCursor' in first.meta) || !first.meta.nextCursor) throw new Error('Cursor ausente');
    const second = await service.list(post, 1, 1, first.meta.nextCursor);
    expect(second.data[0].id).toBe(ids[1]);
  });

  it('orders series, hides drafts and restricts management', async () => {
    const db = { query: runner.query.bind(runner), transaction: (fn: (manager: typeof runner.manager) => unknown) => fn(runner.manager) } as unknown as DataSource;
    const service = new PostSeriesService(db);
    const owner = { userId: user, email: 'owner@example.test', role: UserRole.AUTHOR };
    const other = { userId: follower, email: 'other@example.test', role: UserRole.AUTHOR };
    const draft = randomUUID();
    await runner.query('INSERT INTO posts (id, author_id, title, slug, content, published) VALUES ($1, $2, $3, $4, $5, false)', [draft, user, 'Draft', `draft-${draft}`, 'Draft content']);
    const series = await service.create({ title: 'Series' }, owner);
    await expect(service.detail(series.id)).rejects.toThrow();
    await service.setItems(series.id, [draft, post], owner);
    expect((await service.mineDetail(series.id, owner)).posts.map((item: { id: string }) => item.id)).toEqual([draft, post]);
    expect((await service.detail(series.id)).posts.map((item: { id: string }) => item.id)).toEqual([post]);
    const postsService = new PostsService(runner.manager.getRepository(Post), runner.manager.getRepository(Category), {} as TagsService);
    expect(await postsService.findById(post)).toMatchObject({ series: { id: series.id, totalParts: 1, previous: null, next: null } });
    const next = randomUUID();
    await runner.query('INSERT INTO posts (id, author_id, title, slug, content, published, published_at) VALUES ($1, $2, $3, $4, $5, true, now())', [next, user, 'Next', `next-${next}`, 'Next content']);
    await service.setItems(series.id, [draft, post, next], owner);
    expect(await postsService.findById(post)).toMatchObject({ series: { totalParts: 2, previous: null, next: { id: next } } });
    expect(await postsService.findById(next)).toMatchObject({ series: { totalParts: 2, previous: { id: post }, next: null } });
    expect((await service.forPost(post)).id).toBe(series.id);
    await expect(service.forPost(draft)).rejects.toThrow();
    await expect(service.setItems(series.id, [post], other)).rejects.toThrow();
    await service.setItems(series.id, [post, draft], owner);
    expect((await service.mineDetail(series.id, owner)).posts.map((item: { id: string }) => item.id)).toEqual([post, draft]);
    await service.remove(series.id, owner);
    expect((await runner.query('SELECT id FROM posts WHERE id = $1', [post]))).toHaveLength(1);
  });

});
