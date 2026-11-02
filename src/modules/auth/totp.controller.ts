import { Body, Controller, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import type { RequestWithUser } from './interfaces/request-with-user.interface.js';
import { TotpService } from './totp.service.js';
class PasswordDto { @ApiProperty({ example: 'Password123!' }) @IsString() @MinLength(1) @MaxLength(72) password: string; }
class CodeDto { @ApiProperty({ example: '123456' }) @Matches(/^\d{6}$/) code: string; }
class DisableDto extends PasswordDto { @ApiProperty({ example: '123456' }) @Matches(/^\d{6}$/) code: string; }
@ApiTags('Auth') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard) @Controller('auth/totp')
export class TotpController {
  constructor(private readonly service: TotpService) {}
  @Post('setup') @HttpCode(200) @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start TOTP setup', description: 'Requires the current password. Add the returned secret or URI to an authenticator; setup expires after ten minutes.' })
  @ApiResponse({ status: 200, description: 'Secret and provisioning URI.', schema: { example: { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Backend%20Blog:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Backend%20Blog', expiresIn: 600 } } })
  @ApiResponse({ status: 400, description: 'Invalid input.' }) @ApiResponse({ status: 401, description: 'Invalid token or password.' })
  @ApiResponse({ status: 409, description: 'TOTP already enabled.' }) @ApiResponse({ status: 503, description: 'TOTP encryption key not configured.' })
  setup(@Req() req: RequestWithUser, @Body() dto: PasswordDto) { return this.service.setup(req.user.userId, dto.password); }
  @Post('enable') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm and enable TOTP', description: 'Submit an authenticator code. All sessions are invalidated and login is required again.' })
  @ApiResponse({ status: 200, description: 'TOTP enabled.', schema: { example: { enabled: true } } })
  @ApiResponse({ status: 400, description: 'Invalid input or setup expired.' }) @ApiResponse({ status: 401, description: 'Invalid token or code.' })
  @ApiResponse({ status: 409, description: 'TOTP already enabled.' }) @ApiResponse({ status: 503, description: 'TOTP encryption key not configured.' })
  enable(@Req() req: RequestWithUser, @Body() dto: CodeDto) { return this.service.enable(req.user.userId, dto.code); }
  @Post('disable') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Disable TOTP', description: 'Requires the current password and a fresh authenticator code. All sessions are invalidated.' })
  @ApiResponse({ status: 200, description: 'TOTP disabled.', schema: { example: { enabled: false } } })
  @ApiResponse({ status: 400, description: 'Invalid input.' }) @ApiResponse({ status: 401, description: 'Invalid credentials.' }) @ApiResponse({ status: 503, description: 'TOTP encryption key not configured.' })
  disable(@Req() req: RequestWithUser, @Body() dto: DisableDto) { return this.service.disable(req.user.userId, dto.password, dto.code); }
}
