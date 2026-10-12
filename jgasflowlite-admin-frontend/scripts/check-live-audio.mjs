/**
 * The live transport's audio maths.
 *
 *   npm run check:audio
 *
 * Resampling and PCM packing fail SILENTLY — nothing throws, the model just
 * hears noise or hears you at the wrong pitch. These are the two conversions
 * between a browser's Float32 audio and the 16-bit PCM the API expects.
 */
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules', '.cache', 'jdent-live-audio.mjs');
await fs.mkdir(path.dirname(OUT), { recursive: true });

// The module is browser-only; bundle it and stub the browser globals it reads
// at import time so it can be exercised under node.
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');
globalThis.WebSocket = class {};
globalThis.window = {};
// node 22 defines `navigator` as a getter-only global, so it has to be
// redefined rather than assigned.
Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: {} },
  configurable: true,
});

await build({
  entryPoints: [path.join(ROOT, 'src/components/saas/pages/liveSession.js')],
  bundle: true, format: 'esm', platform: 'node',
  outfile: OUT, logLevel: 'silent',
  // Exported for testing; the rest of the module is side-effect free at import.
  footer: { js: 'export { downsampleToPcm16, toBase64, fromBase64 };' },
});

const mod = await import(pathToFileURL(OUT).href);
const { downsampleToPcm16, toBase64, fromBase64 } = mod;

let fail = 0;
const ok = (label, cond, detail) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label);
  if (!cond) { fail++; if (detail !== undefined) console.log('        ' + detail); }
};

// ── resampling ──
const tone = (rate, seconds, hz) => {
  const out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
};

const src48 = tone(48000, 0.1, 440);
const at16 = downsampleToPcm16(src48, 48000, 16000);
ok('48k -> 16k gives a third of the samples', at16.length === 1600, `got ${at16.length}`);
ok('output is Int16Array', at16 instanceof Int16Array);
ok('stays inside 16-bit range',
  at16.every((v) => v >= -32768 && v <= 32767));

// A 440 Hz tone at 16 kHz should cross zero about 2 x 440 x 0.1 = 88 times.
let crossings = 0;
for (let i = 1; i < at16.length; i++) {
  if ((at16[i - 1] < 0) !== (at16[i] < 0)) crossings++;
}
ok('the tone survives at the right pitch (zero crossings 80-96)',
  crossings >= 80 && crossings <= 96, `got ${crossings}`);

const src44 = tone(44100, 0.1, 440);
ok('44.1k -> 16k also lands close to 1600',
  Math.abs(downsampleToPcm16(src44, 44100, 16000).length - 1600) <= 2);
ok('a matching rate is a straight copy',
  downsampleToPcm16(tone(16000, 0.1, 440), 16000, 16000).length === 1600);

// Clipping: anything beyond [-1,1] must saturate, not wrap around. A wrap
// turns a loud voice into a buzz.
const hot = new Float32Array([2, -2, 1, -1, 0]);
const clipped = downsampleToPcm16(hot, 16000, 16000);
ok('loud input saturates rather than wrapping',
  clipped[0] === 32767 && clipped[1] === -32768, Array.from(clipped).join(','));
ok('full scale maps to the ends',
  clipped[2] === 32767 && clipped[3] === -32768);
ok('silence maps to zero', clipped[4] === 0);

// ── base64 round trip ──
const bytes = new Uint8Array([0, 1, 127, 128, 255, 200, 33]);
ok('base64 round trips byte for byte',
  Array.from(fromBase64(toBase64(bytes))).join(',') === Array.from(bytes).join(','));
ok('high bytes survive (no UTF-8 mangling)',
  fromBase64(toBase64(new Uint8Array([0xff, 0xfe])))[0] === 0xff);

// The real path: PCM -> base64 -> back, and the samples must be identical.
const pcm = downsampleToPcm16(tone(48000, 0.02, 300), 48000, 16000);
const wire = toBase64(new Uint8Array(pcm.buffer));
const back = fromBase64(wire);
const decoded = new Int16Array(back.buffer, back.byteOffset, back.byteLength / 2);
ok('PCM survives the wire unchanged',
  decoded.length === pcm.length && decoded.every((v, i) => v === pcm[i]));

// ── playback direction: Int16 -> Float32, as the player does it ──
const asFloat = Array.from(new Int16Array([32767, -32768, 0])).map((v) => v / 32768);
ok('playback scaling stays within [-1,1]',
  asFloat.every((v) => v >= -1 && v <= 1), asFloat.join(','));

console.log(fail ? `\n${fail} FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
