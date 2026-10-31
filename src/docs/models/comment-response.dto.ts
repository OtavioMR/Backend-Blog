import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaResponseDto } from './pagination-meta-response.dto.js';

export class CommentAuthorResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Ana' }) name: string;
  @ApiProperty({ type: String, nullable: true, example: '/uploads/profile-photos/foto.webp' }) profilePhoto: string | null;
}

export class ReplyToAuthorResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Ana' }) name: string;
}

export class CommentResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) postId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) rootId: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) replyToId: string | null;
  @ApiProperty({ type: () => ReplyToAuthorResponseDto, nullable: true }) replyToAuthor: ReplyToAuthorResponseDto | null;
  @ApiProperty({ type: () => CommentAuthorResponseDto }) author: CommentAuthorResponseDto;
  @ApiProperty({ example: 'Gostei do post!' }) content: string;
  @ApiProperty({ example: true }) isActive: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) editedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class PaginatedRepliesResponseDto {
  @ApiProperty({ type: () => [CommentResponseDto] }) data: CommentResponseDto[];
  @ApiProperty({ type: () => PaginationMetaResponseDto }) meta: PaginationMetaResponseDto;
}

export class RootCommentResponseDto extends CommentResponseDto {
  @ApiProperty({ type: () => PaginatedRepliesResponseDto }) replies: PaginatedRepliesResponseDto;
}

export class PaginatedCommentsResponseDto {
  @ApiProperty({ type: () => [RootCommentResponseDto] }) data: RootCommentResponseDto[];
  @ApiProperty({ type: () => PaginationMetaResponseDto }) meta: PaginationMetaResponseDto;
}
