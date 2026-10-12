import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { api, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { Button } from '@/ui/kit';
import { businessNameError, emailError, passwordError, PasswordInput, personNameError, phoneError, TextInput } from '@/ui/form';
import { toast } from '@/ui/overlay';
import { AuthLayout } from './AuthLayout';

export default function Signup() {
  const auth = useAuth();
  const navigate = useNavigate();
  const plans = useGet('/billing/plans');
  const [f, setF] = useState({ shop_name: '', owner_name: '', phone: '', email: '', password: '', password2: '' });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  if (auth.status === 'user') return <Navigate to={auth.isSuper ? '/admin' : '/app'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const es = {
      shop_name: businessNameError(f.shop_name),
      owner_name: personNameError(f.owner_name),
      phone: phoneError(f.phone),
      email: emailError(f.email),
      password: passwordError(f.password),
      password2: f.password2 !== f.password ? t('password_mismatch') : null,
    };
    setErrs(es);
    if (Object.values(es).some(Boolean)) return setErr(t('fix_errors'));
    setBusy(true);
    setErr('');
    try {
      const res = await api.post('/auth/signup', { shop_name: f.shop_name, owner_name: f.owner_name, phone: f.phone, email: f.email, password: f.password, client: 'web' });
      auth.signIn(res);
      toast(t('welcome_trial', { n: res.subscription.days_left }));
      navigate('/app', { replace: true });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t('create_account')}
      sub={t('signup_sub', { n: plans.data?.trial_days ?? 14 })}
      footer={
        <>
          {t('have_account')}{' '}
          <Link to="/login" className="font-bold text-primary hover:underline">
            {t('login')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <TextInput label={t('shop_name')} value={f.shop_name} onChange={set('shop_name')} filter="business" maxLength={50} error={errs.shop_name} placeholder="Al-Noor Gas Agency" autoFocus />
        <TextInput label={t('owner_name')} value={f.owner_name} onChange={set('owner_name')} filter="person" maxLength={50} error={errs.owner_name} />
        <div className="grid sm:grid-cols-2 gap-3.5">
          <TextInput label={t('phone')} value={f.phone} onChange={set('phone')} filter="phone" error={errs.phone} placeholder="03xx-xxxxxxx" autoComplete="tel" hint={t('phone_login_hint')} />
          <TextInput label={t('email_optional')} value={f.email} onChange={set('email')} error={errs.email} type="email" autoComplete="email" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3.5">
          <PasswordInput label={t('password')} value={f.password} onChange={set('password')} error={errs.password} autoComplete="new-password" />
          <PasswordInput label={t('password_again')} value={f.password2} onChange={set('password2')} error={errs.password2} autoComplete="new-password" />
        </div>
        {err && <div className="text-[13px] font-medium text-bad bg-[#fdecea] rounded-[var(--radius-ctl)] px-3 py-2">{err}</div>}
        <Button type="submit" full size="lg" variant="accent" icon={Rocket} loading={busy}>
          {t('start_free')}
        </Button>
        <p className="text-[12px] text-muted text-center">{t('signup_note')}</p>
      </form>
    </AuthLayout>
  );
}
