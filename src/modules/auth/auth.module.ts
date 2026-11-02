import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialAuthController } from './social-auth.controller.js';
import { SocialAuthService } from './social-auth.service.js';
import { TotpController } from './totp.controller.js';
import { TotpService } from './totp.service.js';
import { AuthSession } from './entities/session.entity.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersModule } from '../users/users.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthSession]),
    UsersModule,
    MailModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: Number(configService.get('JWT_EXPIRES_IN') ?? 3600),
        },
      }),
    }),
  ],
  controllers: [AuthController, TotpController, SocialAuthController],
  providers: [AuthService, JwtStrategy, TotpService, SocialAuthService],
  exports: [AuthService],
})
export class AuthModule {}
