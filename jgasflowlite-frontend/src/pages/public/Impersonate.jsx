import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { AuthLayout } from './AuthLayout';

/**
 * Support login from the JGasFlow Console: trades the one-time code in the
 * link for a session of the shop owner. Every use is in the shop's history.
 */
export default function Impersonate() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [err, setErr] = useState('');
  // The code works once: never send it twice (React dev mode runs effects twice).
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const code = params.get('code') || '';
    if (!code) {
      setErr(t('support_again'));
      return;
    }
    api
      .post('/auth/impersonate', { code })
      .then((res) => {
        auth.signIn(res);
        navigate('/app', { replace: true });
      })
      .catch((e) => setErr(e.message || t('support_again')));
  }, [params, auth, navigate]);

  return (
    <AuthLayout title={err ? t('support_failed') : t('support_opening')}>
      {err ? (
        <div className="space-y-4 text-center">
          <ShieldAlert className="mx-auto size-10 text-red-500" />
          <p className="text-sm text-slate-600">{err}</p>
          <Link to="/login" className="inline-block text-sm font-semibold text-[#F26B1D] hover:underline">
            {t('go_to_login')}
          </Link>
        </div>
      ) : (
        <div className="flex justify-center py-6">
          <Loader2 className="size-8 animate-spin text-[#F26B1D]" />
        </div>
      )}
    </AuthLayout>
  );
}
