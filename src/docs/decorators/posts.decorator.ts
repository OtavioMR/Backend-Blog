import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  PostResponseDto,
  PaginatedPostResponseDto,
  BadRequestResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  InternalServerErrorResponseDto,
} from '../models/index.js';
import { ApiPublicRoute } from './public.decorator.js';

export function ApiPostsTag() {
  return ApiTags('Posts');
}

export function ApiFindAllPostsDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiOperation({
      summary: 'Listar artigos publicados',
      description:
        'Retorna resumos de artigos publicados e ativos, ordenados pela data de publicação. Para obter content, consulte o detalhe. Os filtros são combinados por E; a busca corresponde ao título ou conteúdo. categoryId tem prioridade sobre categorySlug.',
    }),
    ApiQuery({ name: 'search', required: false, type: String, example: 'nestjs', description: 'Trecho literal do título ou conteúdo, sem diferenciar maiúsculas ou acentos.' }),
    ApiQuery({ name: 'author', required: false, type: String, example: 'maria', description: 'Trecho literal do nome do autor, sem diferenciar maiúsculas ou acentos.' }),
    ApiQuery({ name: 'categoryName', required: false, type: String, example: 'tecnologia', description: 'Trecho literal do nome de uma categoria ativa, sem diferenciar maiúsculas ou acentos.' }),
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      example: 1,
      description: 'Número da página a ser retornada (padrão: 1, mínimo: 1)',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: 10,
      description:
        'Quantidade máxima de artigos por página (padrão: 10, máx: 100)',
    }),
    ApiQuery({
      name: 'categoryId',
      required: false,
      type: String,
      example: 'b1a7d654-2a6c-4876-b9b6-79cf021516e8',
      description: 'Filtrar artigos pelo UUID da categoria',
    }),
    ApiQuery({
      name: 'categorySlug',
      required: false,
      type: String,
      example: 'noticias',
      description: 'Filtrar artigos pelo slug da categoria',
    }),
    ApiQuery({
      name: 'tagSlug',
      required: false,
      type: String,
      example: 'nestjs',
      description: 'Filtrar artigos pelo slug da tag',
    }),
    ApiResponse({
      status: 200,
      description: 'Lista paginada de artigos retornada com sucesso.',
      type: PaginatedPostResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Parâmetros de paginação inválidos.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao consultar lista de artigos.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiFindMinePostsDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({ summary: 'Listar meus artigos', description: 'Lista artigos ativos do usuário autenticado, incluindo rascunhos.' }),
    ApiResponse({ status: 200, description: 'Artigos do usuário.', type: PaginatedPostResponseDto }),
    ApiResponse({ status: 401, description: 'Acesso não autorizado.', type: UnauthorizedResponseDto }),
  );
}

export function ApiFindPostByIdDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Buscar artigo por ID',
      description:
        'Retorna artigo ativo publicado; rascunhos são visíveis somente ao autor autenticado ou administrador.',
    }),
    ApiParam({
      name: 'id',
      description: 'Identificador único (UUID) do artigo',
      example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
      format: 'uuid',
    }),
    ApiResponse({
      status: 200,
      description: 'Artigo encontrado com sucesso.',
      type: PostResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Formato de UUID inválido fornecido no parâmetro.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Artigo não encontrado ou desativado.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiCreatePostDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Criar novo artigo',
      description:
        'Cria um novo artigo no blog associado automaticamente ao usuário autenticado. Exige perfil AUTHOR ou ADMIN. Requer envio do header `Authorization: Bearer <access_token>`.',
    }),
    ApiResponse({
      status: 201,
      description: 'Artigo criado com sucesso.',
      type: PostResponseDto,
    }),
    ApiResponse({
      status: 400,
      description:
        'Dados de validação incorretos (título ou conteúdo inválidos).',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description:
        'Acesso não autorizado (token JWT ausente, expirado ou usuário inativo).',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 403,
      description:
        'Acesso proibido (apenas usuários com perfil AUTHOR ou ADMIN podem criar artigos).',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description:
        'Uma ou mais categorias informadas não existem ou estão inativas.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao registrar o artigo no banco.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiUpdatePostDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Atualizar artigo existente',
      description:
        'Atualiza campos específicos de um artigo (título, conteúdo, status de publicação ou ativação). Apenas o autor do artigo ou administradores podem executar esta alteração.',
    }),
    ApiParam({
      name: 'id',
      description: 'Identificador único (UUID) do artigo a ser atualizado',
      example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
      format: 'uuid',
    }),
    ApiResponse({
      status: 200,
      description: 'Artigo atualizado com sucesso.',
      type: PostResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Dados de atualização inválidos ou UUID mal formatado.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Acesso não autorizado (token JWT ausente ou inválido).',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 403,
      description:
        'Ação proibida (usuário autenticado não é o autor deste artigo nem ADMIN).',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description:
        'Artigo não encontrado ou uma das categorias informadas não existe ou está inativa.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiRemovePostDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Desativar artigo (Soft Delete)',
      description:
        'Desativa logicamente um artigo existente sem removê-lo fisicamente do banco de dados. Apenas o autor do artigo ou administradores têm permissão.',
    }),
    ApiParam({
      name: 'id',
      description: 'Identificador único (UUID) do artigo a ser desativado',
      example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
      format: 'uuid',
    }),
    ApiResponse({
      status: 204,
      description: 'Artigo desativado com sucesso (sem conteúdo no corpo).',
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
      description:
        'Ação proibida (usuário autenticado não é o autor deste artigo nem ADMIN).',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Artigo não encontrado.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor.',
      type: InternalServerErrorResponseDto,
    }),
  );
}
