// src/components/saas/pages/AiSettingsPage.jsx
// AI Assistant settings — the provider (Gemini) and voice mode.
//
// A page rather than a modal: there are two services to configure, each with a
// key, a model or voice, and a test, and a dialog that tall fights the screen
// it is sitting on.
//
// BOTH KEYS ARE WRITE-ONLY. The API returns a mask ("AIzaSy••••••wXyZ") and
// never the key itself, so these fields cannot be pre-filled — which is also
// why an empty box means "keep the saved key" rather than "clear it".
// Clearing is its own button.
//
// Test before save, on purpose: a key that is wrong should say so here, not on
// someone's first question tomorrow. Load models / Load voices / both Test
// buttons all send the TYPED key when there is one, so a candidate can be
// proven before it is stored.
import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  KeyRound, Loader2, CheckCircle2, XCircle, RefreshCw, Trash2, Save,
  ArrowLeft, Sparkles, Mic, Volume2,
} from "lucide-react";
import { saasAiApi } from "../../../api/saasApi";
import { useToast } from "../../common/Toast";
import { Field, inputCls, BtnPrimary, ToggleSwitch, fmtDateTime } from "../common";
import { can } from "../../../utils/saasAuth";

const Card = ({ icon: Icon, title, subtitle, children, aside }) => (
  <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
    <header className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
        </div>
      </div>
      {aside}
    </header>
    <div className="p-3 space-y-3">{children}</div>
  </section>
);

