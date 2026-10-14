import { useEffect, useState } from 'react';
import { Download, Monitor, Smartphone } from 'lucide-react';
import { t } from '@/lib/i18n';
import { cn } from './kit';

/** The apps are served from lite.jgasflow.com/downloads (outside the site build). */
const HOST = typeof window !== 'undefined' && window.location.hostname.endsWith('jgasflow.com') ? '' : 'https://lite.jgasflow.com';
export const APK_URL = `${HOST}/downloads/JGasFlow.apk`;
export const WIN_URL = `${HOST}/downloads/JGasFlow-Setup.exe`;

const INFO = { android: 'latest.json', windows: 'latest-windows.json' };
const cache = {};
/** Version and size of the latest app, from downloads/latest*.json (null until known). */
export function useAppInfo(os = 'android') {
  const [info, setInfo] = useState(cache[os] ?? null);
  useEffect(() => {
    if (cache[os]) return undefined;
    let alive = true;
    fetch(`${HOST}/downloads/${INFO[os]}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) cache[os] = j;
        if (j && alive) setInfo(j);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [os]);
  return info;
}

const mb = (n) => `${(Number(n || 0) / 1048576).toFixed(0)} MB`;

/**
 * Download button for the Android app or the Windows app (`os`).
 * `tone`: light (on navy) or solid (on white). Shows the version and size when known.
 */
export function AppDownload({ os = 'android', tone = 'solid', className, full }) {
  const info = useAppInfo(os);
  const light = tone === 'light';
  const win = os === 'windows';
  const Icon = win ? Monitor : Download;
  return (
    <a
      href={win ? WIN_URL : APK_URL}
      download
      className={cn(
        'inline-flex items-center gap-2.5 rounded-[var(--radius-ctl)] px-4 h-12 font-bold whitespace-nowrap transition shrink-0',
        light ? 'bg-white text-primary hover:bg-white/90' : 'bg-primary text-white hover:bg-primary-2',
        full && 'w-full justify-center',
        className,
      )}
    >
      <Icon className="size-5 shrink-0" />
      <span className="flex flex-col leading-tight text-left">
        <span className="text-[14px]">{t(win ? 'download_win' : 'download_app')}</span>
        <span className={cn('text-[11px] font-semibold', light ? 'text-muted' : 'text-white/65')}>
          {info ? t('download_app_meta', { v: info.version, size: mb(info.size) }) : t(win ? 'download_win_sub' : 'download_app_android')}
        </span>
      </span>
    </a>
  );
}

/** Cards telling where to get the Android and Windows apps, with install help. */
export function AppDownloadCard({ className }) {
  const rows = [
    { os: 'android', icon: Smartphone, title: 'get_android_app', help: 'install_help' },
    { os: 'windows', icon: Monitor, title: 'get_win_app', help: 'install_help_win' },
  ];
  return (
    <div className={cn('card divide-y divide-line', className)}>
      {rows.map(({ os, icon: Icon, title, help }) => (
        <div key={os} className="p-4 flex flex-wrap items-center gap-4">
          <div className="grid place-items-center size-11 rounded-[var(--radius-ctl)] bg-soft text-primary shrink-0">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold">{t(title)}</div>
            <div className="text-[12.5px] text-muted">{t(help)}</div>
          </div>
          <AppDownload os={os} />
        </div>
      ))}
    </div>
  );
}
