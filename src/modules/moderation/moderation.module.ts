import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { AdminCommentsController } from './admin-comments.controller.js';
import { AdminTagsController } from './admin-tags.controller.js';
import { AdminPostsController } from './admin-posts.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { ModerationAppealsController } from './moderation-appeals.controller.js';
@Module({ imports: [AuthModule], controllers: [ModerationController, AdminCommentsController, AdminTagsController, AdminPostsController, AdminCategoriesController, ModerationAppealsController], providers: [ModerationService] })
export class ModerationModule {}

