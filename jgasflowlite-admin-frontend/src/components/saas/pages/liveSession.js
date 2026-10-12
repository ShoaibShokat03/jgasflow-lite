// src/components/saas/pages/liveSession.js
//
// The browser half of the live voice transport.
//
// It connects to OUR API, never to Google. The socket carries microphone audio
// up and the model's audio down; tool calls happen server-side so they keep
// going through the guard. See live-bridge.service.ts for why that matters.
//
// TWO SAMPLE RATES, AND THEY ARE NOT THE SAME. The API wants 16 kHz PCM going
// up and sends 24 kHz PCM coming down. A browser's AudioContext runs at
// whatever the hardware likes — usually 48 kHz — so the capture side
// downsamples and the playback side is given its own context at 24 kHz rather
// than resampling every chunk.
//
// Audio is 16-bit little-endian signed PCM, mono, base64 on the wire.

/** Anything we send or receive is mono PCM16 at these rates. */
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
/** ~85 ms of audio per frame: small enough to feel live, big enough not to spam. */
const FRAME_SAMPLES = 1024 * 4;

const toBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const fromBase64 = (b64) => {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

/**
 * Float32 [-1,1] at `fromRate` → Int16 PCM at `toRate`.
 *
 * Nearest-sample picking rather than a filtered resample: at 48→16 kHz on
 * speech the difference is inaudible, and a proper filter in the audio thread
 * would cost more than it buys.
 */
function downsampleToPcm16(input, fromRate, toRate) {
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Open a live session.
 *
 * `handlers` receives: ready, said({role,text}), interrupted, turnComplete,
 * working(toolNames[]), consult({phase,to,name,question}),
 * screen({action,language}), level(0..1) for the visualiser, error(message),
 * close().
 * Returns a handle with `stop()` and `sendText()`.
 */
export async function openLiveSession({ ticket, path, apiOrigin, handlers = {} }) {
  const url =
    `${apiOrigin.replace(/^http/, "ws")}${path}?ticket=${encodeURIComponent(ticket)}`;

  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  let micStream = null;
  let captureCtx = null;
  let processor = null;
  let source = null;
  let playbackCtx = null;
  let playHead = 0;
  let stopped = false;
  const sources = new Set();

  const stopPlayback = () => {
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        /* already finished */
      }
    }
    sources.clear();
    playHead = 0;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "bye" }));
      }
      socket.close();
    } catch {
      /* already closing */
    }
    stopPlayback();
    try {
      processor?.disconnect();
      source?.disconnect();
    } catch {
      /* not connected */
    }
    // Release the microphone: the browser keeps the recording indicator in the
    // tab until every track is stopped.
    micStream?.getTracks().forEach((t) => t.stop());
    captureCtx?.close?.().catch(() => {});
    playbackCtx?.close?.().catch(() => {});
    handlers.close?.();
  };

  socket.onerror = () => {
    handlers.error?.("The live connection failed.");
    stop();
  };
  socket.onclose = () => stop();

  socket.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case "ready":
        handlers.ready?.(msg.model);
        break;

      case "audio": {
        if (!playbackCtx) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          playbackCtx = new Ctx({ sampleRate: OUTPUT_RATE });
        }
        const bytes = fromBase64(msg.data);
        const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
        const buffer = playbackCtx.createBuffer(1, samples.length, OUTPUT_RATE);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;

        const node = playbackCtx.createBufferSource();
        node.buffer = buffer;
        node.connect(playbackCtx.destination);

        // Queue back to back. Chunks arrive faster than real time, so playing
        // each one "now" would overlap them into noise.
        const now = playbackCtx.currentTime;
        if (playHead < now) playHead = now;
        node.start(playHead);
        playHead += buffer.duration;

        sources.add(node);
        node.onended = () => sources.delete(node);
        break;
      }

      case "interrupted":
        // Barge-in: the human started talking, so drop whatever is queued.
        stopPlayback();
        handlers.interrupted?.();
        break;

      case "said":
        handlers.said?.({ role: msg.role, text: msg.text });
        break;

      case "close": {
        // Let a goodbye that is already playing finish. Closing the socket
        // mid-word to be obedient is worse than waiting for the sentence.
        const remaining = playbackCtx
          ? Math.max(0, (playHead - playbackCtx.currentTime) * 1000)
          : 0;
        setTimeout(() => handlers.closeRequested?.(), Math.min(remaining + 250, 5000));
        break;
      }

      case "switch":
        // The MODEL asked for the handover, by calling a tool. Stop talking
        // over the transition, then let the overlay reconnect as the new
        // persona — a live session's prompt and voice are fixed at setup.
        stopPlayback();
        handlers.switch?.({ persona: msg.persona, question: msg.question });
        break;

      case "consult":
        // One agent asking another. It arrives twice - once when the call
        // goes out and once when it comes back - because running a whole
        // other agent takes seconds, and a single event afterwards would
        // animate a conversation that had already ended.
        handlers.consult?.({
          phase: msg.phase,
          to: msg.to,
          name: msg.name,
          question: msg.question,
        });
        break;

      case "screen":
        // The model worked the screen: cleared the log, dismissed the cards,
        // changed the language. It touches no record, which is why it never
        // went near the guard.
        handlers.screen?.({ action: msg.action, language: msg.language });
        break;

      case "working":
        // Tools are running server-side. Nothing will be heard until they
        // finish, so the page shows that it is working rather than idle.
        handlers.working?.(msg.tools ?? []);
        break;

      case "turn_complete":
        handlers.turnComplete?.();
        break;

      case "error":
        handlers.error?.(msg.message);
        break;

      default:
        break;
    }
  };

  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    setTimeout(() => reject(new Error("The live connection timed out.")), 10000);
  });

  // ── microphone ──
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });

  const Ctx = window.AudioContext || window.webkitAudioContext;
  captureCtx = new Ctx();
  source = captureCtx.createMediaStreamSource(micStream);

  // ScriptProcessorNode is deprecated in favour of AudioWorklet, but a worklet
  // needs a separately served module file and this runs in every browser we
  // support. Revisit if the deprecation ever actually bites.
  processor = captureCtx.createScriptProcessor(FRAME_SAMPLES, 1, 1);

  processor.onaudioprocess = (e) => {
    if (stopped || socket.readyState !== WebSocket.OPEN) return;
    const input = e.inputBuffer.getChannelData(0);

    // Drive the visualiser from the same samples being sent — one source of
    // truth, so the bars cannot show something the model is not hearing.
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    handlers.level?.(Math.sqrt(sum / input.length));

    const pcm = downsampleToPcm16(input, captureCtx.sampleRate, INPUT_RATE);
    socket.send(
      JSON.stringify({
        type: "audio",
        data: toBase64(new Uint8Array(pcm.buffer)),
      }),
    );
  };

  source.connect(processor);
  // A ScriptProcessor only fires while connected to a destination. Routing it
  // to the speakers would echo the room, so it goes to a muted gain node.
  const mute = captureCtx.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(captureCtx.destination);

  return {
    stop,
    sendText: (text) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "text", text }));
      }
    },
  };
}
