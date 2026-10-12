import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
import { get } from '@/lib/api';
import { useDebounced, useMaster, useUsers } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useAnchored } from './overlay';

/**
 * Searchable single-select. Options come from `options` (static) or
 * `load(search)` (async). Keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
 */
export function Combobox({ value, onChange, options, load, queryKey, placeholder = 'Select…', getLabel = (o) => o?.label, getSub, selectedLabel, clearable = true, disabled, id, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounced(search, 200);
  const box = useRef(null);
  const input = useRef(null);
  const { panelRef, style } = useAnchored(box, open, { matchWidth: true, gap: 4 });

  const remote = useQuery({
    queryKey: [...(queryKey ?? ['combo']), debounced],
    queryFn: () => load(debounced),
    enabled: !!load && open,
    staleTime: 30_000,
  });

  const list = useMemo(() => {
    const src = load ? remote.data ?? [] : options ?? [];
    if (load || !search) return src.slice(0, 200);
    const s = search.toLowerCase();
    return src.filter((o) => `${getLabel(o)} ${getSub?.(o) ?? ''}`.toLowerCase().includes(s)).slice(0, 200);
  }, [load, remote.data, options, search, getLabel, getSub]);

  useEffect(() => setActive(0), [debounced, open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !box.current?.contains(e.target) && !panelRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    setTimeout(() => input.current?.focus(), 0);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = (options ?? remote.data ?? []).find((o) => String(o.id) === String(value));
  const label = current ? getLabel(current) : selectedLabel;

  const pick = (o) => {
    onChange(o ? o.id : null, o);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={box} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => setOpen((o) => !o)}
        className={cn('input flex items-center justify-between gap-2 text-left', !label && 'text-faint')}
      >
        <span className="truncate">{label || placeholder}</span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && value && !disabled && (
            <X
              className="size-3.5 text-faint hover:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
            />
          )}
          <ChevronsUpDown className="size-3.5 text-faint" />
        </span>
      </button>
      {open && createPortal(
        <div ref={panelRef} style={style} data-overlay className="min-w-64 flex flex-col card shadow-[var(--shadow-pop)] animate-pop overflow-hidden">
          <div className="flex items-center gap-2 px-3 border-b border-line">
            <Search className="size-4 text-faint" />
            <input
              ref={input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search…"
              className="h-9 flex-1 bg-transparent outline-none text-[13.5px]"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, list.length - 1)));
                if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
                if (e.key === 'Enter') (e.preventDefault(), list[active] && pick(list[active]));
                if (e.key === 'Escape') setOpen(false);
              }}
            />
            {remote.isFetching && <Loader2 className="size-3.5 animate-spin text-faint" />}
          </div>
          <div className="max-h-64 min-h-0 overflow-y-auto p-1">
            {list.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted">{remote.isFetching ? 'Searching…' : 'No matches'}</p>
            ) : (
              list.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[13px]', i === active && 'bg-surface-3')}
                >
                  <Check className={cn('size-3.5 shrink-0 text-link', String(o.id) === String(value) ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0">
                    <span className="block truncate">{getLabel(o)}</span>
                    {getSub?.(o) && <span className="block truncate text-[11.5px] text-faint">{getSub(o)}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Customer or supplier picker (server-side search, scoped to what you may see). */
export function CompanyPicker({ type = 'customer', value, onChange, selectedLabel, ...rest }) {
  return (
    <Combobox
      value={value}
      onChange={onChange}
      selectedLabel={selectedLabel}
      queryKey={['company-options', type]}
      load={(search) => get('/companies/options', { type, search })}
      getLabel={(o) => o.short_name || o.legal_name}
      getSub={(o) => (o.short_name ? o.legal_name : undefined)}
      placeholder={`Choose a ${type}…`}
      {...rest}
    />
  );
}

/** Any master-data list as a searchable select. */
export function MasterPicker({ list, value, onChange, placeholder, ...rest }) {
  const { master } = useMaster();
  const rows = master?.[list] ?? [];
  const label = (o) => (list === 'currencies' ? `${o.code} · ${o.name}` : list === 'incoterms' ? `${o.code} · ${o.name}` : list === 'countries' ? `${o.name} (${o.iso2})` : o.name);
  return <Combobox value={value} onChange={onChange} options={rows} getLabel={label} placeholder={placeholder ?? 'Select…'} {...rest} />;
}

export function UserPicker({ value, onChange, placeholder = 'Unassigned', ...rest }) {
  const { data } = useUsers();
  return <Combobox value={value} onChange={onChange} options={data ?? []} getLabel={(u) => u.full_name || u.username} getSub={(u) => (u.full_name ? u.username : undefined)} placeholder={placeholder} {...rest} />;
}

/** Native select for short master lists (faster to use than a combobox). */
export function MasterSelect({ list, value, onChange, placeholder = 'None', className, id }) {
  const { master } = useMaster();
  const rows = master?.[list] ?? [];
  return (
    <select id={id} className={cn('input', className)} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder}</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {list === 'currencies' || list === 'incoterms' ? `${r.code} · ${r.name}` : list === 'taxes' ? `${r.name}` : r.name}
        </option>
      ))}
    </select>
  );
}
