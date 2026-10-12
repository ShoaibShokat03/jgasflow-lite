import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, CornerDownLeft, Building2, FileText, Boxes, Receipt, ShoppingCart, ClipboardList, FileQuestion, Tags, Plus, Sparkles, Loader2 } from 'lucide-react';
import { get } from '@/lib/api';
import { useDebounced, useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { flatNav } from './nav';
import { useScrollLock } from '@/lib/scroll-lock';

const TYPE = {
  company: { icon: Building2, label: 'Company', to: (id) => `/companies/${id}` },
  requirement: { icon: FileQuestion, label: 'Requirement', to: (id) => `/requirements/${id}` },
  quote: { icon: FileText, label: 'Quote', to: (id) => `/quotes/${id}` },
  sales_order: { icon: ShoppingCart, label: 'Sales order', to: (id) => `/sales-orders/${id}` },
  offer: { icon: Tags, label: 'Offer', to: (id) => `/offers/${id}` },
  purchase_order: { icon: ClipboardList, label: 'Purchase order', to: (id) => `/purchase-orders/${id}` },
  invoice: { icon: Receipt, label: 'Invoice', to: (id) => `/invoices/${id}` },
  stock: { icon: Boxes, label: 'Stock', to: (id) => `/stock/${id}` },
};

const CREATE = [
  { label: 'New requirement', to: '/requirements?new=1', perm: 'req.create' },
  { label: 'New quote', to: '/quotes?new=1', perm: 'quote.create' },
  { label: 'New sales order', to: '/sales-orders?new=1', perm: 'so.create' },
  { label: 'New supplier offer', to: '/offers?new=1', perm: 'offer.create' },
  { label: 'New purchase order', to: '/purchase-orders?new=1', perm: 'po.create' },
  { label: 'New company', to: '/companies?new=1', perm: ['company.create', 'customer.create', 'supplier.create'] },
];

/** Ctrl/⌘ K: jump to any page, record or action from the keyboard. */
export function CommandPalette({ open, onClose, onAssistant }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const navigate = useNavigate();
  const { can } = useMe();
  const debounced = useDebounced(q, 180);
  useScrollLock(open);

  const search = useQuery({
    queryKey: ['palette', debounced],
    queryFn: () => get('/dashboard/search', { q: debounced }),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (open) {
      setQ('');
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = flatNav.filter((n) => (!n.perm.length || can(...n.perm)) && (!term || n.label.toLowerCase().includes(term))).map((n) => ({ kind: 'page', label: n.label, sub: n.group ?? 'Go to', icon: n.icon, to: n.to }));
    const creates = CREATE.filter((c) => can(...[].concat(c.perm)) && (!term || c.label.toLowerCase().includes(term))).map((c) => ({ kind: 'create', label: c.label, sub: 'Create', icon: Plus, to: c.to }));
    const records = (term.length >= 2 ? search.data ?? [] : []).map((r) => ({ kind: 'record', label: r.title, sub: `${TYPE[r.type]?.label}${r.subtitle ? ` · ${r.subtitle}` : ''}`, icon: TYPE[r.type]?.icon ?? FileText, to: TYPE[r.type]?.to(r.id) }));
    const ask = term.length > 3 && can('ai.assistant.use') ? [{ kind: 'ask', label: `Ask the assistant: “${q.trim()}”`, sub: 'AI', icon: Sparkles }] : [];
    return [...records, ...(term ? pages.slice(0, 5) : pages.slice(0, 8)), ...creates.slice(0, term ? 3 : 4), ...ask];
  }, [q, search.data, can]);

  useEffect(() => setActive(0), [items.length, debounced]);

  if (!open) return null;

  const go = (it) => {
    onClose();
    if (it.kind === 'ask') {
      sessionStorage.setItem('ct-assistant-draft', q.trim());
      onAssistant();
    } else navigate(it.to);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-slate-950/40 animate-in" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Search" data-overlay className="relative w-full max-w-xl card shadow-[var(--shadow-pop)] overflow-hidden animate-pop">
        <div className="flex items-center gap-3 px-4 h-13 border-b border-line">
          <Search className="size-[18px] text-faint" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search parts, document numbers, companies, pages…"
            className="flex-1 h-12 bg-transparent outline-none text-[15px]"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, items.length - 1)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
              if (e.key === 'Enter' && items[active]) (e.preventDefault(), go(items[active]));
              if (e.key === 'Escape') onClose();
            }}
          />
          {search.isFetching && <Loader2 className="size-4 animate-spin text-faint" />}
          <span className="kbd">Esc</span>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{search.isFetching ? 'Searching…' : 'No results'}</p>
          ) : (
            items.map((it, i) => (
              <button
                key={`${it.kind}-${it.label}-${i}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it)}
                className={cn('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left', i === active && 'bg-brand-50 dark:bg-brand-500/10')}
              >
                <span className={cn('grid place-items-center size-8 rounded-lg shrink-0', i === active ? 'bg-brand-600 text-white' : 'bg-surface-3 text-muted')}>
                  <it.icon className="size-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-medium truncate">{it.label}</span>
                  <span className="block text-xs text-muted truncate">{it.sub}</span>
                </span>
                {i === active && <CornerDownLeft className="size-4 text-faint" />}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-t border-line bg-surface-2 text-[11px] text-faint">
          <span className="flex items-center gap-1"><span className="kbd">↑</span><span className="kbd">↓</span> move</span>
          <span className="flex items-center gap-1"><span className="kbd">Enter</span> open</span>
          <span className="flex items-center gap-1 ml-auto"><span className="kbd">Ctrl</span><span className="kbd">J</span> assistant</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
