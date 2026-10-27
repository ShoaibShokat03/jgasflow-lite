/**
 * Printing for every kind of shop printer:
 * - receipts (sale, payment, purchase) on 58mm or 80mm thermal rolls, or on A5 / A4 / Letter paper;
 * - documents (statements, reports) on A4, A5 or Letter.
 * Settings are kept per computer, because each counter has its own printer.
 */
const KEY = 'jgf-print';

export const RECEIPT_PAPERS = [
  { value: '58', label: '58 mm roll', sub: 'Small thermal printer', mm: 48, page: '58mm auto', margin: '2mm 3mm' },
  { value: '80', label: '80 mm roll', sub: 'Standard thermal printer', mm: 72, page: '80mm auto', margin: '3mm 4mm' },
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
  let css;
  if (kind === 'receipt') {
    const p = RECEIPT_PAPERS.find((x) => x.value === s.receipt) ?? RECEIPT_PAPERS[1];
    const roll = p.value === '58' || p.value === '80';
    // Small rolls get slightly smaller type; the width is set before zoom so the slip still fills the roll.
    const z = Math.round(f.zoom * (p.value === '58' ? 0.85 : roll ? 0.95 : 1) * 100) / 100;
    css = `@page { size: ${p.page}; margin: ${p.margin}; }
      #jgf-print-root .print-area { width: ${Math.floor((p.mm / z) * 10) / 10}mm !important; max-width: none !important; margin: 0 ${roll ? '0' : 'auto'} !important; padding: ${roll ? '0' : '4mm 0'} !important; zoom: ${z}; color: #000 !important; }
      #jgf-print-root .print-area .text-muted { color: #222 !important; }
      #jgf-print-root .print-area [class*="border-dashed"] { border-color: #000 !important; }
      #jgf-print-root .print-area .print-logo { display: ${s.logo ? 'flex' : 'none'} !important; }
      ${roll ? '#jgf-print-root .shop-logo { filter: grayscale(1) contrast(1.15); }' : ''}`;
  } else {
    const p = DOC_PAPERS.find((x) => x.value === s.doc) ?? DOC_PAPERS[0];
    css = `@page { size: ${p.page}; margin: 10mm; } #jgf-print-root .print-area { zoom: ${f.zoom}; }`;
  }
  let el = document.getElementById('jgf-print-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'jgf-print-style';
    document.head.appendChild(el);
  }
  el.textContent = `@media print { ${css} }`;

  // The areas to print: outermost ones only, in page order.
  const areas = [...document.querySelectorAll('.print-area')].filter((a) => !a.parentElement?.closest('.print-area'));
  document.getElementById('jgf-print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'jgf-print-root';
  root.className = kind === 'receipt' ? 'is-receipt' : 'is-doc';
  for (const a of areas) root.appendChild(a.cloneNode(true));
  document.body.appendChild(root);
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
  const run = () => {
    // Extra copies are separate print jobs (browsers have no copies option for scripts).
    for (let i = 0; i < copies; i++) window.print();
    setTimeout(() => document.body.contains(root) && left <= 0 && cleanup(), 0);
  };
  // Wait for the copied pictures (the shop logo) to be ready, so they are on the paper.
  const imgs = [...root.querySelectorAll('img')];
  if (!imgs.length) return run();
  Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => undefined) : undefined))).then(run);
}
