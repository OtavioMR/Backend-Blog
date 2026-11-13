import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { escapeHtml } from '../../common/utils/escape-html.js';
import { Post } from './entities/post.entity.js';
import { ContentRating } from './enums/post-governance.enum.js';

@Injectable()
export class FeedService {
  constructor(@InjectRepository(Post) private readonly posts: Repository<Post>, private readonly config: ConfigService) {}

  private get base() { return this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/+$/, ''); }
  private url(post: Post) { return `${this.base}/posts/${encodeURIComponent(post.slug)}`; }
  private async list(limit?: number) {
    const posts = await this.posts.find({
      where: {
        published: true,
        isActive: true,
      },
      order: { publishedAt: 'DESC', id: 'DESC' },
      ...(limit ? { take: limit } : {}),
      select: { slug: true, title: true, excerpt: true, contentRating: true, publishedAt: true, updatedAt: true },
    });
    return posts.filter(p => p.contentRating !== ContentRating.EIGHTEEN_PLUS);
  }
  async rss() {
    const posts = await this.list(50);
    const items = posts.map(p => `<item><title>${escapeHtml(p.title)}</title><link>${escapeHtml(this.url(p))}</link><guid>${escapeHtml(this.url(p))}</guid><description>${escapeHtml(p.excerpt)}</description><pubDate>${(p.publishedAt ?? p.updatedAt).toUTCString()}</pubDate></item>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Blog</title><link>${escapeHtml(this.base)}</link><description>Artigos recentes</description>${items}</channel></rss>`;
  }
  async atom() {
    const posts = await this.list(50);
    const entries = posts.map(p => `<entry><title>${escapeHtml(p.title)}</title><id>${escapeHtml(this.url(p))}</id><link href="${escapeHtml(this.url(p))}"/><updated>${p.updatedAt.toISOString()}</updated><published>${(p.publishedAt ?? p.updatedAt).toISOString()}</published><summary>${escapeHtml(p.excerpt)}</summary></entry>`).join('');
    const updated = posts.reduce((latest, p) => p.updatedAt > latest ? p.updatedAt : latest, new Date(0));
    return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><id>${escapeHtml(this.base)}</id><link href="${escapeHtml(this.base)}"/><updated>${updated.toISOString()}</updated>${entries}</feed>`;
  }
  async sitemap() {
    const posts = await this.list();
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${posts.map(p => `<url><loc>${escapeHtml(this.url(p))}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod></url>`).join('')}</urlset>`;
  }
}
