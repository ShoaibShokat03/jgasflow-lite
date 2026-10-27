/**
 * Printing for every kind of shop printer:
 * - receipts (sale, payment, purchase) on 58mm or 80mm thermal rolls, or on A5 / A4 / Letter paper;
 * - documents (statements, reports) on A4, A5 or Letter.
 * Settings are kept per computer, because each counter has its own printer.
 */
const KEY = 'jgf-print';

export const RECEIPT_PAPERS = [
  { value: '58', label: '58 mm roll', sub: 'Small thermal printer', width: '48mm', page: '58mm auto', margin: '3mm' },
  { value: '80', label: '80 mm roll', sub: 'Standard thermal printer', width: '72mm', page: '80mm auto', margin: '4mm' },
  { value: 'a5', label: 'A5 paper', sub: 'Half page, laser or inkjet', width: '128mm', page: 'A5 portrait', margin: '10mm' },
  { value: 'a4', label: 'A4 paper', sub: 'Full page, laser or inkjet', width: '150mm', page: 'A4 portrait', margin: '12mm' },
  { value: 'letter', label: 'Letter paper', sub: '8.5 x 11 inch', width: '150mm', page: 'letter portrait', margin: '12mm' },
];

export const DOC_PAPERS = [
  { value: 'a4', label: 'A4', page: 'A4 portrait' },
  { value: 'a5', label: 'A5', page: 'A5 portrait' },
  { value: 'letter', label: 'Letter', page: 'letter portrait' },
];

export const FONT_SIZES = [
  { value: 'small', label: 'Small', px: 11 },
  { value: 'normal', label: 'Normal', px: 12.5 },
  { value: 'large', label: 'Large', px: 14 },
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

/** Print the current page's .print-area as a receipt or a document. */
export function printNow(kind = 'receipt') {
  const s = getPrintSettings();
  const font = FONT_SIZES.find((f) => f.value === s.font)?.px ?? 12.5;
  let css;
  if (kind === 'receipt') {
    const p = RECEIPT_PAPERS.find((x) => x.value === s.receipt) ?? RECEIPT_PAPERS[1];
    const roll = p.value === '58' || p.value === '80';
    css = `@page { size: ${p.page}; margin: ${p.margin}; }
      .print-area { width: ${p.width} !important; max-width: ${p.width} !important; ${roll ? 'padding: 0 !important;' : 'padding: 4mm !important; left: 50% !important; transform: translateX(-50%);'} font-size: ${p.value === '58' ? font - 1.5 : font}px !important; }
      .print-area .print-logo { display: ${s.logo ? 'flex' : 'none'} !important; }`;
  } else {
    const p = DOC_PAPERS.find((x) => x.value === s.doc) ?? DOC_PAPERS[0];
    css = `@page { size: ${p.page}; margin: 10mm; } .print-area { font-size: ${font}px !important; }`;
  }
  let el = document.getElementById('jgf-print-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'jgf-print-style';
    document.head.appendChild(el);
  }
  el.textContent = `@media print { ${css} }`;
  const copies = Math.min(Math.max(Number(s.copies) || 1, 1), 3);
  // Extra copies are separate print jobs (browsers have no copies option for scripts).
  window.print();
  for (let i = 1; i < copies; i++) window.print();
}
