import axios from 'axios';
import { API_URL } from './api';
import { session } from './session';

/**
 * POST that answers with Server-Sent Events, read with fetch so it can carry
 * the bearer token (EventSource cannot). Calls onEvent({ type, ...data }) for
 * each event as it arrives. A 401 refreshes the token once and retries.
 */
export function streamPost(path, body, opts = {}) {
  return streamRequest('POST', path, body, opts);
}

/** A long-lived GET event stream (for example the voice data feed). */
export function streamGet(path, opts = {}) {
  return streamRequest('GET', path, undefined, opts);
}

async function streamRequest(method, path, body, { onEvent, signal } = {}) {
  const open = (token) =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal,
    });

  let res = await open(session.accessToken());
  if (res.status === 401 && session.refreshToken()) {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: session.refreshToken() });
    session.store(data);
    res = await open(data.access_token);
  }
  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      message = Array.isArray(j.message) ? j.message.join(' ') : j.message || message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (!data) continue; // heartbeat comment
      try {
        onEvent?.(JSON.parse(data));
      } catch {
        /* malformed event, skip */
      }
    }
  }
}
