import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Ban, CalendarPlus, Check, KeyRound, PlayCircle, Save } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { daysAgo, fDate, fDateTime, money, num0 } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, KV, PageHeader, SectionHeader, Tag } from '@/ui/kit';
import { Chips, passwordError, PasswordInput, Textarea, TextInput } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { SubTag } from './AdminShops';

export default function AdminShop() {
  const { id } = useParams();
  const q = useGet(`/admin/shops/${id}`);
  return <Async q={q}>{(d) => <View d={d} id={id} />}</Async>;
}

function View({ d, id }) {
  const confirm = useConfirm();
  const [extend, setExtend] = useState(false);
  const [pw, setPw] = useState(null);
  const [note, setNote] = useState(d.shop.admin_note || '');
  useEffect(() => {
    setNote(d.shop.admin_note || '');
  }, [d.shop.admin_note]);
  const status = useAct((b) => api.post(`/admin/shops/${id}/status`, b), { onSuccess: () => toast(t('saved')), onError: (e) => toast(e.message, 'error') });
  const saveNote = useAct((b) => api.post(`/admin/shops/${id}/note`, b), { onSuccess: () => toast(t('saved')) });
  const s = d.subscription;
  const suspended = d.shop.status === 'suspended';

  return (
    <div>
      <PageHeader
        back="/admin/shops"
        title={d.shop.name}
        sub={`${d.shop.owner_name} · ${d.shop.phone}`}
        actions={
          <>
            <Button variant="accent" icon={CalendarPlus} onClick={() => setExtend(true)}>
              {t('admin_extend')}
            </Button>
            <Button
              variant={suspended ? 'good' : 'danger-outline'}
              icon={suspended ? PlayCircle : Ban}
              loading={status.isPending}
              onClick={async () => {
                if (await confirm({ title: suspended ? t('admin_reactivate_q') : t('admin_suspend_q'), message: suspended ? t('admin_reactivate_msg') : t('admin_suspend_msg'), danger: !suspended, okLabel: suspended ? t('admin_reactivate') : t('admin_suspend') }))
                  status.mutate({ status: suspended ? 'active' : 'suspended', note: '' });
              }}
            >
              {suspended ? t('admin_reactivate') : t('admin_suspend')}
            </Button>
          </>
        }
      />
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold">{t('subscription')}</div>
            <SubTag s={s} />
          </div>
          <div className="mt-2">
            <KV label={t('current_plan')} value={s.plan_name} />
            <KV label={s.status === 'active' ? t('valid_till') : t('ended_on')} value={s.expires_at ? fDate(s.expires_at) : '-'} />
            <KV label={t('joined')} value={fDate(d.shop.created_at)} />
            <KV label={t('last_seen')} value={d.shop.last_active_at ? daysAgo(d.shop.last_active_at) : '-'} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-bold">{t('admin_usage')}</div>
          <div className="mt-2">
            <KV label={t('customers')} value={num0(d.counts.customers)} />
            <KV label={t('sales')} value={num0(d.counts.sales)} />
            <KV label={t('purchases')} value={num0(d.counts.purchases)} />
            <KV label={t('total')} value={money(d.counts.sales_total)} />
          </div>
        </Card>
        <Card className="p-4 space-y-2">
          <div className="font-bold">{t('admin_note')}</div>
          <Textarea value={note} onChange={setNote} rows={3} placeholder={t('admin_note_hint')} />
          <Button size="sm" variant="outline" icon={Save} loading={saveNote.isPending} onClick={() => saveNote.mutate({ note })}>
            {t('save')}
          </Button>
        </Card>
      </div>

      <SectionHeader title={t('users')} />
      <Card className="overflow-hidden divide-rows">
        {d.users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{u.name}</div>
              <div className="text-[12px] text-muted">
                {[u.phone, u.email].filter(Boolean).join(' · ')} · {t('last_login')} {u.last_login_at ? daysAgo(u.last_login_at) : '-'}
              </div>
            </div>
            <Tag tone={u.active ? 'navy' : 'gray'}>{t(`role_${u.role}`)}</Tag>
            <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setPw(u)}>
              {t('admin_reset_pw')}
            </Button>
          </div>
        ))}
      </Card>

      <div className="grid lg:grid-cols-2 gap-x-4">
        <div>
          <SectionHeader title={t('admin_payments')} />
          <Card className="overflow-hidden divide-rows">
            {d.requests.length === 0 ? (
              <div className="px-4 py-6 text-center text-muted text-[13px]">{t('admin_no_requests')}</div>
            ) : (
              d.requests.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {r.plan} · {t('months_n', { n: r.months })} · {money(r.amount)}
                    </div>
                    <div className="text-[12px] text-muted">
                      {fDateTime(r.created_at)} · {t(`pm_${r.method}`)} {r.txn_ref}
                    </div>
                  </div>
                  <Tag tone={r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : 'amber'}>{t(`req_${r.status}`)}</Tag>
                </div>
              ))
            )}
          </Card>
        </div>
        <div>
          <SectionHeader title={t('history')} />
          <Card className="overflow-hidden divide-rows">
            {d.events.map((e) => (
              <div key={e.id} className="px-4 py-2.5">
                <div className="font-semibold text-[13.5px]">{t(`ev_${e.action}`)}</div>
                <div className="text-[12px] text-muted">
                  {fDateTime(e.created_at)}
                  {e.by_name ? ` · ${e.by_name}` : ''}
                  {e.detail ? ` · ${e.detail}` : ''}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <ExtendDialog open={extend} onClose={() => setExtend(false)} id={id} current={s.plan} />
      <ResetPassword user={pw} onClose={() => setPw(null)} />
    </div>
  );
}

function ExtendDialog({ open, onClose, id, current }) {
  const [plan, setPlan] = useState(current === 'trial' ? 'basic' : current);
  const [months, setMonths] = useState(1);
  const [note, setNote] = useState('');
  const save = useAct((b) => api.post(`/admin/shops/${id}/extend`, b), {
    onSuccess: () => {
      toast(t('saved'));
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('admin_extend')}
      icon={CalendarPlus}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button icon={Check} loading={save.isPending} onClick={() => save.mutate({ plan, months, note })}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <div className="label">{t('current_plan')}</div>
          <Chips value={plan} onChange={setPlan} options={[{ value: 'trial', label: t('free_trial') }, { value: 'basic', label: 'Basic' }, { value: 'pro', label: 'Pro' }]} />
        </div>
        <div>
          <div className="label">{plan === 'trial' ? t('admin_extend_trial') : t('months')}</div>
          <Chips value={months} onChange={setMonths} options={[1, 3, 6, 12].map((m) => ({ value: m, label: plan === 'trial' ? `${m * 30}d` : t('months_n', { n: m }) }))} />
        </div>
        <TextInput label={t('note')} value={note} onChange={setNote} maxLength={200} placeholder={t('admin_extend_note')} />
        <p className="text-[12px] text-muted">{t('admin_extend_help')}</p>
      </div>
    </Modal>
  );
}

function ResetPassword({ user, onClose }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const save = useAct((b) => api.post(`/admin/users/${user.id}/password`, b), {
    onSuccess: () => {
      toast(t('password_changed'));
      setPw('');
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      size="sm"
      title={`${t('admin_reset_pw')} · ${user?.name ?? ''}`}
      icon={KeyRound}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            icon={Check}
            loading={save.isPending}
            onClick={() => {
              const e = passwordError(pw);
              setErr(e);
              if (!e) save.mutate({ password: pw });
            }}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <PasswordInput label={t('new_password')} value={pw} onChange={setPw} error={err} autoComplete="new-password" />
      <p className="text-[12px] text-muted mt-2">{t('admin_reset_pw_help')}</p>
    </Modal>
  );
}
