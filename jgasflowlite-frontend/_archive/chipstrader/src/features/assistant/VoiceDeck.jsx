import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Keyboard, Mic, MicOff, SendHorizontal, Square } from 'lucide-react';
import { LiveSession, liveSupported } from '@/lib/live';
import { streamGet } from '@/lib/stream';
import { cn } from '@/lib/utils';
import { iconFor } from './crew';

const uid = () => Math.random().toString(36).slice(2, 10);

export const PHASE_LABEL = {
  idle: 'Ready to talk',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  working: 'Looking it up',
  speaking: 'Speaking',
  switching: 'Handing over',
  ended: 'Conversation ended',
  gesture: 'Ready to talk',
};

/**
 * One live voice call at a time: starts, hands over between agents (the
 * model's switch_agent, or a click on the roster) with a recap so the next
 * agent continues the conversation, writes the spoken transcript into the
 * console's messages, and reports tool activity.
 */
export function useVoiceCall({ crewMap, toolLabels, setMessages, getMessages, onActivity }) {
  const sessionRef = useRef(null);
  const [agent, setAgent] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [steps, setSteps] = useState([]);
  const [startedAt, setStartedAt] = useState(0);
  const [popups, setPopups] = useState([]);
  const feedRef = useRef(null);
  const agentRef = useRef(null);

  /** Data behind the conversation: every lookup result of this user's live session. */
  const openFeed = () => {
    if (feedRef.current) return;
    const ctrl = new AbortController();
    feedRef.current = ctrl;
    streamGet('/assistant/live/feed', {
      signal: ctrl.signal,
      onEvent: (e) => {
        if (e.type !== 'data') return;
        setPopups((p) => [{ ...e, agent: agentRef.current }, ...p].slice(0, 8));
      },
    }).catch(() => undefined).finally(() => {
      if (feedRef.current === ctrl) feedRef.current = null;
    });
  };
  const closeFeed = () => {
    feedRef.current?.abort();
    feedRef.current = null;
  };
  const marks = useRef({ user: 0, agent: 0, working: false, switching: false });

  const closeOpen = () => setMessages((ms) => ms.map((m) => (m.voiceOpen ? { ...m, voiceOpen: false } : m)));

  const appendSaid = useCallback((role, text, who) => {
    if (!text) return;
    const kind = role === 'user' ? 'user' : 'agent';
    marks.current[kind === 'user' ? 'user' : 'agent'] = Date.now();
    setMessages((ms) => {
      const last = ms[ms.length - 1];
      if (last?.voiceOpen && last.role === kind && (kind === 'user' || last.agent === who)) {
        return [...ms.slice(0, -1), { ...last, text: last.text + text }];
      }
      const closed = ms.map((m) => (m.voiceOpen ? { ...m, voiceOpen: false } : m));
      return [...closed, kind === 'user'
        ? { id: uid(), role: 'user', text: text.trimStart(), voice: true, voiceOpen: true }
        : { id: uid(), role: 'agent', agent: who, text: text.trimStart(), voice: true, voiceOpen: true, route: { mode: 'voice', reason: 'Live voice' } }];
    });
  }, [setMessages]);

  const recap = () => (getMessages() ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'agent') && m.text?.trim())
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : crewMap[m.agent]?.name ?? 'Agent'}: ${m.text.trim().slice(0, 400)}`)
    .join('\n');

  const begin = useCallback(async (key, primer) => {
    setError(null);
    setPhase('connecting');
    setAgent(key);
    agentRef.current = key;
    openFeed();
    marks.current = { user: 0, agent: 0, working: false, switching: false };
    let session;
    session = new LiveSession({
      agent: key,
      onEvent: (e) => {
        if (sessionRef.current !== session) return;
        switch (e.type) {
          case 'ready':
            setPhase('listening');
            if (primer) session.sendText(primer);
            break;
          case 'said':
            appendSaid(e.role, e.text, key);
            break;
          case 'turn_complete':
            closeOpen();
            break;
          case 'working': {
            const tools = e.tools ?? [];
            marks.current.working = tools.length > 0;
            if (tools.length) {
              const added = tools.map((name) => ({ id: uid(), agent: key, depth: 0, name, label: toolLabels?.[name] ?? name.replace(/_/g, ' '), status: 'start' }));
              setSteps((s) => [...s, ...added].slice(-40));
              onActivity?.();
            } else {
              setSteps((s) => s.map((x) => (x.status === 'start' ? { ...x, status: 'done', ok: true } : x)));
            }
            break;
          }
          case 'switch':
            if (e.persona && crewMap[e.persona]) switchTo(e.persona, e.question); // eslint-disable-line no-use-before-define
            break;
          case 'screen':
            if (e.action === 'clear_log') setMessages([]);
            break;
          case 'close': {
            const wait = Math.min(5000, session.remaining() * 1000 + 300);
            setTimeout(() => end(), wait); // eslint-disable-line no-use-before-define
            break;
          }
          case 'error':
            setError(e.message || 'The voice link failed.');
            break;
          case 'disconnected':
            if (!marks.current.switching) {
              setPhase('ended');
              sessionRef.current = null;
            }
            break;
          default:
            break;
        }
      },
    });
    sessionRef.current = session;
    try {
      await session.start();
      if (session.outCtx?.state !== 'running') {
        await session.stop();
        sessionRef.current = null;
        setPhase('gesture');
        return;
      }
      setStartedAt(Date.now());
      session.setMuted(muted);
    } catch (err) {
      if (sessionRef.current === session) sessionRef.current = null;
      closeFeed();
      await session.stop().catch(() => undefined);
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      setError(denied ? 'Microphone access was blocked. Allow the microphone for this site, or use text.' : err?.response?.data?.message || err?.message || 'Voice could not start.');
      setPhase('ended');
    }
  }, [appendSaid, crewMap, muted, onActivity, setMessages, toolLabels]); // eslint-disable-line react-hooks/exhaustive-deps

  const end = useCallback(async () => {
    const s = sessionRef.current;
    sessionRef.current = null;
    closeOpen();
    closeFeed();
    setSteps((x) => x.map((st) => (st.status === 'start' ? { ...st, status: 'done', ok: true } : st)));
    if (s) await s.stop();
    setPhase('ended');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Hand the call to another agent, who picks up with a recap of the conversation. */
  const switchTo = useCallback(async (key, question) => {
    marks.current.switching = true;
    setPhase('switching');
    const old = sessionRef.current;
    sessionRef.current = null;
    closeOpen();
    if (old) {
      // Let the outgoing agent finish its handover sentence (max 4 s).
      await new Promise((r) => setTimeout(r, Math.min(4000, old.remaining() * 1000 + 200)));
      await old.stop();
    }
    const context = recap();
    const primer = `Context so far (you are taking over this live call from a colleague; continue it, do not introduce yourself at length):\n${context || '(nothing yet)'}\n\n${question ? `The user now wants: ${question}` : 'Greet the user in one short sentence as the new agent and ask how you can help.'}`;
    await begin(key, primer);
  }, [begin]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    setMuted((m) => {
      sessionRef.current?.setMuted(!m);
      return !m;
    });
  };

  const sendText = (text) => {
    if (!text.trim() || !sessionRef.current) return;
    appendSaid('user', text.trim(), null);
    closeOpen();
    sessionRef.current.sendText(text.trim());
  };

  // Phase from what is actually happening: speech queued, tools running, or waiting on the model.
  useEffect(() => {
    const id = setInterval(() => {
      const s = sessionRef.current;
      if (!s || !s.ws) return;
      setPhase((p) => {
        if (['connecting', 'switching', 'ended', 'gesture'].includes(p)) return p;
        if (s.speaking()) return 'speaking';
        if (marks.current.working) return 'working';
        const { user, agent: a } = marks.current;
        if (user > a && Date.now() - user < 12000) return 'thinking';
        return 'listening';
      });
    }, 150);
    return () => clearInterval(id);
  }, []);

  // End the conversation when the console unmounts.
  useEffect(() => () => {
    void sessionRef.current?.stop();
    feedRef.current?.abort();
  }, []);

  const dismissPopup = (id) => setPopups((p) => p.filter((x) => x.id !== id));
  const clearPopups = () => setPopups([]);
  return { sessionRef, agent, phase, error, muted, steps, startedAt, popups, dismissPopup, clearPopups, begin, end, switchTo, toggleMute, sendText, supported: liveSupported() };
}

/** The reactor: rings, radial spectrum and orbiting particles around the agent's sigil. */
function Reactor({ sessionRef, phase, accent, icon, size = 230 }) {
  const canvas = useRef(null);
  const Icon = iconFor(icon);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const c = size / 2;
    let raf;
    let t = 0;
    let smooth = 0;
    const bins = 56;
    const draw = () => {
      t += reduce ? 0 : 1;
      const s = sessionRef.current;
      const lv = s ? s.getLevels() : { mic: 0, out: 0 };
      const spec = s ? s.getSpectrum(bins) : new Array(bins).fill(0);
      const level = phase === 'speaking' ? lv.out : phase === 'listening' ? lv.mic : 0;
      smooth += (level - smooth) * 0.25;
      ctx.clearRect(0, 0, size, size);

      // glow
      const g = ctx.createRadialGradient(c, c, 20, c, c, c);
      g.addColorStop(0, `${accent}55`);
      g.addColorStop(0.45, `${accent}${phase === 'speaking' ? '33' : '18'}`);
      g.addColorStop(1, `${accent}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, c * (0.82 + smooth * 0.18), 0, Math.PI * 2);
      ctx.fill();

      // radial spectrum bars
      const inner = 58;
      for (let i = 0; i < bins; i++) {
        const a = (i / bins) * Math.PI * 2 - Math.PI / 2;
        const active = phase === 'speaking' || phase === 'listening';
        const v = active ? spec[i] * (phase === 'speaking' ? 1 : 0.8) : 0.06 + 0.04 * Math.sin(t / 18 + i / 3);
        const len = 6 + v * 38;
        ctx.strokeStyle = `${accent}${active ? 'e6' : '66'}`;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
        ctx.lineTo(c + Math.cos(a) * (inner + len), c + Math.sin(a) * (inner + len));
        ctx.stroke();
      }

      // rings
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `${accent}aa`;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(c, c, 50, t / 60, t / 60 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (phase === 'connecting' || phase === 'switching') {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c, c, 104, t / 12, t / 12 + Math.PI / 2);
        ctx.stroke();
      }

      // orbiting particles while thinking / working
      if (phase === 'thinking' || phase === 'working') {
        const speed = phase === 'working' ? 22 : 40;
        for (let k = 0; k < 3; k++) {
          const a = t / speed + (k * Math.PI * 2) / 3;
          const r = 96;
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 4, 0, Math.PI * 2);
          ctx.fill();
          for (let j = 1; j < 8; j++) {
            const b = a - j * 0.07;
            ctx.fillStyle = `${accent}${(0xcc - j * 0x18).toString(16).padStart(2, '0')}`;
            ctx.beginPath();
            ctx.arc(c + Math.cos(b) * r, c + Math.sin(b) * r, 3.4 - j * 0.35, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // core
      ctx.fillStyle = '#07101c';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, 40 + smooth * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [accent, phase, sessionRef, size]);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} aria-hidden>
      <canvas ref={canvas} style={{ width: size, height: size }} className="absolute inset-0" />
      <Icon className="relative" style={{ width: 30, height: 30, color: accent }} strokeWidth={2} />
    </div>
  );
}

