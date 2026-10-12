import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Upload, Trash2, Building, Palette, Landmark, FileText } from 'lucide-react';
import { ASSET_URL, errorMessage, put, post, upload } from '@/lib/api';
import { useProfile } from '@/lib/hooks';
import { nullify } from '@/lib/utils';
import { Button, Card, CardHeader, Field, Input, PageHeader, Spinner, Textarea } from '@/components/ui/core';
import { useToast } from '@/components/ui/overlay';
import { MasterPicker, MasterSelect } from '@/components/ui/pickers';
import { LogoMark } from '@/components/layout/Logo';

const KEYS = ['legal_name', 'short_name', 'legal_form', 'country_id', 'default_currency_id', 'default_payment_term_id', 'default_incoterm_id', 'vat_id', 'tax_number', 'registration_number', 'registration_court', 'managing_directors', 'website', 'general_email', 'general_phone', 'bank_name', 'iban', 'bic', 'pdf_brand_color', 'pdf_thead_bg', 'pdf_thead_text', 'pdf_rule_color', 'pdf_text_color', 'pdf_margin_x', 'pdf_margin_y', 'notes'];

/** The operating company: name, legal and bank details, logo and PDF styling. */
export default function CompanyProfilePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useProfile();
  const [f, setF] = useState(null);
  const fileRef = useRef(null);
  useEffect(() => {
    if (data) setF(Object.fromEntries(KEYS.map((k) => [k, data[k] ?? ''])));
  }, [data]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v ?? '' }));
  const refresh = () => qc.invalidateQueries({ queryKey: ['company-profile'] });

  const save = useMutation({
    mutationFn: () => put('/company-profile', { ...nullify(f), pdf_margin_x: Number(f.pdf_margin_x), pdf_margin_y: Number(f.pdf_margin_y) }),
    onSuccess: () => (refresh(), qc.invalidateQueries({ queryKey: ['dashboard'] }), toast.success('Company profile saved')),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const logo = useMutation({ mutationFn: (file) => upload('/company-profile/logo', file), onSuccess: () => (refresh(), toast.success('Logo updated')), onError: (e) => toast.error(errorMessage(e)) });
  const removeLogo = useMutation({ mutationFn: () => post('/company-profile/logo/remove'), onSuccess: refresh });

  if (isLoading || !f) return <div className="py-24 grid place-items-center"><Spinner /></div>;
  const color = (k, label) => (
    <Field label={label}>
      {(id) => (
        <div className="flex gap-2">
          <input type="color" value={f[k] || '#4f46e5'} onChange={set(k)} className="h-9 w-11 rounded-lg border border-line bg-surface p-1 cursor-pointer" aria-label={label} />
          <Input id={id} value={f[k]} onChange={set(k)} className="mono" />
        </div>
      )}
    </Field>
  );

  return (
    <div>
      <PageHeader title="Company profile" actions={<Button variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate()}>Save profile</Button>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader icon={Building} title="Company" />
            <div className="grid sm:grid-cols-3 gap-3.5 px-4 pb-4">
              <Field label="Legal name" span={2}>{(id) => <Input id={id} value={f.legal_name} onChange={set('legal_name')} />}</Field>
              <Field label="Short name" hint="Shown in the sidebar.">{(id) => <Input id={id} value={f.short_name} onChange={set('short_name')} />}</Field>
              <Field label="Legal form">{(id) => <Input id={id} value={f.legal_form} onChange={set('legal_form')} />}</Field>
              <Field label="Country">{(id) => <MasterPicker id={id} list="countries" value={f.country_id} onChange={set('country_id')} />}</Field>
              <Field label="Main currency" hint="All reporting converts to this.">{(id) => <MasterSelect id={id} list="currencies" value={f.default_currency_id} onChange={set('default_currency_id')} />}</Field>
              <Field label="Default payment terms">{(id) => <MasterSelect id={id} list="payment-terms" value={f.default_payment_term_id} onChange={set('default_payment_term_id')} />}</Field>
              <Field label="Default incoterm">{(id) => <MasterSelect id={id} list="incoterms" value={f.default_incoterm_id} onChange={set('default_incoterm_id')} />}</Field>
              <Field label="Website">{(id) => <Input id={id} value={f.website} onChange={set('website')} />}</Field>
              <Field label="Email">{(id) => <Input id={id} value={f.general_email} onChange={set('general_email')} />}</Field>
              <Field label="Phone">{(id) => <Input id={id} value={f.general_phone} onChange={set('general_phone')} />}</Field>
              <Field label="Managing directors">{(id) => <Input id={id} value={f.managing_directors} onChange={set('managing_directors')} />}</Field>
            </div>
          </Card>
          <Card>
            <CardHeader icon={Landmark} title="Legal & bank" />
            <div className="grid sm:grid-cols-3 gap-3.5 px-4 pb-4">
              <Field label="VAT id">{(id) => <Input id={id} value={f.vat_id} onChange={set('vat_id')} />}</Field>
              <Field label="Tax number">{(id) => <Input id={id} value={f.tax_number} onChange={set('tax_number')} />}</Field>
              <Field label="Registration no.">{(id) => <Input id={id} value={f.registration_number} onChange={set('registration_number')} />}</Field>
              <Field label="Registration court">{(id) => <Input id={id} value={f.registration_court} onChange={set('registration_court')} />}</Field>
              <Field label="Bank">{(id) => <Input id={id} value={f.bank_name} onChange={set('bank_name')} />}</Field>
              <Field label="IBAN">{(id) => <Input id={id} className="mono" value={f.iban} onChange={set('iban')} />}</Field>
              <Field label="BIC">{(id) => <Input id={id} className="mono" value={f.bic} onChange={set('bic')} />}</Field>
              <Field label="Notes" span={2}>{(id) => <Textarea id={id} rows={2} value={f.notes} onChange={set('notes')} />}</Field>
            </div>
          </Card>
          <Card>
            <CardHeader icon={Palette} title="PDF styling" />
            <div className="grid sm:grid-cols-3 gap-3.5 px-4 pb-4">
              {color('pdf_brand_color', 'Brand colour')}
              {color('pdf_thead_bg', 'Table header')}
              {color('pdf_thead_text', 'Table header text')}
              {color('pdf_rule_color', 'Rule line')}
              {color('pdf_text_color', 'Body text')}
              <div />
              <Field label="Side margin (mm)">{(id) => <Input id={id} type="number" min="0" max="40" value={f.pdf_margin_x} onChange={set('pdf_margin_x')} />}</Field>
              <Field label="Top/bottom margin (mm)">{(id) => <Input id={id} type="number" min="0" max="40" value={f.pdf_margin_y} onChange={set('pdf_margin_y')} />}</Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Logo" />
            <div className="px-4 pb-4">
              <div className="grid place-items-center h-28 rounded-xl border border-dashed border-line-strong bg-surface-2 mb-3">
                {data.logo_path ? <img src={`${ASSET_URL}/${data.logo_path}`} alt="Logo" className="max-h-20 max-w-[85%] object-contain" /> : <div className="flex items-center gap-2 text-muted"><LogoMark className="size-9" /><span className="text-sm">Using the ChipsTrader mark</span></div>}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files[0] && logo.mutate(e.target.files[0], { onSettled: () => (e.target.value = '') })} />
              <div className="flex gap-2">
                <Button icon={Upload} loading={logo.isPending} onClick={() => fileRef.current?.click()} className="flex-1">Upload logo</Button>
                {data.logo_path && <Button icon={Trash2} onClick={() => removeLogo.mutate()} aria-label="Remove logo" />}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader icon={FileText} title="PDF preview" />
            <div className="px-4 pb-4">
              <div className="rounded-lg border border-line bg-white p-4 text-[11px] text-slate-700 shadow-sm aspect-[1/1.2]">
                <div className="flex justify-between items-start"><span className="text-[13px] font-semibold" style={{ color: f.pdf_brand_color }}>{f.short_name || f.legal_name}</span><span className="text-right">{f.legal_name}</span></div>
                <div className="my-2 h-px" style={{ background: f.pdf_rule_color }} />
                <p className="text-[11px] font-bold" style={{ color: f.pdf_brand_color }}>QUOTATION</p>
                <p className="mb-2">QUO-2026-0042</p>
                <div className="grid grid-cols-[1fr_auto_auto] text-[8px] font-semibold px-1.5 py-1" style={{ background: f.pdf_thead_bg, color: f.pdf_thead_text }}><span>Part</span><span className="px-2">Qty</span><span>Total</span></div>
                {['LM358DR', 'NE555P', 'STM32F103C8T6'].map((p, i) => <div key={p} className="grid grid-cols-[1fr_auto_auto] text-[8px] px-1.5 py-1 border-b border-slate-100" style={{ color: f.pdf_text_color }}><span>{p}</span><span className="px-2">{(i + 1) * 500}</span><span>{((i + 1) * 91.5).toFixed(2)}</span></div>)}
                <p className="text-right mt-2 font-semibold">Total 549.00</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
