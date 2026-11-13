import type { Request } from 'express';

import type { UserRole } from '../../users/enums/user.enum.js';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  totpEnabled?: boolean;
  emailVerified?: boolean;
  recoveryEmailVerified?: boolean;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser & { sessionId: string; authVersion: number };
}
