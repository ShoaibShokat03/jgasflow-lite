// src/components/saas/pages/OverviewPage.jsx
// The platform at a glance: money, shops, what needs action today.
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Store,
  BadgeCheck,
  Clock,
  Wallet,
  TrendingUp,
  Smartphone,
  AlertTriangle,
  UserPlus,
  Receipt,
  Check,
  ArrowRight,
  Headset,
} from "lucide-react";
import { platformApi } from "../../../api/saasApi";
import { errMsg } from "../../../api/saasClient";
import { canModule } from "../../../utils/saasAuth";
import { useToast } from "../../common/Toast";
import { fmtAgo, fmtDate, PageHeader, BtnPrimary } from "../common";
import { usePlanName, termLabel } from "../dialogs";
import { Proofs } from "../attach";
import {
  Card,
  Kpi,
  BarChart,
  ShareBars,
  Loading,
  ErrorBox,
  PKR,
  num,
  shortPKR,
  dayLabel,
  monthLabel,
  SubBadge,
  ActivityDot,
  METHOD_LABELS,
  eventLabel,
} from "../kit";

const ACTIVITY_ROWS = [
  ["active", "Active (2 days)", "bg-emerald-500"],
  ["low", "This week", "bg-lime-500"],
  ["idle", "Idle (8 to 30 days)", "bg-amber-500"],
  ["dormant", "Dormant (30+ days)", "bg-orange-500"],
  ["never", "Never used", "bg-gray-400"],
];

const ListRow = ({ to, children }) => (
  <Link
    to={to}
    className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/30"
  >
    {children}
  </Link>
);

const Empty = ({ text }) => <p className="px-4 py-6 text-center text-xs text-gray-400">{text}</p>;

const OverviewPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: o, isLoading, error, refetch } = useQuery({ queryKey: ["overview"], queryFn: platformApi.overview });
  const planName = usePlanName();

  const approve = useMutation({
    mutationFn: (id) => platformApi.approve(id),
    onSuccess: () => {
      toast.success("Payment approved and the plan is extended");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const growth = o.revenue_last_month ? Math.round(((o.revenue_month - o.revenue_last_month) / o.revenue_last_month) * 100) : null;
  const canPay = canModule("payments");

  return (
    <div className="space-y-4">
      <PageHeader title="Overview" subtitle="How the platform is doing today" />

      {o.pending_requests > 0 && canPay && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <b>{o.pending_requests}</b> payment{o.pending_requests === 1 ? "" : "s"} waiting for approval, {PKR(o.pending_amount)} in total.
            </span>
          </p>
          <BtnPrimary onClick={() => navigate("/payments")}>
            Review payments <ArrowRight className="w-4 h-4" />
          </BtnPrimary>
        </div>
      )}

      {o.open_support > 0 && canModule("support") && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-sky-800 dark:text-sky-200 flex items-center gap-2">
            <Headset className="w-4 h-4 shrink-0" />
            <span>
              <b>{o.open_support}</b> support message{o.open_support === 1 ? "" : "s"} waiting for a reply.
            </span>
          </p>
          <BtnPrimary onClick={() => navigate("/support")}>
            Open inbox <ArrowRight className="w-4 h-4" />
          </BtnPrimary>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icon={Wallet} tone="primary" label="Earned this month" value={PKR(o.revenue_month)}
          hint={growth == null ? `Last month ${PKR(o.revenue_last_month)}` : `${growth >= 0 ? "+" : ""}${growth}% vs last month`} />
        <Kpi icon={TrendingUp} tone="emerald" label="Monthly recurring" value={PKR(o.mrr)} hint={`All time ${PKR(o.revenue_total)}`} />
        <Kpi icon={Store} tone="navy" label="Shops" value={num(o.shops)} hint={`${o.signups_30d} new in 30 days`} onClick={() => navigate("/shops")} />
        <Kpi icon={BadgeCheck} tone="emerald" label="Paying shops" value={num(o.active_paid)} hint={`${o.on_trial} on trial`} onClick={() => navigate("/shops?status=paid")} />
        <Kpi icon={Clock} tone="amber" label="Ending in 7 days" value={num(o.expiring_7d)} hint="Trials and paid plans" onClick={() => navigate("/shops?status=expiring")} />
        <Kpi icon={AlertTriangle} tone="red" label="Expired or suspended" value={num(o.expired + o.suspended)} hint={`${o.expired} expired, ${o.suspended} suspended`} onClick={() => navigate("/shops?status=expired")} />
        <Kpi icon={Receipt} tone="sky" label="Gas sales in shops (30 days)" value={shortPKR(o.platform_sales_30d)} hint={`${num(o.platform_bills_30d)} bills`} />
        <Kpi icon={Smartphone} tone="sky" label="Offline / Online shops" value={`${num(o.offline_shops)} / ${num(o.online_shops)}`} hint={`${num(o.offline_devices)} offline phones, ${num(o.phones)} syncing`} onClick={() => navigate("/shops?mode=offline")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Subscription income" subtitle="Approved payments, last 12 months" className="lg:col-span-2">
          <BarChart
            data={o.revenue_monthly.map((m) => ({ label: monthLabel(m.month), value: m.amount, sub: `${m.payments} payments` }))}
            format={PKR}
            empty="No payments approved yet"
          />
        </Card>
        <Card title="Shop activity" subtitle="Last time anyone used the app">
          <ShareBars rows={ACTIVITY_ROWS.map(([k, label, color]) => ({ label, value: o.activity[k], color }))} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="New shops" subtitle="Sign ups per day, last 30 days">
          <BarChart data={o.signups_daily.map((d) => ({ label: dayLabel(d.day), value: d.n }))} height={120} color="bg-navy-500" empty="No sign ups in 30 days" />
        </Card>
        <Card title="Gas sales in all shops" subtitle="Bill totals per day, last 30 days" className="lg:col-span-2">
          <BarChart
            data={o.sales_daily.map((d) => ({ label: dayLabel(d.day), value: d.total, sub: `${d.bills} bills` }))}
            height={120}
            format={PKR}
            color="bg-emerald-500"
            empty="No sales recorded in 30 days"
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Waiting for approval" subtitle="Payments sent by shops" bodyClass="pb-1"
          action={canPay && <Link to="/payments" className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap">All payments</Link>}>
          {o.pending.length === 0 ? (
            <Empty text="Nothing waiting. All payments are handled." />
          ) : (
            o.pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700/60">
                <div className="min-w-0">
                  <Link to={`/shops/${p.shop_id}`} className="block text-sm font-medium text-gray-900 dark:text-white truncate hover:underline">{p.shop_name}</Link>
                  <p className="text-[11px] text-gray-500 truncate">
                    {planName(p.plan)}, {termLabel(p.months)}, {METHOD_LABELS[p.method] || p.method} {p.txn_ref}, {fmtAgo(p.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.proofs > 0 && <Proofs base={platformApi.proofUrl(p.id)} count={1} size={36} />}
                  <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{PKR(p.amount)}</span>
                  {canPay && (
                    <BtnPrimary className="px-2.5 py-1.5 text-xs" disabled={approve.isPending} onClick={() => approve.mutate(p.id)}>
                      <Check className="w-3.5 h-3.5" /> Approve
                    </BtnPrimary>
                  )}
                </div>
              </div>
            ))
          )}
        </Card>

        <Card title="Ending soon" subtitle="Plans that end in the next 7 days" bodyClass="pb-1">
          {o.expiring.length === 0 ? (
            <Empty text="No plan ends in the next 7 days." />
          ) : (
            o.expiring.map((s) => (
              <ListRow key={s.id} to={`/shops/${s.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {s.subscription.plan_name}, ends {fmtDate(s.subscription.expires_at)}
                  </p>
                </div>
                <SubBadge sub={s.subscription} />
              </ListRow>
            ))
          )}
        </Card>

        <Card title="Top shops" subtitle="By gas sales in the last 30 days" bodyClass="pb-1">
          {o.top_shops.length === 0 ? (
            <Empty text="No shop has recorded a sale in 30 days." />
          ) : (
            o.top_shops.map((s, i) => (
              <ListRow key={s.id} to={`/shops/${s.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 text-[11px] font-bold text-gray-600 dark:text-gray-300 flex items-center justify-center">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{num(s.bills_30d)} bill{s.bills_30d === 1 ? "" : "s"}, {s.users} user{s.users === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{PKR(s.sales_30d)}</span>
              </ListRow>
            ))
          )}
        </Card>

        <Card title="Newest shops" bodyClass="pb-1"
          action={<Link to="/shops" className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap">All shops</Link>}>
          {o.recent_signups.length === 0 ? (
            <Empty text="No shops yet." />
          ) : (
            o.recent_signups.map((s) => (
              <ListRow key={s.id} to={`/shops/${s.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <UserPlus className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{s.owner_name}, joined {fmtAgo(s.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <ActivityDot value={s.activity} withLabel={false} />
                  <SubBadge sub={s.subscription} />
                </div>
              </ListRow>
            ))
          )}
        </Card>
      </div>

      {o.recent_events.length > 0 && (
        <Card title="Latest activity" bodyClass="pb-1"
          action={canModule("activity") && <Link to="/activity" className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap">Full log</Link>}>
          {o.recent_events.slice(0, 8).map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 border-t border-gray-100 dark:border-gray-700/60 text-sm">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">
                <Link to={`/shops/${e.tenant_id}`} className="font-medium hover:underline">{e.shop_name}</Link>
                <span className="text-gray-400">: </span>
                {eventLabel(e.action)}
                {e.detail ? <span className="text-gray-500">, {e.detail}</span> : null}
              </span>
              <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtAgo(e.created_at)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default OverviewPage;
