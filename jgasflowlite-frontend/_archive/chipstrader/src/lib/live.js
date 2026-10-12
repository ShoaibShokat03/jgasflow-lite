import { API_URL, post } from './api';

/**
 * Gemini Live voice session through our backend bridge (/ws/ai/live).
 *
 * Up:   microphone → 16 kHz mono PCM16 → base64 {type:'audio'} every ~40 ms.
 * Down: {type:'audio'} 24 kHz PCM16 chunks scheduled back to back, so speech is
 *       gapless; {type:'interrupted'} flushes the queue (the user barged in).
 * Other events (ready, said, working, turn_complete, switch, screen, close,
 * error) go to onEvent. getLevels() feeds the console's visualiser.
 */

const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(640); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0).buffer, []); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('ct-capture', Capture);`;

const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

/** wss://host/backend/ws/ai/live in production, ws://localhost:5002/ws/ai/live in dev (proxied). */
function socketUrl(path, ticket) {
  const base = API_URL.replace(/\/api$/, '');
  const origin = /^https?:/i.test(base) ? base : `${location.origin}${base}`;
  return `${origin.replace(/^http/i, 'ws')}${path}?ticket=${encodeURIComponent(ticket)}`;
}

export const liveSupported = () => !!(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode && window.WebSocket);

export class LiveSession {
  constructor({ agent, onEvent }) {
    this.agent = agent;
    this.onEvent = onEvent ?? (() => {});
    this.muted = false;
    this.closed = false;
    this.playing = new Set();
    this.nextAt = 0;
  }

  async start() {
    // Audio first: the console opens from a click, so the browser still
    // counts this as a user gesture and lets audio play.
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.inCtx = new AudioContext({ sampleRate: 16000 });
    this.outCtx = new AudioContext({ sampleRate: 24000 });
    await Promise.all([this.inCtx.resume(), this.outCtx.resume()]);

    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
    await this.inCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.inCtx.createMediaStreamSource(this.micStream);
    this.micAnalyser = this.inCtx.createAnalyser();
    this.micAnalyser.fftSize = 512;
    this.capture = new AudioWorkletNode(this.inCtx, 'ct-capture');
    src.connect(this.micAnalyser);
    src.connect(this.capture);
    this.capture.port.onmessage = (e) => {
      if (this.muted || this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ type: 'audio', data: toBase64(e.data) }));
    };

    this.outGain = this.outCtx.createGain();
    this.outAnalyser = this.outCtx.createAnalyser();
    this.outAnalyser.fftSize = 512;
    this.outGain.connect(this.outAnalyser);
    this.outAnalyser.connect(this.outCtx.destination);

    const t = await post('/assistant/live/ticket', { agent: this.agent });
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(socketUrl(t.path, t.ticket));
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('The voice link timed out.')), 12000);
      ws.onopen = () => (clearTimeout(timer), resolve());
      ws.onerror = () => (clearTimeout(timer), reject(new Error('The voice link could not be opened.')));
      ws.onclose = () => {
        if (!this.closed) this.onEvent({ type: 'disconnected' });
      };
      ws.onmessage = (m) => {
        let e;
        try {
          e = JSON.parse(m.data);
        } catch {
          return;
        }
        if (e.type === 'audio') this.play(e.data);
        else if (e.type === 'interrupted') this.flush();
        this.onEvent(e);
      };
    });
    return this;
  }

  play(b64) {
    const pcm = new Int16Array(fromBase64(b64));
    const buf = this.outCtx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const node = this.outCtx.createBufferSource();
    node.buffer = buf;
    node.connect(this.outGain);
    const at = Math.max(this.outCtx.currentTime + 0.02, this.nextAt);
    node.start(at);
    this.nextAt = at + buf.duration;
    this.playing.add(node);
    node.onended = () => this.playing.delete(node);
  }

  /** Stop speech at once (barge-in or hang-up). */
  flush() {
    this.playing.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    });
    this.playing.clear();
    this.nextAt = 0;
  }

  /** True while queued speech is still playing. */
  speaking() {
    return !!this.outCtx && this.nextAt > this.outCtx.currentTime + 0.05;
  }

  /** Remaining queued speech in seconds. */
  remaining() {
    return this.outCtx ? Math.max(0, this.nextAt - this.outCtx.currentTime) : 0;
  }

  sendText(text) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'text', text }));
  }

  setMuted(m) {
    this.muted = m;
  }

  /** 0..1 loudness of the microphone and of the agent's voice. */
  getLevels() {
    const level = (a) => {
      if (!a) return 0;
      const d = new Uint8Array(a.fftSize);
      a.getByteTimeDomainData(d);
      let s = 0;
      for (let i = 0; i < d.length; i++) s += ((d[i] - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(s / d.length) * 4);
    };
    return { mic: this.muted ? 0 : level(this.micAnalyser), out: level(this.outAnalyser) };
  }

  /** Spectrum of whichever side is louder, for the radial bars. */
  getSpectrum(bins = 48) {
    const a = this.speaking() ? this.outAnalyser : this.micAnalyser;
    if (!a) return new Array(bins).fill(0);
    const d = new Uint8Array(a.frequencyBinCount);
    a.getByteFrequencyData(d);
    const step = Math.floor(d.length / bins) || 1;
    return Array.from({ length: bins }, (_, i) => d[i * step] / 255);
  }

  async stop() {
    this.closed = true;
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'bye' }));
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.flush();
    this.micStream?.getTracks().forEach((t) => t.stop());
    await Promise.allSettled([this.inCtx?.close(), this.outCtx?.close()]);
  }
}
