import { Module } from '@nestjs/common';
import { VerificationCodeService } from './verification-code.service.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { MailModule } from '../mail/mail.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([User]), MailModule],
  controllers: [UsersController],
  providers: [UsersService, VerificationCodeService],
  exports: [UsersService],
})
export class UsersModule {}
