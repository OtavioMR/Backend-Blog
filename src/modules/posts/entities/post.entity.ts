import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Category } from '../../categories/entities/category.entity.js';
import { Tag } from '../../tags/entities/tag.entity.js';

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150, unique: true })
  slug: string;

  @Column({ name: 'legacy_slug', type: 'varchar', length: 150, nullable: true, unique: true, select: false })
  legacySlug: string | null;

  @Column({ length: 150 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  excerpt: string;

  @Column({ name: 'cover_image', type: 'varchar', nullable: true })
  coverImage: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ default: false })
  published: boolean;

  @Column({ name: 'review_status', type: 'varchar', length: 20, default: 'DRAFT' })
  reviewStatus: string;

  @Column({ name: 'review_note', type: 'varchar', length: 1000, nullable: true, select: false })
  reviewNote: string | null;

  @Column({ name: 'comments_enabled', default: true })
  commentsEnabled: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'moderation_hidden', default: false })
  moderationHidden: boolean;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @ManyToMany(() => Category, (category) => category.posts)
  @JoinTable({
    name: 'post_categories',
    joinColumn: { name: 'post_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  categories: Category[];

  @ManyToMany(() => Tag, (tag) => tag.posts)
  @JoinTable({
    name: 'post_tags',
    joinColumn: { name: 'post_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
