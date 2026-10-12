// src/components/saas/pages/AnalyticsPage.jsx
// Traffic & Ads — who is visiting the public site, which ad brought them,
// and which of them registered a clinic.
//
// Reads /saas/analytics/*. Everything here is first-touch attribution: the
// ad credited is the one that earned the visitor, not the last URL they
// happened to arrive on.
import React, { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  BarChart3,
  Eye,
  AtSign,
  Camera,
  Globe,
  MousePointerClick,
  Facebook,
  Image as ImageIcon,
  Instagram,
  Linkedin,
  MessageCircle,
  Music2,
  Search,
  Smartphone,
  Tags,
  TrendingUp,
  UserPlus,
  Youtube,
} from "lucide-react";
import { analyticsApi } from "../../../api/saasApi";
import PaginationFooter, { useClampPage } from "../../common/PaginationFooter";
import ListShell, { SkeletonRows, filterSelectCls } from "../ListShell";
import { Modal, Th, Td, Tr, fmtDate } from "../common";

const PLATFORM_TONE = {
  google: "bg-blue-50 text-blue-700 border-blue-200",
  meta: "bg-indigo-50 text-indigo-700 border-indigo-200",
  tiktok: "bg-gray-100 text-gray-700 border-gray-300",
  bing: "bg-teal-50 text-teal-700 border-teal-200",
  linkedin: "bg-sky-50 text-sky-700 border-sky-200",
  organic: "bg-emerald-50 text-emerald-700 border-emerald-200",
  direct: "bg-gray-50 text-gray-600 border-gray-200",
  referral: "bg-amber-50 text-amber-700 border-amber-200",
};

/**
 * Ad tags arrive machine-shaped — url-encoded, snake_case or kebab-case,
 * sometimes just an id. Render something a human can read while keeping the
 * raw value in the tooltip, so it still matches what is in the ad account.
 *
 * Google's ValueTrack only offers numeric ids ({campaignid}), so an all-digit
 * value is labelled rather than shown bare; Meta and TikTok send real names.
 */
