import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './common/health.controller.js';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { TracingInterceptor } from './common/tracing.interceptor.js';
import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateLimitModule } from './common/rate-limit.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { TagsModule } from './modules/tags/tags.module.js';
import { CommentsModule } from './modules/comments/comments.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
// Newsletter desabilitada para V1 (planejada para V2)
// import { NewsletterModule } from "./modules/newsletter/newsletter.module.js";
import { ModerationModule } from './modules/moderation/moderation.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { validate } from './config/env.validation.js';
import { PublicCacheModule } from './common/public-cache.module.js';
import { PublicCacheInterceptor } from './common/public-cache.interceptor.js';
import { StorageModule } from './common/storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate,
    }),
    ScheduleModule.forRoot(),
    RateLimitModule,
    TerminusModule,
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
        ssl: configService.get<boolean>('DB_SSL', false) ? {
          rejectUnauthorized: true,
          ...(configService.get<string>('DB_SSL_CA') ? { ca: configService.getOrThrow<string>('DB_SSL_CA').replace(/\\n/g, '\n') } : {}),
        } : false,
        autoLoadEntities: true,
        synchronize: false, // Mantido como false conforme planejado para usar migrations
      }),
    }),
    UsersModule,
    PublicCacheModule,
    AuthModule,
    PostsModule,
    CategoriesModule,
    TagsModule,
    CommentsModule,
    MailModule,
    NotificationsModule,
    // NewsletterModule, // Desabilitada para V1
    ReportsModule,
    AnalyticsModule,
    AuditModule,
    ModerationModule,
    StorageModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TracingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PublicCacheInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
  ],
})
export class AppModule {}
