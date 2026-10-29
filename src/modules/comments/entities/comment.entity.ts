import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Post } from '../../posts/entities/post.entity.js';

@Entity('comments')
@Index(['postId', 'rootId', 'createdAt', 'id'])
export class Comment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'post_id', type: 'uuid' }) postId: string;
  @ManyToOne(() => Post, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'post_id' })
  post: Post;
  @Column({ name: 'author_id', type: 'uuid' }) authorId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'author_id' })
  author: User;
  @Column({ name: 'root_id', type: 'uuid', nullable: true }) rootId:
    string | null;
  @ManyToOne(() => Comment, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'root_id' })
  root: Comment | null;
  @Column({ name: 'reply_to_id', type: 'uuid', nullable: true }) replyToId:
    string | null;
  @ManyToOne(() => Comment, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reply_to_id' })
  replyTo: Comment | null;
  @Column({ type: 'varchar', length: 1000 }) content: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
