// src/components/saas/pages/AssistantPage.jsx
// AI Assistant — ask questions about the whole platform in plain language.
//
// The assistant is READ-ONLY. It looks things up across every clinic and
// reports what it found; it cannot suspend a clinic, approve a payment or
// change a plan. That is enforced on the server (the platform agent has no
// write tools registered), not here.
//
// It answers only from tool results, and every tool it calls is gated by the
// permissions THIS admin already has — so an admin without `invoices.view`
// gets a refusal about invoices, exactly as the Invoices screen would.
//
// LAYOUT: this page fills the viewport instead of growing the shell's
// scroller. `h-full` works because the shell's <main> is a flex child with a
// definite height, and every wrapper down to the message list carries
// `min-h-0` — without that a flex child refuses to shrink below its content
// and the inner scroll silently moves to the page instead.
//
// One request can take 10-30 seconds: the agent may call several tools and go
// back to the model between each. There is no streaming endpoint, so the wait
// is one indicator rather than text appearing word by word.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, Send, Plus, Trash2, Loader2, User, AlertTriangle,
  Wrench, MessageSquare, ChevronRight, Settings, History,
  Mic, Volume2, VolumeX,
} from "lucide-react";
import { saasAiApi } from "../../../api/saasApi";
import { useToast } from "../../common/Toast";
import { EmptyState, fmtAgo, Modal } from "../common";
import { can } from "../../../utils/saasAuth";
import MarkdownMessage from "./MarkdownMessage";
import VoiceConversation from "./VoiceConversation";

/**
 * Openers that each map onto one tool, so the first thing a new admin tries
 * succeeds instead of wandering into something the assistant cannot answer.
 */
const STARTERS = [
  "Which clinics are over their storage quota?",
  "Which subscriptions expire in the next 30 days?",
  "Show me the clinics that have gone dormant",
  "What platform invoices are still open and overdue?",
  "How many clinics signed up this month, and from which campaign?",
];

