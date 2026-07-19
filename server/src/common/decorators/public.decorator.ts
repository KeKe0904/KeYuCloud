import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const ADMIN_ROLES_KEY = 'adminRoles';
export const AdminRoles = (...roles: string[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
