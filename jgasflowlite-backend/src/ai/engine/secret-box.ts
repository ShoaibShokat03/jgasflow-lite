/**
 * Encrypting a stored credential at rest.
 *
 * The provider API key is a spendable secret: anyone who reads it can run up a
 * bill on the platform's account. It arrives from an admin form and has to be
 * usable again later, so it cannot be hashed — it has to be reversible, which
 * means the honest goal here is narrow and worth stating:
 *
 *   IN SCOPE  — a database dump, a backup file, a replica, or a stray SELECT
 *               does not hand over a working key.
 *   NOT       — an attacker who already has the application's environment.
 *               They hold the wrapping key and can decrypt. Nothing stored by
 *               the app can defend against that; a KMS or a secrets manager is
 *               the answer if that threat matters.
 *
 * AES-256-GCM, so the ciphertext is authenticated: a tampered row fails to
 * decrypt rather than silently yielding a wrong key that produces a confusing
 * 403 from the provider later.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard
const VERSION = 'v1';

/**
 * The wrapping key.
 *
 * Derived from a dedicated secret if one is set, otherwise from the platform
 * JWT secret, which every deployment already has and already treats as
 * sensitive. Hashing to 32 bytes means the source can be any length.
 *
 * Read per call rather than cached at import: a test or a boot script may set
 * the variable after this module is first loaded.
 */
function wrappingKey(): Buffer {
  const source =
    process.env.AI_SECRET_KEY?.trim() ||
    process.env.SAAS_JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim();

  if (!source) {
    throw new Error(
      'Cannot store the AI provider key: set AI_SECRET_KEY (or SAAS_JWT_SECRET) in the backend environment first.',
    );
  }
  return createHash('sha256').update(source).digest();
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, wrappingKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Returns null rather than throwing when the stored value cannot be read.
 *
 * The realistic cause is a changed wrapping secret — someone rotated
 * SAAS_JWT_SECRET, which is a perfectly reasonable thing to do without
 * realising it also wrapped this key. The assistant should then report itself
 * unconfigured and ask for the key again, not crash every request.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const [, iv, tag, ciphertext] = parts;
    const decipher = createDecipheriv(
      ALGORITHM,
      wrappingKey(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * What the admin panel is allowed to see: enough to recognise which key is in
 * place, never enough to use it. A short value is hidden entirely rather than
 * mostly revealed.
 */
export function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  if (secret.length < 12) return '•'.repeat(8);
  return `${secret.slice(0, 6)}${'•'.repeat(6)}${secret.slice(-4)}`;
}
