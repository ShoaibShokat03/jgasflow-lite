import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac } from 'crypto';
import { ENV } from '../config/env';
import { Db } from '../db/db.service';
import { subscriptionOf } from '../billing/plans';
import { ADMIN_PERM, ALLOW_EXPIRED, ANY_USER, AuthUser, IS_PUBLIC, ONLINE_ONLY, Role, ROLES, SUPER } from './auth.decorators';
import { adminCan, parsePerms } from '../platform/admin-modules';

export const hashToken = (token: string) => createHmac('sha256', ENV.tokenSecret).update(token).digest('hex');

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Global guard. Bearer token -> session -> user -> shop.
 * - Super Admin routes need is_super.
 * - Shop routes need a shop user with an allowed role.
 * - A suspended shop is locked out; an expired one becomes read-only
 *   (data can still be viewed and exported, and the plan renewed).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: Db,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.meta<boolean>(IS_PUBLIC, ctx)) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Please log in');

    const row = await this.db.one<any>(
      `SELECT s.id AS sid, s.client, s.expires_at, s.revoked, s.last_seen_at, u.id, u.name, u.role, u.is_super, u.admin_perms, u.active, u.tenant_id,
              t.plan, t.status, t.mode, t.trial_ends_at, t.paid_until
       FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE s.token_hash = ?`,
      [hashToken(token)],
    );
    if (!row || row.revoked || !row.active || new Date(row.expires_at.replace(' ', 'T')) < new Date()) {
      throw new UnauthorizedException('Your session has ended. Please log in again.');
    }

    const user: AuthUser = {
      id: row.id,
      name: row.name,
      role: row.role as Role,
      isSuper: !!row.is_super,
      tenantId: row.tenant_id,
      sessionId: row.sid,
      client: row.client,
      sub: row.tenant_id ? subscriptionOf(row) : null,
      adminPerms: parsePerms(row.admin_perms),
    };
    req.user = user;

    if (Date.now() - new Date(row.last_seen_at.replace(' ', 'T')).getTime() > 5 * 60000) {
      void this.db.run('UPDATE sessions SET last_seen_at = NOW() WHERE id = ?', [row.sid]).catch(() => undefined);
    }

    if (this.meta<boolean>(ANY_USER, ctx)) return true;

    if (this.meta<boolean>(SUPER, ctx)) {
      if (!user.isSuper) throw new ForbiddenException('Platform admins only');
      const module = this.meta<string>(ADMIN_PERM, ctx);
      if (module && !adminCan(user, module)) throw new ForbiddenException('You do not have access to this part of the console');
      return true;
    }

    if (!user.tenantId || !user.sub) throw new ForbiddenException('This page is for shop accounts');
    if (user.sub.status === 'suspended') {
      throw new ForbiddenException({ statusCode: 403, code: 'SHOP_SUSPENDED', message: 'This shop account is suspended. Please contact JGasFlow support.' });
    }

    if (user.sub.mode === 'offline' && this.meta<boolean>(ONLINE_ONLY, ctx)) {
      throw new HttpException(
        { statusCode: 403, error: 'Forbidden', code: 'OFFLINE_ACCOUNT', message: 'This shop is on the Offline plan. Upgrade to an Online plan to use the web app and sync.' },
        403,
      );
    }

    const roles = this.meta<Role[]>(ROLES, ctx);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException('You do not have permission for this');

    if (WRITE.has(req.method) && user.sub.status === 'expired' && !this.meta<boolean>(ALLOW_EXPIRED, ctx)) {
      throw new HttpException(
        { statusCode: 402, error: 'Payment Required', code: 'SUBSCRIPTION_EXPIRED', message: 'Your plan has expired. Renew it to add or change records. You can still view and export your data.' },
        402,
      );
    }
    return true;
  }
}
