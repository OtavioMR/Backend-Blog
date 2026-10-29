import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity.js';
import { Post } from '../posts/entities/post.entity.js';
import { CommentsService } from './comments.service.js';
import {
  CommentsController,
  PostCommentsController,
} from './comments.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Post])],
  controllers: [CommentsController, PostCommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
