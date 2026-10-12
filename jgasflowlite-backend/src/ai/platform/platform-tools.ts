/**
 * The console assistant's tools: the whole JGasFlow platform, read-only.
 *
 * Every tool wraps something the console screens already use and names the
 * console module it belongs to, so the assistant can never show an admin more
 * than the console would. Nothing here writes: suspending a shop, approving a
 * payment or changing a plan stays a human decision on its screen.
 */

import { Injectable } from '@nestjs/common';
import { ZodTypeAny, z } from 'zod';
import { Db } from '../../db/db.service';
import { PLANS } from '../../billing/plans';
import { addDays, todayKey } from '../../common/util';
import { PlatformService } from '../../platform/platform.service';
import { AgentInputError, AgentTool, JsonSchema } from '../engine/agent.types';

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description: string) => ({ type: 'string', description });
const int = (description: string) => ({ type: 'integer', description });
const oneOf = (description: string, values: string[]) => ({ type: 'string', description, enum: values });
const day = (what: string) => str(`${what} as YYYY-MM-DD.`);

const STATUS = ['paid', 'trial', 'expiring', 'expired', 'suspended'];
const ACTIVITY = ['active', 'low', 'idle', 'dormant', 'never'];

/** Tool arguments validated with zod; the message goes back to the model so it can retry. */
function input<T extends ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const r = schema.safeParse(raw ?? {});
  if (!r.success) {
    const i = r.error.issues[0];
    throw new AgentInputError(`${i.path.join('.') || 'input'}: ${i.message}`);
  }
  return r.data;
}

const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const zLimit = (max: number, def: number) => z.coerce.number().int().min(1).max(max).default(def);

/** The fields of a shop worth putting in front of a model. */
const shopLine = (s: any) => ({
  id: s.id,
  name: s.name,
  owner: s.owner_name,
  phone: s.phone,
  plan: s.subscription.plan_name,
  status: s.subscription.status,
  expires: s.subscription.expires_at?.slice(0, 10) ?? null,
  days_left: s.subscription.days_left,
  activity: s.activity,
  last_active: s.last_active_at,
  joined: String(s.created_at).slice(0, 10),
  users: s.users,
  customers: s.customers,
  bills_30d: s.bills_30d,
  sales_30d_pkr: s.sales_30d,
  phones_syncing: s.phones,
  pending_payment: s.pending > 0,
});

@Injectable()
export class PlatformTools {
  constructor(
    private readonly db: Db,
    private readonly platform: PlatformService,
  ) {}

