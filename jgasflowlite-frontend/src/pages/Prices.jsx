import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUp, Check, History, Tag as TagIcon, Users } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { priceColumns, priceHistoryColumns, specialPriceColumns } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { fDate, lossPerCylinder, MAX_UNIT_PRICE, money, numInput, parseNum } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, Empty, IconBox, Initials, PageHeader, Tag } from '@/ui/kit';
import { Chips, MoneyInput, TextInput } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';

export default function Prices() {
  const [tab, setTab] = useState('current');
  return (
    <div>
      <PageHeader title={t('prices')} />
      <Chips
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'current', label: t('current'), icon: TagIcon },
          { value: 'history', label: t('history'), icon: History },
          { value: 'special', label: t('customer_prices'), icon: Users },
        ]}
      />
      {tab === 'current' && <Current />}
      {tab === 'history' && <PriceHistory />}
      {tab === 'special' && <Special />}
    </div>
  );
}

function Current() {
  const types = useGet('/types');
  const [edit, setEdit] = useState(null);
  return (
    <Async q={types}>
      {(list) => (
        <>
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <p className="text-[13px] text-muted flex-1 min-w-[200px]">{t('tap_to_update_price')}</p>
            <ExportMenu title={t('x_prices')} columns={priceColumns} rows={list} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {list.map((ty) => (
              <Card key={ty.uid} as="button" onClick={() => setEdit(ty)} className="p-4 text-left hover:border-[#cfd2e6] transition">
                <div className="flex items-center gap-3">
                  <IconBox icon={TagIcon} color="#F26B1D" />
                  <div className="font-bold text-[15px] flex-1">{ty.name}</div>
                  <span className="text-[12.5px] font-bold text-primary inline-flex items-center gap-1 whitespace-nowrap">
                    {t('update_price')} <ArrowRight className="size-3.5" />
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <PriceBox label={t('pk_sale')} value={ty.price} strong />
                  <PriceBox label={t('wholesale')} value={ty.wholesale_price} />
                  <PriceBox label={t('pk_purchase')} value={ty.purchase_price} />
                </div>
                {ty.price > 0 && ty.purchase_price > 0 && (
                  <div className="mt-2 text-[12px] text-muted">
                    {t('margin')}: <b className={ty.price - ty.purchase_price < 0 ? 'text-bad' : 'text-good'}>{money(ty.price - ty.purchase_price)}</b> / {t('cyl')}
                    {ty.price - ty.purchase_price < 0 && <span className="ml-1.5 font-bold text-bad">{t('selling_at_loss')}</span>}
                  </div>
                )}
              </Card>
            ))}
          </div>
          <UpdatePrice type={edit} onClose={() => setEdit(null)} />
        </>
      )}
    </Async>
  );
}

function PriceBox({ label, value, strong }) {
  return (
    <div className="rounded-[var(--radius-ctl)] bg-bg px-2.5 py-2 min-w-0">
      <div className="text-[11px] text-muted truncate">{label}</div>
      <div className={`num truncate ${strong ? 'font-extrabold text-accent-dark' : 'font-bold'}`}>{money(value)}</div>
    </div>
  );
}

