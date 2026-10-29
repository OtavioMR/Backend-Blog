import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { PostsService } from './posts.service.js';
import { Post } from './entities/post.entity.js';
import { Category } from '../categories/entities/category.entity.js';

describe('PostsService', () => {
  let service: PostsService;
  let mockPostsRepository: any;
  let mockCategoriesRepository: any;

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
  });
});
