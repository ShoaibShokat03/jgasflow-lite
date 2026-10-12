import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Boxes, FileText, Truck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { session } from '@/lib/session';
import { Button, Field, Input, PasswordInput } from '@/components/ui/core';
import { Logo, LogoMark } from '@/components/layout/Logo';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // A brand-new install has no users: send the visitor to first-run setup.
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: () => api.get('/auth/setup').then((r) => r.data), retry: false, staleTime: 60_000 });

  if (session.isSignedIn()) return <Navigate to={params.get('next') || '/'} replace />;
  if (setup.data?.needs_setup) return <Navigate to="/setup" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { login, password });
      session.store(data);
      qc.setQueryData(['me'], data.user);
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Sign-in failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-cyan-800 text-white">
        <svg className="absolute inset-0 w-full h-full opacity-[0.12]" aria-hidden="true">
          <defs>
            <pattern id="traces" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M0 40h24l8-8h16l8 8h24M40 0v24l8 8v16l-8 8v24" fill="none" stroke="#fff" strokeWidth="1.5" />
              <circle cx="24" cy="40" r="3" fill="#fff" />
              <circle cx="56" cy="40" r="3" fill="#fff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#traces)" />
        </svg>
        <div className="relative flex items-center gap-3">
          <LogoMark className="size-10 ring-2 ring-white/25 rounded-[14px]" />
          <span className="text-xl font-semibold tracking-tight">ChipsTrader</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[34px] leading-tight font-semibold tracking-tight">Every part, every order, one fast workspace.</h1>
          <p className="mt-3 text-indigo-100 text-[15px]">From the customer's RFQ to the supplier PO, stock allocation, shipment and invoice, without leaving the keyboard.</p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { icon: FileText, label: 'RFQ → Quote → Order' },
              { icon: Boxes, label: 'Lot-level stock' },
              { icon: Truck, label: 'Ship & invoice in one step' },
            ].map((f) => (
              <div key={f.label} className="rounded-xl bg-white/10 p-3 ring-1 ring-white/15">
                <f.icon className="size-5 mb-2" />
                <p className="text-[12.5px] leading-snug text-white">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-indigo-200">© {new Date().getFullYear()} ChipsTrader</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={submit} className="w-full max-w-sm">
          <Logo className="lg:hidden mb-8" />
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="text-sm text-muted mt-1 mb-7">Use your ChipsTrader username or email.</p>

          <div className="space-y-4">
            <Field label="Username or email">
              {(id) => <Input id={id} autoFocus autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required className="h-10" />}
            </Field>
            <Field label="Password">
              {(id) => <PasswordInput id={id} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-10" />}
            </Field>
          </div>

          {error && <p className="mt-4 text-sm text-danger bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

          <Button type="submit" variant="primary" loading={loading} className="w-full h-10 mt-6">
            Sign in <ArrowRight className="size-4" />
          </Button>
          <p className="text-xs text-faint mt-6 text-center">Forgot your password? Ask an administrator to reset it.</p>
        </form>
      </div>
    </div>
  );
}
