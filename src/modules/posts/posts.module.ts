import { PostSeriesController, PostSeriesNavigationController } from './post-series.controller.js';
import { PostSeriesService } from './post-series.service.js';
import { PostRevisionsController } from './post-revisions.controller.js';
import { PostRevisionsService } from './post-revisions.service.js';
import { PostReviewController } from './post-review.controller.js';
import { PostReviewService } from './post-review.service.js';
import { PostSchedulerService } from './post-scheduler.service.js';
import { AuthorsController } from './authors.controller.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
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
import { PostViewsController } from './post-views.controller.js';
import { PostViewsService } from './post-views.service.js';
import { AuthorFollowsController } from './author-follows.controller.js';
import { AuthorFollowsService } from './author-follows.service.js';
import { SavedCollectionsController } from './saved-collections.controller.js';
import { SavedCollectionsService } from './saved-collections.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Category, PostInteraction]),
    TagsModule,
  ],
  controllers: [PostSeriesController, PostSeriesNavigationController, PostRevisionsController, PostReviewController, AuthorsController, FeedController, AuthorFollowsController, PostInteractionsController, PostViewsController, SavedCollectionsController, PostsController],
  providers: [PostSeriesService, PostRevisionsService, PostReviewService, PostsService, PostInteractionsService, FeedService, PostSchedulerService, PostViewsService, AuthorFollowsService, SavedCollectionsService],
  exports: [PostsService, TypeOrmModule],
})
export class PostsModule {}
