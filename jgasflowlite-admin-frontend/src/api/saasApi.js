// src/api/saasApi.js
import saasClient from "./saasClient";

/**
 * SaaS platform-admin API surface.
 * Mirrors the backend modules: saas-admin, saas-plans, saas-subscriptions.
 * Companies endpoints are declared ahead of the backend module (next step);
 * pages handle 404s from them gracefully.
 */

// ── Auth ────────────────────────────────────────────────────────
export const saasAuthApi = {
  login: (email, password) =>
    saasClient.post("/saas/auth/login", { email, password }).then((r) => r.data),
  logout: (refreshToken) =>
    saasClient.post("/saas/auth/logout", { refresh_token: refreshToken }),
  me: () => saasClient.get("/saas/auth/me").then((r) => r.data),
  changePassword: (current_password, new_password) =>
    saasClient.post("/saas/auth/change-password", {
      current_password,
      new_password,
    }),
};

// ── Platform admins ─────────────────────────────────────────────
export const saasAdminsApi = {
  list: (params) =>
    saasClient.get("/saas/admins", { params }).then((r) => r.data),
  get: (id) => saasClient.get(`/saas/admins/${id}`).then((r) => r.data),
  create: (payload) =>
    saasClient.post("/saas/admins", payload).then((r) => r.data),
  update: (id, payload) =>
    saasClient.patch(`/saas/admins/${id}`, payload).then((r) => r.data),
  remove: (id) => saasClient.delete(`/saas/admins/${id}`),
};

// ── Plans ───────────────────────────────────────────────────────
export const saasPlansApi = {
  listPublic: () => saasClient.get("/saas/plans").then((r) => r.data),
  list: (params) => saasClient.get("/saas/admin/plans", { params }).then((r) => r.data),
  get: (id) => saasClient.get(`/saas/admin/plans/${id}`).then((r) => r.data),
  /** Feature modules a plan / company override can grant. */
  modulesCatalog: () =>
    saasClient.get("/saas/admin/plans/modules-catalog").then((r) => r.data),
  create: (payload) =>
    saasClient.post("/saas/admin/plans", payload).then((r) => r.data),
  update: (id, payload) =>
    saasClient.patch(`/saas/admin/plans/${id}`, payload).then((r) => r.data),
  /** Hard delete — backend rejects (409) if the plan was ever purchased. */
  remove: (id) => saasClient.delete(`/saas/admin/plans/${id}`),
};

// ── Subscriptions ───────────────────────────────────────────────
export const saasSubscriptionsApi = {
  list: (params) =>
    saasClient.get("/saas/admin/subscriptions", { params }).then((r) => r.data),
  get: (id) =>
    saasClient.get(`/saas/admin/subscriptions/${id}`).then((r) => r.data),
  create: (payload) =>
    saasClient.post("/saas/admin/subscriptions", payload).then((r) => r.data),
  activate: (id) =>
    saasClient.post(`/saas/admin/subscriptions/${id}/activate`).then((r) => r.data),
  cancel: (id) =>
    saasClient.post(`/saas/admin/subscriptions/${id}/cancel`).then((r) => r.data),
  renew: (id) =>
    saasClient.post(`/saas/admin/subscriptions/${id}/renew`).then((r) => r.data),
  /** Credit months a clinic has already paid for, offline. */
  extend: (id, payload) =>
    saasClient.post(`/saas/admin/subscriptions/${id}/extend`, payload).then((r) => r.data),
  invoices: (id) =>
    saasClient.get(`/saas/admin/subscriptions/${id}/invoices`).then((r) => r.data),
};

// ── Subscription invoices ───────────────────────────────────────
export const saasInvoicesApi = {
  list: (params) =>
    saasClient
      .get("/saas/admin/subscription-invoices", { params })
      .then((r) => r.data),
  markPaid: (id, payload = {}) =>
    saasClient
      .post(`/saas/admin/subscription-invoices/${id}/pay`, payload)
      .then((r) => r.data),
  /** Approve a payment-ledger row (accumulates on the invoice). */
  approvePayment: (paymentId) =>
    saasClient
      .post(`/saas/admin/saas-payments/${paymentId}/approve`, {})
      .then((r) => r.data),
  /** Reject a payment-ledger row — clinic must submit a new payment. */
  rejectPayment: (paymentId) =>
    saasClient
      .post(`/saas/admin/saas-payments/${paymentId}/reject`, {})
      .then((r) => r.data),
};

// ── Companies (backend module lands next — pages tolerate 404) ──
export const saasCompaniesApi = {
  list: (params) =>
    saasClient.get("/saas/admin/companies", { params }).then((r) => r.data),
  get: (id) =>
    saasClient.get(`/saas/admin/companies/${id}`).then((r) => r.data),
  create: (payload) =>
    saasClient.post("/saas/admin/companies", payload).then((r) => r.data),
  update: (id, payload) =>
    saasClient.patch(`/saas/admin/companies/${id}`, payload).then((r) => r.data),
  updateStatus: (id, status) =>
    saasClient
      .patch(`/saas/admin/companies/${id}`, { status })
      .then((r) => r.data),
  /** Platform-wide footprint + allocation, for the dashboard tile. */
  storageSummary: () =>
    saasClient.get("/saas/admin/companies/storage/summary").then((r) => r.data),
  /** Estimated DB + file footprint for a page of clinics, keyed by id. */
  storage: (ids) =>
    saasClient
      .get("/saas/admin/companies/storage", { params: { ids: ids.join(",") } })
      .then((r) => r.data),
  /** One-time code to open this clinic as its owner (nothing is modified). */
  impersonate: (id) =>
    saasClient.post(`/saas/admin/companies/${id}/impersonate`, {}).then((r) => r.data),
  /** Usage activity: status, volume, per-source totals, daily + monthly series. */
  activity: (id, params) =>
    saasClient
      .get(`/saas/admin/companies/${id}/activity`, { params })
      .then((r) => r.data),
};

