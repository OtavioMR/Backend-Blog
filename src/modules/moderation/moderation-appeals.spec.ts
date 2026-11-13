import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModerationService } from './moderation.service.js';
import { AppealStatus, AppealTargetType, ModerationAppeal } from './entities/moderation-appeal.entity.js';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Post } from '../posts/entities/post.entity.js';
import { Comment } from '../comments/entities/comment.entity.js';

describe('ModerationAppeals Workflow', () => {
  let service: ModerationService;
  let mockDataSource: any;
  let mockAuditService: any;
  let mockAppealsRepo: any;
  let mockPostsRepo: any;
  let mockCommentsRepo: any;

  beforeEach(() => {
    mockAppealsRepo = {
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      create: vi.fn(dto => dto),
      save: vi.fn(appeal => Promise.resolve({ id: 'appeal-uuid', protocol: 'GRIF-REC-TEST-1234', ...appeal })),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: vi.fn(() => ({
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
      })),
    };

    mockPostsRepo = {
      findOne: vi.fn(),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    mockCommentsRepo = {
      findOne: vi.fn(),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    mockDataSource = {
      getRepository: vi.fn((entity) => {
        if (entity === ModerationAppeal) return mockAppealsRepo;
        if (entity === Post) return mockPostsRepo;
        if (entity === Comment) return mockCommentsRepo;
        return mockAppealsRepo;
      }),
      transaction: vi.fn(async (cb) => {
        const manager = {
          getRepository: mockDataSource.getRepository,
          query: vi.fn().mockResolvedValue([]),
        };
        return cb(manager);
      }),
      query: vi.fn().mockResolvedValue([]),
    };

    mockAuditService = {
      record: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ data: [], meta: {} }),
    };

    service = new ModerationService(mockDataSource, mockAuditService);
  });

  describe('createAppeal', () => {
    it('cria recurso com protocolo GRIF-REC e prazo SLA de 15 dias para artigo ocultado', async () => {
      mockPostsRepo.findOne.mockResolvedValue({
        id: 'post-1',
        authorId: 'user-author',
        isActive: false,
        moderationHidden: true,
      });
      mockAppealsRepo.findOne.mockResolvedValue(null);

      const result = await service.createAppeal('user-author', {
        targetType: AppealTargetType.POST,
        targetId: 'post-1',
        reason: 'O artigo não viola as diretrizes da comunidade e trata de ficção.',
      });

      expect(result.protocol).toMatch(/^GRIF-REC-\d{8}-[A-F0-9]{6}$/);
      expect(result.status).toBe(AppealStatus.PENDING);
      expect(result.deadlineAt.getTime()).toBeGreaterThan(Date.now() + 14 * 24 * 60 * 60 * 1000);
      expect(mockAuditService.record).toHaveBeenCalled();
    });

    it('impede terceiros de recorrerem contra publicações alheias', async () => {
      mockPostsRepo.findOne.mockResolvedValue({
        id: 'post-1',
        authorId: 'original-author',
        isActive: false,
        moderationHidden: true,
      });

      await expect(
        service.createAppeal('other-user', {
          targetType: AppealTargetType.POST,
          targetId: 'post-1',
          reason: 'Tentando recorrer em nome de outro.',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('impede criação de recurso duplicado se já houver um pendente', async () => {
      mockPostsRepo.findOne.mockResolvedValue({
        id: 'post-1',
        authorId: 'user-author',
        isActive: false,
        moderationHidden: true,
      });
      mockAppealsRepo.findOne.mockResolvedValue({ id: 'existing-appeal' });

      await expect(
        service.createAppeal('user-author', {
          targetType: AppealTargetType.POST,
          targetId: 'post-1',
          reason: 'Recurso repetido.',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('assignAppeal & decideAppeal (Prevenção de conflito de interesse)', () => {
    it('impede o moderador que realizou a moderação original de avaliar o recurso', async () => {
      const appeal = {
        id: 'appeal-1',
        protocol: 'GRIF-REC-1',
        userId: 'user-author',
        targetType: AppealTargetType.POST,
        targetId: 'post-1',
        status: AppealStatus.PENDING,
      };
      mockAppealsRepo.findOne.mockResolvedValue(appeal);

      // Simula que o moderador 'mod-1' foi o autor da ação de ocultação original
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          getRepository: mockDataSource.getRepository,
          query: vi.fn().mockResolvedValue([{ actor_id: 'mod-1' }]),
        };
        return cb(manager);
      });

      await expect(
        service.assignAppeal('appeal-1', 'admin-supervisor', 'mod-1'),
      ).rejects.toThrow('Conflito de interesse');
    });

    it('restaura automaticamente o artigo quando o recurso é aceito', async () => {
      const appeal = {
        id: 'appeal-1',
        protocol: 'GRIF-REC-1',
        userId: 'user-author',
        targetType: AppealTargetType.POST,
        targetId: 'post-1',
        status: AppealStatus.PENDING,
      };
      mockAppealsRepo.findOne.mockResolvedValue(appeal);

      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          getRepository: mockDataSource.getRepository,
          query: vi.fn().mockResolvedValue([]), // no conflict
        };
        return cb(manager);
      });

      const decision = await service.decideAppeal('appeal-1', 'mod-2', AppealStatus.ACCEPTED, 'Revisão editorial procedente.');
      expect(decision.status).toBe(AppealStatus.ACCEPTED);
      expect(mockPostsRepo.update).toHaveBeenCalledWith('post-1', { isActive: true, moderationHidden: false });
    });

    it('permite recorrer contra alteração administrativa de classificação indicativa mesmo se artigo não estiver ocultado', async () => {
      mockPostsRepo.findOne.mockResolvedValue({
        id: 'post-1',
        authorId: 'user-author',
        isActive: true,
        moderationHidden: false,
        contentRating: '18+',
      });
      mockAppealsRepo.findOne.mockResolvedValue(null);
      mockDataSource.query = vi.fn().mockResolvedValue([{ id: 'audit-log-1' }]);

      const result = await service.createAppeal('user-author', {
        targetType: AppealTargetType.POST,
        targetId: 'post-1',
        reason: 'A alteração administrativa para 18+ foi inadequada, a obra é adequada para 14+.',
      });

      expect(result.protocol).toMatch(/^GRIF-REC-/);
      expect(result.status).toBe(AppealStatus.PENDING);
    });

    it('restaura a classificação indicativa anterior ao aceitar recurso contra alteração administrativa', async () => {
      const appeal = {
        id: 'appeal-rating',
        protocol: 'GRIF-REC-2',
        userId: 'user-author',
        targetType: AppealTargetType.POST,
        targetId: 'post-rating',
        status: AppealStatus.PENDING,
      };
      mockAppealsRepo.findOne.mockResolvedValue(appeal);
      mockPostsRepo.findOne.mockResolvedValue({
        id: 'post-rating',
        authorId: 'user-author',
        isActive: true,
        moderationHidden: false,
        contentRating: '18+',
      });

      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          getRepository: mockDataSource.getRepository,
          query: vi.fn((sql: string) => {
            if (sql.includes('actor_id = $2')) return Promise.resolve([]);
            if (sql.includes('post.rating_changed')) {
              return Promise.resolve([{ oldRating: '14+' }]);
            }
            return Promise.resolve([]);
          }),
        };
        return cb(manager);
      });

      const decision = await service.decideAppeal('appeal-rating', 'mod-3', AppealStatus.ACCEPTED, 'Classificação original restabelecida.');
      expect(decision.status).toBe(AppealStatus.ACCEPTED);
      expect(mockPostsRepo.update).toHaveBeenCalledWith('post-rating', {
        contentRating: '14+',
      });
    });
  });
});
