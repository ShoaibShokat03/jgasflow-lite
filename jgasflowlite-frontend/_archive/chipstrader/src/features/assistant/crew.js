import { BrainCircuit, Handshake, Landmark, Orbit, PackageSearch, Sparkles, Warehouse } from 'lucide-react';

/** lucide icons named by the server roster. */
export const ICONS = { Orbit, Handshake, PackageSearch, Warehouse, Landmark, BrainCircuit };
export const iconFor = (name) => ICONS[name] ?? Sparkles;

/** Used until /assistant/crew answers, so the console paints instantly. */
export const FALLBACK_CREW = [
  { key: 'nova', name: 'Nova', role: 'Command', accent: '#22d3ee', icon: 'Orbit', focus: 'Coordinator', suggestions: [], tools: [] },
  { key: 'vega', name: 'Vega', role: 'Sales', accent: '#a78bfa', icon: 'Handshake', focus: 'Sales', suggestions: [], tools: [] },
  { key: 'orion', name: 'Orion', role: 'Procurement', accent: '#34d399', icon: 'PackageSearch', focus: 'Procurement', suggestions: [], tools: [] },
  { key: 'atlas', name: 'Atlas', role: 'Warehouse', accent: '#fbbf24', icon: 'Warehouse', focus: 'Warehouse', suggestions: [], tools: [] },
  { key: 'lyra', name: 'Lyra', role: 'Finance', accent: '#fb7185', icon: 'Landmark', focus: 'Finance', suggestions: [], tools: [] },
  { key: 'sigma', name: 'Sigma', role: 'Analytics', accent: '#60a5fa', icon: 'BrainCircuit', focus: 'Analytics', suggestions: [], tools: [] },
];

export const ROUTE_LABEL = { auto: 'Auto-routed', pinned: 'Pinned', continue: 'Follow-up', mention: 'Addressed', voice: 'Voice' };

/** Document numbers in answers become links to the matching list, pre-searched. */
const DOC_ROUTES = {
  REQ: '/requirements', QUO: '/quotes', SO: '/sales-orders', OFR: '/offers', PO: '/purchase-orders',
  INV: '/invoices', SHP: '/shipments', RCP: '/receipts', ALC: '/allocations', STK: '/stock',
};
export const DOC_REF = /\b(REQ|QUO|SO|OFR|PO|INV|SHP|RCP|ALC|STK)-\d{4}-\d{2,}\b/g;
export const docHref = (no) => {
  const prefix = no.split('-')[0];
  const base = DOC_ROUTES[prefix];
  if (!base) return null;
  return prefix === 'STK' ? `${base}?pn=${encodeURIComponent(no)}` : `${base}?search=${encodeURIComponent(no)}`;
};

export const fmtMs = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);
