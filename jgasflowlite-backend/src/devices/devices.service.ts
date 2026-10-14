import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../db/db.service';
import { subscriptionOf } from '../billing/plans';
import type { AuthUser } from '../auth/auth.decorators';

/** How long a phone may work without reporting in before it turns read-only. */
export const CHECK_DAYS = 30;

export interface DeviceIn {
  device_id: string;
  model: string;
  app_version: string;
  platform: string;
}

/**
 * Phones registered to a shop.
 *
 * Every phone registers once (it needs internet the first time), then checks
 * in whenever it has internet. The answer is the phone's licence: plan, end
 * date, whether it may write, and the date by which it must check in again.
 * An Offline shop keeps its data on one phone, so it may have one active
 * phone; moving to a new phone releases the old one.
 */
@Injectable()
export class DevicesService {
  constructor(private readonly db: Db) {}

  /** The licence a phone keeps and obeys while offline. */
  private async licence(tenantId: number, device: { id: number; status: string; device_id: string }) {
    const t = await this.db.one<any>('SELECT id, name, plan, status, mode, trial_ends_at, paid_until FROM tenants WHERE id = ?', [tenantId]);
    const sub = subscriptionOf(t);
    const released = device.status !== 'active';
    const state = released ? 'released' : sub.status;
    const checkBy = new Date(Date.now() + CHECK_DAYS * 86400000);
    return {
      status: state, // active | expired | suspended | released
      can_write: state === 'active',
      mode: sub.mode,
      plan: sub.plan,
      plan_name: sub.plan_name,
      expires_at: sub.expires_at,
      days_left: sub.days_left,
      users_limit: sub.users_limit,
      shop: { id: t.id, name: t.name },
      device_id: device.device_id,
      server_time: new Date().toISOString(),
      // The phone turns read-only if it has not checked in by then.
      check_by: checkBy.toISOString(),
      // Never trust the plan end date past the check-in limit.
      valid_until: (sub.expires_at && new Date(String(sub.expires_at).replace(' ', 'T')) < checkBy ? new Date(String(sub.expires_at).replace(' ', 'T')) : checkBy).toISOString(),
    };
  }

  private active(tenantId: number) {
    return this.db.all<any>("SELECT * FROM devices WHERE tenant_id = ? AND status = 'active' ORDER BY last_seen DESC", [tenantId]);
  }

  /**
   * First start on a phone (or after signing in on a new phone). On an Offline
   * account another active phone blocks it unless the owner chooses to move.
   */
  async register(u: AuthUser, b: DeviceIn, replace: boolean) {
    const tenantId = u.tenantId as number;
    const t = await this.db.one<any>('SELECT mode FROM tenants WHERE id = ?', [tenantId]);
    const others = (await this.active(tenantId)).filter((d) => d.device_id !== b.device_id);
    if (t?.mode === 'offline' && others.length) {
      if (!replace) {
        const o = others[0];
        throw new ConflictException({
          statusCode: 409,
          code: 'DEVICE_LIMIT',
          message: 'This Offline account is already used on another phone. Move it to this phone? The other phone will stop working.',
          device: { model: o.model, last_seen: o.last_seen, app_version: o.app_version },
        });
      }
      if (u.role !== 'owner') throw new ForbiddenException('Only the shop owner can move the account to a new phone');
      await this.db.run(
        "UPDATE devices SET status = 'released', released_at = NOW(), released_by = ? WHERE tenant_id = ? AND status = 'active' AND device_id <> ?",
        [u.id, tenantId, b.device_id],
      );
      await this.event(tenantId, 'device_moved', `To ${b.model || 'a new phone'}`, u.id);
    }
    await this.db.run(
      `INSERT INTO devices (tenant_id, device_id, user_id, model, platform, app_version, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), model = VALUES(model), platform = VALUES(platform), app_version = VALUES(app_version),
         status = 'active', released_at = NULL, released_by = NULL, last_seen = NOW()`,
      [tenantId, b.device_id, u.id, b.model, b.platform, b.app_version],
    );
    const d = await this.db.one<any>('SELECT * FROM devices WHERE tenant_id = ? AND device_id = ?', [tenantId, b.device_id]);
    return this.licence(tenantId, d);
  }

  /** Check in: whenever the phone has internet. */
  async check(u: AuthUser, b: Pick<DeviceIn, 'device_id' | 'app_version'>) {
    const tenantId = u.tenantId as number;
    const d = await this.db.one<any>('SELECT * FROM devices WHERE tenant_id = ? AND device_id = ?', [tenantId, b.device_id]);
    if (!d) throw new NotFoundException({ statusCode: 404, code: 'DEVICE_UNKNOWN', message: 'This phone is not registered. Please sign in again.' });
    await this.db.run('UPDATE devices SET last_seen = NOW(), app_version = ? WHERE id = ?', [b.app_version || d.app_version, d.id]);
    return this.licence(tenantId, d);
  }

  list(tenantId: number) {
    return this.db.all<any>(
      `SELECT d.id, d.device_id, d.model, d.platform, d.app_version, d.status, d.first_seen, d.last_seen, d.released_at, u.name AS user_name
       FROM devices d LEFT JOIN users u ON u.id = d.user_id WHERE d.tenant_id = ? ORDER BY d.status = 'active' DESC, d.last_seen DESC`,
      [tenantId],
    );
  }

  /** Stop a phone (lost, sold, replaced). `tenantId` limits an owner to their own phones. */
  async release(id: number, by: number, tenantId?: number) {
    const d = await this.db.one<any>('SELECT * FROM devices WHERE id = ?', [id]);
    if (!d || (tenantId != null && d.tenant_id !== tenantId)) throw new NotFoundException('Phone not found');
    await this.db.run("UPDATE devices SET status = 'released', released_at = NOW(), released_by = ? WHERE id = ?", [by, id]);
    await this.event(d.tenant_id, 'device_released', d.model || d.device_id.slice(0, 8), by);
    return { ok: true };
  }

  private event(tenantId: number, action: string, detail: string, by: number) {
    return this.db.run('INSERT INTO billing_events (tenant_id, action, detail, by_user) VALUES (?, ?, ?, ?)', [tenantId, action, detail.slice(0, 255), by]);
  }
}
