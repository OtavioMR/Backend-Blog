import { describe, expect, it, vi } from 'vitest';
import { PostSchedulerService } from './post-scheduler.service.js';
import { PostsService } from './posts.service.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('publicação agendada', () => {
  it('publica somente artigos ativos e vencidos em atualiza??o condicional', async () => {
    const execute = vi.fn().mockResolvedValue({ affected: 1 });
    const where = vi.fn().mockReturnValue({ execute });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const scheduler = new PostSchedulerService({ createQueryBuilder: () => ({ update }) } as never);
    await scheduler.publishDue();
    expect(where).toHaveBeenCalledWith(expect.stringContaining('scheduled_at <= CURRENT_TIMESTAMP AND published = false AND is_active = true AND deleted_at IS NULL'));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ published: true, scheduledAt: null }));
  });
  it('rejeita agendamentos passados, sem fuso ou em artigos publicados', async () => {
    const service = new PostsService({} as never, {} as never, {} as never);
    const dto = { title: 'Título', content: 'Conteúdo suficiente' };
    for (const scheduledAt of ['2000-01-01T00:00:00Z', '2030-01-01T00:00:00']) {
      await expect(service.create({ ...dto, scheduledAt }, 'a')).rejects.toThrow();
    }
    await expect(service.create({ ...dto, scheduledAt: '2099-01-01T00:00:00Z', published: true }, 'a')).rejects.toThrow();
  });
  it('cancela o agendamento ao publicar manualmente', async () => {
    const post = { id: 'a', authorId: 'a', published: false, scheduledAt: new Date('2099-01-01'), content: 'conteúdo' };
    const repo = { findOne: vi.fn().mockResolvedValue(post), save: vi.fn().mockImplementation(p => p) };
    const service = new PostsService(repo as never, {} as never, {} as never);
    await service.update('a', { published: true }, { userId: 'a', role: UserRole.AUTHOR, email: 'a@example.com' });
    expect(post.scheduledAt).toBeNull();
  });
});
