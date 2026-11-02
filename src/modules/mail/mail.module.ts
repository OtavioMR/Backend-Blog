import { Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { MailQueueService } from './mail-queue.service.js';

@Module({
  providers: [MailService, MailQueueService],
  exports: [MailService, MailQueueService],
})
export class MailModule {}
