import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { vi } from 'vitest';
import { TagsService } from './tags.service.js';
import { Tag } from './entities/tag.entity.js';

describe('TagsService', () => {
  let service: TagsService;
  let repository: any;
  let insertBuilder: any;

  beforeEach(async () => {
    insertBuilder = {
      insert: vi.fn().mockReturnThis(),
      into: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      orIgnore: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({}),
    };
    repository = {
      createQueryBuilder: vi.fn().mockReturnValue(insertBuilder),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: getRepositoryToken(Tag), useValue: repository },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('normaliza e reutiliza tags com o mesmo slug', async () => {
    const tag = { id: 'tag-1', name: 'NestJS', slug: 'nestjs' };
    repository.find.mockResolvedValue([tag]);

    const result = await service.resolveNames([' NestJS ', 'nestjs']);

    expect(insertBuilder.values).toHaveBeenCalledWith([
      { name: 'NestJS', slug: 'nestjs' },
    ]);
    expect(result).toEqual([tag]);
  });

  it('rejeita nomes que não geram slug', async () => {
    await expect(service.resolveNames(['!!!'])).rejects.toThrow(
      'Nome de tag inválido.',
    );
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('retorna sugestões paginadas para um texto parcial', async () => {
    const tag = { id: 'tag-1', name: 'Notícias', slug: 'noticias' };
    const queryBuilder = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[tag], 1]),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll({
      search: ' noti ',
      page: 1,
      limit: 10,
    });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      expect.stringContaining('unaccent('),
      { term: '%noti%' },
    );
    expect(result).toEqual({
      data: [tag],
      meta: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });
});
