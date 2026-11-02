import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';
import { FeedService } from './feed.service.js';

@ApiTags('Feeds')
@Controller()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get('feed/rss')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @ApiPublicRoute()
  @ApiOperation({ summary: 'Feed RSS público dos artigos mais recentes', description: 'Use esta URL em um leitor de RSS. Retorna em XML até 50 artigos ativos e publicados, do mais recente ao mais antigo, com título, link, resumo e data de publicação. Os links usam a URL do frontend configurada no servidor. Não requer autenticação.' })
  @ApiResponse({ status: 200, description: 'Feed RSS 2.0 em XML.', content: { 'application/rss+xml': { schema: { type: 'string', example: '<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title></channel></rss>' } } } })
  rss() { return this.feed.rss(); }

  @Get('feed.xml')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @ApiPublicRoute()
  @ApiOperation({ summary: 'Feed RSS público em feed.xml', description: 'Retorna o mesmo feed RSS 2.0 de /feed/rss com até 50 artigos publicados e ativos. Não requer autenticação.' })
  @ApiResponse({ status: 200, description: 'Feed RSS 2.0 em XML.', content: { 'application/rss+xml': { schema: { type: 'string', example: '<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title></channel></rss>' } } } })
  rssXml() { return this.feed.rss(); }

  @Get('feed/atom')
  @Header('Content-Type', 'application/atom+xml; charset=utf-8')
  @ApiPublicRoute()
  @ApiOperation({ summary: 'Feed Atom público dos artigos mais recentes', description: 'Use esta URL em um leitor compatível com Atom. Retorna em XML até 50 artigos ativos e publicados, do mais recente ao mais antigo, com título, link, resumo e datas de publicação e atualização. Os links usam a URL do frontend configurada no servidor. Não requer autenticação.' })
  @ApiResponse({ status: 200, description: 'Feed Atom em XML.', content: { 'application/atom+xml': { schema: { type: 'string', example: '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>' } } } })
  atom() { return this.feed.atom(); }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiPublicRoute()
  @ApiOperation({ summary: 'Sitemap público dos artigos', description: 'Informe esta URL a mecanismos de busca para descoberta dos artigos. Retorna XML com os links e a última atualização de todos os artigos ativos e publicados; rascunhos não são incluídos. Os links usam a URL do frontend configurada no servidor. Não requer autenticação.' })
  @ApiResponse({ status: 200, description: 'Sitemap XML.', content: { 'application/xml': { schema: { type: 'string', example: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>' } } } })
  sitemap() { return this.feed.sitemap(); }
}
