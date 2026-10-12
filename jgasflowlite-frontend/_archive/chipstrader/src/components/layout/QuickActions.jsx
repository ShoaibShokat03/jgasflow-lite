import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ChevronDown, FileQuestion, FileText, ShoppingCart, Tags, ClipboardList, Building2, Boxes, PackageCheck, Truck, Receipt,
} from 'lucide-react';
import { useHotkey, useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/** Header quick actions: create anything, or jump to today's warehouse work. Press N to open. */
const GROUPS = [
  {
    label: 'Create',
    items: [
      { label: 'Requirement', hint: 'Customer RFQ', icon: FileQuestion, to: '/requirements?new=1', perm: ['req.create'] },
      { label: 'Quote', icon: FileText, to: '/quotes?new=1', perm: ['quote.create'] },
      { label: 'Sales order', icon: ShoppingCart, to: '/sales-orders?new=1', perm: ['so.create'] },
      { label: 'Supplier offer', icon: Tags, to: '/offers?new=1', perm: ['offer.create'] },
      { label: 'Purchase order', icon: ClipboardList, to: '/purchase-orders?new=1', perm: ['po.create'] },
      { label: 'Company', hint: 'Customer or supplier', icon: Building2, to: '/companies?new=1', perm: ['company.create', 'customer.create', 'supplier.create'] },
      { label: 'Stock entry', hint: 'Without a PO', icon: Boxes, to: '/stock?new=1', perm: ['stock.adjust'] },
    ],
  },
  {
    label: 'Work queues',
    items: [
      { label: 'Receive goods', hint: 'Open purchase orders', icon: PackageCheck, to: '/purchase-orders?status=sent,acknowledged,partial', perm: ['recv.create'] },
      { label: 'Ship orders', hint: 'Orders to fulfil', icon: Truck, to: '/sales-orders?status=confirmed,processing,partial', perm: ['shipment.create', 'alloc.manage'] },
      { label: 'Collect payments', hint: 'Unpaid invoices', icon: Receipt, to: '/invoices?unpaid=1', perm: ['inv.update'] },
    ],
  },
];

export function QuickActions() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { can } = useMe();
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can(...i.perm)) })).filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);

  useHotkey('n', () => setOpen(true), flat.length > 0);
  useEffect(() => {
    if (!open) return;
    setActive(0);
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, flat.length - 1)));
      if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
      if (e.key === 'Enter') {
        e.preventDefault();
        setActive((a) => {
          go(flat[a]);
          return a;
        });
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, flat.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!flat.length) return null;

  function go(item) {
    if (!item) return;
    setOpen(false);
    navigate(item.to);
  }

  let index = -1;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn btn-primary h-9"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Quick actions (N)"
      >
        <Plus className="size-4" />
        <span className="hidden sm:inline">New</span>
        <ChevronDown className="hidden sm:block size-3.5 opacity-90" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1.5 w-72 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-72px)] overflow-y-auto card shadow-[var(--shadow-pop)] p-1.5 animate-pop z-40">
          {groups.map((g, gi) => (
            <div key={g.label} className={cn(gi > 0 && 'mt-1.5 pt-1.5 border-t border-line')}>
              <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</p>
              {g.items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <button
                    key={item.label}
                    role="menuitem"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cn('w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left', active === i ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-surface-3')}
                  >
                    <span className={cn('grid place-items-center size-8 rounded-lg shrink-0', active === i ? 'bg-brand-600 text-white' : 'bg-surface-3 text-muted')}>
                      <item.icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-ink">{item.label}</span>
                      {item.hint && <span className="block text-xs text-muted truncate">{item.hint}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          <p className="px-2.5 pt-2 pb-1 text-[11px] text-muted border-t border-line mt-1.5">
            Press <span className="kbd">N</span> anywhere to open this menu
          </p>
        </div>
      )}
    </div>
  );
}
