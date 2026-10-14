// src/components/saas/attach.jsx
// Screenshots in the console: private pictures loaded with the session, and a picker for replies.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Loader2, X, ZoomIn, ImageOff } from "lucide-react";
import saasClient from "../../api/saasClient";
import { useToast } from "../common/Toast";

/** A screenshot only signed-in admins may see: fetched with the token, opens large on click. */
export const SecureImage = ({ src, size = 64 }) => {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    let made = null;
    saasClient
      .get(src, { responseType: "blob" })
      .then((r) => {
        if (!alive) return;
        made = URL.createObjectURL(r.data);
        setUrl(made);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        title="View screenshot"
        style={{ width: size, height: size }}
        className="relative shrink-0 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden bg-gray-50 dark:bg-gray-900 grid place-items-center group"
      >
        {url ? (
          <>
            <img src={url} alt="" className="w-full h-full object-cover" />
            <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/40 transition">
              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" />
            </span>
          </>
        ) : failed ? (
          <ImageOff className="w-4 h-4 text-gray-400" />
        ) : (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        )}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] grid place-items-center p-4" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/80" />
            <img src={url} alt="" className="relative max-w-[94vw] max-h-[88vh] object-contain rounded-xl" />
            <button type="button" className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

/** A row of screenshots: `count` pictures at `base/0`, `base/1`... */
export const Proofs = ({ base, count, size = 48 }) =>
  count > 0 ? (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <SecureImage key={i} src={`${base}/${i}`} size={size} />
      ))}
    </div>
  ) : null;

const MAX = 3;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Up to 3 pictures for a reply: choose or paste (Ctrl+V). */
export const ShotPicker = ({ files, onChange }) => {
  const toast = useToast();
  const input = useRef(null);
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);
  const add = (list) => {
    const picked = [...list];
    if (picked.some((f) => !TYPES.includes(f.type))) return toast.error("Use JPG, PNG or WebP pictures");
    if (picked.some((f) => f.size > 5 * 1024 * 1024)) return toast.error("Each picture must be under 5 MB");
    onChange([...files, ...picked].slice(0, MAX));
  };
  return (
    <div
      onPaste={(e) => {
        const imgs = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (imgs.length) {
          e.preventDefault();
          add(imgs);
        }
      }}
      className="flex flex-wrap items-center gap-2"
    >
      {urls.map((u, i) => (
        <div key={u} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
          <img src={u} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(files.filter((_, k) => k !== i))}
            className="absolute top-0.5 right-0.5 w-6 h-6 grid place-items-center rounded-full bg-black/70 text-white hover:bg-red-600"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {files.length < MAX && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-500 hover:text-primary-600 hover:border-primary-400 whitespace-nowrap"
        >
          <ImagePlus className="w-4 h-4" /> Add screenshot
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files ?? []);
          e.target.value = "";
        }}
      />
    </div>
  );
};
