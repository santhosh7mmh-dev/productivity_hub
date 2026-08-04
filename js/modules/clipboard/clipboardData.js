/**
 * clipboardData.js
 * ----------------
 * Data layer for the Clipboard Manager module (Phase 4). Owns the shape
 * of a clipboard item and every read/write against the `clipboardItems`
 * store already declared in db.js's schema. Same split as
 * notesData.js/notes.js.
 *
 * Item shape:
 *   { id, text, category, pinned, createdAt }
 * @module modules/clipboard/clipboardData
 */

import { get, put, remove, getAll } from '../../db.js';
import { uuid } from '../../utils/helpers.js';

const STORE = 'clipboardItems';

export const DEFAULT_CATEGORIES = ['General', 'Links', 'Code', 'Snippets'];

/** Adds a new clipboard item. De-dupes against the most recent item with
 *  identical text so repeat copies of the same thing don't spam the list. */
export async function addClipboardItem(text, category = 'General') {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  const all = await getAll(STORE);
  const dupe = all.find((i) => i.text === trimmed && !i.pinned);
  if (dupe) {
    return updateClipboardItem(dupe.id, { createdAt: Date.now() });
  }

  const item = {
    id: uuid(),
    text: trimmed,
    category,
    pinned: false,
    createdAt: Date.now()
  };
  await put(STORE, item);
  return item;
}

export async function getClipboardItem(id) {
  return get(STORE, id);
}

export async function updateClipboardItem(id, patch) {
  const existing = await get(STORE, id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, id };
  await put(STORE, updated);
  return updated;
}

export async function deleteClipboardItem(id) {
  await remove(STORE, id);
}

export async function togglePinItem(id) {
  const item = await get(STORE, id);
  if (!item) return null;
  return updateClipboardItem(id, { pinned: !item.pinned });
}

export async function clearUnpinned() {
  const all = await getAll(STORE);
  for (const item of all) {
    if (!item.pinned) await remove(STORE, item.id);
  }
}

/**
 * Lists items, optionally filtered by category, sorted pinned-first then
 * most recent.
 * @param {{category?: string, query?: string}} [opts]
 */
export async function listClipboardItems(opts = {}) {
  let all = await getAll(STORE);
  if (opts.category && opts.category !== 'All') {
    all = all.filter((i) => i.category === opts.category);
  }
  if (opts.query) {
    const q = opts.query.toLowerCase();
    all = all.filter((i) => i.text.toLowerCase().includes(q));
  }
  return all.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

/** Every distinct category currently in use, plus the defaults, sorted. */
export async function getAllCategories() {
  const all = await getAll(STORE);
  const set = new Set(DEFAULT_CATEGORIES);
  all.forEach((i) => set.add(i.category || 'General'));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Counts saved items — used for the dashboard stat card. */
export async function countClipboardItems() {
  return (await getAll(STORE)).length;
}
