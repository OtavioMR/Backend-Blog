import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const dbError = exception as { driverError?: { code?: string; message?: string } };
    if (dbError?.driverError?.code === '23514' && ['First post requires approval', 'Post awaiting review cannot be edited'].includes(dbError.driverError.message ?? '')) {
      response.status(HttpStatus.CONFLICT).json({ statusCode: HttpStatus.CONFLICT, message: dbError.driverError.message === 'First post requires approval' ? 'O primeiro artigo exige aprovação.' : 'Artigo em revisão não pode ser alterado.' });
      return;
    }
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) this.logger.error('Unhandled server error', exception instanceof Error ? exception.stack : undefined);
    const body = status >= 500 ? { statusCode: status, message: 'Internal server error' } : exception instanceof HttpException ? exception.getResponse() : { statusCode: status, message: 'Internal server error' };
    response.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }
}
