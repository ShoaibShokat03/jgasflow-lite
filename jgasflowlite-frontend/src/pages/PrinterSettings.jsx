import { useState } from 'react';
import { Printer } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fDateTime, money, toDb } from '@/lib/format';
import { DOC_PAPERS, FONT_SIZES, getPrintSettings, printNow, RECEIPT_PAPERS, setPrintSettings } from '@/lib/print';
import { t } from '@/lib/i18n';
import { Button, Card, IconBox } from '@/ui/kit';
import { Chips, Dropdown, Switch } from '@/ui/form';
import { toast } from '@/ui/overlay';
import { Dashed, Line, Paper, ShopFoot, ShopHead } from '@/ui/receipt';

/** Paper and print options for this computer's printer, with a test print. */
export function PrinterSettings() {
  const [s, setS] = useState(getPrintSettings);
  const { shop } = useAuth();
  const set = (k) => (v) => {
    const next = { ...s, [k]: v };
    setS(next);
    setPrintSettings(next);
    toast(t('saved'));
  };
  return (
    <Card id="printer" className="p-4 space-y-4 scroll-mt-24 h-full">
      <div className="flex items-center gap-3">
        <IconBox icon={Printer} color="#1565C0" size={40} />
        <div>
          <div className="font-bold">{t('printer_settings')}</div>
          <div className="text-[12.5px] text-muted">{t('printer_settings_sub')}</div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Dropdown label={t('receipt_paper')} value={s.receipt} onChange={set('receipt')} options={RECEIPT_PAPERS.map((p) => ({ value: p.value, label: p.label, sub: p.sub }))} />
        <Dropdown label={t('document_paper')} value={s.doc} onChange={set('doc')} options={DOC_PAPERS.map((p) => ({ value: p.value, label: p.label, sub: t('document_paper_sub') }))} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <div className="label">{t('print_text_size')}</div>
          <Chips className="!grid grid-cols-3" value={s.font} onChange={set('font')} options={FONT_SIZES.map((f) => ({ value: f.value, label: f.label }))} />
        </div>
        <div>
          <div className="label">{t('print_copies')}</div>
          <Chips className="!grid grid-cols-3" value={s.copies} onChange={set('copies')} options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
        </div>
      </div>
      <Switch checked={s.logo} onChange={set('logo')} label={t('print_logo')} sub={t('print_logo_sub')} />
      <div className="rounded-[var(--radius-ctl)] bg-bg px-3 py-2.5 text-[12.5px] text-muted whitespace-pre-line">{t('printer_tips')}</div>
      <Button data-shortcut="print" variant="outline" icon={Printer} onClick={() => printNow('receipt')}>
        {t('test_print')}
      </Button>

      {/* the test page (only on paper) */}
      <div className="hidden">
        <Paper>
          <ShopHead title={t('test_print')} />
          <div className="mt-3">
            <Line l={t('date')} r={fDateTime(toDb())} />
            <Line l={t('receipt_paper')} r={RECEIPT_PAPERS.find((p) => p.value === s.receipt)?.label} />
          </div>
          <Dashed />
          <Line l="11.8 kg x 2" r={money(6500)} />
          <Line l="45.4 kg x 1" r={money(12300)} />
          <Line l={t('total')} r={money(18800)} strong />
          <Dashed />
          <div className="text-center text-[12px]">{shop?.name}: {t('test_print_ok')}</div>
          <ShopFoot />
        </Paper>
      </div>
    </Card>
  );
}
