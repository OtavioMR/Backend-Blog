import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { setupSwagger } from './docs/index.js';
import { httpLogger } from './common/middleware/http-logger.middleware.js';
import { configureDateSerialization } from './common/utils/date-serializer.js';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

async function bootstrap() {
  // Configura serialização de datas com o fuso horário local explícito (ex.: -03:00)
  configureDateSerialization();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), 'uploads', 'profile-photos'), {
    prefix: '/uploads/profile-photos/',
    dotfiles: 'deny',
    index: false,
  });

  // Parsing de cookies para suporte a tokens HTTP-Only seguros
  app.use(cookieParser());

  // Log de todas as requisições (método, rota, status, duração)
  app.use(httpLogger);

  // Prefixo global para todas as rotas
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuração e inicialização da documentação OpenAPI / Swagger
  setupSwagger(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`A aplicação está rodando em: http://localhost:${port}/api/v1`);
  console.log(`Swagger docs running at: http://localhost:${port}/api/docs`);
}
await bootstrap();
