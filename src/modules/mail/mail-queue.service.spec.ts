import { describe, expect, it } from 'vitest';
import { mailRetryDelay } from './mail-queue.service.js';

describe('retentativas de e-mail', () => {
  it('aumenta o intervalo e o limita a cinco minutos', () => {
    expect([1, 2, 3, 8, 300].map(mailRetryDelay)).toEqual([
      5_000, 10_000, 20_000, 300_000, 300_000,
    ]);
  });
});
