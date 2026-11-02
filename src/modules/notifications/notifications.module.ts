import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
@Module({ imports: [TypeOrmModule.forFeature([User])], controllers: [NotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}
