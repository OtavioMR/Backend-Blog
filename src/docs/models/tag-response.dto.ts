import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaResponseDto } from './pagination-meta-response.dto.js';

export class TagResponseDto {
  @ApiProperty({ example: 'b1a7d654-2a6c-4876-b9b6-79cf021516e8' })
  id: string;

  @ApiProperty({ example: 'NestJS' })
  name: string;

  @ApiProperty({ example: 'nestjs' })
  slug: string;
}

export class PaginatedTagResponseDto {
  @ApiProperty({ type: () => [TagResponseDto] })
  data: TagResponseDto[];

  @ApiProperty({ type: () => PaginationMetaResponseDto })
  meta: PaginationMetaResponseDto;
}
