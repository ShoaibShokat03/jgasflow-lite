// src/components/saas/pages/SupportPage.jsx
// Platform support contacts — the email, phone, WhatsApp and address clinics
// use to reach us. One settings row, edited here, served to every clinic by
// the public GET /api/support.
//
// Super admins edit; other platform roles read. The backend enforces that too
// (PATCH is @SaasRoles(SUPER_ADMIN)) — this only decides what to render.
import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LifeBuoy, Mail, Phone, MapPin, Globe, Clock, Save, Loader2, ExternalLink,
} from "lucide-react";
import { supportApi } from "../../../api/saasApi";
import { useToast } from "../../common/Toast";
import { PageHeader, Field, inputCls, BtnPrimary, fmtDateTime } from "../common";
import { getAdmin, can } from "../../../utils/saasAuth";

/** wa.me wants digits only — no +, spaces, dashes or brackets. */
const waLink = (n) => {
  const digits = String(n || "").replace(/[^0-9]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
};

const BLANK = { email: "", phone: "", whatsapp: "", address: "", website: "", hours: "" };

const SupportPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  // Role gate first (the PATCH is super-only), then the granted permission.
  const canEdit = getAdmin()?.role === "super_admin" && can("support.edit");

  const q = useQuery({ queryKey: ["saas-support"], queryFn: supportApi.get });
  const [form, setForm] = useState(BLANK);

  // Seed the form once the row arrives. Nulls become "" so the inputs stay
  // controlled — React warns and the field goes read-only otherwise.
  useEffect(() => {
    if (!q.data) return;
    setForm({
      email: q.data.email ?? "",
      phone: q.data.phone ?? "",
      whatsapp: q.data.whatsapp ?? "",
      address: q.data.address ?? "",
      website: q.data.website ?? "",
      hours: q.data.hours ?? "",
    });
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => supportApi.update(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saas-support"] });
      toast.success("Support details saved");
    },
    onError: (e) => {
      const m = e.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || "Save failed");
    },
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const dirty = q.data
    ? Object.keys(BLANK).some((k) => (q.data[k] ?? "") !== form[k])
    : false;

  const wa = waLink(form.whatsapp);

  return (
    <div>
      <PageHeader
        title="Support"
        subtitle="Shown to every clinic as the way to reach you"
      >
        {canEdit && (
          <BtnPrimary onClick={() => saveM.mutate()} disabled={!dirty || saveM.isPending}>
            {saveM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </BtnPrimary>
        )}
      </PageHeader>

      {q.isLoading ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="block h-9 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* ── Editor ── */}
          <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Support email">
                <input
                  type="email"
                  className={inputCls}
                  value={form.email}
                  onChange={set("email")}
                  disabled={!canEdit}
                  placeholder="support@jdent.pk"
                />
              </Field>
              <Field label="Call">
                <input
                  className={inputCls}
                  value={form.phone}
                  onChange={set("phone")}
                  disabled={!canEdit}
                  placeholder="+92 300 1234567"
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  className={inputCls}
                  value={form.whatsapp}
                  onChange={set("whatsapp")}
                  disabled={!canEdit}
                  placeholder="+92 300 1234567"
                />
              </Field>
              <Field label="Support hours">
                <input
                  className={inputCls}
                  value={form.hours}
                  onChange={set("hours")}
                  disabled={!canEdit}
                  placeholder="Mon–Sat, 9am–6pm"
                />
              </Field>
              <Field label="Website">
                <input
                  className={inputCls}
                  value={form.website}
                  onChange={set("website")}
                  disabled={!canEdit}
                  placeholder="jantrah.com"
                />
              </Field>
            </div>

            <Field label="Address">
              <textarea
                rows={3}
                className={`${inputCls} resize-none`}
                value={form.address}
                onChange={set("address")}
                disabled={!canEdit}
                placeholder="Office 12, 2nd Floor, …"
              />
            </Field>

            {!canEdit && (
              <p className="text-[12px] text-gray-400">
                Only a super admin can change these.
              </p>
            )}
            {q.data?.updated_at && (
              <p className="text-[11px] text-gray-400">
                Last updated {fmtDateTime(q.data.updated_at)}
              </p>
            )}
          </div>

          {/* ── What the clinic sees ── */}
          {/* The whole point of this screen is the card clinics get, so it is
              rendered here from the same values rather than described. */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center">
                <LifeBuoy className="w-4 h-4" />
              </span>
              <p className="text-[13px] font-bold text-gray-800 dark:text-gray-100">Clinic preview</p>
            </div>

            <div className="p-4 space-y-3">
              <Row icon={Mail} label="Email" value={form.email}
                   href={form.email ? `mailto:${form.email}` : null} />
              <Row icon={Phone} label="Call" value={form.phone}
                   href={form.phone ? `tel:${form.phone.replace(/\s/g, "")}` : null} />
              <Row icon={WaGlyph} label="WhatsApp" value={form.whatsapp} href={wa} />
              <Row icon={Clock} label="Hours" value={form.hours} />
              <Row icon={Globe} label="Website" value={form.website}
                   href={form.website ? (/^https?:/i.test(form.website) ? form.website : `https://${form.website}`) : null} />
              <Row icon={MapPin} label="Address" value={form.address} />

              {!Object.values(form).some(Boolean) && (
                <p className="text-[12px] text-gray-400">
                  Nothing configured yet — clinics see no support details.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** WhatsApp's glyph isn't in lucide; this matches the clinic app's icon. */
const WaGlyph = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.41a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23z" />
  </svg>
);

const Row = ({ icon: Icon, label, value, href }) => (
  <div className="flex items-start gap-2.5">
    <span className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-400 flex items-center justify-center shrink-0">
      <Icon className="w-3.5 h-3.5" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[10.5px] uppercase tracking-wide text-gray-400">{label}</p>
      {value ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[13px] font-medium text-primary-600 dark:text-primary-300 hover:underline break-words inline-flex items-center gap-1"
          >
            {value}
            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
          </a>
        ) : (
          <p className="text-[13px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">{value}</p>
        )
      ) : (
        <p className="text-[13px] text-gray-300 dark:text-gray-600">—</p>
      )}
    </div>
  </div>
);

export default SupportPage;
