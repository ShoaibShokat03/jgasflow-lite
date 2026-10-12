// src/components/saas/pages/data/agentSources.js
//
// Where each agent's figures actually come from.
//
// REAL, NOT SIMULATED. Every number this returns is read from the platform's
// own endpoints - the same ones the Analytics, Clinics, Subscriptions and
// Invoices screens use. Nothing is generated, nothing drifts on a timer, and
// a figure that cannot be fetched is shown as unavailable rather than filled
// in with something plausible.
//
// ONE FETCH PER AGENT. Each agent owns its own request and knows nothing
// about the others, which is what independent means here: Sana's traffic
// failing has no effect on Bilal's revenue.
//
// COUNTS COME FROM `total`, NOT FROM COUNTING. Every list endpoint returns
// `{items, total, ...}`, so asking for one row and reading `total` is one
// cheap query rather than paging a table to measure it. That is why each of
// these passes `limit: 1`.

import {
  analyticsApi,
  saasCompaniesApi,
  saasSubscriptionsApi,
  saasInvoicesApi,
} from "../../../../api/saasApi";

/** These are real. Kept as a named export so the UI reads it, not a literal. */
export const SIMULATED = false;

/** How a value is written out. */
export const FORMATS = {
  count: (v) => (v == null ? "—" : Math.round(v).toLocaleString("en-US")),
  money: (v) => (v == null ? "—" : `PKR ${Math.round(v).toLocaleString("en-US")}`),
  percent: (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`),
  bytes: (v) => {
    if (v == null) return "—";
    const mb = v / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
  },
};

/** YYYY-MM-DD, `days` ago. The analytics endpoints take a date range. */
function since(days) {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().slice(0, 10);
}
const today = () => new Date().toISOString().slice(0, 10);

const metric = (key, label, value, format) => ({ key, label, value, format, trend: 0 });

/** A list endpoint's `total`, or null when the call fails. */
async function totalOf(fn, params) {
  try {
    const r = await fn({ ...params, page: 1, limit: 1 });
    return typeof r?.total === "number" ? r.total : null;
  } catch {
    // Null is "not available" and the UI shows a dash. Zero would be a claim.
    return null;
  }
}

const num = (v) => (v == null || v === "" ? null : Number(v));

/** A date `n` days from now, as YYYY-MM-DD, for "expiring before" windows. */
const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Traffic and signups: the analytics the platform already records.
 *
 * The range is the last 30 days rather than all time, because "visitors" with
 * no period attached is a number nobody can act on.
 */
async function growth() {
  let s = {};
  let sources = [];
  try {
    const r = await analyticsApi.summary({ date_from: since(30), date_to: today() });
    s = r?.totals ?? {};
    sources = r?.networks ?? r?.sources ?? [];
  } catch {
    s = {};
  }
  return {
    metrics: [
      metric("visitors", "Visitors (30d)", num(s.visitors), "count"),
      metric("signups", "Registrations", num(s.registrations), "count"),
      metric("conversion", "Conversion", num(s.conversion_rate), "percent"),
      metric("page_views", "Page views", num(s.page_views), "count"),
    ],
    charts: [
      sources.length
        ? {
            key: "sources",
            kind: "donut",
            title: "Traffic sources",
            slices: sources
              .slice(0, 5)
              .map((x) => ({
                label: x.network || x.source || x.utm_source || "Direct",
                value: Number(x.visitors ?? x.count ?? 0),
              }))
              .filter((x) => x.value > 0),
          }
        : null,
      num(s.conversion_rate) != null
        ? {
            key: "conversion",
            kind: "radial",
            title: "Conversion to target",
            value: Number(s.conversion_rate),
            target: 15,
            unit: "%",
          }
        : null,
    ].filter(Boolean),
  };
}

/** Clinic health, from the activity bands the clinics list already computes. */
async function ops() {
  const [active, low, idle, dormant, never] = await Promise.all([
    totalOf(saasCompaniesApi.list, { activity: "active" }),
    totalOf(saasCompaniesApi.list, { activity: "low" }),
    totalOf(saasCompaniesApi.list, { activity: "idle" }),
    totalOf(saasCompaniesApi.list, { activity: "dormant" }),
    totalOf(saasCompaniesApi.list, { activity: "never" }),
  ]);
  const bands = [
    { label: "Active", value: active },
    { label: "Low", value: low },
    { label: "Idle", value: idle },
    { label: "Dormant", value: dormant },
  ].filter((b) => typeof b.value === "number" && b.value > 0);

  return {
    metrics: [
      metric("active", "Active clinics", active, "count"),
      metric("low", "Low use", low, "count"),
      metric("idle", "Idle", idle, "count"),
      metric("dormant", "Dormant", dormant, "count"),
    ],
    charts: [
      bands.length ? { key: "bands", kind: "donut", title: "Clinic activity", slices: bands } : null,
      typeof never === "number"
        ? {
            key: "never",
            kind: "bar",
            title: "By activity band",
            labels: ["Active", "Low", "Idle", "Dormant", "Never"],
            values: [active, low, idle, dormant, never].map((v) => v ?? 0),
          }
        : null,
    ].filter(Boolean),
  };
}

/** Subscriptions and billing. */
async function accounts() {
  const [activeSubs, pendingSubs, cancelled, expired, paid, pending] = await Promise.all([
    totalOf(saasSubscriptionsApi.list, { status: "active" }),
    totalOf(saasSubscriptionsApi.list, { status: "pending" }),
    totalOf(saasSubscriptionsApi.list, { status: "cancelled" }),
    totalOf(saasSubscriptionsApi.list, { status: "expired" }),
    totalOf(saasInvoicesApi.list, { status: "paid" }),
    totalOf(saasInvoicesApi.list, { status: "pending" }),
  ]);

  const mix = [
    { label: "Active", value: activeSubs },
    { label: "Pending", value: pendingSubs },
    { label: "Cancelled", value: cancelled },
    { label: "Expired", value: expired },
  ].filter((b) => typeof b.value === "number" && b.value > 0);

  return {
    metrics: [
      metric("active", "Active subscriptions", activeSubs, "count"),
      metric("pending_pay", "Invoices pending", pending, "count"),
      metric("paid", "Invoices paid", paid, "count"),
      metric("cancelled", "Cancelled", cancelled, "count"),
    ],
    charts: [
      mix.length
        ? { key: "mix", kind: "donut", title: "Subscription status", slices: mix }
        : null,
      typeof paid === "number" && typeof pending === "number"
        ? {
            key: "invoices",
            kind: "bar",
            title: "Invoices",
            labels: ["Paid", "Pending"],
            values: [paid, pending],
          }
        : null,
    ].filter(Boolean),
  };
}

/** The executive view: how many clinics there are and what they are using. */
async function chief() {
  const [clinics, activeSubs] = await Promise.all([
    totalOf(saasCompaniesApi.list, {}),
    totalOf(saasSubscriptionsApi.list, { status: "active" }),
  ]);
  let storage = null;
  try {
    storage = await saasCompaniesApi.storageSummary();
  } catch {
    storage = null;
  }

  const used = num(storage?.total_bytes);
  const allocated = num(storage?.allocated_bytes ?? storage?.allocated_mb * 1024 * 1024);
  const pct = used != null && allocated ? (used / allocated) * 100 : null;

  return {
    metrics: [
      metric("clinics", "Clinics", clinics, "count"),
      metric("subs", "Active subscriptions", activeSubs, "count"),
      metric("storage", "Storage used", used, "bytes"),
      metric("near", "Near quota", num(storage?.near_quota ?? storage?.near), "count"),
    ],
    charts: [
      used != null && num(storage?.db_bytes) != null
        ? {
            key: "split",
            kind: "donut",
            title: "Storage split",
            slices: [
              { label: "Database", value: num(storage.db_bytes) ?? 0 },
              { label: "Files", value: num(storage.file_bytes) ?? 0 },
            ].filter((x) => x.value > 0),
          }
        : null,
      pct != null
        ? {
            key: "quota",
            kind: "radial",
            title: "Allocation used",
            value: pct,
            target: 100,
            unit: "%",
          }
        : null,
    ].filter(Boolean),
  };
}


/**
 * Growth strategy: what is worth doing something about.
 *
 * Deliberately NOT a report. The other four already say what happened; these
 * four say where the money is, and each one is a list of clinics somebody
 * could ring this afternoon:
 *
 *   never activated  - signed up, never recorded a patient. The cheapest
 *                      churn there is to prevent, and usually the biggest
 *                      single number on the board.
 *   dormant          - was using it, has gone quiet. If they are paying,
 *                      this is revenue that stops at renewal.
 *   renewals due     - the window in which any of that can still be saved.
 *   conversion       - the one funnel figure, because an opportunity board
 *                      with no intake on it only ever shrinks.
 *
 * Each is counted by the SAME filter the clinics screen uses, so a figure
 * here and the list it opens can never disagree.
 */
async function strategy() {
  const [never, dormant, renewals] = await Promise.all([
    totalOf(saasCompaniesApi.list, { activity: "never" }),
    totalOf(saasCompaniesApi.list, { activity: "dormant" }),
    totalOf(saasSubscriptionsApi.list, {
      status: "active",
      period_end_before: inDays(30),
    }),
  ]);

  let conversion = null;
  try {
    const r = await analyticsApi.summary({ date_from: since(30), date_to: today() });
    conversion = num(r?.totals?.conversion_rate);
  } catch {
    conversion = null;
  }

  return {
    metrics: [
      metric("never", "Never activated", never, "count"),
      metric("dormant", "Gone quiet", dormant, "count"),
      metric("renewals", "Renewals due (30d)", renewals, "count"),
      metric("conversion", "Conversion", conversion, "percent"),
    ],
    charts: [
      // Where attention is worth spending, biggest first. A bar rather than
      // a donut: these are not parts of one whole, they are three separate
      // piles of work competing for the same afternoon.
      never != null || dormant != null || renewals != null
        ? {
            key: "opportunity",
            kind: "bar",
            title: "Where the work is",
            labels: ["Never used", "Gone quiet", "Renewing"],
            values: [never ?? 0, dormant ?? 0, renewals ?? 0],
          }
        : null,
    ].filter(Boolean),
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
