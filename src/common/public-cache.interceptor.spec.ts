import { ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PublicCacheInterceptor } from './public-cache.interceptor.js';
import { PublicCacheService } from './public-cache.service.js';

describe('PublicCacheInterceptor', () => {
  const context = (headers: Record<string, string> = {}, path = '/api/v1/posts') => ({
    getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ method: 'GET', path, originalUrl: `${path}?page=1`, headers }) }),
  }) as unknown as ExecutionContext;

  it('retorna dados públicos em cache e não executa a consulta', async () => {
    const cache = { key: vi.fn().mockResolvedValue('key'), read: vi.fn().mockResolvedValue({ data: ['cached'] }), write: vi.fn() };
    const next = { handle: vi.fn().mockReturnValue(of({ data: ['fresh'] })) };
    expect(await firstValueFrom(new PublicCacheInterceptor(cache as unknown as PublicCacheService).intercept(context(), next))).toEqual({ data: ['cached'] });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('não usa cache em requisições autenticadas ou em detalhes de artigos', async () => {
    const cache = { key: vi.fn(), read: vi.fn(), write: vi.fn() };
    const next = { handle: vi.fn().mockReturnValue(of('fresh')) };
    const interceptor = new PublicCacheInterceptor(cache as unknown as PublicCacheService);
    await firstValueFrom(interceptor.intercept(context({ authorization: 'Bearer token' }), next));
    await firstValueFrom(interceptor.intercept(context({}, '/api/v1/posts/private'), next));
    expect(cache.key).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalledTimes(2);
  });

  it('prossegue com a consulta quando a versão do cache não está disponível', async () => {
    const cache = { key: vi.fn().mockResolvedValue(null) };
    const next = { handle: vi.fn().mockReturnValue(of('fresh')) };
    expect(await firstValueFrom(new PublicCacheInterceptor(cache as unknown as PublicCacheService).intercept(context(), next))).toBe('fresh');
  });

  it('aguarda a invalidação antes de devolver o resultado de uma escrita', async () => {
    const events: string[] = [];
    const cache = { invalidate: vi.fn(async () => { await Promise.resolve(); events.push('invalidated'); }) };
    const ctx = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ method: 'PATCH' }) }) } as unknown as ExecutionContext;
    const value = await firstValueFrom(new PublicCacheInterceptor(cache as unknown as PublicCacheService).intercept(ctx, { handle: () => of('updated') }));
    events.push(String(value));
    expect(events).toEqual(['invalidated', 'updated']);
  });
});
