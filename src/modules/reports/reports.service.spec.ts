import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { User } from '../users/entities/user.entity.js';
import { ReportsService } from './reports.service.js';
import { ReportStatus, ReportTarget } from './reports.entity.js';

describe('ReportsService', () => {
  let reports: any, posts: any, comments: any, users: any, service: ReportsService;
  beforeEach(() => {
    reports = { create: vi.fn(x => x), save: vi.fn(x => x), update: vi.fn(), exists: vi.fn(), findOneByOrFail: vi.fn(), findAndCount: vi.fn() };
    posts = { findOne: vi.fn() }; comments = { findOne: vi.fn() }; users = { findOne: vi.fn() };
    const manager = { getRepository: () => reports };
    reports.manager = { transaction: (callback: any) => callback(manager) };
    service = new ReportsService(reports, posts, comments, { record: vi.fn() } as any, users);
  });
  it('creates a report only for available content', async () => {
    posts.findOne.mockResolvedValue({ id: 'post' });
    const result = await service.create('user', { target: ReportTarget.POST, targetId: 'post', reason: '  ofensivo  ' });
    expect(result).toMatchObject({ reporterId: 'user', postId: 'post', commentId: null, reason: 'ofensivo', status: ReportStatus.PENDING });
    expect(posts.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ published: true, isActive: true }) }));
  });
  it('rejects unavailable comments', async () => {
    comments.findOne.mockResolvedValue(null);
    await expect(service.create('user', { target: ReportTarget.COMMENT, targetId: 'comment', reason: 'ofensivo' })).rejects.toThrow(NotFoundException);
  });
  it('rejects duplicate pending reports', async () => {
    posts.findOne.mockResolvedValue({ id: 'post' }); reports.save.mockRejectedValue({ code: '23505' });
    await expect(service.create('user', { target: ReportTarget.POST, targetId: 'post', reason: 'ofensivo' })).rejects.toThrow(ConflictException);
  });
  it('impede que outro administrador assuma um caso já atribuído', async () => {
    const repository = { findOne: vi.fn().mockResolvedValue({ id: 'report', status: ReportStatus.IN_REVIEW, moderatorId: 'primeiro' }), update: vi.fn() };
    const audit = { record: vi.fn() };
    const manager = { getRepository: () => repository };
    const subject = new ReportsService({ manager: { transaction: (fn: any) => fn(manager) } } as any, posts, comments, audit as any, users);
    await expect(subject.assign('report', 'segundo', 'segundo')).rejects.toThrow(ConflictException);
    expect(repository.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(repository.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('não registra novamente uma análise já assumida pela mesma pessoa', async () => {
    const repository = { findOne: vi.fn().mockResolvedValue({ status: ReportStatus.IN_REVIEW, moderatorId: 'admin' }), update: vi.fn() };
    const audit = { record: vi.fn() };
    const manager = { getRepository: () => repository };
    const subject = new ReportsService({ manager: { transaction: (fn: any) => fn(manager) } } as any, posts, comments, audit as any, users);
    await expect(subject.assign('report', 'admin', 'admin')).resolves.toMatchObject({ moderatorId: 'admin' });
    expect(repository.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('só libera uma análise pelo responsável ou SUPER_ADMIN e audita a mudança', async () => {
    const repository = { findOne: vi.fn().mockResolvedValue({ status: ReportStatus.IN_REVIEW, moderatorId: 'dono' }), update: vi.fn() };
    const actors = { findOne: vi.fn().mockResolvedValue({ role: 'ADMIN' }) };
    const audit = { record: vi.fn() };
    const manager = { getRepository: (entity: unknown) => entity === User ? actors : repository };
    const subject = new ReportsService({ manager: { transaction: (fn: any) => fn(manager) } } as any, posts, comments, audit as any, users);
    await expect(subject.release('report', 'outro')).rejects.toThrow(ForbiddenException);
    expect(repository.update).not.toHaveBeenCalled();
    await expect(subject.release('report', 'dono')).resolves.toMatchObject({ status: ReportStatus.PENDING, moderatorId: null });
    expect(audit.record).toHaveBeenCalledWith(manager, 'dono', 'report.release', 'report', 'report', { previousModeratorId: 'dono' });
  });
  it('rejeita encaminhamento a conta sem permissão administrativa', async () => {
    const repository = { findOne: vi.fn().mockResolvedValue({ status: ReportStatus.IN_REVIEW, moderatorId: 'dono' }), update: vi.fn() };
    const actors = { findOne: vi.fn().mockResolvedValue({ role: 'READER', isActive: true }) };
    const manager = { getRepository: (entity: unknown) => entity === User ? actors : repository };
    const audit = { record: vi.fn() };
    const subject = new ReportsService({ manager: { transaction: (fn: any) => fn(manager) } } as any, posts, comments, audit as any, users);
    await expect(subject.assign('report', 'dono', 'leitor')).rejects.toThrow(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('allows a pending report to be reviewed once', async () => {
    reports.update.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });
    reports.exists.mockResolvedValue(true); reports.findOneByOrFail.mockResolvedValue({ id: 'report', status: ReportStatus.RESOLVED });
    await expect(service.review('report', 'admin', { status: ReportStatus.RESOLVED, note: 'Conteúdo analisado' })).resolves.toMatchObject({ status: ReportStatus.RESOLVED });
    expect(reports.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'report' }), expect.objectContaining({ moderatorId: 'admin' }));
    await expect(service.review('report', 'admin', { status: ReportStatus.DISMISSED, note: 'Denúncia improcedente' })).rejects.toThrow(ConflictException);
  });
  it('permite denunciar perfil ativo, mas não o próprio perfil', async () => {
    users.findOne.mockResolvedValue({ id: 'target' });
    await expect(service.create('reporter', { target: ReportTarget.USER, targetId: 'target', reason: 'assédio' })).resolves.toMatchObject({ userId: 'target' });
    await expect(service.create('target', { target: ReportTarget.USER, targetId: 'target', reason: 'assédio' })).rejects.toThrow();
  });
});