export const prettyName = (raw) => {
  if (raw === null || raw === undefined || raw === "") return "—";
  const v = String(raw).trim();
  if (v === "unknown") return "Not tagged";
  if (/^\d{6,}$/.test(v)) return `ID ${v}`;
  let out = v;
  try {
    out = decodeURIComponent(out.replace(/\+/g, " "));
  } catch {
    /* malformed encoding — show it as-is */
  }
  out = out.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  // Leave text that is already capitalised alone; only fix all-lower slugs
  if (out === out.toLowerCase()) {
    out = out
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return out;
};

/**
 * "meta" names an owner, not a place — the ad actually ran on Facebook or
 * Instagram. Where the network is known it is what gets shown, because that
 * is the thing you can act on; the platform stays as the grouping.
 */
const NETWORK_META = {
  facebook: { label: "Facebook", icon: Facebook, tone: "bg-blue-50 text-blue-700 border-blue-200" },
  instagram: { label: "Instagram", icon: Instagram, tone: "bg-pink-50 text-pink-700 border-pink-200" },
  messenger: { label: "Messenger", icon: MessageCircle, tone: "bg-sky-50 text-sky-700 border-sky-200" },
  threads: { label: "Threads", icon: AtSign, tone: "bg-gray-100 text-gray-700 border-gray-300" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  audience_network: { label: "Audience Network", icon: Globe, tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  youtube: { label: "YouTube", icon: Youtube, tone: "bg-red-50 text-red-700 border-red-200" },
  search: { label: "Search", icon: Search, tone: "bg-blue-50 text-blue-700 border-blue-200" },
  display: { label: "Display", icon: ImageIcon, tone: "bg-amber-50 text-amber-700 border-amber-200" },
  shorts: { label: "Shorts", icon: Youtube, tone: "bg-red-50 text-red-700 border-red-200" },
};

const PLATFORM_META = {
  google: { label: "Google", icon: Search },
  meta: { label: "Meta", icon: Facebook },
  tiktok: { label: "TikTok", icon: Music2 },
  bing: { label: "Bing", icon: Search },
  linkedin: { label: "LinkedIn", icon: Linkedin },
  twitter: { label: "X", icon: AtSign },
  snapchat: { label: "Snapchat", icon: Camera },
  youtube: { label: "YouTube", icon: Youtube },
  organic: { label: "Organic", icon: Search },
  referral: { label: "Referral", icon: Globe },
  direct: { label: "Direct", icon: MousePointerClick },
};

/** Platform badge, showing the network inside it when we know it. */
const SourceBadge = ({ platform, network }) => {
  const net = network ? NETWORK_META[network] : null;
  const plat = PLATFORM_META[platform] || { label: platform || "—", icon: Globe };
  const Icon = net?.icon || plat.icon;
  const tone = net?.tone || PLATFORM_TONE[platform] || "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
      title={net ? `${plat.label} · ${net.label}` : plat.label}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {net ? net.label : plat.label}
    </span>
  );
};

const Pill = ({ value, tone }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${
      tone || PLATFORM_TONE[value] || "bg-gray-50 text-gray-600 border-gray-200"
    }`}
  >
    {value || "—"}
  </span>
);

const Tile = ({ icon: Icon, label, value, sub }) => (
  <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 px-3 py-2.5">
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
      <Icon className="w-3.5 h-3.5" /> {label}
    </div>
    <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight mt-0.5">{value}</p>
    {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
  </div>
);

/** Horizontal bar breakdown — visitors with registrations alongside. */
const Breakdown = ({ title, rows, icon: Icon }) => {
  const max = Math.max(1, ...rows.map((r) => Number(r.visitors) || 0));
  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700">
      <h3 className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700 dark:text-gray-200 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
        <Icon className="w-4 h-4 text-primary-600" /> {title}
      </h3>
      <div className="p-3 space-y-1.5">
        {rows.length === 0 && <p className="text-[12px] text-gray-400">No data yet</p>}
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-[12px] text-gray-600 dark:text-gray-300" title={r.key}>
              {prettyName(r.key)}
            </span>
            <div className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{ width: `${(Number(r.visitors) / max) * 100}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-[11px] text-gray-500 tabular-nums">
              {Number(r.visitors).toLocaleString()}
              {Number(r.registrations) > 0 && (
                <b className="text-emerald-600"> · {Number(r.registrations)}✓</b>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

/**
 * One label/value pair, label ABOVE the value. Side-by-side rows fell apart
 * on the long fields — a Meta click id or an encoded campaign name wrapped
 * into a narrow column and pushed everything out of line. Stacking removes
 * the problem entirely, and `wide` gives the genuinely long values the full
 * row so they wrap naturally instead of being squeezed.
 */
const Item = ({ label, value, wide = false, mono = false }) => {
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <div className={wide ? "sm:col-span-2 min-w-0" : "min-w-0"}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p
        className={`text-[12.5px] text-gray-800 dark:text-gray-100 mt-0.5 break-words ${
          mono ? "font-mono text-[11px] break-all" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
};

const Group = ({ title, children }) => (
  <section>
    <h4 className="text-[11px] font-bold text-primary-700 dark:text-primary-300 mb-1.5">{title}</h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      {children}
    </div>
  </section>
);

const VisitorModal = ({ id, onClose }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-visitor", id],
    queryFn: () => analyticsApi.visitor(id),
  });

  const d = data || {};
  const sourceMedium = [d.first_utm_source, d.first_utm_medium].filter(Boolean).map(prettyName).join("  /  ");

  return (
    <Modal open onClose={onClose} title="Visitor detail" wide>
      {isLoading || !data ? (
        <span className="shimmer-block block h-56 rounded-xl" />
      ) : (
        <div className="space-y-3">
          <Group title="Where they came from">
            <Item label="Platform" value={<SourceBadge platform={d.first_platform} network={d.first_network} />} />
            <Item label="Ad type" value={<span className="capitalize">{d.first_ad_type}</span>} />
            <Item label="Paid click" value={d.first_is_paid ? "Yes" : "No"} />
            <Item label="Source / Medium" value={sourceMedium} />
            <Item label="Campaign" wide value={d.first_utm_campaign ? prettyName(d.first_utm_campaign) : null} />
            <Item label="Ad / creative" value={d.first_utm_content ? prettyName(d.first_utm_content) : null} />
            <Item label="Ad set / keyword" value={d.first_utm_term ? prettyName(d.first_utm_term) : null} />
            <Item label="Referrer" wide value={d.first_referrer} />
            <Item label="Landing page" wide value={d.landing_page} />
            <Item
              label={d.first_click_id_type ? `Click id (${d.first_click_id_type})` : "Click id"}
              wide
              mono
              value={d.first_click_id}
            />
          </Group>

          <Group title="Who they are">
            <Item label="Visitor id" mono value={d.visitor_id} />
            <Item label="Fingerprint" mono value={d.fingerprint} />
            <Item label="Device" value={[d.device_type, d.browser, d.os].filter(Boolean).join(" · ")} />
            <Item label="Screen / Language" value={[d.screen, d.language].filter(Boolean).join(" · ")} />
            <Item label="Timezone" value={d.timezone} />
            <Item label="IP address" value={d.ip} />
            <Item label="Country" value={d.country} />
            <Item label="User agent" wide mono value={d.user_agent} />
          </Group>

          <Group title="What they did">
            <Item label="First seen" value={fmtDate(d.created_at)} />
            <Item label="Last seen" value={fmtDate(d.last_seen_at)} />
            <Item label="Page views" value={d.page_views} />
            <Item label="Reached register" value={d.reached_register ? "Yes" : "No"} />
            <Item
              label="Registered clinic"
              wide
              value={d.registered_company_id ? `#${d.registered_company_id}${d.registered_email ? ` — ${d.registered_email}` : ""}` : null}
            />
            <Item label="Registered at" value={d.converted_at ? fmtDate(d.converted_at) : null} />
          </Group>

          <section>
            <h4 className="text-[11px] font-bold text-primary-700 dark:text-primary-300 mb-1.5">
              Journey · {d.events?.length || 0} page views
            </h4>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 max-h-56 overflow-y-auto">
              {(d.events ?? []).map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <span className="text-[11px] text-gray-400 w-32 shrink-0">{fmtDate(e.created_at)}</span>
                  <span className="text-[12px] text-gray-700 dark:text-gray-200 truncate flex-1" title={e.path}>
                    {e.path}
                  </span>
                  <Pill value={e.platform} />
                </div>
              ))}
              {(d.events ?? []).length === 0 && (
                <p className="px-3 py-3 text-[12px] text-gray-400">No page views recorded</p>
              )}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
};

const EMPTY_FILTERS = {
  platform: "",
  ad_type: "",
  network: "",
  utm_source: "",
  utm_campaign: "",
  utm_content: "",
  utm_term: "",
  paid: "",
  converted: "",
  date_from: "",
  date_to: "",
};

const AnalyticsPage = () => {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailId, setDetailId] = useState(null);

  const setF = (k) => (e) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };

  const clean = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")),
    [filters],
  );
  const hasActiveFilters = Object.keys(clean).length > 0 || !!search;

  const summaryQ = useQuery({
    queryKey: ["analytics-summary", clean.date_from, clean.date_to],
    queryFn: () => analyticsApi.summary({ date_from: clean.date_from, date_to: clean.date_to }),
    placeholderData: keepPreviousData,
  });
  const facetsQ = useQuery({ queryKey: ["analytics-facets"], queryFn: analyticsApi.facets, staleTime: 300_000 });

  const listQ = useQuery({
    queryKey: ["analytics-visitors", page, pageSize, search, clean],
    queryFn: () => analyticsApi.visitors({ page, limit: pageSize, ...(search ? { search } : {}), ...clean }),
    placeholderData: keepPreviousData,
  });
  useClampPage(listQ.data, page, setPage);

  const s = summaryQ.data?.totals ?? {};
  const items = listQ.data?.items ?? [];
  const facets = facetsQ.data ?? {};

  return (
    <div className="space-y-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <Tile icon={Eye} label="Visitors" value={Number(s.visitors ?? 0).toLocaleString()} sub={`${Number(s.page_views ?? 0).toLocaleString()} page views`} />
        <Tile icon={MousePointerClick} label="From ads" value={Number(s.paid_visitors ?? 0).toLocaleString()} sub="paid clicks" />
        <Tile icon={UserPlus} label="Reached register" value={Number(s.reached_register ?? 0).toLocaleString()} />
        <Tile icon={TrendingUp} label="Registered" value={Number(s.registrations ?? 0).toLocaleString()} sub="clinics created" />
        <Tile icon={BarChart3} label="Conversion" value={`${s.conversion_rate ?? 0}%`} sub="visitor → clinic" />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        <Breakdown title="By platform" icon={Globe} rows={summaryQ.data?.by_platform ?? []} />
        <Breakdown title="By network" icon={Instagram} rows={summaryQ.data?.by_network ?? []} />
        <Breakdown title="By ad type" icon={MousePointerClick} rows={summaryQ.data?.by_ad_type ?? []} />
        <Breakdown title="By campaign" icon={BarChart3} rows={summaryQ.data?.by_campaign ?? []} />
        <Breakdown title="By ad / creative" icon={ImageIcon} rows={summaryQ.data?.by_ad ?? []} />
        <Breakdown title="By ad set / keyword" icon={Tags} rows={summaryQ.data?.by_adset ?? []} />
        <Breakdown title="By device" icon={Smartphone} rows={summaryQ.data?.by_device ?? []} />
      </div>

      <ListShell
        icon={Eye}
        title="Visitors"
        countLabel="Visitors"
        count={listQ.data?.total ?? 0}
        initialLoading={listQ.isLoading}
        refreshing={listQ.isFetching}
        onRefresh={() => listQ.refetch()}
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: "Search campaign, source, email, landing page…",
        }}
        hasActiveFilters={hasActiveFilters}
        onClear={() => { setFilters(EMPTY_FILTERS); setSearch(""); setPage(1); }}
        filters={
          <>
            <select className={filterSelectCls} value={filters.platform} onChange={setF("platform")}>
              <option value="">All platforms</option>
              {(facets.platforms ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className={filterSelectCls} value={filters.network} onChange={setF("network")}>
              <option value="">All networks</option>
              {(facets.networks ?? []).map((p) => (
                <option key={p} value={p}>{NETWORK_META[p]?.label || prettyName(p)}</option>
              ))}
            </select>
            <select className={filterSelectCls} value={filters.ad_type} onChange={setF("ad_type")}>
              <option value="">All ad types</option>
              {(facets.ad_types ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className={filterSelectCls} value={filters.utm_campaign} onChange={setF("utm_campaign")}>
              <option value="">All campaigns</option>
              {(facets.campaigns ?? []).map((p) => <option key={p} value={p}>{prettyName(p)}</option>)}
            </select>
            <select className={filterSelectCls} value={filters.utm_content} onChange={setF("utm_content")}>
              <option value="">All ads</option>
              {(facets.ads ?? []).map((p) => <option key={p} value={p}>{prettyName(p)}</option>)}
            </select>
            <select className={filterSelectCls} value={filters.utm_term} onChange={setF("utm_term")}>
              <option value="">All ad sets</option>
              {(facets.adsets ?? []).map((p) => <option key={p} value={p}>{prettyName(p)}</option>)}
            </select>
            <select className={filterSelectCls} value={filters.utm_source} onChange={setF("utm_source")}>
              <option value="">All sources</option>
              {(facets.sources ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className={filterSelectCls} value={filters.paid} onChange={setF("paid")}>
              <option value="">Paid & organic</option>
              <option value="1">Paid only</option>
              <option value="0">Organic only</option>
            </select>
            <select className={filterSelectCls} value={filters.converted} onChange={setF("converted")}>
              <option value="">All visitors</option>
              <option value="1">Registered</option>
              <option value="0">Not registered</option>
            </select>
            <input type="date" className={filterSelectCls} value={filters.date_from} onChange={setF("date_from")} title="From" />
            <input type="date" className={filterSelectCls} value={filters.date_to} onChange={setF("date_to")} title="To" />
          </>
        }
        isEmpty={!listQ.isLoading && items.length === 0}
        empty={{
          icon: Eye,
          title: "No visitors recorded yet",
          subtitle: "Traffic appears here as soon as someone opens the public site.",
        }}
        skeleton={<SkeletonRows rows={8} />}
        footer={
          <PaginationFooter
            currentPage={page}
            totalPages={listQ.data?.total_pages ?? 1}
            onPageChange={setPage}
            totalItems={listQ.data?.total ?? 0}
            itemsPerPage={pageSize}
            itemName="visitors"
            pageSize={pageSize}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Visitor</Th>
              <Th>Platform</Th>
              <Th>Ad type</Th>
              <Th>Campaign / Ad</Th>
              <Th>Device</Th>
              <Th>Views</Th>
              <Th>Outcome</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <Tr key={v.id}>
                <Td>
                  <p className="font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[200px]" title={v.landing_page || ""}>
                    {v.registered_email || v.landing_page || v.visitor_id}
                  </p>
                  <p className="text-[11px] text-gray-400">{fmtDate(v.created_at)}</p>
                </Td>
                <Td><SourceBadge platform={v.first_platform} network={v.first_network} /></Td>
                <Td>
                  <span className="text-[12px] capitalize text-gray-600 dark:text-gray-300">{v.first_ad_type}</span>
                  {v.first_is_paid ? <span className="ml-1 text-[10px] font-bold text-amber-600">PAID</span> : null}
                </Td>
                <Td className="max-w-[190px]">
                  <p className="truncate font-medium text-gray-700 dark:text-gray-200" title={v.first_utm_campaign || ""}>
                    {prettyName(v.first_utm_campaign)}
                  </p>
                  {(v.first_utm_content || v.first_utm_term) && (
                    <p
                      className="truncate text-[11px] text-gray-400"
                      title={[v.first_utm_content, v.first_utm_term].filter(Boolean).join(" · ")}
                    >
                      {[v.first_utm_content, v.first_utm_term].filter(Boolean).map(prettyName).join(" · ")}
                    </p>
                  )}
                </Td>
                <Td className="text-[12px] text-gray-500 capitalize">
                  {[v.device_type, v.browser].filter(Boolean).join(" · ") || "—"}
                </Td>
                <Td className="tabular-nums">{v.page_views}</Td>
                <Td>
                  {v.registered_company_id ? (
                    <Pill value="registered" tone="bg-emerald-50 text-emerald-700 border-emerald-200" />
                  ) : v.reached_register ? (
                    <Pill value="reached form" tone="bg-amber-50 text-amber-700 border-amber-200" />
                  ) : (
                    <Pill value="browsed" />
                  )}
                </Td>
                <Td>
                  <button
                    onClick={() => setDetailId(v.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary-600 transition"
                    title="View journey"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </ListShell>

      {detailId && <VisitorModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
};

export default AnalyticsPage;
