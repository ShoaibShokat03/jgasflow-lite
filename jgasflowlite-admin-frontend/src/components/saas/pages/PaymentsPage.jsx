// src/components/saas/pages/PaymentsPage.jsx
// Payments shops send for their plan: approve, reject, or record money received outside the app.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Wallet, Plus, Check, X } from "lucide-react";
import { platformApi } from "../../../api/saasApi";
import { errMsg } from "../../../api/saasClient";
import { useToast } from "../../common/Toast";
import { fmtAgo, fmtDateTime, inputCls, PageHeader, EmptyState, BtnPrimary, StatusBadge, Th, Td, Tr } from "../common";
import { Loading, ErrorBox, Pager, PKR, METHOD_LABELS, TableCard, IconBtn } from "../kit";
import { RecordPaymentDialog, RejectDialog, usePlanName } from "../dialogs";
import { Proofs } from "../attach";

const TABS = [
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const PaymentsPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("pending");
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [recordOpen, setRecordOpen] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const planName = usePlanName();

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(term.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [term]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["payments", status, q, page],
    queryFn: () => platformApi.payments({ status, q, page, limit: 25 }),
    placeholderData: keepPreviousData,
  });

  const approve = useMutation({
    mutationFn: (id) => platformApi.approve(id),
    onSuccess: () => {
      toast.success("Payment approved and the plan is extended");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Payments" subtitle="What shops pay JGasFlow for their plan">
        <BtnPrimary onClick={() => setRecordOpen(true)}>
          <Plus className="w-4 h-4" /> Record payment
        </BtnPrimary>
      </PageHeader>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-900 p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setStatus(t.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                status === t.value ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Shop, phone or transaction ID" className={`${inputCls} pl-9`} />
        </div>
      </div>

      {error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : isLoading ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <EmptyState
            icon={Wallet}
            title={status === "pending" ? "Nothing waiting for approval" : "No payments here"}
            subtitle={status === "pending" ? "When a shop sends a bank transfer screenshot from the app, it appears here." : "Try another tab or search."}
          />
        </div>
      ) : (
        <div className={isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
          <TableCard
            footer={
              <div>
                <div className="px-4 pt-3 text-xs text-gray-500">
                  Total of this list: <b className="text-gray-900 dark:text-white">{PKR(data.amount)}</b>
                </div>
                <Pager page={data.page} totalPages={data.total_pages} total={data.total} noun="payments" onPage={setPage} />
              </div>
            }
          >
            <thead>
              <tr>
                <Th>Shop</Th>
                <Th>Plan</Th>
                <Th className="text-right">Amount</Th>
                <Th className="hidden md:table-cell">Paid by</Th>
                <Th>Proof</Th>
                <Th className="hidden lg:table-cell">Sent</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link to={`/shops/${p.tenant_id}`} className="font-medium text-gray-900 dark:text-white hover:underline">
                      {p.shop_name}
                    </Link>
                    <p className="text-[11px] text-gray-500">{p.sent_by ? `By ${p.sent_by}` : p.shop_phone}</p>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {planName(p.plan)}, {p.months} month{p.months === 1 ? "" : "s"}
                  </Td>
                  <Td className="text-right font-semibold whitespace-nowrap">{PKR(p.amount)}</Td>
                  <Td className="hidden md:table-cell text-xs">
                    {METHOD_LABELS[p.method] || p.method}
                    {p.txn_ref && <span className="block text-gray-500 font-mono">{p.txn_ref}</span>}
                    {p.note && <span className="block text-gray-400 max-w-[200px] truncate" title={p.note}>{p.note}</span>}
                  </Td>
                  <Td>
                    {p.proofs > 0 ? <Proofs base={platformApi.proofUrl(p.id)} count={p.proofs} size={44} /> : <span className="text-[11px] text-gray-400">None</span>}
                  </Td>
                  <Td className="hidden lg:table-cell text-xs whitespace-nowrap">
                    {fmtDateTime(p.created_at)}
                    <span className="block text-gray-400">{fmtAgo(p.created_at)}</span>
                  </Td>
                  <Td>
                    <StatusBadge value={p.status} />
                    {p.reviewed_by_name && <span className="block text-[11px] text-gray-400">by {p.reviewed_by_name}</span>}
                    {p.review_note && <span className="block text-[11px] text-gray-400 max-w-[180px] truncate" title={p.review_note}>{p.review_note}</span>}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {p.status === "pending" ? (
                      <div className="inline-flex gap-1.5">
                        <BtnPrimary className="px-2.5 py-1.5 text-xs" disabled={approve.isPending} onClick={() => approve.mutate(p.id)}>
                          <Check className="w-3.5 h-3.5" /> Approve
                        </BtnPrimary>
                        <IconBtn icon={X} title="Reject" tone="red" onClick={() => setRejecting(p)} />
                      </div>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableCard>
        </div>
      )}

      <RecordPaymentDialog open={recordOpen} onClose={() => setRecordOpen(false)} />
      <RejectDialog payment={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
};

export default PaymentsPage;
