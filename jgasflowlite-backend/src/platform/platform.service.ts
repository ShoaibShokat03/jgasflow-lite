import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'crypto';
import { Db } from '../db/db.service';
import { ENV } from '../config/env';
import { BillingService } from '../billing/billing.service';
import { PLAN, planAmount, subscriptionOf } from '../billing/plans';
import { normPhone } from '../common/rules';
import { addDays, round2, todayKey } from '../common/util';
import type { AuthUser } from '../auth/auth.decorators';
import { ADMIN_MODULES, isSuperAdmin, parsePerms } from './admin-modules';
import { fileKeys } from '../common/uploads';
import { PlatformConfig } from './platform-config.service';
import { SupportService } from '../support/support.service';

/** How long ago something happened, as an activity bucket. */
export function activityOf(last: string | null): 'active' | 'low' | 'idle' | 'dormant' | 'never' {
  if (!last) return 'never';
  const days = (Date.now() - new Date(String(last).replace(' ', 'T')).getTime()) / 86400000;
  if (days <= 2) return 'active';
  if (days <= 7) return 'low';
  if (days <= 30) return 'idle';
  return 'dormant';
}

const n = (v: unknown) => Number(v ?? 0);

export interface ShopQuery {
  q?: string;
  status?: string;
  plan?: string;
  mode?: string;
  activity?: string;
  sort?: string;
  page?: number;
  limit?: number;
  created_from?: string;
  created_to?: string;
}

/**
 * Everything the platform console reads and changes. Shops are tenants; their
 * business data is only ever summarised here, never edited.
 */
