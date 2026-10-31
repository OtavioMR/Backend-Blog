import { instanceToPlain } from 'class-transformer';
import { User } from '../../modules/users/entities/user.entity.js';

it('omits authentication secrets when a user entity is serialized', () => {
  const user = Object.assign(new User(), { id: 'id', passwordHash: 'secret', refreshTokenHash: 'token', emailVerificationTokenHash: 'verify', emailChangeTokenHash: 'change' });
  expect(instanceToPlain(user)).not.toHaveProperty('passwordHash');
  expect(instanceToPlain(user)).not.toHaveProperty('refreshTokenHash');
  expect(instanceToPlain(user)).not.toHaveProperty('emailVerificationTokenHash');
  expect(instanceToPlain(user)).not.toHaveProperty('emailChangeTokenHash');
});
