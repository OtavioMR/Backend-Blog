import type { Request } from 'express';

import type { UserRole } from '../../users/enums/user.enum.js';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

