import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeDollarSign, Check, X } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { fDateTime, money } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, Empty, PageHeader, Tag } from '@/ui/kit';
import { Chips, TextInput } from '@/ui/form';
import { Modal, toast } from '@/ui/overlay';

const TONE = { pending: 'amber', approved: 'green', rejected: 'red' };

export default function AdminPayments() {
  const [status, setStatus] = useState('pending');
  return (
    <div>
      <PageHeader title={t('admin_payments')} sub={t('admin_payments_sub')} />
      <Chips
        className="mb-3"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'pending', label: t('req_pending') },
          { value: 'approved', label: t('req_approved') },
          { value: 'rejected', label: t('req_rejected') },
          { value: 'all', label: t('all') },
        ]}
      />
      <RequestsList status={status} />
    </div>
  );
}

export function RequestsList({ status, compact }) {
  const q = useGet('/admin/requests', { status });
  const navigate = useNavigate();
  const [reject, setReject] = useState(null);
  const approve = useAct((id) => api.post(`/admin/requests/${id}/approve`, { note: '' }), { onSuccess: () => toast(t('req_approved_toast')), onError: (e) => toast(e.message, 'error') });
  return (
    <Async q={q}>
      {(rows) => (
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <Empty icon={BadgeDollarSign} title={t('admin_no_requests')} className={compact ? 'py-6' : ''} />
          ) : (
            <div className="divide-rows">
              {rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-[200px] flex-1">
                    <button type="button" onClick={() => navigate(`/admin/shops/${r.tenant_id}`)} className="font-bold text-primary hover:underline text-left">
                      {r.shop_name}
                    </button>
                    <div className="text-[12.5px] text-muted">
                      {r.plan} · {t('months_n', { n: r.months })} · <b className="text-ink">{money(r.amount)}</b> · {t(`pm_${r.method}`)} <span className="font-mono">{r.txn_ref}</span>
                    </div>
                    <div className="text-[12px] text-muted">
                      {fDateTime(r.created_at)}
                      {r.sent_by ? ` · ${r.sent_by}` : ''} · {r.shop_phone}
                      {r.review_note ? ` · ${r.review_note}` : ''}
                    </div>
                  </div>
                  {r.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="good" icon={Check} loading={approve.isPending && approve.variables === r.id} onClick={() => approve.mutate(r.id)}>
                        {t('approve')}
                      </Button>
                      <Button size="sm" variant="danger-outline" icon={X} onClick={() => setReject(r)}>
                        {t('reject')}
                      </Button>
                    </div>
                  ) : (
                    <Tag tone={TONE[r.status]}>{t(`req_${r.status}`)}</Tag>
                  )}
                </div>
              ))}
            </div>
          )}
          <RejectDialog req={reject} onClose={() => setReject(null)} />
        </Card>
      )}
    </Async>
  );
}

function RejectDialog({ req, onClose }) {
  const [note, setNote] = useState('');
  const save = useAct((b) => api.post(`/admin/requests/${req.id}/reject`, b), {
    onSuccess: () => {
      toast(t('req_rejected'));
      setNote('');
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Modal
      open={!!req}
      onClose={onClose}
      size="sm"
      title={`${t('reject')} · ${req?.shop_name ?? ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="danger" icon={X} loading={save.isPending} onClick={() => save.mutate({ note })}>
            {t('reject')}
          </Button>
        </>
      }
    >
      <TextInput label={t('reject_reason')} value={note} onChange={setNote} maxLength={200} autoFocus placeholder={t('reject_reason_hint')} />
    </Modal>
  );
}
