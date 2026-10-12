/**
 * MarkdownMessage: what it renders, and what it refuses to render.
 *
 *   npm run check:markdown
 *
 * The assistant relays text that other people typed — clinic names, notes,
 * addresses — so the escaping checks at the bottom matter as much as the
 * formatting ones. Renders the real component with react-dom/server and
 * asserts against the HTML.
 */
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

// Resolved from this file, so the check runs from anywhere.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Must live INSIDE the project: `react` is left external, so the bundle has
// to sit somewhere node can resolve node_modules from.
const OUT = path.join(ROOT, 'node_modules', '.cache', 'jdent-md-check.mjs');

await fs.mkdir(path.dirname(OUT), { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'src/components/saas/pages/MarkdownMessage.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['react'],
  outfile: OUT,
  loader: { '.jsx': 'jsx' },
  jsx: 'automatic',
  logLevel: 'silent',
});

const { default: Markdown } = await import(pathToFileURL(OUT).href);

let fail = 0;
const ok = (label, cond, detail) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label);
  if (!cond) { fail++; if (detail) console.log('        ' + detail); }
};
const html = (text) => renderToStaticMarkup(React.createElement(Markdown, { text }));

// ── the shapes Gemini actually emits ──
const bullets = html('Here are the clinics:\n\n- dr_rashid\n- MY CLINIC\n- GLOW AND SMILE');
ok('bullet list becomes <ul><li>', bullets.includes('<ul') && (bullets.match(/<li/g) || []).length === 3, bullets.slice(0, 160));
ok('text before a list stays a paragraph', bullets.includes('<p'));

const numbered = html('Steps:\n\n1. First thing\n2. Second thing\n3. Third');
ok('numbered list becomes <ol>', numbered.includes('<ol') && (numbered.match(/<li/g) || []).length === 3);
ok('ordered list is decimal', numbered.includes('list-decimal'));

const heads = html('# Overview\n## By status\n### Detail\nbody text');
ok('headings render at three levels', (heads.match(/text-\[1[345](\.5)?px\] font-(bold|semibold)/g) || []).length >= 3, heads.slice(0, 200));

const bold = html('There are **82 clinics** and *18* active, run `npm run build`.');
ok('bold renders <strong>', bold.includes('<strong'));
ok('italic renders <em>', bold.includes('<em'));
ok('inline code renders <code>', bold.includes('<code'));
ok('bold keeps its text', bold.includes('82 clinics'));

const table = html(
  'Clinic | Plan | Status\n--- | --- | ---\nMY CLINIC | Monthly | active\ndr_rashid | Yearly | suspended',
);
ok('pipe table becomes <table>', table.includes('<table'));
// `<th[ >]`, not `<th` — the latter also matches <thead>.
ok('table has three header cells', (table.match(/<th[ >]/g) || []).length === 3, table.slice(0, 200));
ok('table has a header row plus both body rows', (table.match(/<tr[ >]/g) || []).length === 3);
ok('table cells carry their values', table.includes('dr_rashid') && table.includes('suspended'));

const code = html('Run this:\n```\nSELECT * FROM companies;\n```\ndone');
ok('fenced code becomes <pre>', code.includes('<pre') && code.includes('SELECT * FROM companies;'));

const quote = html('> Storage figures are estimates.\n\nNext paragraph.');
ok('blockquote renders', quote.includes('<blockquote'));

const rule = html('Above\n\n---\n\nBelow');
ok('horizontal rule renders', rule.includes('<hr'));

const link = html('See [the docs](https://example.com/x) for more.');
ok('safe link renders an anchor', link.includes('href="https://example.com/x"'));
ok('links open in a new tab safely', link.includes('rel="noopener noreferrer"'));

// ── safety: this is a model relaying data typed by other people ──
const xss = html('Clinic name: <script>alert(1)</script> and <img src=x onerror=alert(1)>');
ok('raw HTML is escaped, not executed', !xss.includes('<script>') && xss.includes('&lt;script&gt;'), xss.slice(0, 160));
ok('an img payload is escaped too', !/<img[^>]*onerror/.test(xss));

const jsLink = html('[click me](javascript:alert(1))');
ok('javascript: link is NOT turned into an anchor', !jsLink.includes('<a '), jsLink.slice(0, 160));
ok('...but its label still shows', jsLink.includes('click me'));

const dataLink = html('[x](data:text/html;base64,PHNjcmlwdD4=)');
ok('data: link is refused too', !dataLink.includes('<a '));

// ── things that must not crash ──
ok('empty text renders nothing', html('') === '');
ok('plain text still renders', html('Just a sentence.').includes('Just a sentence.'));
ok('a stray pipe is not a table', !html('Totals | so far').includes('<table'));
ok('unterminated bold is literal', html('**oops').includes('**oops'));
ok('a lone list marker survives', html('-').length >= 0);

// ── a realistic multi-block answer ──
const real = html(
  '## Clinics over quota\n\nThree clinics are over their storage allocation:\n\n' +
  'Clinic | Used | Limit\n--- | --- | ---\nMY CLINIC | 1.2 GB | 1 GB\n\n' +
  '**Next step:** review them under Clinics → edit → Storage.\n\n' +
  '- Raise the allocation, or\n- Ask them to clear old files',
);
ok('a mixed answer renders heading + table + list + bold',
  real.includes('<table') && real.includes('<ul') && real.includes('<strong') && real.includes('Clinics over quota'));

console.log(fail ? `\n${fail} FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
