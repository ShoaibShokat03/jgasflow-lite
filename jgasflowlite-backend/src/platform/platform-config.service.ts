import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Db } from '../db/db.service';
import { ENV } from '../config/env';
import { DEFAULT_PLANS, OFFLINE_PLAN_DEFAULT, Plan, PLAN, PLANS, setPlans } from '../billing/plans';

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
  // Plans are paid by bank transfer only. pay_bank is the old one-line text,
  // shown only while the separate bank fields are empty.
  bank_name: '',
  bank_title: '',
  bank_account: '',
  bank_iban: '',
  bank_branch: '',
  pay_bank: ENV.payTo.bank,
  trial_days: String(ENV.trialDays),
  shop_app_url: process.env.SHOP_APP_URL || 'http://localhost:5002',
  // Email (SMTP) for sign-up codes and password reset. smtp_pass is stored encrypted.
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: 'starttls',
  smtp_user: '',
  smtp_pass: '',
  smtp_from_email: '',
  smtp_from_name: 'JGasFlow',
  signup_email_verify: '1',
});

/** Settings never sent back to the console as they are. */
const SECRET_KEYS = new Set(['smtp_pass']);

// AES-256-GCM with a key made from the token secret: a database copy alone does not reveal the password.
const secretKey = () => createHash('sha256').update(`jgf-settings:${ENV.tokenSecret}`).digest();
function sealSecret(plain: string) {
  if (!plain) return '';
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `enc:${Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')}`;
}
function openSecret(stored: string) {
  if (!stored?.startsWith('enc:')) return stored || '';
  try {
    const raw = Buffer.from(stored.slice(4), 'base64');
    const d = createDecipheriv('aes-256-gcm', secretKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

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
    // Installs from before Offline plans existed get the Offline plan once
    // (deleting it in the console later is respected).
    const seeded = await this.db.one<any>("SELECT v FROM platform_settings WHERE k = 'offline_plan_seeded'");
    if (!seeded) {
      const has = await this.db.one<any>("SELECT plan_key FROM plans WHERE mode = 'offline' LIMIT 1");
      if (!has) await this.writePlan(OFFLINE_PLAN_DEFAULT());
      await this.db.run("INSERT INTO platform_settings (k, v) VALUES ('offline_plan_seeded', '1') ON DUPLICATE KEY UPDATE v = '1'");
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

  /** For the console: secrets are replaced by a "set" flag. */
  forConsole() {
    const out: Record<string, string | boolean> = { ...this.settings };
    for (const k of SECRET_KEYS) {
      out[`${k}_set`] = !!this.settings[k];
      out[k] = '';
    }
    return out;
  }

  /** SMTP settings ready to use (password decrypted), or null when email is not set up. */
  smtp() {
    const s = this.settings;
    if (!s.smtp_host?.trim() || !s.smtp_from_email?.trim()) return null;
    return {
      host: s.smtp_host.trim(),
      port: Number(s.smtp_port) || 587,
      secure: s.smtp_secure === 'ssl' ? 'ssl' : s.smtp_secure === 'none' ? 'none' : 'starttls',
      user: s.smtp_user?.trim() || '',
      pass: openSecret(s.smtp_pass),
      fromEmail: s.smtp_from_email.trim(),
      fromName: s.smtp_from_name?.trim() || 'JGasFlow',
    } as const;
  }

  /** New web sign-ups must confirm their email with a code (needs SMTP). */
  emailVerifyOn() {
    return this.settings.signup_email_verify !== '0' && !!this.smtp();
  }

  async reloadSettings() {
    const rows = await this.db.all<{ k: string; v: string }>('SELECT k, v FROM platform_settings');
    this.settings = { ...SETTING_DEFAULTS(), ...Object.fromEntries(rows.map((r) => [r.k, r.v])) };
  }

  async saveSettings(values: Partial<Record<SettingKey, string>>, by: number) {
    const allowed = new Set(Object.keys(SETTING_DEFAULTS()));
    for (const [k, v] of Object.entries(values)) {
      if (!allowed.has(k) || v === undefined) continue;
      // An empty secret from the console means "keep the saved one".
      if (SECRET_KEYS.has(k) && !String(v).trim()) continue;
      if (SECRET_KEYS.has(k)) {
        await this.db.run('INSERT INTO platform_settings (k, v, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by)', [k, sealSecret(String(v).trim()), by]);
        continue;
      }
      await this.db.run('INSERT INTO platform_settings (k, v, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by)', [k, String(v).trim().slice(0, 500), by]);
    }
    await this.reloadSettings();
    return this.forConsole();
  }

  /** Removes a saved secret (the console's "Remove password"). */
  async clearSecret(key: 'smtp_pass', by: number) {
    await this.db.run("INSERT INTO platform_settings (k, v, updated_by) VALUES (?, '', ?) ON DUPLICATE KEY UPDATE v = '', updated_by = VALUES(updated_by)", [key, by]);
    await this.reloadSettings();
    return this.forConsole();
  }

  /** What the shop app and website may see. */
  publicConfig() {
    const s = this.settings;
    return {
      support: { company: s.support_company, phone: s.support_phone, whatsapp: s.support_whatsapp, email: s.support_email, hours: s.support_hours },
      pay_to: { bank: this.bankText(), bank_details: this.bankDetails(), whatsapp: s.support_whatsapp },
      trial_days: this.trialDays(),
      email_verify: this.emailVerifyOn(),
      email_reset: !!this.smtp(),
    };
  }

  /** The bank account shops pay into, field by field (empty fields left out). */
  bankDetails() {
    const s = this.settings;
    const d = { bank: s.bank_name, title: s.bank_title, account: s.bank_account, iban: s.bank_iban, branch: s.bank_branch };
    return Object.values(d).some((v) => v?.trim()) ? d : null;
  }

  /** One line for receipts, old app versions and the assistant. */
  bankText() {
    const d = this.bankDetails();
    if (!d) return this.settings.pay_bank || '';
    return [d.bank && `Bank: ${d.bank}`, d.title && `Title: ${d.title}`, d.account && `Account: ${d.account}`, d.iban && `IBAN: ${d.iban}`, d.branch && `Branch: ${d.branch}`].filter(Boolean).join(', ');
  }

  // ───── plans

  async reloadPlans() {
    const rows = await this.db.all<any>('SELECT * FROM plans ORDER BY sort, price');
    setPlans(
      rows.map((r) => ({
        key: r.plan_key,
        mode: r.plan_key === 'trial' ? 'any' : r.mode === 'offline' ? 'offline' : 'online',
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
      `INSERT INTO plans (plan_key, name, price, users_limit, features, is_active, sort, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), users_limit = VALUES(users_limit), features = VALUES(features), is_active = VALUES(is_active), sort = VALUES(sort), mode = VALUES(mode)`,
      [p.key, p.name, p.price, p.users, JSON.stringify(p.features), p.is_active ? 1 : 0, p.sort, p.key === 'trial' ? 'any' : p.mode === 'offline' ? 'offline' : 'online'],
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
