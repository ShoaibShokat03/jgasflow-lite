import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, LifeBuoy } from 'lucide-react';
import { api, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { Button, Loading } from '@/ui/kit';
import { emailError, passwordError, PasswordInput, TextInput } from '@/ui/form';
import { toast } from '@/ui/overlay';
import { EmailCodeField } from '@/ui/EmailCode';
import { AuthLayout } from './AuthLayout';

/** Forgot password: a code sent to the account's email sets a new password. */
export default function ForgotPassword() {
  const auth = useAuth();
  const navigate = useNavigate();
  const cfg = useGet('/public/config');
  const [f, setF] = useState({ email: '', code: '', password: '', password2: '' });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  if (auth.status === 'user') return <Navigate to={auth.isSuper ? '/admin' : '/app'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const es = {
      email: !f.email.trim() ? t('email_required') : emailError(f.email),
      code: f.code.length !== 6 ? t('code_needed') : null,
      password: passwordError(f.password),
      password2: f.password2 !== f.password ? t('password_mismatch') : null,
    };
    setErrs(es);
    if (Object.values(es).some(Boolean)) return setErr(t('fix_errors'));
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/reset-password', { email: f.email.trim(), code: f.code, password: f.password });
      toast(t('password_reset_done'));
      navigate('/login', { replace: true });
    } catch (e2) {
      if (String(e2.code || '').startsWith('CODE_')) {
        setErrs((s) => ({ ...s, code: e2.message }));
        setErr('');
      } else setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <>
      {t('remembered_password')}{' '}
      <Link to="/login" className="font-bold text-primary hover:underline">
        {t('login')}
      </Link>
    </>
  );

  if (cfg.isLoading)
    return (
      <AuthLayout title={t('forgot_title')} sub={t('forgot_sub')} footer={footer}>
        <Loading className="py-10" />
      </AuthLayout>
    );

  // Email is not set up on the server: the old way (owner or support).
  if (!cfg.data?.email_reset)
    return (
      <AuthLayout title={t('forgot_title')} sub={t('forgot_password_help')} footer={footer}>
        <Button full size="lg" variant="outline" icon={LifeBuoy} to="/contact">
          {t('contact_support')}
        </Button>
      </AuthLayout>
    );

  return (
    <AuthLayout title={t('forgot_title')} sub={t('forgot_sub')} footer={footer}>
      <form onSubmit={submit} className="space-y-1.5" noValidate>
        <TextInput reserve label={t('email')} value={f.email} onChange={set('email')} error={errs.email} type="email" autoComplete="email" placeholder="name@example.com" autoFocus />
        <EmailCodeField email={f.email} purpose="reset" value={f.code} onChange={set('code')} error={errs.code} onEmailError={(m) => setErrs((s) => ({ ...s, email: m }))} />
        <PasswordInput reserve label={t('new_password')} value={f.password} onChange={set('password')} error={errs.password} autoComplete="new-password" />
        <PasswordInput reserve label={t('password_again')} value={f.password2} onChange={set('password2')} error={errs.password2} autoComplete="new-password" />
        {err && <div className="text-[13px] font-medium text-bad bg-[#fdecea] rounded-[var(--radius-ctl)] px-3 py-2 mb-2">{err}</div>}
        <Button type="submit" full size="lg" icon={KeyRound} loading={busy}>
          {t('set_new_password')}
        </Button>
        <p className="text-[12px] text-muted text-center pt-1">{t('forgot_no_email')}</p>
      </form>
    </AuthLayout>
  );
}
