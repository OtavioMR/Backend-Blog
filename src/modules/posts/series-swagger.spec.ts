import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { PostSeriesController, PostSeriesNavigationController } from './post-series.controller.js';
import { PostSeriesService } from './post-series.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

describe('series OpenAPI contracts', () => {
  it('documents existing and extended routes, creation-only membership and concurrency tokens', async () => {
    const module = await Test.createTestingModule({
      controllers: [PostSeriesController, PostSeriesNavigationController, PostsController],
      providers: [{ provide: PostSeriesService, useValue: {} }, { provide: PostsService, useValue: {} }],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    try {
      await app.init();
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT-auth').build());
      expect(document.paths['/api/v1/series']?.get).toBeDefined();
      expect(document.paths['/api/v1/series/{id}/cover-image']?.post?.requestBody).toBeDefined();
      expect(document.paths['/api/v1/series/{id}/items']?.put).toBeDefined();
      const schemas = document.components?.schemas;
      expect(schemas?.CreatePostDto).toHaveProperty('properties.seriesId');
      expect(schemas?.UpdatePostDto).not.toHaveProperty('properties.seriesId');
      expect(schemas?.SeriesItemsDto).toHaveProperty('properties.expectedUpdatedAt');
      expect(schemas?.SeriesResponse).toHaveProperty('properties.coverImage');
      expect(schemas?.SeriesResponse).toHaveProperty('properties.aiTextCount');
      const filters = document.paths['/api/v1/posts/me']?.get?.parameters?.map(parameter => 'name' in parameter ? parameter.name : '');
      expect(filters).toEqual(expect.arrayContaining(['search', 'status', 'kind', 'page', 'limit']));
    } finally { await app.close(); }
  });
});
