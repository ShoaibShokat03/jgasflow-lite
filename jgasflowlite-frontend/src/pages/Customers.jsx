import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Cylinder, UserPlus, Users } from 'lucide-react';
import { api, useGet } from '@/lib/api';
import { customerColumns } from '@/features/exports';
import { money } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Balance, Button, Card, Empty, Initials, PageHeader, Tag } from '@/ui/kit';
import { Chips, SearchBox } from '@/ui/form';
import { ExportMenu } from '@/ui/ExportMenu';
import { PartyForm } from './forms';

export default function Customers() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const list = useGet('/customers', { q, filter });
  const formOpen = params.get('new') === '1';
  const closeForm = () => setParams({}, { replace: true });

  return (
    <div>
      <PageHeader
        title={t('customers')}
        actions={
          <>
            <ExportMenu title={t('customers')} columns={customerColumns} rows={list.data} all={() => api.get('/customers')} />
            <Button icon={UserPlus} onClick={() => setParams({ new: '1' })}>
              {t('add_customer')}
            </Button>
          </>
        }
      />
      <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('all') },
            { value: 'retail', label: t('retail') },
            { value: 'wholesale', label: t('wholesale') },
            { value: 'udhaar', label: t('udhaar') },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder={t('search_customer')} className="sm:ml-auto sm:w-80" />
      </div>
      <Async q={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <Empty icon={Users} title={q || filter !== 'all' ? t('nothing_found') : t('no_customers')} action={!q && <Button icon={UserPlus} onClick={() => setParams({ new: '1' })}>{t('add_customer')}</Button>} />
            </Card>
          ) : (
            <>
              {filter === 'udhaar' && (
                <div className="mb-3 text-[13px] text-muted">
                  {t('total_outstanding')}: <b className="text-bad">{money(rows.reduce((a, c) => a + c.balance, 0))}</b>
                </div>
              )}
              <Card className="overflow-hidden divide-rows">
                {rows.map((c) => (
                  <button key={c.uid} type="button" className="row-link w-full text-left" onClick={() => navigate(`/app/customers/${c.uid}`)}>
                    <Initials name={c.name} tone={c.type === 'wholesale' ? 'purple' : 'navy'} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{c.name}</div>
                      <div className="text-[12px] text-muted truncate">
                        {t(c.type)}
                        {c.phone ? ` · ${c.phone}` : ''}
                        {c.address ? ` · ${c.address}` : ''}
                      </div>
                    </div>
                    {c.held > 0 && (
                      <span className="hidden sm:inline">
                        <Tag tone="purple">
                          <Cylinder className="size-3" /> {c.held}
                        </Tag>
                      </span>
                    )}
                    <Balance value={c.balance} className="text-[13.5px]" />
                  </button>
                ))}
              </Card>
            </>
          )
        }
      </Async>
      <PartyForm open={formOpen} onClose={closeForm} onSaved={(res) => navigate(`/app/customers/${res.uid}`)} />
    </div>
  );
}
