import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { CreatePostDto } from '../../modules/posts/dto/create-post.dto.js';
import { UpdatePostDto } from '../../modules/posts/dto/update-post.dto.js';
import {
  PostResponseDto,
  PostSummaryResponseDto,
  PaginatedPostResponseDto,
  BadRequestResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  InternalServerErrorResponseDto,
} from '../models/index.js';
import { ApiPublicRoute } from './public.decorator.js';

export function ApiPostsTag() {
  return ApiTags('Contos');
}

export function ApiFindAllPostsDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiExtraModels(PaginatedPostResponseDto, PostSummaryResponseDto),
    ApiOperation({
      summary: 'Listar contos publicados',
      description:
        'Retorna resumos de contos publicados e ativos. Sem busca, ordena pela data de publicação; com busca e paginação numérica, prioriza a relevância textual, com maior peso no título. A paginação por cursor mantém a ordem cronológica para navegação estável, inclusive com busca. Para obter content, consulte o detalhe. Os filtros são combinados por E. categoryId tem prioridade sobre categorySlug.',
    }),
    ApiQuery({ name: 'search', required: false, type: String, example: 'nestjs', description: 'Busca textual em português no título e conteúdo, sem diferenciar maiúsculas ou acentos; aceita aspas e OR e também encontra trechos literais.' }),
    ApiQuery({ name: 'author', required: false, type: String, example: 'maria', description: 'Trecho literal do nome do autor, sem diferenciar maiúsculas ou acentos.' }),
    ApiQuery({ name: 'cursor', required: false, type: String, example: 'start', description: 'Use start na primeira página e nextCursor nas seguintes. Mantém os filtros entre chamadas. Neste modo a resposta contém meta.hasMore e meta.nextCursor.' }),
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
        'Quantidade máxima de contos por página (padrão: 10, máx: 100)',
    }),
    ApiQuery({
      name: 'categoryId',
      required: false,
      type: String,
      example: 'b1a7d654-2a6c-4876-b9b6-79cf021516e8',
      description: 'Filtrar contos pelo UUID da categoria',
    }),
    ApiQuery({
      name: 'categorySlug',
      required: false,
      type: String,
      example: 'noticias',
      description: 'Filtrar contos pelo slug da categoria',
    }),
    ApiQuery({
      name: 'tagSlug',
      required: false,
      type: String,
      example: 'nestjs',
      description: 'Filtrar contos pelo slug da tag',
    }),
    ApiResponse({
      status: 200,
      description: 'Lista paginada de contos retornada com sucesso.',
      schema: { oneOf: [
        { $ref: getSchemaPath(PaginatedPostResponseDto) },
        { type: 'object', properties: { data: { type: 'array', items: { $ref: getSchemaPath(PostSummaryResponseDto) } }, meta: { type: 'object', properties: { hasMore: { type: 'boolean', example: true }, nextCursor: { type: 'string', nullable: true, example: 'eyJ0aW1lc3RhbXAiOiIyMDI2LTEwLTAxVDEyOjM0OjU2LjEyMzQ1NloiLCJpZCI6ImIxZmZjZDg4LThiMWEtNGNlNy1hYTVjLTVjYzhhYzI3MWIyMiJ9' } } } } },
      ] },
    }),
    ApiResponse({
      status: 400,
      description: 'Parâmetros de paginação inválidos.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({ status: 409, description: 'A lista mudou durante a consulta; repita a requisição.' }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao consultar lista de contos.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiFindMinePostsDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({ summary: 'Listar meus contos', description: 'Lista contos ativos do usuário autenticado, incluindo rascunhos. Paginação page/limit e filtros search (título), status (all/published/draft/pending) e kind (all/standalone/chapter). seriesContext identifica a série do conto com id e título.' }),
    ApiResponse({ status: 200, description: 'Contos do usuário.', type: PaginatedPostResponseDto }),
    ApiResponse({ status: 401, description: 'Acesso não autorizado.', type: UnauthorizedResponseDto }),
  );
}

