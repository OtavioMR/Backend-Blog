import type { Request } from 'express';

import type { UserRole } from '../../users/enums/user.enum.js';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  totpEnabled?: boolean;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser & { sessionId: string; authVersion: number };
}
