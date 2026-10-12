import { useState } from 'react';
import { Cylinder, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { money, num0 } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, cn, Empty, IconBox, PageHeader, Tag } from '@/ui/kit';
import { toast, useConfirm } from '@/ui/overlay';
import { TypeForm } from './Stock';

/** Cylinder sizes: add, edit prices and security, hide or delete. */
export default function CylinderTypes() {
  const q = useGet('/types', { all: 1 });
  const [form, setForm] = useState(null);
  const confirm = useConfirm();
  const del = useAct((uid) => api.delete(`/types/${uid}`), {
    onSuccess: (r) => toast(r.deleted ? t('deleted') : t('type_hidden_web')),
    onError: (e) => toast(e.message, 'error'),
  });
  const save = useAct(({ ty, active }) => api.put(`/types/${ty.uid}`, { ...ty, active }), {
    onSuccess: () => toast(t('saved')),
    onError: (e) => toast(e.message, 'error'),
  });
  const remove = async (ty) => {
    const msg = `${t('delete_type_msg')}\n\n${t('delete_type_stock')} ${ty.full_qty} ${t('full')}, ${ty.empty_qty} ${t('empty')}\n${t('delete_type_used_web')}`;
    if (await confirm({ title: `${t('delete')} ${ty.name}?`, message: msg, okLabel: t('delete'), danger: true })) del.mutate(ty.uid);
  };

  return (
    <div>
      <PageHeader title={t('manage_cylinder_types')} sub={t('manage_cylinder_types_sub')} actions={<Button icon={Plus} onClick={() => setForm('new')}>{t('add_cylinder_type')}</Button>} />
      <Async q={q}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <Empty icon={Cylinder} title={t('nothing_found')} action={<Button icon={Plus} onClick={() => setForm('new')}>{t('add_cylinder_type')}</Button>} />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px] min-w-[760px]">
                  <thead>
                    <tr className="bg-bg text-muted text-[12px] text-left">
                      <th className="font-semibold px-4 py-3">{t('cylinder_type')}</th>
                      <th className="font-semibold px-2 text-right">{t('sale_price')}</th>
                      <th className="font-semibold px-2 text-right">{t('wholesale')}</th>
                      <th className="font-semibold px-2 text-right">{t('pk_purchase')}</th>
                      <th className="font-semibold px-2 text-right">{t('security')}</th>
                      <th className="font-semibold px-2 text-right">{t('full')}</th>
                      <th className="font-semibold px-2 text-right">{t('min_level')}</th>
                      <th className="font-semibold px-4 text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((ty) => (
                      <tr key={ty.uid} className={cn('border-t border-line', !ty.active && 'bg-bg/60')}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <IconBox icon={Cylinder} color={ty.active ? '#020033' : '#5F6279'} />
                            <div>
                              <div className="font-bold">{ty.name}</div>
                              <div className="text-[12px] text-muted">{num0(ty.kg)} kg</div>
                            </div>
                            {!ty.active && <Tag tone="gray">{t('inactive')}</Tag>}
                          </div>
                        </td>
                        <td className="px-2 text-right num font-bold text-accent-dark">{money(ty.price)}</td>
                        <td className="px-2 text-right num">{money(ty.wholesale_price)}</td>
                        <td className="px-2 text-right num">{money(ty.purchase_price)}</td>
                        <td className="px-2 text-right num">{money(ty.deposit)}</td>
                        <td className="px-2 text-right num font-semibold">{num0(ty.full_qty)}</td>
                        <td className="px-2 text-right num">{ty.low_level}</td>
                        <td className="px-4">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="soft" icon={Pencil} onClick={() => setForm(ty)}>
                              {t('edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              icon={EyeOff}
                              title={ty.active ? t('hide') : t('active')}
                              aria-label={ty.active ? t('hide') : t('active')}
                              className={ty.active ? '' : '!text-good'}
                              onClick={() => save.mutate({ ty, active: !ty.active })}
                            />
                            <Button size="sm" variant="danger-outline" icon={Trash2} title={t('delete')} aria-label={t('delete')} onClick={() => remove(ty)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 text-[12.5px] text-muted bg-bg/60">{t('active_help')}. {t('price_change_logged')}</div>
            </Card>
          )
        }
      </Async>
      <TypeForm open={!!form} initial={form === 'new' ? null : form} onClose={() => setForm(null)} />
    </div>
  );
}
