import { Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: any,
    status?: any,
  ): TUser {
    if (err || !user) {
      const req = context.switchToHttp().getRequest();
      const reason = err?.message ?? info?.message ?? 'token ausente ou inválido';
      this.logger.warn(
        `401 em ${req.method} ${req.originalUrl}: ${reason}`,
      );
    }
    return super.handleRequest(err, user, info, context, status);
  }
}
