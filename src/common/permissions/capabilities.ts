import { UserRole } from '../../modules/users/enums/user.enum.js';

export enum Capability {
  // Comum / Leitor
  COMMENT_CREATE = 'comment:create',
  COMMENT_LIKE = 'comment:like',
  REPORT_CREATE = 'report:create',

  // Autor / Editorial
  ARTICLE_CREATE = 'article:create',
  ARTICLE_EDIT_OWN = 'article:edit:own',
  ARTICLE_PUBLISH_OWN = 'article:publish:own',
  ARTICLE_DELETE_OWN = 'article:delete:own',
  SERIES_MANAGE_OWN = 'series:manage:own',

  // Administrador
  ADMIN_ACCESS = 'admin:access',
  ADMIN_MODERATE = 'admin:moderate',
  ADMIN_MANAGE_USERS = 'admin:manage_users',
  ADMIN_CATEGORIES = 'admin:categories',
  ADMIN_TAGS = 'admin:tags',

  // Superadministrador
  SUPERADMIN_MANAGE_ROLES = 'superadmin:manage_roles',
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.READER]: 1,
  [UserRole.AUTHOR]: 2,
  [UserRole.ADMIN]: 3,
  [UserRole.SUPER_ADMIN]: 4,
};

export const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  [UserRole.READER]: [
    Capability.COMMENT_CREATE,
    Capability.COMMENT_LIKE,
    Capability.REPORT_CREATE,
  ],
  [UserRole.AUTHOR]: [
    Capability.COMMENT_CREATE,
    Capability.COMMENT_LIKE,
    Capability.REPORT_CREATE,
    Capability.ARTICLE_CREATE,
    Capability.ARTICLE_EDIT_OWN,
    Capability.ARTICLE_PUBLISH_OWN,
    Capability.ARTICLE_DELETE_OWN,
    Capability.SERIES_MANAGE_OWN,
  ],
  [UserRole.ADMIN]: [
    Capability.COMMENT_CREATE,
    Capability.COMMENT_LIKE,
    Capability.REPORT_CREATE,
    Capability.ARTICLE_CREATE,
    Capability.ARTICLE_EDIT_OWN,
    Capability.ARTICLE_PUBLISH_OWN,
    Capability.ARTICLE_DELETE_OWN,
    Capability.SERIES_MANAGE_OWN,
    Capability.ADMIN_ACCESS,
    Capability.ADMIN_MODERATE,
    Capability.ADMIN_MANAGE_USERS,
    Capability.ADMIN_CATEGORIES,
    Capability.ADMIN_TAGS,
  ],
  [UserRole.SUPER_ADMIN]: [
    Capability.COMMENT_CREATE,
    Capability.COMMENT_LIKE,
    Capability.REPORT_CREATE,
    Capability.ARTICLE_CREATE,
    Capability.ARTICLE_EDIT_OWN,
    Capability.ARTICLE_PUBLISH_OWN,
    Capability.ARTICLE_DELETE_OWN,
    Capability.SERIES_MANAGE_OWN,
    Capability.ADMIN_ACCESS,
    Capability.ADMIN_MODERATE,
    Capability.ADMIN_MANAGE_USERS,
    Capability.ADMIN_CATEGORIES,
    Capability.ADMIN_TAGS,
    Capability.SUPERADMIN_MANAGE_ROLES,
  ],
};

export function hasCapability(role: UserRole | string | undefined | null, capability: Capability): boolean {
  if (!role) return false;
  const caps = ROLE_CAPABILITIES[role as UserRole];
  return caps ? caps.includes(capability) : false;
}

export function roleSatisfies(userRole: UserRole | string | undefined | null, requiredRole: UserRole): boolean {
  if (!userRole) return false;
  const userLevel = ROLE_HIERARCHY[userRole as UserRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 999;
  return userLevel >= requiredLevel;
}
