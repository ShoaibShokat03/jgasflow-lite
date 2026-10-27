import { useEffect } from 'react';
import { Banknote, Building2 } from 'lucide-react';
import { useGet } from '@/lib/api';
import { money } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Dropdown } from '@/ui/form';

/** The shop's Cash / Bank accounts for a payment (balances for owner and manager only). */
export function useMoneyChoices(enabled = true) {
  return useGet(enabled ? '/money-accounts' : null);
}

/** The cash drawer that takes cash payments, else the first account. */
export const defaultMoneyId = (list) => String((list ?? []).find((a) => a.methods?.includes('cash'))?.id ?? (list ?? []).find((a) => a.kind === 'cash')?.id ?? list?.[0]?.id ?? '');

/** Picks the default account once the list has loaded, if none is chosen yet. */
export function useDefaultMoney(list, value, setValue) {
  useEffect(() => {
    if (!value && list?.length) setValue(defaultMoneyId(list));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list?.length]);
}

/** Cash / Bank account dropdown with each account's balance. */
export function MoneySelect({ list, value, onChange, disabled, label, className }) {
  const options = (list ?? []).map((a) => ({
    value: String(a.id),
    label: a.name,
    icon: a.kind === 'cash' ? Banknote : Building2,
    sub: a.balance != null ? `${t('acc_balance')}: ${money(a.balance)}` : a.kind === 'cash' ? t('acc_kind_cash') : t('acc_kind_bank'),
  }));
  if (!options.length) options.push({ value: '', label: t('loading') });
  return <Dropdown label={label ?? t('cash_bank')} className={className} value={String(value ?? '')} onChange={onChange} disabled={disabled} options={options} />;
}
