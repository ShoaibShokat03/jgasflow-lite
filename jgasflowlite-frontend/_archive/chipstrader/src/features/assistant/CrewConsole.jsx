import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft, ArrowUp, AudioLines, Check, ChevronDown, CircleAlert, History, Keyboard, Lock, MessagesSquare, Plus, Radio, Route, Settings2, Square, Trash2, Wand2, X,
} from 'lucide-react';
import { api, get } from '@/lib/api';
import { streamPost } from '@/lib/stream';
import { useMe } from '@/lib/hooks';
import { fmtRelative } from '@/lib/format';
import { useScrollLock } from '@/lib/scroll-lock';
import { cn } from '@/lib/utils';
import { FALLBACK_CREW, ROUTE_LABEL, fmtMs, iconFor } from './crew';
import { CrewMarkdown } from './CrewMarkdown';
import { CrewNetwork } from './CrewNetwork';
import { PHASE_LABEL, VoiceDeck, useVoiceCall } from './VoiceDeck';
import { DataPopups } from './DataPopups';
import { liveSupported } from '@/lib/live';
import './console.css';

const PIN_KEY = 'ct-crew-pin';
const uid = () => Math.random().toString(36).slice(2, 10);
const readPin = () => {
  try {
    return localStorage.getItem(PIN_KEY) || null;
  } catch {
    return null;
  }
};

/** Hexagon framed agent icon; orbit rings spin while the agent works. */
function Sigil({ agent, size = 36, busy = false }) {
  const Icon = iconFor(agent?.icon);
  return (
    <span className="cc-sigil" data-busy={busy} style={{ '--a': agent?.accent, width: size, height: size }} aria-hidden>
      <svg className="cc-hex" viewBox="0 0 100 100"><path d="M50 3 93 27v46L50 97 7 73V27z" /></svg>
      <span className="cc-ring" />
      <span className="cc-ring cc-ring2" />
      <Icon style={{ width: size * 0.44, height: size * 0.44, position: 'relative' }} strokeWidth={2} />
    </span>
  );
}

/** Decorative stream of glyphs while the crew works. */
function DataStream({ accent }) {
  const [s, setS] = useState('');
  useEffect(() => {
    const chars = '0123456789ABCDEF';
    const id = setInterval(() => setS(Array.from({ length: 48 }, () => chars[(Math.random() * 16) | 0]).join('')), 90);
    return () => clearInterval(id);
  }, []);
  return <p aria-hidden className="cc-mono text-[10.5px] tracking-[0.2em] truncate" style={{ color: accent, opacity: 0.55 }}>{s}</p>;
}