  reads(): AgentTool[] {
    return [
      {
        name: 'platform_summary',
        permission: 'overview',
        description:
          'Headline numbers for the whole platform right now: shops by status (paid, trial, expired, suspended), monthly recurring revenue (MRR), revenue this month and last month, payments waiting for approval, shops expiring within 7 days, signups in the last 30 days, how many shops are really using the app, plan mix, and total sales made by all shops in the last 30 days. Start here for any "how are we doing" question.',
        input_schema: obj({}),
        handler: async () => {
          const o = await this.platform.overview();
          return {
            shops: o.shops,
            active_paid: o.active_paid,
            on_trial: o.on_trial,
            expired: o.expired,
            suspended: o.suspended,
            expiring_7d: o.expiring_7d,
            signups_30d: o.signups_30d,
            mrr_pkr: o.mrr,
            revenue_this_month_pkr: o.revenue_month,
            revenue_last_month_pkr: o.revenue_last_month,
            revenue_all_time_pkr: o.revenue_total,
            payments_waiting: o.pending_requests,
            payments_waiting_pkr: o.pending_amount,
            shop_users: o.users,
            phones_syncing: o.phones,
            usage: o.activity,
            plan_mix: o.plan_mix,
            all_shops_sales_30d_pkr: o.platform_sales_30d,
            all_shops_bills_30d: o.platform_bills_30d,
            expiring_soon: o.expiring.map(shopLine),
            waiting_payments: o.pending.map((p) => ({ shop: p.shop_name, shop_id: p.shop_id, plan: p.plan, months: p.months, amount_pkr: p.amount, method: p.method, sent: p.created_at })),
          };
        },
      },
      {
        name: 'find_shops',
        permission: 'shops',
        description:
          'Search and filter shops (the gas businesses that use JGasFlow). Filter by text (name, owner, phone), subscription status, plan key, usage level, or signup dates, and sort. Usage levels: active = used in the last 2 days, low = within 7, idle = within 30, dormant = more than 30 days, never = never used. Returns at most 25 shops plus the total that matched.',
        input_schema: obj({
          query: str('Part of the shop name, owner name or phone.'),
          status: oneOf('Subscription status. expiring = active but ends within 7 days.', STATUS),
          plan: str(`Plan key: ${PLANS.map((p) => p.key).join(', ')}.`),
          activity: oneOf('How recently the shop used the app.', ACTIVITY),
          created_from: day('Signed up on or after'),
          created_to: day('Signed up on or before'),
          sort: oneOf('Order.', ['newest', 'oldest', 'sales', 'active', 'expiry', 'name']),
          limit: int('How many to return, 1 to 25.'),
        }),
        handler: async (raw) => {
          const a = input(
            z.object({
              query: z.string().max(80).optional(),
              status: z.enum(STATUS as [string, ...string[]]).optional(),
              plan: z.string().max(20).optional(),
              activity: z.enum(ACTIVITY as [string, ...string[]]).optional(),
              created_from: zDay.optional(),
              created_to: zDay.optional(),
              sort: z.enum(['newest', 'oldest', 'sales', 'active', 'expiry', 'name']).optional(),
              limit: zLimit(25, 10),
            }),
            raw,
          );
          const r = await this.platform.shops({ ...a, q: a.query, page: 1 });
          return { total_matching: r.total, shown: r.items.length, shops: r.items.map(shopLine) };
        },
      },
      {
        name: 'get_shop',
        permission: 'shops',
        description:
          "One shop in depth: owner and contact, subscription and expiry, staff logins and when they last logged in, phones syncing, record counts (customers, sales, purchases), lifetime sales and money received, first and last sale, payments sent for the subscription, the admin note and the latest console events. Give shop_id if you have it, otherwise name (the best match is used).",
        input_schema: obj({ shop_id: int('Shop id.'), name: str('Shop name, if you do not have the id.') }),
        handler: async (raw) => {
          const a = input(z.object({ shop_id: z.coerce.number().int().min(1).optional(), name: z.string().max(80).optional() }), raw);
          let id = a.shop_id;
          if (!id && a.name) {
            const m = await this.db.one<any>('SELECT id FROM tenants WHERE name LIKE ? ORDER BY (name = ?) DESC, id LIMIT 1', [`%${a.name}%`, a.name]);
            if (!m) throw new AgentInputError(`No shop matches "${a.name}". Use find_shops to search.`);
            id = m.id;
          }
          if (!id) throw new AgentInputError('Give shop_id or name.');
          const d = await this.platform.shop(id);
          return {
            shop: { id: d.shop.id, name: d.shop.name, owner: d.shop.owner_name, phone: d.shop.phone, address: d.shop.address, joined: d.shop.created_at, last_active: d.shop.last_active_at, usage: d.shop.activity, admin_note: d.shop.admin_note || null },
            subscription: d.subscription,
            staff: d.users.map((u: any) => ({ name: u.name, role: u.role, active: u.active, last_login: u.last_login_at, devices: u.devices })),
            phones_syncing: d.phones.map((p: any) => ({ user: p.user_name, last_sync: p.last_sync_at })),
            counts: d.counts,
            sales_last_30_days: { bills: d.series.reduce((x: number, s: any) => x + s.bills, 0), total_pkr: d.series.reduce((x: number, s: any) => x + s.total, 0) },
            subscription_payments: d.requests.slice(0, 10).map((r: any) => ({ date: r.created_at, plan: r.plan, months: r.months, amount_pkr: Number(r.amount), method: r.method, status: r.status })),
            recent_events: d.events.slice(0, 10).map((e: any) => ({ date: e.created_at, action: e.action, detail: e.detail, by: e.by_name })),
          };
        },
      },
      {
        name: 'shop_activity',
        permission: 'shops',
        description: 'Day by day sales of one shop (bills and PKR) for the last 30 days, to see whether a shop is really working in the app, growing or slowing down.',
        input_schema: obj({ shop_id: int('Shop id.') }, ['shop_id']),
        handler: async (raw) => {
          const a = input(z.object({ shop_id: z.coerce.number().int().min(1) }), raw);
          const d = await this.platform.shop(a.shop_id);
          const days = d.series;
          return {
            shop: d.shop.name,
            days_with_sales: days.filter((s: any) => s.bills > 0).length,
            bills_30d: days.reduce((x: number, s: any) => x + s.bills, 0),
            total_30d_pkr: days.reduce((x: number, s: any) => x + s.total, 0),
            first_half_pkr: days.slice(0, 15).reduce((x: number, s: any) => x + s.total, 0),
            second_half_pkr: days.slice(15).reduce((x: number, s: any) => x + s.total, 0),
            daily: days,
          };
        },
      },
      {
        name: 'list_payments',
        permission: 'payments',
        description:
          'Subscription payments shops sent to JGasFlow (JazzCash, Easypaisa, bank) and payments recorded in the console. Status: pending = waiting for approval, approved, rejected. These are payments TO the platform, not sales made by shops.',
        input_schema: obj({
          status: oneOf('Filter by status.', ['pending', 'approved', 'rejected', 'all']),
          shop_id: int('Only this shop.'),
          limit: int('1 to 25.'),
        }),
        handler: async (raw) => {
          const a = input(z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('all'), shop_id: z.coerce.number().int().optional(), limit: zLimit(25, 15) }), raw);
          const r = await this.platform.payments({ status: a.status, shop_id: a.shop_id, limit: a.limit });
          return {
            total_matching: r.total,
            total_pkr: r.amount,
            payments: r.items.map((p: any) => ({ id: p.id, shop: p.shop_name, shop_id: p.tenant_id, plan: p.plan, months: p.months, amount_pkr: p.amount, method: p.method, reference: p.txn_ref, status: p.status, sent: p.created_at, reviewed: p.reviewed_at, note: p.review_note || null })),
          };
        },
      },
      {
        name: 'revenue_report',
        permission: 'reports',
        description:
          "The platform's own income from subscriptions between two dates: by month, by plan and by payment method; signups per month and how many of them are now on a paid plan; trial to paid conversion rate. Defaults to the last 12 months.",
        input_schema: obj({ from: day('Start date'), to: day('End date') }),
        handler: async (raw) => {
          const a = input(z.object({ from: zDay.optional(), to: zDay.optional() }), raw);
          const r = await this.platform.report(a.from, a.to);
          return { from: r.from, to: r.to, revenue_total_pkr: r.revenue_total, by_month: r.revenue_by_month, by_plan: r.revenue_by_plan, by_method: r.revenue_by_method, signups_by_month: r.signups_by_month, conversion: r.conversion };
        },
      },
      {
        name: 'platform_sales',
        permission: 'reports',
        description:
          'Gas sales made by ALL shops through JGasFlow between two dates: total bills, PKR and cylinders, number of shops selling, top shops by sales, and cylinders sold per size. Shows how much business runs on the platform. Defaults to the last 30 days.',
        input_schema: obj({ from: day('Start date'), to: day('End date'), top: int('How many top shops, 1 to 15.') }),
        handler: async (raw) => {
          const a = input(z.object({ from: zDay.optional(), to: zDay.optional(), top: zLimit(15, 8) }), raw);
          const from = a.from ?? addDays(todayKey(), -29);
          const to = addDays(a.to ?? todayKey(), 1);
          const [tot, top, sizes] = await Promise.all([
            this.db.one<any>('SELECT COUNT(*) AS bills, IFNULL(SUM(total),0) AS total, COUNT(DISTINCT tenant_id) AS shops FROM sales WHERE deleted = 0 AND date >= ? AND date < ?', [from, to]),
            this.db.all<any>(
              `SELECT t.id, t.name, COUNT(*) AS bills, SUM(s.total) AS total FROM sales s JOIN tenants t ON t.id = s.tenant_id
               WHERE s.deleted = 0 AND s.date >= ? AND s.date < ? GROUP BY t.id, t.name ORDER BY total DESC LIMIT ?`,
              [from, to, a.top],
            ),
            this.db.all<any>(
              `SELECT ty.name AS size, SUM(si.qty) AS cylinders FROM sale_items si
               JOIN sales s ON s.tenant_id = si.tenant_id AND s.uid = si.sale_uid AND s.deleted = 0
               JOIN cylinder_types ty ON ty.tenant_id = si.tenant_id AND ty.uid = si.type_uid
               WHERE si.deleted = 0 AND s.date >= ? AND s.date < ? GROUP BY ty.name ORDER BY cylinders DESC LIMIT 12`,
              [from, to],
            ),
          ]);
          return {
            from,
            to: addDays(to, -1),
            bills: Number(tot?.bills ?? 0),
            total_pkr: Number(tot?.total ?? 0),
            shops_selling: Number(tot?.shops ?? 0),
            cylinders_sold: sizes.reduce((x, r) => x + Number(r.cylinders), 0),
            by_size: sizes.map((r) => ({ size: r.size, cylinders: Number(r.cylinders) })),
            top_shops: top.map((r) => ({ shop_id: r.id, shop: r.name, bills: Number(r.bills), total_pkr: Number(r.total) })),
          };
        },
      },
      {
        name: 'list_plans',
        permission: 'plans',
        description: 'The subscription plans with monthly price in PKR, user limit, whether they are on sale, and how many shops are on each.',
        input_schema: obj({}),
        handler: async () => {
          const counts = await this.db.all<any>('SELECT plan, COUNT(*) AS n FROM tenants GROUP BY plan');
          const by = new Map(counts.map((c) => [c.plan, Number(c.n)]));
          return PLANS.map((p) => ({ key: p.key, name: p.name, price_pkr_month: p.price, users: p.users, on_sale: p.is_active, shops: by.get(p.key) ?? 0 }));
        },
      },
      {
        name: 'expiring_shops',
        permission: 'shops',
        description: 'Shops whose plan ends within the next N days, and shops whose plan already ended in the last N days without renewal. The renewal call list.',
        input_schema: obj({ days: int('Window in days, 1 to 60. Default 14.') }),
        handler: async (raw) => {
          const a = input(z.object({ days: z.coerce.number().int().min(1).max(60).default(14) }), raw);
          const all = await this.platform.allShops();
          const soon = all.filter((s) => s.subscription.status === 'active' && s.subscription.days_left <= a.days).sort((x, y) => x.subscription.days_left - y.subscription.days_left);
          const cutoff = Date.now() - a.days * 86400000;
          const ended = all.filter((s) => s.subscription.status === 'expired' && s.subscription.expires_at && new Date(s.subscription.expires_at.replace(' ', 'T')).getTime() >= cutoff);
          return { window_days: a.days, ending_soon: soon.slice(0, 25).map(shopLine), recently_ended: ended.slice(0, 25).map(shopLine) };
        },
      },
      {
        name: 'recent_events',
        permission: 'activity',
        description: 'The console activity log: signups, payments sent, approvals, rejections, plan extensions, suspensions, support logins and password resets, newest first. Optionally for one shop.',
        input_schema: obj({ shop_id: int('Only this shop.'), limit: int('1 to 40.') }),
        handler: async (raw) => {
          const a = input(z.object({ shop_id: z.coerce.number().int().optional(), limit: zLimit(40, 20) }), raw);
          const rows = await this.platform.recentEvents(a.limit, a.shop_id);
          return rows.map((e: any) => ({ date: e.created_at, shop: e.shop_name, action: e.action, detail: e.detail, by: e.by_name }));
        },
      },
    ];
  }

  writes(): AgentTool[] {
    return [];
  }
}
