import { useEffect, useState } from 'react';
import { Check, ImagePlus, Languages, Store, Trash2 } from 'lucide-react';
import { api, queryClient, useAct } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLang, setLang, t, useLang } from '@/lib/i18n';
import { Button, Card, IconBox, PageHeader } from '@/ui/kit';
import { businessNameError, Chips, personNameError, phoneError, Textarea, TextInput } from '@/ui/form';
import { toast, useConfirm } from '@/ui/overlay';
import { PrintLogo, useShopLogo } from '@/ui/receipt';
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

/** Biggest side of the saved logo, in pixels: sharp on paper, small to load. */
const LOGO_PX = 320;

/** Read a picture file and make it a small PNG (or WebP/JPEG when the PNG is large). */
async function shrinkLogo(file) {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error(t('logo_type'));
  if (file.size > 8 * 1024 * 1024) throw new Error(t('logo_too_big'));
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error(t('logo_type')));
      i.src = url;
    });
    const k = Math.min(1, LOGO_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    let out = c.toDataURL('image/png');
    if (out.length > 250000) out = c.toDataURL('image/webp', 0.9);
    if (!out.startsWith('data:image/webp') || out.length > 250000) {
      // JPEG has no see-through parts: put the logo on white first.
      const j = document.createElement('canvas');
      j.width = w;
      j.height = h;
      const jg = j.getContext('2d');
      jg.fillStyle = '#fff';
      jg.fillRect(0, 0, w, h);
      jg.drawImage(c, 0, 0);
      if (out.length > 250000 || !out.startsWith('data:image/')) out = j.toDataURL('image/jpeg', 0.88);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Logo picker with a live preview of the top of a receipt. */
function ShopLogo({ canEdit, f }) {
  const auth = useAuth();
  const confirm = useConfirm();
  const saved = useShopLogo();
  const [busy, setBusy] = useState(false);
  const done = async (shop) => {
    auth.setShop(shop);
    await queryClient.invalidateQueries({ queryKey: ['/shop/logo'] });
  };
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const logo = await shrinkLogo(file);
      await done(await api.put('/shop/logo', { logo }));
      toast(t('logo_saved'));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: t('logo_remove_title'), message: t('logo_remove_msg'), okLabel: t('remove'), danger: true }))) return;
    setBusy(true);
    try {
      await done(await api.delete('/shop/logo'));
      toast(t('logo_removed'));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="label">{t('shop_logo')}</div>
      <div className="grid sm:grid-cols-[1fr_200px] gap-3 items-stretch">
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line p-3">
          <div className="grid place-items-center size-16 shrink-0 rounded-[var(--radius-card)] border border-line bg-bg overflow-hidden">
            {saved ? <img src={saved} alt={t('shop_logo')} className="max-h-14 max-w-14 object-contain" /> : <Store className="size-6 text-muted" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-muted">{t('shop_logo_sub')}</div>
            {canEdit && (
              <div className="flex flex-wrap gap-2 mt-2">
                <label className={busy ? 'pointer-events-none opacity-60' : ''}>
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={pick} disabled={busy} />
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer h-8 px-3 rounded-[var(--radius-ctl)] bg-soft text-primary hover:bg-[#e0e0f2] font-semibold text-[13px] [&_svg]:size-4 [&_svg]:shrink-0">
                    <ImagePlus className="size-4" /> {busy ? t('loading') : saved ? t('logo_change') : t('logo_upload')}
                  </span>
                </label>
                {saved && (
                  <Button size="sm" variant="danger-outline" icon={Trash2} disabled={busy} onClick={remove}>
                    {t('remove')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        {/* how the top of a receipt will look */}
        <div className="rounded-[var(--radius-card)] border border-dashed border-[#c7cad6] bg-white px-3 py-2.5 text-center">
          <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold mb-1">{t('logo_preview')}</div>
          <div className="flex justify-center">
            <PrintLogo src={saved} size="sm" />
          </div>
          <div className="font-black text-[13px] mt-1 truncate">{f.name || t('shop_name')}</div>
          {f.address && <div className="text-[11px] text-muted truncate">{f.address}</div>}
          {f.phone && <div className="text-[11px] text-muted truncate">{f.phone}</div>}
        </div>
      </div>
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
      <ShopLogo canEdit={canEdit} f={f} />
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
