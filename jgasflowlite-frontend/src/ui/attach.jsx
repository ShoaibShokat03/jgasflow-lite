import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Loader2, X, ZoomIn } from 'lucide-react';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { cn } from './kit';
import { toast } from './overlay';

export const MAX_SHOTS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Pick up to 3 screenshots: tap to choose, or paste (Ctrl+V) a screenshot.
 * `files` is an array of File; previews are made locally and never uploaded
 * until the form is sent.
 */
export function ScreenshotPicker({ files, onChange, label, hint, required, error }) {
  const input = useRef(null);
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);

  const add = (list) => {
    const picked = [...list].filter(Boolean);
    const bad = picked.find((f) => !TYPES.includes(f.type));
    if (bad) return toast(t('shot_bad_type'), 'error');
    const big = picked.find((f) => f.size > MAX_BYTES);
    if (big) return toast(t('shot_too_big'), 'error');
    const next = [...files, ...picked].slice(0, MAX_SHOTS);
    if (files.length + picked.length > MAX_SHOTS) toast(t('shot_max', { n: MAX_SHOTS }), 'info');
    onChange(next);
  };

  return (
    <div
      onPaste={(e) => {
        const imgs = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (imgs.length) {
          e.preventDefault();
          add(imgs);
        }
      }}
    >
      {label && (
        <div className="label">
          {label} {required && <span className="text-bad">*</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2.5">
        {urls.map((u, i) => (
          <div key={u} className="relative size-[88px] rounded-[var(--radius-ctl)] border border-line overflow-hidden bg-bg">
            <img src={u} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_, k) => k !== i))}
              className="absolute top-1 right-1 grid place-items-center size-7 rounded-full bg-primary-dark/80 text-white hover:bg-bad"
              aria-label={t('remove')}
              title={t('remove')}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {files.length < MAX_SHOTS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={cn(
              'size-[88px] rounded-[var(--radius-ctl)] border border-dashed grid place-items-center text-center text-[11.5px] font-semibold transition',
              error ? 'border-bad text-bad bg-[#fdecea]' : 'border-[#c9ccd8] text-muted hover:border-primary hover:text-primary bg-white',
            )}
          >
            <span className="flex flex-col items-center gap-1 px-1">
              <ImagePlus className="size-6" />
              {t('add_screenshot')}
            </span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files ?? []);
          e.target.value = '';
        }}
      />
      <div className={cn('mt-1 text-[12px]', error ? 'text-bad font-medium' : 'text-muted')}>{error || hint || t('shot_hint', { n: MAX_SHOTS })}</div>
    </div>
  );
}

/** A screenshot only the signed-in shop (or console) may see: fetched with the session, shown large on click. */
export function SecureImage({ src, className }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    let made = null;
    api
      .get(src, { responseType: 'blob' })
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        className={cn('relative size-16 rounded-[var(--radius-xs)] border border-line overflow-hidden bg-bg grid place-items-center group shrink-0', className)}
        title={t('view_screenshot')}
      >
        {url ? (
          <>
            <img src={url} alt="" className="size-full object-cover" />
            <span className="absolute inset-0 grid place-items-center bg-primary-dark/0 group-hover:bg-primary-dark/40 transition">
              <ZoomIn className="size-5 text-white opacity-0 group-hover:opacity-100" />
            </span>
          </>
        ) : failed ? (
          <X className="size-4 text-muted" />
        ) : (
          <Loader2 className="size-4 text-muted animate-spin" />
        )}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] grid place-items-center p-4" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/80" />
            <img src={url} alt="" className="relative max-w-[94vw] max-h-[88vh] object-contain rounded-xl" />
            <button type="button" className="absolute top-4 right-4 grid place-items-center size-10 rounded-full bg-white/15 text-white hover:bg-white/25" aria-label={t('close')}>
              <X className="size-5" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
