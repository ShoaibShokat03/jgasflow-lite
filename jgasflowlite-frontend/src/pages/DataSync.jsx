import { useRef, useState } from 'react';
import { Cloud, CloudOff, Download, FileUp, MonitorSmartphone, RefreshCw, Smartphone, Upload } from 'lucide-react';
import { api, queryClient, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayKey, daysAgo, num0 } from '@/lib/format';
import { t } from '@/lib/i18n';
import { AppDownloadCard } from '@/ui/AppDownload';
import { Async, Button, Card, cn, Empty, IconBox, PageHeader, SectionHeader, Tag } from '@/ui/kit';
import { toast, useConfirm } from '@/ui/overlay';

const COUNT_KEYS = [
  ['customers', 'customers'],
  ['sales', 'sales'],
  ['payments', 'payments_count'],
  ['purchases', 'purchases'],
  ['suppliers', 'suppliers'],
  ['cylinder_types', 'cylinder_type'],
];

export default function DataSync() {
  const q = useGet('/sync/status', null, { refetchInterval: 20000 });
  const auth = useAuth();
  return (
    <div>
      <PageHeader title={t('data_sync')} sub={t('data_sync_sub')} />
      <Async q={q}>
        {(s) => (
          <>
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <IconBox icon={Cloud} color="#2E7D32" size={42} />
                  <div className="min-w-0">
                    <div className="font-bold">{t('online_data')}</div>
                    <div className="text-[12.5px] text-muted">{t('online_data_sub')}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {COUNT_KEYS.map(([k, label]) => (
                    <div key={k} className="rounded-[var(--radius-ctl)] bg-bg px-2.5 py-2 min-w-0">
                      <div className="text-[17px] font-extrabold num">{num0(s.counts[k] ?? 0)}</div>
                      <div className="text-[11.5px] text-muted truncate">{t(label)}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <ConnectPhone />
            </div>

            <SectionHeader title={t('phones_syncing')} />
            <Card className="overflow-hidden">
              {s.devices.length === 0 ? (
                <Empty icon={MonitorSmartphone} title={t('no_phones')} sub={t('no_phones_sub')} />
              ) : (
                <div className="divide-rows">
                  {s.devices.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                      <IconBox icon={Smartphone} color="#020033" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{d.device || t('phone_app')}</div>
                        <div className="text-[12px] text-muted truncate">
                          {d.user_name} · {t(`role_${d.role}`)}
                        </div>
                      </div>
                      <Tag tone={d.last_sync_at ? 'green' : 'gray'}>{d.last_sync_at ? `${t('synced')} ${daysAgo(d.last_sync_at)}` : t('not_synced')}</Tag>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <SectionHeader title={t('export_import')} />
            <div className="grid lg:grid-cols-2 gap-4">
              <ExportCard />
              {auth.isOwner && <ImportCard />}
            </div>
          </>
        )}
      </Async>
      <SectionHeader title={t('get_apps')} />
      <AppDownloadCard />
    </div>
  );
}

function ConnectPhone() {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <IconBox icon={RefreshCw} color="#1565C0" size={42} />
        <div className="min-w-0">
          <div className="font-bold">{t('connect_phone')}</div>
          <div className="text-[12.5px] text-muted">{t('connect_phone_sub')}</div>
        </div>
      </div>
      <ol className="mt-3 space-y-1.5 text-[13px] list-decimal pl-5">
        <li>{t('connect_step1')}</li>
        <li>{t('connect_step2')}</li>
        <li>{t('connect_step3')}</li>
      </ol>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="flex gap-2 rounded-[var(--radius-ctl)] border border-line p-2">
          <Cloud className="size-4 text-good shrink-0" /> {t('mode_online_short')}
        </div>
        <div className="flex gap-2 rounded-[var(--radius-ctl)] border border-line p-2">
          <CloudOff className="size-4 text-warn shrink-0" /> {t('mode_offline_short')}
        </div>
      </div>
    </Card>
  );
}

function ExportCard() {
  const { shop } = useAuth();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const data = await api.get('/sync/export');
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      const name = (shop?.name || 'shop').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      a.href = URL.createObjectURL(blob);
      a.download = `jgasflow-${name}-${dayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(t('export_done'));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-center gap-3">
        <IconBox icon={Download} color="#2E7D32" size={42} />
        <div>
          <div className="font-bold">{t('export_data')}</div>
          <div className="text-[12.5px] text-muted">{t('export_data_sub')}</div>
        </div>
      </div>
      <Button className="mt-4 self-start" variant="good" icon={Download} loading={busy} onClick={run}>
        {t('download_file')}
      </Button>
    </Card>
  );
}

function ImportCard() {
  const fileRef = useRef(null);
  const confirm = useConfirm();
  const auth = useAuth();
  const [mode, setMode] = useState('merge');
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (data?.format !== 'jgasflow-data') throw new Error();
    } catch {
      fileRef.current.value = '';
      return toast(t('invalid_backup'), 'error');
    }
    const n = Object.values(data.tables || {}).reduce((a, r) => a + r.length, 0);
    const ok = await confirm({
      title: mode === 'replace' ? t('import_replace_q') : t('import_merge_q'),
      message: `${file.name}\n${num0(n)} ${t('records')}${data.shop?.name ? ` · ${data.shop.name}` : ''}\n\n${mode === 'replace' ? t('import_replace_msg') : t('import_merge_msg')}`,
      okLabel: t('import'),
      danger: mode === 'replace',
      okIcon: Upload,
    });
    fileRef.current.value = '';
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post('/sync/import', { mode, data });
      await queryClient.invalidateQueries();
      await auth.refresh();
      toast(t('import_done', { n: num0(r.accepted) }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <IconBox icon={FileUp} color="#1565C0" size={42} />
        <div>
          <div className="font-bold">{t('import_data')}</div>
          <div className="text-[12.5px] text-muted">{t('import_data_sub')}</div>
        </div>
      </div>
      <div className="mt-3 grid sm:grid-cols-2 gap-2">
        {[
          ['merge', 'import_merge', 'import_merge_d'],
          ['replace', 'import_replace', 'import_replace_d'],
        ].map(([v, l, d]) => (
          <button key={v} type="button" onClick={() => setMode(v)} className={cn('text-left rounded-[var(--radius-ctl)] border p-3 transition', mode === v ? 'border-primary ring-1 ring-primary/30 bg-soft/50' : 'border-line hover:bg-soft/40')}>
            <div className="font-bold text-[13.5px]">{t(l)}</div>
            <div className="text-[12px] text-muted">{t(d)}</div>
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <Button className="mt-3" icon={Upload} loading={busy} onClick={() => fileRef.current?.click()}>
        {t('choose_file')}
      </Button>
    </Card>
  );
}
