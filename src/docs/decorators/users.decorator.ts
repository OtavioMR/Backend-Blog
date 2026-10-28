import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  UserResponseDto,
  BadRequestResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  ConflictResponseDto,
  InternalServerErrorResponseDto,
} from '../models/index.js';
import { ApiPublicRoute } from './public.decorator.js';

export function ApiUsersTag() {
  return ApiTags('Users');
}

export function ApiCreateUserDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiOperation({
      summary: 'Cadastrar novo usuário',
      description: 'Cria uma nova conta de usuário com role inicial READER.',
    }),
    ApiResponse({
      status: 201,
      description: 'Usuário cadastrado com sucesso.',
      type: UserResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Dados de validação incorretos (ex.: senha curta, e-mail inválido).',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 409,
      description: 'Já existe um usuário cadastrado com este e-mail.',
      type: ConflictResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao criar conta de usuário.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiFindAllUsersDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Listar todos os usuários (Admin)',
      description:
        'Retorna a lista completa de usuários ativos cadastrados no sistema. Acesso restrito a administradores (ADMIN).',
    }),
    ApiResponse({
      status: 200,
      description: 'Lista de usuários obtida com sucesso.',
      type: [UserResponseDto],
    }),
    ApiResponse({
      status: 401,
      description: 'Acesso não autorizado (token JWT ausente ou inválido).',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Acesso proibido (requer permissão de ADMIN).',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor ao consultar usuários.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiFindUserByIdDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Buscar usuário por ID',
      description: 'Retorna os detalhes de um usuário ativo específico identificado por UUID.',
    }),
    ApiParam({
      name: 'id',
      description: 'Identificador único (UUID) do usuário',
      example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      format: 'uuid',
    }),
    ApiResponse({
      status: 200,
      description: 'Usuário localizado com sucesso.',
      type: UserResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Formato de UUID inválido fornecido no parâmetro da URL.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Acesso não autorizado (token JWT ausente ou inválido).',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Usuário não encontrado ou desativado.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiUpdateUserDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Atualizar dados de um usuário',
      description:
        'Atualiza informações cadastrais de um usuário. Requer autenticação JWT (`Authorization: Bearer <access_token>`). Apenas o próprio usuário ou administradores podem atualizar o registro.',
    }),
    ApiParam({
      name: 'id',
      description: 'Identificador único (UUID) do usuário a ser atualizado',
      example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      format: 'uuid',
    }),
    ApiResponse({
      status: 200,
      description: 'Usuário atualizado com sucesso.',
      type: UserResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Dados de entrada inválidos ou UUID mal formatado.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Acesso não autorizado (token JWT ausente ou inválido).',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Ação proibida (sem permissão para alterar dados de outro usuário).',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Usuário não encontrado.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 409,
      description: 'Novo e-mail informado já está em uso por outro usuário.',
      type: ConflictResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiRemoveUserDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Desativar usuário (Soft Delete)',
      description:
        'Desativa a conta de um usuário (soft delete) e revoga tokens ativos sem removê-lo fisicamente do banco de dados. Apenas o próprio usuário ou administradores podem executar esta ação.',
    }),
    ApiParam({
      name: 'id',
      description: 'Identificador único (UUID) do usuário a ser desativado',
      example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      format: 'uuid',
    }),
    ApiResponse({
      status: 204,
      description: 'Usuário desativado com sucesso (sem conteúdo no corpo).',
    }),
    ApiResponse({
      status: 400,
      description: 'Formato de UUID inválido.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Acesso não autorizado.',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Ação proibida (sem permissão para desativar outro usuário).',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Usuário não encontrado.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor.',
      type: InternalServerErrorResponseDto,
    }),
  );
}
