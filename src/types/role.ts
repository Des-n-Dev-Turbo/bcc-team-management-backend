export enum Role {
  Viewer = 'viewer',
  User = 'user',
  Admin = 'admin',
  Superadmin = 'superadmin',
}

export const roleHierarchy: Record<Role, number> = {
  [Role.Viewer]: 1,
  [Role.User]: 2,
  [Role.Admin]: 3,
  [Role.Superadmin]: 4,
};

export function hasRequiredRole(userRole: Role, requiredRole: Role): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}
