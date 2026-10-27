// src/components/saas/pages/ShopDetailPage.jsx
// One shop: its plan, money, team, phones, payments and history, with every console action.
import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  LogIn,
  Pencil,
  Ban,
  RotateCcw,
  CalendarPlus,
  CalendarClock,
  Wallet,
  KeyRound,
  LogOut,
  Smartphone,
  Users,
  Receipt,
  UserRound,
  Phone,
  MapPin,
  Check,
  X,
  Save,
} from "lucide-react";
import { platformApi } from "../../../api/saasApi";
import { errMsg } from "../../../api/saasClient";
import { canModule } from "../../../utils/saasAuth";
import { useToast } from "../../common/Toast";
import { fmtAgo, fmtDate, fmtDateTime, Modal, Field, inputCls, BtnPrimary, BtnGhost, BtnDanger, StatusBadge, Th, Td, Tr } from "../common";
import { Card, Kpi, BarChart, Loading, ErrorBox, PKR, num, dayLabel, SubBadge, ActivityDot, METHOD_LABELS, eventLabel, eventDot, IconBtn, TableCard, ModeBadge } from "../kit";
import { RecordPaymentDialog, RejectDialog, ConfirmDialog, useActivePlans, usePlanName, amountFor, termLabel, LIFETIME } from "../dialogs";
import { Proofs } from "../attach";

const today = () => new Date().toISOString().slice(0, 10);

