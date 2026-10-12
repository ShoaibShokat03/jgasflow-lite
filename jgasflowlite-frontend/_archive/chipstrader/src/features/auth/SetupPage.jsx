import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { session } from '@/lib/session';
import { Button, Field, Input, PasswordInput, Spinner } from '@/components/ui/core';
import { Logo } from '@/components/layout/Logo';

const RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/**
 * First-run setup: create the first administrator. Only reachable while the
 * database has no users; the server refuses it afterwards.
 */
export default function SetupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['setup-status'], queryFn: () => api.get('/auth/setup').then((r) => r.data), retry: false });
  const [f, setF] = useState({ full_name: '', username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  if (status.isLoading) return <div className="min-h-dvh grid place-items-center"><Spinner /></div>;
  if (status.data && !status.data.needs_setup) return <Navigate to={session.isSignedIn() ? '/' : '/login'} replace />;

  const checks = [
    { ok: f.password.length >= 8, label: '8 or more characters' },
    { ok: /[a-z]/.test(f.password) && /[A-Z]/.test(f.password), label: 'Upper and lower case letters' },
    { ok: /\d/.test(f.password), label: 'At least one number' },
    { ok: !!f.confirm && f.confirm === f.password, label: 'Both passwords match' },
  ];
  const valid = f.full_name.trim().length >= 2 && /^[a-zA-Z0-9._-]{3,}$/.test(f.username) && /\S+@\S+\.\S+/.test(f.email) && RULE.test(f.password) && f.password === f.confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/setup', { full_name: f.full_name, username: f.username, email: f.email, password: f.password });
      session.store(data);
      qc.setQueryData(['me'], data.user);
      navigate('/admin/company', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Setup failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh grid place-items-center p-6 bg-bg">
      <form onSubmit={submit} className="w-full max-w-lg card p-6 sm:p-8">
        <Logo className="mb-6" />
        <div className="flex items-start gap-3 mb-6">
          <div className="grid place-items-center size-10 rounded-xl bg-brand-50 text-link dark:bg-brand-500/15 shrink-0"><ShieldCheck className="size-5" /></div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Create the first administrator</h1>
            <p className="text-sm text-muted mt-0.5">This account can do everything, including adding users and deciding what each role may access. This screen is shown only once.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3.5">
          <Field label="Full name" required span={2}>{(id) => <Input id={id} autoFocus value={f.full_name} onChange={set('full_name')} autoComplete="name" />}</Field>
          <Field label="Username" required hint="Letters, numbers, dot, dash or underscore.">{(id) => <Input id={id} value={f.username} onChange={set('username')} autoComplete="username" />}</Field>
          <Field label="Email" required>{(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} autoComplete="email" />}</Field>
          <Field label="Password" required>{(id) => <PasswordInput id={id} value={f.password} onChange={set('password')} autoComplete="new-password" />}</Field>
          <Field label="Repeat password" required>{(id) => <PasswordInput id={id} value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />}</Field>
        </div>

        <ul className="grid sm:grid-cols-2 gap-1.5 mt-3">
          {checks.map((c) => (
            <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-success' : 'text-muted'}`}>
              <CheckCircle2 className="size-3.5" />
              {c.label}
            </li>
          ))}
        </ul>

        {error && <p className="mt-4 text-sm text-danger bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

        <Button type="submit" variant="primary" loading={loading} disabled={!valid} className="w-full h-10 mt-6">
          Create administrator and continue <ArrowRight className="size-4" />
        </Button>
      </form>
    </div>
  );
}
