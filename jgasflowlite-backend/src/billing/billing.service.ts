import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db, Q } from '../db/db.service';
import { ENV } from '../config/env';
import { PLAN, paidPlans, planAmount, publicPlans, subscriptionOf } from './plans';
import { PlatformConfig } from '../platform/platform-config.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly db: Db,
    private readonly config: PlatformConfig,
  ) {}

  async overview(tenantId: number) {
    const t = await this.db.one<any>('SELECT plan, status, trial_ends_at, paid_until FROM tenants WHERE id = ?', [tenantId]);
    const requests = await this.db.all<any>(
      'SELECT id, plan, months, amount, method, txn_ref, note, status, review_note, created_at, reviewed_at FROM billing_requests WHERE tenant_id = ? ORDER BY id DESC LIMIT 30',
      [tenantId],
    );
    return {
      subscription: subscriptionOf(t),
      plans: publicPlans(this.config.trialDays()),
      pay_to: this.config.publicConfig().pay_to,
      requests,
    };
  }

  async request(tenantId: number, userId: number, b: { plan: string; months: number; method: string; txn_ref: string; note: string }) {
    if (!paidPlans().some((p) => p.key === b.plan)) throw new BadRequestException('Choose a plan');
    const pending = await this.db.one('SELECT id FROM billing_requests WHERE tenant_id = ? AND status = ?', [tenantId, 'pending']);
    if (pending) throw new BadRequestException('You already have a payment waiting for approval. We will activate it soon.');
    const amount = planAmount(b.plan, b.months);
    const r = await this.db.run('INSERT INTO billing_requests (tenant_id, plan, months, amount, method, txn_ref, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      tenantId,
      b.plan,
      b.months,
      amount,
      b.method,
      b.txn_ref,
      b.note,
      userId,
    ]);
    await this.event(this.db, tenantId, 'payment_sent', `${PLAN[b.plan].name}, ${b.months} month(s), Rs ${amount}, ${b.method} ${b.txn_ref}`, userId);
    return { id: r.insertId, amount };
  }

  event(q: Q, tenantId: number, action: string, detail: string, by: number | null) {
    return q.run('INSERT INTO billing_events (tenant_id, action, detail, by_user) VALUES (?, ?, ?, ?)', [tenantId, action, detail.slice(0, 255), by]);
  }

  /**
   * Extend a plan by whole months from the later of now and the current expiry,
   * so paying early never loses days.
   */
  async extend(q: Q, tenantId: number, plan: string, months: number, by: number, note = '') {
    const t = await q.one<any>('SELECT * FROM tenants WHERE id = ? FOR UPDATE', [tenantId]);
    if (!t) throw new NotFoundException('Shop not found');
    if (!PLAN[plan]) throw new BadRequestException('Unknown plan');
    if (plan === 'trial') {
      await q.run('UPDATE tenants SET plan = ?, trial_ends_at = DATE_ADD(GREATEST(NOW(), IFNULL(trial_ends_at, NOW())), INTERVAL ? DAY) WHERE id = ?', ['trial', months * 30, tenantId]);
    } else {
      const base = t.plan === 'trial' ? 'NOW()' : 'GREATEST(NOW(), IFNULL(paid_until, NOW()))';
      await q.run(`UPDATE tenants SET plan = ?, paid_until = DATE_ADD(${base}, INTERVAL ? MONTH) WHERE id = ?`, [plan, months, tenantId]);
    }
    await this.event(q, tenantId, 'extended', `${PLAN[plan].name} +${months} month(s)${note ? `, ${note}` : ''}`, by);
  }
}
