import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { TestResourceModule } from './test-resource/test-resource.module.js';
import { TesteModule } from './teste/teste.module.js';
import { Teste3Module } from './teste3/teste3.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5433),
        username: configService.get<string>('DB_USER', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'blog_db'),
        autoLoadEntities: true,
        synchronize: false, // Mantido como false conforme planejado para usar migrations
      }),
    }),
    TestResourceModule,
    TesteModule,
    Teste3Module,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}