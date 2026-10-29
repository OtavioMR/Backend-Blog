import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { PostsService } from './posts.service.js';
import { Post } from './entities/post.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { TagsService } from '../tags/tags.service.js';

describe('PostsService', () => {
  let service: PostsService;
  let mockPostsRepository: any;
  let mockCategoriesRepository: any;
  let mockTagsService: any;

  beforeEach(async () => {
    mockPostsRepository = {
      findAndCount: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve({ id: 'post-1', ...data })),
      softRemove: vi.fn((data) => Promise.resolve(data)),
    };

    mockCategoriesRepository = {
      find: vi.fn(),
    };
    mockTagsService = {
      resolveNames: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        {
          provide: getRepositoryToken(Post),
          useValue: mockPostsRepository,
        },
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoriesRepository,
        },
        {
          provide: TagsService,
          useValue: mockTagsService,
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('deve listar todos os artigos mesmo sem categoria associada', async () => {
      const postsFromDb = [
        { id: 'p1', title: 'Post sem categoria', categories: null },
        { id: 'p2', title: 'Post com categoria', categories: [{ id: 'c1', name: 'Tech', isActive: true }] },
      ];
      mockPostsRepository.findAndCount.mockResolvedValue([postsFromDb, 2]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(mockPostsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { published: true, isActive: true },
        }),
      );
      expect(result.data).toHaveLength(2);
      expect(result.data[0].categories).toEqual([]);
      expect(result.data[1].categories).toHaveLength(1);
      expect(result.data[0].tags).toEqual([]);
    });

    it('deve aplicar filtro por categoryId quando informado', async () => {
      mockPostsRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        page: 1,
        limit: 10,
        categoryId: 'cat-uuid-1',
      });

      expect(mockPostsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            published: true,
            isActive: true,
            categories: { id: 'cat-uuid-1', isActive: true },
          },
        }),
      );
    });

    it('deve aplicar filtro por categorySlug se informado', async () => {
      mockPostsRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ categorySlug: 'tecnologia' });

      expect(mockPostsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            published: true,
            isActive: true,
            categories: { slug: 'tecnologia', isActive: true },
          },
        }),
      );
    });

    it('deve filtrar por tagSlug junto com a categoria', async () => {
      mockPostsRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ categorySlug: 'tecnologia', tagSlug: 'nestjs' });

      expect(mockPostsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            published: true,
            isActive: true,
            categories: { slug: 'tecnologia', isActive: true },
            tags: { slug: 'nestjs' },
          },
        }),
      );
    });
  });

  describe('create', () => {
    it('deve criar artigo associando categorias válidas', async () => {
      const cat = { id: 'cat-1', name: 'Tech', slug: 'tech', isActive: true };
      mockCategoriesRepository.find.mockResolvedValue([cat]);

      const result = await service.create(
        {
          title: 'Novo Post',
          content: 'Conteúdo do artigo longo com mais de dez caracteres',
          categoryIds: ['cat-1'],
        },
        'author-1',
      );

      expect(mockCategoriesRepository.find).toHaveBeenCalled();
      expect(mockPostsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Novo Post',
          categories: [cat],
        }),
      );
      expect(result).toHaveProperty('id', 'post-1');
    });

    it('deve lançar NotFoundException se alguma categoria informada não for encontrada', async () => {
      mockCategoriesRepository.find.mockResolvedValue([]);

      await expect(
        service.create(
          {
            title: 'Novo Post',
            content: 'Conteúdo do artigo longo com mais de dez caracteres',
            categoryIds: ['cat-inexistente'],
          },
          'author-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve associar tags informadas pelo autor', async () => {
      const tags = [{ id: 'tag-1', name: 'NestJS', slug: 'nestjs' }];
      mockTagsService.resolveNames.mockResolvedValue(tags);

      await service.create(
        { title: 'Novo Post', content: 'Conteúdo longo do artigo', tagNames: ['NestJS'] },
        'author-1',
      );

      expect(mockTagsService.resolveNames).toHaveBeenCalledWith(['NestJS']);
      expect(mockPostsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ tags }),
      );
    });
  });

  it('deve substituir as tags ao atualizar o artigo', async () => {
    const post = { id: 'post-1', authorId: 'author-1', isActive: true, tags: [] };
    mockPostsRepository.findOne.mockResolvedValue(post);
    const tags = [{ id: 'tag-1', name: 'NestJS', slug: 'nestjs' }];
    mockTagsService.resolveNames.mockResolvedValue(tags);

    await service.update('post-1', { tagNames: ['NestJS'] }, { userId: 'author-1', role: 'USER' } as any);

    expect(post.tags).toEqual(tags);
    expect(mockPostsRepository.save).toHaveBeenCalledWith(post);
  });
});
