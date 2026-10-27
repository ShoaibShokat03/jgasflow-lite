import { useEffect, useState } from 'react';
import { BadgeCheck, Check, KeyRound, Laptop, LogOut, Mail, Pencil, Smartphone, Trash2, UserRound } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { daysAgo } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, IconBox, PageHeader, SectionHeader, Tag } from '@/ui/kit';
import { emailError, passwordError, PasswordInput, personNameError, TextInput } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { EmailCodeField } from '@/ui/EmailCode';

/** Name, email, password and signed-in devices for the logged-in person. */
export function AccountPanel() {
  const auth = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errs, setErrs] = useState({});
  const [changing, setChanging] = useState(false);
  // Shop users change their email only with a code; console admins edit it directly.
  const direct = auth.isSuper;
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
          {direct ? (
            <TextInput label={t('email_optional')} value={email} onChange={setEmail} error={errs.email} type="email" />
          ) : (
            <div>
              <div className="label">{t('email')}</div>
              <div className="flex items-center gap-2.5 rounded-[var(--radius-ctl)] border border-line bg-bg px-3 min-h-10 py-1.5">
                <Mail className="size-4 text-muted shrink-0" />
                <span className="flex-1 min-w-0 truncate font-semibold">{auth.user?.email || <span className="text-muted font-normal">{t('no_email_yet')}</span>}</span>
                {auth.user?.email && (
                  <Tag tone={auth.user?.email_verified ? 'green' : 'gray'}>
                    {auth.user?.email_verified ? (
                      <span className="inline-flex items-center gap-1">
                        <BadgeCheck className="size-3.5" /> {t('email_verified')}
                      </span>
                    ) : (
                      t('email_not_verified')
                    )}
                  </Tag>
                )}
                <Button size="sm" variant="outline" icon={Pencil} onClick={() => setChanging(true)}>
                  {auth.user?.email ? t('change_email') : t('add_email')}
                </Button>
              </div>
            </div>
          )}
          <Button
            icon={Check}
            loading={save.isPending}
            onClick={() => {
              const es = { name: personNameError(name), email: direct ? emailError(email) : null };
              setErrs(es);
              if (!Object.values(es).some(Boolean)) save.mutate(direct ? { name, email } : { name });
            }}
          >
            {t('save')}
          </Button>
        </Card>
        <ChangePassword />
      </div>
      <Sessions />
      {!auth.user?.is_super && <DeleteAccount />}
      <ChangeEmail open={changing} onClose={() => setChanging(false)} onDone={() => auth.refresh()} />
    </>
  );
}

/** Delete my account. An owner deletes the whole shop and all its records. */
export function DeleteAccount() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [word, setWord] = useState('');
  const owner = auth.isOwner;
  const del = useAct(() => api.post('/auth/delete-account', { password: pw, confirm: word.trim().toUpperCase() }), {
    onSuccess: async () => {
      toast(t('account_deleted'));
      setOpen(false);
      await auth.signOut();
      window.location.href = '/';
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <>
      <SectionHeader title={t('delete_account')} />
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1 text-[13px] text-muted">{owner ? t('delete_account_owner') : t('delete_account_staff')}</div>
        <Button variant="danger-outline" icon={Trash2} onClick={() => (setPw(''), setWord(''), setOpen(true))}>
          {t('delete_account')}
        </Button>
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('delete_account')}
        icon={Trash2}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant="danger" icon={Trash2} loading={del.isPending} disabled={!pw || word.trim().toUpperCase() !== 'DELETE'} onClick={() => del.mutate()}>
              {t('delete_forever')}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <p className="text-[13.5px] text-bad font-semibold">{owner ? t('delete_account_owner') : t('delete_account_staff')}</p>
          <p className="text-[13px] text-muted">{t('delete_account_export_first')}</p>
          <PasswordInput label={t('password')} value={pw} onChange={setPw} autoComplete="current-password" />
          <TextInput label={t('type_delete')} value={word} onChange={setWord} placeholder="DELETE" maxLength={10} />
        </div>
      </Modal>
    </>
  );
}

/** New email: a code goes to the new address; the email changes once the code is entered. */
function ChangeEmail({ open, onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [errs, setErrs] = useState({});
  useEffect(() => {
    if (open) {
      setEmail('');
      setCode('');
      setErrs({});
    }
  }, [open]);
  const save = useAct((b) => api.post('/auth/email-change', b), {
    onSuccess: () => {
      toast(t('email_changed'));
      onDone?.();
      onClose();
    },
    onError: (e) => (String(e.code || '').startsWith('CODE_') ? setErrs({ code: e.message }) : toast(e.message, 'error')),
  });
  const submit = () => {
    const es = { email: !email.trim() ? t('email_required') : emailError(email), code: code.length !== 6 ? t('code_needed') : null };
    setErrs(es);
    if (!Object.values(es).some(Boolean)) save.mutate({ email: email.trim(), code });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('change_email')}
      sub={t('change_email_sub')}
      icon={Mail}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button icon={Check} loading={save.isPending} onClick={submit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <TextInput reserve label={t('new_email')} value={email} onChange={setEmail} error={errs.email} type="email" autoComplete="email" placeholder="name@example.com" autoFocus />
        <EmailCodeField email={email} purpose="change" value={code} onChange={setCode} error={errs.code} onEmailError={(m) => setErrs((s) => ({ ...s, email: m }))} />
      </div>
    </Modal>
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