@Injectable()
export class PlatformService {
  /** One-time support-login codes (single API instance; codes live 60 s). */
  private usedCodes = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly billing: BillingService,
    private readonly config: PlatformConfig,
    private readonly support: SupportService,
  ) {}

  // ─────────────────────────── shops ───────────────────────────

  /** Every shop with its numbers. Filtering and sorting happen in memory: tenants are few. */
  async allShops() {
    const since = addDays(todayKey(), -29);
    const rows = await this.db.all<any>(
      `SELECT t.id, t.name, t.owner_name, t.phone, t.address, t.plan, t.status, t.mode, t.trial_ends_at, t.paid_until, t.created_at, t.last_active_at, t.admin_note,
         (SELECT COUNT(*) FROM devices d WHERE d.tenant_id = t.id AND d.status = 'active') AS devices,
         (SELECT MAX(d.last_seen) FROM devices d WHERE d.tenant_id = t.id) AS device_seen_at,
         (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.active = 1) AS users,
         (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id AND c.deleted = 0) AS customers,
         (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = t.id AND s.deleted = 0) AS sales,
         (SELECT IFNULL(SUM(s.total),0) FROM sales s WHERE s.tenant_id = t.id AND s.deleted = 0 AND s.date >= ?) AS sales_30d,
         (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = t.id AND s.deleted = 0 AND s.date >= ?) AS bills_30d,
         (SELECT MAX(s.date) FROM sales s WHERE s.tenant_id = t.id AND s.deleted = 0) AS last_sale_at,
         (SELECT COUNT(*) FROM sessions x JOIN users u2 ON u2.id = x.user_id WHERE u2.tenant_id = t.id AND x.client = 'mobile' AND x.revoked = 0 AND x.expires_at > NOW()) AS phones,
         (SELECT COUNT(*) FROM billing_requests b WHERE b.tenant_id = t.id AND b.status = 'pending') AS pending
       FROM tenants t`,
      [since, since],
    );
    return rows.map((t) => {
      const sub = subscriptionOf(t);
      return {
        id: t.id,
        name: t.name,
        owner_name: t.owner_name,
        phone: t.phone,
        address: t.address,
        plan: t.plan,
        mode: t.mode === 'offline' ? 'offline' : 'online',
        devices: n(t.devices),
        device_seen_at: t.device_seen_at,
        created_at: t.created_at,
        last_active_at: t.last_active_at,
        last_sale_at: t.last_sale_at,
        activity: activityOf(t.last_active_at),
        users: n(t.users),
        customers: n(t.customers),
        sales: n(t.sales),
        sales_30d: n(t.sales_30d),
        bills_30d: n(t.bills_30d),
        phones: n(t.phones),
        pending: n(t.pending),
        has_note: !!t.admin_note,
        subscription: sub,
        mrr: sub.status === 'active' && t.plan !== 'trial' ? PLAN[t.plan]?.price ?? 0 : 0,
      };
    });
  }

  async shops(q: ShopQuery) {
    let list = await this.allShops();
    const term = (q.q ?? '').trim().toLowerCase();
    if (term) list = list.filter((s) => [s.name, s.owner_name, s.phone, String(s.id)].some((x) => String(x ?? '').toLowerCase().includes(term)));
    if (q.plan) list = list.filter((s) => s.plan === q.plan);
    if (q.mode === 'offline' || q.mode === 'online') list = list.filter((s) => s.mode === q.mode);
    if (q.activity) list = list.filter((s) => s.activity === q.activity);
    if (q.created_from) list = list.filter((s) => String(s.created_at) >= q.created_from!);
    if (q.created_to) list = list.filter((s) => String(s.created_at).slice(0, 10) <= q.created_to!);
    switch (q.status) {
      case 'paid':
        list = list.filter((s) => s.subscription.status === 'active' && s.plan !== 'trial');
        break;
      case 'trial':
        list = list.filter((s) => s.subscription.status === 'active' && s.plan === 'trial');
        break;
      case 'expiring':
        list = list.filter((s) => s.subscription.status === 'active' && s.subscription.days_left <= 7);
        break;
      case 'expired':
      case 'suspended':
        list = list.filter((s) => s.subscription.status === q.status);
        break;
    }
    const sorters: Record<string, (a: any, b: any) => number> = {
      newest: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
      oldest: (a, b) => String(a.created_at).localeCompare(String(b.created_at)),
      name: (a, b) => a.name.localeCompare(b.name),
      sales: (a, b) => b.sales_30d - a.sales_30d,
      active: (a, b) => String(b.last_active_at ?? '').localeCompare(String(a.last_active_at ?? '')),
      expiry: (a, b) => (a.subscription.expires_at ?? '9').localeCompare(b.subscription.expires_at ?? '9'),
    };
    list.sort(sorters[q.sort ?? 'newest'] ?? sorters.newest);
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    return { items: list.slice((page - 1) * limit, page * limit), total: list.length, page, total_pages: Math.max(1, Math.ceil(list.length / limit)) };
  }

  async shop(id: number) {
    const t = await this.db.one<any>('SELECT * FROM tenants WHERE id = ?', [id]);
    if (!t) throw new NotFoundException('Shop not found');
    const since = addDays(todayKey(), -29);
    const [users, requests, events, counts, daily, phones, devices] = await Promise.all([
      this.db.all<any>(
        `SELECT u.id, u.name, u.phone, u.email, u.role, u.active, u.last_login_at, u.created_at,
           (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at,
           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked = 0 AND s.expires_at > NOW()) AS devices
         FROM users u WHERE u.tenant_id = ? ORDER BY FIELD(u.role, 'owner', 'manager', 'salesman'), u.id`,
        [id],
      ),
      this.db.all<any>('SELECT b.*, u.name AS sent_by FROM billing_requests b LEFT JOIN users u ON u.id = b.created_by WHERE b.tenant_id = ? ORDER BY b.id DESC LIMIT 50', [id]),
      this.db.all<any>('SELECT e.*, u.name AS by_name FROM billing_events e LEFT JOIN users u ON u.id = e.by_user WHERE e.tenant_id = ? ORDER BY e.id DESC LIMIT 60', [id]),
      this.db.one<any>(
        `SELECT (SELECT COUNT(*) FROM customers WHERE tenant_id = ? AND deleted = 0) AS customers,
                (SELECT COUNT(*) FROM suppliers WHERE tenant_id = ? AND deleted = 0) AS suppliers,
                (SELECT COUNT(*) FROM sales WHERE tenant_id = ? AND deleted = 0) AS sales,
                (SELECT IFNULL(SUM(total),0) FROM sales WHERE tenant_id = ? AND deleted = 0) AS sales_total,
                (SELECT COUNT(*) FROM purchases WHERE tenant_id = ? AND deleted = 0) AS purchases,
                (SELECT IFNULL(SUM(amount),0) FROM payments WHERE tenant_id = ? AND deleted = 0) AS payments_total,
                (SELECT MIN(date) FROM sales WHERE tenant_id = ? AND deleted = 0) AS first_sale_at,
                (SELECT MAX(date) FROM sales WHERE tenant_id = ? AND deleted = 0) AS last_sale_at`,
        [id, id, id, id, id, id, id, id],
      ),
      this.db.all<any>(
        `SELECT SUBSTR(date,1,10) AS day, COUNT(*) AS bills, SUM(total) AS total FROM sales
         WHERE tenant_id = ? AND deleted = 0 AND date >= ? GROUP BY day ORDER BY day`,
        [id, since],
      ),
      this.db.all<any>(
        `SELECT s.id, s.device, s.last_seen_at, s.last_sync_at, u.name AS user_name FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE u.tenant_id = ? AND s.client = 'mobile' AND s.revoked = 0 AND s.expires_at > NOW() ORDER BY s.last_sync_at DESC`,
        [id],
      ),
      this.db.all<any>(
        `SELECT d.id, d.device_id, d.model, d.app_version, d.status, d.first_seen, d.last_seen, d.released_at, u.name AS user_name
         FROM devices d LEFT JOIN users u ON u.id = d.user_id WHERE d.tenant_id = ? ORDER BY d.status = 'active' DESC, d.last_seen DESC`,
        [id],
      ),
    ]);
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const series = Array.from({ length: 30 }, (_, i) => {
      const day = addDays(since, i);
      const d = byDay.get(day);
      return { day, bills: n(d?.bills), total: n(d?.total) };
    });
    const { seq: _a, no_s: _b, no_p: _c, no_r: _d, ...shop } = t;
    return {
      shop: { ...shop, activity: activityOf(t.last_active_at) },
      subscription: subscriptionOf(t),
      users: users.map((u) => ({ ...u, active: !!u.active, devices: n(u.devices) })),
      requests: requests.map(({ proof_files, ...r }: any) => ({ ...r, proofs: fileKeys(proof_files).length })),
      events,
      counts: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, k.endsWith('_at') ? v : n(v)])),
      series,
      phones,
      devices,
    };
  }

  async updateShop(id: number, b: { name: string; owner_name: string; phone: string; address: string }, by: number) {
    const r = await this.db.run('UPDATE tenants SET name = ?, owner_name = ?, phone = ?, address = ?, profile_updated_at = ? WHERE id = ?', [b.name, b.owner_name, b.phone, b.address, Date.now(), id]);
    if (!r.affectedRows) throw new NotFoundException('Shop not found');
    await this.billing.event(this.db, id, 'profile_edited', 'Shop details edited from the console', by);
    return this.shop(id);
  }

  async extend(id: number, plan: string, months: number, note: string, by: number) {
    await this.db.tx((q) => this.billing.extend(q, id, plan, months, by, note));
    return this.shop(id);
  }

  /** Set the end date exactly (corrections, custom deals). */
  async setExpiry(id: number, plan: string, until: string, note: string, by: number) {
    if (!PLAN[plan]) throw new BadRequestException('Unknown plan');
    const col = plan === 'trial' ? 'trial_ends_at' : 'paid_until';
    const r = await this.db.run(`UPDATE tenants SET plan = ?, ${col} = ? WHERE id = ?`, [plan, `${until} 23:59:59`, id]);
    if (!r.affectedRows) throw new NotFoundException('Shop not found');
    await this.billing.event(this.db, id, 'expiry_set', `${PLAN[plan].name} until ${until}${note ? `, ${note}` : ''}`, by);
    return this.shop(id);
  }

  async setStatus(id: number, status: 'active' | 'suspended', note: string, by: number) {
    const r = await this.db.run('UPDATE tenants SET status = ? WHERE id = ?', [status, id]);
    if (!r.affectedRows) throw new NotFoundException('Shop not found');
    if (status === 'suspended') {
      await this.db.run('UPDATE sessions s JOIN users u ON u.id = s.user_id SET s.revoked = 1 WHERE u.tenant_id = ?', [id]);
    }
    await this.billing.event(this.db, id, status === 'suspended' ? 'suspended' : 'reactivated', note, by);
    return this.shop(id);
  }

  async setNote(id: number, note: string) {
    await this.db.run('UPDATE tenants SET admin_note = ? WHERE id = ?', [note, id]);
    return { ok: true };
  }

  // ───── shop users

  private async shopUser(id: number) {
    const u = await this.db.one<any>('SELECT * FROM users WHERE id = ? AND is_super = 0', [id]);
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async resetPassword(id: number, password: string, by: number) {
    const u = await this.shopUser(id);
    await this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), id]);
    await this.db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [id]);
    await this.billing.event(this.db, u.tenant_id, 'password_reset', `${u.name}`, by);
    return { ok: true };
  }

  async logoutUser(id: number, by: number) {
    const u = await this.shopUser(id);
    await this.db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [id]);
    await this.billing.event(this.db, u.tenant_id, 'logged_out', `${u.name}, all devices`, by);
    return { ok: true };
  }

  /**
   * Support login: a 60-second, one-time code for the shop app, which trades
   * it for a normal session of the shop owner. Every use is in the shop's log.
   */
  async impersonate(shopId: number, admin: AuthUser) {
    const owner = await this.db.one<any>("SELECT id, name FROM users WHERE tenant_id = ? AND role = 'owner' AND active = 1 ORDER BY id LIMIT 1", [shopId]);
    if (!owner) throw new BadRequestException('This shop has no active owner login');
    const body = Buffer.from(JSON.stringify({ u: owner.id, a: admin.id, exp: Date.now() + 60000, n: randomBytes(6).toString('hex') })).toString('base64url');
    const code = `${body}.${createHmac('sha256', ENV.tokenSecret).update(`imp:${body}`).digest('base64url')}`;
    await this.billing.event(this.db, shopId, 'support_login', `By ${admin.name}`, admin.id);
    return { code, url: `${this.config.get('shop_app_url').replace(/\/+$/, '')}/impersonate?code=${encodeURIComponent(code)}` };
  }

  /** Returns the owner user id for a valid, unused code. */
  redeemCode(code: string): { userId: number; adminId: number } {
    const [body, mac] = String(code).split('.');
    const expected = createHmac('sha256', ENV.tokenSecret).update(`imp:${body}`).digest('base64url');
    if (!body || mac !== expected || this.usedCodes.has(code)) throw new ForbiddenException('This support link has expired. Open it again from the console.');
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Date.now()) throw new ForbiddenException('This support link has expired. Open it again from the console.');
    this.usedCodes.add(code);
    setTimeout(() => this.usedCodes.delete(code), 120000).unref?.();
    return { userId: Number(p.u), adminId: Number(p.a) };
  }

  // ─────────────────────────── payments ───────────────────────────

  async payments(q: { status?: string; q?: string; shop_id?: number; page?: number; limit?: number }) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.status && q.status !== 'all') {
      where.push('b.status = ?');
      args.push(q.status);
    }
    if (q.shop_id) {
      where.push('b.tenant_id = ?');
      args.push(q.shop_id);
    }
    if (q.q?.trim()) {
      where.push('(t.name LIKE ? OR b.txn_ref LIKE ? OR t.phone LIKE ?)');
      const like = `%${q.q.trim()}%`;
      args.push(like, like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const total = await this.db.one<any>(`SELECT COUNT(*) AS n, IFNULL(SUM(b.amount),0) AS amount FROM billing_requests b JOIN tenants t ON t.id = b.tenant_id ${w}`, args);
    const items = await this.db.all<any>(
      `SELECT b.*, t.name AS shop_name, t.phone AS shop_phone, t.plan AS current_plan, u.name AS sent_by, r.name AS reviewed_by_name
       FROM billing_requests b JOIN tenants t ON t.id = b.tenant_id LEFT JOIN users u ON u.id = b.created_by LEFT JOIN users r ON r.id = b.reviewed_by
       ${w} ORDER BY b.status = 'pending' DESC, b.id DESC LIMIT ? OFFSET ?`,
      [...args, limit, (page - 1) * limit],
    );
    return {
      items: items.map(({ proof_files, ...i }) => ({ ...i, amount: n(i.amount), proofs: fileKeys(proof_files).length })),
      total: n(total?.n),
      amount: n(total?.amount),
      page,
      total_pages: Math.max(1, Math.ceil(n(total?.n) / limit)),
    };
  }

  async approve(id: number, note: string, by: number) {
    await this.db.tx(async (q) => {
      const r = await q.one<any>('SELECT * FROM billing_requests WHERE id = ? FOR UPDATE', [id]);
      if (!r) throw new NotFoundException('Payment not found');
      if (r.status !== 'pending') throw new BadRequestException('This payment is already handled');
      await q.run("UPDATE billing_requests SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?", [by, note, id]);
      await this.billing.extend(q, r.tenant_id, r.plan, r.months, by, `payment ${r.method} ${r.txn_ref}`);
    });
    return { ok: true };
  }

  async reject(id: number, note: string, by: number) {
    const r = await this.db.one<any>('SELECT * FROM billing_requests WHERE id = ?', [id]);
    if (!r) throw new NotFoundException('Payment not found');
    if (r.status !== 'pending') throw new BadRequestException('This payment is already handled');
    await this.db.run("UPDATE billing_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?", [by, note, id]);
    await this.billing.event(this.db, r.tenant_id, 'payment_rejected', note, by);
    return { ok: true };
  }

  /** Money received outside the app (cash at office, bank): recorded and applied at once. */
  async recordPayment(b: { shop_id: number; plan: string; months: number; amount?: number; method: string; txn_ref: string; note: string }, by: number) {
    if (!PLAN[b.plan] || b.plan === 'trial') throw new BadRequestException('Choose a paid plan');
    const shop = await this.db.one('SELECT id FROM tenants WHERE id = ?', [b.shop_id]);
    if (!shop) throw new NotFoundException('Shop not found');
    const amount = b.amount ?? planAmount(b.plan, b.months);
    await this.db.tx(async (q) => {
      await q.run(
        `INSERT INTO billing_requests (tenant_id, plan, months, amount, method, txn_ref, note, status, created_by, reviewed_by, reviewed_at, review_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, NOW(), 'Recorded in the console')`,
        [b.shop_id, b.plan, b.months, amount, b.method, b.txn_ref, b.note, by, by],
      );
      await this.billing.extend(q, b.shop_id, b.plan, b.months, by, `recorded ${b.method} ${b.txn_ref}`);
    });
    return { ok: true, amount };
  }

  // ─────────────────────────── overview & reports ───────────────────────────

  async overview() {
    const shops = await this.allShops();
    const today = todayKey();
    const since30 = addDays(today, -29);
    const active = shops.filter((s) => s.subscription.status === 'active');
    const [pending, revenue, months, signupsDaily, salesDaily, users, recentEvents, openSupport] = await Promise.all([
      this.db.all<any>(
        `SELECT b.id, b.plan, b.months, b.amount, b.method, b.txn_ref, b.proof_files, b.created_at, t.id AS shop_id, t.name AS shop_name
         FROM billing_requests b JOIN tenants t ON t.id = b.tenant_id WHERE b.status = 'pending' ORDER BY b.id`,
      ),
      this.db.one<any>(
        `SELECT IFNULL(SUM(CASE WHEN reviewed_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN amount END),0) AS month,
                IFNULL(SUM(CASE WHEN reviewed_at >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m-01') AND reviewed_at < DATE_FORMAT(NOW(), '%Y-%m-01') THEN amount END),0) AS last_month,
                IFNULL(SUM(amount),0) AS total FROM billing_requests WHERE status = 'approved'`,
      ),
      this.db.all<any>(
        `SELECT DATE_FORMAT(reviewed_at, '%Y-%m') AS m, SUM(amount) AS amount, COUNT(*) AS n FROM billing_requests
         WHERE status = 'approved' AND reviewed_at >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 11 MONTH), '%Y-%m-01') GROUP BY m ORDER BY m`,
      ),
      this.db.all<any>(`SELECT DATE(created_at) AS day, COUNT(*) AS n FROM tenants WHERE created_at >= ? GROUP BY day`, [since30]),
      this.db.all<any>(
        `SELECT SUBSTR(date,1,10) AS day, COUNT(*) AS bills, SUM(total) AS total FROM sales WHERE deleted = 0 AND date >= ? GROUP BY day`,
        [since30],
      ),
      this.db.one<any>("SELECT COUNT(*) AS n, SUM(role = 'owner') AS owners FROM users WHERE tenant_id IS NOT NULL AND active = 1"),
      this.recentEvents(12),
      this.support.openCount(),
    ]);
    const sd = new Map(signupsDaily.map((r) => [String(r.day).slice(0, 10), n(r.n)]));
    const sl = new Map(salesDaily.map((r) => [r.day, r]));
    const days = Array.from({ length: 30 }, (_, i) => addDays(since30, i));
    const monthsList = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 11 + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const mm = new Map(months.map((r) => [r.m, r]));
    const byActivity = (a: string) => shops.filter((s) => s.activity === a).length;
    const planMix = Object.values(PLAN).map((p) => ({ plan: p.key, name: p.name, shops: active.filter((s) => s.plan === p.key).length }));
    return {
      shops: shops.length,
      active_paid: active.filter((s) => s.plan !== 'trial').length,
      on_trial: active.filter((s) => s.plan === 'trial').length,
      offline_shops: shops.filter((s) => s.mode === 'offline').length,
      online_shops: shops.filter((s) => s.mode === 'online').length,
      offline_devices: shops.filter((s) => s.mode === 'offline').reduce((a, s) => a + s.devices, 0),
      expired: shops.filter((s) => s.subscription.status === 'expired').length,
      suspended: shops.filter((s) => s.subscription.status === 'suspended').length,
      expiring_7d: active.filter((s) => s.subscription.days_left <= 7).length,
      signups_30d: shops.filter((s) => String(s.created_at) >= since30).length,
      active_7d: shops.filter((s) => s.activity === 'active' || s.activity === 'low').length,
      users: n(users?.n),
      phones: shops.reduce((a, s) => a + s.phones, 0),
      mrr: shops.reduce((a, s) => a + s.mrr, 0),
      pending_requests: pending.length,
      open_support: openSupport,
      pending_amount: pending.reduce((a, p) => a + n(p.amount), 0),
      revenue_month: n(revenue?.month),
      revenue_last_month: n(revenue?.last_month),
      revenue_total: n(revenue?.total),
      platform_sales_30d: salesDaily.reduce((a, r) => a + n(r.total), 0),
      platform_bills_30d: salesDaily.reduce((a, r) => a + n(r.bills), 0),
      activity: { active: byActivity('active'), low: byActivity('low'), idle: byActivity('idle'), dormant: byActivity('dormant'), never: byActivity('never') },
      plan_mix: planMix,
      signups_daily: days.map((day) => ({ day, n: sd.get(day) ?? 0 })),
      sales_daily: days.map((day) => ({ day, bills: n(sl.get(day)?.bills), total: n(sl.get(day)?.total) })),
      revenue_monthly: monthsList.map((m) => ({ month: m, amount: n(mm.get(m)?.amount), payments: n(mm.get(m)?.n) })),
      pending: pending.slice(0, 8).map(({ proof_files, ...p }) => ({ ...p, amount: n(p.amount), proofs: fileKeys(proof_files).length })),
      expiring: active
        .filter((s) => s.subscription.days_left <= 7)
        .sort((a, b) => a.subscription.days_left - b.subscription.days_left)
        .slice(0, 8),
      top_shops: [...shops].sort((a, b) => b.sales_30d - a.sales_30d).filter((s) => s.sales_30d > 0).slice(0, 8),
      recent_signups: [...shops].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8),
      recent_events: recentEvents,
    };
  }

  recentEvents(limit = 50, shopId?: number, before?: number) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (shopId) {
      where.push('e.tenant_id = ?');
      args.push(shopId);
    }
    if (before) {
      where.push('e.id < ?');
      args.push(before);
    }
    return this.db.all<any>(
      `SELECT e.*, t.name AS shop_name, u.name AS by_name, u.is_super AS by_admin FROM billing_events e
       JOIN tenants t ON t.id = e.tenant_id LEFT JOIN users u ON u.id = e.by_user
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.id DESC LIMIT ?`,
      [...args, Math.min(Math.max(limit, 1), 200)],
    );
  }

  async report(from?: string, to?: string) {
    const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : addDays(todayKey(), -364);
    const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? addDays(to, 1) : addDays(todayKey(), 1);
    const [revMonth, revPlan, revMethod, signups, salesMonth, conversions] = await Promise.all([
      this.db.all<any>(
        `SELECT DATE_FORMAT(reviewed_at, '%Y-%m') AS month, SUM(amount) AS amount, COUNT(*) AS payments FROM billing_requests
         WHERE status = 'approved' AND reviewed_at >= ? AND reviewed_at < ? GROUP BY month ORDER BY month`,
        [f, t],
      ),
      this.db.all<any>(
        `SELECT plan, SUM(amount) AS amount, COUNT(*) AS payments, SUM(months) AS months FROM billing_requests
         WHERE status = 'approved' AND reviewed_at >= ? AND reviewed_at < ? GROUP BY plan ORDER BY amount DESC`,
        [f, t],
      ),
      this.db.all<any>(
        `SELECT method, SUM(amount) AS amount, COUNT(*) AS payments FROM billing_requests
         WHERE status = 'approved' AND reviewed_at >= ? AND reviewed_at < ? GROUP BY method ORDER BY amount DESC`,
        [f, t],
      ),
      this.db.all<any>(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS shops, SUM(plan <> 'trial') AS paid_now FROM tenants
         WHERE created_at >= ? AND created_at < ? GROUP BY month ORDER BY month`,
        [f, t],
      ),
      this.db.all<any>(
        `SELECT SUBSTR(date,1,7) AS month, COUNT(*) AS bills, SUM(total) AS total, COUNT(DISTINCT tenant_id) AS shops FROM sales
         WHERE deleted = 0 AND date >= ? AND date < ? GROUP BY month ORDER BY month`,
        [f, t],
      ),
      this.db.one<any>(
        `SELECT COUNT(*) AS signups, SUM(plan <> 'trial') AS converted,
                SUM(EXISTS(SELECT 1 FROM sales s WHERE s.tenant_id = tenants.id AND s.deleted = 0)) AS made_sale
         FROM tenants WHERE created_at >= ? AND created_at < ?`,
        [f, t],
      ),
    ]);
    const num = (rows: any[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'month' || k === 'plan' || k === 'method' ? v : n(v)])));
    return {
      from: f,
      to: addDays(t, -1),
      revenue_total: revMonth.reduce((a, r) => a + n(r.amount), 0),
      revenue_by_month: num(revMonth),
      revenue_by_plan: num(revPlan).map((r: any) => ({ ...r, name: PLAN[r.plan]?.name ?? r.plan })),
      revenue_by_method: num(revMethod),
      signups_by_month: num(signups),
      sales_by_month: num(salesMonth),
      conversion: {
        signups: n(conversions?.signups),
        converted: n(conversions?.converted),
        made_sale: n(conversions?.made_sale),
        rate: n(conversions?.signups) ? round2((n(conversions?.converted) / n(conversions?.signups)) * 100) : 0,
      },
    };
  }

  // ─────────────────────────── platform admins ───────────────────────────

  modulesCatalog() {
    return ADMIN_MODULES;
  }

  async admins() {
    const rows = await this.db.all<any>(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.admin_perms, u.active, u.last_login_at, u.created_at,
         (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at
       FROM users u WHERE u.is_super = 1 ORDER BY u.id`,
    );
    return rows.map((r) => ({ ...r, role: r.role === 'admin' ? 'admin' : 'super_admin', modules: parsePerms(r.admin_perms), active: !!r.active, admin_perms: undefined }));
  }

  async saveAdmin(b: { name: string; email: string; phone: string; role: 'super_admin' | 'admin'; modules: string[] | null; password?: string; active: boolean }, me: AuthUser, id?: number) {
    if (!isSuperAdmin(me)) throw new ForbiddenException('Only a super admin can manage admins');
    const email = b.email.trim().toLowerCase();
    const phone = b.phone ? normPhone(b.phone) : null;
    const dup = await this.db.one<any>('SELECT id FROM users WHERE (email = ? OR (? IS NOT NULL AND phone = ?)) AND id <> ?', [email, phone, phone, id ?? 0]);
    if (dup) throw new BadRequestException('This email or phone is already used by another login');
    const perms = b.role === 'admin' ? JSON.stringify((b.modules ?? []).filter((m) => ADMIN_MODULES.some((x) => x.key === m))) : null;
    if (!id) {
      if (!b.password) throw new BadRequestException('Set a password');
      const r = await this.db.run("INSERT INTO users (tenant_id, name, email, phone, password_hash, role, is_super, admin_perms, active) VALUES (NULL, ?, ?, ?, ?, ?, 1, ?, ?)", [
        b.name,
        email,
        phone,
        await bcrypt.hash(b.password, 10),
        b.role,
        perms,
        b.active ? 1 : 0,
      ]);
      return { id: r.insertId };
    }
    const cur = await this.db.one<any>('SELECT * FROM users WHERE id = ? AND is_super = 1', [id]);
    if (!cur) throw new NotFoundException('Admin not found');
    if (id === me.id && (!b.active || b.role !== 'super_admin')) throw new BadRequestException('You cannot remove your own super admin access');
    await this.db.run('UPDATE users SET name = ?, email = ?, phone = ?, role = ?, admin_perms = ?, active = ? WHERE id = ?', [b.name, email, phone, b.role, perms, b.active ? 1 : 0, id]);
    if (b.password) await this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(b.password, 10), id]);
    if (b.password || !b.active || b.role !== cur.role) await this.db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [id]);
    return { id };
  }

  async removeAdmin(id: number, me: AuthUser) {
    if (!isSuperAdmin(me)) throw new ForbiddenException('Only a super admin can manage admins');
    if (id === me.id) throw new BadRequestException('You cannot remove yourself');
    const r = await this.db.run('UPDATE users SET active = 0 WHERE id = ? AND is_super = 1', [id]);
    if (!r.affectedRows) throw new NotFoundException('Admin not found');
    await this.db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [id]);
    return { ok: true };
  }
}
