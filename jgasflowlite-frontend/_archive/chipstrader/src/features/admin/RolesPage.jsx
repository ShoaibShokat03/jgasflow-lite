import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Plus, Save, Search, Copy, Trash2, Pencil, Users as UsersIcon, LayoutGrid, SlidersHorizontal, Lock, UserPlus, X, Info,
} from 'lucide-react';
import { api, errorMessage, get, patch, post, put } from '@/lib/api';
import { fmtRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { applyModule, availableLevels, isCustom, LEVEL_LABEL, levelOf, SCOPE_LABEL, scopeOf, scopeOptions } from '@/lib/access';
import { Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Tabs, Textarea } from '@/components/ui/core';
import { ConfirmDialog, Menu, Modal, useToast } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/status';
import { Combobox } from '@/components/ui/pickers';

/**
 * Roles & permissions, organised by module: pick an access level (No access,
 * View, Edit, Full) and, for documents, whose records (own, their accounts,
 * all). The Advanced tab still edits individual permission keys.
 */
export default function RolesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => get('/admin/roles') });
  const catalog = useQuery({ queryKey: ['perm-catalog'], queryFn: () => get('/admin/roles/catalog'), staleTime: Infinity });
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tab = sp.get('tab') || 'modules';

  const list = roles.data ?? [];
  const role = list.find((r) => r.name === sp.get('role')) ?? list[0];
  const isAll = role?.permissions.includes('*');
  const saved = useMemo(() => new Set(role?.permissions ?? []), [role]);

  useEffect(() => setDraft(role ? new Set(role.permissions) : null), [role?.name, role?.permissions]); // eslint-disable-line react-hooks/exhaustive-deps

  const changes = useMemo(() => {
    if (!draft || isAll) return 0;
    let n = 0;
    draft.forEach((k) => !saved.has(k) && n++);
    saved.forEach((k) => !draft.has(k) && n++);
    return n;
  }, [draft, saved, isAll]);

  const save = useMutation({
    mutationFn: () => put(`/admin/roles/${role.name}`, { permissions: [...draft] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(`${role.label} saved. Signed-in users get the change within a minute.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/roles/${role.name}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
      setConfirmDelete(false);
      setSp({});
      toast.success('Role deleted');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const select = (name) => {
    if (changes && !window.confirm('Discard unsaved changes to this role?')) return;
    setSp({ role: name, tab });
  };

  if (roles.isLoading || catalog.isLoading) return <div className="py-24 grid place-items-center"><Spinner /></div>;

  const shown = list.filter((r) => !filter || `${r.label} ${r.description ?? ''}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="pb-20">
      <PageHeader
        title="Roles & permissions"
        actions={<Button variant="primary" icon={Plus} onClick={() => setDialog({ mode: 'new' })}>New role</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="p-2 h-fit lg:sticky lg:top-20">
          <div className="relative p-1 mb-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-faint" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a role…" className="pl-9 h-8" />
          </div>
          {shown.map((r) => (
            <button
              key={r.name}
              onClick={() => select(r.name)}
              className={cn('w-full text-left px-3 py-2.5 rounded-lg transition-colors', role?.name === r.name ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-surface-3')}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cn('font-medium text-[13.5px] flex items-center gap-1.5', role?.name === r.name && 'text-link')}>
                  {r.is_system ? <Lock className="size-3.5" /> : null}
                  {r.label}
                </span>
                <span className="chip h-5 px-1.5 bg-surface-3 text-muted" title={`${r.user_count} user(s)`}>{r.user_count}</span>
              </span>
              {r.description && <span className="block text-xs text-muted mt-0.5 line-clamp-2">{r.description}</span>}
            </button>
          ))}
        </Card>

        {role && draft && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start gap-3 px-4 py-3.5 border-b border-line">
              <div className="grid place-items-center size-10 rounded-xl bg-brand-50 text-link dark:bg-brand-500/15"><ShieldCheck className="size-5" /></div>
              <div className="flex-1 min-w-48">
                <p className="font-semibold text-[16px] flex items-center gap-2">
                  {role.label}
                  {role.is_system ? <Badge tone="violet">System</Badge> : null}
                </p>
                <p className="text-sm text-muted">{role.description || 'No description yet.'}</p>
                <p className="text-xs text-muted mt-1">{role.user_count} user{role.user_count === 1 ? '' : 's'} · key <span className="mono">{role.name}</span></p>
              </div>
              <div className="flex items-center gap-2">
                {!role.is_system && <Button size="sm" icon={Pencil} onClick={() => setDialog({ mode: 'edit' })}>Edit details</Button>}
                <Menu
                  trigger={<Button size="sm">More</Button>}
                  items={[
                    { label: 'Duplicate role', icon: Copy, onClick: () => setDialog({ mode: 'duplicate' }) },
                    !role.is_system && { label: 'Delete role', icon: Trash2, danger: true, onClick: () => setConfirmDelete(true) },
                  ]}
                />
              </div>
            </div>

            <Tabs
              className="px-2"
              value={tab}
              onChange={(v) => setSp({ role: role.name, tab: v })}
              tabs={[
                { value: 'modules', label: 'Module access', icon: LayoutGrid },
                { value: 'users', label: 'Users', icon: UsersIcon, count: role.user_count },
                { value: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
              ]}
            />

            {isAll && (
              <div className="m-4 flex items-start gap-2.5 rounded-lg bg-violet-50 dark:bg-violet-500/15 text-violet-800 dark:text-violet-200 px-3 py-2.5 text-sm">
                <Info className="size-4 mt-0.5 shrink-0" />
                This role always has every permission, including future modules. It cannot be narrowed; create another role for limited access.
              </div>
            )}

            {tab === 'modules' && <ModuleGrid modules={catalog.data.modules} draft={draft} setDraft={setDraft} readOnly={isAll} />}
            {tab === 'users' && <RoleUsers role={role} />}
            {tab === 'advanced' && <Advanced groups={catalog.data.groups} draft={draft} setDraft={setDraft} readOnly={isAll} />}
          </Card>
        )}
      </div>

      {changes > 0 && (
        <div className="fixed bottom-4 inset-x-4 lg:left-auto lg:right-8 z-30 flex justify-center lg:justify-end">
          <div className="card shadow-[var(--shadow-pop)] flex flex-wrap items-center gap-3 px-4 py-2.5 animate-pop">
            <span className="text-sm"><b>{changes}</b> unsaved change{changes === 1 ? '' : 's'} to <b>{role.label}</b></span>
            <Button size="sm" onClick={() => setDraft(new Set(role.permissions))}>Discard</Button>
            <Button size="sm" variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate()}>Save role</Button>
          </div>
        </div>
      )}

      {dialog && (
        <RoleDialog
          mode={dialog.mode}
          role={role}
          onClose={() => setDialog(null)}
          onDone={(name) => {
            qc.invalidateQueries({ queryKey: ['admin-roles'] });
            setSp({ role: name, tab: 'modules' });
          }}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title={`Delete ${role?.label}?`}
        message={role?.user_count ? `${role.user_count} user(s) still have this role. Move them to another role first.` : 'Nobody has this role. It will be removed permanently.'}
        confirmLabel="Delete role"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

// ─────────────────────────── module grid ───────────────────────────

function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-field bg-surface-2 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          disabled={disabled}
          onClick={() => onChange(o)}
          className={cn(
            'h-7 px-2.5 rounded-md text-[12.5px] font-medium whitespace-nowrap transition-colors',
            value === o ? (o === 'none' ? 'bg-surface text-ink shadow-sm' : 'bg-brand-600 text-white shadow-sm') : 'text-muted hover:text-ink',
          )}
        >
          {LEVEL_LABEL[o]}
        </button>
      ))}
    </div>
  );
}

const scopeLabel = (m, s) => {
  if (m.key === 'dashboard') return s === 'all' ? 'Company-wide' : 'Own figures';
  if (s === 'accounts') return m.accountsLabel ?? SCOPE_LABEL.accounts;
  return SCOPE_LABEL[s];
};

function ModuleGrid({ modules, draft, setDraft, readOnly }) {
  const groups = useMemo(() => {
    const out = new Map();
    modules.forEach((m) => out.set(m.group, [...(out.get(m.group) ?? []), m]));
    return [...out.entries()];
  }, [modules]);

  const setAll = (fn) => setDraft((d) => modules.reduce((acc, m) => fn(acc, m), new Set(d)));
  const viewAll = () => setAll((acc, m) => (availableLevels(m).includes('view') ? applyModule(acc, m, 'view', 'all', modules) : acc));
  const fullBusiness = () => setAll((acc, m) => (m.group !== 'Administration' ? applyModule(acc, m, availableLevels(m).at(-1), 'all', modules) : acc));
  const clearAll = () => setAll((acc, m) => applyModule(acc, m, 'none', null, modules));

  return (
    <div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line bg-surface-2">
          <span className="text-xs font-medium text-muted mr-1">Quick presets</span>
          <Button size="sm" onClick={viewAll}>View everything</Button>
          <Button size="sm" onClick={fullBusiness}>Full business access</Button>
          <Button size="sm" onClick={clearAll}>No access</Button>
          <span className="text-xs text-muted ml-auto hidden md:inline">Nothing is saved until you press Save role.</span>
        </div>
      )}
      {groups.map(([group, mods]) => (
        <section key={group}>
          <h3 className="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{group}</h3>
          <ul className="divide-y divide-line border-y border-line">
            {mods.map((m) => {
              const level = levelOf(m, draft);
              const scope = scopeOf(m, draft);
              const scopes = scopeOptions(m);
              const custom = isCustom(m, draft, modules);
              return (
                <li key={m.key} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto_190px] md:items-center">
                  <div className="min-w-0">
                    <p className="font-medium text-[13.5px] flex items-center gap-2">
                      {m.label}
                      {custom && <Badge tone="amber">Custom</Badge>}
                    </p>
                    <p className="text-xs text-muted">{m.description}</p>
                  </div>
                  <Segmented options={['none', ...availableLevels(m)]} value={level} disabled={readOnly} onChange={(l) => setDraft((d) => applyModule(d, m, l, scope ?? 'own', modules))} />
                  <div>
                    {scopes.length > 0 ? (
                      <select
                        className="input h-8 text-[12.5px]"
                        aria-label={`${m.label}: whose records`}
                        disabled={readOnly || level === 'none'}
                        value={level === 'none' ? '' : scope ?? 'own'}
                        onChange={(e) => setDraft((d) => applyModule(d, m, level, e.target.value, modules))}
                      >
                        {level === 'none' && <option value="">No records</option>}
                        {scopes.map((s) => <option key={s} value={s}>{scopeLabel(m, s)}</option>)}
                      </select>
                    ) : (
                      <span className="hidden md:block text-xs text-muted text-right">Not record based</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="px-4 py-3 text-xs text-muted">
        <b>Own records</b>: documents where the user is the assigned rep or buyer. <b>Their accounts</b>: documents for customers or suppliers they are account holder of. <b>All records</b>: everything.
      </p>
    </div>
  );
}

// ─────────────────────────── users in role ───────────────────────────

function RoleUsers({ role }) {
  const qc = useQueryClient();
  const toast = useToast();
  const members = useQuery({ queryKey: ['role-users', role.name], queryFn: () => get(`/admin/roles/${role.name}/users`) });
  const all = useQuery({ queryKey: ['admin-users-all'], queryFn: () => get('/admin/users', { limit: 100 }) });
  const [adding, setAdding] = useState(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['role-users', role.name] });
    qc.invalidateQueries({ queryKey: ['admin-users-all'] });
    qc.invalidateQueries({ queryKey: ['admin-roles'] });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
  };
  const change = useMutation({
    mutationFn: async ({ user, add }) => {
      const current = all.data?.items.find((u) => u.id === user.id)?.roles ?? [];
      const roles = add ? [...new Set([...current, role.name])] : current.filter((r) => r !== role.name);
      if (!roles.length) throw new Error('A user needs at least one role. Give them another role first.');
      return patch(`/admin/users/${user.id}`, { roles });
    },
    onSuccess: (_, v) => {
      refresh();
      setAdding(null);
      const who = v.user.full_name || v.user.username;
      toast.success(v.add ? `${who} added to ${role.label}` : `${who} removed from ${role.label}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const memberIds = new Set((members.data ?? []).map((u) => u.id));
  const candidates = (all.data?.items ?? []).filter((u) => !memberIds.has(u.id));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line bg-surface-2">
        <div className="w-72 max-w-full">
          <Combobox value={adding?.id ?? null} onChange={(_, u) => setAdding(u ?? null)} options={candidates} getLabel={(u) => u.full_name || u.username} getSub={(u) => u.email} placeholder="Choose a user to add…" />
        </div>
        <Button size="sm" variant="primary" icon={UserPlus} disabled={!adding} loading={change.isPending && change.variables?.add} onClick={() => change.mutate({ user: adding, add: true })}>
          Add to role
        </Button>
      </div>
      {members.isLoading ? (
        <div className="py-12 grid place-items-center"><Spinner /></div>
      ) : !members.data?.length ? (
        <EmptyState icon={UsersIcon} title="Nobody has this role yet">Add a user above, or assign roles on the Users screen.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {members.data.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid place-items-center size-8 rounded-full bg-gradient-to-br from-brand-600 to-cyan-700 text-white text-[11px] font-semibold">
                {(u.full_name || u.username).split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium truncate">{u.full_name || u.username}</p>
                <p className="text-xs text-muted truncate">{u.email} · {u.status === 10 ? `last sign-in ${fmtRelative(u.last_login_at) || 'never'}` : 'disabled'}</p>
              </div>
              <Button size="sm" variant="ghost" icon={X} onClick={() => change.mutate({ user: u, add: false })} aria-label={`Remove ${u.username} from role`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────── advanced ───────────────────────────

function Advanced({ groups, draft, setDraft, readOnly }) {
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    return groups
      .map((g) => ({ ...g, permissions: g.permissions.filter((p) => !f || p.key.includes(f) || p.label.toLowerCase().includes(f) || g.label.toLowerCase().includes(f)) }))
      .filter((g) => g.permissions.length);
  }, [groups, filter]);
  const isAll = draft.has('*');
  const toggle = (k, on) =>
    setDraft((s) => {
      const n = new Set(s);
      on ? n.add(k) : n.delete(k);
      return n;
    });
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line bg-surface-2">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter permissions…" className="pl-9 h-8" />
        </div>
      </div>
      <div className="divide-y divide-line">
        {shown.map((g) => {
          const allOn = g.permissions.every((p) => isAll || draft.has(p.key));
          return (
            <div key={g.key} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{g.label}</p>
                {!readOnly && <button className="text-xs text-link hover:underline" onClick={() => g.permissions.forEach((p) => toggle(p.key, !allOn))}>{allOn ? 'Clear group' : 'Select group'}</button>}
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1.5">
                {g.permissions.map((p) => (
                  <label key={p.key} className={cn('flex items-center gap-2 text-[13px]', !readOnly && 'cursor-pointer')}>
                    <input type="checkbox" className="size-4 accent-brand-600" disabled={readOnly} checked={isAll || draft.has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} />
                    <span className="truncate" title={p.key}>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── create / edit / duplicate ───────────────────────────

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64);

function RoleDialog({ mode, role, onClose, onDone }) {
  const toast = useToast();
  const editing = mode === 'edit';
  const [f, setF] = useState(() =>
    editing
      ? { label: role.label, name: role.name, description: role.description ?? '' }
      : mode === 'duplicate'
        ? { label: `${role.label} copy`, name: slug(`${role.name}_copy`), description: role.description ?? '' }
        : { label: '', name: '', description: '' },
  );
  const [nameTouched, setNameTouched] = useState(false);
  const m = useMutation({
    mutationFn: () =>
      editing
        ? put(`/admin/roles/${role.name}`, { label: f.label, description: f.description || null })
        : post('/admin/roles', {
            name: f.name,
            label: f.label,
            description: f.description || undefined,
            permissions: mode === 'duplicate' ? role.permissions.filter((p) => p !== '*') : ['dashboard.view'],
          }),
    onSuccess: (r) => {
      toast.success(editing ? 'Role updated' : 'Role created. Now choose its module access.');
      onDone(editing ? role.name : r.name);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const title = editing ? `Edit ${role.label}` : mode === 'duplicate' ? `Duplicate ${role.label}` : 'New role';
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={ShieldCheck}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!f.label.trim() || (!editing && !f.name)} onClick={() => m.mutate()}>
            {editing ? 'Save' : 'Create role'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Role name" required>
          {(id) => (
            <Input id={id} autoFocus value={f.label} onChange={(e) => setF({ ...f, label: e.target.value, name: editing || nameTouched ? f.name : slug(e.target.value) })} placeholder="e.g. Key account manager" />
          )}
        </Field>
        {!editing && (
          <Field label="Key" hint="Lower case with underscores. Permanent once created.">
            {(id) => <Input id={id} className="mono" value={f.name} onChange={(e) => (setNameTouched(true), setF({ ...f, name: slug(e.target.value) }))} />}
          </Field>
        )}
        <Field label="Description" hint="One line on who this role is for. Shown on the Users screen.">
          {(id) => <Textarea id={id} rows={2} maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}
        </Field>
      </div>
    </Modal>
  );
}
