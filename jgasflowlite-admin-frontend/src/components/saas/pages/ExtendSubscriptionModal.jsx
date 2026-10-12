// src/components/saas/pages/ExtendSubscriptionModal.jsx
//
// Crediting the months a clinic has already paid for.
//
// THIS IS THE OFFLINE-PAYMENT PATH. Money arrived by bank transfer or in
// person and an admin is crediting it. Renewal cannot do the job: it adds
// exactly one plan period and raises a bill, and a clinic that paid for two
// months needs two, with the money recorded rather than demanded.
//
// IT SHOWS THE NEW DATE BEFORE IT COMMITS. The one thing an admin needs to
// be sure of is when the clinic will next expire, and the rule behind it is
// not obvious: a live subscription is extended from its END so no paid time
// is lost, while a lapsed one is extended from TODAY, because extending from
// a date three months in the past would hand over months that had already
// gone by. Showing the resulting date is how that rule stops being a
// surprise. The server works it out the same way; this only previews it.

import React, { useEffect, useMemo, useState } from "react";
import { X, CalendarPlus, Loader2, AlertTriangle } from "lucide-react";
import { saasSubscriptionsApi, saasPlansApi } from "../../../api/saasApi";
import { useToast } from "../../common/Toast";

const QUICK_MONTHS = [1, 2, 3, 6, 12];