export function ApiFindPostByIdDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Buscar conto por ID ou slug',
      description:
        'Retorna conto ativo publicado; rascunhos são visíveis somente ao autor autenticado ou administrador.',
    }),
    ApiParam({
      name: 'id',
      description: 'UUID ou slug do conto',
      example: 'introducao-ao-nestjs',
    }),
    ApiResponse({
      status: 200,
      description: 'Conto encontrado com sucesso.',
      type: PostResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Conto não encontrado ou desativado.',
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
      summary: 'Criar novo conto',
      description:
        'Cria um conto associado ao usuário autenticado (AUTHOR, ADMIN ou SUPER_ADMIN). seriesId opcional vincula à série do próprio autor na mesma transação, na última posição; limite de 100 capítulos, sem alterar as regras de revisão. O slug é gerado a partir do título e recebe sufixo em caso de duplicidade. Para agendar, envie published: false (ou omita) e scheduledAt com data futura e fuso. O conto fica como rascunho até a execução do agendador, que verifica publicações pendentes a cada minuto enquanto a aplicação está em execução; então published passa a true, publishedAt é preenchido e scheduledAt é limpo.',
    }),
    ApiBody({ type: CreatePostDto, examples: { imediato: { summary: 'Publicar imediatamente', value: { title: 'A casa que acendia sozinha', content: 'À meia-noite, a casa do outro lado da rua acendeu a luz pela primeira vez em dez anos.', published: true, categoryIds: ['b1a7d654-2a6c-4876-b9b6-79cf021516e8'], tagNames: ['Mistério', 'Cidade pequena'] } }, agendado: { summary: 'Criar rascunho agendado', value: { title: 'A casa que acendia sozinha', content: 'À meia-noite, a casa do outro lado da rua acendeu a luz pela primeira vez em dez anos.', published: false, scheduledAt: '2099-01-01T12:00:00Z', categoryIds: ['b1a7d654-2a6c-4876-b9b6-79cf021516e8'], tagNames: ['Mistério', 'Cidade pequena'] } } } }),
    ApiResponse({
      status: 201,
      description: 'Conto criado com sucesso.',
      type: PostResponseDto,
    }),
    ApiResponse({
      status: 400,
      description:
        'Dados inválidos ou agendamento passado, sem fuso ou combinado com publicação imediata.',
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
        'Acesso proibido (apenas usuários com perfil AUTHOR, ADMIN ou SUPER_ADMIN podem criar contos).',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description:
        'Uma ou mais categorias informadas não existem ou estão inativas.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({ status: 409, description: 'Primeiro conto ainda não aprovado.' }),
    ApiResponse({
      status: 500,
      description: 'Erro interno ao registrar o conto no banco.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiUpdatePostDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Atualizar conto existente',
      description:
        'Atualiza apenas os campos enviados; exige autenticação do autor ou administrador e UUID do conto. O slug permanece estável ao alterar o título. Para agendar ou remarcar um rascunho, envie scheduledAt com data futura e fuso. Envie scheduledAt: null para cancelar, ou published: true para publicar imediatamente e cancelar o agendamento. Desativar ou excluir o conto também cancela o agendamento. Rascunhos pendentes de revisão não podem ser alterados. Autores sem primeiro conto aprovado não podem publicar ou agendar. Consulte GET /posts/me para acompanhar seus rascunhos.',
    }),
    ApiBody({ type: UpdatePostDto, examples: { agendar: { summary: 'Agendar ou remarcar', value: { scheduledAt: '2099-01-01T12:00:00-03:00' } }, cancelar: { summary: 'Cancelar agendamento', value: { scheduledAt: null } }, publicar: { summary: 'Publicar imediatamente', value: { published: true } } } }),
    ApiParam({
      name: 'id',
      description: 'UUID do conto a ser atualizado',
      example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
      format: 'uuid',
    }),
    ApiResponse({
      status: 200,
      description: 'Conto atualizado com sucesso.',
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
        'Ação proibida (usuário autenticado não é o autor deste conto nem administrador).',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description:
        'Conto não encontrado ou uma das categorias informadas não existe ou está inativa.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({ status: 409, description: 'Conto pendente de revisão ou primeiro conto ainda não aprovado.' }),
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
      summary: 'Desativar conto (Soft Delete)',
      description:
        'Desativa logicamente um conto existente sem removê-lo fisicamente do banco de dados. Apenas o autor do conto ou administradores têm permissão.',
    }),
    ApiParam({
      name: 'id',
      description: 'UUID do conto a ser desativado',
      example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
      format: 'uuid',
    }),
    ApiResponse({
      status: 204,
      description: 'Conto desativado com sucesso (sem conteúdo no corpo).',
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
        'Ação proibida (usuário autenticado não é o autor deste conto nem administrador).',
      type: ForbiddenResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Conto não encontrado.',
      type: NotFoundResponseDto,
    }),
    ApiResponse({ status: 409, description: 'Conto pendente de revisão.' }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor.',
      type: InternalServerErrorResponseDto,
    }),
  );
}
