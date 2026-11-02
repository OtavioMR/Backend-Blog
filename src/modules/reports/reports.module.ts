import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../posts/entities/post.entity.js';
import { Comment } from '../comments/entities/comment.entity.js';
import { Report } from './reports.entity.js';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';

@Module({ imports: [TypeOrmModule.forFeature([Report, Post, Comment])], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
