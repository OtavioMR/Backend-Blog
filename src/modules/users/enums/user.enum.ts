export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  AUTHOR = 'AUTHOR',
  READER = 'READER',
}

export function isAdministrator(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}