const TestResult = ({ result, okLabel }) =>
  !result ? null : (
    <span
      className={`inline-flex items-center gap-1.5 text-[13px] ${
        result.ok ? "text-green-600" : "text-red-600"
      }`}
    >
      {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {result.ok ? okLabel(result) : result.error || result.detail}
    </span>
  );

const AiSettingsPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const allowed = can("assistant.settings");

  // ── provider ──
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [models, setModels] = useState([]);
  const [testResult, setTestResult] = useState(null);

  // ── voice ──
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceKey, setVoiceKey] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [voiceSpeed, setVoiceSpeed] = useState("1");
  const [voices, setVoices] = useState([]);
  const [voiceResult, setVoiceResult] = useState(null);

  // ── live voice ──
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveModel, setLiveModel] = useState("");

  const q = useQuery({
    queryKey: ["saas-ai-settings"],
    queryFn: saasAiApi.settings,
    enabled: allowed,
  });

  // Seed from the saved row. The key boxes stay empty — there is nothing to
  // seed them with, by design.
  useEffect(() => {
    if (!q.data) return;
    setApiKey("");
    setVoiceKey("");
    setModel(q.data.model ?? "");
    setMaxTokens(String(q.data.max_output_tokens ?? ""));
    setVoiceEnabled(!!q.data.voice_enabled);
    setVoiceName(q.data.voice_name ?? "");
    setVoiceSpeed(String(q.data.voice_speed ?? 1));
    setLiveEnabled(!!q.data.live_enabled);
    setLiveModel(q.data.live_model ?? "");
    setTestResult(null);
    setVoiceResult(null);
  }, [q.data]);

  const modelsM = useMutation({
    mutationFn: () => saasAiApi.models(apiKey.trim() || undefined),
    onSuccess: (list) => {
      setModels(list ?? []);
      if (!list?.length) toast.info("That key returned no usable models");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Could not load the model list"),
  });

  const testM = useMutation({
    mutationFn: () =>
      saasAiApi.testSettings({
        api_key: apiKey.trim() || undefined,
        model: model.trim() || undefined,
      }),
    onSuccess: setTestResult,
    onError: (e) =>
      setTestResult({ ok: false, error: e.response?.data?.message || "Test failed" }),
  });

  const voicesM = useMutation({
    mutationFn: () => saasAiApi.voices(voiceKey.trim() || undefined),
    onSuccess: (data) => {
      setVoices(data?.voices ?? []);
      if (!data?.voices?.length) toast.info("No voices came back");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Could not load the voice list"),
  });

  const voiceTestM = useMutation({
    mutationFn: () => saasAiApi.testVoice({ api_key: voiceKey.trim() || undefined }),
    onSuccess: setVoiceResult,
    onError: (e) =>
      setVoiceResult({ ok: false, detail: e.response?.data?.message || "Test failed" }),
  });

  const saveM = useMutation({
    mutationFn: () => {
      const payload = {
        model: model.trim() || undefined,
        voice_enabled: voiceEnabled,
        voice_name: voiceName.trim(),
        voice_speed: Number(voiceSpeed) || 1,
        live_enabled: liveEnabled,
        live_model: liveModel.trim(),
      };
      // Omitted = keep the stored key. Only send when one was typed.
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      if (voiceKey.trim()) payload.voice_api_key = voiceKey.trim();
      const n = Number(maxTokens);
      if (Number.isFinite(n) && n >= 256) payload.max_output_tokens = Math.floor(n);
      return saasAiApi.updateSettings(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saas-ai-settings"] });
      qc.invalidateQueries({ queryKey: ["saas-ai-capabilities"] });
      toast.success("AI settings saved");
    },
    onError: (e) => {
      const m = e.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || "Could not save");
    },
  });

  const clearM = useMutation({
    mutationFn: (which) =>
      saasAiApi.updateSettings(which === "voice" ? { voice_api_key: "" } : { api_key: "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saas-ai-settings"] });
      qc.invalidateQueries({ queryKey: ["saas-ai-capabilities"] });
      toast.success("Key removed");
    },
    onError: () => toast.error("Could not remove the key"),
  });

  if (!allowed) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Not your permission
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Managing the assistant's keys needs the "Manage API key &amp; model" permission.
        </p>
      </div>
    );
  }

  const saved = q.data;
  const busy = modelsM.isPending || testM.isPending || saveM.isPending;

  const KeyHint = ({ source, masked, updatedBy, updatedAt, envName }) => (
    <p className="-mt-1 text-[12px] text-gray-500 dark:text-gray-400">
      {source === "panel" && (
        <>
          Set here{updatedBy ? ` by ${updatedBy}` : ""}
          {updatedAt ? ` · ${fmtDateTime(updatedAt)}` : ""} · {masked}
        </>
      )}
      {source === "env" &&
        `Currently using ${envName} from the server environment. Saving a key here overrides it.`}
      {source === "none" && "No key configured yet."}
    </p>
  );

  return (
    <div className="space-y-2.5 pb-4">
      {/* ── header ── */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate("/assistant")}
            title="Back to the assistant"
            className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-900 dark:text-white">
              AI Assistant settings
            </h1>
            <p className="text-[12.5px] text-gray-500 dark:text-gray-400 truncate">
              The model it thinks with, and the voice it speaks in
            </p>
          </div>
        </div>
        <BtnPrimary onClick={() => saveM.mutate()} disabled={busy}>
          {saveM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </BtnPrimary>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
        {/* ── provider ── */}
        <Card
          icon={Sparkles}
          title="Language model"
          subtitle="Google Gemini: what the assistant thinks with"
        >
          <Field label="API key">
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                saved?.configured
                  ? `${saved.api_key_masked}, leave blank to keep it`
                  : "Paste the key from aistudio.google.com/apikey"
              }
            />
          </Field>
          {saved && (
            <KeyHint
              source={saved.key_source}
              masked={saved.api_key_masked}
              updatedBy={saved.updated_by_name}
              updatedAt={saved.updated_at}
              envName="GEMINI_API_KEY"
            />
          )}

          <Field label="Model">
            <div className="flex gap-2">
              {models.length > 0 ? (
                <select className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">Use the default</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputCls}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gemini-2.5-flash"
                />
              )}
              <button
                onClick={() => modelsM.mutate()}
                disabled={modelsM.isPending}
                title="Fetch the models this key can use"
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-[13px] text-gray-600 dark:text-gray-300 hover:border-primary-400 disabled:opacity-50"
              >
                {modelsM.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Load
              </button>
            </div>
          </Field>

          <Field label="Max reply length (tokens)">
            <input
              type="number"
              min={256}
              max={32000}
              step={256}
              className={inputCls}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="2048"
            />
          </Field>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={() => testM.mutate()}
              disabled={testM.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-primary-400 disabled:opacity-50"
            >
              {testM.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              Test connection
            </button>
            <button
              onClick={() => clearM.mutate("model")}
              disabled={saved?.key_source !== "panel" || clearM.isPending}
              title={
                saved?.key_source === "env"
                  ? "This key comes from the server environment, not from here"
                  : "Remove the stored key"
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove key
            </button>
          </div>
          <TestResult
            result={testResult}
            okLabel={(r) => `${r.model} replied in ${r.latency_ms} ms`}
          />
        </Card>

        {/* ── voice ── */}
        <Card
          icon={Mic}
          title="Voice mode"
          subtitle="Ask out loud, and hear the answer"
          aside={
            <ToggleSwitch
              checked={voiceEnabled}
              onChange={setVoiceEnabled}
              title={voiceEnabled ? "Voice mode on" : "Voice mode off"}
            />
          }
        >
          <Field label="Voice API key">
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={voiceKey}
              onChange={(e) => setVoiceKey(e.target.value)}
              placeholder={
                saved?.voice_configured
                  ? `${saved.voice_api_key_masked}, leave blank to keep it`
                  : "The key for the voice service"
              }
            />
          </Field>
          {saved && (
            <KeyHint
              source={saved.voice_key_source}
              masked={saved.voice_api_key_masked}
              updatedBy={saved.updated_by_name}
              updatedAt={saved.updated_at}
              envName="VOICE_API_KEY"
            />
          )}

          <Field label="Voice">
            <div className="flex gap-2">
              {voices.length > 0 ? (
                <select
                  className={inputCls}
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                >
                  <option value="">Use the service default</option>
                  {voices.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.language_name} · {v.name} ({v.quality})
                      {v.installed ? "" : ", downloads on first use"}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputCls}
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="en_US-lessac-medium"
                />
              )}
              <button
                onClick={() => voicesM.mutate()}
                disabled={voicesM.isPending}
                title="Fetch the voices this key can use"
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-[13px] text-gray-600 dark:text-gray-300 hover:border-primary-400 disabled:opacity-50"
              >
                {voicesM.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Load
              </button>
            </div>
          </Field>

          <Field label={`Speaking speed: ${Number(voiceSpeed).toFixed(2)}x`}>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={voiceSpeed}
              onChange={(e) => setVoiceSpeed(e.target.value)}
              className="w-full accent-primary-600"
            />
          </Field>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={() => voiceTestM.mutate()}
              disabled={voiceTestM.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-primary-400 disabled:opacity-50"
            >
              {voiceTestM.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              Test voice service
            </button>
            <button
              onClick={() => clearM.mutate("voice")}
              disabled={saved?.voice_key_source !== "panel" || clearM.isPending}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove key
            </button>
          </div>
          <TestResult
            result={voiceResult}
            okLabel={(r) => `Both models answered in ${r.latency_ms} ms${r.tts ? ` · ${r.tts}` : ""}`}
          />

          {/* ── live voice ── */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
                  Real-time conversation
                </p>
                <p className="text-[12px] text-gray-500 dark:text-gray-400">
                  Streams audio both ways instead of recording turn by turn
                </p>
              </div>
              <ToggleSwitch
                checked={liveEnabled}
                onChange={setLiveEnabled}
                disabled={!saved?.live_available}
                title={
                  saved?.live_available
                    ? "Use the Gemini Live API"
                    : "Needs a Gemini API key first"
                }
              />
            </div>

            {liveEnabled && (
              <Field label="Live model">
                <input
                  className={inputCls}
                  value={liveModel}
                  onChange={(e) => setLiveModel(e.target.value)}
                  placeholder="gemini-3.8-live"
                />
              </Field>
            )}
          </div>

        </Card>
      </div>
    </div>
  );
};

export default AiSettingsPage;
