import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { fileKeys, saveImages, sendImage } from '../common/uploads';
import { Db, Q } from '../db/db.service';
import { ENV } from '../config/env';
import { modeOfPlan, PLAN, paidPlans, planAmount, publicPlans, subscriptionOf } from './plans';
import { PlatformConfig } from '../platform/platform-config.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly db: Db,
    private readonly config: PlatformConfig,
  ) {}

  async overview(tenantId: number) {
    const t = await this.db.one<any>('SELECT plan, status, mode, trial_ends_at, paid_until FROM tenants WHERE id = ?', [tenantId]);
    const requests = await this.db.all<any>(
      'SELECT id, plan, months, amount, method, txn_ref, note, proof_files, status, review_note, created_at, reviewed_at FROM billing_requests WHERE tenant_id = ? ORDER BY id DESC LIMIT 30',
      [tenantId],
    );
    return {
      subscription: subscriptionOf(t),
      // An Offline shop may renew Offline or upgrade to Online; an Online shop stays Online.
      plans: publicPlans(this.config.trialDays()).filter((p) => p.mode === 'any' || t.mode === 'offline' || p.mode === 'online'),
      pay_to: this.config.publicConfig().pay_to,
      requests: requests.map(({ proof_files, ...r }) => ({ ...r, proofs: fileKeys(proof_files).length })),
    };
  }

  /** Streams screenshot n of a payment; `tenantId` limits a shop to its own payments. */
  async sendProof(res: Response, id: number, n: number, tenantId?: number) {
    const r = await this.db.one<any>('SELECT tenant_id, proof_files FROM billing_requests WHERE id = ?', [id]);
    if (!r || (tenantId != null && r.tenant_id !== tenantId)) throw new NotFoundException('Payment not found');
    sendImage(res, fileKeys(r.proof_files)[n]);
  }

  async request(tenantId: number, userId: number, b: { plan: string; months: number; method: string; txn_ref: string; note: string }, files?: Express.Multer.File[]) {
    if (!paidPlans().some((p) => p.key === b.plan)) throw new BadRequestException('Choose a plan');
    const shop = await this.db.one<any>('SELECT mode FROM tenants WHERE id = ?', [tenantId]);
    if (shop?.mode === 'online' && modeOfPlan(b.plan) === 'offline') throw new BadRequestException('Online shops cannot move to the Offline plan. Choose an Online plan.');
    if (!files?.length) throw new BadRequestException('Attach a screenshot of the bank transfer');
    const pending = await this.db.one('SELECT id FROM billing_requests WHERE tenant_id = ? AND status = ?', [tenantId, 'pending']);
    if (pending) throw new BadRequestException('You already have a payment waiting for approval. We will activate it soon.');
    const amount = planAmount(b.plan, b.months);
    const proofs = saveImages(files, 'payments', tenantId);
    const r = await this.db.run('INSERT INTO billing_requests (tenant_id, plan, months, amount, method, txn_ref, note, proof_files, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      tenantId,
      b.plan,
      b.months,
      amount,
      b.method,
      b.txn_ref,
      b.note,
      JSON.stringify(proofs),
      userId,
    ]);
    const ref = b.txn_ref ? ` ${b.txn_ref}` : '';
    await this.event(this.db, tenantId, 'payment_sent', `${PLAN[b.plan].name}, ${b.months} month(s), Rs ${amount}, bank${ref}, ${proofs.length} screenshot(s)`, userId);
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
      // Buying an Online plan upgrades an Offline shop; the plan decides the mode.
      const mode = modeOfPlan(plan) ?? (t.mode === 'offline' ? 'offline' : 'online');
      await q.run(`UPDATE tenants SET plan = ?, mode = ?, paid_until = DATE_ADD(${base}, INTERVAL ? MONTH) WHERE id = ?`, [plan, mode, months, tenantId]);
      if (mode !== t.mode) await this.event(q, tenantId, mode === 'online' ? 'upgraded_online' : 'moved_offline', `${PLAN[plan].name}`, by);
    }
    await this.event(q, tenantId, 'extended', `${PLAN[plan].name} +${months} month(s)${note ? `, ${note}` : ''}`, by);
  }
}
