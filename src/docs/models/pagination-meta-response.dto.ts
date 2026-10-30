import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaResponseDto {
  @ApiProperty({
    description: 'Página atual retornada',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Limite de registros por página',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total de itens encontrados',
    example: 42,
  })
  total: number;

  @ApiProperty({
    description: 'Total de páginas disponíveis',
    example: 5,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Indica se existe uma próxima página',
    example: true,
  })
  hasNextPage: boolean;

  @ApiProperty({
    description: 'Indica se existe uma página anterior',
    example: false,
  })
  hasPreviousPage: boolean;
}
