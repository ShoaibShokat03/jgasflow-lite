import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useGet } from '@/lib/api';
import { daysAgo, fDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Card, Empty, Initials, PageHeader, Tag } from '@/ui/kit';
import { Chips, SearchBox } from '@/ui/form';

export function SubTag({ s }) {
  if (s.status === 'suspended') return <Tag tone="gray">{t('suspended')}</Tag>;
  if (s.status === 'expired') return <Tag tone="red">{t('expired')}</Tag>;
  if (s.plan === 'trial') return <Tag tone="blue">{t('free_trial')} · {s.days_left}d</Tag>;
  return <Tag tone={s.days_left <= 7 ? 'amber' : 'green'}>{s.plan_name} · {s.days_left}d</Tag>;
}

export default function AdminShops() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const list = useGet('/admin/shops', { q, status });
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title={t('admin_shops')} />
      <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
        <Chips
          value={status}
          onChange={(v) => setParams(v ? { status: v } : {})}
          options={[
            { value: '', label: t('all') },
            { value: 'active', label: t('active') },
            { value: 'trial', label: t('free_trial') },
            { value: 'expired', label: t('expired') },
            { value: 'suspended', label: t('suspended') },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder={t('admin_search_shop')} className="sm:ml-auto sm:w-80" />
      </div>
      <Async q={list}>
        {(rows) => (
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty icon={Store} title={t('nothing_found')} />
            ) : (
              <div className="divide-rows">
                {rows.map((s) => (
                  <button key={s.id} type="button" className="row-link w-full text-left" onClick={() => navigate(`/admin/shops/${s.id}`)}>
                    <Initials name={s.name} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">
                        {s.name} {s.pending > 0 && <Tag tone="amber">{t('req_pending')}</Tag>}
                      </div>
                      <div className="text-[12px] text-muted truncate">
                        {s.owner_name} · {s.phone} · {t('joined')} {fDate(s.created_at)} · {s.users} {t('users')} · {s.sales} {t('bills')}
                        {s.last_active_at ? ` · ${t('active_word')} ${daysAgo(s.last_active_at)}` : ''}
                      </div>
                    </div>
                    <SubTag s={s.subscription} />
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}
      </Async>
    </div>
  );
}
