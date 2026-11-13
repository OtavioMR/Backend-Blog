import 'dotenv/config';
import { DataSource } from 'typeorm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { User } from '../modules/users/entities/user.entity.js';
import { Post } from '../modules/posts/entities/post.entity.js';
import { Category } from '../modules/categories/entities/category.entity.js';
import { Tag } from '../modules/tags/entities/tag.entity.js';
import { Comment } from '../modules/comments/entities/comment.entity.js';
import { PostInteraction } from '../modules/posts/entities/post-interaction.entity.js';
import { AuthSession } from '../modules/auth/entities/session.entity.js';
import { AuthRefreshOperation } from '../modules/auth/entities/refresh-operation.entity.js';
import { UserRecoveryCode } from '../modules/auth/entities/recovery-code.entity.js';

import { AccountDeletionRequest } from '../modules/users/entities/account-deletion-request.entity.js';
import { ModerationAppeal } from '../modules/moderation/entities/moderation-appeal.entity.js';
import { LegalDocument, UserLegalAcceptance } from '../modules/users/entities/legal-acceptance.entity.js';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'blog_db',
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: true,
    ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') } : {}),
  } : false,
  entities: [
    User,
    Post,
    Category,
    Tag,
    Comment,
    PostInteraction,
    AuthSession,
    AuthRefreshOperation,
    UserRecoveryCode,
    AccountDeletionRequest,
    ModerationAppeal,
    LegalDocument,
    UserLegalAcceptance,
  ],
  migrations: [join(dirname(fileURLToPath(import.meta.url)), 'migrations', '*.{js,ts}')],
  // Commit enum additions before a later migration uses the new PostgreSQL value.
  migrationsTransactionMode: 'each',
  synchronize: false,
});
