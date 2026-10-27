import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Db } from '../db/db.service';
import { parse, z } from '../common/util';
import { zPassword, zText } from '../common/rules';
import { AuthUser, CurrentUser, SuperAdmin } from '../auth/auth.decorators';
import { BillingService } from '../billing/billing.service';
import { PLAN, subscriptionOf } from '../billing/plans';

/** Platform owner screens: every shop, payments to approve, plan changes. */
@SuperAdmin()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly db: Db,
    private readonly billing: BillingService,
  ) {}

  @Get('overview')
  async overview() {
    const shops = await this.db.all<any>('SELECT plan, status, trial_ends_at, paid_until, lifetime, created_at, last_active_at FROM tenants');
    const subs = shops.map((t) => ({ ...subscriptionOf(t), created_at: t.created_at, last_active_at: t.last_active_at }));
    const since = (days: number) => Date.now() - days * 86400000;
    const ts = (s: string | null) => (s ? new Date(s.replace(' ', 'T')).getTime() : 0);
    const [pending, revenue, users] = await Promise.all([
      this.db.one<any>("SELECT COUNT(*) AS n, IFNULL(SUM(amount),0) AS a FROM billing_requests WHERE status = 'pending'"),
      this.db.one<any>(
        `SELECT IFNULL(SUM(CASE WHEN reviewed_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN amount END),0) AS month,
                IFNULL(SUM(amount),0) AS total FROM billing_requests WHERE status = 'approved'`,
      ),
      this.db.one<any>('SELECT COUNT(*) AS n FROM users WHERE tenant_id IS NOT NULL AND active = 1'),
    ]);
    return {
      shops: subs.length,
      active_paid: subs.filter((s) => s.status === 'active' && s.plan !== 'trial').length,
      on_trial: subs.filter((s) => s.status === 'active' && s.plan === 'trial').length,
      expired: subs.filter((s) => s.status === 'expired').length,
      suspended: subs.filter((s) => s.status === 'suspended').length,
      expiring_7d: subs.filter((s) => s.status === 'active' && s.days_left <= 7).length,
      signups_30d: subs.filter((s) => ts(s.created_at) > since(30)).length,
      active_7d: subs.filter((s) => ts(s.last_active_at) > since(7)).length,
      users: Number(users?.n ?? 0),
      pending_requests: Number(pending?.n ?? 0),
      pending_amount: Number(pending?.a ?? 0),
      revenue_month: Number(revenue?.month ?? 0),
      revenue_total: Number(revenue?.total ?? 0),
    };
  }

  @Get('shops')
  async shops(@Query('q') q = '', @Query('status') status = '') {
    const qq = q.trim();
    const rows = await this.db.all<any>(
      `SELECT t.id, t.name, t.owner_name, t.phone, t.address, t.plan, t.status, t.trial_ends_at, t.paid_until, t.lifetime, t.created_at, t.last_active_at,
         (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.active = 1) AS users,
         (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = t.id AND s.deleted = 0) AS sales,
         (SELECT COUNT(*) FROM billing_requests b WHERE b.tenant_id = t.id AND b.status = 'pending') AS pending
       FROM tenants t ${qq ? 'WHERE t.name LIKE ? OR t.owner_name LIKE ? OR t.phone LIKE ?' : ''}
       ORDER BY t.id DESC LIMIT 1000`,
      qq ? [`%${qq}%`, `%${qq}%`, `%${qq}%`] : [],
    );
    const list = rows.map((t) => ({ ...t, users: Number(t.users), sales: Number(t.sales), pending: Number(t.pending), subscription: subscriptionOf(t) }));
    return status ? list.filter((t) => t.subscription.status === status || (status === 'trial' && t.plan === 'trial' && t.subscription.status === 'active')) : list;
  }

  @Get('shops/:id')
  async shop(@Param('id', ParseIntPipe) id: number) {
    const t = await this.db.one<any>('SELECT * FROM tenants WHERE id = ?', [id]);
    if (!t) throw new NotFoundException('Shop not found');
    const [users, requests, events, counts] = await Promise.all([
      this.db.all<any>('SELECT id, name, phone, email, role, active, last_login_at, created_at FROM users WHERE tenant_id = ? ORDER BY id', [id]),
      this.db.all<any>('SELECT * FROM billing_requests WHERE tenant_id = ? ORDER BY id DESC LIMIT 50', [id]),
      this.db.all<any>('SELECT e.*, u.name AS by_name FROM billing_events e LEFT JOIN users u ON u.id = e.by_user WHERE e.tenant_id = ? ORDER BY e.id DESC LIMIT 50', [id]),
      this.db.one<any>(
        `SELECT (SELECT COUNT(*) FROM customers WHERE tenant_id = ? AND deleted = 0) AS customers,
                (SELECT COUNT(*) FROM sales WHERE tenant_id = ? AND deleted = 0) AS sales,
                (SELECT COUNT(*) FROM purchases WHERE tenant_id = ? AND deleted = 0) AS purchases,
                (SELECT IFNULL(SUM(total),0) FROM sales WHERE tenant_id = ? AND deleted = 0) AS sales_total`,
        [id, id, id, id],
      ),
    ]);
    const { seq: _seq, no_s: _a, no_p: _b, no_r: _c, ...shop } = t;
    return { shop, subscription: subscriptionOf(t), users: users.map((x) => ({ ...x, active: !!x.active })), requests, events, counts };
  }

  @Post('shops/:id/extend')
  async extend(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ plan: z.string(), months: z.coerce.number().int().min(0).max(36), note: zText(200) }), body);
    if (!PLAN[b.plan]) throw new BadRequestException('Unknown plan');
    await this.db.tx((q) => this.billing.extend(q, id, b.plan, b.months, u.id, b.note));
    return this.shop(id);
  }

  @Post('shops/:id/status')
  async status(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ status: z.enum(['active', 'suspended']), note: zText(200) }), body);
    const r = await this.db.run('UPDATE tenants SET status = ? WHERE id = ?', [b.status, id]);
    if (!r.affectedRows) throw new NotFoundException('Shop not found');
    await this.billing.event(this.db, id, b.status === 'suspended' ? 'suspended' : 'reactivated', b.note, u.id);
    return this.shop(id);
  }

  @Post('shops/:id/note')
  async note(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ note: zText(2000) }), body);
    await this.db.run('UPDATE tenants SET admin_note = ? WHERE id = ?', [b.note, id]);
    return { ok: true };
  }

  @Post('users/:id/password')
  async resetPassword(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ password: zPassword }), body);
    const user = await this.db.one<any>('SELECT tenant_id FROM users WHERE id = ? AND is_super = 0', [id]);
    if (!user) throw new NotFoundException('User not found');
    await this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(b.password, 10), id]);
    await this.db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [id]);
    await this.billing.event(this.db, user.tenant_id, 'password_reset', `User #${id}`, u.id);
    return { ok: true };
  }

  @Get('requests')
  requests(@Query('status') status = 'pending') {
    return this.db.all<any>(
      `SELECT b.*, t.name AS shop_name, t.phone AS shop_phone, t.plan AS current_plan, u.name AS sent_by
       FROM billing_requests b JOIN tenants t ON t.id = b.tenant_id LEFT JOIN users u ON u.id = b.created_by
       ${status === 'all' ? '' : 'WHERE b.status = ?'} ORDER BY b.id DESC LIMIT 300`,
      status === 'all' ? [] : [status],
    );
  }

  @Post('requests/:id/approve')
  async approve(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ note: zText(200) }), body);
    await this.db.tx(async (q) => {
      const r = await q.one<any>('SELECT * FROM billing_requests WHERE id = ? FOR UPDATE', [id]);
      if (!r) throw new NotFoundException('Request not found');
      if (r.status !== 'pending') throw new BadRequestException('This request is already handled');
      await q.run("UPDATE billing_requests SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?", [u.id, b.note, id]);
      await this.billing.extend(q, r.tenant_id, r.plan, r.months, u.id, `payment ${r.method} ${r.txn_ref}`);
    });
    return { ok: true };
  }

  @Post('requests/:id/reject')
  async reject(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ note: z.string().trim().min(3, 'Write a reason for the shop').max(200) }), body);
    const r = await this.db.one<any>('SELECT * FROM billing_requests WHERE id = ?', [id]);
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'pending') throw new BadRequestException('This request is already handled');
    await this.db.run("UPDATE billing_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?", [u.id, b.note, id]);
    await this.billing.event(this.db, r.tenant_id, 'payment_rejected', b.note, u.id);
    return { ok: true };
  }
}
