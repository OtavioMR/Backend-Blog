import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { AuthSession } from '../entities/session.entity.js';
import { UserRole } from '../../users/enums/user.enum.js';
import { UsersService } from '../../users/users.service.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  authVersion: number;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    @InjectRepository(AuthSession) private readonly sessions: Repository<AuthSession>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive || payload.authVersion !== user.authVersion) {
      throw new UnauthorizedException('Usuário desativado ou não encontrado.');
    }

    if (!payload.sid || !(await this.sessions.exists({ where: { id: payload.sid, userId: user.id, authVersion: user.authVersion, expiresAt: MoreThan(new Date()) } }))) {
      throw new UnauthorizedException('Sessão revogada ou expirada.');
    }

    return {
      sessionId: payload.sid,
      authVersion: user.authVersion,
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
