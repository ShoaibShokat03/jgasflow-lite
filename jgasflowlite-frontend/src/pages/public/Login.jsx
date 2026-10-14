import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { Button } from '@/ui/kit';
import { PasswordInput, TextInput } from '@/ui/form';
import { AuthLayout } from './AuthLayout';

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.status === 'user') return <Navigate to={auth.isSuper ? '/admin' : '/app'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!login.trim() || !password) return setErr(t('login_fill'));
    setBusy(true);
    setErr('');
    try {
      const res = await api.post('/auth/login', { login: login.trim(), password, client: 'web' });
      auth.signIn(res);
      navigate(res.user.is_super ? '/admin' : loc.state?.from || '/app', { replace: true });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t('welcome_back')}
      sub={t('login_sub')}
      footer={
        <>
          {t('no_account')}{' '}
          <Link to="/signup" className="font-bold text-primary hover:underline">
            {t('start_free')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextInput label={t('phone_or_email')} value={login} onChange={setLogin} autoComplete="username" placeholder="03xx-xxxxxxx" autoFocus />
        <div>
          <PasswordInput label={t('password')} value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="flex justify-end mt-1.5">
            <Link to="/forgot-password" className="text-[12.5px] font-semibold text-primary hover:underline">
              {t('forgot_password_link')}
            </Link>
          </div>
        </div>
        {err && <div className="text-[13px] font-medium text-bad bg-[#fdecea] rounded-[var(--radius-ctl)] px-3 py-2">{err}</div>}
        <Button type="submit" full size="lg" icon={LogIn} loading={busy}>
          {t('login')}
        </Button>
      </form>
    </AuthLayout>
  );
}
