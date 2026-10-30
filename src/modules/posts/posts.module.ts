import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PostsService } from './posts.service.js';
import { PostsController } from './posts.controller.js';
import { Post } from './entities/post.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { TagsModule } from '../tags/tags.module.js';
import { PostInteraction } from './entities/post-interaction.entity.js';
import { PostInteractionsService } from './post-interactions.service.js';
import { PostInteractionsController } from './post-interactions.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Category, PostInteraction]),
    TagsModule,
  ],
  controllers: [PostInteractionsController, PostsController],
  providers: [PostsService, PostInteractionsService],
  exports: [PostsService, TypeOrmModule],
})
export class PostsModule {}
