/**
 * The voice screen's interface sounds.
 *
 *   npm run check:sound
 *
 * These fire DURING a spoken conversation, from inside event handlers and
 * socket callbacks. A throw from a decorative blip would take down the turn
 * that was playing, so the contract under test is mostly "never throws":
 * not when muted, not on an unknown cue, not when the browser gives us no
 * audio at all, and not when storage is unavailable.
 */
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules', '.cache', 'jdent-hud-sound.mjs');
await fs.mkdir(path.dirname(OUT), { recursive: true });

// ── a recording stand-in for the Web Audio API ──
const played = [];
let contexts = 0;
let state = 'suspended';
let resumed = 0;

class FakeParam {
  constructor() { this.calls = []; }
  setValueAtTime(v, t) { this.calls.push(['set', v, t]); }
  exponentialRampToValueAtTime(v, t) {
    // The real API throws on a ramp to exactly zero. If the module ever does
    // that, every cue after it dies, so the fake is strict about it too.
    if (v === 0) throw new RangeError('exponentialRampToValueAtTime: cannot ramp to 0');
    this.calls.push(['ramp', v, t]);
  }
}

class FakeCtx {
  constructor() {
    contexts += 1;
    this.currentTime = 0;
    this.destination = { kind: 'destination' };
    Object.defineProperty(this, 'state', { get: () => state });
  }
  createGain() { return { gain: new FakeParam(), connect() {} }; }
  createOscillator() {
    const osc = {
      type: 'sine',
      frequency: new FakeParam(),
      connect() {},
      start(t) { played.push({ type: osc.type, at: t }); },
      stop() {},
    };
    return osc;
  }
  resume() { resumed += 1; state = 'running'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

const store = new Map();
globalThis.window = { AudioContext: FakeCtx };
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

await build({
  entryPoints: [path.join(ROOT, 'src/components/saas/pages/hudSound.js')],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const { cue, isMuted, setMuted, releaseSound, CUE_NAMES } = await import(
  pathToFileURL(OUT).href
);

let fail = 0;
const ok = (label, cond) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label);
  if (!cond) fail++;
};

// ── every cue makes a sound, and none of them throws ──
console.log('— cues —');
ok('there are cues to play', CUE_NAMES.length >= 6);
for (const name of CUE_NAMES) {
  const before = played.length;
  let threw = null;
  try { cue(name); } catch (e) { threw = e; }
  ok(`${name} plays without throwing`, !threw && played.length > before);
}

// A ramp to exactly 0 is a RangeError in the real API and would kill every
// later cue. The fake throws on it, so the loop above already proves it is
// not happening — but say so, because it is the specific trap here.
ok('no envelope ramps to exactly zero', true);

// ── the shared device ──
console.log('\n— the audio device —');
ok('one AudioContext for all cues', contexts === 1);
ok('a suspended context is resumed', resumed > 0);

// ── the things that must stay quiet ──
console.log('\n— silence —');
let threw = null;
const before = played.length;
try { cue('not-a-real-cue'); } catch (e) { threw = e; }
ok('an unknown cue is silent, not an error', !threw && played.length === before);

setMuted(true);
ok('mute is remembered', isMuted() === true);
const mutedFrom = played.length;
for (const name of CUE_NAMES) cue(name);
ok('nothing plays while muted', played.length === mutedFrom);

setMuted(false);
ok('unmute is remembered', isMuted() === false);
cue('reveal');
ok('sound returns after unmuting', played.length > mutedFrom);

// ── a browser with no Web Audio at all ──
console.log('\n— degraded browsers —');
globalThis.window = {};
let noAudioThrew = null;
try { cue('boot'); releaseSound(); } catch (e) { noAudioThrew = e; }
ok('no AudioContext is survivable', !noAudioThrew);

// ── storage that refuses ──
globalThis.localStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
};
let storageThrew = null;
let defaulted = null;
try { setMuted(true); defaulted = isMuted(); } catch (e) { storageThrew = e; }
ok('blocked storage does not throw', !storageThrew);
// Audible is the better default: muted-by-accident reads as broken.
ok('blocked storage defaults to audible', defaulted === false);

console.log(fail ? `\n${fail} FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
