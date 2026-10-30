import 'dotenv/config';
import { DataSource } from 'typeorm';

import { User } from '../modules/users/entities/user.entity.js';
import { Post } from '../modules/posts/entities/post.entity.js';
import { Category } from '../modules/categories/entities/category.entity.js';
import { Tag } from '../modules/tags/entities/tag.entity.js';
import { Comment } from '../modules/comments/entities/comment.entity.js';
import { PostInteraction } from '../modules/posts/entities/post-interaction.entity.js';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'blog_db',
  entities: [User, Post, Category, Tag, Comment, PostInteraction],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