/** Voice controls under the transcript: reactor, status, mute, hang up, type, switch to text. */
export function VoiceDeck({ call, agent, onTextMode }) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const accent = agent?.accent ?? '#22d3ee';
  const live = !!call.sessionRef.current;
  // Tick every half second; the call clock always reads from the current call's start.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const secs = call.startedAt ? Math.max(0, Math.floor((now - call.startedAt) / 1000)) : 0;
  const busy = ['connecting', 'switching'].includes(call.phase);

  return (
    <div className="relative border-t cc-hair px-3 sm:px-5 pt-3 pb-3 sm:pb-4 flex flex-col items-center gap-2" style={{ '--a': accent }}>
      <Reactor sessionRef={call.sessionRef} phase={call.phase} accent={accent} icon={agent?.icon} size={200} />
      <div className="text-center -mt-1 min-h-[38px]" aria-live="polite">
        <p className={cn('text-[15px] font-semibold', ['thinking', 'working', 'connecting', 'switching'].includes(call.phase) && 'cc-shimmer')} style={{ '--a': accent }}>
          {PHASE_LABEL[call.phase] ?? call.phase}
          {['thinking', 'working', 'connecting', 'switching'].includes(call.phase) ? '…' : ''}
        </p>
        <p className="cc-mono text-[11px] cc-faint">
          {agent?.name} · {agent?.role}
          {live && ` · ${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`}
          {call.muted && live ? ' · mic muted' : ''}
        </p>
      </div>
      {call.error && <p className="text-[12.5px] text-center max-w-md" style={{ color: 'var(--cc-bad)' }}>{call.error}</p>}

      <div className="flex items-center gap-2.5">
        {live || busy ? (
          <>
            <button type="button" className={cn('cc-btn cc-btn-icon !h-11 !w-11 !rounded-full', call.muted && '!border-[var(--cc-warn)]')} onClick={call.toggleMute} disabled={busy} aria-pressed={call.muted} title={call.muted ? 'Unmute microphone' : 'Mute microphone'} aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}>
              {call.muted ? <MicOff className="size-5" style={{ color: 'var(--cc-warn)' }} /> : <Mic className="size-5" />}
            </button>
            <button type="button" className="cc-btn !h-11 !rounded-full !px-5 !border-transparent" style={{ background: '#be123c', color: '#fff' }} onClick={call.end} title="End conversation" aria-label="End conversation">
              <Square className="size-4" fill="currentColor" />
              <span className="hidden sm:inline">End conversation</span>
            </button>
            <button type="button" className={cn('cc-btn cc-btn-icon !h-11 !w-11 !rounded-full', typing && '!border-[var(--cc-accent)]')} onClick={() => setTyping((t) => !t)} disabled={busy} aria-pressed={typing} title="Type a message" aria-label="Type a message">
              <Keyboard className="size-5" />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="cc-btn cc-btn-primary !h-11 !rounded-full !px-6" onClick={() => call.begin(agent?.key ?? call.agent ?? 'nova')} disabled={!call.supported}>
              <AudioLines className="size-5" />
              Start conversation
            </button>
            <button type="button" className="cc-btn !h-11 !rounded-full !px-5" onClick={onTextMode}>
              <Keyboard className="size-5" />
              Type instead
            </button>
          </>
        )}
      </div>

      {typing && live && (
        <form
          className="cc-composer flex items-center gap-2 p-1.5 pl-3 w-full max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            call.sendText(draft);
            setDraft('');
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Type to ${agent?.name ?? 'the agent'}, it answers by voice`} aria-label="Type a message" className="flex-1 bg-transparent outline-none text-[14px] py-1.5" autoFocus />
          <button type="submit" className="cc-btn cc-btn-primary cc-btn-icon !h-8 !w-8" disabled={!draft.trim()} aria-label="Send"><SendHorizontal className="size-4" /></button>
        </form>
      )}
    </div>
  );
}
