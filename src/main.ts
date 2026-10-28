import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    
  });

  // Prefixo global para todas as rotas
  app.setGlobalPrefix('api/v1');


 const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`A aplicação está rodando em: http://localhost:${port}/api/v1`);
}
await bootstrap();
