// src/components/saas/pages/InvoicesPage.jsx
// Subscription invoices — reference list layout (ListShell), all filtering
// server-side (status / company / search / sort / pagination).
import React, { useCallback, useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { ReceiptText, BadgeCheck } from "lucide-react";
import { saasInvoicesApi } from "../../../api/saasApi";
import { assetUrl } from "../../../config/app";
import { useToast } from "../../common/Toast";
import PaginationFooter, { useClampPage } from "../../common/PaginationFooter";
import ListShell, { SkeletonRows, filterSelectCls } from "../ListShell";
import { can } from "../../../utils/saasAuth";
import CompanySelect from "../CompanySelect";
import {
  Modal,
  Field,
  inputCls,
  BtnPrimary,
  BtnGhost,
  StatusBadge,
  Th,
  Td,
  Tr,
  fmtMoney,
  fmtDate,
  fmtDateTime,
  ImageLightbox,
} from "../common";

const SKELETON_HEADERS = ["Number", "Clinic", "Period", "Total", "Status", "Due", "Paid", "Actions"];
const SKELETON_WIDTHS = ["w-28", "w-10", "w-32", "w-20", "w-14", "w-16", "w-24", "w-16"];

const DEFAULT_SORT = { sortBy: "created_at", sortOrder: "DESC" };

const InvoicesPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [payFor, setPayFor] = useState(null); // invoice
  const [payForm, setPayForm] = useState({ payment_method: "bank_transfer", gateway_ref: "" });
  const [proofSrc, setProofSrc] = useState(null); // full-size proof viewer

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

  const invoicesQ = useQuery({
    queryKey: ["saas-invoices", params],
    queryFn: () => saasInvoicesApi.list(params),
    placeholderData: keepPreviousData,
  });

  const payM = useMutation({
    mutationFn: ({ id, payload }) => saasInvoicesApi.markPaid(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saas-invoices"] });
      qc.invalidateQueries({ queryKey: ["saas-subscriptions"] });
      setPayFor(null);
      toast.success("Invoice marked as paid");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Failed to mark paid"),
  });

  const resetPageAnd = useCallback((setter) => (value) => {
    setter(value);
    setPage(1);
  }, []);

  const handleSearch = useCallback(resetPageAnd(setSearch), []);
  const handleSort = useCallback((next) => {
    setSort(next);
    setPage(1);
  }, []);

  const data = invoicesQ.data;
  const invoices = data?.items ?? [];
  useClampPage(data, page, setPage); // filter/delete shrank the list → snap back
  const isInitialLoad = invoicesQ.isLoading && !data;
  const refreshing = invoicesQ.isFetching && !isInitialLoad;

  const openTotal = invoices
    .filter((i) => i.status === "open")
    .reduce((s, i) => s + Number(i.total || 0), 0);

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
        icon={ReceiptText}
        title="Subscription invoices"
        countLabel="Total Invoices"
        count={data?.total ?? 0}
        initialLoading={isInitialLoad}
        refreshing={refreshing}
        onRefresh={() => invoicesQ.refetch()}
        actions={
          openTotal > 0 ? (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1.5">
              {fmtMoney(openTotal)} outstanding on this page
            </span>
          ) : null
        }
        search={{
          value: search,
          onChange: handleSearch,
          placeholder: "Search invoice # / ref…",
        }}
        filters={
          <>
            <select
              className={filterSelectCls}
              value={statusFilter}
              onChange={(e) => resetPageAnd(setStatusFilter)(e.target.value)}
            >
              <option value="">All statuses</option>
              {["draft", "open", "paid", "void", "uncollectible"].map((s) => (
                <option key={s} value={s}>
                  {s}
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
            { value: "total", label: "Total" },
            { value: "due_date", label: "Due date" },
            { value: "paid_at", label: "Paid at" },
            { value: "status", label: "Status" },
          ],
        }}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        isEmpty={invoices.length === 0}
        empty={{
          icon: ReceiptText,
          title: "No invoices found",
          subtitle:
            "Invoices are generated automatically when paid subscriptions activate or renew.",
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
              itemName="invoices"
              pageSize={pageSize}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            />
          ) : null
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Clinic</Th>
              <Th>Period</Th>
              <Th>Total</Th>
              <Th>Status</Th>
              <Th>Due</Th>
              <Th>Paid</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <Tr key={inv.id}>
                <Td className="font-mono text-xs">{inv.invoice_number}</Td>
                <Td className="font-medium">
                  {inv.company?.name ?? `#${inv.company_id}`}
                </Td>
                <Td className="text-xs whitespace-nowrap">
                  {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}
                </Td>
                <Td className="font-semibold">{fmtMoney(inv.total, inv.currency)}</Td>
                <Td>
                  <StatusBadge value={inv.status} />
                </Td>
                <Td className="text-xs">{fmtDate(inv.due_date)}</Td>
                <Td className="text-xs">
                  {inv.paid_at ? (
                    <>
                      {fmtDateTime(inv.paid_at)}
                      {inv.payment_method && (
                        <span className="block text-[10px] text-gray-400">
                          {inv.payment_method}
                        </span>
                      )}
                    </>
                  ) : (inv.payments ?? []).some((p) => p.status === "pending") ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      payment submitted
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-right">
                  {inv.status === "open" && can("invoices.pay") && (
                    <button
                      onClick={() => {
                        setPayForm({ payment_method: "bank_transfer", gateway_ref: "" });
                        setPayFor(inv);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                    >
                      <BadgeCheck className="w-3.5 h-3.5" /> Mark paid
                    </button>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </ListShell>

      {/* Mark-paid modal */}
      <Modal
        open={!!payFor}
        onClose={() => setPayFor(null)}
        title={`Mark paid — ${payFor?.invoice_number}`}
        footer={
          <>
            <BtnGhost onClick={() => setPayFor(null)}>Cancel</BtnGhost>
            <BtnPrimary
              onClick={() =>
                payM.mutate({
                  id: payFor.id,
                  payload: {
                    payment_method: payForm.payment_method || undefined,
                    gateway_ref: payForm.gateway_ref || undefined,
                  },
                })
              }
              disabled={payM.isPending}
            >
              Confirm payment
            </BtnPrimary>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-sm flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Amount</span>
            <span className="font-bold text-gray-900 dark:text-white">
              {fmtMoney(payFor?.total, payFor?.currency)}
            </span>
          </div>

          {/* Pending clinic payment (saas_payments ledger) */}
          {(payFor?.payments ?? [])
            .filter((p) => p.status === "pending")
            .map((p) => (
              <div key={p.id} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-700 dark:text-amber-300 font-medium">
                    Clinic submitted payment
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {fmtMoney(p.amount, p.currency)}
                  </span>
                </div>
                {p.proof && (
                  <button
                    type="button"
                    onClick={() => setProofSrc(assetUrl(p.proof))}
                    className="block w-full cursor-zoom-in"
                    title="View full size"
                  >
                    <img
                      src={assetUrl(p.proof)}
                      alt="Payment proof"
                      className="w-full max-h-56 object-contain rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                    />
                  </button>
                )}
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Submitted {fmtDateTime(p.created_at)} — approve/reject it from the Subscriptions page invoice view; marking paid here settles the whole invoice.
                </p>
              </div>
            ))}
          <Field label="Payment method">
            <select
              className={inputCls}
              value={payForm.payment_method}
              onChange={(e) =>
                setPayForm((f) => ({ ...f, payment_method: e.target.value }))
              }
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="stripe">Stripe</option>
              <option value="manual">Manual / other</option>
            </select>
          </Field>
          <Field label="Reference" hint="Gateway charge id / bank txn reference (optional)">
            <input
              className={inputCls}
              value={payForm.gateway_ref}
              onChange={(e) => setPayForm((f) => ({ ...f, gateway_ref: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      {/* Full-size payment proof viewer */}
      <ImageLightbox src={proofSrc} alt="Payment proof" onClose={() => setProofSrc(null)} />
    </>
  );
};

export default React.memo(InvoicesPage);
