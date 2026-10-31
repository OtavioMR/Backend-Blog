import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user.enum.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';

describe('PostsController', () => {
  let controller: PostsController;
  let mockPostsService: any;

  beforeEach(async () => {
    mockPostsService = {
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        {
          provide: PostsService,
          useValue: mockPostsService,
        },
      ],
    }).compile();

    controller = module.get<PostsController>(PostsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('deve possuir os guards JwtAuthGuard e RolesGuard configurados', () => {
      const guards = Reflect.getMetadata('__guards__', PostsController.prototype.create);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });

    it('deve possuir a metadata de roles restrita a AUTHOR e ADMIN', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, PostsController.prototype.create);
      expect(roles).toBeDefined();
      expect(roles).toEqual([UserRole.AUTHOR, UserRole.ADMIN]);
    });

    it('deve chamar postsService.create com o DTO e o userId do autor', async () => {
      const dto: CreatePostDto = {
        title: 'Como estruturar NestJS',
        content: 'Conteúdo detalhado do artigo...',
        published: true,
      };
      const req: any = {
        user: {
          userId: 'author-uuid-123',
          email: 'author@blog.com',
          role: UserRole.AUTHOR,
        },
      };

      const createdPost = {
        id: 'post-uuid-1',
        title: dto.title,
        content: dto.content,
        published: dto.published,
        authorId: 'author-uuid-123',
      };
      mockPostsService.create.mockResolvedValue(createdPost);

      const result = await controller.create(dto, req);

      expect(mockPostsService.create).toHaveBeenCalledWith(dto, 'author-uuid-123');
      expect(result).toEqual(createdPost);
    });
  });

  describe('findAll', () => {
    it('deve delegar a busca para postsService.findAll', async () => {
      const query = { page: 1, limit: 10, search: 'nest' };
      mockPostsService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(query);

      expect(mockPostsService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findById', () => {
    it('deve chamar postsService.findById', async () => {
      const post = { id: 'post-1', title: 'Post 1' };
      mockPostsService.findById.mockResolvedValue(post);

      const result = await controller.findById('post-1');

      expect(mockPostsService.findById).toHaveBeenCalledWith('post-1');
      expect(result).toEqual(post);
    });
  });

  describe('update', () => {
    it('deve chamar postsService.update passando user autenticado', async () => {
      const dto: UpdatePostDto = { title: 'Título atualizado' };
      const req: any = { user: { userId: 'author-123', role: UserRole.AUTHOR } };
      mockPostsService.update.mockResolvedValue({ id: 'post-1', title: 'Título atualizado' });

      await controller.update('post-1', dto, req);

      expect(mockPostsService.update).toHaveBeenCalledWith('post-1', dto, req.user);
    });
  });

  describe('remove', () => {
    it('deve chamar postsService.remove passando user autenticado', async () => {
      const req: any = { user: { userId: 'author-123', role: UserRole.AUTHOR } };
      mockPostsService.remove.mockResolvedValue(undefined);

      await controller.remove('post-1', req);

      expect(mockPostsService.remove).toHaveBeenCalledWith('post-1', req.user);
    });
  });
});
