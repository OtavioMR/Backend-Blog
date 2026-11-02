import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity.js';
import { MailModule } from '../mail/mail.module.js';
import { NewsletterController } from './newsletter.controller.js';
import { NewsletterService } from './newsletter.service.js';
@Module({ imports: [TypeOrmModule.forFeature([User]), MailModule], controllers: [NewsletterController], providers: [NewsletterService] })
export class NewsletterModule {}
