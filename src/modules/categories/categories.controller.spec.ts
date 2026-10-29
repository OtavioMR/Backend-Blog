import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let mockCategoriesService: any;

  beforeEach(async () => {
    mockCategoriesService = {
      findAll: vi.fn(),
      findByIdOrSlug: vi.fn(),
      findPostsByCategory: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll deve chamar service.findAll com query', async () => {
    mockCategoriesService.findAll.mockResolvedValue({ data: [], meta: {} });
    const query = { page: 1, limit: 10, search: 'notic' };

    await controller.findAll(query);

    expect(mockCategoriesService.findAll).toHaveBeenCalledWith(query);
  });

  it('findOne deve chamar service.findByIdOrSlug', async () => {
    const category = { id: 'uuid-1', name: 'Tech', slug: 'tech' };
    mockCategoriesService.findByIdOrSlug.mockResolvedValue(category);

    const result = await controller.findOne('tech');

    expect(mockCategoriesService.findByIdOrSlug).toHaveBeenCalledWith('tech');
    expect(result).toEqual(category);
  });

  it('findPostsByCategory deve chamar service.findPostsByCategory', async () => {
    mockCategoriesService.findPostsByCategory.mockResolvedValue({
      data: [],
      meta: {},
    });

    await controller.findPostsByCategory('tech', { page: 1, limit: 5 });

    expect(mockCategoriesService.findPostsByCategory).toHaveBeenCalledWith(
      'tech',
      { page: 1, limit: 5 },
    );
  });

  it('create deve chamar service.create passando dados e ID do criador', async () => {
    const dto = { name: 'Notícias' };
    const req: any = { user: { userId: 'admin-123' } };
    mockCategoriesService.create.mockResolvedValue({
      id: 'uuid-1',
      ...dto,
      creatorId: 'admin-123',
    });

    const result = await controller.create(dto, req);

    expect(mockCategoriesService.create).toHaveBeenCalledWith(dto, 'admin-123');
    expect(result).toHaveProperty('id', 'uuid-1');
  });

  it('update deve chamar service.update', async () => {
    const dto = { name: 'Atualizado' };
    mockCategoriesService.update.mockResolvedValue({ id: 'uuid-1', ...dto });

    const result = await controller.update('uuid-1', dto);

    expect(mockCategoriesService.update).toHaveBeenCalledWith('uuid-1', dto);
    expect(result.name).toBe('Atualizado');
  });

  it('remove deve chamar service.remove', async () => {
    mockCategoriesService.remove.mockResolvedValue(undefined);

    await controller.remove('uuid-1');

    expect(mockCategoriesService.remove).toHaveBeenCalledWith('uuid-1');
  });
});
