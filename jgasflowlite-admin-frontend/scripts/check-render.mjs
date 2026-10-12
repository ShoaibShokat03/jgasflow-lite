/**
 * The voice screen actually renders.
 *
 *   npm run check:render
 *
 * This exists because the event model was removed and a reference to it was
 * left behind, so `emit` was an undefined identifier that threw on every
 * render - and it reached the user. It was evaluated because it sat in a
 * useCallback's DEPENDENCY ARRAY, which is why removing every `emit(` CALL
 * was not enough: a grep for the call missed the one that had no parentheses.
 *
 * It is not a build error. esbuild does not resolve identifiers and vite does
 * not lint, so the file compiles perfectly and fails the moment it renders.
 * `eslint .` would have caught it, but this project has eslint installed with
 * no config, so that script has never run.
 *
 * Rendering it once, to a string, catches that whole class for the price of
 * no new dependency: hooks run, dependency arrays are evaluated, and anything
 * the component body touches has to exist.
 *
 * WHAT IT DOES NOT CATCH, verified rather than assumed: a hook added below
 * the early return. Each case here renders a FRESH component, so the hook
 * count never changes between two renders of the same one and nothing is
 * mismatched. That bug is caught by check:thinking, which reads the file and
 * fails on any hook after `if (!open) return null`. Effects do not run under
 * renderToString either, so this proves the render, not the behaviour.
 */
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules', '.cache', 'jdent-render-check.mjs');
await fs.mkdir(path.dirname(OUT), { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'src/components/saas/pages/VoiceConversation.jsx')],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  platform: 'node',
  loader: { '.jsx': 'jsx' },
  jsx: 'automatic',
  // Everything the app resolves through vite aliases or CSS stays out: this
  // is about the component's own code, not about its asset pipeline.
  external: ['react', 'react/jsx-runtime', 'react-dom', '*.css'],
  // Resolve dependencies to their ESM builds. lucide-react's CJS entry calls
  // `require('react')`, and react is external here - so the bundle would ship
  // a dynamic require node cannot satisfy. Bundling react instead would give
  // the component a different React instance from the one the renderer uses,
  // which fails in a much more confusing way.
  mainFields: ['module', 'main'],
  conditions: ['import', 'module', 'default'],
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      /*
       * The API client is stubbed out.
       *
       * It pulls in axios, which pulls in form-data, which requires node
       * builtins through a CJS interop shim esbuild cannot satisfy in an ESM
       * bundle. Rendering touches none of it - every call is made from an
       * event handler or an effect, and neither runs here - so the whole
       * network layer is replaced with something that resolves.
       */
      name: 'stub-api',
      setup(b) {
        b.onResolve({ filter: /saasApi$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          // One line, joined: an escaped newline inside this string has
          // been eaten twice by the shell on the way into the file.
          // Every named export the screen reaches for. esbuild resolves
          // named imports statically, so a Proxy alone is not enough: each
          // name has to exist on the module.
          contents: [
            'const no = async () => { throw new Error("network in a render check"); };',
            'const api = new Proxy({}, { get: () => no });',
            'export const saasAiApi = api;',
            'export const saasApi = api;',
            'export const analyticsApi = api;',
            'export const saasCompaniesApi = api;',
            'export const saasSubscriptionsApi = api;',
            'export const saasInvoicesApi = api;',
            'export const saasPlansApi = api;',
            'export default api;',
          ].join(String.fromCharCode(10)),
          loader: 'js',
        }));
      },
    },
  ],
});

const React = (await import('react')).default;
const { renderToString } = await import('react-dom/server');
const VoiceConversation = (await import(pathToFileURL(OUT).href)).default;

let pass = 0;
const fails = [];
const ok = (what, cond, detail) => {
  if (cond) { pass++; console.log('PASS  ' + what); }
  else { fails.push(what); console.log('FAIL  ' + what); if (detail) console.log('        ' + detail); }
};

