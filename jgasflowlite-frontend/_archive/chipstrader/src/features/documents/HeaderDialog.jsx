import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { errorMessage, patch } from '@/lib/api';
import { personName } from '@/lib/format';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/core';
import { Modal, useToast } from '@/components/ui/overlay';
import { MasterSelect, UserPicker } from '@/components/ui/pickers';
import { DOCS } from './doc-types';
import { usePartner } from './TermsPanel';

export default function HeaderDialog({ kind, doc, onClose, onSaved }) {
  const cfg = DOCS[kind];
  const toast = useToast();
  const partner = usePartner(doc.partner?.id);
  const [f, setF] = useState({
    title: doc.title ?? '',
    doc_date: doc.doc_date,
    contact_id: doc.contact?.id ?? '',
    owner_id: doc.owner?.id ?? null,
    currency_id: doc.currency_id,
    priority: doc.priority,
    notes: doc.notes ?? '',
    internal_notes: doc.internal_notes ?? '',
    ...Object.fromEntries(cfg.extra.map((x) => [x.key, doc[x.key] ?? ''])),
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  const save = useMutation({
    mutationFn: () => patch(`${cfg.api}/${doc.id}`, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : k === 'contact_id' && v ? Number(v) : v]))),
    onSuccess: () => {
      onSaved();
      toast.success('Saved');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={Pencil}
      title={`Edit ${doc.doc_no}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3.5">
        <Field label="Title" span={2}>{(id) => <Input id={id} value={f.title} onChange={set('title')} maxLength={200} />}</Field>
        <Field label={cfg.dateLabel}>{(id) => <Input id={id} type="date" value={f.doc_date} onChange={set('doc_date')} />}</Field>
        {cfg.extra.map((x) => (
          <Field key={x.key} label={x.label}>{(id) => <Input id={id} type={x.type} value={f[x.key]} onChange={set(x.key)} />}</Field>
        ))}
        <Field label="Contact">
          {(id) => (
            <Select id={id} value={f.contact_id} onChange={set('contact_id')} placeholder="None">
              {(partner.data?.contacts ?? []).map((c) => <option key={c.id} value={c.id}>{personName(c)}{c.position ? ` · ${c.position}` : ''}</option>)}
            </Select>
          )}
        </Field>
        <Field label={cfg.side === 'customer' ? 'Sales rep' : 'Buyer'}>{(id) => <UserPicker id={id} value={f.owner_id} onChange={set('owner_id')} />}</Field>
        <Field label="Currency">{(id) => <MasterSelect id={id} list="currencies" value={f.currency_id} onChange={set('currency_id')} />}</Field>
        <Field label="Priority">
          {(id) => (
            <Select id={id} value={f.priority} onChange={set('priority')}>
              {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Notes (printed)" span={2} hint="Shown on the PDF.">{(id) => <Textarea id={id} value={f.notes} onChange={set('notes')} />}</Field>
        <Field label="Internal notes" span={2} hint="Never printed.">{(id) => <Textarea id={id} value={f.internal_notes} onChange={set('internal_notes')} />}</Field>
      </div>
    </Modal>
  );
}