// ── Marketing analytics (traffic, ads, signups) ─────────────────
export const analyticsApi = {
  summary: (params) =>
    saasClient.get("/saas/analytics/summary", { params }).then((r) => r.data),
  facets: () => saasClient.get("/saas/analytics/facets").then((r) => r.data),
  visitors: (params) =>
    saasClient.get("/saas/analytics/visitors", { params }).then((r) => r.data),
  visitor: (id) =>
    saasClient.get(`/saas/analytics/visitors/${id}`).then((r) => r.data),
};

// ── Support contacts (platform-wide; the clinic portal reads /support) ──
export const supportApi = {
  get: () => saasClient.get("/saas/support").then((r) => r.data),
  update: (payload) =>
    saasClient.patch("/saas/support", payload).then((r) => r.data),
};

// ── AI Assistant (platform admin) ───────────────────────────────
// Read-only: the assistant looks things up across every clinic and reports.
// `ask` can take 10-30s (the agent may call several tools before answering),
// so it gets its own timeout rather than the client's default 30s.
export const saasAiApi = {
  capabilities: () =>
    saasClient.get("/saas/admin/ai/capabilities").then((r) => r.data),
  ask: (payload) =>
    saasClient
      .post("/saas/admin/ai/ask", payload, { timeout: 120000 })
      .then((r) => r.data),
  /** The persona roster: names, roles, greetings and briefing questions. */
  personas: () => saasClient.get("/saas/admin/ai/personas").then((r) => r.data),
  conversations: () =>
    saasClient.get("/saas/admin/ai/conversations").then((r) => r.data),
  conversation: (id) =>
    saasClient.get(`/saas/admin/ai/conversations/${id}`).then((r) => r.data),
  removeConversation: (id) =>
    saasClient.delete(`/saas/admin/ai/conversations/${id}`),
  runs: (params) =>
    saasClient.get("/saas/admin/ai/runs", { params }).then((r) => r.data),

  // ── provider configuration ──
  // The key is write-only: `settings` returns a mask, never the key itself,
  // so "leave it unchanged" is expressed by omitting api_key entirely.
  settings: () => saasClient.get("/saas/admin/ai/settings").then((r) => r.data),
  updateSettings: (payload) =>
    saasClient.patch("/saas/admin/ai/settings", payload).then((r) => r.data),
  /** Live from the provider. Pass a candidate key to list before saving. */
  models: (apiKey) =>
    saasClient
      .get("/saas/admin/ai/settings/models", {
        params: apiKey ? { api_key: apiKey } : undefined,
        timeout: 30000,
      })
      .then((r) => r.data),
  /** One real call proving a key + model work. Never throws on a bad key. */
  testSettings: (payload) =>
    saasClient
      .post("/saas/admin/ai/settings/test", payload, { timeout: 40000 })
      .then((r) => r.data),

  // ── voice mode ──
  // Both directions are PROXIED through our API: the voice key must never
  // reach the browser, and the voice service rejects unknown Origins before it
  // runs a model, so a server-to-server call is the intended path.
  /** Recorded audio -> text. */
  transcribe: (blob) => {
    const form = new FormData();
    form.append("file", blob, "question.webm");
    return saasClient
      .post("/saas/admin/ai/voice/transcribe", form, {
        timeout: 60000,
        // REQUIRED. saasClient defaults every request to application/json, and
        // that default wins over the one axios would derive from a FormData —
        // so the multipart boundary never gets sent, multer finds no file, and
        // the upload fails as "no audio received". Every other upload in the
        // apps sets this for the same reason.
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  /** Text -> a WAV blob, ready for an <audio> element. */
  speak: (text, persona) =>
    saasClient
      .post(
        "/saas/admin/ai/voice/speak",
        { text, persona },
        { responseType: "blob", timeout: 90000 },
      )
      .then((r) => r.data),
  voices: (apiKey) =>
    saasClient
      .get("/saas/admin/ai/settings/voices", {
        params: apiKey ? { api_key: apiKey } : undefined,
        timeout: 40000,
      })
      .then((r) => r.data),
  /** A one-time ticket for the live WebSocket. */
  liveTicket: (persona, language) =>
    saasClient
      .post("/saas/admin/ai/live/ticket", { persona, language })
      .then((r) => r.data),
  testVoice: (payload) =>
    saasClient
      .post("/saas/admin/ai/settings/voice-test", payload, { timeout: 60000 })
      .then((r) => r.data),
};
