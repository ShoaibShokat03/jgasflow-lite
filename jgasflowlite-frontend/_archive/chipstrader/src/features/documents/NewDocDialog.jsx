import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage, post } from '@/lib/api';
import { today } from '@/lib/format';
import { useMe } from '@/lib/hooks';
import { Button, Field, Input, Select } from '@/components/ui/core';
import { Modal, useToast } from '@/components/ui/overlay';
import { CompanyPicker, MasterSelect, UserPicker } from '@/components/ui/pickers';
import { DOCS, docPath } from './doc-types';

export default function NewDocDialog({ kind, onClose, defaults = {}, partnerLabel }) {
  const cfg = DOCS[kind];
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useMe();
  const [form, setForm] = useState({ partner_id: null, doc_date: today(), title: '', priority: 'normal', currency_id: null, owner_id: me?.id ?? null, source: '', ...defaults });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const create = useMutation({
    mutationFn: () => post(cfg.api, Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== null))),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [cfg.api] });
      toast.success(`${cfg.label} ${r.doc_no} created`);
      navigate(docPath(kind, r.id));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`New ${cfg.label.toLowerCase()}`}
      icon={cfg.icon}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} disabled={!form.partner_id} onClick={() => create.mutate()}>
            Create {cfg.label.toLowerCase()}
          </Button>
        </>
      }
    >
      <form
        className="grid sm:grid-cols-2 gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          form.partner_id && create.mutate();
        }}
      >
        <Field label={cfg.side === 'customer' ? 'Customer' : 'Supplier'} required span={2}>
          {(id) => <CompanyPicker id={id} autoFocus type={cfg.side} value={form.partner_id} onChange={set('partner_id')} selectedLabel={partnerLabel} />}
        </Field>
        <Field label="Title" span={2} hint="Optional, e.g. the customer's project or reference.">
          {(id) => <Input id={id} value={form.title} onChange={set('title')} maxLength={200} />}
        </Field>
        <Field label={cfg.dateLabel}>{(id) => <Input id={id} type="date" value={form.doc_date} onChange={set('doc_date')} />}</Field>
        {cfg.extra.map((x) => (
          <Field key={x.key} label={x.label}>
            {(id) => <Input id={id} type={x.type} value={form[x.key] ?? ''} onChange={set(x.key)} />}
          </Field>
        ))}
        <Field label={cfg.side === 'customer' ? 'Sales rep' : 'Buyer'}>{(id) => <UserPicker id={id} value={form.owner_id} onChange={set('owner_id')} />}</Field>
        <Field label="Currency" hint="Defaults from the partner.">{(id) => <MasterSelect id={id} list="currencies" value={form.currency_id} onChange={set('currency_id')} placeholder="Partner default" />}</Field>
        <Field label="Priority">
          {(id) => (
            <Select id={id} value={form.priority} onChange={set('priority')}>
              {['low', 'normal', 'high', 'urgent'].map((p) => (
                <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
              ))}
            </Select>
          )}
        </Field>
        {kind === 'requirement' && (
          <Field label="Source">
            {(id) => (
              <Select id={id} value={form.source} onChange={set('source')} placeholder="None">
                {['email', 'phone', 'portal', 'show', 'other'].map((s) => (
                  <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
