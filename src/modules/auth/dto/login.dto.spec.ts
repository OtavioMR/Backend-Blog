import { expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto.js';

it('accepts authenticator and generated recovery codes while rejecting other code formats', async () => {
  for (const totpCode of ['123456', 'a1b2-c3d4', 'A1B2C3D4']) expect(await validate(plainToInstance(LoginDto, { email: 'synthetic@example.invalid', password: 'SyntheticPassword123!', totpCode }))).toHaveLength(0);
  for (const totpCode of ['invalid', '12345', 'a'.repeat(100)]) expect((await validate(plainToInstance(LoginDto, { email: 'synthetic@example.invalid', password: 'SyntheticPassword123!', totpCode }))).length).toBeGreaterThan(0);
});
