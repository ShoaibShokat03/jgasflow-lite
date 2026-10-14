// src/components/saas/pages/SettingsPage.jsx
// Platform settings: support contact, payment accounts shops pay into, trial length, shop app address.
import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Wallet, Settings2, Save, Mail, Send, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { platformApi } from "../../../api/saasApi";
import { errMsg } from "../../../api/saasClient";
import { useToast } from "../../common/Toast";
import { PageHeader, Field, inputCls, BtnPrimary, BtnGhost, ToggleSwitch } from "../common";
import { Card, Loading, ErrorBox } from "../kit";

const GROUPS = [
  {
    title: "Support contact",
    subtitle: "Shown on the Help and support screens of the app and the website",
    icon: LifeBuoy,
    fields: [
      ["support_company", "Company name"],
      ["support_phone", "Phone", "+92 303 3203444"],
      ["support_whatsapp", "WhatsApp number", "923033203444", "Digits only, with country code"],
      ["support_email", "Email"],
      ["support_hours", "Working hours", "Monday to Saturday, 9 am to 9 pm"],
    ],
  },
  {
    title: "Bank account for plan payments",
    subtitle: "Shops pay for plans only by bank transfer to this account, then send a screenshot. Shown on the Subscription screen.",
    icon: Wallet,
    fields: [
      ["bank_name", "Bank", "Meezan Bank"],
      ["bank_title", "Account title", "Jantrah Tech"],
      ["bank_account", "Account number", "0123 0123456789", "Shops can copy it"],
      ["bank_iban", "IBAN", "PK36MEZN0001234567890123", "24 characters starting with PK"],
      ["bank_branch", "Branch", "Gulberg, Lahore", "Optional"],
    ],
  },
  {
    title: "Sign up",
    icon: Settings2,
    fields: [
      ["trial_days", "Free trial days", "14", "For new shops, 1 to 90 days"],
    ],
  },
];

/** Email (SMTP) keys saved with the rest of the settings. The password is write-only. */
const SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "smtp_from_email", "smtp_from_name", "signup_email_verify"];
const SECURITY = [
  ["starttls", "STARTTLS (port 587)"],
  ["ssl", "SSL / TLS (port 465)"],
  ["none", "None (port 25, not safe)"],
];

const SettingsPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["settings"], queryFn: platformApi.settings });
  const [f, setF] = useState({});
  useEffect(() => {
    if (data) setF(data);
  }, [data]);

  const dirty = data && Object.keys(f).some((k) => String(f[k] ?? "") !== String(data[k] ?? ""));
  const save = useMutation({
    mutationFn: () => {
      const body = {};
      [...GROUPS.flatMap((g) => g.fields).map(([k]) => k), ...SMTP_KEYS].forEach((k) => {
        if (String(f[k] ?? "") !== String(data[k] ?? "")) body[k] = k === "smtp_pass" ? String(f[k] ?? "") : String(f[k] ?? "").trim();
      });
      return platformApi.saveSettings(body);
    },
    onSuccess: (fresh) => {
      toast.success("Settings saved. Shops see them right away.");
      qc.setQueryData(["settings"], fresh);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Platform settings" subtitle="Details every shop sees">
        <BtnPrimary disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          <Save className="w-4 h-4" /> {save.isPending ? "Saving..." : "Save changes"}
        </BtnPrimary>
      </PageHeader>

      <SmtpCard f={f} setF={setF} data={data} dirty={dirty} />

      {GROUPS.map((g) => (
        <Card
          key={g.title}
          title={
            <span className="inline-flex items-center gap-2">
              <g.icon className="w-4 h-4 text-primary-600" /> {g.title}
            </span>
          }
          subtitle={g.subtitle}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {g.fields.map(([k, label, placeholder, hint, wide]) => (
              <div key={k} className={wide ? "md:col-span-2" : ""}>
                <Field label={label} hint={hint}>
                  <input className={inputCls} value={f[k] ?? ""} placeholder={placeholder} maxLength={300} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                </Field>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
};

/** Email server for sign-up codes and password reset, with a test send. */
const SmtpCard = ({ f, setF, data, dirty }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [to, setTo] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ready = !!(data.smtp_host && data.smtp_from_email);
  const test = useMutation({
    mutationFn: () => platformApi.testSmtp(to.trim()),
    onSuccess: () => toast.success(`Test email sent to ${to.trim()}. Check the inbox (and Spam).`),
    onError: (e) => toast.error(errMsg(e)),
  });
  const clear = useMutation({
    mutationFn: platformApi.clearSmtpPassword,
    onSuccess: (fresh) => {
      qc.setQueryData(["settings"], fresh);
      toast.success("Saved password removed.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const verifyOn = String(f.signup_email_verify ?? "1") !== "0";
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary-600" /> Email (SMTP)
        </span>
      }
      subtitle="Sends the sign-up code and the forgot password code. Gmail, Zoho, Hostinger or any mail server."
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[13px]">
        {ready ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 font-semibold border border-green-200">
            <CheckCircle2 className="w-4 h-4" /> Email is set up
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-semibold border border-amber-200">
            Not set up: sign-up works without a code, and Forgot password shows the support contact
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="SMTP server" hint="Like smtp.gmail.com or smtp.hostinger.com">
          <input className={inputCls} value={f.smtp_host ?? ""} placeholder="smtp.gmail.com" maxLength={160} onChange={set("smtp_host")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Port">
            <input className={inputCls} value={f.smtp_port ?? ""} placeholder="587" inputMode="numeric" maxLength={5} onChange={(e) => setF({ ...f, smtp_port: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="Security">
            <select
              className={inputCls}
              value={f.smtp_secure ?? "starttls"}
              onChange={(e) => {
                const v = e.target.value;
                const port = { starttls: "587", ssl: "465", none: "25" }[v];
                setF({ ...f, smtp_secure: v, smtp_port: ["587", "465", "25", ""].includes(String(f.smtp_port ?? "")) ? port : f.smtp_port });
              }}
            >
              {SECURITY.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Username" hint="Usually the full email address">
          <input className={inputCls} value={f.smtp_user ?? ""} autoComplete="off" maxLength={160} onChange={set("smtp_user")} />
        </Field>
        <Field label="Password" hint={data.smtp_pass_set ? "A password is saved. Leave empty to keep it." : "For Gmail use an App password, not your normal password."}>
          <div className="relative">
            <input
              className={`${inputCls} pr-10`}
              type={show ? "text" : "password"}
              value={f.smtp_pass ?? ""}
              autoComplete="new-password"
              placeholder={data.smtp_pass_set ? "Saved (hidden)" : ""}
              maxLength={200}
              onChange={set("smtp_pass")}
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-800" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {data.smtp_pass_set && (
            <button type="button" disabled={clear.isPending} onClick={() => clear.mutate()} className="mt-1 text-[12px] font-semibold text-red-600 hover:underline disabled:opacity-50">
              Remove saved password
            </button>
          )}
        </Field>
        <Field label="From email" hint="Most servers need this to be the same as the username">
          <input className={inputCls} value={f.smtp_from_email ?? ""} placeholder="no-reply@jgasflow.com" maxLength={160} onChange={set("smtp_from_email")} />
        </Field>
        <Field label="From name">
          <input className={inputCls} value={f.smtp_from_name ?? ""} placeholder="JGasFlow" maxLength={80} onChange={set("smtp_from_name")} />
        </Field>
        <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
          <div className="min-w-0">
            <div className="font-semibold text-[14px]">Confirm email on sign-up</div>
            <div className="text-[12.5px] text-gray-500">New shops on the website must enter a code sent to their email. Works once email is set up.</div>
          </div>
          <ToggleSwitch checked={verifyOn} onChange={(v) => setF({ ...f, signup_email_verify: v ? "1" : "0" })} title="Confirm email on sign-up" />
        </div>
        <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-start gap-2 rounded-xl border border-gray-200 p-3">
          <div className="flex-1 min-w-0">
            <Field label="Send a test email to" hint={dirty ? "Save changes first: the test uses the saved settings." : "Uses the saved settings."}>
              <input className={inputCls} value={to} placeholder="you@example.com" maxLength={160} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <BtnGhost className="whitespace-nowrap sm:mt-6" disabled={!ready || dirty || !to.trim() || test.isPending} onClick={() => test.mutate()}>
            <Send className="w-4 h-4" /> {test.isPending ? "Sending..." : "Send test"}
          </BtnGhost>
        </div>
      </div>
    </Card>
  );
};

export default SettingsPage;
