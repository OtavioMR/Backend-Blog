import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity.js';
import { Post } from '../posts/entities/post.entity.js';
import { CommentsService } from './comments.service.js';
import { CommentLikesController } from './comment-likes.controller.js';
import { CommentLikesService } from './comment-likes.service.js';
import {
  CommentsController,
  PostCommentsController,
} from './comments.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Post])],
  controllers: [CommentsController, PostCommentsController, CommentLikesController],
  providers: [CommentsService, CommentLikesService],
})
export class CommentsModule {}
