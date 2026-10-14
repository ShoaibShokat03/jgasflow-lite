import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { ENV } from '../config/env';
import { Db, Q } from '../db/db.service';
import { withWriter } from '../db/writer';
import { SEED_TYPES } from '../db/tables';
import { subscriptionOf } from '../billing/plans';
import { normPhone } from '../common/rules';
import { toDb } from '../common/util';
import { AuthUser } from './auth.decorators';
import { PlatformConfig } from '../platform/platform-config.service';
import { parsePerms } from '../platform/admin-modules';
import { hashToken } from './auth.guard';
import { EmailCodesService } from './email-codes.service';

export interface SessionInfo {
  client?: string;
  device?: string;
  ip?: string;
}

export const SHOP_FIELDS = 'id, name, owner_name, phone, address, currency, receipt_note, profile_updated_at, plan, status, mode, trial_ends_at, paid_until, created_at';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly config: PlatformConfig,
    private readonly codes: EmailCodesService,
  ) {}

  async signup(b: { shop_name: string; owner_name: string; phone: string; email: string; password: string; mode?: 'offline' | 'online'; email_code?: string }, info: SessionInfo) {
    const mode = b.mode === 'offline' ? 'offline' : 'online';
    const phone = normPhone(b.phone);
    const email = b.email ? b.email.trim().toLowerCase() : null;
    // The web sign-up needs an email, confirmed with a code when email is set up.
    // The phone app (older versions too) signs up without one.
    const web = info.client !== 'mobile';
    if (web && !email) throw new BadRequestException('Enter your email');
    await this.assertFree(this.db, phone, email);
    const verify = web && this.config.emailVerifyOn();
    if (verify) await this.codes.consume(email!, 'signup', b.email_code ?? '');
    const hash = await bcrypt.hash(b.password, 10);

    const userId = await this.db.tx(async (q) => {
      const t = await q.run(
        `INSERT INTO tenants (name, owner_name, phone, plan, status, mode, trial_ends_at, profile_updated_at)
         VALUES (?, ?, ?, 'trial', 'active', ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?)`,
        [b.shop_name, b.owner_name, b.phone.trim(), mode, this.config.trialDays(), Date.now()],
      );
      const tenantId = t.insertId;
      const u = await q.run(`INSERT INTO users (tenant_id, name, phone, email, email_verified_at, password_hash, role, last_login_at) VALUES (?, ?, ?, ?, ${verify ? 'NOW()' : 'NULL'}, ?, 'owner', NOW())`, [
        tenantId,
        b.owner_name,
        phone,
        email,
        hash,
      ]);
      await q.run(`INSERT INTO billing_events (tenant_id, action, detail, by_user) VALUES (?, 'signup', ?, ?)`, [tenantId, `${mode === 'offline' ? 'Offline' : 'Online'} trial started (${this.config.trialDays()} days)`, u.insertId]);
      return { tenantId, userId: u.insertId };
    });

    await this.seedShop(userId.tenantId, userId.userId);
    return this.issue(userId.userId, info);
  }

  /** Standard cylinder sizes with opening price history, same as a fresh phone install. */
  private async seedShop(tenantId: number, userId: number) {
    const now = toDb();
    await withWriter(this.db, tenantId, userId, async (w) => {
      for (const s of SEED_TYPES) {
        await w.insert('cylinder_types', { ...s, low_level: 5, active: 1 });
        await w.insert('price_history', {
          uid: s.uid.replace('seedtype', 'seedpric'),
          type_uid: s.uid,
          kind: 'sale',
          old_price: 0,
          price: s.price,
          date: now,
          note: 'opening',
        });
      }
      // Untouched standard sizes count as the oldest edit, so a phone that
      // changed them before going online keeps its prices when merging.
      await w.q.run("UPDATE cylinder_types SET updated_at = 1 WHERE tenant_id = ? AND uid LIKE 'seedtype%'", [tenantId]);
      await w.q.run("UPDATE price_history SET updated_at = 1 WHERE tenant_id = ? AND uid LIKE 'seedpric%'", [tenantId]);
    });
  }

  async assertFree(q: Q, phone: string | null, email: string | null, exceptUserId = 0) {
    if (phone) {
      const p = await q.one('SELECT id FROM users WHERE phone = ? AND id <> ?', [phone, exceptUserId]);
      if (p) throw new ConflictException('This phone number is already registered. Please log in.');
    }
    if (email) {
      const e = await q.one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, exceptUserId]);
      if (e) throw new ConflictException('This email is already registered. Please log in.');
    }
  }

  async login(login: string, password: string, info: SessionInfo) {
    const raw = login.trim().toLowerCase();
    const u = raw.includes('@')
      ? await this.db.one<any>('SELECT * FROM users WHERE email = ?', [raw])
      : await this.db.one<any>('SELECT * FROM users WHERE phone = ?', [normPhone(raw)]);
    // Same message for unknown user and wrong password.
    if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new UnauthorizedException('Wrong phone/email or password');
    if (!u.active) throw new ForbiddenException('This account is turned off. Ask the shop owner.');
    if (u.tenant_id) {
      const t = await this.db.one<any>('SELECT status FROM tenants WHERE id = ?', [u.tenant_id]);
      if (t?.status === 'suspended') throw new ForbiddenException('This shop account is suspended. Please contact JGasFlow support.');
    }
    await this.db.run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [u.id]);
    return this.issue(u.id, info);
  }

  /** Support login from the console: a session for the shop owner. */
  async issueFor(userId: number, info: SessionInfo) {
    return this.issue(userId, info);
  }

  private async issue(userId: number, info: SessionInfo) {
    const token = randomBytes(32).toString('base64url');
    await this.db.run(
      `INSERT INTO sessions (user_id, token_hash, client, device, ip, expires_at) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [userId, hashToken(token), (info.client || 'web').slice(0, 20), (info.device || '').slice(0, 120), (info.ip || '').slice(0, 64), ENV.sessionDays],
    );
    return { token, ...(await this.profile(userId)) };
  }

  /** Who am I: user, shop and subscription. */
  async profile(userId: number) {
    const u = await this.db.one<any>('SELECT id, tenant_id, name, phone, email, role, is_super, admin_perms FROM users WHERE id = ?', [userId]);
    if (!u) throw new UnauthorizedException();
    const user = {
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      role: u.is_super ? (u.role === 'admin' ? 'admin' : 'super_admin') : u.role,
      is_super: !!u.is_super,
      admin_perms: u.is_super ? parsePerms(u.admin_perms) : undefined,
    };
    if (!u.tenant_id) return { user, shop: null, subscription: null };
    const t = await this.db.one<any>(`SELECT ${SHOP_FIELDS} FROM tenants WHERE id = ?`, [u.tenant_id]);
    return { user, shop: shopOut(t), subscription: subscriptionOf(t) };
  }

  logout(u: AuthUser) {
    return this.db.run('UPDATE sessions SET revoked = 1 WHERE id = ?', [u.sessionId]);
  }

  async changePassword(u: AuthUser, current: string, next: string) {
    const row = await this.db.one<any>('SELECT password_hash FROM users WHERE id = ?', [u.id]);
    if (!row || !(await bcrypt.compare(current, row.password_hash))) throw new BadRequestException('Current password is wrong');
    await this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(next, 10), u.id]);
    // Sign out every other device.
    await this.db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND id <> ?', [u.id, u.sessionId]);
  }

  /** Forgot password: a code from the email sets a new password and signs out every device. */
  async resetPassword(rawEmail: string, code: string, next: string) {
    const email = rawEmail.trim().toLowerCase();
    const u = await this.db.one<any>('SELECT id, active FROM users WHERE email = ?', [email]);
    // Unknown email: the same answer as a wrong code, so accounts cannot be guessed.
    if (!u || !u.active) throw new BadRequestException({ message: 'This code has expired. Click Get code for a new one.', code: 'CODE_EXPIRED' });
    await this.codes.consume(email, 'reset', code);
    await this.db.run('UPDATE users SET password_hash = ?, email_verified_at = IFNULL(email_verified_at, NOW()) WHERE id = ?', [await bcrypt.hash(next, 10), u.id]);
    await this.db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [u.id]);
    return { ok: true };
  }

  async updateMe(u: AuthUser, b: { name: string; email: string }) {
    const email = b.email || null;
    await this.assertFree(this.db, null, email, u.id);
    await this.db.run('UPDATE users SET name = ?, email = ? WHERE id = ?', [b.name, email, u.id]);
    return this.profile(u.id);
  }

  sessions(u: AuthUser) {
    return this.db
      .all<any>(
        `SELECT id, client, device, ip, created_at, last_seen_at, last_sync_at FROM sessions
         WHERE user_id = ? AND revoked = 0 AND expires_at > NOW() ORDER BY last_seen_at DESC`,
        [u.id],
      )
      .then((rows) => rows.map((r) => ({ ...r, current: r.id === u.sessionId })));
  }

  async revokeSession(u: AuthUser, id: number) {
    await this.db.run('UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ?', [id, u.id]);
  }
}

export function shopOut(t: any) {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    owner_name: t.owner_name,
    phone: t.phone,
    address: t.address,
    currency: t.currency,
    receipt_note: t.receipt_note,
    profile_updated_at: Number(t.profile_updated_at),
    created_at: t.created_at,
  };
}
