import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { CategoriesService } from './categories.service.js';
import { Category } from './entities/category.entity.js';
import { PostsService } from '../posts/posts.service.js';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockCategoryRepository: any;
  let mockPostsService: any;

  beforeEach(async () => {
    mockCategoryRepository = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn((dto) => dto),
      save: vi.fn((cat) => Promise.resolve({ id: 'uuid-1', ...cat })),
      softRemove: vi.fn((cat) => Promise.resolve(cat)),
      createQueryBuilder: vi.fn(),
    };

    mockPostsService = {
      findAll: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoryRepository,
        },
        {
          provide: PostsService,
          useValue: mockPostsService,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('deve criar uma nova categoria com slug gerado automaticamente', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      const result = await service.create(
        {
          name: 'Tecnologia & Inovação',
          description: 'Artigos sobre tech',
        },
        'admin-uuid-1',
      );

      expect(mockCategoryRepository.create).toHaveBeenCalledWith({
        name: 'Tecnologia & Inovação',
        description: 'Artigos sobre tech',
        slug: 'tecnologia-inovacao',
        isActive: true,
        creatorId: 'admin-uuid-1',
      });
      expect(result).toHaveProperty('id', 'uuid-1');
      expect(result.slug).toBe('tecnologia-inovacao');
    });

    it('deve reativar categoria automaticamente se já existir com o mesmo nome mas estiver inativa', async () => {
      const inactiveCategory = {
        id: 'old-id',
        name: 'Tecnologia',
        slug: 'tecnologia',
        isActive: false,
        deletedAt: new Date(),
        creatorId: null,
        description: 'Antiga descrição',
      };
      mockCategoryRepository.findOne.mockResolvedValueOnce(inactiveCategory);

      await service.create(
        { name: 'Tecnologia', description: 'Nova descrição' },
        'admin-new-id',
      );

      expect(inactiveCategory.isActive).toBe(true);
      expect(inactiveCategory.deletedAt).toBeNull();
      expect(inactiveCategory.description).toBe('Nova descrição');
      expect(inactiveCategory.creatorId).toBe('admin-new-id');
      expect(mockCategoryRepository.save).toHaveBeenCalledWith(
        inactiveCategory,
      );
    });

    it('deve lançar ConflictException se já existir categoria ativa com o mesmo nome', async () => {
      mockCategoryRepository.findOne.mockResolvedValueOnce({
        id: 'existing-id',
        name: 'Tecnologia',
        isActive: true,
      });

      await expect(service.create({ name: 'Tecnologia' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve lançar ConflictException se já existir categoria ativa com o mesmo slug', async () => {
      mockCategoryRepository.findOne
        .mockResolvedValueOnce(null) // name check passes
        .mockResolvedValueOnce({
          id: 'other-id',
          slug: 'tecnologia',
          isActive: true,
        }); // slug check fails

      await expect(service.create({ name: 'Tecnologia' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll e autocomplete', () => {
    it('deve listar categorias paginadas sem busca', async () => {
      const qb: any = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getManyAndCount: vi
          .fn()
          .mockResolvedValue([
            [{ id: '1', name: 'Notícias', slug: 'noticias' }],
            1,
          ]),
      };
      mockCategoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(qb.where).toHaveBeenCalledWith('category.isActive = :isActive', {
        isActive: true,
      });
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve aplicar filtro ILIKE para autocomplete quando search for informado', async () => {
      const qb: any = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getManyAndCount: vi
          .fn()
          .mockResolvedValue([
            [{ id: '1', name: 'Notícias', slug: 'noticias' }],
            1,
          ]),
      };
      mockCategoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({ search: 'notic' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(category.name ILIKE :term OR category.slug ILIKE :term)',
        { term: '%notic%' },
      );
      expect(result.data[0].name).toBe('Notícias');
    });
  });

  describe('findByIdOrSlug', () => {
    it('deve buscar por UUID quando um UUID v4 for informado', async () => {
      const uuid = 'b1a7d654-2a6c-4876-b9b6-79cf021516e8';
      const category = { id: uuid, name: 'Ciência', slug: 'ciencia' };
      mockCategoryRepository.findOne.mockResolvedValue(category);

      const result = await service.findByIdOrSlug(uuid);

      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: uuid, isActive: true },
      });
      expect(result).toEqual(category);
    });

    it('deve buscar por slug quando o parâmetro não for um UUID', async () => {
      const slug = 'ciencia';
      const category = { id: 'uuid-1', name: 'Ciência', slug };
      mockCategoryRepository.findOne.mockResolvedValue(category);

      const result = await service.findByIdOrSlug(slug);

      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({
        where: { slug, isActive: true },
      });
      expect(result).toEqual(category);
    });

    it('deve lançar NotFoundException se a categoria não existir', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.findByIdOrSlug('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findPostsByCategory', () => {
    it('deve buscar a categoria e delegar a busca para postsService.findAll', async () => {
      const category = { id: 'uuid-cat', name: 'Tech', slug: 'tech' };
      mockCategoryRepository.findOne.mockResolvedValue(category);
      mockPostsService.findAll.mockResolvedValue({ data: [], meta: {} });

      await service.findPostsByCategory('tech', { page: 1, limit: 10 });

      expect(mockPostsService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        categoryId: 'uuid-cat',
      });
    });
  });

  describe('update', () => {
    it('deve atualizar categoria e regenerar o slug se o nome mudar', async () => {
      const existing = {
        id: 'cat-1',
        name: 'Antigo',
        slug: 'antigo',
        isActive: true,
      };
      mockCategoryRepository.findOne
        .mockResolvedValueOnce(existing) // find by id
        .mockResolvedValueOnce(null) // check new name
        .mockResolvedValueOnce(null); // check new slug

      await service.update('cat-1', { name: 'Novo Nome' });

      expect(existing.name).toBe('Novo Nome');
      expect(existing.slug).toBe('novo-nome');
      expect(mockCategoryRepository.save).toHaveBeenCalledWith(existing);
    });

    it('deve lançar NotFoundException se a categoria a ser editada não existir', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('inexistente', { name: 'Nome' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deve realizar soft delete desativando a categoria', async () => {
      const category = {
        id: 'cat-1',
        name: 'Tech',
        slug: 'tech',
        isActive: true,
      };
      mockCategoryRepository.findOne.mockResolvedValue(category);

      await service.remove('cat-1');

      expect(category.isActive).toBe(false);
      expect(mockCategoryRepository.save).toHaveBeenCalledWith(category);
      expect(mockCategoryRepository.softRemove).toHaveBeenCalledWith(category);
    });
  });
});
