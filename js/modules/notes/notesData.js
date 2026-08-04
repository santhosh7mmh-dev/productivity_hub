/**
 * notesData.js
 * ------------
 * Data layer for the Notes module. Owns the shape of a note record and
 * every read/write against the `notes` store (already declared in
 * db.js's schema). The UI (notes.js) never touches db.js directly —
 * it goes through the typed functions here, same split as
 * storage.js/db.js for preferences.
 *
 * Note shape:
 *   { id, title, body, tags: string[], pinned, archived, trashed,
 *     createdAt, updatedAt }
 * @module modules/notes/notesData
 */

import { get, put, remove, getAll } from '../../db.js';
import { uuid } from '../../utils/helpers.js';
import { markdownToPlainText } from '../../utils/markdown.js';

const STORE = 'notes';

/** Creates a new note and persists it immediately (empty notes are
 *  valid — the editor autosaves as the person types).
 * @param {{title?: string, body?: string, tags?: string[]}} [initial]
 * @returns {Promise<Object>}
 */
export async function createNote(initial = {}) {
  const now = Date.now();
  const note = {
    id: uuid(),
    title: initial.title ?? '',
    body: initial.body ?? '',
    tags: initial.tags ?? [],
    pinned: false,
    archived: false,
    trashed: false,
    createdAt: now,
    updatedAt: now
  };
  await put(STORE, note);
  return note;
}

/** Fetches a single note by id, or null if it doesn't exist. */
export async function getNote(id) {
  return get(STORE, id);
}

/**
 * Merges `patch` into an existing note and bumps `updatedAt`. No-ops
 * silently if the note was deleted out from under the caller (e.g. two
 * tabs open) rather than throwing mid-autosave.
 * @param {string} id
 * @param {Object} patch
 */
export async function updateNote(id, patch) {
  const existing = await get(STORE, id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, id, updatedAt: Date.now() };
  await put(STORE, updated);
  return updated;
}

/** Permanently deletes a note (only ever called from the Trash view). */
export async function deleteNoteForever(id) {
  await remove(STORE, id);
}

/** Moves a note to Trash (soft delete — recoverable from the Trash tab). */
export async function trashNote(id) {
  return updateNote(id, { trashed: true, pinned: false });
}

/** Restores a trashed note back to the main list. */
export async function restoreNote(id) {
  return updateNote(id, { trashed: false });
}

export async function togglePin(id) {
  const note = await get(STORE, id);
  if (!note) return null;
  return updateNote(id, { pinned: !note.pinned });
}

export async function toggleArchive(id) {
  const note = await get(STORE, id);
  if (!note) return null;
  return updateNote(id, { archived: !note.archived, pinned: false });
}

/** Creates a copy of a note (title suffixed, unpinned, timestamps reset). */
export async function duplicateNote(id) {
  const note = await get(STORE, id);
  if (!note) return null;
  return createNote({
    title: note.title ? `${note.title} (copy)` : '',
    body: note.body,
    tags: [...note.tags]
  });
}

/**
 * Lists notes for a given view, sorted pinned-first then by most
 * recently updated.
 * @param {'all'|'pinned'|'archived'|'trash'} view
 * @param {{tag?: string}} [opts]
 */
export async function listNotes(view = 'all', opts = {}) {
  const all = await getAll(STORE);
  let filtered;
  if (view === 'trash') filtered = all.filter((n) => n.trashed);
  else if (view === 'archived') filtered = all.filter((n) => n.archived && !n.trashed);
  else if (view === 'pinned') filtered = all.filter((n) => n.pinned && !n.archived && !n.trashed);
  else filtered = all.filter((n) => !n.archived && !n.trashed);

  if (opts.tag) filtered = filtered.filter((n) => n.tags.includes(opts.tag));

  return filtered.sort((a, b) => {
    if (view === 'all' && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

/** Every distinct tag currently in use across non-trashed notes, sorted alphabetically. */
export async function getAllTags() {
  const all = (await getAll(STORE)).filter((n) => !n.trashed);
  const set = new Set();
  all.forEach((n) => n.tags.forEach((t) => set.add(t)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** A short plain-text preview of a note's body, for list rows and search results. */
export function notePreview(note, maxLen = 90) {
  const text = markdownToPlainText(note.body).replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? `${text.slice(0, maxLen).trim()}…` : text;
}

/** Counts non-trashed notes — used for the dashboard stat card. */
export async function countActiveNotes() {
  const all = await getAll(STORE);
  return all.filter((n) => !n.trashed).length;
}
