import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, Observable, of } from 'rxjs';
import { concatMap, dematerialize, materialize, mergeMap, map } from 'rxjs/operators';
import { PublicCacheService } from './public-cache.service.js';

@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: PublicCacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ method: string; originalUrl: string; path: string; headers: Record<string, string | undefined> }>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next.handle().pipe(materialize(), concatMap(notification =>
        notification.kind === 'C' ? of(notification) : from(this.cache.invalidate()).pipe(map(() => notification))), dematerialize());
    }
    if (req.method !== 'GET' || !['/api/v1/posts', '/api/v1/categories', '/api/v1/tags'].includes(req.path) || req.headers.authorization || req.headers.cookie) return next.handle();
    return from(this.cache.key(req.originalUrl)).pipe(mergeMap(key => {
      if (!key) return next.handle();
      return from(this.cache.read(key)).pipe(mergeMap(cached => {
        if (cached !== undefined) return of(cached);
        return next.handle().pipe(mergeMap(value => from(this.cache.write(key, value)).pipe(mergeMap(() => of(value)))));
      }));
    }));
  }
}
