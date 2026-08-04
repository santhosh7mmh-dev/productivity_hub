/**
 * crypto.js
 * ---------
 * Local-only encryption for sensitive settings (namely, bring-your-own
 * AI provider API keys — see Module 4). Nothing here ever leaves the
 * browser; this exists so a stored key isn't sitting in IndexedDB as
 * plain text, not to protect against someone with access to the
 * device itself (that's outside what client-side crypto can promise).
 *
 * Uses AES-GCM with a key derived via PBKDF2 from a local passphrase.
 * The passphrase itself is never stored — only a random salt is, so
 * the same derivation can be repeated when the passphrase is re-entered.
 * @module utils/crypto
 */

const PBKDF2_ITERATIONS = 150000;
const SALT_STORAGE_KEY = 'hub.crypto.salt.v1';

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

/** Reads (or creates + persists) the local salt used for key derivation. */
function getOrCreateSalt() {
  let stored = localStorage.getItem(SALT_STORAGE_KEY);
  if (stored) return base64ToBuf(stored);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_STORAGE_KEY, bufToBase64(salt));
  return salt.buffer;
}

/**
 * Derives an AES-GCM CryptoKey from a passphrase using PBKDF2.
 * @param {string} passphrase
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(passphrase) {
  const salt = getOrCreateSalt();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts `plaintext` with a key derived from `passphrase`.
 * @param {string} plaintext
 * @param {string} passphrase
 * @returns {Promise<string>} a single base64 string containing iv + ciphertext
 */
export async function encryptString(plaintext, passphrase) {
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return bufToBase64(combined.buffer);
}

/**
 * Decrypts a payload produced by {@link encryptString}.
 * @param {string} payload
 * @param {string} passphrase
 * @returns {Promise<string>}
 * @throws if the passphrase is wrong or the payload is corrupt
 */
export async function decryptString(payload, passphrase) {
  const key = await deriveKey(passphrase);
  const combined = new Uint8Array(base64ToBuf(payload));
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}

/**
 * Convenience check: does decrypting `payload` with `passphrase`
 * succeed at all? Used to validate a passphrase without needing the
 * caller to try/catch decryptString directly.
 * @returns {Promise<boolean>}
 */
export async function canDecrypt(payload, passphrase) {
  try {
    await decryptString(payload, passphrase);
    return true;
  } catch {
    return false;
  }
}
