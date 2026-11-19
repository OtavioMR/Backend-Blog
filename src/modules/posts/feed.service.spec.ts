import { describe, expect, it, vi } from 'vitest';
import { FeedService } from './feed.service.js';

describe('FeedService', () => {
  it('gera XML escapado e consulta somente publica??es ativas', async () => {
    const find = vi.fn().mockResolvedValue([{ slug: 'conto', title: 'A & B', excerpt: '<teste>', publishedAt: new Date('2025-01-01T00:00:00Z'), updatedAt: new Date('2025-01-02T00:00:00Z') }]);
    const service = new FeedService({ find } as never, { getOrThrow: () => 'https://blog.example' } as never);
    const rss = await service.rss();
    expect(rss).toContain('<description>Contos recentes</description>');
    expect(rss).toContain('<title>A &amp; B</title>');
    expect(await service.atom()).toContain('&lt;teste&gt;');
    expect(await service.sitemap()).toContain('https://blog.example/posts/conto');
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { published: true, isActive: true }, take: 50 }));
  });
});
