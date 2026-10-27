import { ENV } from '../config/env';

/** offline: the phone app on one phone, no internet needed. online: web app and sync. any: the trial. */
export type PlanMode = 'offline' | 'online' | 'any';

export interface Plan {
  key: string;
  mode: PlanMode;
  name: string;
  /** Monthly price in PKR; 0 for the trial. */
  price: number;
  /** One-time price for lifetime access; 0 = not sold as lifetime. */
  lifetime_price: number;
  users: number;
  features: string[];
  is_active: boolean;
  sort: number;
}

/**
 * Plans live in the `plans` table and are edited in the admin console.
 * This in-memory copy (loaded at boot, refreshed on every change) keeps the
 * per-request subscription check free of database reads.
 */
export const PLANS: Plan[] = [];
export const PLAN: Record<string, Plan> = {};

/** First boot: the plans the business started with. */
export const DEFAULT_PLANS: Plan[] = [
  { key: 'trial', mode: 'any', name: 'Free trial', price: 0, lifetime_price: 0, users: 3, features: ['Web and mobile app', 'Up to 3 users'], is_active: true, sort: 0 },
  OFFLINE_PLAN_DEFAULT(),
  { key: 'basic', mode: 'online', name: 'Basic', price: 1500, lifetime_price: 0, users: 3, features: ['Web and mobile app', 'Online sync on all phones', 'Up to 3 users', 'Data export any time'], is_active: true, sort: 2 },
  { key: 'pro', mode: 'online', name: 'Pro', price: 3000, lifetime_price: 0, users: 15, features: ['Everything in Basic', 'Up to 15 users', 'Priority WhatsApp support'], is_active: true, sort: 3 },
];

/** The Offline plan added once to an existing install (its price is set in the console). */
export function OFFLINE_PLAN_DEFAULT(): Plan {
  return {
    key: 'offline',
    mode: 'offline',
    name: 'Offline',
    price: 500,
    lifetime_price: 0,
    users: 1,
    features: ['Android app that works without internet', 'One phone', 'Data stays on your phone', 'Backup to a file any time'],
    is_active: true,
    sort: 1,
  };
}

export function setPlans(rows: Plan[]) {
  const sorted = [...rows].sort((a, b) => a.sort - b.sort || a.price - b.price);
  PLANS.splice(0, PLANS.length, ...sorted);
  for (const k of Object.keys(PLAN)) delete PLAN[k];
  for (const p of sorted) PLAN[p.key] = p;
}
setPlans(DEFAULT_PLANS);

/** Plans a shop can buy now (optionally only one kind). */
export const paidPlans = (mode?: 'offline' | 'online') => PLANS.filter((p) => p.price > 0 && p.is_active && (!mode || p.mode === mode));

/** The kind of shop a plan makes: buying an Online plan upgrades an Offline shop. */
export const modeOfPlan = (key: string): 'offline' | 'online' | null => {
  const m = PLAN[key]?.mode;
  return m === 'offline' || m === 'online' ? m : null;
};

/** `months` value that means lifetime access (one payment, never ends). */
export const LIFETIME = 0;

/** Days left reported for lifetime access, so "ending soon" checks never match. */
export const LIFETIME_DAYS = 99999;

/** "Lifetime" or "3 month(s)", for events and notes. */
export const termLabel = (months: number) => (months === LIFETIME ? 'Lifetime' : `${months} month(s)`);

/** Whether a plan can be bought for life. */
export const sellsLifetime = (plan: string) => (PLAN[plan]?.lifetime_price ?? 0) > 0 && plan !== 'trial';

/** Discount for paying several months at once; LIFETIME is the plan's one-time price. */
export function planAmount(plan: string, months: number): number {
  const p = PLAN[plan];
  if (!p) return 0;
  if (months === LIFETIME) return p.lifetime_price || 0;
  const off = months >= 12 ? 0.2 : months >= 6 ? 0.1 : 0;
  return Math.round(p.price * months * (1 - off));
}

/** Plans for the website and the Subscription page, with the trial length. */
export function publicPlans(trialDays = ENV.trialDays) {
  return PLANS.filter((p) => p.is_active).map((p) => ({
    ...p,
    features: p.key === 'trial' ? [`${trialDays} days free`, ...p.features] : p.features,
    // months 0 = lifetime (only when the plan has a lifetime price)
    prices: [...[1, 3, 6, 12], ...(sellsLifetime(p.key) ? [LIFETIME] : [])].map((m) => ({ months: m, amount: planAmount(p.key, m) })),
  }));
}

export type SubStatus = 'active' | 'expired' | 'suspended';

export interface Subscription {
  plan: string;
  plan_name: string;
  status: SubStatus;
  expires_at: string | null;
  days_left: number;
  users_limit: number;
  read_only: boolean;
  /** offline: phone app only, no web app or sync until upgraded. online: everything. */
  mode: 'offline' | 'online';
  /** Paid once, never ends (only suspension stops it). */
  lifetime: boolean;
}

/** Works from a tenants row (trial_ends_at / paid_until are 'YYYY-MM-DD HH:mm:ss'). */
export function subscriptionOf(t: { plan: string; status: string; trial_ends_at: string | null; paid_until: string | null; mode?: string | null; lifetime?: number | boolean | null }): Subscription {
  const plan = PLAN[t.plan] ?? PLAN.trial ?? DEFAULT_PLANS[0];
  if (Number(t.lifetime) && t.plan !== 'trial') {
    const status: SubStatus = t.status === 'suspended' ? 'suspended' : 'active';
    return {
      plan: t.plan,
      plan_name: plan.name,
      status,
      expires_at: null,
      days_left: status === 'active' ? LIFETIME_DAYS : 0,
      users_limit: plan.users,
      read_only: status !== 'active',
      mode: t.mode === 'offline' ? 'offline' : 'online',
      lifetime: true,
    };
  }
  const expires = t.plan === 'trial' ? t.trial_ends_at : t.paid_until;
  const ms = expires ? new Date(expires.replace(' ', 'T')).getTime() - Date.now() : -1;
  const status: SubStatus = t.status === 'suspended' ? 'suspended' : ms > 0 ? 'active' : 'expired';
  return {
    plan: t.plan,
    plan_name: plan.name,
    status,
    expires_at: expires,
    days_left: ms > 0 ? Math.ceil(ms / 86400000) : 0,
    users_limit: plan.users,
    read_only: status !== 'active',
    mode: t.mode === 'offline' ? 'offline' : 'online',
    lifetime: false,
  };
}
