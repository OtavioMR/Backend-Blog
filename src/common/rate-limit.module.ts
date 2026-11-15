import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PostgresRateLimitStorage } from './postgres-rate-limit.storage.js';
import { DataSource } from 'typeorm';

@Module({
  imports: [ThrottlerModule.forRootAsync({ inject: [DataSource], useFactory: (db: DataSource) => ({
    throttlers: [{ ttl: 60_000, limit: 100 }], storage: new PostgresRateLimitStorage(db),
  }) })],
  providers: [PostgresRateLimitStorage, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
