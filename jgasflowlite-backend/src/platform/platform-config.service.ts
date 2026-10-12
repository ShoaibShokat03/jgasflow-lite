import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Db } from '../db/db.service';
import { ENV } from '../config/env';
import { DEFAULT_PLANS, Plan, PLAN, PLANS, setPlans } from '../billing/plans';

/**
 * Platform-wide settings edited in the admin console. Defaults come from
 * .env so a fresh install works before anyone opens the console.
 */
export const SETTING_DEFAULTS = (): Record<string, string> => ({
  support_company: 'Jantrah Tech',
  support_phone: '+92 303 3203444',
  support_whatsapp: '923033203444',
  support_email: '',
  support_hours: 'Monday to Saturday, 9 am to 9 pm',
  pay_jazzcash: ENV.payTo.jazzcash,
  pay_easypaisa: ENV.payTo.easypaisa,
  pay_bank: ENV.payTo.bank,
  trial_days: String(ENV.trialDays),
  shop_app_url: process.env.SHOP_APP_URL || 'http://localhost:5002',
});

export type SettingKey = keyof ReturnType<typeof SETTING_DEFAULTS>;

@Injectable()
export class PlatformConfig implements OnModuleInit {
  private settings: Record<string, string> = SETTING_DEFAULTS();

  constructor(private readonly db: Db) {}

  async onModuleInit() {
    const n = await this.db.one<any>('SELECT COUNT(*) AS n FROM plans');
    if (!Number(n?.n)) {
      for (const p of DEFAULT_PLANS) await this.writePlan(p);
    }
    await this.reloadPlans();
    await this.reloadSettings();
  }

  // ───── settings

  get(key: SettingKey): string {
    return this.settings[key] ?? '';
  }

  trialDays(): number {
    return Math.min(Math.max(Number(this.settings.trial_days) || ENV.trialDays, 1), 90);
  }

  all() {
    return { ...this.settings };
  }

  async reloadSettings() {
    const rows = await this.db.all<{ k: string; v: string }>('SELECT k, v FROM platform_settings');
    this.settings = { ...SETTING_DEFAULTS(), ...Object.fromEntries(rows.map((r) => [r.k, r.v])) };
  }

  async saveSettings(values: Partial<Record<SettingKey, string>>, by: number) {
    const allowed = new Set(Object.keys(SETTING_DEFAULTS()));
    for (const [k, v] of Object.entries(values)) {
      if (!allowed.has(k) || v === undefined) continue;
      await this.db.run('INSERT INTO platform_settings (k, v, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by)', [k, String(v).trim().slice(0, 500), by]);
    }
    await this.reloadSettings();
    return this.all();
  }

  /** What the shop app and website may see. */
  publicConfig() {
    const s = this.settings;
    return {
      support: { company: s.support_company, phone: s.support_phone, whatsapp: s.support_whatsapp, email: s.support_email, hours: s.support_hours },
      pay_to: { jazzcash: s.pay_jazzcash, easypaisa: s.pay_easypaisa, bank: s.pay_bank, whatsapp: s.support_whatsapp },
      trial_days: this.trialDays(),
    };
  }

  // ───── plans

  async reloadPlans() {
    const rows = await this.db.all<any>('SELECT * FROM plans ORDER BY sort, price');
    setPlans(
      rows.map((r) => ({
        key: r.plan_key,
        name: r.name,
        price: Number(r.price),
        users: Number(r.users_limit),
        features: safeList(r.features),
        is_active: !!r.is_active,
        sort: Number(r.sort),
      })),
    );
  }

  private writePlan(p: Plan) {
    return this.db.run(
      `INSERT INTO plans (plan_key, name, price, users_limit, features, is_active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), users_limit = VALUES(users_limit), features = VALUES(features), is_active = VALUES(is_active), sort = VALUES(sort)`,
      [p.key, p.name, p.price, p.users, JSON.stringify(p.features), p.is_active ? 1 : 0, p.sort],
    );
  }

  async plansWithUsage() {
    const counts = await this.db.all<any>('SELECT plan, COUNT(*) AS n FROM tenants GROUP BY plan');
    const by = new Map(counts.map((c) => [c.plan, Number(c.n)]));
    return PLANS.map((p) => ({ ...p, shops: by.get(p.key) ?? 0 }));
  }

  async savePlan(input: Plan, isNew: boolean) {
    if (isNew && PLAN[input.key]) throw new BadRequestException('A plan with this key already exists');
    if (!isNew && !PLAN[input.key]) throw new NotFoundException('Plan not found');
    if (input.key === 'trial') {
      input.price = 0;
      input.is_active = true;
    } else if (input.price <= 0) {
      throw new BadRequestException('A paid plan needs a price above 0');
    }
    await this.writePlan(input);
    await this.reloadPlans();
    return PLAN[input.key];
  }

  /** Removes an unused plan; a plan shops are on is turned off instead. */
  async deletePlan(key: string) {
    if (key === 'trial') throw new BadRequestException('The free trial cannot be removed');
    if (!PLAN[key]) throw new NotFoundException('Plan not found');
    const used = await this.db.one<any>('SELECT COUNT(*) AS n FROM tenants WHERE plan = ?', [key]);
    const reqs = await this.db.one<any>('SELECT COUNT(*) AS n FROM billing_requests WHERE plan = ?', [key]);
    if (Number(used?.n) || Number(reqs?.n)) {
      await this.db.run('UPDATE plans SET is_active = 0 WHERE plan_key = ?', [key]);
      await this.reloadPlans();
      return { deleted: false, hidden: true };
    }
    await this.db.run('DELETE FROM plans WHERE plan_key = ?', [key]);
    await this.reloadPlans();
    return { deleted: true, hidden: false };
  }
}

function safeList(v: unknown): string[] {
  try {
    const p = JSON.parse(String(v ?? '[]'));
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}
