// src/components/saas/pages/SubscriptionsPage.jsx
// Company subscriptions — reference list layout (ListShell):
// stable card, debounced search, server-side filters/sort, skeleton rows,
// keepPreviousData so pagination/filtering never flashes empty.
import React, { useCallback, useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  CreditCard,
  Plus,
  PlayCircle,
  XCircle,
  RefreshCcw,
  ReceiptText,
  BadgeCheck,
} from "lucide-react";
import { saasSubscriptionsApi, saasPlansApi, saasInvoicesApi } from "../../../api/saasApi";
import { assetUrl } from "../../../config/app";
import { useToast } from "../../common/Toast";
import ConfirmationModal from "../../common/ConfirmationModal";
import PaginationFooter, { useClampPage } from "../../common/PaginationFooter";
import TableSkeleton from "../../common/TableSkeleton";
import ListShell, { SkeletonRows, filterSelectCls } from "../ListShell";
import { can } from "../../../utils/saasAuth";
import CompanySelect from "../CompanySelect";
import {
  Modal,
  Field,
  inputCls,
  BtnPrimary,
  BtnGhost,
  EmptyState,
  StatusBadge,
  Th,
  Td,
  Tr,
  fmtMoney,
  fmtDate,
  fmtDuration,
  ImageLightbox,
} from "../common";

const STATUSES = ["active", "past_due", "cancelled", "expired"];

const SKELETON_HEADERS = ["ID", "Clinic", "Plan", "Price", "Status", "Period", "Actions"];
const SKELETON_WIDTHS = ["w-8", "w-24", "w-20", "w-24", "w-16", "w-32", "w-20"];

const DEFAULT_SORT = { sortBy: "created_at", sortOrder: "DESC" };

const SubscriptionsPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // { action, sub }
  const [invoicesFor, setInvoicesFor] = useState(null); // subscription
  const [proofSrc, setProofSrc] = useState(null); // full-size proof viewer
  const [form, setForm] = useState({ company_id: "", plan_id: "" });

  const params = useMemo(
    () => ({
      page,
      limit: pageSize,
      sort_by: sort.sortBy,
      sort_order: sort.sortOrder,
      ...(statusFilter && { status: statusFilter }),
      ...(companyFilter && { company_id: Number(companyFilter) }),
      ...(search.trim() && { search: search.trim() }),
    }),
    [page, pageSize, statusFilter, companyFilter, search, sort],
  );

  const subsQ = useQuery({
    queryKey: ["saas-subscriptions", params],
    queryFn: () => saasSubscriptionsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const plansQ = useQuery({ queryKey: ["saas-plans"], queryFn: saasPlansApi.list });
  const subInvoicesQ = useQuery({
    queryKey: ["saas-sub-invoices", invoicesFor?.id],
    queryFn: () => saasSubscriptionsApi.invoices(invoicesFor.id),
    enabled: !!invoicesFor,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["saas-subscriptions"] });
    qc.invalidateQueries({ queryKey: ["saas-invoices"] });
  };

  const createM = useMutation({
    mutationFn: (payload) => saasSubscriptionsApi.create(payload),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      toast.success("Subscription created");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Create failed"),
  });

  // Approve / reject a payment-ledger row (or settle the invoice in full).
  // Full coverage re-activates the subscription and unlocks the clinic.
  const payM = useMutation({
    mutationFn: ({ mode, id }) =>
      mode === "reject"
        ? saasInvoicesApi.rejectPayment(id)
        : mode === "full"
          ? saasInvoicesApi.markPaid(id, { payment_method: "manual" })
          : saasInvoicesApi.approvePayment(id),
    onSuccess: (res, { mode }) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["saas-sub-invoices"] });
      if (mode === "reject") toast.success("Payment rejected — clinic must submit a new one");
      else if (res.status === "paid") toast.success("Payment confirmed — subscription activated");
      else toast.success(`Partial payment approved — ${fmtMoney(Number(res.total) - Number(res.paid_amount), res.currency)} still due`);
    },
    onError: (e) => toast.error(e.response?.data?.message || "Action failed"),
  });

  const actionM = useMutation({
    mutationFn: ({ action, id }) => saasSubscriptionsApi[action](id),
    onSuccess: (_, { action }) => {
      invalidate();
      setConfirm(null);
      toast.success(`Subscription ${action === "renew" ? "renewed" : `${action}d`}`);
    },
    onError: (e) => {
      setConfirm(null);
      toast.error(e.response?.data?.message || "Action failed");
    },
  });

  const submitCreate = (e) => {
    e.preventDefault();
    createM.mutate({
      company_id: Number(form.company_id),
      plan_id: Number(form.plan_id),
    });
  };

  const resetPageAnd = useCallback((setter) => (value) => {
    setter(value);
    setPage(1);
  }, []);

  const handleSearch = useCallback(resetPageAnd(setSearch), []);
  const handleSort = useCallback((next) => {
    setSort(next);
    setPage(1);
  }, []);

  const data = subsQ.data;
  const items = data?.items ?? [];
  useClampPage(data, page, setPage); // filter/delete shrank the list → snap back
  const isInitialLoad = subsQ.isLoading && !data;
  const refreshing = subsQ.isFetching && !isInitialLoad;

  const hasActiveFilters =
    !!statusFilter ||
    !!companyFilter ||
    !!search.trim() ||
    sort.sortBy !== DEFAULT_SORT.sortBy ||
    sort.sortOrder !== DEFAULT_SORT.sortOrder;

  const clearFilters = () => {
    setStatusFilter("");
    setCompanyFilter("");
    setSearch("");
    setSort(DEFAULT_SORT);
    setPage(1);
  };

  return (
    <>
      <ListShell
        icon={CreditCard}
        title="Subscriptions"
        countLabel="Total Subscriptions"
        count={data?.total ?? 0}
        initialLoading={isInitialLoad}
        refreshing={refreshing}
        onRefresh={() => subsQ.refetch()}
        actions={
          can("subscriptions.create") ? (
            <BtnPrimary onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> New subscription
            </BtnPrimary>
          ) : null
        }
        search={{
          value: search,
          onChange: handleSearch,
          placeholder: "Search plan name…",
        }}
        filters={
          <>
            <select
              className={filterSelectCls}
              value={statusFilter}
              onChange={(e) => resetPageAnd(setStatusFilter)(e.target.value)}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <CompanySelect
              value={companyFilter}
              onChange={resetPageAnd(setCompanyFilter)}
              allLabel="All clinics"
            />
          </>
        }
        sort={{
          sortBy: sort.sortBy,
          sortOrder: sort.sortOrder,
          onChange: handleSort,
          options: [
            { value: "created_at", label: "Created" },
            { value: "current_period_end", label: "Period end" },
            { value: "price", label: "Price" },
            { value: "status", label: "Status" },
            { value: "company_id", label: "Clinic" },
          ],
        }}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        isEmpty={items.length === 0}
        empty={{
          icon: CreditCard,
          title: "No subscriptions found",
          subtitle: "Subscribe a clinic to a plan to get started.",
          action: can("subscriptions.create") ? (
            <BtnPrimary onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> New subscription
            </BtnPrimary>
          ) : null,
        }}
        skeleton={<SkeletonRows headers={SKELETON_HEADERS} widths={SKELETON_WIDTHS} rows={10} />}
        footer={
          data?.total > 0 ? (
            <PaginationFooter
              currentPage={page}
              totalPages={data.total_pages}
              onPageChange={setPage}
              totalItems={data.total}
              itemsPerPage={data.limit ?? pageSize}
              itemName="subscriptions"
              pageSize={pageSize}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            />
          ) : null
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Clinic</Th>
              <Th>Plan</Th>
              <Th>Price</Th>
              <Th>Status</Th>
              <Th>Period</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              // Status says the action is possible; the permission says this
              // admin may take it.
              const canActivate = s.status === "past_due" && can("subscriptions.activate");
              const canCancel =
                ["active", "past_due"].includes(s.status) && can("subscriptions.cancel");
              const canRenew = s.status === "active" && can("subscriptions.renew");
              return (
                <Tr key={s.id}>
                  <Td className="text-xs text-gray-400">#{s.id}</Td>
                  <Td className="font-medium">
                    {s.company?.name ?? `Clinic #${s.company_id}`}
                    {s.company?.slug && (
                      <span className="block text-[10px] text-gray-400 font-mono">
                        /{s.company.slug}
                      </span>
                    )}
                  </Td>
                  <Td>{s.plan?.name ?? s.plan_id}</Td>
                  <Td>
                    {fmtMoney(s.price, s.currency)}
                    <span className="text-[11px] text-gray-400">
                      {" "}
                      / {fmtDuration(s.plan_type, s.duration_count)}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge value={s.status} />
                  </Td>
                  <Td className="text-xs whitespace-nowrap">
                    {fmtDate(s.current_period_start)} → {fmtDate(s.current_period_end)}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <button
                      onClick={() => setInvoicesFor(s)}
                      title="Invoices"
                      className="p-1.5 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                    >
                      <ReceiptText className="w-4 h-4" />
                    </button>
                    {canActivate && (
                      <button
                        onClick={() => setConfirm({ action: "activate", sub: s })}
                        title="Activate"
                        className="p-1.5 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                    )}
                    {canRenew && (
                      <button
                        onClick={() => setConfirm({ action: "renew", sub: s })}
                        title="Renew"
                        className="p-1.5 rounded-md text-gray-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                      >
                        <RefreshCcw className="w-4 h-4" />
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => setConfirm({ action: "cancel", sub: s })}
                        title="Cancel"
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </table>
      </ListShell>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New subscription"
        footer={
          <>
            <BtnGhost onClick={() => setCreateOpen(false)}>Cancel</BtnGhost>
            <BtnPrimary type="submit" form="sub-form" disabled={createM.isPending}>
              Create
            </BtnPrimary>
          </>
        }
      >
        <form id="sub-form" onSubmit={submitCreate} className="space-y-3">
          <Field label="Clinic" required hint="The tenant clinic being subscribed">
            <CompanySelect
              required
              value={form.company_id}
              onChange={(id) => setForm((f) => ({ ...f, company_id: id }))}
              className={inputCls}
            />
          </Field>
          <Field
            label="Plan"
            required
            hint="Subscription starts immediately; period and price come from the plan"
          >
            <select
              required
              className={inputCls}
              value={form.plan_id}
              onChange={(e) => setForm((f) => ({ ...f, plan_id: e.target.value }))}
            >
              <option value="">Select a plan…</option>
              {(plansQ.data ?? [])
                .filter((p) => p.is_active === 1)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {fmtMoney(p.price, p.currency)} /{" "}
                    {fmtDuration(p.plan_type, p.duration_count)}
                  </option>
                ))}
            </select>
          </Field>
        </form>
      </Modal>

      {/* Invoices drawer-modal */}
      <Modal
        open={!!invoicesFor}
        onClose={() => setInvoicesFor(null)}
        title={`Invoices — subscription #${invoicesFor?.id}`}
        wide
      >
        {subInvoicesQ.isLoading ? (
          <TableSkeleton rows={3} />
        ) : (subInvoicesQ.data ?? []).length === 0 ? (
          <EmptyState icon={ReceiptText} title="No invoices for this subscription yet" />
        ) : (
          <div className="space-y-3">
            {(subInvoicesQ.data ?? []).map((inv) => {
              const due = Math.max(0, Number(inv.total) - Number(inv.paid_amount ?? 0));
              const payments = [...(inv.payments ?? [])].sort(
                (a, b) => new Date(b.created_at) - new Date(a.created_at),
              );
              const hasPending = payments.some((p) => p.status === "pending");
              return (
                <div
                  key={inv.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  {/* Header: number + status */}
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                    <ReceiptText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">
                      {inv.invoice_number}
                    </span>
                    <StatusBadge value={inv.status} />
                    <div className="ml-auto text-right">
                      <span className="text-lg font-extrabold text-gray-900 dark:text-white">
                        {fmtMoney(inv.total, inv.currency)}
                      </span>
                      {inv.status === "open" && Number(inv.paid_amount) > 0 && (
                        <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 leading-tight">
                          {fmtMoney(due, inv.currency)} due
                          <span className="font-normal text-gray-400">
                            {" "}· {fmtMoney(inv.paid_amount, inv.currency)} received
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {/* Meta grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <p className="text-gray-400 mb-0.5">Billing period</p>
                        <p className="font-medium text-gray-700 dark:text-gray-200">
                          {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-0.5">Due date</p>
                        <p className="font-medium text-gray-700 dark:text-gray-200">
                          {fmtDate(inv.due_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-0.5">Paid at</p>
                        <p className="font-medium text-gray-700 dark:text-gray-200">
                          {inv.paid_at ? fmtDate(inv.paid_at) : "—"}
                          {inv.payment_method && (
                            <span className="ml-1 text-[10px] text-gray-400 capitalize">
                              ({inv.payment_method})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Payment ledger — every payment the clinic submitted */}
                    {payments.length > 0 && (
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                        {payments.map((p) => {
                          const partial =
                            p.status === "pending" && Number(p.amount) < due;
                          return (
                            <div key={p.id} className="flex items-center gap-3 p-2.5">
                              {p.proof ? (
                                <button
                                  type="button"
                                  onClick={() => setProofSrc(assetUrl(p.proof))}
                                  className="shrink-0 cursor-zoom-in"
                                  title="View full size"
                                >
                                  <img
                                    src={assetUrl(p.proof)}
                                    alt="Payment proof"
                                    className="w-12 h-12 rounded-lg object-cover bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                                  />
                                </button>
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center shrink-0">
                                  <ReceiptText className="w-4 h-4 text-gray-400" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1 text-xs">
                                <p className="font-semibold text-gray-800 dark:text-gray-100">
                                  {fmtMoney(p.amount, p.currency)}
                                  <span className="ml-2 align-middle"><StatusBadge value={p.status} /></span>
                                  {partial && (
                                    <span className="ml-1.5 font-normal text-amber-600 dark:text-amber-400">
                                      partial — {fmtMoney(due - Number(p.amount), p.currency)} will remain due
                                    </span>
                                  )}
                                </p>
                                <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                                  Submitted {fmtDate(p.created_at)}
                                  {p.reviewed_at && ` · reviewed ${fmtDate(p.reviewed_at)}`}
                                </p>
                              </div>
                              {p.status === "pending" &&
                                (can("invoices.approve") || can("invoices.reject")) && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {can("invoices.reject") && (
                                  <button
                                    onClick={() => payM.mutate({ mode: "reject", id: p.id })}
                                    disabled={payM.isPending}
                                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-xs font-semibold px-2.5 py-1.5 transition disabled:opacity-50"
                                  >
                                    <XCircle className="w-3.5 h-3.5" /> Reject
                                  </button>
                                  )}
                                  {can("invoices.approve") && (
                                  <button
                                    onClick={() => payM.mutate({ mode: "approve", id: p.id })}
                                    disabled={payM.isPending}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1.5 transition disabled:opacity-50"
                                  >
                                    <BadgeCheck className="w-3.5 h-3.5" />
                                    Approve
                                  </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Fallback settle action */}
                    {inv.status === "open" && !hasPending && (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] text-gray-400">
                          {payments.some((p) => p.status === "rejected")
                            ? "Last payment was rejected — waiting for the clinic to submit a new one."
                            : "No payment awaiting review."}
                        </p>
                        {can("invoices.pay") && (
                        <button
                          onClick={() => payM.mutate({ mode: "full", id: inv.id })}
                          disabled={payM.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-2 transition disabled:opacity-50 shrink-0"
                        >
                          <BadgeCheck className="w-3.5 h-3.5" />
                          {payM.isPending ? "Working…" : "Mark fully paid"}
                        </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Confirm lifecycle action — named accurately: company + plan, not #id */}
      <ConfirmationModal
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => actionM.mutate({ action: confirm.action, id: confirm.sub.id })}
        title={`${confirm?.action?.[0]?.toUpperCase()}${confirm?.action?.slice(1)} subscription`}
        message={(() => {
          const s = confirm?.sub;
          if (!s) return "";
          const who = s.company?.name || `Clinic #${s.company_id}`;
          const what = `"${s.plan?.name ?? "plan"}" (${fmtMoney(s.price, s.currency)} / ${fmtDuration(s.plan_type, s.duration_count)})`;
          if (confirm.action === "cancel")
            return `Cancel ${who}'s ${what} subscription? They keep access until ${fmtDate(s.current_period_end)}, then it ends.`;
          if (confirm.action === "renew")
            return `Renew ${who}'s ${what} subscription for ${fmtDuration(s.plan_type, s.duration_count)} more? A new invoice will be issued.`;
          return `Activate ${who}'s ${what} subscription now for a fresh ${fmtDuration(s.plan_type, s.duration_count)} period? An invoice will be issued.`;
        })()}
        type={confirm?.action === "cancel" ? "danger" : "info"}
        isLoading={actionM.isPending}
      />

      {/* Full-size payment proof viewer */}
      <ImageLightbox src={proofSrc} alt="Payment proof" onClose={() => setProofSrc(null)} />
    </>
  );
};

export default React.memo(SubscriptionsPage);
