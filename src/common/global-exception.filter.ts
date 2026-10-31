import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) this.logger.error('Unhandled server error', exception instanceof Error ? exception.stack : undefined);
    const body = status >= 500 ? { statusCode: status, message: 'Internal server error' } : exception instanceof HttpException ? exception.getResponse() : { statusCode: status, message: 'Internal server error' };
    response.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }
}
