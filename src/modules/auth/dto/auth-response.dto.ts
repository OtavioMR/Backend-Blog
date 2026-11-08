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
    description: 'Indica se a conta requer autenticação de dois fatores (2FA).',
    example: true,
  })
  requires2fa?: boolean;

  @ApiPropertyOptional({
    description: 'Token temporário de desafio para validação da segunda etapa.',
  })
  preAuthToken?: string;
}
