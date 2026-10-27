/**
 * Printing for every kind of shop printer:
 * - receipts (sale, payment, purchase) on 58mm or 80mm thermal rolls, or on A5 / A4 / Letter paper;
 * - documents (statements, reports) on A4, A5 or Letter.
 * Settings are kept per computer, because each counter has its own printer.
 */
const KEY = 'jgf-print';

export const RECEIPT_PAPERS = [
  { value: '58', label: '58 mm roll', sub: 'Small thermal printer', mm: 48, roll: 58 },
  { value: '80', label: '80 mm roll', sub: 'Standard thermal printer', mm: 72, roll: 80 },
  { value: 'a5', label: 'A5 paper', sub: 'Half page, laser or inkjet', mm: 110, page: 'A5 portrait', margin: '10mm' },
  { value: 'a4', label: 'A4 paper', sub: 'Full page, laser or inkjet', mm: 120, page: 'A4 portrait', margin: '12mm' },
  { value: 'letter', label: 'Letter paper', sub: '8.5 x 11 inch', mm: 120, page: 'letter portrait', margin: '12mm' },
];

export const DOC_PAPERS = [
  { value: 'a4', label: 'A4', page: 'A4 portrait' },
  { value: 'a5', label: 'A5', page: 'A5 portrait' },
  { value: 'letter', label: 'Letter', page: 'letter portrait' },
];

export const FONT_SIZES = [
  { value: 'small', label: 'Small', px: 11, zoom: 0.9 },
  { value: 'normal', label: 'Normal', px: 12.5, zoom: 1 },
  { value: 'large', label: 'Large', px: 14, zoom: 1.12 },
];

const DEFAULTS = { receipt: '80', doc: 'a4', font: 'normal', copies: 1, logo: true };

export function getPrintSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setPrintSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getPrintSettings(), ...s }));
  } catch {
    /* storage blocked: settings last until reload */
  }
}

/**
 * Print the page's .print-area as a receipt or a document.
 * The area is copied into its own top-level box and everything else is taken
 * out of the page while printing, so nothing else prints, no blank pages
 * follow and a thermal roll stops right after the slip.
 */
export function printNow(kind = 'receipt') {
  const s = getPrintSettings();
  const f = FONT_SIZES.find((x) => x.value === s.font) ?? FONT_SIZES[1];

  // The areas to print: outermost ones only, in page order.
  const areas = [...document.querySelectorAll('.print-area')].filter((a) => !a.parentElement?.closest('.print-area'));
  document.getElementById('jgf-print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'jgf-print-root';
  root.className = kind === 'receipt' ? 'is-receipt' : 'is-doc';
  for (const a of areas) root.appendChild(a.cloneNode(true));
  uniqueSvgIds(root);
  document.body.appendChild(root);

  const p = kind === 'receipt' ? (RECEIPT_PAPERS.find((x) => x.value === s.receipt) ?? RECEIPT_PAPERS[1]) : null;
  // Small rolls get slightly smaller type; the width is set before zoom so the slip still fills the paper.
  const z = p ? Math.round(f.zoom * (p.value === '58' ? 0.85 : p.roll ? 0.95 : 1) * 100) / 100 : f.zoom;
  const w = p ? Math.floor((p.mm / z) * 10) / 10 : 0;
  const slip = p
    ? `#jgf-print-root .print-area { width: ${w}mm !important; max-width: none !important; margin: 0 auto !important; padding: ${p.roll ? '0' : '4mm 0'} !important; zoom: ${z}; color: #000 !important; }
      #jgf-print-root .print-area .text-muted { color: #222 !important; }
      #jgf-print-root .print-area [class*="border-dashed"] { border-color: #000 !important; }
      #jgf-print-root .print-area .print-logo { display: ${s.logo ? 'flex' : 'none'} !important; }
      ${p.roll ? '#jgf-print-root .shop-logo { filter: grayscale(1) contrast(1.15); }' : ''}`
    : `#jgf-print-root .print-area { zoom: ${z}; }`;

  const start = () => {
    let page;
    if (p?.roll) {
      // A roll is one page exactly as long as the slip, so the printer stops right after it.
      const side = (p.roll - p.mm) / 2;
      const len = Math.ceil(measureMm(root, w, z, s.logo) + 8);
      page = `@page { size: ${p.roll}mm ${Math.max(len, 40)}mm; margin: 3mm ${side}mm; }`;
    } else if (p) page = `@page { size: ${p.page}; margin: ${p.margin}; }`;
    else page = `@page { size: ${(DOC_PAPERS.find((x) => x.value === s.doc) ?? DOC_PAPERS[0]).page}; margin: 10mm; }`;
    let el = document.getElementById('jgf-print-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'jgf-print-style';
      document.head.appendChild(el);
    }
    el.textContent = `@media print { ${page} ${slip} }`;
    document.body.classList.add('jgf-printing');
    const copies = Math.min(Math.max(Number(s.copies) || 1, 1), 3);
    let left = copies;
    const cleanup = () => {
      window.removeEventListener('afterprint', after);
      root.remove();
      document.body.classList.remove('jgf-printing');
    };
    const after = () => {
      left -= 1;
      if (left <= 0) cleanup();
    };
    window.addEventListener('afterprint', after);
    // Extra copies are separate print jobs (browsers have no copies option for scripts).
    for (let i = 0; i < copies; i++) window.print();
    setTimeout(() => document.body.contains(root) && left <= 0 && cleanup(), 0);
  };
  // Wait for the copied pictures (the shop logo) to be ready, so they are on the paper and measured.
  const imgs = [...root.querySelectorAll('img')];
  if (!imgs.length) return start();
  Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => undefined) : undefined))).then(start);
}

/** Height in mm of the slip laid out at its print width and zoom (measured off screen). */
function measureMm(root, widthMm, zoom, logo) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  for (const a of root.children) {
    const c = a.cloneNode(true);
    c.style.cssText = `width:${widthMm}mm;max-width:none;margin:0;padding:0;border:0;box-shadow:none;zoom:${zoom}`;
    if (!logo) c.querySelectorAll('.print-logo').forEach((x) => (x.style.display = 'none'));
    box.appendChild(c);
  }
  document.body.appendChild(box);
  const px = box.getBoundingClientRect().height;
  box.remove();
  return (px * 25.4) / 96;
}

/**
 * The copy for printing repeats ids (the JGasFlow mark's colour gradient), and
 * the originals are hidden while printing, which turns the mark black.
 * Give the copy its own ids.
 */
function uniqueSvgIds(root) {
  root.querySelectorAll('svg').forEach((svg, n) => {
    const ids = [...svg.querySelectorAll('[id]')].map((e) => e.id);
    if (!ids.length) return;
    let h = svg.innerHTML;
    for (const id of ids) h = h.split(`id="${id}"`).join(`id="${id}-p${n}"`).split(`#${id})`).join(`#${id}-p${n})`).split(`"#${id}"`).join(`"#${id}-p${n}"`);
    svg.innerHTML = h;
  });
}
