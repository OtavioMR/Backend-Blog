import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, type QueryRunner } from 'typeorm';
import dataSource from '../../database/data-source.js';
import { Post } from './entities/post.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { PostsService } from './posts.service.js';
import { PostSeriesService } from './post-series.service.js';
import { TagsService } from '../tags/tags.service.js';
import { UserRole } from '../users/enums/user.enum.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('series workflow on configured PostgreSQL (rollback)', () => {
  let runner: QueryRunner;
  let posts: PostsService;
  let series: PostSeriesService;
  const owner = randomUUID(), other = randomUUID();
  const user = { userId: owner, email: `${owner}@example.test`, role: UserRole.AUTHOR };
  beforeAll(async () => {
    dataSource.setOptions({ migrations: [] });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner(); await runner.startTransaction();
    await runner.query(`INSERT INTO users(id,name,email,password_hash,role,first_post_approved) VALUES
      ($1,'Synthetic Series Author',$3,'hash','AUTHOR',true),($2,'Synthetic Other Author',$4,'hash','AUTHOR',true)`, [owner, other, `${owner}@example.test`, `${other}@example.test`]);
    const adapter = { query: runner.query.bind(runner), transaction: runner.manager.transaction.bind(runner.manager) } as unknown as DataSource;
    series = new PostSeriesService(adapter);
    posts = new PostsService(runner.manager.getRepository(Post), runner.manager.getRepository(Category), { resolveNames: async () => [] } as unknown as TagsService);
  });
  afterAll(async () => { if (runner) { await runner.rollbackTransaction(); await runner.release(); } if (dataSource.isInitialized) await dataSource.destroy(); });

  it('creates draft and association atomically; edit retains context; deleting series preserves articles', async () => {
    const story = await series.create({ title: 'Synthetic serial', description: 'A test story' }, user);
    const updated = await series.update(story.id, { description: 'Updated synthetic description', expectedUpdatedAt: new Date(story.updatedAt).toISOString() }, user);
    expect(updated.description).toBe('Updated synthetic description');
    const draft = await posts.create({ title: 'Synthetic chapter one', content: 'Synthetic chapter content.', seriesId: story.id }, owner);
    expect((draft as Post & { seriesContext: { id: string } }).seriesContext.id).toBe(story.id);
    expect((await series.mineDetail(story.id, user)).posts.map((item: { id: string }) => item.id)).toEqual([draft.id]);
    await expect(series.detail(story.id)).rejects.toThrow();
    await posts.update(draft.id, { title: 'Synthetic chapter edited' }, user);
    const reopened = await posts.findById(draft.id, user) as Post & { seriesContext: { id: string } };
    expect(reopened.seriesContext.id).toBe(story.id);
    await series.remove(story.id, user);
    expect((await posts.findById(draft.id, user)).title).toBe('Synthetic chapter edited');
  });

  it('rejects another author without leaving an orphan draft', async () => {
    const story = await series.create({ title: 'Synthetic private series' }, user);
    const [before] = await runner.query('SELECT count(*)::int AS count FROM posts WHERE author_id=$1', [other]);
    await expect(posts.create({ title: 'Synthetic unauthorized chapter', content: 'Synthetic unauthorized content.', seriesId: story.id }, other)).rejects.toThrow();
    const [after] = await runner.query('SELECT count(*)::int AS count FROM posts WHERE author_id=$1', [other]);
    expect(after.count).toBe(before.count);
    await expect(series.mineDetail(story.id, { userId: other, email: `${other}@example.test`, role: UserRole.AUTHOR })).rejects.toThrow();
  });

  it('keeps inactive links visible privately so they can be removed together without deleting texts', async () => {
    const story = await series.create({ title: 'Synthetic inactive chapters' }, user);
    const first = await posts.create({ title: 'Synthetic inactive first', content: 'Synthetic chapter content.', seriesId: story.id }, owner);
    const second = await posts.create({ title: 'Synthetic inactive second', content: 'Synthetic chapter content.', seriesId: story.id }, owner);
    await posts.remove(first.id, user);
    await posts.remove(second.id, user);
    const detail = await series.mineDetail(story.id, user);
    expect(detail.posts).toHaveLength(2);
    expect(detail.posts.every((post: { isActive: boolean }) => !post.isActive)).toBe(true);
    await series.setItems(story.id, [], user);
    expect((await series.mineDetail(story.id, user)).posts).toEqual([]);
  });

  it('orders only visible chapters publicly, rejects stale order and duplicate membership, aggregates actual metadata', async () => {
    const story = await series.create({ title: `Synthetic discovery ${owner}` }, user);
    const first = await posts.create({ title: 'Synthetic public chapter', content: 'Synthetic chapter content.', published: true, contentRating: '14+', aiTextDeclaration: 'FULL_AI', seriesId: story.id }, owner);
    const hidden = await posts.create({ title: 'Synthetic private chapter', content: 'Synthetic chapter content.', seriesId: story.id }, owner);
    const second = await posts.create({ title: 'Synthetic human chapter', content: 'Synthetic chapter content.', published: true, aiTextDeclaration: 'HUMAN_ONLY', seriesId: story.id }, owner);
    const version = await series.mineDetail(story.id, user);
    await series.setItems(story.id, [second.id, hidden.id, first.id], user, new Date(version.updatedAt).toISOString());
    await expect(series.setItems(story.id, [first.id, second.id], user, '2000-01-01T00:00:00.000Z')).rejects.toThrow();
    const detail = await series.detail(story.id);
    expect(detail.posts.map((item: { id: string }) => item.id)).toEqual([second.id, first.id]);
    const discovery = await series.publicList({ authorId: owner });
    const card = discovery.data.find((item: { id: string }) => item.id === story.id);
    expect(card).toMatchObject({ publishedCount: 2, contentRating: '14+', aiTextCount: 1 });
    const feed = await posts.findAll({ authorId: owner, discovery: 'true', limit: 100 });
    expect(feed.data.filter(post => [first.id, second.id].includes(post.id))).toHaveLength(1);
    const another = await series.create({ title: 'Synthetic other series' }, user);
    await expect(series.setItems(another.id, [first.id], user)).rejects.toThrow();
    await runner.query('UPDATE posts SET moderation_hidden=true WHERE id=$1', [first.id]);
    expect((await series.detail(story.id)).posts.map((item: { id: string }) => item.id)).toEqual([second.id]);
    await series.setItems(story.id, [hidden.id, first.id], user);
    expect((await posts.findMine(owner, { kind: 'standalone', search: 'human chapter' })).data.map(post => post.id)).toContain(second.id);
  });
});
