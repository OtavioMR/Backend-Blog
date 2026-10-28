import 'dotenv/config';
import { DataSource } from 'typeorm';

import { User } from '../modules/users/entities/user.entity.js';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'blog_db',
  entities: [User],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});