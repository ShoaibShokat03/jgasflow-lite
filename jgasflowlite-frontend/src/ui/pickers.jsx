import { useEffect, useState } from 'react';
import { Footprints, UserPlus } from 'lucide-react';
import { useGet } from '@/lib/api';
import { t } from '@/lib/i18n';
import { Balance, Button, Empty, Initials, Loading } from './kit';
import { SearchBox } from './form';
import { Modal } from './overlay';

/** Pick a customer (or walk-in). onPick(customer | null). */
export function CustomerPicker({ open, onClose, onPick, allowWalkIn = true, onAddNew }) {
  const [q, setQ] = useState('');
  const list = useGet(open ? '/customers' : null, { q });
  return (
    <Modal open={open} onClose={onClose} title={t('select_customer')} size="md">
      <SearchBox value={q} onChange={setQ} placeholder={t('search_customer')} autoFocus />
      <div className="mt-3 card overflow-hidden max-h-[55vh] overflow-y-auto divide-rows">
        {allowWalkIn && !q && (
          <button type="button" className="row-link w-full text-left" onClick={() => onPick(null)}>
            <div className="grid place-items-center size-[38px] rounded-[var(--radius-ctl)] bg-[#fff0e6] text-accent-dark">
              <Footprints className="size-5" />
            </div>
            <div className="font-semibold">{t('walk_in')}</div>
          </button>
        )}
        {list.isLoading ? (
          <Loading className="py-8" />
        ) : (list.data ?? []).length === 0 ? (
          <Empty title={t('nothing_found')} className="py-6" />
        ) : (
          list.data.map((c) => (
            <button key={c.uid} type="button" className="row-link w-full text-left" onClick={() => onPick(c)}>
              <Initials name={c.name} tone={c.type === 'wholesale' ? 'purple' : 'navy'} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-[12px] text-muted truncate">
                  {t(c.type)}
                  {c.phone ? ` · ${c.phone}` : ''}
                </div>
              </div>
              <Balance value={c.balance} className="text-[13px]" />
            </button>
          ))
        )}
      </div>
      {onAddNew && (
        <Button variant="soft" icon={UserPlus} className="mt-3" full onClick={onAddNew}>
          {t('add_customer')}
        </Button>
      )}
    </Modal>
  );
}

/** Pick a supplier (or none). */
export function SupplierPicker({ open, onClose, onPick }) {
  const [q, setQ] = useState('');
  const list = useGet(open ? '/suppliers' : null, { q });
  return (
    <Modal open={open} onClose={onClose} title={t('select_supplier')}>
      <SearchBox value={q} onChange={setQ} autoFocus />
      <div className="mt-3 card overflow-hidden max-h-[55vh] overflow-y-auto divide-rows">
        {!q && (
          <button type="button" className="row-link w-full text-left" onClick={() => onPick(null)}>
            <Initials name="-" tone="gray" />
            <div className="font-semibold">{t('no_supplier')}</div>
          </button>
        )}
        {list.isLoading ? (
          <Loading className="py-8" />
        ) : (
          (list.data ?? []).map((s) => (
            <button key={s.uid} type="button" className="row-link w-full text-left" onClick={() => onPick(s)}>
              <Initials name={s.name} tone="blue" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{s.name}</div>
                <div className="text-[12px] text-muted truncate">{s.phone}</div>
              </div>
              <Balance value={s.balance} className="text-[13px]" />
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

/** Warn before closing the tab with unsaved input. */
export function useLeaveGuard(dirty) {
  useEffect(() => {
    window.onbeforeunload = dirty ? () => true : null;
    return () => {
      window.onbeforeunload = null;
    };
  }, [dirty]);
}