/** The real call site's props, as AssistantPage passes them. */
const PERSONAS = [
  { key: 'chief', name: 'Omar', role: 'Chief of Staff', accent: 'teal', greeting: 'Omar here.', briefing: 'b', icon: 'compass' },
  { key: 'ops', name: 'Ayesha', role: 'Clinic Health', accent: 'sky', greeting: 'Ayesha.', briefing: 'b', icon: 'activity' },
  { key: 'accounts', name: 'Bilal', role: 'Subscriptions & Billing', accent: 'amber', greeting: 'Bilal.', briefing: 'b', icon: 'receipt' },
  { key: 'growth', name: 'Sana', role: 'Traffic & Signups', accent: 'violet', greeting: 'Sana.', briefing: 'b', icon: 'trending-up' },
];

const render = (props) => {
  try {
    return { html: renderToString(React.createElement(VoiceConversation, props)), error: null };
  } catch (e) {
    return { html: null, error: e };
  }
};

const base = {
  origin: { fx: 0.82, fy: 0.93 },
  onClose: () => {},
  ask: async () => ({ answer: 'ok', used_tools: [], meta: { tokens: 1, ms: 1 }, persona: 'chief' }),
  personas: PERSONAS,
  live: false,
};

console.log('— it renders —');

const closed = render({ ...base, open: false });
ok('closed, it renders nothing', closed.error === null && closed.html === '', closed.error?.message);

// The one that matters: opening is the transition a build never performs.
const open = render({ ...base, open: true });
ok('open, it renders', open.error === null, open.error?.message);
ok('and produces markup', !!open.html && open.html.length > 500);

// A live session takes a different path through the same body.
const liveMode = render({ ...base, open: true, live: true });
ok('it renders in live mode', liveMode.error === null, liveMode.error?.message);

// Before the roster arrives, every list it maps over is empty.
const empty = render({ ...base, open: true, personas: [] });
ok('it renders before the personas arrive', empty.error === null, empty.error?.message);

// Opened by something other than the mic button, so there is no origin.
const noOrigin = render({ ...base, open: true, origin: null });
ok('it renders with no origin', noOrigin.error === null, noOrigin.error?.message);

console.log('');
console.log('— what the first render puts on screen —');
const html = open.html ?? '';
ok('every agent is there', PERSONAS.every((p) => html.includes(p.name)));
// Including the one added last; a roster that silently drops a persona
// renders perfectly well and is simply missing a colleague.
ok('the growth-strategy agent among them', html.includes('Zara'));
/*
 * The log used to read "WAITING FOR THE FIRST REPORT" - accurate, and
 * useless. It is the largest area on the screen and it is empty for the
 * first half-minute of every session, so it now says what to say instead.
 */
ok('the log teaches the interface rather than sitting empty', html.includes('TRY SAYING'));
ok('and gives an opener for the agent who decides', html.includes('What should we do to grow?'));
ok('each opener names who answers it', html.includes('ANSWERS'));

// The readout and the portrait are deliberately NOT in the first render:
// both are gated on the entrance animation being over, because a canvas and
// a column of figures rendered inside a scaling ancestor are paid for twice.
const src = await fs.readFile(
  path.join(ROOT, 'src/components/saas/pages/VoiceConversation.jsx'),
  'utf8',
);
ok('the readout waits for the entrance', src.includes('{!busy && !selectedAgent && ('));
ok('and so does the portrait', src.includes('{!busy && ('));
ok('the readout hangs under the portrait', src.includes('top: `calc(2.25rem + ${BRAIN_MARGIN * 2 + 14}px + ${brain.h}px)`'));
// These figures are read from the platform, so nothing claims otherwise.
ok('nothing is labelled simulated', !html.includes('SIMULATED'));

console.log('');
if (fails.length) { console.log(`${fails.length} FAILED`); process.exit(1); }
console.log(`all ${pass} checks passed`);
