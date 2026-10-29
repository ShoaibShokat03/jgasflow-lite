import { useEffect, useState } from 'react';
import { Check, Crown, Pencil, ShieldCheck, ShoppingCart, UserMinus, UserPlus, UsersRound } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { teamColumns } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { daysAgo } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, cn, Initials, PageHeader, Tag } from '@/ui/kit';
import { emailError, passwordError, PasswordInput, personNameError, phoneError, Switch, TextInput } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';

const ROLE_TONE = { owner: 'orange', manager: 'blue', salesman: 'green' };

export default function Team() {
  const q = useGet('/team');
  const [form, setForm] = useState(null);
  const confirm = useConfirm();
  const remove = useAct((id) => api.delete(`/team/${id}`), { onSuccess: () => toast(t('staff_removed')), onError: (e) => toast(e.message, 'error') });
  return (
    <div>
      <PageHeader
        title={t('team')}
        sub={t('team_sub')}
        actions={
          <>
            <ExportMenu title={t('x_team')} columns={() => teamColumns(daysAgo)} rows={q.data?.users} />
            <Button data-shortcut="add" icon={UserPlus} onClick={() => setForm('new')}>
              {t('add_staff')}
            </Button>
          </>
        }
      />
      <Async q={q}>
        {({ users, limit }) => (
          <>
            <div className="text-[13px] text-muted mb-3">{t('users_of_limit', { n: users.filter((u) => u.active).length, max: limit })}</div>
            <Card className="overflow-hidden divide-rows">
              {users.map((u) => (
                <div key={u.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !u.active && 'opacity-60')}>
                  <Initials name={u.name} tone={ROLE_TONE[u.role]} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate flex items-center gap-2">
                      {u.name} {u.me && <span className="text-[11px] text-muted">({t('you')})</span>}
                    </div>
                    <div className="text-[12px] text-muted truncate">
                      {[u.phone, u.email].filter(Boolean).join(' · ')}
                      {u.last_seen_at ? ` · ${t('last_seen')} ${daysAgo(u.last_seen_at)}` : ''}
                    </div>
                  </div>
                  <Tag tone={u.active ? ROLE_TONE[u.role] : 'gray'}>{u.active ? t(`role_${u.role}`) : t('turned_off')}</Tag>
                  {u.role !== 'owner' && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setForm(u)} aria-label={t('edit')} />
                      {u.active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={UserMinus}
                          className="!text-bad"
                          aria-label={t('remove')}
                          onClick={async () => {
                            if (await confirm({ title: t('remove_staff_q', { name: u.name }), message: t('remove_staff_msg'), okLabel: t('remove'), danger: true })) remove.mutate(u.id);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </Card>
            <div className="grid md:grid-cols-3 gap-3 mt-5">
              <RoleCard icon={Crown} color="#F26B1D" title={t('role_owner')} text={t('role_owner_d')} />
              <RoleCard icon={ShieldCheck} color="#1565C0" title={t('role_manager')} text={t('role_manager_d')} />
              <RoleCard icon={ShoppingCart} color="#2E7D32" title={t('role_salesman')} text={t('role_salesman_d')} />
            </div>
          </>
        )}
      </Async>
      <StaffForm open={!!form} initial={form === 'new' ? null : form} onClose={() => setForm(null)} />
    </div>
  );
}

function RoleCard({ icon: Icon, color, title, text }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 font-bold" style={{ color }}>
        <Icon className="size-[18px]" /> {title}
      </div>
      <div className="text-[13px] text-muted mt-1">{text}</div>
    </Card>
  );
}

function StaffForm({ open, initial, onClose }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', role: 'salesman', password: '', active: true });
  const [errs, setErrs] = useState({});
  useEffect(() => {
    if (!open) return;
    setErrs({});
    setF(initial ? { name: initial.name, phone: initial.phone || '', email: initial.email || '', role: initial.role, password: '', active: initial.active } : { name: '', phone: '', email: '', role: 'salesman', password: '', active: true });
  }, [open, initial]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = useAct((b) => (initial ? api.put(`/team/${initial.id}`, b) : api.post('/team', b)), {
    onSuccess: () => {
      toast(t('saved'));
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const submit = () => {
    const es = {
      name: personNameError(f.name),
      phone: phoneError(f.phone, false) || (!f.phone && !f.email ? t('phone_or_email_needed') : null),
      email: emailError(f.email),
      password: initial && !f.password ? null : passwordError(f.password),
    };
    setErrs(es);
    if (Object.values(es).some(Boolean)) return;
    save.mutate({ ...f, password: f.password || undefined });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t('edit_staff') : t('add_staff')}
      icon={UsersRound}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button data-shortcut="save" icon={Check} loading={save.isPending} onClick={submit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <TextInput label={t('name')} value={f.name} onChange={set('name')} filter="person" maxLength={50} error={errs.name} autoFocus />
        <div className="grid sm:grid-cols-2 gap-3.5">
          <TextInput label={t('phone')} value={f.phone} onChange={set('phone')} filter="phone" error={errs.phone} placeholder="03xx-xxxxxxx" />
          <TextInput label={t('email_optional')} value={f.email} onChange={set('email')} error={errs.email} type="email" />
        </div>
        <div>
          <div className="label">{t('role')}</div>
          <div className="grid grid-cols-2 gap-2">
            {['manager', 'salesman'].map((r) => (
              <button key={r} type="button" onClick={() => set('role')(r)} className={cn('text-left rounded-[var(--radius-ctl)] border p-3 transition', f.role === r ? 'border-primary ring-1 ring-primary/30 bg-soft/50' : 'border-line hover:bg-soft/40')}>
                <div className="font-bold">{t(`role_${r}`)}</div>
                <div className="text-[12px] text-muted">{t(`role_${r}_d`)}</div>
              </button>
            ))}
          </div>
        </div>
        <PasswordInput label={initial ? t('new_password_optional') : t('password')} value={f.password} onChange={set('password')} error={errs.password} autoComplete="new-password" />
        {initial && <Switch checked={f.active} onChange={set('active')} label={t('can_login')} sub={t('can_login_sub')} />}
        <p className="text-[12px] text-muted">{t('staff_login_help')}</p>
      </div>
    </Modal>
  );
}
