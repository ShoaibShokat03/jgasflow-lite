/**
 * Encoding a tool result for the model — and the byte cap.
 *
 * Every turn resends the whole conversation, so one fat tool result is not a
 * one-off cost: it is paid again on every subsequent turn of the run.
 */

/**
 * 64 KB per result. A ROW limit would not save us — one row carrying a 2 MB
 * notes column blows the context just as effectively as ten thousand rows.
 */
export const MAX_RESULT_BYTES = 64 * 1024;

/**
 * Truncation must be ANNOUNCED. Silent truncation is the worst failure in the
 * system: nothing throws, nothing logs, and the model confidently summarises a
 * fragment as if it were the whole result.
 */
const TRUNCATION_NOTE =
  'This result was too large to read in full and was cut off. Tell the user the ' +
  'data was too large, give them the figures below if they are complete, and ask ' +
  'them to narrow the request (a shorter date range, a filter, or a smaller limit). ' +
  'Do NOT summarise the fragment as if it were the whole result, and do not total ' +
  'anything from it.';

export function encodeToolResult(
  value: unknown,
  maxBytes = MAX_RESULT_BYTES,
): string {
  const json = safeStringify(value);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes <= maxBytes) return json;

  /**
   * The fragment is JSON text, so embedding it in the envelope ESCAPES every
   * quote and backslash it contains — which can nearly double its size. A byte
   * budget worked out before escaping therefore overshoots the cap, so the
   * fragment is shrunk against the encoded length until it actually fits.
   */
  const envelope = (fragment: string) =>
    safeStringify({
      truncated: true,
      original_bytes: bytes,
      note: TRUNCATION_NOTE,
      fragment,
    });

  let room = Math.max(256, maxBytes - Buffer.byteLength(envelope(''), 'utf8') - 64);
  let out = envelope(slice(json, room));

  for (let i = 0; i < 6 && Buffer.byteLength(out, 'utf8') > maxBytes; i++) {
    const ratio = maxBytes / Buffer.byteLength(out, 'utf8');
    room = Math.max(128, Math.floor(room * ratio * 0.9));
    out = envelope(slice(json, room));
  }

  return out;
}

/** Cut to a byte length. A split multi-byte character becomes a replacement
 *  character, which is harmless in a fragment that is explicitly incomplete. */
function slice(json: string, bytes: number): string {
  return Buffer.from(json, 'utf8').subarray(0, bytes).toString('utf8');
}

/**
 * JSON.stringify that cannot throw the whole run away.
 *
 * `bigint` is the live hazard here: MySQL bigint columns come back as strings
 * through TypeORM, but a hand-rolled raw query or a COUNT can still hand us a
 * real bigint, and JSON.stringify throws on those.
 */
function safeStringify(value: unknown): string {
  try {
    return (
      JSON.stringify(value, (_k, v) => {
        if (typeof v === 'bigint') return v.toString();
        if (v instanceof Date) return v.toISOString();
        return v;
      }) ?? 'null'
    );
  } catch {
    return JSON.stringify({
      error: 'This result could not be encoded. Tell the user the tool returned data you could not read.',
    });
  }
}

/** True when an encoded result is one of our truncation envelopes. */
export const wasTruncated = (encoded: string): boolean =>
  encoded.startsWith('{"truncated":true');
