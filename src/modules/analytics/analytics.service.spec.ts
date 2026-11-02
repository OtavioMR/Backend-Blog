import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsService', () => {
  it('returns aggregated counts for each domain', async () => {
    const dataSource: any = { query: vi.fn().mockResolvedValueOnce([{ total: 5, active: 4, verified: 3 }]).mockResolvedValueOnce([{ total: 2, published: 1, drafts: 1 }]).mockResolvedValueOnce([{ total: 7, active: 6 }]).mockResolvedValueOnce([{ total: 3, pending: 1 }]) };
    const result = await new AnalyticsService(dataSource).overview();
    expect(result).toMatchObject({ users: { total: 5, active: 4 }, posts: { published: 1 }, comments: { active: 6 }, reports: { pending: 1 } });
    expect(result.generatedAt).toBeTruthy();
  });
});
