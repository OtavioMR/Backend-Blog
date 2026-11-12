import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { PostsService } from './posts.service.js';
import { Post } from './entities/post.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { TagsService } from '../tags/tags.service.js';
import { UserRole } from '../users/enums/user.enum.js';
import { validate } from 'class-validator';
import { CreatePostDto } from './dto/create-post.dto.js';

describe('PostsService', () => {
  let service: PostsService;
  let mockPostsRepository: any;
  let mockCategoriesRepository: any;
  let mockTagsService: any;

  beforeEach(async () => {
    mockPostsRepository = {
      find: vi.fn(),
      query: vi.fn().mockResolvedValue([]),
      findAndCount: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve({ id: 'post-1', ...data })),
      softRemove: vi.fn((data) => Promise.resolve(data)),
    };
    let searchOptions: unknown;
    const searchBuilder = {
      setFindOptions: vi.fn(options => { searchOptions = options; return searchBuilder; }),
      addSelect: vi.fn().mockReturnThis(), setParameter: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(), addOrderBy: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn(() => mockPostsRepository.findAndCount(searchOptions)),
    };
    mockPostsRepository.createQueryBuilder = vi.fn(() => searchBuilder);

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

  it('aceita descrição de 500 caracteres e rejeita 501', async () => {
    const dto = Object.assign(new CreatePostDto(), { title: 'Artigo', content: 'Conteúdo do artigo', excerpt: 'a'.repeat(200) });
    expect(await validate(dto)).toHaveLength(0);
    dto.excerpt += 'a';
    expect((await validate(dto)).some(error => error.property === 'excerpt')).toBe(true);
  });

  it('salva a descrição escolhida e a preserva ao alterar o conteúdo', async () => {
    const created = await service.create({ title: 'Artigo', content: 'Conteúdo do artigo', excerpt: '<b>Apresentação</b>' }, 'autor');
    expect(created.excerpt).toBe('Apresentação');
    mockPostsRepository.findOne.mockResolvedValue({ ...created, authorId: 'autor' });
    const user = { userId: 'autor', role: UserRole.AUTHOR } as any;
    const updated = await service.update(created.id, { content: 'Outro conteúdo do artigo' }, user);
    expect(updated.excerpt).toBe('Apresentação');
    const changed = await service.update(created.id, { excerpt: 'Nova descrição' }, user);
    expect(changed.excerpt).toBe('Nova descrição');
  });

  describe('findAll', () => {
    it('solicita nova tentativa se o artigo que define o cursor mudar durante a leitura', async () => {
      const publishedAt = new Date('2026-01-01T00:00:00Z');
      mockPostsRepository.find.mockResolvedValue([
        { id: 'one', title: 'One', publishedAt, categories: [], tags: [] },
        { id: 'two', title: 'Two', publishedAt, categories: [], tags: [] },
      ]);
      mockPostsRepository.query.mockResolvedValue([]);
      await expect(service.findAll({ cursor: 'start', limit: 1 })).rejects.toThrow('A lista mudou durante a consulta');
    });

    it('deve listar todos os artigos mesmo sem categoria associada', async () => {
      const postsFromDb = [
        { id: 'p1', title: 'Post sem categoria', categories: null },
        {
          id: 'p2',
          title: 'Post com categoria',
          categories: [{ id: 'c1', name: 'Tech', isActive: true }],
        },
      ];
      mockPostsRepository.findAndCount.mockResolvedValue([postsFromDb, 2]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(mockPostsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { published: true, isActive: true, moderationHidden: false },
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
            moderationHidden: false,
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
            moderationHidden: false,
            categories: { slug: 'tecnologia', isActive: true },
          },
        }),
      );
    });

    it('combina filtros por E, mantendo a busca por título ou conteúdo', async () => {
      mockPostsRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ search: ' Nest%_ ', author: ' José ', categoryId: 'id', categorySlug: 'ignorado', tagSlug: 'tag', page: 2, limit: 5 });
      const options = mockPostsRepository.findAndCount.mock.calls[0][0];
      expect(options.where).toMatchObject({ published: true, isActive: true, moderationHidden: false, categories: { id: 'id', isActive: true }, tags: { slug: 'tag' } });
      expect(options.where.author.name.objectLiteralParameters).toEqual({ authorTerm: '%José%' });
      expect(options.where.id.objectLiteralParameters).toEqual({ searchTerm: 'Nest%_', partialTerm: '%Nest\\%\\_%' });
      expect(options.skip).toBe(5);
      expect(options.take).toBe(5);
    });

    it('filtra por authorId', async () => {
      mockPostsRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ authorId: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' });
      expect(mockPostsRepository.findAndCount.mock.calls[0][0].where).toMatchObject({
        published: true,
        isActive: true,
        authorId: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
      });
    });

    it('ignora texto e autor vazios e retorna paginação vazia', async () => {
      mockPostsRepository.findAndCount.mockResolvedValue([[], 0]);
      const result = await service.findAll({ search: '  ', author: ' ' });
      expect(mockPostsRepository.findAndCount.mock.calls[0][0].where).toEqual({ published: true, isActive: true, moderationHidden: false });
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('combina nome de categoria com autor', async () => {
      mockPostsRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ categoryName: ' Educação ', author: 'Maria' });
      const where = mockPostsRepository.findAndCount.mock.calls[0][0].where;
      expect(where.categories.name.objectLiteralParameters).toEqual({ categoryNameTerm: '%Educação%' });
      expect(where.author.name.objectLiteralParameters).toEqual({ authorTerm: '%Maria%' });
    });

    it('ignora nome de categoria vazio', async () => {
      mockPostsRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ categoryName: '  ' });
      expect(mockPostsRepository.findAndCount.mock.calls[0][0].where).toEqual({ published: true, isActive: true, moderationHidden: false });
    });
  });

  it('lista apenas artigos ativos do próprio usuário, incluindo rascunhos', async () => {
    mockPostsRepository.findAndCount.mockResolvedValue([[{ id: 'p1', published: false }], 1]);
    const result = await service.findMine('author-1', { page: 2, limit: 5 });
    expect(mockPostsRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { authorId: 'author-1', isActive: true }, skip: 5, take: 5 }));
    expect(result.data[0].published).toBe(false);
  });

  it('restringe rascunhos ao autor e a administradores', async () => {
    mockPostsRepository.findOne.mockResolvedValue({ id: 'p1', authorId: 'author-1', published: false, categories: [], tags: [] });
    await expect(service.findById('p1')).rejects.toThrow(NotFoundException);
    await expect(service.findById('p1', { userId: 'other', role: UserRole.READER } as any)).rejects.toThrow(NotFoundException);
    await expect(service.findById('p1', { userId: 'author-1', role: UserRole.AUTHOR } as any)).resolves.toHaveProperty('id', 'p1');
    await expect(service.findById('p1', { userId: 'admin', role: UserRole.ADMIN } as any)).resolves.toHaveProperty('id', 'p1');
  });

  it('calcula leitura nas listagens sem expor o conteúdo', async () => {
    const content = `<p>${Array(200).fill('palavra').join(' ')}</p><p>outra</p>`;
    for (const list of ['findAll', 'findMine'] as const) {
      mockPostsRepository.findAndCount.mockResolvedValue([[{ title: 'Título', content, categories: [] }], 1]);
      const result = list === 'findAll' ? await service.findAll() : await service.findMine('autor', {});
      expect(result.data[0]).toHaveProperty('readingTimeMinutes', 2);
      expect(result.data[0]).not.toHaveProperty('content');
    }
  });

  it('estima seis minutos para um artigo com 1200 palavras', async () => {
    const content = Array(1200).fill('palavra').join(' ');
    const result = await service.create({ title: 'Artigo longo', content }, 'autor');
    expect(result).toHaveProperty('readingTimeMinutes', 6);
    mockPostsRepository.findAndCount.mockResolvedValue([[{ title: 'Artigo longo', content }], 1]);
    expect((await service.findAll()).data[0]).toHaveProperty('readingTimeMinutes', 6);
  });

  it('recalcula leitura ao criar, consultar e editar o conteúdo', async () => {
    const content = Array(201).fill('palavra').join(' ');
    const created = await service.create({ title: 'Título', content }, 'autor');
    expect(created).toHaveProperty('readingTimeMinutes', 2);
    mockPostsRepository.findOne.mockResolvedValue({ id: 'post-1', authorId: 'autor', title: 'Título', content, published: true, categories: [], tags: [] });
    expect(await service.findById('post-1')).toHaveProperty('readingTimeMinutes', 2);
    const updated = await service.update('post-1', { content: '<p>Texto curto</p>' }, { userId: 'autor', role: UserRole.AUTHOR } as any);
    expect(updated).toHaveProperty('readingTimeMinutes', 1);
  });

  it('consulta por UUID ou slug e protege rascunhos em ambos os casos', async () => {
    const id = 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22';
    mockPostsRepository.findOne.mockResolvedValue({ id, authorId: 'autor', published: false, title: 'Titulo', content: 'texto' });
    await expect(service.findById('titulo-' + id)).rejects.toThrow(NotFoundException);
    expect(mockPostsRepository.findOne.mock.calls.at(-1)[0].where).toEqual([{ slug: 'titulo-' + id, isActive: true }, { legacySlug: 'titulo-' + id, isActive: true }]);
    await service.findById(id, { userId: 'autor', role: UserRole.AUTHOR } as any);
    expect(mockPostsRepository.findOne.mock.calls.at(-1)[0].where).toEqual({ id, isActive: true });
  });

  it('gera slugs unicos para titulos iguais e preserva o slug ao editar', async () => {
    const first = await service.create({ title: 'Ol\u00e1, NestJS!', content: 'Conteudo' }, 'autor');
    mockPostsRepository.save.mockRejectedValueOnce({ driverError: { code: '23505', constraint: 'uq_posts_slug' } });
    const second = await service.create({ title: 'Ol\u00e1, NestJS!', content: 'Conteudo' }, 'autor');
    expect(first.slug).toBe('ola-nestjs');
    expect(second.slug).toBe('ola-nestjs-2');
    expect(second.slug).not.toBe(first.slug);
    mockPostsRepository.findOne.mockResolvedValue(first);
    const updated = await service.update(first.id, { title: 'Outro titulo' }, { userId: 'autor', role: UserRole.AUTHOR } as any);
    expect(updated.slug).toBe(first.slug);
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
      expect(result.slug).toBe('novo-post');
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
        {
          title: 'Novo Post',
          content: 'Conteúdo longo do artigo',
          tagNames: ['NestJS'],
        },
        'author-1',
      );

      expect(mockTagsService.resolveNames).toHaveBeenCalledWith(['NestJS']);
      expect(mockPostsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ tags }),
      );
    });
  });

  it('deve substituir as tags ao atualizar o artigo', async () => {
    const post = {
      id: 'post-1',
      authorId: 'author-1',
      isActive: true,
      tags: [],
    };
    mockPostsRepository.findOne.mockResolvedValue(post);
    const tags = [{ id: 'tag-1', name: 'NestJS', slug: 'nestjs' }];
    mockTagsService.resolveNames.mockResolvedValue(tags);

    await service.update('post-1', { tagNames: ['NestJS'] }, {
      userId: 'author-1',
      role: 'AUTHOR',
    } as any);

    expect(post.tags).toEqual(tags);
    expect(mockPostsRepository.save).toHaveBeenCalledWith(post);
  });

  describe('Proteção de conteúdo 18+ e Classificação Indicativa', () => {
    it('redige corpo, capa e prévia de artigo 18+ para visitante não autenticado', async () => {
      mockPostsRepository.findOne.mockResolvedValue({
        id: 'post-18',
        title: 'Conto Maduro',
        content: '<p>Cenas explícitas ou de terror psicológico.</p>',
        excerpt: 'Prévia detalhada de cenas fortes.',
        coverImage: '/uploads/covers/maduro.webp',
        contentRating: '18+',
        published: true,
        isActive: true,
        categories: [],
        tags: [],
      });

      const result = await service.findById('post-18', null);
      expect((result as any).isRestricted).toBe(true);
      expect(result.content).toBeNull();
      expect(result.coverImage).toBeNull();
      expect(result.excerpt).toContain('classificação indicativa 18+');
    });

    it('entrega conteúdo integral de artigo 18+ para autor ou adulto verificado', async () => {
      const fullPost = {
        id: 'post-18',
        authorId: 'adult-author',
        title: 'Conto Maduro',
        content: '<p>Cenas explícitas ou de terror psicológico.</p>',
        excerpt: 'Prévia detalhada.',
        coverImage: '/uploads/covers/maduro.webp',
        contentRating: '18+',
        published: true,
        isActive: true,
        categories: [],
        tags: [],
      };
      mockPostsRepository.findOne.mockResolvedValue(fullPost);

      const result = await service.findById('post-18', { userId: 'adult-author', role: UserRole.AUTHOR } as any);
      expect((result as any).isRestricted).toBe(false);
      expect(result.content).toContain('Cenas explícitas');
      expect(result.coverImage).toBe('/uploads/covers/maduro.webp');
    });

    it('redige capa e prévia de artigos 18+ na listagem pública (findAll)', async () => {
      mockPostsRepository.findAndCount.mockResolvedValue([
        [
          {
            id: 'post-regular',
            title: 'Artigo Livre',
            content: 'Texto comum',
            excerpt: 'Prévia normal',
            coverImage: '/uploads/covers/livre.webp',
            contentRating: 'LIVRE',
            published: true,
            isActive: true,
            categories: [],
            tags: [],
          },
          {
            id: 'post-adult',
            title: 'Conto Maduro',
            content: 'Texto adulto',
            excerpt: 'Prévia com conteúdo potencialmente sensível',
            coverImage: '/uploads/covers/adulto.webp',
            contentRating: '18+',
            published: true,
            isActive: true,
            categories: [],
            tags: [],
          },
        ],
        2,
      ]);

      const result = (await service.findAll({ page: 1, limit: 10 })) as any;
      expect(result.data).toHaveLength(2);

      const regular = result.data[0];
      expect(regular.isRestricted).toBe(false);
      expect(regular.coverImage).toBe('/uploads/covers/livre.webp');
      expect(regular.excerpt).toBe('Prévia normal');

      const adult = result.data[1];
      expect(adult.isRestricted).toBe(true);
      expect(adult.coverImage).toBeNull();
      expect(adult.excerpt).toContain('classificação indicativa 18+');
    });
  });
});

