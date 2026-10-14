// src/components/saas/pages/data/agentSources.js
//
// Where each agent's figures come from.
//
// REAL, NOT SIMULATED. Every number is read from /platform/overview, the same
// endpoint the Overview screen uses. Nothing is generated or drifts on a
// timer; a figure that cannot be fetched shows as unavailable.
//
// ONE REQUEST, SHARED. All five agents read the same overview, so it is fetched
// once and reused for a few seconds instead of five identical calls. An admin
// without the Overview screen gets dashes, not an error.

import { platformApi } from "../../../../api/saasApi";

/** These are real. Kept as a named export so the UI reads it, not a literal. */
export const SIMULATED = false;

/** How a value is written out. */
export const FORMATS = {
  count: (v) => (v == null ? "-" : Math.round(v).toLocaleString("en-PK")),
  money: (v) => (v == null ? "-" : `Rs ${Math.round(v).toLocaleString("en-PK")}`),
  percent: (v) => (v == null ? "-" : `${Number(v).toFixed(1)}%`),
};

const metric = (key, label, value, format) => ({ key, label, value, format, trend: 0 });

let cache = { at: 0, promise: null };
/** The overview, shared by every agent for 15 seconds. Null when not allowed or offline. */
function overview() {
  if (cache.promise && Date.now() - cache.at < 15000) return cache.promise;
  cache = { at: Date.now(), promise: platformApi.overview().catch(() => null) };
  return cache.promise;
}

/** The executive view: shops, money, what needs attention. */
async function chief() {
  const o = await overview();
  return {
    metrics: [
      metric("shops", "Shops", o?.shops, "count"),
      metric("paid", "Paying shops", o?.active_paid, "count"),
      metric("mrr", "Monthly recurring", o?.mrr, "money"),
      metric("pending", "Payments waiting", o?.pending_requests, "count"),
    ],
    charts: o
      ? [
          {
            key: "status",
            kind: "donut",
            title: "Shops by status",
            slices: [
              { label: "Paying", value: o.active_paid },
              { label: "Trial", value: o.on_trial },
              { label: "Expired", value: o.expired },
              { label: "Suspended", value: o.suspended },
            ].filter((x) => x.value > 0),
          },
          o.revenue_last_month
            ? { key: "month", kind: "radial", title: "This month vs last", value: (o.revenue_month / o.revenue_last_month) * 100, target: 100, unit: "%" }
            : null,
        ].filter(Boolean)
      : [],
  };
}

/** Shop health: who really uses the app. */
async function ops() {
  const o = await overview();
  const a = o?.activity;
  return {
    metrics: [
      metric("active", "Active shops", a?.active, "count"),
      metric("week", "Used this week", a?.low, "count"),
      metric("idle", "Idle", a?.idle, "count"),
      metric("dormant", "Dormant", a?.dormant, "count"),
    ],
    charts: a
      ? [
          {
            key: "bands",
            kind: "donut",
            title: "Shop activity",
            slices: [
              { label: "Active", value: a.active },
              { label: "This week", value: a.low },
              { label: "Idle", value: a.idle },
              { label: "Dormant", value: a.dormant },
            ].filter((x) => x.value > 0),
          },
          {
            key: "all",
            kind: "bar",
            title: "By activity band",
            labels: ["Active", "Week", "Idle", "Dormant", "Never"],
            values: [a.active, a.low, a.idle, a.dormant, a.never],
          },
        ]
      : [],
  };
}

/** Subscriptions and payments to the platform. */
async function accounts() {
  const o = await overview();
  const months = o?.revenue_monthly?.slice(-6) || [];
  return {
    metrics: [
      metric("month", "Earned this month", o?.revenue_month, "money"),
      metric("pending", "Payments waiting", o?.pending_requests, "count"),
      metric("expiring", "Ending in 7 days", o?.expiring_7d, "count"),
      metric("expired", "Expired", o?.expired, "count"),
    ],
    charts: o
      ? [
          months.length
            ? {
                key: "income",
                kind: "bar",
                title: "Income, last 6 months",
                labels: months.map((m) => m.month.slice(5)),
                values: months.map((m) => m.amount),
              }
            : null,
          {
            key: "plans",
            kind: "donut",
            title: "Shops by plan",
            slices: (o.plan_mix || []).map((p) => ({ label: p.name, value: p.shops })).filter((x) => x.value > 0),
          },
        ].filter(Boolean)
      : [],
  };
}

/** Sign ups and trial conversion. */
async function growth() {
  const o = await overview();
  const paidShare = o?.shops ? (o.active_paid / o.shops) * 100 : null;
  const days = o?.signups_daily?.slice(-14) || [];
  return {
    metrics: [
      metric("signups", "New shops (30d)", o?.signups_30d, "count"),
      metric("trial", "On trial", o?.on_trial, "count"),
      metric("paid", "Paying share", paidShare, "percent"),
      metric("users", "Users", o?.users, "count"),
    ],
    charts: o
      ? [
          days.length ? { key: "signups", kind: "bar", title: "Sign ups, last 14 days", labels: days.map((d) => d.day.slice(8)), values: days.map((d) => d.n) } : null,
          paidShare != null ? { key: "paid", kind: "radial", title: "Shops paying", value: paidShare, target: 100, unit: "%" } : null,
        ].filter(Boolean)
      : [],
  };
}

/**
 * Growth strategy: where the work is. Each figure is a list of shops somebody
 * could call this afternoon: never used (onboarding), dormant (churn coming),
 * ending soon (renewals to save).
 */
async function strategy() {
  const o = await overview();
  const a = o?.activity;
  return {
    metrics: [
      metric("never", "Never used", a?.never, "count"),
      metric("dormant", "Gone quiet", a?.dormant, "count"),
      metric("renewals", "Ending in 7 days", o?.expiring_7d, "count"),
      metric("mrr", "Monthly recurring", o?.mrr, "money"),
    ],
    charts: a
      ? [
          {
            key: "opportunity",
            kind: "bar",
            title: "Where the work is",
            labels: ["Never used", "Gone quiet", "Renewing"],
            values: [a.never, a.dormant, o.expiring_7d],
          },
        ]
      : [],
  };
}

/** One loader per agent, keyed the way the rest of the screen keys them. */
export const SOURCES = { chief, ops, accounts, growth, strategy };

/** The headline figure an agent is known by, for its node and the overview. */
export function headline(metrics, agentKey) {
  const m = metrics?.[agentKey]?.[0];
  if (!m) return null;
  return { label: m.label, shown: FORMATS[m.format](m.value) };
}
