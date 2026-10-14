// src/components/saas/pages/ReportsPage.jsx
// Income, sign ups and conversion for a date range.
import React, { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Wallet, UserPlus, BadgeCheck, Receipt, Printer } from "lucide-react";
import { platformApi } from "../../../api/saasApi";
import { inputCls, PageHeader, BtnGhost, Th, Td, Tr } from "../common";
import { Card, Kpi, BarChart, ShareBars, Loading, ErrorBox, PKR, num, monthLabel, METHOD_LABELS, TableCard } from "../kit";
import BRANDING from "../../../constants/branding";

const iso = (d) => d.toISOString().slice(0, 10);
const RANGES = [
  { key: "month", label: "This month", from: () => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) },
  { key: "3m", label: "3 months", from: () => iso(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)) },
  { key: "12m", label: "12 months", from: () => iso(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)) },
  { key: "year", label: "This year", from: () => `${new Date().getFullYear()}-01-01` },
];

/** Every month between two dates, so empty months still show. */
const monthsBetween = (from, to) => {
  const out = [];
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00`);
  const end = to.slice(0, 7);
  while (out.length < 60) {
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push(m);
    if (m >= end) break;
    d.setMonth(d.getMonth() + 1);
  }
  return out;
};

const ReportsPage = () => {
  const [range, setRange] = useState("12m");
  const [from, setFrom] = useState(RANGES[2].from());
  const [to, setTo] = useState(iso(new Date()));

  const { data: r, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["report", from, to],
    queryFn: () => platformApi.reports({ from, to }),
    placeholderData: keepPreviousData,
  });

  const pick = (x) => {
    setRange(x.key);
    setFrom(x.from());
    setTo(iso(new Date()));
  };

  const content = () => {
    if (error) return <ErrorBox error={error} onRetry={refetch} />;
    if (isLoading) return <Loading />;
    const months = monthsBetween(r.from, r.to);
    const byMonth = (rows, key) => {
      const m = new Map(rows.map((x) => [x.month, x]));
      return months.map((mm) => ({ month: mm, ...(m.get(mm) || {}), value: Number(m.get(mm)?.[key] || 0) }));
    };
    const rev = byMonth(r.revenue_by_month, "amount");
    const signups = byMonth(r.signups_by_month, "shops");
    const sales = byMonth(r.sales_by_month, "total");
    const payments = r.revenue_by_month.reduce((a, x) => a + x.payments, 0);

    return (
      <div className={`space-y-4 ${isFetching ? "opacity-70" : ""}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Kpi icon={Wallet} tone="primary" label="Income" value={PKR(r.revenue_total)} hint={`${num(payments)} approved payments`} />
          <Kpi icon={UserPlus} tone="navy" label="New shops" value={num(r.conversion.signups)} hint={`${num(r.conversion.made_sale)} of them made a sale`} />
          <Kpi icon={BadgeCheck} tone="emerald" label="Became paying" value={`${r.conversion.rate}%`} hint={`${num(r.conversion.converted)} of ${num(r.conversion.signups)} new shops`} />
          <Kpi icon={Receipt} tone="sky" label="Gas sales in shops" value={PKR(r.sales_by_month.reduce((a, x) => a + x.total, 0))} hint={`${num(r.sales_by_month.reduce((a, x) => a + x.bills, 0))} bills`} />
        </div>

        <Card title="Income by month" subtitle="Approved subscription payments">
          <BarChart data={rev.map((x) => ({ label: monthLabel(x.month), value: x.value, sub: x.payments ? `${x.payments} payments` : "" }))} format={PKR} empty="No income in this period" />
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Income by plan">
            {r.revenue_by_plan.length ? (
              <ShareBars rows={r.revenue_by_plan.map((x) => ({ label: `${x.name}, ${num(x.months)} months sold`, value: x.amount }))} format={PKR} />
            ) : (
              <p className="py-6 text-center text-xs text-gray-400">No income in this period</p>
            )}
          </Card>
          <Card title="Income by payment method">
            {r.revenue_by_method.length ? (
              <ShareBars
                rows={r.revenue_by_method.map((x, i) => ({
                  label: `${METHOD_LABELS[x.method] || x.method}, ${num(x.payments)} payments`,
                  value: x.amount,
                  color: ["bg-primary-500", "bg-navy-500", "bg-emerald-500", "bg-sky-500", "bg-gray-400"][i % 5],
                }))}
                format={PKR}
              />
            ) : (
              <p className="py-6 text-center text-xs text-gray-400">No income in this period</p>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="New shops by month">
            <BarChart data={signups.map((x) => ({ label: monthLabel(x.month), value: x.value, sub: x.paid_now ? `${x.paid_now} paying now` : "" }))} color="bg-navy-500" height={140} empty="No sign ups in this period" />
          </Card>
          <Card title="Gas sales in all shops by month">
            <BarChart data={sales.map((x) => ({ label: monthLabel(x.month), value: x.value, sub: x.shops ? `${x.shops} shops selling` : "" }))} format={PKR} color="bg-emerald-500" height={140} empty="No sales in this period" />
          </Card>
        </div>

        <Card title="Month by month" bodyClass="">
          <TableCard bare>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th className="text-right">Income</Th>
                <Th className="text-right">Payments</Th>
                <Th className="text-right">New shops</Th>
                <Th className="text-right hidden sm:table-cell">Shop sales</Th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => {
                const a = rev.find((x) => x.month === m);
                const s = signups.find((x) => x.month === m);
                const g = sales.find((x) => x.month === m);
                return (
                  <Tr key={m}>
                    <Td className="whitespace-nowrap">{monthLabel(m)}</Td>
                    <Td className="text-right font-semibold whitespace-nowrap">{PKR(a.value)}</Td>
                    <Td className="text-right">{num(a.payments)}</Td>
                    <Td className="text-right">{num(s.value)}</Td>
                    <Td className="text-right hidden sm:table-cell whitespace-nowrap">{PKR(g.value)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableCard>
        </Card>
        <p className="hidden print:block text-center text-xs text-gray-500">{BRANDING.support}</p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Income, sign ups and conversion">
        <BtnGhost onClick={() => window.print()} className="print:hidden">
          <Printer className="w-4 h-4" /> Print
        </BtnGhost>
      </PageHeader>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex flex-wrap items-center gap-3 print:hidden">
        <div className="inline-flex flex-wrap rounded-lg bg-gray-100 dark:bg-gray-900 p-1">
          {RANGES.map((x) => (
            <button
              key={x.key}
              onClick={() => pick(x)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${range === x.key ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className={`${inputCls} w-auto`} value={from} max={to} onChange={(e) => { setFrom(e.target.value); setRange(""); }} />
          <span className="text-sm text-gray-400">to</span>
          <input type="date" className={`${inputCls} w-auto`} value={to} min={from} onChange={(e) => { setTo(e.target.value); setRange(""); }} />
        </div>
      </div>

      {content()}
    </div>
  );
};

export default ReportsPage;
