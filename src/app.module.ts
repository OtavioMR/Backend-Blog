import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RateLimitModule,
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
    UsersModule,
    AuthModule,
    PostsModule,
    CategoriesModule,
    TagsModule,
    CommentsModule,
    MailModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
