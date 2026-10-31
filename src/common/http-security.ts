import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

export function configureHttpSecurity(
  app: NestExpressApplication,
  frontendUrl: string,
): void {
  app.use(helmet());
  app.enableCors({ origin: [new URL(frontendUrl).origin], credentials: true });
  app.set('trust proxy', 1);
}
