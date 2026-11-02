import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { ReportStatus, ReportTarget } from './reports.entity.js';

describe('ReportsService', () => {
  let reports: any, posts: any, comments: any, service: ReportsService;
  beforeEach(() => {
    reports = { create: vi.fn(x => x), save: vi.fn(x => x), update: vi.fn(), exists: vi.fn(), findOneByOrFail: vi.fn(), findAndCount: vi.fn() };
    posts = { findOne: vi.fn() }; comments = { findOne: vi.fn() };
    const manager = { getRepository: () => reports };
    reports.manager = { transaction: (callback: any) => callback(manager) };
    service = new ReportsService(reports, posts, comments, { record: vi.fn() } as any);
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
  it('allows a pending report to be reviewed once', async () => {
    reports.update.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });
    reports.exists.mockResolvedValue(true); reports.findOneByOrFail.mockResolvedValue({ id: 'report', status: ReportStatus.RESOLVED });
    await expect(service.review('report', 'admin', { status: ReportStatus.RESOLVED })).resolves.toMatchObject({ status: ReportStatus.RESOLVED });
    expect(reports.update).toHaveBeenCalledWith({ id: 'report', status: ReportStatus.PENDING }, expect.objectContaining({ moderatorId: 'admin' }));
    await expect(service.review('report', 'admin', { status: ReportStatus.DISMISSED })).rejects.toThrow(ConflictException);
  });
});
