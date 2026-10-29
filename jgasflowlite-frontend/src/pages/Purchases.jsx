import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackagePlus, ShoppingCart } from 'lucide-react';
import { api, useGet } from '@/lib/api';
import { purchaseColumns } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { fDateShort, money, periodRange } from '@/lib/format';
import { nBills, t } from '@/lib/i18n';
import { Async, Button, Card, Empty, Initials, PageHeader, Tag } from '@/ui/kit';
import { Chips } from '@/ui/form';
import { Summary } from './Sales';
import { PeriodFilter, usePeriod } from '@/ui/PeriodFilter';

export default function Purchases() {
  const p = usePeriod('purchases', 'month');
  const navigate = useNavigate();
  const list = useGet('/purchases', { ...p.range, limit: 50000 });
  return (
    <div>
      <PageHeader
        title={t('purchases')}
        actions={
          <>
            <ExportMenu title={t('purchases')} columns={purchaseColumns} rows={list.data} all={() => api.get('/purchases', { params: { limit: 50000 } })} />
            <Button icon={PackagePlus} to="/app/purchases/new">
              {t('new_purchase')}
            </Button>
          </>
        }
      />
      <PeriodFilter className="mb-3" p={p} />
      <Async q={list}>
        {(rows) => (
          <>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <Summary label={t('purchases')} value={money(rows.reduce((a, p) => a + p.total, 0))} sub={nBills(rows.length)} />
              <Summary label={t('payable')} value={money(rows.reduce((a, p) => a + Math.max(0, p.due), 0))} tone="red" />
            </div>
            <Card className="overflow-hidden">
              {rows.length === 0 ? (
                <Empty icon={ShoppingCart} title={t('no_purchases')} action={<Button icon={PackagePlus} to="/app/purchases/new">{t('new_purchase')}</Button>} />
              ) : (
                <div className="divide-rows">
                  {rows.map((p) => (
                    <button key={p.uid} type="button" className="row-link w-full text-left" onClick={() => navigate(`/app/purchases/${p.uid}`)}>
                      <Initials name={p.supplier_name || '-'} tone="blue" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{p.supplier_name || t('no_supplier')}</div>
                        <div className="text-[12px] text-muted truncate">
                          {p.ref} · {fDateShort(p.date)}
                          {p.items_text ? ` · ${p.items_text}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold num">{money(p.total)}</div>
                        {p.due > 0.009 ? <Tag tone="red">{money(p.due)}</Tag> : <Tag tone="green">{t('paid')}</Tag>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </Async>
    </div>
  );
}
