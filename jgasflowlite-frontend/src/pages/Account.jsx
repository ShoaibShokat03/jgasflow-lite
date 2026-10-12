import { useEffect, useState } from 'react';
import { Check, KeyRound, Laptop, LogOut, Smartphone, UserRound } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { daysAgo } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, IconBox, PageHeader, SectionHeader, Tag } from '@/ui/kit';
import { emailError, passwordError, PasswordInput, personNameError, TextInput } from '@/ui/form';
import { toast, useConfirm } from '@/ui/overlay';

/** Name, email, password and signed-in devices for the logged-in person. */
export function AccountPanel() {
  const auth = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errs, setErrs] = useState({});
  useEffect(() => {
    setName(auth.user?.name || '');
    setEmail(auth.user?.email || '');
  }, [auth.user]);
  const save = useAct((b) => api.put('/auth/me', b), {
    onSuccess: () => {
      toast(t('saved'));
      auth.refresh();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <>
      <SectionHeader title={t('my_account')} />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card className="p-4 space-y-3.5">
          <div className="flex items-center gap-3">
            <IconBox icon={UserRound} color="#020033" size={40} />
            <div className="min-w-0">
              <div className="font-bold truncate">{auth.user?.name}</div>
              <div className="text-[12.5px] text-muted truncate">
                {auth.user?.phone || auth.user?.email} · {auth.isSuper ? t('super_admin') : t(`role_${auth.role}`)}
              </div>
            </div>
          </div>
          <TextInput label={t('name')} value={name} onChange={setName} filter="person" maxLength={50} error={errs.name} />
          <TextInput label={t('email_optional')} value={email} onChange={setEmail} error={errs.email} type="email" />
          <Button
            icon={Check}
            loading={save.isPending}
            onClick={() => {
              const es = { name: personNameError(name), email: emailError(email) };
              setErrs(es);
              if (!Object.values(es).some(Boolean)) save.mutate({ name, email });
            }}
          >
            {t('save')}
          </Button>
        </Card>
        <ChangePassword />
      </div>
      <Sessions />
    </>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [errs, setErrs] = useState({});
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = useAct((b) => api.post('/auth/password', b), {
    onSuccess: () => {
      toast(t('password_changed'));
      setF({ current: '', next: '', again: '' });
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Card className="p-4 space-y-3.5">
      <div className="flex items-center gap-2 font-bold">
        <KeyRound className="size-[18px]" /> {t('change_password')}
      </div>
      <PasswordInput label={t('current_password')} value={f.current} onChange={set('current')} error={errs.current} autoComplete="current-password" />
      <PasswordInput label={t('new_password')} value={f.next} onChange={set('next')} error={errs.next} autoComplete="new-password" />
      <PasswordInput label={t('password_again')} value={f.again} onChange={set('again')} error={errs.again} autoComplete="new-password" />
      <Button
        icon={KeyRound}
        loading={save.isPending}
        onClick={() => {
          const es = { current: f.current ? null : t('required'), next: passwordError(f.next), again: f.again !== f.next ? t('password_mismatch') : null };
          setErrs(es);
          if (!Object.values(es).some(Boolean)) save.mutate({ current: f.current, next: f.next });
        }}
      >
        {t('change_password')}
      </Button>
      <p className="text-[12px] text-muted">{t('password_change_note')}</p>
    </Card>
  );
}

function Sessions() {
  const q = useGet('/auth/sessions');
  const confirm = useConfirm();
  const revoke = useAct((id) => api.delete(`/auth/sessions/${id}`), { onSuccess: () => toast(t('signed_out_device')) });
  return (
    <>
      <SectionHeader title={t('signed_in_devices')} />
      <Async q={q}>
        {(rows) => (
          <Card className="overflow-hidden divide-rows">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <IconBox icon={s.client === 'mobile' ? Smartphone : Laptop} color="#020033" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{s.client === 'mobile' ? s.device || t('phone_app') : browserName(s.device)}</div>
                  <div className="text-[12px] text-muted truncate">
                    {t('last_seen')} {daysAgo(s.last_seen_at)}
                    {s.ip ? ` · ${s.ip}` : ''}
                  </div>
                </div>
                {s.current ? (
                  <Tag tone="green">{t('this_device')}</Tag>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={LogOut}
                    onClick={async () => {
                      if (await confirm({ title: t('sign_out_device_q'), message: t('sign_out_device_msg'), okLabel: t('logout') })) revoke.mutate(s.id);
                    }}
                  >
                    {t('logout')}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
      </Async>
    </>
  );
}

function browserName(ua = '') {
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} on ${os}` : b;
}

export default function Account() {
  return (
    <div>
      <PageHeader title={t('my_account')} />
      <AccountPanel />
    </div>
  );
}
