// src/components/saas/pages/PlansPage.jsx
// Plans shops can buy: price per month, user limit, features shown on the website and in the app.
import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Pencil, Trash2, Users, Check, X } from "lucide-react";
import { platformApi } from "../../../api/saasApi";
import { errMsg } from "../../../api/saasClient";
import { useToast } from "../../common/Toast";
import { PageHeader, EmptyState, Modal, Field, inputCls, BtnPrimary, BtnGhost, ToggleSwitch } from "../common";
import { Loading, ErrorBox, PKR, num, IconBtn, ModeBadge } from "../kit";
import { ConfirmDialog } from "../dialogs";

const blank = { key: "", mode: "online", name: "", price: "", lifetime_price: "", users: 3, features: [], is_active: true, sort: 10 };

const PlanDialog = ({ plan, onClose }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = plan === "new";
  const [f, setF] = useState(blank);
  const [feature, setFeature] = useState("");
  useEffect(() => {
    if (plan) setF(isNew ? blank : { ...plan, features: [...(plan.features || [])] });
    setFeature("");
  }, [plan, isNew]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name,
        price: Number(f.price || 0),
        lifetime_price: Number(f.lifetime_price || 0),
        users: Number(f.users || 1),
        features: f.features,
        is_active: !!f.is_active,
        mode: f.mode === "offline" ? "offline" : "online",
        sort: Number(f.sort || 0),
      };
      return isNew ? platformApi.createPlan({ ...body, key: f.key }) : platformApi.updatePlan(plan.key, body);
    },
    onSuccess: () => {
      toast.success(isNew ? "Plan added" : "Plan saved");
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const addFeature = () => {
    const v = feature.trim();
    if (!v || f.features.length >= 12) return;
    setF({ ...f, features: [...f.features, v] });
    setFeature("");
  };
  const trial = !isNew && plan?.key === "trial";

  return (
    <Modal
      open={!!plan}
      onClose={onClose}
      title={isNew ? "New plan" : `Edit ${plan?.name || "plan"}`}
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary disabled={save.isPending || !f.name || (isNew && !f.key)} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Save plan"}
          </BtnPrimary>
        </>
      }
    >
      <div className="space-y-3">
        {!trial && (
          <Field label="Plan type" required>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["online", "Online", "Web app and phones, synced"],
                ["offline", "Offline", "Phone app on one phone, no internet needed"],
              ].map(([v, t, d]) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setF({ ...f, mode: v, users: v === "offline" ? 1 : f.users })}
                  className={`text-left rounded-lg border px-3 py-2 ${f.mode === v ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40"}`}
                >
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white">{t}</span>
                  <span className="block text-[11px] text-gray-500">{d}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required>
            <input className={inputCls} maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Pro" />
          </Field>
          {isNew ? (
            <Field label="Key" required hint="Small letters, numbers and _. Cannot change later.">
              <input className={inputCls} maxLength={20} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="pro_plus" />
            </Field>
          ) : (
            <Field label="Key">
              <input className={`${inputCls} opacity-60`} value={f.key} disabled />
            </Field>
          )}
          <Field label="Price per month (Rs)" required hint={trial ? "The trial is always free" : undefined}>
            <input type="number" min="0" className={inputCls} value={trial ? 0 : f.price} disabled={trial} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
          <Field label="Lifetime price (Rs)" hint={trial ? "The trial has no lifetime option" : "One payment, never expires. Empty or 0: not sold for lifetime"}>
            <input type="number" min="0" className={inputCls} value={trial ? 0 : f.lifetime_price || ""} disabled={trial} placeholder="0" onChange={(e) => setF({ ...f, lifetime_price: e.target.value })} />
          </Field>
          <Field label="Users allowed" required>
            <input type="number" min="1" max="500" className={inputCls} value={f.users} onChange={(e) => setF({ ...f, users: e.target.value })} />
          </Field>
          <Field label="Order" hint="Lower shows first">
            <input type="number" min="0" className={inputCls} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} />
          </Field>
          <Field label="Offered">
            <div className="flex items-center gap-2 h-[38px]">
              <ToggleSwitch checked={!!f.is_active} disabled={trial} onChange={(v) => setF({ ...f, is_active: v })} />
              <span className="text-sm text-gray-600 dark:text-gray-300">{f.is_active ? "Shops can choose it" : "Hidden"}</span>
            </div>
          </Field>
        </div>
        <Field label="Features" hint="Shown on the website and the Subscription screen. Up to 12.">
          <div className="space-y-1.5">
            {f.features.map((x, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 px-3 py-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">{x}</span>
                <IconBtn icon={X} title="Remove" tone="red" className="w-7 h-7" onClick={() => setF({ ...f, features: f.features.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <div className="flex gap-2">
              <input className={inputCls} maxLength={120} value={feature} onChange={(e) => setFeature(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFeature(); } }} placeholder="Udhaar and cylinder tracking" />
              <BtnGhost type="button" onClick={addFeature} disabled={!feature.trim()}>
                <Plus className="w-4 h-4" /> Add
              </BtnGhost>
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  );
};

const PlansPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: plans, isLoading, error, refetch } = useQuery({ queryKey: ["plans"], queryFn: platformApi.plans });
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const toggle = useMutation({
    mutationFn: (p) => platformApi.updatePlan(p.key, { name: p.name, price: p.price, lifetime_price: p.lifetime_price || 0, users: p.users, features: p.features, sort: p.sort, mode: p.mode === "offline" ? "offline" : "online", is_active: !p.is_active }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (p) => platformApi.deletePlan(p.key),
    onSuccess: (r) => {
      toast.success(r.hidden ? "Shops use this plan, so it is hidden instead of deleted" : "Plan deleted");
      qc.invalidateQueries();
      setRemoving(null);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Plans" subtitle="Prices and limits shops see when they subscribe">
        <BtnPrimary onClick={() => setEditing("new")}>
          <Plus className="w-4 h-4" /> New plan
        </BtnPrimary>
      </PageHeader>

      {error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : isLoading ? (
        <Loading />
      ) : plans.length === 0 ? (
        <EmptyState icon={Package} title="No plans" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div key={p.key} className={`rounded-xl border bg-white dark:bg-gray-800 p-5 flex flex-col ${p.is_active ? "border-gray-200 dark:border-gray-700" : "border-dashed border-gray-300 dark:border-gray-600 opacity-75"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-gray-400 flex items-center gap-2">
                    {p.key} {p.mode === "any" ? <span className="font-sans text-[11px] text-gray-500">Offline and Online</span> : <ModeBadge mode={p.mode} />}
                  </p>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{p.name}</h3>
                </div>
                <ToggleSwitch checked={!!p.is_active} disabled={p.key === "trial" || toggle.isPending} title={p.is_active ? "Offered: click to hide" : "Hidden: click to offer"} onChange={() => toggle.mutate(p)} />
              </div>
              <p className="mt-2">
                <span className="text-2xl font-extrabold text-navy-900 dark:text-white">{p.price ? PKR(p.price) : "Free"}</span>
                {p.price > 0 && <span className="text-sm text-gray-500"> a month</span>}
              </p>
              {p.lifetime_price > 0 && <p className="text-sm font-semibold text-primary-600 dark:text-primary-400">or {PKR(p.lifetime_price)} once for lifetime</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />Up to {num(p.users)} user{p.users === 1 ? "" : "s"}</span>
                <span className="inline-flex items-center gap-1"><Package className="w-3.5 h-3.5" />{num(p.shops)} shop{p.shops === 1 ? "" : "s"} on it</span>
              </div>
              <ul className="mt-3 space-y-1.5 flex-1">
                {(p.features || []).map((x, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> <span>{x}</span>
                  </li>
                ))}
                {(!p.features || p.features.length === 0) && <li className="text-xs text-gray-400">No features listed</li>}
              </ul>
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-1">
                <BtnGhost className="px-3 py-1.5" onClick={() => setEditing(p)}>
                  <Pencil className="w-4 h-4" /> Edit
                </BtnGhost>
                {p.key !== "trial" && <IconBtn icon={Trash2} title="Delete plan" tone="red" className="w-9 h-9" onClick={() => setRemoving(p)} />}
              </div>
            </div>
          ))}
        </div>
      )}

      <PlanDialog plan={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        title={`Delete ${removing?.name || "plan"}?`}
        message={removing?.shops ? "Shops are on this plan, so it will be hidden from new subscriptions instead. Their plan keeps working." : "Nobody uses this plan. It will be deleted."}
        confirmLabel={removing?.shops ? "Hide plan" : "Delete plan"}
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
};

export default PlansPage;
