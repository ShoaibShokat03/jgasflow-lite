// src/api/saasApi.js
import saasClient from "./saasClient";

/**
 * The JGasFlow console API (`/api/platform/*` and `/api/platform/ai/*`).
 * Every call returns the response body.
 */
const get = (url, params) => saasClient.get(url, { params }).then((r) => r.data);
const post = (url, body = {}) => saasClient.post(url, body).then((r) => r.data);
const put = (url, body = {}) => saasClient.put(url, body).then((r) => r.data);
const del = (url) => saasClient.delete(url).then((r) => r.data);

// ── Auth ────────────────────────────────────────────────────────
export const saasAuthApi = {
  /** Signs in with phone or email. Only platform admins may use the console. */
  login: (login, password) =>
    post("/auth/login", { login, password, client: "web", device: "JGasFlow Console" }),
  /** Console profile: role and the modules this admin may open. */
  me: () => get("/platform/me"),
  profile: () => get("/auth/me"),
  updateProfile: (payload) => put("/auth/me", payload),
  logout: () => post("/auth/logout"),
  changePassword: (current, next) => post("/auth/password", { current, next }),
  sessions: () => get("/auth/sessions"),
  revokeSession: (id) => del(`/auth/sessions/${id}`),
};

// ── Platform ────────────────────────────────────────────────────
export const platformApi = {
  overview: () => get("/platform/overview"),

  shops: (params) => get("/platform/shops", params),
  shop: (id) => get(`/platform/shops/${id}`),
  updateShop: (id, payload) => put(`/platform/shops/${id}`, payload),
  extend: (id, payload) => post(`/platform/shops/${id}/extend`, payload),
  setExpiry: (id, payload) => post(`/platform/shops/${id}/expiry`, payload),
  setStatus: (id, payload) => post(`/platform/shops/${id}/status`, payload),
  setNote: (id, note) => post(`/platform/shops/${id}/note`, { note }),
  impersonate: (id) => post(`/platform/shops/${id}/impersonate`),
  resetPassword: (userId, password) => post(`/platform/users/${userId}/password`, { password }),
  logoutUser: (userId) => post(`/platform/users/${userId}/logout`),
  releaseDevice: (deviceId) => post(`/platform/devices/${deviceId}/release`),

  payments: (params) => get("/platform/payments", params),
  recordPayment: (payload) => post("/platform/payments", payload),
  approve: (id, note = "") => post(`/platform/payments/${id}/approve`, { note }),
  reject: (id, note) => post(`/platform/payments/${id}/reject`, { note }),

  /** Active plans with their 1, 3, 6 and 12 month prices (any admin may read). */
  activePlans: () => get("/billing/plans").then((d) => d.plans || []),
  plans: () => get("/platform/plans"),
  createPlan: (payload) => post("/platform/plans", payload),
  updatePlan: (key, payload) => put(`/platform/plans/${key}`, payload),
  deletePlan: (key) => del(`/platform/plans/${key}`),

  reports: (params) => get("/platform/reports", params),
  events: (params) => get("/platform/events", params),

  settings: () => get("/platform/settings"),
  saveSettings: (payload) => put("/platform/settings", payload),
  testSmtp: (to) => post("/platform/settings/smtp-test", { to }),
  clearSmtpPassword: () => post("/platform/settings/smtp-clear", {}),

  proofUrl: (paymentId) => `/platform/payments/${paymentId}/proof`,

  admins: () => get("/platform/admins"),
  createAdmin: (payload) => post("/platform/admins", payload),
  updateAdmin: (id, payload) => put(`/platform/admins/${id}`, payload),
  removeAdmin: (id) => del(`/platform/admins/${id}`),
};

// ── Support inbox ───────────────────────────────────────────────
/** A form with picture files (replies with screenshots). */
const postForm = (url, fields, files = []) => {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => v !== undefined && v !== null && fd.append(k, String(v)));
  files.forEach((f) => fd.append("files", f, f.name || "screenshot.png"));
  return saasClient.post(url, fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 }).then((r) => r.data);
};
export const supportApi = {
  inbox: (params) => get("/platform/support", params),
  get: (id) => get(`/platform/support/${id}`),
  reply: (id, message, files, status) => postForm(`/platform/support/${id}/messages`, { message, status }, files),
  setStatus: (id, status) => post(`/platform/support/${id}/status`, { status }),
  fileUrl: (messageId) => `/platform/support/files/${messageId}`,
};

// ── AI Assistant ────────────────────────────────────────────────
// Read-only: the assistant looks things up across every shop and reports.
// `ask` can take 10 to 30 s (several tool calls before answering), so it has
// its own timeout.
const AI = "/platform/ai";
export const saasAiApi = {
  capabilities: () => get(`${AI}/capabilities`),
  ask: (payload) => saasClient.post(`${AI}/ask`, payload, { timeout: 120000 }).then((r) => r.data),
  personas: () => get(`${AI}/personas`),
  conversations: () => get(`${AI}/conversations`),
  conversation: (id) => get(`${AI}/conversations/${id}`),
  removeConversation: (id) => saasClient.delete(`${AI}/conversations/${id}`),
  runs: (params) => get(`${AI}/runs`, params),

  // provider configuration (the key is write-only: settings returns a mask)
  settings: () => get(`${AI}/settings`),
  updateSettings: (payload) => saasClient.patch(`${AI}/settings`, payload).then((r) => r.data),
  models: (apiKey) =>
    saasClient
      .get(`${AI}/settings/models`, { params: apiKey ? { api_key: apiKey } : undefined, timeout: 30000 })
      .then((r) => r.data),
  testSettings: (payload) =>
    saasClient.post(`${AI}/settings/test`, payload, { timeout: 40000 }).then((r) => r.data),

  // voice: both directions go through our API so the voice key never reaches the browser
  transcribe: (blob) => {
    const form = new FormData();
    form.append("file", blob, "question.webm");
    return saasClient
      .post(`${AI}/voice/transcribe`, form, {
        timeout: 60000,
        // Required: the client defaults to JSON, which would drop the multipart boundary.
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  speak: (text, persona) =>
    saasClient
      .post(`${AI}/voice/speak`, { text, persona }, { responseType: "blob", timeout: 90000 })
      .then((r) => r.data),
  voices: (apiKey) =>
    saasClient
      .get(`${AI}/settings/voices`, { params: apiKey ? { api_key: apiKey } : undefined, timeout: 40000 })
      .then((r) => r.data),
  liveTicket: (persona, language) => post(`${AI}/live/ticket`, { persona, language }),
  testVoice: (payload) =>
    saasClient.post(`${AI}/settings/voice-test`, payload, { timeout: 60000 }).then((r) => r.data),
};
