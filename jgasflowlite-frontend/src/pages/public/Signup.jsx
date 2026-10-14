import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Cloud, CloudOff, Rocket } from 'lucide-react';
import { api, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { Button } from '@/ui/kit';
import { businessNameError, emailError, passwordError, PasswordInput, personNameError, phoneError, TextInput } from '@/ui/form';
import { toast } from '@/ui/overlay';
import { AuthLayout } from './AuthLayout';
import { EmailCodeField } from '@/ui/EmailCode';
import { cn } from '@/ui/kit';

export default function Signup() {
  const auth = useAuth();
  const navigate = useNavigate();
  const plans = useGet('/billing/plans');
  const cfg = useGet('/public/config');
  // Email confirmation with a code (on when email is set up in the console).
  const verify = !!cfg.data?.email_verify;
  const [f, setF] = useState({ shop_name: '', owner_name: '', phone: '', email: '', password: '', password2: '', mode: 'online', code: '' });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Set just before sign in, so the redirect below goes to the plan step.
  const created = useRef(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  if (auth.status === 'user') return <Navigate to={created.current ? '/app/welcome' : auth.isSuper ? '/admin' : '/app'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const es = {
      shop_name: businessNameError(f.shop_name),
      owner_name: personNameError(f.owner_name),
      phone: phoneError(f.phone),
      email: !f.email.trim() ? t('email_required') : emailError(f.email),
      code: verify && f.code.length !== 6 ? t('code_needed') : null,
      password: passwordError(f.password),
      password2: f.password2 !== f.password ? t('password_mismatch') : null,
    };
    setErrs(es);
    if (Object.values(es).some(Boolean)) return setErr(t('fix_errors'));
    setBusy(true);
    setErr('');
    try {
      const res = await api.post('/auth/signup', { shop_name: f.shop_name, owner_name: f.owner_name, phone: f.phone, email: f.email.trim(), password: f.password, mode: f.mode, client: 'web', ...(verify ? { email_code: f.code } : {}) });
      created.current = true;
      auth.signIn(res);
      toast(t('welcome_trial', { n: res.subscription.days_left }));
      // Confirm the plan first: the free trial is on, or pick a paid plan now.
      navigate('/app/welcome', { replace: true });
    } catch (e2) {
      // A code problem shows on the code box; anything else above the button.
      if (String(e2.code || '').startsWith('CODE_')) {
        setErrs((s) => ({ ...s, code: e2.message }));
        setErr('');
      } else setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      wide
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
      {/* Every field keeps one line for its message, so an error never moves the form. */}
      <form onSubmit={submit} className="space-y-1.5" noValidate>
        <div className="label">{t('how_use')}</div>
        <div className="grid sm:grid-cols-2 gap-2.5 pb-3">
          {[
            ['online', Cloud, 'mode_online_title', 'mode_online_sub'],
            ['offline', CloudOff, 'mode_offline_title', 'mode_offline_sub'],
          ].map(([m, Icon, title, sub]) => (
            <button
              key={m}
              type="button"
              onClick={() => setF((s) => ({ ...s, mode: m }))}
              className={cn('text-left rounded-[var(--radius-card)] border p-3 transition', f.mode === m ? 'border-primary ring-2 ring-primary/20 bg-soft/40' : 'border-line hover:border-[#cfd2e6]')}
            >
              <span className="flex items-center gap-2 font-bold text-[14px]">
                <Icon className={cn('size-4', f.mode === m ? 'text-primary' : 'text-muted')} /> {t(title)}
              </span>
              <span className="block text-[12px] text-muted mt-0.5">{t(sub)}</span>
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-x-3.5 gap-y-1.5">
          <TextInput reserve label={t('shop_name')} value={f.shop_name} onChange={set('shop_name')} filter="business" maxLength={50} error={errs.shop_name} placeholder="Al-Noor Gas Agency" autoComplete="organization" autoFocus />
          <TextInput reserve label={t('owner_name')} value={f.owner_name} onChange={set('owner_name')} filter="person" maxLength={50} error={errs.owner_name} autoComplete="name" />
        </div>
        <div className="grid sm:grid-cols-2 gap-x-3.5 gap-y-1.5">
          <TextInput reserve label={t('phone')} value={f.phone} onChange={set('phone')} filter="phone" error={errs.phone} placeholder="03xx-xxxxxxx" autoComplete="tel" hint={t('phone_login_hint')} />
          <TextInput reserve label={t('email')} value={f.email} onChange={set('email')} error={errs.email} type="email" autoComplete="email" placeholder="name@example.com" hint={verify ? t('email_code_hint') : undefined} />
        </div>
        {verify && <EmailCodeField email={f.email} purpose="signup" value={f.code} onChange={set('code')} error={errs.code} onEmailError={(m) => setErrs((s) => ({ ...s, email: m }))} />}
        <div className="grid sm:grid-cols-2 gap-x-3.5 gap-y-1.5">
          <PasswordInput reserve label={t('password')} value={f.password} onChange={set('password')} error={errs.password} autoComplete="new-password" />
          <PasswordInput reserve label={t('password_again')} value={f.password2} onChange={set('password2')} error={errs.password2} autoComplete="new-password" />
        </div>
        {err && <div className="text-[13px] font-medium text-bad bg-[#fdecea] rounded-[var(--radius-ctl)] px-3 py-2 mb-2">{err}</div>}
        <Button type="submit" full size="lg" variant="accent" icon={Rocket} loading={busy}>
          {t('start_free')}
        </Button>
        <p className="text-[12px] text-muted text-center">{t('signup_note')}</p>
      </form>
    </AuthLayout>
  );
}
