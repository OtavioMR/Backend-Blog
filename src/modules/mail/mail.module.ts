import { Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { MailQueueService } from './mail-queue.service.js';
import { MailQueueController } from './mail-queue.controller.js';

@Module({
  providers: [MailService, MailQueueService],
  controllers: [MailQueueController],
  exports: [MailService, MailQueueService],
})
export class MailModule {}
