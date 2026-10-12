import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, UserPlus } from 'lucide-react';
import { useGet } from '@/lib/api';
import { t } from '@/lib/i18n';
import { Async, Balance, Button, Card, Empty, Initials, PageHeader } from '@/ui/kit';
import { SearchBox } from '@/ui/form';
import { PartyForm } from './forms';

export default function Suppliers() {
  const [q, setQ] = useState('');
  const [form, setForm] = useState(false);
  const navigate = useNavigate();
  const list = useGet('/suppliers', { q });
  return (
    <div>
      <PageHeader title={t('suppliers')} actions={<Button icon={UserPlus} onClick={() => setForm(true)}>{t('add_supplier')}</Button>} />
      <SearchBox value={q} onChange={setQ} className="mb-3 sm:w-80" />
      <Async q={list}>
        {(rows) => (
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty icon={Truck} title={q ? t('nothing_found') : t('no_suppliers')} action={!q && <Button icon={UserPlus} onClick={() => setForm(true)}>{t('add_supplier')}</Button>} />
            ) : (
              <div className="divide-rows">
                {rows.map((s) => (
                  <button key={s.uid} type="button" className="row-link w-full text-left" onClick={() => navigate(`/app/suppliers/${s.uid}`)}>
                    <Initials name={s.name} tone="blue" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{s.name}</div>
                      <div className="text-[12px] text-muted truncate">{[s.phone, s.address].filter(Boolean).join(' · ')}</div>
                    </div>
                    <Balance value={s.balance} />
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}
      </Async>
      <PartyForm open={form} kind="supplier" onClose={() => setForm(false)} onSaved={(r) => navigate(`/app/suppliers/${r.uid}`)} />
    </div>
  );
}
