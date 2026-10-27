// src/components/saas/pages/ShopsPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, Store, Smartphone, StickyNote, Users, X, Activity, BadgeCheck, Clock } from "lucide-react";
import { platformApi } from "../../../api/saasApi";
import { fmtAgo, fmtDate, inputCls, PageHeader, EmptyState, Th, Td, Tr } from "../common";
import { Loading, ErrorBox, Pager, Select, SubBadge, ActivityDot, PKR, num, TableCard, ModeBadge, Kpi } from "../kit";

const STATUS = [
  { value: "", label: "All shops" },
  { value: "paid", label: "Paying" },
  { value: "trial", label: "On trial" },
  { value: "expiring", label: "Ending in 7 days" },
  { value: "expired", label: "Expired" },
  { value: "suspended", label: "Suspended" },
];
const ACTIVITY = [
  { value: "", label: "Any activity" },
  { value: "active", label: "Active (2 days)" },
  { value: "low", label: "This week" },
  { value: "idle", label: "Idle (8 to 30 days)" },
  { value: "dormant", label: "Dormant (30+ days)" },
  { value: "never", label: "Never used" },
];
const SORT = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A to Z" },
  { value: "sales", label: "Most sales" },
  { value: "active", label: "Recently active" },
  { value: "expiry", label: "Ending first" },
];

const ShopsPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get("q") || "");
  const f = {
    q: params.get("q") || "",
    status: params.get("status") || "",
    plan: params.get("plan") || "",
    activity: params.get("activity") || "",
    mode: params.get("mode") || "",
    active: params.get("active") || "",
    sort: params.get("sort") || "newest",
    page: Number(params.get("page")) || 1,
  };

  const set = (patch) => {
    const next = { ...f, page: 1, ...patch };
    const p = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v && !(k === "sort" && v === "newest") && !(k === "page" && v === 1)) p.set(k, String(v));
    });
    setParams(p, { replace: true });
  };

  // Search as you type, a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => term !== f.q && set({ q: term.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const { data: plans = [] } = useQuery({ queryKey: ["plans"], queryFn: () => platformApi.plans().catch(() => []) });
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["shops", f],
    queryFn: () => platformApi.shops({ ...f, limit: 20 }),
    placeholderData: keepPreviousData,
  });

  const filtered = f.q || f.status || f.plan || f.activity || f.mode || f.active;

  return (
    <div className="space-y-4">
      <PageHeader title="Shops" subtitle="Every shop using JGasFlow, with its plan and how much it is used" />

      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Total shops" value={num(data.summary.total)} icon={Store} tone="navy" />
          <div className={f.active ? "rounded-xl ring-2 ring-emerald-400" : ""}>
            <Kpi label="Regular active" value={num(data.summary.active)} icon={Activity} tone="emerald" hint={f.active ? "Filter on, tap to clear" : "Used in last 7 days"} onClick={() => set({ active: f.active ? "" : "1" })} />
          </div>
          <Kpi label="Paying" value={num(data.summary.paying)} icon={BadgeCheck} tone="sky" />
          <Kpi label="On trial" value={num(data.summary.trial)} icon={Clock} tone="amber" />
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))] gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name, owner, phone or ID" className={`${inputCls} pl-9 pr-9`} />
          {term && (
            <button onClick={() => setTerm("")} title="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Select value={f.status} onChange={(v) => set({ status: v })} options={STATUS} />
        <Select value={f.plan} onChange={(v) => set({ plan: v })} options={[{ value: "", label: "Any plan" }, ...plans.map((p) => ({ value: p.key, label: p.name }))]} />
        <Select value={f.activity} onChange={(v) => set({ activity: v })} options={ACTIVITY} />
        <Select
          value={f.mode}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: "", label: "Offline and Online" },
            { value: "offline", label: "Offline shops" },
            { value: "online", label: "Online shops" },
          ]}
        />
        <Select value={f.sort} onChange={(v) => set({ sort: v })} options={SORT} />
      </div>

      {error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : isLoading ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <EmptyState icon={Store} title={filtered ? "No shop matches these filters" : "No shops yet"} subtitle={filtered ? "Try other filters or clear the search." : "Shops appear here as soon as they sign up in the app."} />
        </div>
      ) : (
        <div className={isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
          <TableCard footer={<Pager page={data.page} totalPages={data.total_pages} total={data.total} noun="shops" onPage={(p) => set({ page: p })} />}>
            <thead>
              <tr>
                <Th className="w-10 text-right">#</Th>
                <Th>Shop</Th>
                <Th>Plan</Th>
                <Th className="text-right">Sales, 30 days</Th>
                <Th className="hidden md:table-cell">Team</Th>
                <Th className="hidden lg:table-cell">Last used</Th>
                <Th className="hidden xl:table-cell">Joined</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s, i) => (
                <Tr key={s.id} onClick={() => navigate(`/shops/${s.id}`)} style={{ cursor: "pointer" }}>
                  <Td className="text-right text-[11px] text-gray-400 tabular-nums">{(data.page - 1) * (data.limit || 20) + i + 1}</Td>
                  <Td>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-9 h-9 shrink-0 rounded-lg bg-navy-900 text-white text-sm font-bold flex items-center justify-center">
                        {(s.name || "?")[0].toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate max-w-[220px] flex items-center gap-1.5">
                          {s.name}
                          {s.has_note && <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" title="Has a console note" />}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate max-w-[220px]">
                          #{s.id} {s.owner_name}, {s.phone}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <SubBadge sub={s.subscription} />
                        <ModeBadge mode={s.mode} />
                      </div>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">
                        {s.subscription.plan_name}
                        {s.subscription.lifetime ? ", lifetime" : s.subscription.expires_at ? `, to ${fmtDate(s.subscription.expires_at)}` : ""}
                      </span>
                      {s.pending > 0 && <span className="text-[11px] font-medium text-amber-600">Payment waiting</span>}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{PKR(s.sales_30d)}</p>
                    <p className="text-[11px] text-gray-500 whitespace-nowrap">{num(s.bills_30d)} bills</p>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="inline-flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1" title="Users"><Users className="w-3.5 h-3.5" />{s.users}</span>
                      <span className="inline-flex items-center gap-1" title="Phones signed in"><Smartphone className="w-3.5 h-3.5" />{s.phones}</span>
                    </span>
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <ActivityDot value={s.activity} />
                    <p className="text-[11px] text-gray-400">{fmtAgo(s.last_active_at) || "Never"}</p>
                  </Td>
                  <Td className="hidden xl:table-cell text-xs whitespace-nowrap">{fmtDate(s.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableCard>
        </div>
      )}
    </div>
  );
};

export default ShopsPage;