function UpdatePrice({ type, onClose }) {
  const confirm = useConfirm();
  const [f, setF] = useState({ sale: '', wholesale: '', purchase: '', note: '' });
  useEffect(() => {
    if (type) setF({ sale: numInput(type.price), wholesale: numInput(type.wholesale_price), purchase: numInput(type.purchase_price), note: '' });
  }, [type]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = useAct((b) => api.post(`/types/${type.uid}/prices`, b), {
    onSuccess: () => {
      toast(t('price_updated'));
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const submit = async () => {
    const sale = parseNum(f.sale);
    const wholesale = parseNum(f.wholesale);
    const purchase = parseNum(f.purchase);
    if ([sale, wholesale, purchase].some((v) => v > MAX_UNIT_PRICE)) return toast(t('price_too_big', { max: money(MAX_UNIT_PRICE) }), 'error');
    // Selling below cost is allowed, but never by accident.
    const loss = Math.max(lossPerCylinder(sale, purchase), lossPerCylinder(wholesale, purchase));
    if (loss > 0 && !(await confirm({ title: t('loss_title'), message: t('loss_msg', { loss: money(loss) }), okLabel: t('save_anyway'), danger: true }))) return;
    save.mutate({ sale, wholesale, purchase, note: f.note });
  };
  const live = Math.max(lossPerCylinder(parseNum(f.sale), parseNum(f.purchase)), lossPerCylinder(parseNum(f.wholesale), parseNum(f.purchase)));
  return (
    <Modal
      open={!!type}
      onClose={onClose}
      title={`${t('update_price')} · ${type?.name ?? ''}`}
      icon={TagIcon}
      iconColor="#F26B1D"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button icon={Check} loading={save.isPending} onClick={submit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <MoneyInput label={t('sale_price')} value={f.sale} onChange={set('sale')} autoFocus />
        <MoneyInput label={t('wholesale_price')} value={f.wholesale} onChange={set('wholesale')} />
        <MoneyInput label={t('purchase_price')} value={f.purchase} onChange={set('purchase')} />
        {live > 0 && <div className="text-[12.5px] font-semibold text-bad bg-[#fdecea] rounded-[var(--radius-ctl)] px-3 py-2">{t('loss_hint', { loss: money(live) })}</div>}
        <TextInput label={t('note')} value={f.note} onChange={set('note')} maxLength={255} placeholder={t('price_note_hint')} />
        <p className="text-[12px] text-muted">{t('price_change_logged')}</p>
      </div>
    </Modal>
  );
}

function PriceHistory() {
  const types = useGet('/types', { all: 1 });
  const [type, setType] = useState('');
  const list = useGet('/prices/history', { type });
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <Chips size="sm" value={type} onChange={setType} options={[{ value: '', label: t('all') }, ...(types.data ?? []).map((x) => ({ value: x.uid, label: x.name }))]} />
        <ExportMenu className="ml-auto" title={t('x_price_history')} columns={priceHistoryColumns} rows={list.data} all={() => api.get('/prices/history', { params: { limit: 50000 } })} />
      </div>
      <Async q={list}>
        {(rows) => (
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty icon={History} title={t('no_price_changes')} />
            ) : (
              <div className="divide-rows">
                {rows.map((h) => {
                  const up = h.price > h.old_price;
                  return (
                    <div key={h.uid} className="flex items-center gap-3 px-4 py-3">
                      <div className={`grid place-items-center size-9 rounded-[var(--radius-xs)] ${h.note === 'opening' ? 'bg-soft text-primary' : up ? 'bg-[#fdecea] text-bad' : 'bg-[#e8f5e9] text-good'}`}>
                        {h.note === 'opening' ? <TagIcon className="size-4" /> : up ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">
                          {h.type_name} · {t(`pk_${h.kind}`)}
                        </div>
                        <div className="text-[12px] text-muted truncate">
                          {fDate(h.date)}
                          {h.note && h.note !== 'opening' ? ` · ${h.note}` : ''}
                        </div>
                      </div>
                      <div className="text-right num whitespace-nowrap">
                        {h.old_price > 0 && <div className="text-[12px] text-muted line-through">{money(h.old_price)}</div>}
                        <div className="font-bold">{money(h.price)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </Async>
    </>
  );
}

function Special() {
  const list = useGet('/prices/customers');
  const navigate = useNavigate();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <p className="text-[13px] text-muted flex-1 min-w-[200px]">{t('customer_prices_help')}</p>
        <ExportMenu title={t('x_special_prices')} columns={specialPriceColumns} rows={list.data} />
      </div>
      <Async q={list}>
        {(rows) => (
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty icon={Users} title={t('no_customer_prices')} sub={t('special_how')} />
            ) : (
              <div className="divide-rows">
                {rows.map((r) => (
                  <button key={r.customer_uid + r.type_uid} type="button" className="row-link w-full text-left" onClick={() => navigate(`/app/customers/${r.customer_uid}`)}>
                    <Initials name={r.customer_name} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{r.customer_name}</div>
                      <div className="text-[12px] text-muted">
                        {r.type_name} · {t('default')} {money(r.default_price)}
                      </div>
                    </div>
                    <Tag tone="orange">{money(r.price)}</Tag>
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}
      </Async>
    </>
  );
}