/** Extend by months, or set the end date exactly. */
const PlanDialog = ({ mode, shop, sub, onClose }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: plans = [] } = useActivePlans();
  const [f, setF] = useState({ plan: "", months: 1, until: "", note: "" });
  useEffect(() => {
    if (mode) {
      const keep = sub.plan !== "trial" ? sub.plan : plans.find((p) => p.key !== "trial")?.key || sub.plan;
      setF({ plan: mode === "extend" ? keep : sub.plan, months: 1, until: String(sub.expires_at || today()).slice(0, 10), note: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, plans.length]);

  const save = useMutation({
    mutationFn: () =>
      mode === "extend"
        ? platformApi.extend(shop.id, { plan: f.plan, months: Number(f.months), note: f.note })
        : platformApi.setExpiry(shop.id, { plan: f.plan, until: f.until, note: f.note }),
    onSuccess: () => {
      toast.success(mode === "extend" ? "Plan extended" : "End date saved");
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const choices = mode === "extend" ? plans : plans;
  const plan = plans.find((p) => p.key === f.plan);

  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={mode === "extend" ? "Extend plan" : "Set end date"}
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary disabled={!f.plan || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : mode === "extend" ? "Extend" : "Save date"}
          </BtnPrimary>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          {mode === "extend"
            ? Number(f.months) === LIFETIME
              ? "Lifetime access: the shop never expires, online or offline, until you change it. No payment is recorded: use Record payment when money was received."
              : `Adds whole months from today or from the current end date, whichever is later, so no paid days are lost.${sub.lifetime ? " This replaces the shop's lifetime access." : ""} No payment is recorded: use Record payment when money was received.`
            : `Sets the exact last day of the plan, for corrections and special deals.${sub.lifetime ? " This replaces the shop's lifetime access." : ""}`}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan" required>
            <select className={inputCls} value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>
              {choices.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {mode === "extend" ? (
            <Field label="Period" required hint={plan && plan.key !== "trial" ? `Worth ${PKR(amountFor(plan, Number(f.months)))}` : undefined}>
              <select className={inputCls} value={f.months} onChange={(e) => setF({ ...f, months: Number(e.target.value) })}>
                {[1, 2, 3, 6, 12, 24, ...(f.plan !== "trial" ? [LIFETIME] : [])].map((m) => (
                  <option key={m} value={m}>
                    {termLabel(m)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Last day" required>
              <input type="date" className={inputCls} value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} />
            </Field>
          )}
        </div>
        <Field label="Note" hint="Saved in the shop's history">
          <input className={inputCls} maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

const EditDialog = ({ open, shop, onClose }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({});
  useEffect(() => {
    if (open) setF({ name: shop.name, owner_name: shop.owner_name, phone: shop.phone, address: shop.address || "" });
  }, [open, shop]);
  const save = useMutation({
    mutationFn: () => platformApi.updateShop(shop.id, f),
    onSuccess: () => {
      toast.success("Shop details saved");
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit shop details"
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Save"}
          </BtnPrimary>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Shop name" required>
          <input className={inputCls} value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner name" required>
            <input className={inputCls} value={f.owner_name || ""} onChange={(e) => setF({ ...f, owner_name: e.target.value })} />
          </Field>
          <Field label="Phone" required>
            <input className={inputCls} value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Address">
          <input className={inputCls} value={f.address || ""} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <p className="text-[11px] text-gray-400">The shop sees the new details in the app and on its printed bills.</p>
      </div>
    </Modal>
  );
};

const PasswordDialog = ({ user, onClose }) => {
  const toast = useToast();
  const [pw, setPw] = useState("");
  useEffect(() => setPw(""), [user]);
  const save = useMutation({
    mutationFn: () => platformApi.resetPassword(user.id, pw),
    onSuccess: () => {
      toast.success(`New password set for ${user.name}. They are signed out of every device.`);
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Set a new password"
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary disabled={pw.length < 6 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Set password"}
          </BtnPrimary>
        </>
      }
    >
      {user && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            For <b>{user.name}</b> ({user.role}). Tell them the new password yourself: it is not sent anywhere.
          </p>
          <Field label="New password" required hint="At least 6 characters">
            <input type="text" autoComplete="off" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
};

const ShopDetailPage = () => {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["shop", id], queryFn: () => platformApi.shop(id) });
  const planName = usePlanName();

  const [planMode, setPlanMode] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [pwUser, setPwUser] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'suspend'|'reactivate'|'logout', user? }
  const [statusNote, setStatusNote] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (data) setNote(data.shop.admin_note || "");
  }, [data]);

  const done = (msg) => () => {
    toast.success(msg);
    qc.invalidateQueries();
    setConfirm(null);
  };
  const fail = (e) => toast.error(errMsg(e));

  const status = useMutation({
    mutationFn: (s) => platformApi.setStatus(id, { status: s, note: statusNote }),
    onSuccess: (_, s) => done(s === "suspended" ? "Shop suspended and every device signed out" : "Shop reactivated")(),
    onError: fail,
  });
  const release = useMutation({
    mutationFn: (deviceId) => platformApi.releaseDevice(deviceId),
    onSuccess: done("Phone released. It turns read-only the next time it checks in."),
    onError: fail,
  });
  const logoutUser = useMutation({
    mutationFn: (uid) => platformApi.logoutUser(uid),
    onSuccess: done("Signed out of every device"),
    onError: fail,
  });
  const approve = useMutation({ mutationFn: (pid) => platformApi.approve(pid), onSuccess: done("Payment approved and the plan is extended"), onError: fail });
  const saveNote = useMutation({ mutationFn: () => platformApi.setNote(id, note), onSuccess: done("Note saved"), onError: fail });
  const support = useMutation({
    mutationFn: () => platformApi.impersonate(id),
    onSuccess: (r) => {
      window.open(r.url, "_blank", "noopener");
      qc.invalidateQueries({ queryKey: ["shop", id] });
    },
    onError: fail,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const { shop, subscription: sub, users, requests, events, counts, series, phones, devices = [] } = data;
  const suspended = shop.status === "suspended";
  const canPay = canModule("payments");

  return (
    <div className="space-y-4">
      <Link to="/shops" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
        <ArrowLeft className="w-4 h-4" /> All shops
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-12 h-12 shrink-0 rounded-xl bg-navy-900 text-white text-lg font-bold flex items-center justify-center">
            {(shop.name || "?")[0].toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{shop.name}</h1>
              <SubBadge sub={sub} />
              <ModeBadge mode={shop.mode} />
              <ActivityDot value={shop.activity} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{shop.owner_name}</span>
              <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{shop.phone}</span>
              {shop.address && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{shop.address}</span>}
              <span>#{shop.id}, joined {fmtDate(shop.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <BtnPrimary onClick={() => support.mutate()} disabled={support.isPending || suspended} title={suspended ? "Reactivate the shop first" : "Opens the shop app as its owner in a new tab"}>
            <LogIn className="w-4 h-4" /> {support.isPending ? "Opening..." : "Support login"}
          </BtnPrimary>
          <BtnGhost onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4" /> Edit details
          </BtnGhost>
          {suspended ? (
            <BtnGhost onClick={() => { setStatusNote(""); setConfirm({ kind: "reactivate" }); }}>
              <RotateCcw className="w-4 h-4" /> Reactivate
            </BtnGhost>
          ) : (
            <BtnDanger onClick={() => { setStatusNote(""); setConfirm({ kind: "suspend" }); }}>
              <Ban className="w-4 h-4" /> Suspend
            </BtnDanger>
          )}
        </div>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Receipt} tone="emerald" label="Gas sales, all time" value={PKR(counts.sales_total)} hint={`${num(counts.sales)} bills, last ${fmtAgo(counts.last_sale_at) || "never"}`} />
        <Kpi icon={Wallet} tone="primary" label="Customer payments received" value={PKR(counts.payments_total)} hint={`${num(counts.purchases)} purchases recorded`} />
        <Kpi icon={Users} tone="navy" label="Customers and suppliers" value={`${num(counts.customers)} / ${num(counts.suppliers)}`} />
        <Kpi icon={Smartphone} tone="sky" label="Team and phones" value={`${users.filter((u) => u.active).length} / ${phones.length}`} hint={`Plan allows ${sub.users_limit} users`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Subscription */}
        <Card title="Subscription">
          <dl className="space-y-2 text-sm">
            {[
              ["Plan", sub.plan_name],
              ["Status", <SubBadge key="s" sub={sub} />],
              ["Ends", sub.lifetime ? "Never (lifetime)" : sub.expires_at ? fmtDate(sub.expires_at) : "-"],
              ["Days left", sub.lifetime ? "Lifetime" : sub.status === "active" ? num(sub.days_left) : "0"],
              ["Users allowed", num(sub.users_limit)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-medium text-gray-900 dark:text-white text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {sub.read_only && (
            <p className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              The shop can only view and export its data until the plan is renewed{suspended ? " and the shop is reactivated" : ""}.
            </p>
          )}
          <div className="mt-4 grid grid-cols-1 gap-2">
            {canPay && (
              <BtnPrimary onClick={() => setRecordOpen(true)}>
                <Wallet className="w-4 h-4" /> Record payment
              </BtnPrimary>
            )}
            <div className="grid grid-cols-2 gap-2">
              <BtnGhost onClick={() => setPlanMode("extend")}>
                <CalendarPlus className="w-4 h-4" /> Extend
              </BtnGhost>
              <BtnGhost onClick={() => setPlanMode("expiry")}>
                <CalendarClock className="w-4 h-4" /> Set date
              </BtnGhost>
            </div>
          </div>
        </Card>

        <Card title="Gas sales, last 30 days" subtitle="Bill totals per day" className="lg:col-span-2">
          <BarChart data={series.map((d) => ({ label: dayLabel(d.day), value: d.total, sub: `${d.bills} bills` }))} format={PKR} color="bg-emerald-500" height={170} empty="No sales in the last 30 days" />
        </Card>
      </div>

      {/* Team */}
      <Card title="Team" subtitle="Logins of this shop" bodyClass="">
        <TableCard bare>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th className="hidden md:table-cell">Login</Th>
              <Th className="hidden md:table-cell">Last seen</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <p className="font-medium text-gray-900 dark:text-white">{u.name}</p>
                  {!u.active && <span className="text-[11px] text-red-500">Removed</span>}
                </Td>
                <Td><StatusBadge value={u.role} /></Td>
                <Td className="hidden md:table-cell text-xs">{u.phone || u.email}</Td>
                <Td className="hidden md:table-cell text-xs whitespace-nowrap">
                  {fmtAgo(u.last_seen_at) || "Never"}
                  {u.devices > 0 && <span className="text-gray-400">, {u.devices} device{u.devices === 1 ? "" : "s"}</span>}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <IconBtn icon={KeyRound} title="Set a new password" tone="primary" onClick={() => setPwUser(u)} />
                  <IconBtn icon={LogOut} title="Sign out of every device" tone="red" disabled={!u.devices} onClick={() => setConfirm({ kind: "logout", user: u })} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableCard>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Registered phones"
          subtitle={shop.mode === "offline" ? "An Offline account works on one phone" : "Every phone that has used this account"}
          bodyClass="pb-1"
        >
          {devices.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-400">No phone has registered yet.</p>
          ) : (
            devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Smartphone className={`w-4 h-4 shrink-0 ${d.status === "active" ? "text-emerald-500" : "text-gray-300"}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white truncate">
                      {d.model || "Android phone"} {d.status !== "active" && <span className="text-[11px] text-gray-400">(released)</span>}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {d.user_name || "-"}, app {d.app_version || "?"}, ID {String(d.device_id).slice(0, 8)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">Seen {fmtAgo(d.last_seen) || "never"}</span>
                  {d.status === "active" && <IconBtn icon={Ban} title="Release this phone (lost, sold or replaced)" tone="red" disabled={release.isPending} onClick={() => release.mutate(d.id)} />}
                </div>
              </div>
            ))
          )}
        </Card>

        <Card title="Phones syncing" subtitle="Phones in online mode, signed in to this shop" bodyClass="pb-1">
          {phones.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-400">No phone is syncing with this shop.</p>
          ) : (
            phones.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Smartphone className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white truncate">{p.device || "Android phone"}</p>
                    <p className="text-[11px] text-gray-500 truncate">{p.user_name}</p>
                  </div>
                </div>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">Synced {fmtAgo(p.last_sync_at) || "never"}</span>
              </div>
            ))
          )}
        </Card>

        <Card title="Console note" subtitle="Only admins see this">
          <textarea rows={4} maxLength={2000} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called on 12 Oct, will pay by Friday" />
          <div className="mt-2 flex justify-end">
            <BtnPrimary disabled={saveNote.isPending || note === (shop.admin_note || "")} onClick={() => saveNote.mutate()}>
              <Save className="w-4 h-4" /> Save note
            </BtnPrimary>
          </div>
        </Card>
      </div>

      {/* Payments */}
      <Card title="Payments to JGasFlow" subtitle="What this shop sent for its plan" bodyClass="">
        {requests.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-400">No payments yet.</p>
        ) : (
          <TableCard bare>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Plan</Th>
                <Th className="text-right">Amount</Th>
                <Th className="hidden md:table-cell">Method</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <Tr key={r.id}>
                  <Td className="text-xs whitespace-nowrap">{fmtDateTime(r.created_at)}</Td>
                  <Td className="whitespace-nowrap">{planName(r.plan)}, {termLabel(r.months)}</Td>
                  <Td className="text-right font-semibold whitespace-nowrap">{PKR(r.amount)}</Td>
                  <Td className="hidden md:table-cell text-xs">
                    {METHOD_LABELS[r.method] || r.method}
                    {r.txn_ref && <span className="block text-gray-400">{r.txn_ref}</span>}
                    {r.proofs > 0 && (
                      <div className="mt-1.5">
                        <Proofs base={platformApi.proofUrl(r.id)} count={r.proofs} size={40} />
                      </div>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge value={r.status} />
                    {r.review_note && <span className="block text-[11px] text-gray-400 max-w-[200px] truncate" title={r.review_note}>{r.review_note}</span>}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {r.status === "pending" && canPay ? (
                      <>
                        <IconBtn icon={Check} title="Approve" tone="primary" onClick={() => approve.mutate(r.id)} disabled={approve.isPending} />
                        <IconBtn icon={X} title="Reject" tone="red" onClick={() => setRejecting({ ...r, shop_name: shop.name })} />
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-400">{r.reviewed_at ? fmtDate(r.reviewed_at) : ""}</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableCard>
        )}
      </Card>

      {/* History */}
      <Card title="History" subtitle="Plan, payment and account changes" bodyClass="px-4 pb-4">
        {events.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">Nothing yet.</p>
        ) : (
          <ol className="relative space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${eventDot(e.action)}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 dark:text-gray-100">
                    <span className="font-medium">{eventLabel(e.action)}</span>
                    {e.detail && <span className="text-gray-500">: {e.detail}</span>}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {fmtDateTime(e.created_at)}
                    {e.by_name ? `, by ${e.by_name}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <PlanDialog mode={planMode} shop={shop} sub={sub} onClose={() => setPlanMode(null)} />
      <EditDialog open={editOpen} shop={shop} onClose={() => setEditOpen(false)} />
      <RecordPaymentDialog open={recordOpen} shop={{ id: shop.id, name: shop.name }} onClose={() => setRecordOpen(false)} />
      <RejectDialog payment={rejecting} onClose={() => setRejecting(null)} />
      <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} />

      <ConfirmDialog
        open={confirm?.kind === "suspend" || confirm?.kind === "reactivate"}
        title={confirm?.kind === "suspend" ? "Suspend this shop?" : "Reactivate this shop?"}
        message={
          confirm?.kind === "suspend"
            ? "Everyone in the shop is signed out at once and can only view data until you reactivate it. Their data is kept."
            : "The shop can sign in and work again, as long as its plan has not ended."
        }
        confirmLabel={confirm?.kind === "suspend" ? "Suspend shop" : "Reactivate"}
        danger={confirm?.kind === "suspend"}
        busy={status.isPending}
        onConfirm={() => status.mutate(confirm.kind === "suspend" ? "suspended" : "active")}
        onClose={() => setConfirm(null)}
      >
        <div className="mt-3">
          <Field label="Note" hint="Saved in the shop's history">
            <input className={inputCls} maxLength={200} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "logout"}
        title="Sign out of every device?"
        message={confirm?.user ? `${confirm.user.name} is signed out on every phone and browser and must sign in again.` : ""}
        confirmLabel="Sign out"
        danger
        busy={logoutUser.isPending}
        onConfirm={() => logoutUser.mutate(confirm.user.id)}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
};

export default ShopDetailPage;