/** Types a fresh answer out; older answers render at once. */
function Reveal({ text, fresh, onDone, onNavigate }) {
  const [n, setN] = useState(fresh ? 0 : text.length);
  useEffect(() => {
    if (!fresh) return undefined;
    let raf;
    const start = performance.now();
    const total = Math.min(1600, 300 + text.length * 4);
    const tick = (t) => {
      const k = Math.min(1, (t - start) / total);
      setN(Math.ceil(text.length * (1 - (1 - k) ** 2)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fresh, text]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = n >= text.length;
  return (
    <div className={cn(!done && 'cc-caret')}>
      <CrewMarkdown text={done ? text : text.slice(0, n)} onNavigate={onNavigate} />
    </div>
  );
}

function StepRow({ step, crewMap, compact = false }) {
  const a = crewMap[step.agent];
  return (
    <div className={cn('cc-step', step.depth > 0 && 'pl-5')} style={{ '--a': a?.accent }}>
      <span className="cc-step-icon">
        {step.status === 'start' ? <span className="cc-spinner" /> : step.ok === false || step.status === 'error' ? <CircleAlert className="size-3.5" style={{ color: 'var(--cc-bad)' }} /> : <Check className="size-3.5" style={{ color: 'var(--cc-good)' }} />}
      </span>
      <span className="cc-mono text-[10.5px] uppercase tracking-wider shrink-0" style={{ color: a?.accent }}>{a?.name}</span>
      <span className={cn('truncate', step.status === 'start' ? 'cc-shimmer' : 'text-[var(--cc-ink)]')}>{step.label}</span>
      {!compact && step.summary && step.status !== 'start' && <span className="cc-faint truncate hidden sm:inline">· {step.summary}</span>}
      <span className="ml-auto cc-mono text-[11px] cc-faint shrink-0">{step.status === 'start' ? '' : fmtMs(step.ms)}</span>
    </div>
  );
}

function HandoffRibbon({ h, crewMap }) {
  const from = crewMap[h.from];
  const to = crewMap[h.to];
  return (
    <div className="cc-ribbon flex items-center gap-2.5 px-3 py-2 text-[12.5px]" style={{ '--b': to?.accent }}>
      <ArrowRightLeft className="size-3.5 shrink-0" style={{ color: to?.accent }} />
      <span className="cc-mono text-[11px] uppercase tracking-wider shrink-0"><span style={{ color: from?.accent }}>{from?.name}</span><span className="cc-faint"> → </span><span style={{ color: to?.accent }}>{to?.name}</span></span>
      <span className="cc-muted truncate" title={h.reason}>{h.reason}</span>
    </div>
  );
}

function ConsultCard({ c, crewMap, onNavigate }) {
  const [open, setOpen] = useState(false);
  const from = crewMap[c.from];
  const to = crewMap[c.to];
  const running = c.status === 'start';
  return (
    <div className="rounded-xl border cc-hair bg-[var(--cc-panel)] overflow-hidden" style={{ '--a': to?.accent }}>
      <button type="button" onClick={() => !running && setOpen((o) => !o)} className="cc-focus w-full flex items-center gap-2.5 px-3 py-2 text-left" aria-expanded={open}>
        <Sigil agent={to} size={22} busy={running} />
        <span className="cc-mono text-[11px] uppercase tracking-wider shrink-0"><span style={{ color: from?.accent }}>{from?.name}</span><span className="cc-faint"> asks </span><span style={{ color: to?.accent }}>{to?.name}</span></span>
        <span className={cn('text-[12.5px] truncate', running ? 'cc-shimmer' : 'cc-muted')} title={c.question}>{c.question}</span>
        {!running && <span className="ml-auto flex items-center gap-1.5 shrink-0 cc-faint cc-mono text-[11px]">{fmtMs(c.ms)}<ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} /></span>}
      </button>
      {running && <div className="px-3 pb-2"><div className="cc-bar" /></div>}
      {open && c.answer && <div className="px-3 pb-3 pt-1 border-t cc-hair"><CrewMarkdown text={c.answer} onNavigate={onNavigate} /></div>}
    </div>
  );
}

function RouteChip({ route, crewMap }) {
  if (!route) return null;
  const first = crewMap[route.first ?? route.agent];
  return (
    <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full border cc-hair text-[10.5px] cc-mono uppercase tracking-wider cc-faint" title={route.reason}>
      <Route className="size-3" style={{ color: first?.accent }} />
      {ROUTE_LABEL[route.mode] ?? route.mode}
    </span>
  );
}

function AgentMessage({ m, crewMap, onReveal, onNavigate, onApprove, busy }) {
  const a = crewMap[m.agent] ?? crewMap.nova;
  const [showSteps, setShowSteps] = useState(false);
  const steps = m.steps ?? [];
  return (
    <div className="cc-msg flex gap-3 max-w-[920px]" style={{ '--a': a?.accent }}>
      <Sigil agent={a} size={36} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-semibold" style={{ color: a?.accent }}>{a?.name}</span>
          <span className="cc-label">{a?.role}</span>
          <RouteChip route={m.route} crewMap={crewMap} />
          {m.meta?.ms != null && <span className="ml-auto cc-mono text-[11px] cc-faint">{fmtMs(m.meta.ms)}</span>}
        </div>
        {m.handoffs?.map((h, i) => <HandoffRibbon key={i} h={h} crewMap={crewMap} />)}
        {m.consults?.map((c, i) => <ConsultCard key={i} c={{ ...c, status: 'done' }} crewMap={crewMap} onNavigate={onNavigate} />)}
        <div className="cc-bubble px-4 py-3">
          {m.voiceOpen ? <div className="cc-caret"><CrewMarkdown text={m.text} onNavigate={onNavigate} /></div> : <Reveal text={m.text} fresh={m.fresh} onDone={() => onReveal(m.id)} onNavigate={onNavigate} />}
          {m.status && m.status !== 'answered' && <p className="mt-2 text-[12px]" style={{ color: 'var(--cc-warn)' }}>Stopped early: {m.status.replace(/_/g, ' ')}</p>}
        </div>
        {m.awaiting?.length > 0 && (
          <div className="space-y-2">
            {m.awaiting.map((p) => (
              <div key={p.token} className="rounded-xl border px-3 py-2.5 flex flex-wrap items-center gap-3" style={{ borderColor: 'color-mix(in srgb, var(--cc-warn) 45%, transparent)' }}>
                <span className="text-[13px] flex-1 min-w-48">{p.preview}</span>
                <button type="button" className="cc-btn cc-btn-primary" disabled={busy} onClick={() => onApprove(p.token)}><Check className="size-4" />Approve</button>
              </div>
            ))}
          </div>
        )}
        {steps.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowSteps((s) => !s)} className="cc-focus inline-flex items-center gap-1.5 cc-mono text-[11px] uppercase tracking-wider cc-faint hover:text-[var(--cc-ink)]" aria-expanded={showSteps}>
              <ChevronDown className={cn('size-3.5 transition-transform', showSteps && 'rotate-180')} />
              {steps.length} step{steps.length === 1 ? '' : 's'}
              {m.consults?.length ? ` · ${m.consults.length} consult${m.consults.length === 1 ? '' : 's'}` : ''}
              {m.handoffs?.length ? ` · ${m.handoffs.length} handoff${m.handoffs.length === 1 ? '' : 's'}` : ''}
            </button>
            {showSteps && <div className="mt-1.5 pl-1 space-y-0.5">{steps.map((s) => <StepRow key={s.id} step={{ ...s, status: s.ok ? 'done' : 'error' }} crewMap={crewMap} />)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

const PHASES = ['Reading the request', 'Planning the approach', 'Querying live data', 'Cross-checking figures', 'Composing the answer'];

function LiveMessage({ live, crewMap, onNavigate }) {
  const a = crewMap[live.agent] ?? crewMap.nova;
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 1700);
    return () => clearInterval(id);
  }, []);
  const running = [...live.steps].reverse().find((s) => s.status === 'start');
  const consulting = live.consults.find((c) => c.status === 'start');
  const status = consulting ? `Consulting ${crewMap[consulting.to]?.name}` : running ? running.label : live.handoffs.length && !live.steps.some((s) => s.agent === live.agent) ? `${a?.name} is taking over` : PHASES[phase];
  return (
    <div className="cc-msg flex gap-3 max-w-[920px]" style={{ '--a': a?.accent }} aria-live="polite">
      <Sigil agent={a} size={36} busy />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-semibold" style={{ color: a?.accent }}>{a?.name}</span>
          <span className="cc-label">{a?.role}</span>
          <RouteChip route={live.route} crewMap={crewMap} />
          <span className="ml-auto cc-mono text-[11px] cc-faint">{(live.elapsed / 1000).toFixed(1)} s</span>
        </div>
        {live.handoffs.map((h, i) => <HandoffRibbon key={i} h={h} crewMap={crewMap} />)}
        {live.consults.map((c, i) => <ConsultCard key={i} c={c} crewMap={crewMap} onNavigate={onNavigate} />)}
        <div className="cc-bubble px-4 py-3 space-y-2.5">
          <p className="text-[14px] font-medium cc-shimmer">{status}…</p>
          <div className="cc-bar" />
          {live.steps.length > 0 && <div className="space-y-0.5">{live.steps.map((s) => <StepRow key={s.id} step={s} crewMap={crewMap} />)}</div>}
          <DataStream accent={a?.accent} />
        </div>
      </div>
    </div>
  );
}

export default function CrewConsole({ open, onClose }) {
  const qc = useQueryClient();
  const { can, me } = useMe();
  useScrollLock(open);
  const caps = useQuery({ queryKey: ['ai-caps'], queryFn: () => get('/assistant/capabilities'), staleTime: 60_000, enabled: open });
  const crewQ = useQuery({ queryKey: ['ai-crew'], queryFn: () => get('/assistant/crew'), staleTime: 5 * 60_000, enabled: open });
  const crew = crewQ.data?.length ? crewQ.data : FALLBACK_CREW;
  const crewMap = useMemo(() => Object.fromEntries(crew.map((a) => [a.key, a])), [crew]);

  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [live, setLive] = useState(null);
  const [input, setInput] = useState('');
  const [pinned, setPinned] = useState(readPin);
  const [focusAgent, setFocusAgent] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [net, setNet] = useState({ pulse: 0, handoff: null, consult: null });
  const [mention, setMention] = useState(null);
  const [mode, setMode] = useState(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const call = useVoiceCall({
    crewMap,
    toolLabels: caps.data?.tool_labels,
    setMessages,
    getMessages: () => messagesRef.current,
    onActivity: () => setNet((n) => ({ ...n, pulse: n.pulse + 1 })),
  });
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const startedRef = useRef(0);

  const configured = caps.data?.configured;
  const voiceAvailable = !!caps.data?.live_enabled && liveSupported();
  const voice = mode === 'voice';
  const voiceBusy = voice && ['thinking', 'working', 'speaking', 'connecting', 'switching'].includes(call.phase);
  const busy = !!live || voiceBusy;
  const lastAgent = [...messages].reverse().find((m) => m.role === 'agent')?.agent;
  const idleAgent = pinned ?? lastAgent ?? 'nova';
  const shownAgent = (voice && call.agent) || live?.agent || focusAgent || idleAgent;
  const accent = crewMap[shownAgent]?.accent ?? '#22d3ee';

  const history = useQuery({ queryKey: ['ai-conversations'], queryFn: () => get('/assistant/conversations'), enabled: open && showHistory });

  useEffect(() => {
    try {
      if (pinned) localStorage.setItem(PIN_KEY, pinned);
      else localStorage.removeItem(PIN_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [pinned]);

  // Voice first when an admin has enabled it; the conversation starts when the user clicks Start conversation.
  useEffect(() => {
    if (!open || mode || !caps.data) return;
    setMode(voiceAvailable ? 'voice' : 'text');
  }, [open, mode, caps.data, voiceAvailable]);

  const switchMode = (next) => {
    if (next === mode) return;
    if (next === 'text') call.end();
    setMode(next);
  };

  /** Roster clicks: during a call they hand the call over; otherwise they pin. */
  const pickAgent = (key) => {
    if (voice && (call.sessionRef.current || call.phase === 'connecting')) {
      if (key !== call.agent) call.switchTo(key);
      return;
    }
    setPinned((p) => (p === key ? null : key));
  };

  // Elapsed clock while the crew works.
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setLive((l) => (l ? { ...l, elapsed: Date.now() - startedRef.current } : l)), 100);
    return () => clearInterval(id);
  }, [busy]);

  // Keep the newest content in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.text?.length, live?.steps.length, live?.consults.length, live?.handoffs.length]);

  const onEvent = useCallback((e) => {
    switch (e.type) {
      case 'start':
        setConversationId(e.conversation_id);
        break;
      case 'route':
        setLive((l) => l && { ...l, agent: e.agent, route: { mode: e.mode, reason: e.reason, first: e.agent } });
        break;
      case 'thinking':
        if (!e.depth) setLive((l) => l && { ...l, agent: e.agent });
        break;
      case 'tool':
        setNet((n) => ({ ...n, pulse: n.pulse + 1 }));
        setLive((l) => {
          if (!l) return l;
          const exists = l.steps.some((s) => s.id === e.id);
          return { ...l, steps: exists ? l.steps.map((s) => (s.id === e.id ? { ...s, ...e } : s)) : [...l.steps, e] };
        });
        break;
      case 'consult':
        setNet((n) => ({ ...n, consult: e.status === 'start' ? { from: e.from, to: e.to } : null }));
        setLive((l) => {
          if (!l) return l;
          if (e.status === 'start') return { ...l, consults: [...l.consults, { from: e.from, to: e.to, question: e.question, status: 'start' }] };
          return { ...l, consults: l.consults.map((c) => (c.status === 'start' && c.to === e.to ? { ...c, ...e, status: 'done' } : c)) };
        });
        break;
      case 'handoff':
        setNet((n) => ({ ...n, handoff: { id: uid(), from: e.from, to: e.to } }));
        setLive((l) => l && { ...l, agent: e.to, handoffs: [...l.handoffs, { from: e.from, to: e.to, reason: e.reason }] });
        break;
      case 'answer':
        setMessages((ms) => [...ms, {
          id: uid(), role: 'agent', agent: e.agent, text: e.answer, fresh: true, status: e.status,
          route: { ...e.route, first: e.route?.agent }, handoffs: e.handoffs, consults: e.consults, steps: e.steps, meta: e.meta, awaiting: e.awaiting_confirmation,
        }]);
        setLive(null);
        setNet((n) => ({ ...n, consult: null }));
        qc.invalidateQueries({ queryKey: ['ai-conversations'] });
        break;
      case 'error':
        setMessages((ms) => [...ms, { id: uid(), role: 'error', text: e.message }]);
        setLive(null);
        break;
      default:
        break;
    }
  }, [qc]);

  const send = useCallback(async (text, extra = {}) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    setMention(null);
    setFocusAgent(null);
    if (!extra.approve) setMessages((ms) => [...ms, { id: uid(), role: 'user', text: question }]);
    startedRef.current = Date.now();
    setLive({ agent: pinned ?? lastAgent ?? 'nova', route: null, steps: [], consults: [], handoffs: [], elapsed: 0 });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamPost('/assistant/stream', { question, conversation_id: conversationId ?? undefined, agent: pinned ?? undefined, ...extra }, { onEvent, signal: ctrl.signal });
    } catch (err) {
      if (err.name !== 'AbortError') setMessages((ms) => [...ms, { id: uid(), role: 'error', text: err.message || 'The crew could not be reached.' }]);
    } finally {
      abortRef.current = null;
      setLive(null);
      setNet((n) => ({ ...n, consult: null }));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [busy, conversationId, lastAgent, onEvent, pinned]);

  const stop = () => {
    abortRef.current?.abort();
    setMessages((ms) => [...ms, { id: uid(), role: 'error', text: 'Stopped. The crew finishes in the background and the answer is saved to this conversation.' }]);
  };

  // A question typed into Ctrl+K's "Ask the assistant" arrives here.
  useEffect(() => {
    if (!open || !configured) return;
    const draft = sessionStorage.getItem('ct-assistant-draft');
    if (draft) {
      sessionStorage.removeItem('ct-assistant-draft');
      send(draft);
    }
  }, [open, configured]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (mention) return setMention(null);
      if (showHistory) return setShowHistory(false);
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mention, showHistory, onClose]);

  const newSession = () => {
    if (busy) return;
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const loadConversation = async (id) => {
    const c = await get(`/assistant/conversations/${id}`);
    setConversationId(c.id);
    setMessages(c.messages.map((m) => (m.role === 'user'
      ? { id: uid(), role: 'user', text: m.text }
      : { id: uid(), role: 'agent', agent: m.agent ?? 'nova', text: m.text, route: m.crew?.route, handoffs: m.crew?.handoffs ?? [], consults: m.crew?.consults ?? [], steps: m.crew?.steps ?? [] })));
    setShowHistory(false);
  };

  const removeConversation = async (id) => {
    await api.delete(`/assistant/conversations/${id}`);
    qc.invalidateQueries({ queryKey: ['ai-conversations'] });
    if (id === conversationId) newSession();
  };

  const onInput = (e) => {
    const v = e.target.value;
    setInput(v);
    const m = v.match(/^@(\w*)$/);
    setMention(m ? { q: m[1].toLowerCase(), i: 0 } : null);
  };
  const mentionList = mention ? crew.filter((a) => a.name.toLowerCase().startsWith(mention.q) || a.role.toLowerCase().startsWith(mention.q)) : [];
  const pickMention = (a) => {
    setInput(`@${a.name} `);
    setMention(null);
    inputRef.current?.focus();
  };
  const onKeyDown = (e) => {
    if (mention && mentionList.length) {
      if (e.key === 'ArrowDown') return e.preventDefault(), setMention((m) => ({ ...m, i: (m.i + 1) % mentionList.length }));
      if (e.key === 'ArrowUp') return e.preventDefault(), setMention((m) => ({ ...m, i: (m.i - 1 + mentionList.length) % mentionList.length }));
      if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), pickMention(mentionList[mention.i]);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const suggestions = useMemo(() => {
    const a = crewMap[pinned];
    if (a?.suggestions?.length) return a.suggestions.map((s) => ({ s, a }));
    return crew.filter((x) => x.suggestions?.length).map((x) => ({ s: x.suggestions[0], a: x }));
  }, [crew, crewMap, pinned]);

  const lastDone = [...messages].reverse().find((m) => m.role === 'agent');
  const telemetrySteps = voice ? call.steps : live ? live.steps : lastDone?.steps ?? [];
  const focus = crewMap[focusAgent ?? pinned ?? shownAgent];

  if (!open) return null;

  return createPortal(
    <div className="cc fixed inset-0 z-50 flex flex-col cc-enter" style={{ '--cc-accent': accent }} data-overlay role="dialog" aria-modal="true" aria-label="ChipsTrader crew console">
      <div className="cc-backdrop" />
      <div className="cc-scan" />

      {/* ── top bar ── */}
      <header className="relative z-10 h-14 shrink-0 flex items-center gap-3 px-3 sm:px-5 border-b cc-hair bg-[color-mix(in_srgb,var(--cc-bg)_85%,transparent)]">
        <Sigil agent={crewMap[shownAgent]} size={30} busy={busy} />
        <div className="min-w-0">
          <p className="cc-mono text-[12px] tracking-[0.28em] font-semibold">CREW CONSOLE</p>
          <p className="cc-label !text-[9.5px] truncate">
            <span style={{ color: configured ? 'var(--cc-good)' : 'var(--cc-warn)' }}>● {configured ? 'Online' : caps.isLoading ? 'Linking' : 'Offline'}</span>
            {caps.data?.model && <span> · {caps.data.model}</span>}
            <span className="hidden sm:inline"> · {crew.length} agents</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {voiceAvailable && (
            <div className="flex items-center p-0.5 rounded-[10px] border cc-hair" role="group" aria-label="Conversation mode">
              <button type="button" onClick={() => switchMode('voice')} aria-pressed={voice} className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] font-semibold transition-colors', voice ? 'bg-[var(--cc-accent)] text-[#03111a]' : 'cc-muted hover:text-[var(--cc-ink)]')}>
                <AudioLines className="size-4" />Voice
              </button>
              <button type="button" onClick={() => switchMode('text')} aria-pressed={mode === 'text'} className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] font-semibold transition-colors', mode === 'text' ? 'bg-[var(--cc-accent)] text-[#03111a]' : 'cc-muted hover:text-[var(--cc-ink)]')}>
                <Keyboard className="size-4" />Text
              </button>
            </div>
          )}
          <button type="button" className="cc-btn" onClick={newSession} disabled={busy} title="New conversation"><Plus className="size-4" /><span className="hidden sm:inline">New</span></button>
          <button type="button" className={cn('cc-btn', showHistory && '!border-[var(--cc-accent)]')} onClick={() => setShowHistory((s) => !s)} title="Conversations" aria-pressed={showHistory}><History className="size-4" /><span className="hidden sm:inline">History</span></button>
          {can('ai.settings.manage') && <Link to="/admin/ai" onClick={onClose} className="cc-btn cc-btn-icon" title="AI settings" aria-label="AI settings"><Settings2 className="size-4" /></Link>}
          <button type="button" className="cc-btn cc-btn-icon" onClick={onClose} title="Close (Esc)" aria-label="Close"><X className="size-4" /></button>
        </div>
      </header>

      <div className="relative z-10 flex-1 min-h-0 flex gap-3 p-3 sm:p-4">
        {/* ── roster ── */}
        <aside className="hidden lg:flex w-[248px] shrink-0 flex-col gap-3 min-h-0">
          <div className="cc-panel cc-frame p-2.5 flex flex-col gap-1">
            <p className="cc-label px-1.5 pb-1.5">Crew</p>
            <button type="button" className="cc-agent cc-focus" data-on={!pinned} style={{ '--a': '#22d3ee' }} onClick={() => setPinned(null)} aria-pressed={!pinned} title="The best agent takes each question">
              <span className="grid place-items-center size-9 rounded-xl border cc-hair shrink-0"><Wand2 className="size-4" style={{ color: '#22d3ee' }} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold truncate">Auto routing</span>
              </span>
            </button>
            {crew.map((a) => {
              const working = (live && (live.agent === a.key || live.consults.some((c) => c.status === 'start' && c.to === a.key))) || (voiceBusy && call.agent === a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  className="cc-agent cc-focus"
                  data-on={pinned === a.key}
                  style={{ '--a': a.accent }}
                  onClick={() => pickAgent(a.key)}
                  onMouseEnter={() => setFocusAgent(a.key)}
                  onMouseLeave={() => setFocusAgent(null)}
                  aria-pressed={pinned === a.key}
                  title={a.focus}
                >
                  <Sigil agent={a} size={34} busy={working} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate">{a.name}</span>
                    <span className="block cc-label !text-[9.5px] truncate">{a.role}</span>
                  </span>
                  <span className="cc-dot" data-state={working ? 'active' : 'ready'} style={{ '--a': a.accent }} />
                </button>
              );
            })}
          </div>
          {focus && (
            <div className="cc-panel p-3 min-h-0 overflow-y-auto cc-scroll" style={{ '--a': focus.accent }}>
              <p className="cc-label pb-2">Loadout · <span style={{ color: focus.accent }}>{focus.name}</span></p>
              <div className="flex flex-wrap gap-1.5">
                {(focus.tools ?? []).map((t) => (
                  <span key={t.name} className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-md border cc-hair text-[11.5px]', t.allowed ? 'cc-muted' : 'cc-faint')} title={t.allowed ? t.label : `${t.label} (not permitted for your role)`}>
                    {!t.allowed && <Lock className="size-3" />}
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── transcript ── */}
        <main className="relative flex-1 min-w-0 flex flex-col cc-panel cc-frame overflow-hidden">
          {voice && <DataPopups items={call.popups} crewMap={crewMap} onDismiss={call.dismissPopup} onClear={call.clearPopups} onNavigate={onClose} />}
          {/* compact roster for small screens */}
          <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b cc-hair overflow-x-auto cc-scroll">
            <button type="button" className="cc-chip shrink-0" style={{ '--a': '#22d3ee', ...(pinned ? {} : { color: 'var(--cc-ink)', borderColor: '#22d3ee' }) }} onClick={() => setPinned(null)} aria-pressed={!pinned}><Wand2 className="size-3.5" />Auto</button>
            {crew.map((a) => (
              <button key={a.key} type="button" className="cc-chip shrink-0" style={{ '--a': a.accent, ...(pinned === a.key ? { color: 'var(--cc-ink)', borderColor: a.accent } : {}) }} onClick={() => pickAgent(a.key)} aria-pressed={pinned === a.key}>
                <span className="size-2 rounded-full" style={{ background: a.accent }} />{a.name}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto cc-scroll px-4 sm:px-6 py-5 space-y-5">
            {!messages.length && !live && voice && (
              <div className="h-full min-h-[120px] grid place-items-center text-center">
                <div>
                  <p className="cc-label">{crewMap[call.agent ?? idleAgent]?.name} · {crewMap[call.agent ?? idleAgent]?.role}</p>
                  <h2 className="mt-1.5 text-[20px] font-semibold tracking-tight">
                    {call.phase === 'listening' ? 'Go ahead, I am listening' : ['idle', 'ended', 'gesture'].includes(call.phase) ? `Start a conversation with ${crewMap[call.agent ?? idleAgent]?.name}` : PHASE_LABEL[call.phase]}
                  </h2>
                </div>
              </div>
            )}
            {!messages.length && !live && !voice && (
              <div className="h-full min-h-[320px] grid place-items-center text-center">
                <div className="max-w-xl">
                  <div className="mx-auto w-fit"><Sigil agent={crewMap[idleAgent]} size={78} busy /></div>
                  <p className="mt-6 cc-label">{pinned ? `${crewMap[pinned]?.name} · ${crewMap[pinned]?.role}` : 'Auto routing'}</p>
                  <h2 className="mt-1.5 text-[22px] font-semibold tracking-tight">{configured === false ? 'Crew offline' : `Standing by${me?.full_name ? `, ${me.full_name.split(' ')[0]}` : ''}`}</h2>
                  {configured === false ? (
                    <p className="mt-2 cc-muted text-[14px]">
                      {can('ai.settings.manage') ? <Link to="/admin/ai" onClick={onClose} className="cc-ref !font-sans !text-[13px]">Connect a model in AI settings</Link> : 'Ask an administrator to connect the AI model.'}
                    </p>
                  ) : (
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      {suggestions.map(({ s, a }) => (
                        <button key={s} type="button" className="cc-chip cc-focus" style={{ '--a': a.accent }} onClick={() => send(s)} disabled={!configured}>
                          <span className="size-1.5 rounded-full" style={{ background: a.accent }} />{s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="cc-msg flex justify-end">
                  <div className="cc-user max-w-[min(680px,90%)] px-4 py-2.5 text-[14px] whitespace-pre-wrap">{m.text}</div>
                </div>
              ) : m.role === 'error' ? (
                <div key={m.id} className="cc-msg flex items-start gap-2.5 max-w-[920px] rounded-xl border px-3 py-2.5 text-[13px]" style={{ borderColor: 'color-mix(in srgb, var(--cc-bad) 45%, transparent)' }}>
                  <CircleAlert className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--cc-bad)' }} />
                  <span>{m.text}</span>
                </div>
              ) : (
                <AgentMessage
                  key={m.id}
                  m={m}
                  crewMap={crewMap}
                  busy={busy}
                  onNavigate={onClose}
                  onReveal={(id) => setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, fresh: false } : x)))}
                  onApprove={(token) => send('Approved, go ahead.', { approve: [token] })}
                />
              ),
            )}
            {live && <LiveMessage live={live} crewMap={crewMap} onNavigate={onClose} />}
          </div>

          {voice && <VoiceDeck call={call} agent={crewMap[call.agent ?? idleAgent]} onTextMode={() => switchMode('text')} />}

          {/* ── composer ── */}
          <div className={cn('relative px-3 sm:px-5 pb-3 sm:pb-4 pt-2', voice && 'hidden')}>
            {mention && mentionList.length > 0 && (
              <div className="absolute bottom-full left-3 sm:left-5 mb-2 w-72 cc-pop p-1.5" role="listbox" aria-label="Address an agent">
                {mentionList.map((a, i) => (
                  <button key={a.key} type="button" role="option" aria-selected={i === mention.i} onMouseDown={(e) => (e.preventDefault(), pickMention(a))}
                    className={cn('w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left', i === mention.i && 'bg-[var(--cc-panel-3)]')}>
                    <Sigil agent={a} size={26} />
                    <span className="text-[13px] font-semibold" style={{ color: a.accent }}>{a.name}</span>
                    <span className="cc-label !text-[9.5px]">{a.role}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="cc-composer flex items-end gap-2 p-2 pl-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 h-9 shrink-0 cc-mono text-[11px] uppercase tracking-wider" style={{ color: pinned ? crewMap[pinned]?.accent : '#22d3ee' }} title={pinned ? `Pinned to ${crewMap[pinned]?.name}` : 'Auto routing'}>
                {pinned ? <Radio className="size-3.5" /> : <Wand2 className="size-3.5" />}
                {pinned ? crewMap[pinned]?.name : 'Auto'}
              </span>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={onInput}
                onKeyDown={onKeyDown}
                onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }}
                placeholder={configured === false ? 'Crew offline' : 'Ask the crew, or @mention an agent'}
                disabled={configured === false}
                aria-label="Message the crew"
                className="py-2 max-h-40"
              />
              {busy ? (
                <button type="button" className="cc-btn cc-btn-icon !h-9 !w-9 shrink-0" onClick={stop} title="Stop" aria-label="Stop"><Square className="size-3.5" fill="currentColor" /></button>
              ) : (
                <button type="button" className="cc-btn cc-btn-primary cc-btn-icon !h-9 !w-9 shrink-0" onClick={() => send(input)} disabled={!input.trim() || !configured} title="Send (Enter)" aria-label="Send"><ArrowUp className="size-4" /></button>
              )}
            </div>
          </div>
        </main>

        {/* ── telemetry ── */}
        <aside className="hidden xl:flex w-[300px] shrink-0 flex-col gap-3 min-h-0">
          <div className="cc-panel cc-frame p-3">
            <div className="flex items-center justify-between pb-1">
              <p className="cc-label">Telemetry</p>
              <p className="cc-label" style={{ color: busy ? accent : undefined }}>{voice ? PHASE_LABEL[call.phase] : busy ? 'Processing' : 'Idle'}</p>
            </div>
            <CrewNetwork crew={crew} active={shownAgent} consult={net.consult} handoff={net.handoff} busy={busy} pulse={net.pulse} elapsed={live?.elapsed ?? 0} onPick={pickAgent} />
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[
                ['Steps', telemetrySteps.length],
                ['Consults', (live ? live.consults : lastDone?.consults ?? []).length],
                ['Handoffs', (live ? live.handoffs : lastDone?.handoffs ?? []).length],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border cc-hair px-2 py-1.5 text-center">
                  <p className="text-[16px] font-semibold tabular-nums">{v}</p>
                  <p className="cc-label !text-[9px]">{k}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="cc-panel p-3 flex-1 min-h-0 flex flex-col">
            <p className="cc-label pb-2">Activity</p>
            <div className="flex-1 min-h-0 overflow-y-auto cc-scroll space-y-0.5">
              {telemetrySteps.length ? telemetrySteps.map((s) => <StepRow key={s.id} compact step={live || voice ? s : { ...s, status: s.ok ? 'done' : 'error' }} crewMap={crewMap} />) : <p className="cc-faint text-[12.5px]">No activity yet</p>}
            </div>
            {lastDone?.meta && !live && (
              <p className="pt-2 mt-2 border-t cc-hair cc-mono text-[11px] cc-faint flex justify-between">
                <span>{fmtMs(lastDone.meta.ms)}</span>
                {lastDone.meta.tokens ? <span>{lastDone.meta.tokens.toLocaleString('en-US')} tokens</span> : null}
              </p>
            )}
          </div>
        </aside>

        {/* ── history drawer ── */}
        {showHistory && (
          <div className="absolute z-20 top-3 sm:top-4 bottom-3 sm:bottom-4 left-3 sm:left-4 w-[min(340px,calc(100%-24px))] cc-panel cc-frame flex flex-col cc-msg" style={{ background: 'var(--cc-panel-2)' }}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b cc-hair">
              <p className="cc-label">Conversations</p>
              <button type="button" className="cc-btn cc-btn-icon !h-7 !w-7" onClick={() => setShowHistory(false)} aria-label="Close history"><X className="size-3.5" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto cc-scroll p-2 space-y-1">
              {history.isLoading ? <div className="p-3"><div className="cc-bar" /></div> : !history.data?.length ? (
                <p className="cc-faint text-[13px] p-3">No conversations yet</p>
              ) : history.data.map((c) => (
                <div key={c.id} className={cn('group flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-[var(--cc-panel-3)]', c.id === conversationId && 'bg-[var(--cc-panel-3)]')}>
                  <MessagesSquare className="size-4 shrink-0 cc-faint" />
                  <button type="button" className="cc-focus flex-1 min-w-0 text-left" onClick={() => loadConversation(c.id)}>
                    <span className="block text-[13px] truncate">{c.title}</span>
                    <span className="block cc-mono text-[10.5px] cc-faint">{c.message_count} msg · {fmtRelative(c.last_message_at)}</span>
                  </button>
                  <button type="button" className="cc-btn cc-btn-icon !h-7 !w-7 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => removeConversation(c.id)} aria-label="Delete conversation" title="Delete"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
