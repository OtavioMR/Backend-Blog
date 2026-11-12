import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialAuthController } from './social-auth.controller.js';
import { SocialAuthService } from './social-auth.service.js';
import { TotpController } from './totp.controller.js';
import { TotpService } from './totp.service.js';
import { TotpRecoveryService } from './totp-recovery.service.js';
import { TotpRecoveryController } from './totp-recovery.controller.js';
import { RecoveryEmailController } from './recovery-email.controller.js';
import { RecoveryEmailService } from './recovery-email.service.js';
import { AuthSession } from './entities/session.entity.js';
import { AuthRefreshOperation } from './entities/refresh-operation.entity.js';
import { UserRecoveryCode } from './entities/recovery-code.entity.js';
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
    TypeOrmModule.forFeature([AuthSession, AuthRefreshOperation, UserRecoveryCode]),
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
  controllers: [AuthController, TotpController, SocialAuthController, TotpRecoveryController, RecoveryEmailController],
  providers: [AuthService, JwtStrategy, TotpService, SocialAuthService, TotpRecoveryService, RecoveryEmailService],
  exports: [AuthService, TotpService],
})
export class AuthModule {}
