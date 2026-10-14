// src/components/saas/dialogs.jsx
// Dialogs shared by several console screens.
import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { platformApi } from "../../api/saasApi";
import { errMsg } from "../../api/saasClient";
import { useToast } from "../common/Toast";
import { Modal, Field, inputCls, BtnPrimary, BtnGhost, BtnDanger } from "./common";
import { PKR, METHOD_LABELS, RECORD_METHODS } from "./kit";

export const useActivePlans = () =>
  useQuery({ queryKey: ["active-plans"], queryFn: platformApi.activePlans, staleTime: 5 * 60_000 });

/** `planName("basic")` gives "Basic"; falls back to the key for hidden plans. */
export const usePlanName = () => {
  const { data: plans = [] } = useActivePlans();
  const names = Object.fromEntries(plans.map((p) => [p.key, p.name]));
  return (key) => names[key] || key;
};

const MONTHS = [1, 2, 3, 6, 12];

/** Amount for a plan and months: the plan's own price list when it has one. */
export const amountFor = (plan, months) => {
  if (!plan) return 0;
  const listed = plan.prices?.find((p) => p.months === months);
  return listed ? listed.amount : plan.price * months;
};

/** Search-as-you-type shop picker. */
export const ShopPicker = ({ value, onChange }) => {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ["shop-pick", debounced],
    queryFn: () => platformApi.shops({ q: debounced, limit: 8, sort: "name" }),
    enabled: !value,
  });
  if (value)
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2">
        <span className="text-sm text-gray-900 dark:text-white truncate">
          {value.name} <span className="text-gray-400">#{value.id}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap">
          Change
        </button>
      </div>
    );
  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Shop name, owner or phone" className={`${inputCls} pl-9`} />
      </div>
      <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
        {(data?.items || []).map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => onChange({ id: s.id, name: s.name })}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-t first:border-t-0 border-gray-100 dark:border-gray-700"
          >
            <span className="font-medium text-gray-900 dark:text-white">{s.name}</span>
            <span className="text-xs text-gray-500"> #{s.id}, {s.owner_name}, {s.subscription.plan_name}</span>
          </button>
        ))}
        {!isFetching && data?.items?.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">No shop found</p>}
      </div>
    </div>
  );
};

/** Money received outside the app: recorded and applied at once. */
export const RecordPaymentDialog = ({ open, onClose, shop: fixedShop }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: plans = [] } = useActivePlans();
  const paid = useMemo(() => plans.filter((p) => p.key !== "trial"), [plans]);
  const [shop, setShop] = useState(fixedShop || null);
  const [f, setF] = useState({ plan: "", months: 1, amount: "", method: "bank", txn_ref: "", note: "" });

  useEffect(() => {
    if (open) {
      setShop(fixedShop || null);
      setF({ plan: paid[0]?.key || "", months: 1, amount: "", method: "bank", txn_ref: "", note: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paid.length]);

  const plan = paid.find((p) => p.key === f.plan);
  const suggested = amountFor(plan, Number(f.months));

  const save = useMutation({
    mutationFn: () =>
      platformApi.recordPayment({
        shop_id: shop.id,
        plan: f.plan,
        months: Number(f.months),
        amount: f.amount === "" ? undefined : Number(f.amount),
        method: f.method,
        txn_ref: f.txn_ref,
        note: f.note,
      }),
    onSuccess: (r) => {
      toast.success(`Payment of ${PKR(r.amount)} recorded and the plan is extended`);
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a payment"
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary disabled={!shop || !f.plan || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Record and extend"}
          </BtnPrimary>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">For money received without a proof sent from the app, like a bank transfer confirmed by phone or cash at the office. The plan is extended at once.</p>
        {!fixedShop && (
          <Field label="Shop" required>
            <ShopPicker value={shop} onChange={setShop} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan" required>
            <select className={inputCls} value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>
              {paid.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} ({PKR(p.price)} a month)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Months" required>
            <select className={inputCls} value={f.months} onChange={(e) => setF({ ...f, months: Number(e.target.value) })}>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m} month{m === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount received (Rs)" hint={`Plan price: ${PKR(suggested)}`}>
            <input type="number" min="0" className={inputCls} placeholder={String(suggested)} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
          <Field label="Method" required>
            <select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              {RECORD_METHODS.map((k) => (
                <option key={k} value={k}>
                  {METHOD_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Transaction ID or receipt no.">
          <input className={inputCls} maxLength={80} value={f.txn_ref} onChange={(e) => setF({ ...f, txn_ref: e.target.value })} />
        </Field>
        <Field label="Note">
          <input className={inputCls} maxLength={255} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

/** Reject a pending payment with a reason the shop will see. */
export const RejectDialog = ({ payment, onClose }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [payment]);
  const save = useMutation({
    mutationFn: () => platformApi.reject(payment.id, note.trim()),
    onSuccess: () => {
      toast.success("Payment rejected");
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Modal
      open={!!payment}
      onClose={onClose}
      title="Reject payment"
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnDanger disabled={note.trim().length < 3 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Rejecting..." : "Reject payment"}
          </BtnDanger>
        </>
      }
    >
      {payment && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {payment.shop_name ? <b>{payment.shop_name}</b> : "This shop"} sent {PKR(payment.amount)} by {METHOD_LABELS[payment.method] || payment.method}
            {payment.txn_ref ? ` (${payment.txn_ref})` : ""}. The plan will not change.
          </p>
          <Field label="Reason for the shop" required hint="Shown to the shop owner, so they can send it again correctly.">
            <textarea rows={3} maxLength={200} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transaction ID not found in our JazzCash account" />
          </Field>
        </div>
      )}
    </Modal>
  );
};

/** Small yes / no confirmation. */
export const ConfirmDialog = ({ open, title, message, confirmLabel = "Confirm", danger = false, busy = false, onConfirm, onClose, children }) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    footer={
      <>
        <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        {danger ? (
          <BtnDanger disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </BtnDanger>
        ) : (
          <BtnPrimary disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </BtnPrimary>
        )}
      </>
    }
  >
    {message && <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
    {children}
  </Modal>
);
