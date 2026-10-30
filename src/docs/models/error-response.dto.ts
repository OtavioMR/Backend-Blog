import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({
    description: 'Código de status HTTP',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Mensagem descritiva do erro ocorrido',
    oneOf: [
      { type: 'string', example: 'Requisição inválida.' },
      {
        type: 'array',
        items: { type: 'string' },
        example: ['email must be an email'],
      },
    ],
  })
  message: string | string[];

  @ApiProperty({
    description: 'Nome padrão do status HTTP de erro',
    example: 'Bad Request',
  })
  error?: string;
}

export class BadRequestResponseDto {
  @ApiProperty({ example: 400, description: 'Código de status HTTP 400' })
  statusCode: number;

  @ApiProperty({
    example: [
      'email must be an email',
      'password must be longer than or equal to 8 characters',
    ],
    description: 'Lista descritiva ou texto do erro de validação',
  })
  message: string[];

  @ApiProperty({ example: 'Bad Request', description: 'Categoria do erro' })
  error: string;
}

export class UnauthorizedResponseDto {
  @ApiProperty({ example: 401, description: 'Código de status HTTP 401' })
  statusCode: number;

  @ApiProperty({
    example: 'E-mail ou senha inválidos.',
    description: 'Motivo da falha de autenticação',
  })
  message: string;

  @ApiProperty({ example: 'Unauthorized', description: 'Categoria do erro' })
  error: string;
}

export class ForbiddenResponseDto {
  @ApiProperty({ example: 403, description: 'Código de status HTTP 403' })
  statusCode: number;

  @ApiProperty({
    example: 'Você não tem permissão para realizar esta ação.',
    description: 'Motivo da recusa de acesso',
  })
  message: string;

  @ApiProperty({ example: 'Forbidden', description: 'Categoria do erro' })
  error: string;
}

export class NotFoundResponseDto {
  @ApiProperty({ example: 404, description: 'Código de status HTTP 404' })
  statusCode: number;

  @ApiProperty({
    example: 'Recurso não encontrado.',
    description: 'Mensagem informando que o registro não existe',
  })
  message: string;

  @ApiProperty({ example: 'Not Found', description: 'Categoria do erro' })
  error: string;
}

export class ConflictResponseDto {
  @ApiProperty({ example: 409, description: 'Código de status HTTP 409' })
  statusCode: number;

  @ApiProperty({
    example: 'Já existe um usuário cadastrado com este e-mail.',
    description: 'Detalhes do conflito de unicidade',
  })
  message: string;

  @ApiProperty({ example: 'Conflict', description: 'Categoria do erro' })
  error: string;
}

export class InternalServerErrorResponseDto {
  @ApiProperty({ example: 500, description: 'Código de status HTTP 500' })
  statusCode: number;

  @ApiProperty({
    example: 'Ocorreu um erro interno inesperado no servidor.',
    description: 'Mensagem de erro inesperado',
  })
  message: string;

  @ApiProperty({
    example: 'Internal Server Error',
    description: 'Categoria do erro',
  })
  error: string;
}
