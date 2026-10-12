// src/components/saas/pages/CompaniesPage.jsx
// Tenant companies (clinics) — reference list layout (ListShell).
// Fully wired to /saas/admin/companies; until the backend module lands a
// 404 renders as a friendly "backend coming" state instead of an error.
import React, { useCallback, useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { Building2, Plus, SquarePen, Hammer, Eye, Boxes, Activity, LogIn, Database, Loader2, CalendarPlus } from "lucide-react";
import CompanyDetailsModal from "./CompanyDetailsModal";
import CompanyActivityModal from "./CompanyActivityModal";
import ExtendSubscriptionModal from "./ExtendSubscriptionModal";
import { saasCompaniesApi, saasPlansApi } from "../../../api/saasApi";
import { useToast } from "../../common/Toast";
import PaginationFooter, { useClampPage } from "../../common/PaginationFooter";
import ListShell, { SkeletonRows, filterSelectCls, filterInputCls } from "../ListShell";
import {
  Modal,
  Field,
  inputCls,
  BtnPrimary,
  BtnGhost,
  CurrencySelect,
  EmptyState,
  StatusBadge,
  Th,
  Td,
  Tr,
  fmtDate,
  fmtDateTime,
  fmtAgo,
  staleDot,
  fmtBytes,
} from "../common";
import { can } from "../../../utils/saasAuth";
import { CLINIC_APP_URL } from "../../../config/app";

const EMPTY_FORM = {
  name: "",
  slug: "",
  email: "",
  phone: "",
  currency: "PKR",
  time_zone: "Asia/Karachi",
  status: "active",
  storage_limit_mb: "",
};

/* Modal: per-company module access — inherit the plan or set a custom list.
   Saved to company.module_overrides (null = inherit). */
const CompanyModulesModal = ({ company, onClose }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [override, setOverride] = useState(
    Array.isArray(company.module_overrides) ? [...company.module_overrides] : null,
  );
  const catalogQ = useQuery({
    queryKey: ["saas-modules-catalog"],
    queryFn: saasPlansApi.modulesCatalog,
    staleTime: 10 * 60_000,
  });
  const catalog = catalogQ.data?.modules ?? [];
  const set = new Set(override ?? []);
  // Add-ons (`default_off`) are never granted just by switching to a custom
  // list — they have to be ticked on purpose.
  const defaultOn = catalog.filter((m) => !m.default_off).map((m) => m.key);

  const saveM = useMutation({
    mutationFn: () => saasCompaniesApi.update(company.id, { module_overrides: override }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saas-companies"] });
      toast.success(`Module access updated for ${company.name}`);
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || "Save failed"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Module access — ${company.name}`}
      wide
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            {saveM.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save access
          </BtnPrimary>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {[
            ["inherit", "Inherit from plan"],
            ["custom", "Custom for this clinic"],
          ].map(([k, label]) => {
            const active = k === "inherit" ? override === null : override !== null;
            return (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setOverride(k === "inherit" ? null : override ?? defaultOn)
                }
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition ${
                  active
                    ? "bg-primary-600 border-primary-600 text-white"
                    : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {override === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            This clinic gets exactly the modules of its purchased plan. Switch to
            custom to grant or revoke modules independently of the plan.
          </p>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
            {catalog.map((m) => (
              <label
                key={m.key}
                className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-200"
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary-600"
                  checked={set.has(m.key)}
                  onChange={(e) => {
                    const next = new Set(set);
                    e.target.checked ? next.add(m.key) : next.delete(m.key);
                    setOverride([...next]);
                  }}
                />
                {m.label}
                {m.default_off ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-900/20">
                    Add-on
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

/**
 * Whole days from today to `end`, counted MIDNIGHT TO MIDNIGHT.
 *
 * Not a subtraction of timestamps. A subscription ending tomorrow morning is
 * "1 day left" to everyone who reads it, but plain subtraction calls it 0 for
 * anything ending earlier in the day than the moment you happen to look.
 *
 * This is deliberately the same rule as `daysUntil` in the clinic portal
 * (jdent-saas-frontend/src/utils/subscriptionExpiry.js), which decides when
 * that clinic is warned its portal is about to lock. The two screens describe
 * the same subscription to two different people, and they must not disagree
 * about how many days are left - an admin reading "2 days" while the clinic
 * is being told "1 day" turns an ordinary renewal into an argument.
 */
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const daysUntil = (end, now = new Date()) => {
  if (!end) return null;
  return Math.round(
    (startOfDay(end).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
};

/**
 * What the clinic is subscribed to, as a chip on its name.
 *
 * The Status column next to it is the CLINIC's status - active, inactive,
 * suspended - which an admin sets by hand. This is a different fact
 * entirely: what the clinic is paying for and whether that is still
 * running. A clinic can sit Active in that column with an expired
 * subscription, and that combination is exactly the one worth seeing from
 * the list rather than by opening each row.
 *
 * FOUR STATES, and the empty one is a state too: no subscription at all is
 * not the same as one that lapsed, so it says so rather than rendering
 * nothing and reading as a loading row.
 */
export const SubscriptionBadge = ({ subscription }) => {
  if (!subscription) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-dashed border-gray-300 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-gray-400 dark:border-gray-600"
        title="This clinic has never had a subscription">
        No plan
      </span>
    );
  }

  const { plan_name, status, current_period_end } = subscription;
  const end = current_period_end ? new Date(current_period_end) : null;
  const days = end ? daysUntil(end) : null;
  const live = status === "active" && (days == null || days >= 0);

  /*
   * Expiring soon is the one an admin has to act on, so it gets its own
   * colour rather than being folded into "active". Seven days, matching the
   * window the clinic portal itself starts warning in - the two screens
   * should not disagree about when a subscription is nearly up.
   */
  const soon = live && days != null && days <= 7;

  const tone = !live
    ? "bg-red-700 border-red-700 text-white"
    : soon
      ? "bg-amber-600 border-amber-600 text-white"
      : "bg-teal-700 border-teal-700 text-white";

  // The state replaces the plan name when the plan is not running: an
  // expired clinic's old plan name is not the useful fact, that it expired
  // is.
  const label = live
    ? plan_name || "Subscribed"
    : status === "cancelled"
      ? "Cancelled"
      : status === "past_due"
        ? "Past due"
        : "Expired";

  const title = [
    plan_name ? `Plan: ${plan_name}` : null,
    `Subscription: ${status}`,
    end
      ? live
        ? `Runs until ${fmtDate(end)}${days != null ? ` (${days} day${days === 1 ? "" : "s"} left)` : ""}`
        : `Ended ${fmtDate(end)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${tone}`}
      title={title}>
      {label}
      {soon && <span className="opacity-80">· {days}d</span>}
    </span>
  );
};

/**
 * Footprint badge that rides on the clinic name — same idea as a bell's unread
 * count, but the number is a size. Colour is a rough pressure signal, not a
 * quota: gray under 50 MB, amber under 250 MB, red beyond.
 */
const SizeBadge = ({ footprint, loading }) => {
  if (loading && !footprint) {
    return <span className="shimmer-block inline-block h-4 w-12 rounded-full align-middle" />;
  }
  if (!footprint) return null;

  const total = footprint.total_bytes ?? 0;
  const pct = footprint.used_pct;

  // Solid dark chip in all states — the hue carries the pressure signal
  // without the badge going pale next to the clinic name. Against an
  // allocation the signal is % of quota; unlimited clinics fall back to
  // absolute size, since there is nothing to be a percentage of.
  const hot = pct != null ? pct >= 100 : total >= 250 * 1024 ** 2;
  const warm = pct != null ? pct >= 80 : total >= 50 * 1024 ** 2;
  const tone = hot
    ? "bg-red-700 border-red-700 text-white"
    : warm
      ? "bg-amber-600 border-amber-600 text-white"
      : "bg-gray-800 border-gray-800 text-white dark:bg-gray-900 dark:border-gray-900";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${tone}`}
      title={
        `Database ~${fmtBytes(footprint.db_bytes)} · ${footprint.rows.toLocaleString()} rows
` +
        `Files ${fmtBytes(footprint.file_bytes)} · ${footprint.files.toLocaleString()} file${footprint.files === 1 ? "" : "s"}
` +
        `Total ~${fmtBytes(total)} (database size is an estimate)
` +
        (footprint.limit_mb
          ? `Allocated ${fmtBytes(footprint.limit_mb * 1024 * 1024)} (${
              footprint.limit_source === "company"
                ? "set for this clinic"
                : footprint.limit_source === "plan"
                  ? "from plan"
                  : "platform default"
            }) — ${pct}% used`
          : "No allocation — unlimited")
      }
    >
      <Database className="h-2.5 w-2.5" />
      {fmtBytes(total)}
      {pct != null && <span className="opacity-70">· {pct}%</span>}
    </span>
  );
};

const SKELETON_HEADERS = ["#", "Clinic", "Contact", "Status", "Last used", "Created", "Actions"];
const SKELETON_WIDTHS = ["w-6", "w-40", "w-40", "w-14", "w-20", "w-20", "w-10"];

const DEFAULT_SORT = { sortBy: "created_at", sortOrder: "DESC" };

const CompaniesPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [modal, setModal] = useState(null); // { mode, company? }
  const [viewFor, setViewFor] = useState(null); // company being viewed
  const [modulesFor, setModulesFor] = useState(null); // company whose module access is edited
  const [activityFor, setActivityFor] = useState(null); // company whose usage activity is shown
  const [planFilter, setPlanFilter] = useState("");
  const [subFilter, setSubFilter] = useState("");
  // The clinic whose subscription is being extended for months paid offline.
  const [extendFor, setExtendFor] = useState(null);
  const [openingId, setOpeningId] = useState(null); // clinic being opened as its owner

  /**
   * Open a clinic as its owner. The backend returns a one-time code (valid two
   * minutes, single use) which the clinic portal swaps for a token — the two
   * apps sit on different origins, so nothing can be passed via storage.
   */
  const openAsOwner = async (company) => {
    setOpeningId(company.id);
    try {
      const { code } = await saasCompaniesApi.impersonate(company.id);
      window.open(
        `${CLINIC_APP_URL}/impersonate?code=${encodeURIComponent(code)}`,
        "_blank",
        "noopener",
      );
    } catch (e) {
      toast.error(e.response?.data?.message || "Could not open that clinic");
    } finally {
      setOpeningId(null);
    }
  };
  const [form, setForm] = useState(EMPTY_FORM);

  /*
   * The plans, for the filter. Every plan ever sold, not just the active
   * ones: a clinic can still be sitting on a plan that was retired, and
   * leaving it out of the list makes those clinics unfindable.
   */
  const plansQ = useQuery({
    queryKey: ["saas-plans-for-filter"],
    queryFn: () => saasPlansApi.list(),
    staleTime: 5 * 60 * 1000,
  });
  const plans = Array.isArray(plansQ.data) ? plansQ.data : (plansQ.data?.items ?? []);

  const params = useMemo(
    () => ({
      page,
      limit: pageSize,
      sort_by: sort.sortBy,
      sort_order: sort.sortOrder,
      ...(search.trim() && { search: search.trim() }),
      ...(statusFilter && { status: statusFilter }),
      ...(activityFilter && { activity: activityFilter }),
      ...(sizeFilter && { size: sizeFilter }),
      ...(planFilter && { plan_id: Number(planFilter) }),
      ...(subFilter && { subscription: subFilter }),
      ...(createdFrom && { created_from: createdFrom }),
      ...(createdTo && { created_to: createdTo }),
    }),
    [
      page, pageSize, search, statusFilter, activityFilter, sizeFilter,
      planFilter, subFilter, createdFrom, createdTo, sort,
    ],
  );

  const companiesQ = useQuery({
    queryKey: ["saas-companies", params],
    queryFn: () => saasCompaniesApi.list(params),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const notImplemented = companiesQ.error?.response?.status === 404;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["saas-companies"] });
    qc.invalidateQueries({ queryKey: ["saas-companies-options"] }); // dropdowns
  };

  const createM = useMutation({
    mutationFn: (payload) => saasCompaniesApi.create(payload),
    onSuccess: () => {
      invalidate();
      setModal(null);
      toast.success("Clinic created");
    },
    onError: (e) =>
      toast.error(
        e.response?.status === 404
          ? "Clinics backend module is not deployed yet"
          : e.response?.data?.message || "Create failed",
      ),
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }) => saasCompaniesApi.update(id, payload),
    onSuccess: () => {
      invalidate();
      setModal(null);
      toast.success("Clinic updated");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Update failed"),
  });

  // Instant status change from the row — optimistic, no modal.
  const statusM = useMutation({
    mutationFn: ({ id, status }) => saasCompaniesApi.update(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["saas-companies"] });
      const prev = qc.getQueriesData({ queryKey: ["saas-companies"] });
      qc.setQueriesData({ queryKey: ["saas-companies"] }, (old) =>
        old?.items
          ? {
              ...old,
              items: old.items.map((c) => (c.id === id ? { ...c, status } : c)),
            }
          : old,
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(e.response?.data?.message || "Status change failed");
    },
    // No refetch on success — optimistic value is already correct.
  });

  const STATUS_ROW_CLS = {
    active:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
    inactive:
      "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600",
    suspended:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModal({ mode: "create" });
  };

  const openEdit = (company) => {
    setForm({
      name: company.name || "",
      slug: company.slug || "",
      email: company.email || "",
      phone: company.phone || "",
      currency: company.currency || "PKR",
      time_zone: company.time_zone || "Asia/Karachi",
      status: company.status || "active",
      storage_limit_mb: company.storage_limit_mb ?? "",
    });
    setModal({ mode: "edit", company });
  };

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      currency: form.currency,
      time_zone: form.time_zone,
      status: form.status,
      // Blank means "inherit the plan", which the API stores as NULL.
      storage_limit_mb:
        form.storage_limit_mb === "" ? null : Number(form.storage_limit_mb),
    };
    if (modal.mode === "create") createM.mutate(payload);
    else updateM.mutate({ id: modal.company.id, payload });
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const resetPageAnd = useCallback((setter) => (value) => {
    setter(value);
    setPage(1);
  }, []);

  const handleSearch = useCallback(resetPageAnd(setSearch), []);
  const handleSort = useCallback((next) => {
    setSort(next);
    setPage(1);
  }, []);

  const data = companiesQ.data;
  const items = data?.items ?? (Array.isArray(data) ? data : []);

  // Footprint is fetched separately for the ids on screen: sizing a clinic
  // counts rows across ~30 tables and walks its upload folder, so it must not
  // sit in front of the list rendering.
  const visibleIds = useMemo(() => items.map((c) => Number(c.id)), [items]);
  const storageQ = useQuery({
    queryKey: ["saas-companies-storage", visibleIds],
    queryFn: () => saasCompaniesApi.storage(visibleIds),
    enabled: visibleIds.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const storage = storageQ.data;
  useClampPage(data, page, setPage); // filter/delete shrank the list → snap back
  const isInitialLoad = companiesQ.isLoading && !data && !companiesQ.isError;
  const refreshing = companiesQ.isFetching && !isInitialLoad && !companiesQ.isError;

  const hasActiveFilters =
    !!search.trim() ||
    !!statusFilter ||
    !!activityFilter ||
    !!sizeFilter ||
    !!createdFrom ||
    !!createdTo ||
    !!planFilter ||
    !!subFilter ||
    sort.sortBy !== DEFAULT_SORT.sortBy ||
    sort.sortOrder !== DEFAULT_SORT.sortOrder;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setActivityFilter("");
    setSizeFilter("");
    setPlanFilter("");
    setSubFilter("");
    setCreatedFrom("");
    setCreatedTo("");
    setSort(DEFAULT_SORT);
    setPage(1);
  };

  return (
    <>
      <ListShell
        icon={Building2}
        title="Clinics"
        countLabel="Total Clinics"
        count={data?.total ?? items.length}
        initialLoading={isInitialLoad}
        refreshing={refreshing}
        onRefresh={() => companiesQ.refetch()}
        actions={
          <BtnPrimary onClick={openCreate}>
            <Plus className="w-4 h-4" /> New clinic
          </BtnPrimary>
        }
        search={{
          value: search,
          onChange: handleSearch,
          placeholder: "Search clinics…",
        }}
        filters={
          <>
            <select
              className={filterSelectCls}
              value={statusFilter}
              onChange={(e) => resetPageAnd(setStatusFilter)(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>

            {/* Freshness — same bands the activity modal reports. */}
            <select
              className={filterSelectCls}
              value={activityFilter}
              onChange={(e) => resetPageAnd(setActivityFilter)(e.target.value)}
              title="Filter by how recently the clinic was used"
            >
              <option value="">Any activity</option>
              <option value="active">Active — used in 7 days</option>
              <option value="low">Low — 8 to 30 days</option>
              <option value="idle">Idle — 31 to 90 days</option>
              <option value="dormant">Dormant — over 90 days</option>
              <option value="never">Never used</option>
            </select>

            {/* What the clinic is PAYING for. Two controls rather than one,
                because "on Monthly Standard" and "has lapsed" are different
                questions and an admin usually wants to cross them: who was
                on the premium plan and has now expired. */}
            <select
              className={filterSelectCls}
              value={planFilter}
              onChange={(e) => resetPageAnd(setPlanFilter)(e.target.value)}
              title="Filter by the plan the clinic is currently on"
            >
              <option value="">Any plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* The same states the badge on each row reports, chosen the
                same way, so filtering can never disagree with the chip. */}
            <select
              className={filterSelectCls}
              value={subFilter}
              onChange={(e) => resetPageAnd(setSubFilter)(e.target.value)}
              title="Filter by the state of the clinic's subscription"
            >
              <option value="">Any subscription</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
              <option value="past_due">Past due</option>
              <option value="none">No subscription</option>
            </select>

            {/* Footprint — absolute bands, plus the two quota-pressure ones. */}
            <select
              className={filterSelectCls}
              value={sizeFilter}
              onChange={(e) => resetPageAnd(setSizeFilter)(e.target.value)}
              title="Filter by data footprint"
            >
              <option value="">Any size</option>
              <option value="lt10mb">Under 10 MB</option>
              <option value="10to100mb">10 – 100 MB</option>
              <option value="100mbto1gb">100 MB – 1 GB</option>
              <option value="gt1gb">Over 1 GB</option>
              <option value="near_quota">Near quota (80%+)</option>
              <option value="over_quota">Over quota</option>
            </select>

            {/* Created range. `w-auto`, never w-full — a stretched date input
                breaks the whole filter bar. */}
            <input
              type="date"
              className={`${filterInputCls} w-auto`}
              value={createdFrom}
              max={createdTo || undefined}
              onChange={(e) => resetPageAnd(setCreatedFrom)(e.target.value)}
              title="Created from"
            />
            <input
              type="date"
              className={`${filterInputCls} w-auto`}
              value={createdTo}
              min={createdFrom || undefined}
              onChange={(e) => resetPageAnd(setCreatedTo)(e.target.value)}
              title="Created to"
            />
          </>
        }
        sort={{
          sortBy: sort.sortBy,
          sortOrder: sort.sortOrder,
          onChange: handleSort,
          options: [
            { value: "created_at", label: "Created" },
            { value: "name", label: "Name" },
            { value: "status", label: "Status" },
          ],
        }}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        isEmpty={companiesQ.isError || items.length === 0}
        empty={
          notImplemented
            ? {
                icon: Hammer,
                title: "Clinics backend is the next milestone",
                subtitle:
                  "This page is fully wired to /saas/admin/companies. As soon as the module is added to the NestJS backend, tenant clinics will appear and be manageable here.",
              }
            : companiesQ.isError
              ? {
                  icon: Building2,
                  title: "Could not load clinics",
                  subtitle:
                    companiesQ.error?.response?.data?.message || companiesQ.error?.message,
                }
              : {
                  icon: Building2,
                  title: "No clinics yet",
                  subtitle: "Onboard the first clinic to the platform.",
                  action: (
                    <BtnPrimary onClick={openCreate}>
                      <Plus className="w-4 h-4" /> New clinic
                    </BtnPrimary>
                  ),
                }
        }
        skeleton={<SkeletonRows headers={SKELETON_HEADERS} widths={SKELETON_WIDTHS} rows={8} />}
        footer={
          data?.total > 0 ? (
            <PaginationFooter
              currentPage={page}
              totalPages={data.total_pages}
              onPageChange={setPage}
              totalItems={data.total}
              itemsPerPage={data.limit ?? pageSize}
              itemName="clinics"
              pageSize={pageSize}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            />
          ) : null
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Clinic</Th>
              <Th>Contact</Th>
              <Th>Status</Th>
              <Th>Last used</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((c, i) => (
              <Tr key={c.id}>
                {/* Position in the list, not the database id — the id still
                    shows in the row title for support conversations. */}
                <Td className="text-xs text-gray-400" title={`Clinic #${c.id}`}>
                  {(page - 1) * (data?.limit ?? pageSize) + i + 1}
                </Td>
                <Td>
                  {/* Stacked: badges · name · slug — the chips get their own
                      line so long clinic names never push them off. */}
                  <span className="mb-0.5 flex flex-wrap items-center gap-1">
                    <SubscriptionBadge subscription={c.subscription} />
                    <SizeBadge footprint={storage?.[c.id]} loading={storageQ.isFetching && !storage} />
                  </span>
                  <span className="block font-medium">{c.name}</span>
                  <span className="block font-mono text-[11px] text-gray-400">{c.slug}</span>
                </Td>
                <Td className="text-xs">
                  {c.owner_name && (
                    <span className="block font-medium text-gray-700 dark:text-gray-200">
                      {c.owner_name}
                    </span>
                  )}
                  <span className="block">{c.email || "—"}</span>
                  {c.phone && <span className="block text-gray-400">{c.phone}</span>}
                </Td>
                <Td>
                  {(() => {
                    /*
                     * A clinic that has paid is not switched off from here.
                     *
                     * This dropdown sits in a list of fifty rows, one click
                     * from the Suspended of the row above, and nothing in the
                     * row says money has changed hands. Getting it wrong locks
                     * a practice out of its own appointment book.
                     *
                     * The server refuses it either way; the control is locked
                     * so the rule is visible rather than discovered by being
                     * refused. Switching such a clinic off means ending what
                     * it paid for first - cancel the subscription - which is
                     * a deliberate act on its own screen.
                     */
                    const paidUntil = c.paid_until ? new Date(c.paid_until) : null;
                    const paidUp = !!paidUntil && paidUntil > new Date();
                    const mayEdit = can("companies.edit");
                    const locked = !mayEdit || paidUp;

                    return (
                      <select
                        value={c.status}
                        onChange={(e) => statusM.mutate({ id: c.id, status: e.target.value })}
                        disabled={locked}
                        title={
                          paidUp
                            ? `Paid up to ${fmtDate(c.paid_until)} \u2014 cancel the subscription before switching this clinic off`
                            : mayEdit
                              ? "Change status"
                              : "You cannot change clinic status"
                        }
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${
                          locked ? "cursor-not-allowed" : "cursor-pointer"
                        } ${STATUS_ROW_CLS[c.status] || STATUS_ROW_CLS.inactive}`}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    );
                  })()}
                </Td>
                {/* Last time the clinic actually did something in the app,
                    with the last login of any of its users underneath. */}
                <Td className="text-xs whitespace-nowrap">
                  <span
                    className="inline-flex items-center gap-1.5"
                    title={c.last_activity_at ? `Last activity ${fmtDateTime(c.last_activity_at)}` : "No activity recorded"}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${staleDot(c.last_activity_at)}`} />
                    {fmtAgo(c.last_activity_at) ?? "never"}
                  </span>
                  <span
                    className="block text-gray-400"
                    title={c.last_login_at ? `Last login ${fmtDateTime(c.last_login_at)}` : "Never logged in"}
                  >
                    Login {fmtAgo(c.last_login_at) ?? "never"}
                  </span>
                </Td>
                <Td className="text-xs">{fmtDate(c.created_at)}</Td>
                <Td className="text-right whitespace-nowrap">
                  <button
                    onClick={() => setViewFor(c)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                    title="View — plans & payments"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {can("companies.impersonate") && (
                  <button
                    onClick={() => openAsOwner(c)}
                    disabled={openingId === c.id}
                    className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50"
                    title="Open this clinic as its owner"
                  >
                    {openingId === c.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogIn className="w-4 h-4" />
                    )}
                  </button>
                  )}
                  {can("companies.activity") && (
                  <button
                    onClick={() => setActivityFor(c)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    title="Activity — usage status, volume & trend"
                  >
                    <Activity className="w-4 h-4" />
                  </button>
                  )}
                  {can("companies.edit") && (
                  <button
                    onClick={() => setModulesFor(c)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    title={`Module access${Array.isArray(c.module_overrides) ? " — custom" : " — from plan"}`}
                  >
                    <Boxes className="w-4 h-4" />
                  </button>
                  )}
                  {/* Crediting months a clinic paid for offline. Guarded by
                      the renewal permission, the same one the endpoint
                      enforces - a button the API would refuse is worse than
                      no button. */}
                  {can("subscriptions.renew") && (
                  <button
                    onClick={() => setExtendFor(c)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                    title="Extend subscription — credit months already paid for"
                  >
                    <CalendarPlus className="w-4 h-4" />
                  </button>
                  )}
                  {can("companies.edit") && (
                  <button
                    onClick={() => openEdit(c)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                    title="Edit"
                  >
                    <SquarePen className="w-4 h-4" />
                  </button>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </ListShell>

      {/* View modal — plans & payments */}
      <CompanyDetailsModal company={viewFor} onClose={() => setViewFor(null)} />

      {/* Activity — usage status, volume, daily + monthly charts */}
      {extendFor && (
        <ExtendSubscriptionModal
          company={extendFor}
          onClose={() => setExtendFor(null)}
          onDone={() => qc.invalidateQueries({ queryKey: ["saas-companies"] })}
        />
      )}

      <CompanyActivityModal
        open={!!activityFor}
        company={activityFor}
        onClose={() => setActivityFor(null)}
      />

      {/* Module access — inherit plan or per-company override */}
      {modulesFor && (
        <CompanyModulesModal company={modulesFor} onClose={() => setModulesFor(null)} />
      )}

      {/* Create / edit modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === "create" ? "New clinic" : `Edit — ${modal?.company?.name}`}
        wide
        footer={
          <>
            <BtnGhost onClick={() => setModal(null)}>Cancel</BtnGhost>
            <BtnPrimary
              type="submit"
              form="company-form"
              disabled={createM.isPending || updateM.isPending}
            >
              {modal?.mode === "create" ? "Create clinic" : "Save changes"}
            </BtnPrimary>
          </>
        }
      >
        <form id="company-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Clinic name" required>
            <input className={inputCls} required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Slug" required hint="Used for the clinic's subdomain / URL">
            <input
              className={inputCls}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={form.slug}
              onChange={set("slug")}
            />
          </Field>
          <Field label="Email">
            <input type="email" className={inputCls} value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Currency" hint="Default PKR">
            <CurrencySelect
              value={form.currency}
              onChange={(code) => setForm((f) => ({ ...f, currency: code }))}
            />
          </Field>
          <Field label="Time zone">
            <input className={inputCls} value={form.time_zone} onChange={set("time_zone")} />
          </Field>
          {/* Per-clinic allocation. Blank inherits whatever the plan gives. */}
          <Field label="Storage (MB)" hint="empty = plan or default">
            <input
              type="number"
              min="1"
              className={inputCls}
              value={form.storage_limit_mb}
              onChange={set("storage_limit_mb")}
            />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={set("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </Field>
        </form>
      </Modal>
    </>
  );
};

export default React.memo(CompaniesPage);