const HeaderButton = ({ icon: Icon, label, onClick, primary }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      primary
        ? "bg-primary-600 hover:bg-primary-700 text-white"
        : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-primary-400"
    }`}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

const AssistantPage = () => {
  const qc = useQueryClient();
  const toast = useToast();

  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const canConfigure = can("assistant.settings");
  const navigate = useNavigate();

  // ── voice ──
  // The mic opens a conversation overlay rather than recording in place; a
  // spoken exchange wants the whole screen and its own loop.
  // `speakBack` is for TYPED questions, is the listener's own choice, and
  // lives only in this tab.
  const [voiceOpen, setVoiceOpen] = useState(false);
  /**
   * Where the voice screen should grow from.
   *
   * Captured from the button at the moment of the click rather than looked
   * up later: by the time the overlay mounts the layout may have moved, and
   * a window that grows from the wrong place is worse than one that just
   * appears.
   */
  const [voiceOrigin, setVoiceOrigin] = useState(null);
  /** Only leave fullscreen if we were the ones who entered it. */
  const tookFullscreenRef = useRef(false);
  const [speakBack, setSpeakBack] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const audioRef = useRef(null);

  const caps = useQuery({
    queryKey: ["saas-ai-capabilities"],
    queryFn: saasAiApi.capabilities,
    staleTime: 5 * 60 * 1000,
  });

  // Only fetched when the drawer is open — the header no longer shows threads,
  // so there is nothing to keep warm.
  const threads = useQuery({
    queryKey: ["saas-ai-conversations"],
    queryFn: saasAiApi.conversations,
    enabled: historyOpen,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const personas = useQuery({
    queryKey: ["saas-ai-personas"],
    queryFn: saasAiApi.personas,
    staleTime: 30 * 60 * 1000,
  });

  const askM = useMutation({
    mutationFn: ({ question, persona }) =>
      saasAiApi.ask({
        question,
        persona,
        conversation_id: conversationId ?? undefined,
      }),
    onSuccess: (data) => {
      setConversationId(data.conversation_id);
      if (speakBack && data.answer) speakText(data.answer);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          tools: data.used_tools ?? [],
          status: data.status,
          meta: data.meta,
        },
      ]);
      qc.invalidateQueries({ queryKey: ["saas-ai-conversations"] });
    },
    onError: (e) => {
      const message = e.response?.data?.message;
      const text = Array.isArray(message) ? message[0] : message;
      // Drop the optimistic user bubble and give the question back.
      setMessages((prev) => prev.slice(0, -1));
      setDraft((d) => d || askM.variables?.question || "");
      toast.error(text || "The assistant could not answer that");
    },
  });

  const openThread = async (id) => {
    try {
      const row = await saasAiApi.conversation(id);
      setConversationId(id);
      setMessages(
        (row.messages ?? []).map((m) => ({ role: m.role, text: m.text, tools: m.tools })),
      );
      setHistoryOpen(false);
    } catch {
      toast.error("That conversation could not be opened");
    }
  };

  const newThread = () => {
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setHistoryOpen(false);
    inputRef.current?.focus();
  };

  const removeM = useMutation({
    mutationFn: (id) => saasAiApi.removeConversation(id),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["saas-ai-conversations"] });
      if (id === conversationId) newThread();
    },
    onError: () => toast.error("Could not delete that conversation"),
  });

  /**
   * One spoken turn, for the overlay: ask, record it in the chat like any
   * other exchange, and hand the answer back so it can be spoken.
   *
   * It goes through the same mutation as typing, so a voice conversation and a
   * typed one are the same thread — you can close the overlay and read back
   * everything that was said.
   */
  const askAloud = async (question, persona, language) => {
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    // The overlay needs the whole envelope — which persona answered, and which
    // tools were used — not just the text.
    return askM.mutateAsync({ question, persona, language });
  };

  // ── voice out ───────────────────────────────────────────────────────────
  const speakText = async (text) => {
    try {
      setSpeaking(true);
      const blob = await saasAiApi.speak(text);
      const url = URL.createObjectURL(blob);
      // One player, reused: a second answer should replace the first, not talk
      // over it.
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      await audio.play();
    } catch (e) {
      setSpeaking(false);
      toast.error(e.response?.data?.message || "Could not play that answer");
    }
  };

  const stopSpeaking = () => {
    audioRef.current?.pause();
    setSpeaking(false);
  };

  // Stop any playback when leaving the page. The overlay owns the microphone
  // and releases it itself.
  useEffect(() => () => audioRef.current?.pause(), []);

  const send = (text) => {
    const question = (text ?? draft).trim();
    if (!question || askM.isPending) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setDraft("");
    askM.mutate({ question });
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const unavailable = caps.data && caps.data.configured === false;
  // The mic only appears when voice mode is actually configured and on — a
  // dead microphone is worse than no microphone.
  const voiceOn = !!caps.data?.voice_enabled;
  
  const toolCount = useMemo(
    () => (caps.data?.tools ?? []).filter((t) => t.allowed).length,
    [caps.data],
  );

  return (
    // h-full + min-h-0 all the way down: the page fills the shell, and the
    // message list is the only thing that scrolls.
    // min-h floor so the composer never gets squeezed away on a very short
    // window — below that, <main> scrolls as it always did.
    <div className="h-full min-h-[26rem] flex flex-col gap-2.5">
      {/* ── header ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">
            AI Assistant
          </h1>
          <p className="text-[12.5px] text-gray-500 dark:text-gray-400 truncate">
            Ask about clinics, plans, subscriptions, billing and traffic
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HeaderButton icon={History} label="History" onClick={() => setHistoryOpen(true)} />
          {canConfigure && (
            <HeaderButton
              icon={Settings}
              label="Settings"
              onClick={() => navigate("/assistant/settings")}
            />
          )}
          <HeaderButton icon={Plus} label="New chat" onClick={newThread} primary />
        </div>
      </div>

      {voiceOn && (
        <VoiceConversation
          open={voiceOpen}
          origin={voiceOrigin}
          onClose={() => {
            setVoiceOpen(false);
            // Released by whoever took it, at the moment the screen is
            // really gone. An admin already fullscreen before opening this
            // is still fullscreen after closing it.
            if (tookFullscreenRef.current && document.fullscreenElement) {
              document.exitFullscreen?.().catch(() => {});
            }
            tookFullscreenRef.current = false;
          }}
          ask={askAloud}
          personas={personas.data ?? []}
          live={!!caps.data?.live_enabled}
        />
      )}

      {/* ── past chats, on demand ── */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Chat history">
        <div className="max-h-[26rem] overflow-y-auto -mx-1">
          {threads.isLoading && <p className="px-2 py-3 text-[13px] text-gray-400">Loading…</p>}
          {threads.data?.length === 0 && (
            <p className="px-2 py-3 text-[13px] text-gray-400">No chats yet</p>
          )}
          {(threads.data ?? []).map((t) => (
            <div
              key={t.id}
              onClick={() => openThread(t.id)}
              className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 ${
                t.id === conversationId ? "bg-primary-50 dark:bg-primary-900/20" : ""
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-gray-700 dark:text-gray-200">{t.title}</p>
                <p className="text-[11.5px] text-gray-400">
                  {t.message_count} message{t.message_count === 1 ? "" : "s"} · {fmtAgo(t.last_message_at)}
                </p>
              </div>
              <button
                title="Delete chat"
                onClick={(e) => {
                  e.stopPropagation();
                  removeM.mutate(t.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Modal>

      {unavailable && (
        <div className="shrink-0 flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
          <p className="text-[13px] text-amber-800 dark:text-amber-200">
            No API key is configured, so the assistant cannot answer yet.
            {canConfigure ? (
              <>
                {" "}
                <button
                  onClick={() => navigate("/assistant/settings")}
                  className="underline font-medium"
                >
                  Add one in Settings
                </button>
                .
              </>
            ) : (
              " Ask a super admin to add one."
            )}
          </p>
        </div>
      )}

      {/* ── the conversation: fills what is left, scrolls inside ── */}
      <section className="flex-1 min-h-0 flex flex-col bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700">
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && !askM.isPending && (
            <div className="h-full flex flex-col items-center justify-center">
              <EmptyState
                icon={Sparkles}
                title="Ask about anything on the platform"
                subtitle="It reads clinics, plans, subscriptions, billing and traffic — and reports. It cannot change anything."
              />
              <div className="mt-3 flex flex-wrap justify-center gap-1.5 max-w-3xl">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12.5px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-400"
                  >
                    {s}
                    <ChevronRight className="w-3 h-3" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              // The question: compact, right-aligned, plain text on purpose —
              // it is what the admin typed, not something to re-interpret.
              <div key={i} className="flex justify-end gap-2.5">
                <div
                  dir="auto"
                  className="max-w-[42rem] rounded-xl px-3 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words bg-gray-200/70 dark:bg-gray-700/60 text-gray-800 dark:text-gray-100"
                >
                  {m.text}
                </div>
                <span className="shrink-0 w-7 h-7 rounded-lg grid place-items-center bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  <User className="w-4 h-4" />
                </span>
              </div>
            ) : (
              // The answer: full width, so tables and long lists have room.
              <div key={i} className="flex gap-2.5">
                <span className="shrink-0 w-7 h-7 rounded-lg grid place-items-center bg-primary-600 text-white">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3.5 py-2.5 text-gray-800 dark:text-gray-100 break-words">
                    <MarkdownMessage text={m.text} />
                  </div>
                  {(m.tools?.length || m.meta) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-gray-400">
                      {(m.tools ?? []).map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700/60 font-mono"
                        >
                          <Wrench className="w-3 h-3" />
                          {t}
                        </span>
                      ))}
                      {m.meta && (
                        <span>
                          {m.meta.tokens} tokens · {Math.round(m.meta.ms / 100) / 10}s
                        </span>
                      )}
                      {/* Surfaced rather than swallowed: a run that hit a
                          budget or failed is not an ordinary answer. */}
                      {m.status && m.status !== "answered" && (
                        <span className="text-amber-600 dark:text-amber-400">{m.status}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {askM.isPending && (
            <div className="flex gap-2.5">
              <span className="shrink-0 w-7 h-7 rounded-lg grid place-items-center bg-primary-600 text-white">
                <Sparkles className="w-4 h-4" />
              </span>
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3.5 py-2.5">
                <span className="inline-flex items-center gap-2 text-[13.5px] text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Looking it up…
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── composer ── */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 p-2.5 bg-white dark:bg-gray-800 rounded-b-xl">
          {/* Above the input, not below: the row of controls is the last thing
              on the card, so its baseline is what the eye lines up with. */}
          {toolCount > 0 && (
            <p className="mb-1.5 text-[11.5px] text-gray-400">
              {toolCount} lookups available
              {caps.data?.model ? ` · ${caps.data.model}` : ""}
              {voiceOn ? " · voice on" : ""}
            </p>
          )}
          <div className="flex items-end gap-2">
            {voiceOn && (
              <button
                onClick={(e) => {
                  const b = e.currentTarget.getBoundingClientRect();
                  // As a FRACTION of the viewport, not in pixels: opening
                  // also asks for fullscreen, which resizes the viewport in
                  // the same moment, and a pixel captured before that points
                  // somewhere else afterwards.
                  setVoiceOrigin({
                    fx: (b.x + b.width / 2) / window.innerWidth,
                    fy: (b.y + b.height / 2) / window.innerHeight,
                  });
                  // Fullscreen is asked for HERE, inside the click.
                  // From an effect it is a request with no recent gesture,
                  // which the browser may refuse outright, and it would land
                  // mid-animation: the window resize recreates the
                  // compositor surface and reallocates the canvas backing
                  // store on top of the transform. In the gesture the resize
                  // starts first and is over by the time the scale matters.
                  if (!document.fullscreenElement) {
                    document.documentElement
                      .requestFullscreen?.()
                      .then(() => {
                        tookFullscreenRef.current = true;
                      })
                      .catch(() => {});
                  }
                  setVoiceOpen(true);
                }}
                disabled={unavailable || askM.isPending}
                title="Talk to the assistant"
                className="shrink-0 h-[38px] w-[38px] rounded-lg grid place-items-center border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              disabled={unavailable}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about clinics, subscriptions, billing…"
              className="flex-1 resize-none max-h-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[13.5px] text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 disabled:bg-gray-50"
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
              }}
            />
            {voiceOn && (
              <button
                onClick={speaking ? stopSpeaking : () => setSpeakBack((v) => !v)}
                title={
                  speaking
                    ? "Stop speaking"
                    : speakBack
                      ? "Answers are read aloud — click to mute"
                      : "Read answers aloud"
                }
                className={`shrink-0 h-[38px] w-[38px] rounded-lg grid place-items-center transition-colors ${
                  speaking
                    ? "bg-primary-600 text-white animate-pulse"
                    : speakBack
                      ? "border border-primary-400 text-primary-600 dark:text-primary-400"
                      : "border border-gray-300 dark:border-gray-600 text-gray-400 hover:border-primary-400"
                }`}
              >
                {speakBack || speaking ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>
            )}
            <button
              onClick={() => send()}
              disabled={!draft.trim() || askM.isPending || unavailable}
              className="shrink-0 h-[38px] px-3 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white grid place-items-center"
              title="Send"
            >
              {askM.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AssistantPage;
