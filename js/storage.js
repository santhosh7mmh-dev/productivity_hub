/**
 * storage.js
 * ----------
 * The app's settings/preferences layer. Where db.js is a generic
 * low-level store, this module is the specific, typed API the rest of
 * the app calls to read/write user preferences — theme, accent color,
 * font size, motion settings, sidebar collapse state, and encrypted
 * AI provider keys. Everything here is backed by the `kv` object store.
 * @module storage
 */

import { get as dbGet, put as dbPut } from './db.js';
import { encryptString, decryptString } from './utils/crypto.js';

const DEFAULTS = {
  theme: 'dark',
  fontSize: 'md',
  accent: 'violet',
  reduceMotion: false,
  sidebarCollapsed: false,
  aiDefaultProvider: 'free',
  aiFreeModel: 'gpt-5.4-nano',
  aiSystemPrompt: 'You are a helpful, concise assistant embedded in a personal productivity app.',
  aiTemperature: 0.7
};

/** Named accent presets — swatches in Settings map to these. Each sets
 *  both the primary (--accent) and secondary (--accent-2) token so the
 *  two-tone signature look is preserved across every preset. */
export const ACCENT_PRESETS = {
  violet: { accent: '#7c6fee', accent2: '#f5b942', label: 'Violet & amber' },
  ocean: { accent: '#3fb1e0', accent2: '#f5b942', label: 'Ocean & amber' },
  rose: { accent: '#ef6f9e', accent2: '#4fd1a5', label: 'Rose & mint' },
  forest: { accent: '#4fd1a5', accent2: '#f5b942', label: 'Forest & amber' },
  mono: { accent: '#c7cbe0', accent2: '#8b93a7', label: 'Monochrome' }
};

/**
 * Reads a single preference, falling back to its default if unset.
 * @param {keyof typeof DEFAULTS} key
 */
export async function getPref(key) {
  const record = await dbGet('kv', `pref.${key}`);
  return record ? record.value : DEFAULTS[key];
}

/**
 * Writes a single preference.
 * @param {keyof typeof DEFAULTS} key
 * @param {*} value
 */
export async function setPref(key, value) {
  await dbPut('kv', { key: `pref.${key}`, value });
  document.dispatchEvent(new CustomEvent('pref:change', { detail: { key, value } }));
}

/** Reads every preference at once (used at boot to apply the theme before first paint). */
export async function getAllPrefs() {
  const entries = await Promise.all(Object.keys(DEFAULTS).map(async (key) => [key, await getPref(key)]));
  return Object.fromEntries(entries);
}

/* ============================================================
   Encrypted AI provider keys
   ------------------------------------------------------------
   Stored as { provider, encrypted } records under the kv store's
   `aikey.<provider>` keys. A key is only ever decrypted transiently
   in memory when a chat request is made (see js/modules/ai/*),
   never re-persisted in plaintext.
   ============================================================ */

/**
 * Encrypts and stores an API key for a provider ('openai' | 'gemini' | 'openrouter').
 * @param {string} provider
 * @param {string} apiKey
 * @param {string} passphrase
 */
export async function saveProviderKey(provider, apiKey, passphrase) {
  const encrypted = await encryptString(apiKey, passphrase);
  await dbPut('kv', { key: `aikey.${provider}`, value: encrypted });
}

/**
 * Decrypts a previously stored provider key.
 * @param {string} provider
 * @param {string} passphrase
 * @returns {Promise<string|null>} null if no key is stored for this provider
 */
export async function loadProviderKey(provider, passphrase) {
  const record = await dbGet('kv', `aikey.${provider}`);
  if (!record) return null;
  return decryptString(record.value, passphrase);
}

/** Returns which providers currently have a stored (encrypted) key, without decrypting anything. */
export async function listConfiguredProviders() {
  const providers = ['openai', 'gemini', 'openrouter'];
  const results = await Promise.all(providers.map(async (p) => [p, !!(await dbGet('kv', `aikey.${p}`))]));
  return Object.fromEntries(results);
}

/** Removes a stored provider key entirely. */
export async function clearProviderKey(provider) {
  await dbPut('kv', { key: `aikey.${provider}`, value: null });
}

export { DEFAULTS as PREF_DEFAULTS };
