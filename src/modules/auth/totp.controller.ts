import { Body, Controller, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import type { RequestWithUser } from './interfaces/request-with-user.interface.js';
import { TotpService } from './totp.service.js';

class PasswordDto {
  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}

class CodeDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  code: string;
}

class DisableDto extends PasswordDto {
  @ApiProperty({ example: '123456', description: 'Código de 6 dígitos do autenticador ou código de recuperação.' })
  @IsString()
  @Matches(/^(\d{6}|[a-zA-Z0-9]{4}[-\s]?[a-zA-Z0-9]{4})$/)
  code: string;
}

class RegenerateCodesDto extends PasswordDto {
  @ApiProperty({ example: '123456', description: 'Código atual do Google Authenticator.' })
  @Matches(/^\d{6}$/)
  code: string;
}

@ApiTags('Autenticação')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('auth/totp')
export class TotpController {
  constructor(private readonly service: TotpService) {}

  @Post('setup')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Iniciar configuração do TOTP',
    description: 'Exige a senha atual. Para ADMIN e SUPER_ADMIN, exige também e-mail secundário de recuperação confirmado. Para READER e AUTHOR o secundário é opcional, independente do 2FA. Retorna o segredo, a URI otpauth e o QR Code em DataURL. A configuração expira em dez minutos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Segredo, URI e QR Code para o Google Authenticator.',
    schema: {
      example: {
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUri: 'otpauth://totp/Grif%C3%B3rio:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Grif%C3%B3rio',
        qrCode: 'data:image/png;base64,...',
        expiresIn: 600,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 401, description: 'Token ou senha inválidos.' })
  @ApiResponse({ status: 409, description: 'TOTP já ativado ou e-mail de recuperação não confirmado.' })
  @ApiResponse({ status: 503, description: 'Chave de criptografia do TOTP não configurada.' })
  setup(@Req() req: RequestWithUser, @Body() dto: PasswordDto) {
    return this.service.setup(req.user.userId, dto.password);
  }

  @Post('enable')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Confirmar e ativar TOTP',
    description: 'Valida o código de seis dígitos do novo autenticador. E-mail secundário confirmado obrigatório somente para ADMIN e SUPER_ADMIN. Ativa o 2FA, invalida sessões anteriores e emite códigos reserva de uso único, exibidos apenas agora e armazenados como hashes.',
  })
  @ApiResponse({
    status: 200,
    description: 'TOTP ativado e códigos de recuperação gerados.',
    schema: {
      example: {
        enabled: true,
        recoveryCodes: ['a1b2-c3d4', 'e5f6-a7b8'],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou configuração expirada.' })
  @ApiResponse({ status: 401, description: 'Token ou código inválido.' })
  @ApiResponse({ status: 409, description: 'TOTP já ativado.' })
  @ApiResponse({ status: 503, description: 'Chave de criptografia do TOTP não configurada.' })
  enable(@Req() req: RequestWithUser, @Body() dto: CodeDto) {
    return this.service.enable(req.user.userId, dto.code);
  }

  @Post('disable')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Desativar TOTP',
    description: 'Exige a senha atual e um código válido (TOTP ou de recuperação). Contas administrativas não podem desativar o 2FA.',
  })
  @ApiResponse({ status: 200, description: 'TOTP desativado.', schema: { example: { enabled: false } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas.' })
  @ApiResponse({ status: 403, description: 'Contas administrativas não podem desativar o 2FA.' })
  @ApiResponse({ status: 503, description: 'Chave de criptografia do TOTP não configurada.' })
  disable(@Req() req: RequestWithUser, @Body() dto: DisableDto) {
    return this.service.disable(req.user.userId, dto.password, dto.code);
  }

  @Post('recovery-codes')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Regenerar códigos de recuperação',
    description: 'Exige a senha atual e o código TOTP. Invalida todos os códigos anteriores e gera novos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Novos códigos de recuperação.',
    schema: {
      example: {
        recoveryCodes: ['a1b2-c3d4', 'e5f6-a7b8'],
      },
    },
  })
  regenerateRecoveryCodes(@Req() req: RequestWithUser, @Body() dto: RegenerateCodesDto) {
    return this.service.regenerateRecoveryCodes(req.user.userId, dto.password, dto.code);
  }
}
