import { useEffect, useState } from 'react';
import { Check, Languages, Store } from 'lucide-react';
import { api, useAct } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLang, setLang, t, useLang } from '@/lib/i18n';
import { Button, Card, IconBox, PageHeader } from '@/ui/kit';
import { businessNameError, Chips, personNameError, phoneError, Textarea, TextInput } from '@/ui/form';
import { toast } from '@/ui/overlay';
import { AccountPanel } from './Account';
import { PrinterSettings } from './PrinterSettings';

export default function Settings() {
  useLang();
  useEffect(() => {
    if (window.location.hash === '#printer') setTimeout(() => document.getElementById('printer')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, []);
  const auth = useAuth();
  return (
    <div>
      <PageHeader title={t('settings')} />
      <div className="grid lg:grid-cols-2 gap-4 items-stretch">
        <ShopProfile canEdit={auth.isManager} />
        <PrinterSettings />
      </div>
      <Card className="p-4 mt-4 flex flex-wrap items-center gap-3">
        <IconBox icon={Languages} color="#3B3A8F" size={40} />
        <div className="min-w-[180px] flex-1">
          <div className="font-bold">{t('language')}</div>
          <div className="text-[12.5px] text-muted">{t('language_sub')}</div>
        </div>
        <Chips
          className="!grid grid-cols-2 w-full sm:w-[280px]"
          value={getLang()}
          onChange={setLang}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ur', label: 'Roman Urdu' },
          ]}
        />
      </Card>
      <AccountPanel />
    </div>
  );
}

function ShopProfile({ canEdit }) {
  const auth = useAuth();
  const [f, setF] = useState(null);
  const [errs, setErrs] = useState({});
  useEffect(() => {
    if (auth.shop) setF({ name: auth.shop.name, owner_name: auth.shop.owner_name, phone: auth.shop.phone, address: auth.shop.address, currency: auth.shop.currency || 'Rs', receipt_note: auth.shop.receipt_note });
  }, [auth.shop]);
  const save = useAct((b) => api.put('/shop', b), {
    onSuccess: (shop) => {
      auth.setShop(shop);
      toast(t('saved'));
    },
    onError: (e) => toast(e.message, 'error'),
  });
  if (!f) return null;
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const submit = () => {
    const es = { name: businessNameError(f.name), owner_name: personNameError(f.owner_name), phone: phoneError(f.phone) };
    setErrs(es);
    if (!Object.values(es).some(Boolean)) save.mutate(f);
  };
  return (
    <Card className="p-4 space-y-3.5 h-full">
      <div className="flex items-center gap-3">
        <IconBox icon={Store} color="#020033" size={40} />
        <div>
          <div className="font-bold">{t('shop_profile')}</div>
          <div className="text-[12.5px] text-muted">{t('shop_profile_sub')}</div>
        </div>
      </div>
      <fieldset disabled={!canEdit} className="space-y-3.5">
        <TextInput label={t('shop_name')} value={f.name} onChange={set('name')} filter="business" maxLength={50} error={errs.name} />
        <TextInput label={t('owner_name')} value={f.owner_name} onChange={set('owner_name')} filter="person" maxLength={50} error={errs.owner_name} />
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <TextInput label={t('phone')} value={f.phone} onChange={set('phone')} filter="phone" error={errs.phone} />
          <TextInput label={t('currency_symbol')} value={f.currency} onChange={set('currency')} maxLength={10} />
        </div>
        <TextInput label={t('address')} value={f.address} onChange={set('address')} maxLength={255} />
        <Textarea label={t('receipt_footer')} value={f.receipt_note} onChange={set('receipt_note')} maxLength={255} />
      </fieldset>
      {canEdit && (
        <Button icon={Check} loading={save.isPending} onClick={submit}>
          {t('save')}
        </Button>
      )}
    </Card>
  );
}
