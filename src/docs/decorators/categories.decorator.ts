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
  CategoryResponseDto,
  PaginatedCategoryResponseDto,
  PaginatedPostResponseDto,
  BadRequestResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  ConflictResponseDto,
  InternalServerErrorResponseDto,
} from '../models/index.js';
import { ApiPublicRoute } from './public.decorator.js';

export function ApiCategoriesTag() {
  return ApiTags('Categorias');
}

export function ApiFindAllCategoriesDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiOperation({
      summary: 'Listar categorias cadastradas ou realizar autocomplete',
      description:
        'Retorna lista paginada de categorias ativas. Se o parâmetro `search` for informado, realiza busca parcial e case-insensitive por nome ou slug para autocomplete em tempo real (ex.: `?search=notic`).',
    }),
    ApiQuery({
      name: 'search',
      required: false,
      type: String,
      example: 'notic',
      description:
        'Termo de busca parcial / autocomplete pelo nome ou slug da categoria',
    }),
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      example: 1,
      description: 'Número da página (padrão: 1)',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: 10,
      description: 'Quantidade máxima de categorias por página (padrão: 10, máx: 100)',
    }),
    ApiResponse({
      status: 200,
      description: 'Lista de categorias retornada com sucesso.',
      type: PaginatedCategoryResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Parâmetros de consulta inválidos.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao consultar categorias.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiFindCategoryByIdOrSlugDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiOperation({
      summary: 'Obter categoria por ID ou Slug',
      description:
        'Recupera os detalhes de uma categoria ativa informando seu UUID v4 ou seu slug amigável (ex.: "tecnologia").',
    }),
    ApiParam({
      name: 'idOrSlug',
      type: String,
      example: 'tecnologia',
      description: 'UUID v4 ou slug amigável da categoria',
    }),
    ApiResponse({
      status: 200,
      description: 'Categoria encontrada com sucesso.',
      type: CategoryResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Categoria não encontrada.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao consultar categoria.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiFindPostsByCategoryDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiOperation({
      summary: 'Listar artigos vinculados a uma categoria',
      description:
        'Retorna uma lista paginada de artigos publicados e ativos pertencentes à categoria informada por UUID ou slug.',
    }),
    ApiParam({
      name: 'idOrSlug',
      type: String,
      example: 'tecnologia',
      description: 'UUID v4 ou slug amigável da categoria',
    }),
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      example: 1,
      description: 'Número da página (padrão: 1)',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: 10,
      description: 'Quantidade máxima de artigos por página (padrão: 10, máx: 100)',
    }),
    ApiResponse({
      status: 200,
      description: 'Artigos da categoria retornados com sucesso.',
      type: PaginatedPostResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Categoria não encontrada.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao listar artigos da categoria.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiCreateCategoryDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Criar nova categoria (Apenas ADMIN)',
      description:
        'Cadastra uma nova categoria no blog. Exige token JWT de um usuário com perfil ADMIN.',
    }),
    ApiResponse({
      status: 201,
      description: 'Categoria cadastrada com sucesso.',
      type: CategoryResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Dados de entrada inválidos.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Não autenticado.',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Acesso negado: perfil ADMIN obrigatório.',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 409,
      description: 'Já existe categoria com o mesmo nome ou slug.',
      type: ConflictResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao cadastrar categoria.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiUpdateCategoryDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Atualizar categoria (Apenas ADMIN)',
      description:
        'Atualiza os dados de uma categoria existente. Exige token JWT de um usuário com perfil ADMIN.',
    }),
    ApiParam({
      name: 'id',
      type: String,
      format: 'uuid',
      example: 'b1a7d654-2a6c-4876-b9b6-79cf021516e8',
      description: 'Identificador único da categoria (UUID v4)',
    }),
    ApiResponse({
      status: 200,
      description: 'Categoria atualizada com sucesso.',
      type: CategoryResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Dados de entrada inválidos ou ID não é um UUID v4.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Não autenticado.',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Acesso negado: perfil ADMIN obrigatório.',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Categoria não encontrada.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 409,
      description: 'Conflito de unicidade com nome ou slug de outra categoria.',
      type: ConflictResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao atualizar categoria.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiRemoveCategoryDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Desativar / remover categoria (Apenas ADMIN)',
      description:
        'Realiza soft delete na categoria. Os artigos vinculados permanecem íntegros. Exige token JWT com perfil ADMIN.',
    }),
    ApiParam({
      name: 'id',
      type: String,
      format: 'uuid',
      example: 'b1a7d654-2a6c-4876-b9b6-79cf021516e8',
      description: 'Identificador único da categoria (UUID v4)',
    }),
    ApiResponse({
      status: 204,
      description: 'Categoria desativada com sucesso.',
    }),
    ApiResponse({
      status: 400,
      description: 'ID inválido (não é um UUID v4).',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Não autenticado.',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Acesso negado: perfil ADMIN obrigatório.',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Categoria não encontrada.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao remover categoria.',
      type: InternalServerErrorResponseDto,
    }),
  );
}
