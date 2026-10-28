import { PartialType } from '@nestjs/mapped-types';
import { CreateCommentDto } from './create-comment.dto.js';

export class UpdateCommentDto extends PartialType(CreateCommentDto) {}
