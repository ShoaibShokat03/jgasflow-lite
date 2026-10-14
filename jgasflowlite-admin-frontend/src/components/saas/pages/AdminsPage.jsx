// src/components/saas/pages/AdminsPage.jsx
// Console logins. Super admins see everything; an admin sees only the screens ticked here.
import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Pencil, UserX, Eye, EyeOff } from "lucide-react";
import { platformApi } from "../../../api/saasApi";
import { errMsg } from "../../../api/saasClient";
import { getAdmin } from "../../../utils/saasAuth";
import { GRANTABLE } from "../../../constants/saasModules";
import { useToast } from "../../common/Toast";
import { fmtAgo, PageHeader, Modal, Field, inputCls, BtnPrimary, BtnGhost, ToggleSwitch, StatusBadge, Th, Td, Tr } from "../common";
import { Loading, ErrorBox, TableCard, IconBtn } from "../kit";
import { ConfirmDialog } from "../dialogs";

const blank = { name: "", email: "", phone: "", role: "admin", modules: ["overview", "shops"], password: "", active: true };

const AdminDialog = ({ admin, onClose }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = admin === "new";
  const [f, setF] = useState(blank);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (admin) setF(isNew ? blank : { ...admin, phone: admin.phone || "", modules: admin.modules || GRANTABLE.map((g) => g.key), password: "" });
  }, [admin, isNew]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name, email: f.email, phone: f.phone, role: f.role, modules: f.role === "admin" ? f.modules : null, password: f.password, active: !!f.active };
      return isNew ? platformApi.createAdmin(body) : platformApi.updateAdmin(admin.id, body);
    },
    onSuccess: () => {
      toast.success(isNew ? "Admin added" : "Admin saved");
      qc.invalidateQueries({ queryKey: ["admins"] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const toggleModule = (k) => setF({ ...f, modules: f.modules.includes(k) ? f.modules.filter((m) => m !== k) : [...f.modules, k] });

  return (
    <Modal
      open={!!admin}
      onClose={onClose}
      title={isNew ? "New admin" : `Edit ${admin?.name || "admin"}`}
      size="lg"
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary disabled={save.isPending || !f.name || !f.email || (isNew && f.password.length < 6)} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Save admin"}
          </BtnPrimary>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" required>
            <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Email" required hint="Used to sign in">
            <input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label={isNew ? "Password" : "New password"} required={isNew} hint={isNew ? "At least 6 characters" : "Leave empty to keep the current one"}>
            <div className="relative">
              <input type={show ? "text" : "password"} autoComplete="new-password" className={`${inputCls} pr-10`} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              <button type="button" onClick={() => setShow((s) => !s)} title={show ? "Hide password" : "Show password"} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
        </div>

        <Field label="Access">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              ["super_admin", "Super admin", "Everything, including admins"],
              ["admin", "Admin", "Only the screens ticked below"],
            ].map(([v, t, d]) => (
              <button
                type="button"
                key={v}
                onClick={() => setF({ ...f, role: v })}
                className={`text-left rounded-lg border px-3 py-2 ${f.role === v ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40"}`}
              >
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">{t}</span>
                <span className="block text-[11px] text-gray-500">{d}</span>
              </button>
            ))}
          </div>
        </Field>

        {f.role === "admin" && (
          <Field label="Screens this admin can open">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {GRANTABLE.map((g) => (
                <label key={g.key} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <input type="checkbox" className="accent-primary-600 w-4 h-4" checked={f.modules.includes(g.key)} onChange={() => toggleModule(g.key)} />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{g.label}</span>
                </label>
              ))}
            </div>
          </Field>
        )}

        <div className="flex items-center gap-2">
          <ToggleSwitch checked={!!f.active} onChange={(v) => setF({ ...f, active: v })} />
          <span className="text-sm text-gray-600 dark:text-gray-300">{f.active ? "Can sign in" : "Blocked"}</span>
        </div>
      </div>
    </Modal>
  );
};

const AdminsPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const me = getAdmin();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admins"], queryFn: platformApi.admins });
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const remove = useMutation({
    mutationFn: (a) => platformApi.removeAdmin(a.id),
    onSuccess: () => {
      toast.success("Admin blocked and signed out");
      qc.invalidateQueries({ queryKey: ["admins"] });
      setRemoving(null);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const labels = Object.fromEntries(GRANTABLE.map((g) => [g.key, g.label]));

  return (
    <div className="space-y-4">
      <PageHeader title="Admins" subtitle="Who can sign in to this console">
        <BtnPrimary onClick={() => setEditing("new")}>
          <Plus className="w-4 h-4" /> New admin
        </BtnPrimary>
      </PageHeader>

      {error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : isLoading ? (
        <Loading />
      ) : (
        <TableCard>
          <thead>
            <tr>
              <Th>Admin</Th>
              <Th>Access</Th>
              <Th className="hidden md:table-cell">Last seen</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <Tr key={a.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-navy-900 text-white text-xs font-bold flex items-center justify-center">{(a.name || "A")[0].toUpperCase()}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {a.name} {a.id === me?.id && <span className="text-[11px] text-gray-400">(you)</span>}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">{a.email}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge value={a.role} />
                    {!a.active && <StatusBadge value="inactive" />}
                  </div>
                  {a.role === "admin" && (
                    <p className="mt-1 text-[11px] text-gray-500 max-w-[320px]">
                      {a.modules == null ? "All screens" : a.modules.length ? a.modules.map((m) => labels[m] || m).join(", ") : "No screens"}
                    </p>
                  )}
                </Td>
                <Td className="hidden md:table-cell text-xs whitespace-nowrap">{fmtAgo(a.last_seen_at) || "Never"}</Td>
                <Td className="text-right whitespace-nowrap">
                  <IconBtn icon={Pencil} title="Edit" tone="primary" onClick={() => setEditing(a)} />
                  {a.id !== me?.id && a.active && <IconBtn icon={UserX} title="Block this admin" tone="red" onClick={() => setRemoving(a)} />}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableCard>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex gap-3 text-sm text-gray-600 dark:text-gray-300">
        <ShieldCheck className="w-5 h-5 text-primary-600 shrink-0" />
        <p>Changing someone's password, role or blocking them signs them out of the console at once.</p>
      </div>

      <AdminDialog admin={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        title={`Block ${removing?.name || "admin"}?`}
        message="They are signed out now and cannot sign in again until you turn them back on."
        confirmLabel="Block admin"
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
};

export default AdminsPage;
