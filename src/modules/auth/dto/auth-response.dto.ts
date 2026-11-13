import { ApiPropertyOptional } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiPropertyOptional({
    description: 'Token JWT de acesso (Bearer)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token?: string;

  @ApiPropertyOptional({
    description: 'Tipo do token retornado',
    example: 'Bearer',
  })
  token_type?: string;

  @ApiPropertyOptional({
    description: 'Tempo de expiração do token em segundos',
    example: 900,
  })
  expires_in?: number;

  @ApiPropertyOptional({
    description: 'Identificador da sessão de autenticação (v2)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  session_id?: string;

  @ApiPropertyOptional({
    description: 'Geração de rotação do refresh token na sessão (v2)',
    example: 0,
  })
  refresh_generation?: number;

  @ApiPropertyOptional({
    description: 'Versão do protocolo de renovação da sessão',
    example: 2,
  })
  refresh_protocol?: number;

  @ApiPropertyOptional({
    description: 'Geração resultante no protocolo v2 (/auth/refresh/v2)',
    example: 1,
  })
  generation?: number;

  @ApiPropertyOptional({
    description: 'Identificador da operação de renovação confirmada (/auth/refresh/v2)',
    example: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  })
  operation_id?: string;

  @ApiPropertyOptional({
    description: 'Prazo limite ISO-8601 para recuperação do resultado desta operação (/auth/refresh/v2)',
    example: '2026-11-12T17:00:00.000Z',
  })
  recovery_deadline?: string;

  @ApiPropertyOptional({
    description: 'Indica se a conta requer autenticação de dois fatores (2FA).',
    example: true,
  })
  requires2fa?: boolean;

  @ApiPropertyOptional({
    description: 'Token temporário de desafio para validação da segunda etapa.',
  })
  preAuthToken?: string;
}
