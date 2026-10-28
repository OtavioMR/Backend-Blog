import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import type { RequestWithUser } from './interfaces/request-with-user.interface.js';
import {
  ApiAuthTag,
  ApiLoginDoc,
  ApiRefreshDoc,
  ApiLogoutDoc,
} from '../../docs/index.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

@ApiAuthTag()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiLoginDoc()
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const tokens = await this.authService.login(loginDto);

    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      this.authService.getRefreshTokenCookieOptions(),
    );

    return {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
    };
  }

  @ApiRefreshDoc()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const refreshToken =
      req.cookies?.[REFRESH_COOKIE_NAME] ?? req.cookies?.['refresh_token'];

    if (!refreshToken) {
      throw new UnauthorizedException(
        'Refresh token não fornecido via cookie.',
      );
    }

    const tokens = await this.authService.refresh(refreshToken);

    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      this.authService.getRefreshTokenCookieOptions(),
    );

    return {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
    };
  }

  @ApiLogoutDoc()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const cookieOptions = this.authService.getRefreshTokenCookieOptions();
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
    });

    return this.authService.logout(request.user.userId);
  }
}
