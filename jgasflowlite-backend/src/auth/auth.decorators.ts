import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Subscription } from '../billing/plans';

export type Role = 'owner' | 'manager' | 'salesman' | 'super_admin' | 'admin';

export interface AuthUser {
  id: number;
  name: string;
  role: Role;
  isSuper: boolean;
  tenantId: number | null;
  sessionId: number;
  client: string;
  sub: Subscription | null;
  /** Platform admins: module keys they may use; null = all. */
  adminPerms: string[] | null;
}

export const IS_PUBLIC = 'jgf:public';
export const ROLES = 'jgf:roles';
export const SUPER = 'jgf:super';
export const ALLOW_EXPIRED = 'jgf:allowExpired';
export const ANY_USER = 'jgf:anyUser';
export const ONLINE_ONLY = 'jgf:onlineOnly';

/** No login needed. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Shop roles allowed (default: any shop user). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Platform console: any platform admin. */
export const SuperAdmin = () => SetMetadata(SUPER, true);
export const ADMIN_PERM = 'jgf:adminPerm';
/** Platform console module this route belongs to (see platform/admin-modules.ts). */
export const AdminPerm = (module: string) => SetMetadata(ADMIN_PERM, module);
/** Writes still allowed when the subscription has expired (billing, export, logout). */
export const AllowExpired = () => SetMetadata(ALLOW_EXPIRED, true);
/** Web app data and sync: an Offline shop must upgrade to an Online plan first. */
export const OnlineOnly = () => SetMetadata(ONLINE_ONLY, true);
/** Any logged-in account, shop user or Super Admin (profile, password, logout). */
export const AnyUser = () => SetMetadata(ANY_USER, true);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

/** Shop id of a shop user (guard guarantees it is set on shop routes). */
export const tid = (u: AuthUser) => u.tenantId as number;
