// src/components/saas/pages/AccountPage.jsx
// The signed-in admin: name, password and devices.
import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, KeyRound, Monitor, Smartphone, LogOut, Eye, EyeOff } from "lucide-react";
import { saasAuthApi } from "../../../api/saasApi";
import { errMsg } from "../../../api/saasClient";
import { storeAdmin } from "../../../utils/saasAuth";
import { useToast } from "../../common/Toast";
import { fmtAgo, PageHeader, Field, inputCls, BtnPrimary } from "../common";
import { Card, Loading, IconBtn } from "../kit";

const PasswordField = ({ label, value, onChange, autoComplete }) => {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <input type={show ? "text" : "password"} autoComplete={autoComplete} className={`${inputCls} pr-10`} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => setShow((s) => !s)} title={show ? "Hide password" : "Show password"} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </Field>
  );
};

const AccountPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me, isLoading } = useQuery({ queryKey: ["profile"], queryFn: saasAuthApi.profile });
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: saasAuthApi.sessions });
  const [p, setP] = useState({ name: "", email: "" });
  const [pw, setPw] = useState({ current: "", next: "", again: "" });

  useEffect(() => {
    const u = me?.user || me;
    if (u) setP({ name: u.name || "", email: u.email || "" });
  }, [me]);

  const saveProfile = useMutation({
    mutationFn: () => saasAuthApi.updateProfile(p),
    onSuccess: () => {
      storeAdmin({ name: p.name, email: p.email });
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const savePw = useMutation({
    mutationFn: () => saasAuthApi.changePassword(pw.current, pw.next),
    onSuccess: () => {
      toast.success("Password changed");
      setPw({ current: "", next: "", again: "" });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const revoke = useMutation({
    mutationFn: (id) => saasAuthApi.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    onError: (e) => toast.error(errMsg(e)),
  });

  if (isLoading) return <Loading />;
  const mismatch = pw.again && pw.next !== pw.again;

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="My account" />

      <Card title="Profile">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input className={inputCls} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputCls} value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <BtnPrimary disabled={saveProfile.isPending || !p.name} onClick={() => saveProfile.mutate()}>
            <Save className="w-4 h-4" /> Save profile
          </BtnPrimary>
        </div>
      </Card>

      <Card title="Password">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PasswordField label="Current password" autoComplete="current-password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} />
          <PasswordField label="New password" autoComplete="new-password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} />
          <PasswordField label="New password again" autoComplete="new-password" value={pw.again} onChange={(v) => setPw({ ...pw, again: v })} />
        </div>
        {mismatch && <p className="mt-2 text-xs text-red-600">The two new passwords are not the same.</p>}
        <div className="mt-3 flex justify-end">
          <BtnPrimary disabled={savePw.isPending || !pw.current || pw.next.length < 6 || mismatch} onClick={() => savePw.mutate()}>
            <KeyRound className="w-4 h-4" /> Change password
          </BtnPrimary>
        </div>
      </Card>

      <Card title="Signed in devices" bodyClass="pb-1">
        {sessions.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-400">No other devices.</p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700/60">
              <div className="flex items-center gap-2.5 min-w-0">
                {s.client === "mobile" ? <Smartphone className="w-4 h-4 text-gray-400 shrink-0" /> : <Monitor className="w-4 h-4 text-gray-400 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white truncate">
                    {s.device || "Browser"} {s.current && <span className="text-[11px] font-medium text-emerald-600">(this device)</span>}
                  </p>
                  <p className="text-[11px] text-gray-500">Last used {fmtAgo(s.last_seen_at) || "now"}</p>
                </div>
              </div>
              {!s.current && <IconBtn icon={LogOut} title="Sign this device out" tone="red" onClick={() => revoke.mutate(s.id)} />}
            </div>
          ))
        )}
      </Card>
    </div>
  );
};

export default AccountPage;
