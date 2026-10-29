import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CategoriesService } from './categories.service.js';
import { CategoriesController } from './categories.controller.js';
import { Category } from './entities/category.entity.js';
import { Post } from '../posts/entities/post.entity.js';
import { PostsModule } from '../posts/posts.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Post]),
    PostsModule,
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService, TypeOrmModule],
})
export class CategoriesModule {}
