import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { catchError, finalize, throwError } from 'rxjs';
import type { Request } from 'express';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const span = trace.getTracer('backend-blog').startSpan(`${request.method} ${context.getClass().name}.${context.getHandler().name}`);
    return next.handle().pipe(catchError((error: unknown) => {
      span.setStatus({ code: SpanStatusCode.ERROR });
      return throwError(() => error);
    }), finalize(() => span.end()));
  }
}
