import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PostsService } from './posts.service.js';
import { PostsController } from './posts.controller.js';
import { Post } from './entities/post.entity.js';
import { Category } from '../categories/entities/category.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Category])],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService, TypeOrmModule],
})
export class PostsModule {}
