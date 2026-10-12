// src/components/saas/pages/CompanyActivityModal.jsx
/**
 * Per-clinic activity for the platform admin.
 *
 * Answers three questions at a glance: is this clinic still using the product
 * (status), how hard are they using it (volume), and what does the trend look
 * like (daily + monthly charts). Charts are plain flex/CSS bars — the admin app
 * ships no charting library and doesn't need one for two bar charts.
 */
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Activity, TrendingUp, CalendarDays, Flame } from "lucide-react";
import { saasCompaniesApi } from "../../../api/saasApi";
import { Modal, fmtDateTime, fmtAgo } from "../common";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const STATUS = {
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30", dot: "bg-emerald-500" },
  low: { label: "Low activity", cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30", dot: "bg-amber-500" },
  idle: { label: "Idle", cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30", dot: "bg-orange-500" },
  dormant: { label: "Dormant", cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30", dot: "bg-red-500" },
};

const VOLUME = {
  high: { label: "High volume", cls: "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-500/10 dark:text-primary-300 dark:border-primary-500/30" },
  medium: { label: "Medium volume", cls: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30" },
  low: { label: "Low volume", cls: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600" },
  none: { label: "No volume", cls: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600" },
};

const Chip = ({ cls, dot, children }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
    {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
    {children}
  </span>
);

const Tile = ({ icon: Icon, label, value, sub }) => (
  <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
    <p className="mt-1 text-xl font-bold leading-none text-gray-900 dark:text-white">{value}</p>
    {sub && <p className="mt-1 text-[11px] text-gray-400">{sub}</p>}
  </div>
);

const SectionTitle = ({ children, right }) => (
  <div className="flex items-center justify-between">
    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{children}</h4>
    {right}
  </div>
);

const shortDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const shortMonth = (ym) => {
  const [y, m] = String(ym).split("-");
  return `${new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "short" })} ${String(y).slice(2)}`;
};

/**
 * Flex bar chart. Bars keep a 2px floor so a day with 1 event is still visible
 * beside a day with 40; zero days show only that baseline stub.
 */
const BarChart = ({ data, labelOf, titleOf, everyNthLabel = 1, height = 120 }) => {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div>
      <div className="flex items-end gap-[3px] border-b border-gray-200 dark:border-gray-700" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="group relative flex h-full flex-1 items-end justify-center"
            title={titleOf(d)}
          >
            <div
              className={`w-full rounded-t-sm transition ${
                d.total > 0 ? "bg-primary-500 group-hover:bg-primary-600" : "bg-gray-200 dark:bg-gray-700"
              }`}
              style={{ height: d.total > 0 ? `${Math.max(2, (d.total / max) * 100)}%` : "2px" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px]">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[9px] leading-tight text-gray-400">
            {i % everyNthLabel === 0 ? labelOf(d) : ""}
          </div>
        ))}
      </div>
    </div>
  );
};

const CompanyActivityModal = ({ open, company, onClose }) => {
  const [days, setDays] = useState(30);

  const q = useQuery({
    queryKey: ["company-activity", company?.id, days],
    queryFn: () => saasCompaniesApi.activity(company.id, { days, months: 12 }),
    enabled: open && !!company?.id,
  });

  const a = q.data;
  const status = STATUS[a?.status] ?? STATUS.dormant;
  const volume = VOLUME[a?.volume?.level] ?? VOLUME.none;

  // 30 date labels can't sit side by side — thin them out per range.
  const everyNth = useMemo(() => (days <= 7 ? 1 : days <= 30 ? 3 : 9), [days]);

  return (
    <Modal open={open} onClose={onClose} size="xl" title={`Activity — ${company?.name ?? ""}`}>
      {q.isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : q.isError || !a ? (
        <p className="py-10 text-center text-sm text-gray-500">
          Could not load activity for this clinic.
        </p>
      ) : (
        <div className="space-y-4">
          {/* ── Status + volume ── */}
          <div className="flex flex-wrap items-center gap-2">
            <Chip cls={status.cls} dot={status.dot}>{status.label}</Chip>
            <Chip cls={volume.cls}>{volume.label}</Chip>
          </div>

          {/* ── Last used vs last login ── */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Last used</p>
              {a.last_activity_at ? (
                <>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {fmtAgo(a.last_activity_at)}
                  </p>
                  <p className="text-[11px] text-gray-400">{fmtDateTime(a.last_activity_at)}</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-gray-400">Never</p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Last login</p>
              {a.last_login ? (
                <>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {fmtAgo(a.last_login.at)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {fmtDateTime(a.last_login.at)} · {a.last_login.name}
                    {a.last_login.role ? ` (${a.last_login.role})` : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-gray-400">Never logged in</p>
              )}
            </div>
          </div>

          {/* ── Window headline numbers ── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile icon={Activity} label={`Events / ${days}d`} value={a.window.events.toLocaleString()} />
            <Tile icon={TrendingUp} label="Avg per day" value={a.volume.avg_per_day} />
            <Tile icon={CalendarDays} label="Active days" value={`${a.window.active_days} / ${a.window.days}`} />
            <Tile
              icon={Flame}
              label="Busiest day"
              value={a.window.peak ? a.window.peak.total : "—"}
              sub={a.window.peak ? shortDay(a.window.peak.date) : undefined}
            />
          </div>

          {/* ── Daily chart ── */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <SectionTitle
              right={
                <div className="flex items-center gap-1">
                  {RANGES.map((r) => (
                    <button
                      key={r.days}
                      onClick={() => setDays(r.days)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                        days === r.days
                          ? "bg-primary-600 text-white"
                          : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              }
            >
              Daily activity
            </SectionTitle>
            <div className="mt-3">
              <BarChart
                data={a.daily}
                everyNthLabel={everyNth}
                labelOf={(d) => shortDay(d.date)}
                titleOf={(d) => `${d.date} — ${d.total} event${d.total === 1 ? "" : "s"}`}
              />
            </div>
          </div>

          {/* ── Monthly chart ── */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <SectionTitle>Monthly activity — last 12 months</SectionTitle>
            <div className="mt-3">
              <BarChart
                data={a.monthly}
                height={100}
                labelOf={(d) => shortMonth(d.month)}
                titleOf={(d) => `${shortMonth(d.month)} — ${d.total} event${d.total === 1 ? "" : "s"}`}
              />
            </div>
          </div>

          {/* ── What the activity is made of (all time) ── */}
          <div>
            <SectionTitle
              right={
                <span className="text-[11px] font-semibold text-gray-500">
                  {a.totals.total.toLocaleString()} total
                </span>
              }
            >
              Activity breakdown
            </SectionTitle>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {a.sources.map((s) => (
                <div key={s.key} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                  <p className="text-[11px] text-gray-400">{s.label}</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    {s.total.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default CompanyActivityModal;