const PAYMENT_METHODS = [
  { value: "manual", label: "Recorded by admin" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/** YYYY-MM-DD for a date input. */
const toInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/**
 * The same arithmetic the server does, so the preview cannot disagree.
 *
 * A chosen start date wins over the rule, exactly as it does on the server.
 * Parsed at midday: a bare YYYY-MM-DD is read as UTC, and west of it that
 * lands on the day before the one the admin picked.
 */
function previewEnd(currentEnd, months, startsOn) {
  const now = new Date();
  const end = currentEnd ? new Date(currentEnd) : null;
  const lapsed = !end || end < now;
  const chosen = startsOn ? new Date(`${startsOn}T12:00:00`) : null;
  const from = chosen ?? (lapsed ? now : end);
  const next = new Date(from);
  next.setMonth(next.getMonth() + Number(months || 0));
  return { from, next, lapsed, chosen: !!chosen };
}

export default function ExtendSubscriptionModal({ company, onClose, onDone }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [saving, setSaving] = useState(false);

  // The clinics list carries no subscription, so the current one is fetched
  // when the modal opens rather than added to every row of a page that does
  // not otherwise need it.
  useEffect(() => {
    if (!company) return undefined;
    let alive = true;
    setLoading(true);
    setLoadError("");
    saasSubscriptionsApi
      .list({ company_id: company.id, page: 1, limit: 5, sort_by: "id", sort_order: "DESC" })
      .then((res) => {
        if (!alive) return;
        const items = res?.items ?? [];
        // Newest first, but prefer one that is actually running: a clinic can
        // have a cancelled subscription sitting above an active one.
        const live = items.find((s) => s.status === "active" || s.status === "past_due");
        setSubscription(live ?? items[0] ?? null);
      })
      .catch((e) => {
        if (alive) setLoadError(e.response?.data?.message || "Could not load the subscription.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [company]);

  // The plans, so the clinic can be moved onto a different one as part of the
  // same action - an upgrade is usually WHY the money arrived.
  useEffect(() => {
    let alive = true;
    saasPlansApi
      .list({ page: 1, limit: 100 })
      .then((res) => alive && setPlans(res?.items ?? res ?? []))
      .catch(() => alive && setPlans([]));
    return () => {
      alive = false;
    };
  }, []);

  // Default both fields to what the subscription already says, so an admin
  // who only wants to add months changes nothing else.
  useEffect(() => {
    if (!subscription) return;
    setPlanId(String(subscription.plan_id ?? ""));
    const { from } = previewEnd(subscription.current_period_end, 0, "");
    setStartsOn(toInput(from));
  }, [subscription]);

  // Suggest what the months are worth at the plan's own price, as a starting
  // point only - what was actually paid is what gets recorded.
  const selectedPlan = useMemo(
    () => plans.find((p) => String(p.id) === String(planId)) ?? null,
    [plans, planId],
  );

  useEffect(() => {
    if (!subscription) return;
    // The plan being moved TO decides what the months are worth, not the one
    // being moved from.
    const price = Number(selectedPlan?.price ?? subscription.price ?? 0);
    setAmount(price > 0 ? String(price * Number(months || 1)) : "");
  }, [subscription, selectedPlan, months]);

  const preview = useMemo(
    () => previewEnd(subscription?.current_period_end, months, startsOn),
    [subscription, months, startsOn],
  );
  const changingPlan =
    !!planId && String(planId) !== String(subscription?.plan_id ?? "");

  if (!company) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!subscription || saving) return;
    setSaving(true);
    try {
      await saasSubscriptionsApi.extend(subscription.id, {
        months: Number(months),
        ...(changingPlan && { plan_id: Number(planId) }),
        ...(startsOn && { starts_on: startsOn }),
        // Blank means no money changed hands, so no invoice is raised.
        ...(Number(amount) > 0 && { amount: Number(amount), payment_method: method }),
      });
      toast.success(
        `${company.name} extended by ${months} month${months > 1 ? "s" : ""} — now ends ${fmtDate(preview.next)}`,
      );
      onDone?.();
      onClose?.();
    } catch (err) {
      const raw = err.response?.data?.message;
      toast.error(Array.isArray(raw) ? raw[0] : raw || "Could not extend the subscription.");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full h-[34px] px-2.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white " +
    "dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100 focus:outline-none " +
    "focus:ring-1 focus:ring-primary-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <header className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <CalendarPlus className="w-4 h-4 text-primary-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              Extend subscription
            </h2>
            <p className="text-[11px] text-gray-500 truncate">{company.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {loading ? (
          <p className="flex items-center gap-2 px-3 py-6 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading the subscription…
          </p>
        ) : loadError || !subscription ? (
          <div className="px-3 py-6">
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {loadError || "This clinic has no subscription to extend. Create one first."}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="p-3 space-y-3">
            {/* What it is now, so the change is read against something. */}
            <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-2 space-y-1 text-[12px]">
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Plan</span>
                <span className="font-medium text-gray-800 dark:text-gray-100 truncate">
                  {subscription.plan?.name ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Status</span>
                <span className="font-medium text-gray-800 dark:text-gray-100">
                  {subscription.status}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Ends</span>
                <span className="font-medium text-gray-800 dark:text-gray-100">
                  {fmtDate(subscription.current_period_end)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Plan
                </label>
                <select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  className={field}
                >
                  {plans.length === 0 && (
                    <option value="">{subscription.plan?.name ?? "Current plan"}</option>
                  )}
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Paid period starts
                </label>
                <input
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  className={field}
                />
              </div>
            </div>
            {changingPlan && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                The clinic moves onto this plan now - its price, limits and
                modules change with it.
              </p>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Months paid for
              </label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {QUICK_MONTHS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonths(m)}
                    className={`px-2.5 h-[30px] rounded-md text-xs font-medium border transition-colors ${
                      Number(months) === m
                        ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {m}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  className={`${field} w-20 h-[30px]`}
                  aria-label="Months"
                />
              </div>
              {/* The rule behind the new date, said once, where it matters. */}
              <p className="text-[11px] text-gray-500">
                {preview.chosen
                  ? `Counted from ${fmtDate(preview.from)}.`
                  : preview.lapsed
                    ? "This subscription has lapsed, so the months run from today."
                    : "Added to the end of the current period, so no paid time is lost."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Amount received
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className={field}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  How it was paid
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  disabled={!(Number(amount) > 0)}
                  className={`${field} disabled:opacity-50`}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              {Number(amount) > 0
                ? "A paid invoice is recorded for this amount."
                : "Leave the amount blank to extend without recording a payment."}
            </p>

            {/* The answer the admin actually came for. */}
            <div className="rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 px-2.5 py-2">
              <p className="text-[11px] text-primary-700 dark:text-primary-300">New expiry</p>
              <p className="text-base font-semibold text-primary-800 dark:text-primary-200">
                {fmtDate(preview.next)}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 h-[34px] rounded-md text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !(Number(months) >= 1)}
                className="inline-flex items-center gap-1.5 px-3 h-[34px] rounded-md text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Extend
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
