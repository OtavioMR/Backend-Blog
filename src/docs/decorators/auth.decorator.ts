import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthTokensResponseDto,
  LogoutResponseDto,
  ForgotPasswordResponseDto,
  ResetPasswordResponseDto,
  BadRequestResponseDto,
  UnauthorizedResponseDto,
  InternalServerErrorResponseDto,
} from '../models/index.js';
import { ApiPublicRoute } from './public.decorator.js';

export function ApiAuthTag() {
  return ApiTags('Auth');
}

export function ApiLoginDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiOperation({
      summary: 'Autenticar usuário e emitir tokens',
      description:
        'Realiza login com e-mail verificado e senha válidos. Após cinco tentativas incorretas a conta é temporariamente bloqueada, com prazo progressivo. Retorna access_token e define o refreshToken em cookie HTTP-Only (`Path=/api/v1/auth`, `SameSite=Strict`).',
    }),
    ApiResponse({
      status: 200,
      description:
        'Autenticação realizada com sucesso. O access_token é retornado no corpo e o refreshToken gravado em cookie HTTP-Only.',
      type: AuthTokensResponseDto,
      headers: {
        'Set-Cookie': {
          description:
            'Cookie seguro contendo o refreshToken com flags HttpOnly, SameSite=Strict e Path=/api/v1/auth',
          schema: {
            type: 'string',
            example:
              'refreshToken=eyJhbGciOiJIUzI1Ni...; Path=/api/v1/auth; HttpOnly; SameSite=Strict',
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description:
        'Requisição inválida. Os dados enviados não atendem às regras de validação (ex.: formato de e-mail inválido ou campos ausentes).',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Credenciais inválidas, e-mail não verificado ou conta temporariamente bloqueada.',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 500,
      description:
        'Erro interno inesperado no servidor durante a autenticação.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiRefreshDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiOperation({
      summary: 'Renovar par de tokens via cookie HTTP-Only',
      description:
        'Lê o refresh token do cookie HTTP-Only, valida a assinatura e compara o hash com o banco de dados. Realiza rotação automática (invalida o token anterior no banco, define um novo cookie e retorna um novo access_token).',
    }),
    ApiResponse({
      status: 200,
      description:
        'Tokens renovados e rotacionados com sucesso. O novo access_token é retornado no corpo e o novo refreshToken é atualizado no cookie.',
      type: AuthTokensResponseDto,
      headers: {
        'Set-Cookie': {
          description:
            'Novo cookie contendo o refreshToken rotacionado com flags HttpOnly, SameSite=Strict e Path=/api/v1/auth',
          schema: {
            type: 'string',
            example:
              'refreshToken=eyJhbGciOiJIUzI1Ni...; Path=/api/v1/auth; HttpOnly; SameSite=Strict',
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Requisição mal formatada.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 401,
      description:
        'Refresh token não fornecido no cookie, expirado, inválido ou reutilizado/revogado.',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor durante a renovação.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiLogoutDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Encerrar sessão do usuário (Logout)',
      description:
        'Invalida o refresh token no banco de dados e limpa o cookie HTTP-Only `refreshToken` da sessão do usuário autenticado.',
    }),
    ApiResponse({
      status: 200,
      description:
        'Sessão encerrada com sucesso. O cookie refreshToken foi removido e o hash revogado no banco.',
      type: LogoutResponseDto,
      headers: {
        'Set-Cookie': {
          description:
            'Instrução para expirar e remover o cookie refreshToken do cliente.',
          schema: {
            type: 'string',
            example:
              'refreshToken=; Path=/api/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly',
          },
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: 'Token JWT de acesso ausente ou inválido.',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Erro interno inesperado no servidor durante o logout.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiForgotPasswordDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiOperation({
      summary: 'Solicitar recuperação de senha',
      description:
        'Gera um token seguro de recuperação de senha com validade de 30 minutos e envia o link de redefinição para o e-mail cadastrado. Retorna uma mensagem genérica mesmo se o e-mail não existir para mitigar ataques de enumeração.',
    }),
    ApiResponse({
      status: 200,
      description:
        'Solicitação de recuperação processada. Se o e-mail estiver cadastrado e ativo, as instruções foram enviadas.',
      type: ForgotPasswordResponseDto,
    }),
    ApiResponse({
      status: 400,
      description:
        'Requisição inválida. Os dados enviados não atendem às regras de validação (ex.: formato de e-mail inválido).',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 500,
      description:
        'Erro interno inesperado no servidor durante a solicitação de recuperação.',
      type: InternalServerErrorResponseDto,
    }),
  );
}

export function ApiResetPasswordDoc() {
  return applyDecorators(
    ApiPublicRoute(),
    ApiOperation({
      summary: 'Redefinir senha com token de recuperação',
      description:
        'Valida o token criptográfico de recuperação de senha e, caso esteja dentro do prazo de validade de 30 minutos, atualiza a senha do usuário com a nova senha informada. Revoga imediatamente todas as sessões ativas (refresh tokens) do usuário.',
    }),
    ApiResponse({
      status: 200,
      description:
        'Senha redefinida com sucesso. Todas as sessões ativas anteriores foram revogadas.',
      type: ResetPasswordResponseDto,
    }),
    ApiResponse({
      status: 400,
      description:
        'Token inválido, expirado ou formato da nova senha não atende aos requisitos mínimos (8 a 72 caracteres).',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 500,
      description:
        'Erro interno inesperado no servidor durante a redefinição de senha.',
      type: InternalServerErrorResponseDto,
    }),
  );
}
