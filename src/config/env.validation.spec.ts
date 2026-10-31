import { describe, expect, it } from 'vitest';
import { validate } from './env.validation.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'postgres',
  DB_PASSWORD: 'password',
  DB_NAME: 'blog',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  FRONTEND_URL: 'http://localhost:5173',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '465',
  SMTP_USER: 'user',
  SMTP_PASS: 'password',
  SMTP_FROM: 'Blog <blog@example.com>',
};

describe('environment validation', () => {
  it('accepts valid configuration and converts numeric values', () => {
    expect(validate(valid)).toMatchObject({
      PORT: 3000,
      DB_PORT: 5432,
      SMTP_PORT: 465,
      JWT_EXPIRES_IN: 900,
    });
  });

  it.each(Object.keys(valid))('rejects a missing %s', (key) => {
    const config = { ...valid };
    delete config[key as keyof typeof config];
    expect(() => validate(config)).toThrow(key);
  });

  it.each([
    ['PORT', '0'],
    ['DB_PORT', '65536'],
    ['SMTP_PORT', '12.5'],
    ['PORT', ''],
    ['JWT_SECRET', 'short'],
    ['JWT_REFRESH_SECRET', ' '.repeat(32)],
    ['FRONTEND_URL', 'javascript:alert(1)'],
    ['NODE_ENV', 'staging'],
    ['DB_PASSWORD', '   '],
    ['JWT_EXPIRES_IN', '0'],
  ])('rejects invalid %s', (key, value) => {
    expect(() => validate({ ...valid, [key]: value })).toThrow(key);
  });

  it('does not reveal invalid secret values in errors', () => {
    expect(() => validate({ ...valid, JWT_SECRET: 'sensitive' })).not.toThrow(
      'sensitive',
    );
  });
});
