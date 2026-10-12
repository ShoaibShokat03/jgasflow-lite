import { ENV } from '../config/env';

export interface Plan {
  key: string;
  name: string;
  /** Monthly price in PKR; 0 for the trial. */
  price: number;
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
  { key: 'trial', name: 'Free trial', price: 0, users: 3, features: ['Web and mobile app', 'Up to 3 users'], is_active: true, sort: 0 },
  { key: 'basic', name: 'Basic', price: 1500, users: 3, features: ['Web and mobile app', 'Online sync on all phones', 'Up to 3 users', 'Data export any time'], is_active: true, sort: 1 },
  { key: 'pro', name: 'Pro', price: 3000, users: 15, features: ['Everything in Basic', 'Up to 15 users', 'Priority WhatsApp support'], is_active: true, sort: 2 },
];

export function setPlans(rows: Plan[]) {
  const sorted = [...rows].sort((a, b) => a.sort - b.sort || a.price - b.price);
  PLANS.splice(0, PLANS.length, ...sorted);
  for (const k of Object.keys(PLAN)) delete PLAN[k];
  for (const p of sorted) PLAN[p.key] = p;
}
setPlans(DEFAULT_PLANS);

/** Plans a shop can buy now. */
export const paidPlans = () => PLANS.filter((p) => p.price > 0 && p.is_active);

/** Discount for paying several months at once. */
export function planAmount(plan: string, months: number): number {
  const p = PLAN[plan];
  if (!p) return 0;
  const off = months >= 12 ? 0.2 : months >= 6 ? 0.1 : 0;
  return Math.round(p.price * months * (1 - off));
}

/** Plans for the website and the Subscription page, with the trial length. */
export function publicPlans(trialDays = ENV.trialDays) {
  return PLANS.filter((p) => p.is_active).map((p) => ({
    ...p,
    features: p.key === 'trial' ? [`${trialDays} days free`, ...p.features] : p.features,
    prices: [1, 3, 6, 12].map((m) => ({ months: m, amount: planAmount(p.key, m) })),
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
}

/** Works from a tenants row (trial_ends_at / paid_until are 'YYYY-MM-DD HH:mm:ss'). */
export function subscriptionOf(t: { plan: string; status: string; trial_ends_at: string | null; paid_until: string | null }): Subscription {
  const plan = PLAN[t.plan] ?? PLAN.trial ?? DEFAULT_PLANS[0];
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
  };
}
