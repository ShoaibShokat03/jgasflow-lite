import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, UserCog, KeyRound, LogOut, Users } from 'lucide-react';
import { errorMessage, get, patch, post } from '@/lib/api';
import { fmtRelative } from '@/lib/format';
import { useDebounced, useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { LEVEL_LABEL, summarize } from '@/lib/access';
import { Button, EmptyState, Field, Input, PageHeader, Select, PasswordInput } from '@/components/ui/core';
import { DataTable, Pagination } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/status';
import { ConfirmDialog, Menu, Modal, useToast } from '@/components/ui/overlay';

export default function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useMe();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const [edit, setEdit] = useState(null);
  const [reset, setReset] = useState(null);
  const [kick, setKick] = useState(null);
  const q = useQuery({ queryKey: ['admin-users', debounced, page], queryFn: () => get('/admin/users', { search: debounced || undefined, page, limit: 25 }) });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => get('/admin/roles') });
  const roleLabel = (n) => roles.data?.find((r) => r.name === n)?.label ?? n;

  const kickM = useMutation({
    mutationFn: (u) => post(`/admin/users/${u.id}/force-logout`),
    onSuccess: () => (setKick(null), toast.success('Signed out of every device')),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns = [
    { key: 'name', header: 'User', mobile: true, render: (u) => <div className="flex items-center gap-2.5"><span className="grid place-items-center size-8 rounded-full bg-gradient-to-br from-brand-600 to-cyan-700 text-white text-[11px] font-semibold">{(u.full_name || u.username).split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span><div><p className="font-medium">{u.full_name || u.username}</p><p className="text-xs text-muted">{u.username} · {u.email}</p></div></div> },
    { key: 'roles', header: 'Roles', mobile: true, render: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={r === 'super_admin' ? 'violet' : 'brand'}>{roleLabel(r)}</Badge>)}</div> },
    { key: 'commission', header: 'Commission', align: 'right', render: (u) => `${u.commission_rate_percent}%` },
    { key: 'last', header: 'Last sign-in', render: (u) => <span className="text-muted">{fmtRelative(u.last_login_at)}</span> },
    { key: 'status', header: 'Status', mobile: true, render: (u) => <StatusBadge status={u.status === 10 ? 'active' : 'inactive'} label={u.status === 10 ? 'Active' : 'Disabled'} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (u) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Menu trigger={<Button variant="ghost" size="sm">•••</Button>} items={[
            { label: 'Edit', icon: UserCog, onClick: () => setEdit(u) },
            { label: 'Reset password', icon: KeyRound, onClick: () => setReset(u) },
            { label: 'Sign out everywhere', icon: LogOut, onClick: () => setKick(u), disabled: u.id === me?.id },
          ]} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Users" actions={<Button variant="primary" icon={Plus} onClick={() => setEdit({})}>New user</Button>} />
      <div className="card p-3 mb-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" /><Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Name, username or email…" className="pl-9" /></div></div>
      <DataTable columns={columns} rows={q.data?.items} loading={q.isLoading} onRowClick={(u) => setEdit(u)} empty={<EmptyState icon={Users} title="No users" />} footer={<Pagination page={page} totalPages={q.data?.total_pages} total={q.data?.total} onPage={setPage} label="users" />} />
      {edit && <UserDialog user={edit} roles={roles.data ?? []} onClose={() => setEdit(null)} onDone={() => qc.invalidateQueries({ queryKey: ['admin-users'] })} />}
      {reset && <ResetDialog user={reset} onClose={() => setReset(null)} />}
      <ConfirmDialog open={!!kick} onClose={() => setKick(null)} title={`Sign ${kick?.full_name || kick?.username} out everywhere?`} message="Every active session for this user ends immediately." confirmLabel="Sign out" loading={kickM.isPending} onConfirm={() => kickM.mutate(kick)} />
    </div>
  );
}

function UserDialog({ user, roles, onClose, onDone }) {
  const toast = useToast();
  const isNew = !user.id;
  const catalog = useQuery({ queryKey: ['perm-catalog'], queryFn: () => get('/admin/roles/catalog'), staleTime: Infinity });
  const [f, setF] = useState({ username: user.username ?? '', email: user.email ?? '', full_name: user.full_name ?? '', password: '', commission_rate_percent: user.commission_rate_percent ?? 5, status: user.status ?? 10, roles: user.roles ?? [] });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const m = useMutation({
    mutationFn: () =>
      isNew
        ? post('/admin/users', { username: f.username, email: f.email, full_name: f.full_name || undefined, password: f.password, commission_rate_percent: Number(f.commission_rate_percent), roles: f.roles })
        : patch(`/admin/users/${user.id}`, { email: f.email, full_name: f.full_name || null, commission_rate_percent: Number(f.commission_rate_percent), status: Number(f.status), roles: f.roles }),
    onSuccess: () => (onDone(), toast.success(isNew ? 'User created' : 'User updated'), onClose()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = (name, on) => setF((s) => ({ ...s, roles: on ? [...s.roles, name] : s.roles.filter((r) => r !== name) }));

  // What the selected roles add up to, module by module.
  const effective = useMemo(() => new Set(roles.filter((r) => f.roles.includes(r.name)).flatMap((r) => r.permissions)), [roles, f.roles]);
  const summary = useMemo(() => (catalog.data ? summarize(catalog.data.modules, effective).filter((x) => x.level !== 'none') : []), [catalog.data, effective]);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={UserCog}
      title={isNew ? 'New user' : `Edit ${user.full_name || user.username}`}
      footer={
        <>
          {!f.roles.length && <span className="mr-auto text-sm text-warning">Choose at least one role</span>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!f.email || (isNew && (!f.username || !f.password)) || !f.roles.length} onClick={() => m.mutate()}>
            {isNew ? 'Create user' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* 1 · Account details: full width, nothing beside them. */}
        <section>
          <h3 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted mb-3">
            <span className="grid place-items-center size-5 rounded-full bg-brand-600 text-white text-[11px]">1</span>
            Account
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <Field label="Full name">{(id) => <Input id={id} value={f.full_name} onChange={set('full_name')} autoFocus={isNew} />}</Field>
            <Field label="Username" required hint={isNew ? 'Used to sign in. Cannot be changed later.' : undefined}>{(id) => <Input id={id} value={f.username} onChange={set('username')} disabled={!isNew} />}</Field>
            <Field label="Email" required>{(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} />}</Field>
            {isNew && <Field label="Password" required span={2} hint="8+ characters with upper case, lower case and a number. Share it securely; they can change it after signing in.">{(id) => <PasswordInput id={id} autoComplete="new-password" value={f.password} onChange={set('password')} />}</Field>}
            <Field label="Commission %" hint="Share of gross profit on their sales.">{(id) => <Input id={id} type="number" min="0" max="100" step="0.01" value={f.commission_rate_percent} onChange={set('commission_rate_percent')} />}</Field>
            {!isNew && <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set('status')}><option value={10}>Active</option><option value={0}>Disabled (cannot sign in)</option></Select>}</Field>}
          </div>
        </section>

        {/* 2 · Roles with their combined effect right beside them. */}
        <section className="border-t border-line pt-5">
          <h3 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted mb-1">
            <span className="grid place-items-center size-5 rounded-full bg-brand-600 text-white text-[11px]">2</span>
            Roles &amp; access
          </h3>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
            <div className="grid gap-2">
              {roles.map((r) => {
                const on = f.roles.includes(r.name);
                return (
                  <label
                    key={r.name}
                    className={cn('flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors', on ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/15' : 'border-line hover:border-field')}
                  >
                    <input type="checkbox" className="size-4 mt-0.5 accent-brand-600" checked={on} onChange={(e) => toggle(r.name, e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13.5px] font-medium">{r.label}</span>
                        <span className="text-[11px] text-muted">{r.user_count} user{r.user_count === 1 ? '' : 's'}</span>
                      </span>
                      {r.description && <span className="block text-xs text-muted mt-0.5">{r.description}</span>}
                    </span>
                  </label>
                );
              })}
            </div>

            <aside className="rounded-xl border border-line bg-surface-2 p-3.5 lg:sticky lg:top-0" aria-live="polite">
              <h4 className="text-[13px] font-semibold mb-3">What they can do</h4>
              {effective.has('*') ? (
                <p className="text-sm">Everything</p>
              ) : !summary.length ? (
                <p className="text-sm text-muted">No access</p>
              ) : (
                <div className="space-y-3">
                  {[...new Set(summary.map((x) => x.module.group))].map((group) => (
                    <div key={group}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{group}</p>
                      <ul className="space-y-1">
                        {summary.filter((x) => x.module.group === group).map(({ module: mod, level, scope }) => (
                          <li key={mod.key} className="flex items-center justify-between gap-2 text-[13px]">
                            <span className="truncate">{mod.label}</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              {scope && <span className="text-[11px] text-muted">{scope === 'all' ? 'all records' : scope === 'own' ? 'own records' : 'their accounts'}</span>}
                              <Badge tone={level === 'view' ? 'slate' : level === 'edit' ? 'brand' : 'violet'}>{LEVEL_LABEL[level]}</Badge>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function ResetDialog({ user, onClose }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const m = useMutation({
    mutationFn: () => post(`/admin/users/${user.id}/reset-password`, { password: pw }),
    onSuccess: () => (toast.success('Password reset. The user was signed out everywhere.'), onClose()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} size="sm" icon={KeyRound} title={`Reset password for ${user.username}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={pw.length < 8} onClick={() => m.mutate()}>Reset password</Button></>}>
      <Field label="New password" hint="8+ characters with upper case, lower case and a number. Share it securely.">{(id) => <PasswordInput id={id} autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
    </Modal>
  );
}
