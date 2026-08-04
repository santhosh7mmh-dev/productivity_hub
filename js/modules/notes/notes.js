/**
 * notes.js
 * --------
 * Phase 2: the Notes view. A two-pane list/editor layout — a filterable,
 * searchable list of notes on the left, a Markdown editor with live
 * preview on the right. Follows the same "render whole panel, re-render
 * on state change" style as settings.js, split into a `paintList` /
 * `paintEditor` pair so autosave can refresh the list (title, snippet,
 * ordering) without touching the editor pane and stealing focus out of
 * whatever field the person is typing in.
 *
 * Registers a global search provider and command-palette actions at
 * import time (once, at boot) so Notes participates in Ctrl+K / Ctrl+/
 * even when it isn't the active route — the same pattern search.js
 * itself uses for its built-in "Go to" provider.
 * @module modules/notes/notes
 */

import {
  createNote, getNote, updateNote, trashNote, restoreNote, deleteNoteForever,
  togglePin, toggleArchive, duplicateNote, listNotes, getAllTags, notePreview
} from './notesData.js';
import { registerSearchProvider } from '../../components/search.js';
import { registerCommand } from '../../components/commandPalette.js';
import { navigate } from '../../router.js';
import { confirmDialog } from '../../components/modal.js';
import { toastSuccess, toastInfo } from '../../components/toast.js';
import { downloadText } from '../../utils/export.js';
import { renderMarkdown, markdownToPlainText } from '../../utils/markdown.js';
import { escapeHtml, debounce, formatRelativeTime, formatDateTime, countWords, fuzzyScore, slugify } from '../../utils/helpers.js';

const VIEWS = [
  { key: 'all', label: 'All', icon: '📝' },
  { key: 'pinned', label: 'Pinned', icon: '📌' },
  { key: 'archived', label: 'Archived', icon: '🗄' },
  { key: 'trash', label: 'Trash', icon: '🗑' }
];

/** Module-level UI state. Only one Notes view is ever mounted at a
 *  time, so — same as search.js/commandPalette.js — plain module
 *  variables are simpler here than threading state through closures. */
const state = {
  view: 'all',
  tagFilter: null,
  query: '',
  selectedId: null,
  editorMode: 'split' // 'split' | 'edit' | 'preview'
};

let containerRef = null;
let saveIndicatorTimer = null;

/* ============================================================
   Search + command palette integration (registered once, at import)
   ============================================================ */

registerSearchProvider('Notes', async (query) => {
  const notes = await listNotes('all');
  return notes
    .map((n) => ({ note: n, score: Math.max(fuzzyScore(query, n.title || 'Untitled note'), fuzzyScore(query, markdownToPlainText(n.body).slice(0, 400))) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ note }) => ({
      id: `note.${note.id}`,
      title: note.title || 'Untitled note',
      snippet: notePreview(note),
      icon: '📝',
      onOpen: () => navigate('notes', { id: note.id })
    }));
});

registerCommand({
  id: 'action.new-note',
  group: 'Create',
  label: 'New note',
  icon: '📝',
  run: () => navigate('notes', { action: 'new' })
});

/* ============================================================
   Route entry point
   ============================================================ */

export async function renderNotes(container, params) {
  containerRef = container;

  const action = params.get('action');
  const paramId = params.get('id');

  if (action === 'new') {
    const note = await createNote();
    navigate('notes', { id: note.id }); // drops ?action=new from the URL so re-renders don't create duplicates
    return;
  }

  if (paramId) state.selectedId = paramId;
  else if (state.selectedId === null) {
    const first = await listNotes(state.view);
    state.selectedId = first[0]?.id || null;
  }

  await paintShell(container);

  return function cleanup() {
    clearTimeout(saveIndicatorTimer);
    containerRef = null;
  };
}

/* ============================================================
   Shell — renders the two-pane layout once; list/editor panes
   repaint independently after that.
   ============================================================ */

async function paintShell(container) {
  container.innerHTML = `
    <div class="notes-layout">
      <aside class="notes-list-pane glass-panel">
        <div class="notes-list-head">
          <div class="notes-view-tabs" id="notesViewTabs">
            ${VIEWS.map((v) => `<button class="nvt ${v.key === state.view ? 'active' : ''}" data-view="${v.key}">${v.icon} ${v.label}</button>`).join('')}
          </div>
          <div class="field" style="margin-top: var(--sp-3);">
            <input type="text" class="input" id="notesSearchInput" placeholder="Filter notes…" value="${escapeHtml(state.query)}">
          </div>
          <div class="notes-tag-filter" id="notesTagFilter"></div>
        </div>
        <div class="notes-list-scroll" id="notesListScroll"></div>
        <button class="btn btn-primary notes-new-btn" id="notesNewBtn">+ New note</button>
      </aside>
      <section class="notes-editor-pane" id="notesEditorPane"></section>
    </div>`;

  container.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      state.tagFilter = null;
      paintList();
    });
  });

  document.getElementById('notesNewBtn').addEventListener('click', async () => {
    const note = await createNote();
    state.selectedId = note.id;
    state.view = 'all';
    await paintShell(containerRef);
  });

  const searchInput = document.getElementById('notesSearchInput');
  searchInput.addEventListener('input', debounce(() => {
    state.query = searchInput.value;
    paintList();
  }, 150));

  await paintTagFilter();
  await paintList();
  await paintEditor();
}

async function paintTagFilter() {
  const tags = await getAllTags();
  const el = document.getElementById('notesTagFilter');
  if (!el) return;
  if (!tags.length) { el.innerHTML = ''; return; }
  el.innerHTML = tags.map((t) => `
    <button class="tag-chip notes-tag-chip ${state.tagFilter === t ? 'selected' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>
  `).join('');
  el.querySelectorAll('[data-tag]').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.tagFilter = state.tagFilter === chip.dataset.tag ? null : chip.dataset.tag;
      paintList();
      paintTagFilter();
    });
  });
}

/* ============================================================
   List pane
   ============================================================ */

async function paintList() {
  const scroll = document.getElementById('notesListScroll');
  if (!scroll) return;

  let notes = await listNotes(state.view, { tag: state.tagFilter || undefined });
  const q = state.query.trim();
  if (q) {
    notes = notes
      .map((n) => ({ n, score: Math.max(fuzzyScore(q, n.title || ''), fuzzyScore(q, markdownToPlainText(n.body).slice(0, 300))) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.n);
  }

  document.querySelectorAll('#notesViewTabs .nvt').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === state.view));

  if (!notes.length) {
    scroll.innerHTML = `
      <div class="empty-state" style="padding: var(--sp-8) var(--sp-4);">
        <div class="es-icon">${q ? '🔍' : VIEWS.find((v) => v.key === state.view)?.icon || '📝'}</div>
        <h3>${q ? 'No matches' : emptyTitleFor(state.view)}</h3>
        <p>${q ? 'Try a different search term.' : emptyBodyFor(state.view)}</p>
      </div>`;
    return;
  }

  scroll.innerHTML = notes.map((n) => `
    <button class="note-card ${n.id === state.selectedId ? 'active' : ''}" data-id="${n.id}">
      <div class="nc-top">
        <span class="nc-title">${n.pinned ? '📌 ' : ''}${escapeHtml(n.title || 'Untitled note')}</span>
        <span class="nc-time">${formatRelativeTime(n.updatedAt)}</span>
      </div>
      ${notePreview(n) ? `<p class="nc-snippet">${escapeHtml(notePreview(n))}</p>` : ''}
      ${n.tags.length ? `<div class="nc-tags">${n.tags.slice(0, 3).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </button>
  `).join('');

  scroll.querySelectorAll('.note-card').forEach((card) => {
    card.addEventListener('click', () => {
      state.selectedId = card.dataset.id;
      scroll.querySelectorAll('.note-card').forEach((c) => c.classList.toggle('active', c === card));
      paintEditor();
    });
  });
}

function emptyTitleFor(view) {
  return { all: 'No notes yet', pinned: 'Nothing pinned', archived: 'Nothing archived', trash: 'Trash is empty' }[view];
}
function emptyBodyFor(view) {
  return {
    all: 'Create your first note to get started.',
    pinned: 'Pin a note to keep it at the top of your list.',
    archived: 'Archived notes are hidden from the main list but never deleted.',
    trash: 'Deleted notes stay here until you delete them forever.'
  }[view];
}

/* ============================================================
   Editor pane
   ============================================================ */

async function paintEditor() {
  const pane = document.getElementById('notesEditorPane');
  if (!pane) return;

  const note = state.selectedId ? await getNote(state.selectedId) : null;
  if (!note) {
    pane.innerHTML = `
      <div class="empty-state" style="height: 100%; justify-content: center;">
        <div class="es-icon">📝</div>
        <h3>No note selected</h3>
        <p>Pick a note from the list, or create a new one.</p>
      </div>`;
    return;
  }

  const inTrash = note.trashed;

  pane.innerHTML = `
    <div class="notes-editor-toolbar">
      <div class="net-format" ${inTrash ? 'style="visibility:hidden;"' : ''}>
        <button class="btn btn-ghost btn-sm" data-fmt="bold" data-tooltip="Bold"><strong>B</strong></button>
        <button class="btn btn-ghost btn-sm" data-fmt="italic" data-tooltip="Italic"><em>I</em></button>
        <button class="btn btn-ghost btn-sm" data-fmt="code" data-tooltip="Inline code">&lt;/&gt;</button>
        <button class="btn btn-ghost btn-sm" data-fmt="link" data-tooltip="Link">🔗</button>
        <button class="btn btn-ghost btn-sm" data-fmt="ul" data-tooltip="Bullet list">•</button>
        <button class="btn btn-ghost btn-sm" data-fmt="h2" data-tooltip="Heading">H</button>
      </div>
      <div class="net-modes">
        <button class="btn btn-sm ${state.editorMode === 'edit' ? 'btn-primary' : 'btn-secondary'}" data-mode="edit">Edit</button>
        <button class="btn btn-sm ${state.editorMode === 'split' ? 'btn-primary' : 'btn-secondary'}" data-mode="split">Split</button>
        <button class="btn btn-sm ${state.editorMode === 'preview' ? 'btn-primary' : 'btn-secondary'}" data-mode="preview">Preview</button>
      </div>
      <div class="net-actions">
        <span class="save-indicator" id="saveIndicator"></span>
        ${inTrash ? `
          <button class="btn btn-secondary btn-sm" id="restoreBtn">Restore</button>
          <button class="btn btn-danger btn-sm" id="deleteForeverBtn">Delete forever</button>
        ` : `
          <button class="btn btn-ghost btn-sm" id="pinBtn" data-tooltip="${note.pinned ? 'Unpin' : 'Pin'}">${note.pinned ? '📌' : '📍'}</button>
          <button class="btn btn-ghost btn-sm" id="duplicateBtn" data-tooltip="Duplicate">⧉</button>
          <button class="btn btn-ghost btn-sm" id="exportBtn" data-tooltip="Export as .md">⬇</button>
          <button class="btn btn-ghost btn-sm" id="archiveBtn" data-tooltip="${note.archived ? 'Unarchive' : 'Archive'}">🗄</button>
          <button class="btn btn-ghost btn-sm" id="trashBtn" data-tooltip="Move to trash">🗑</button>
        `}
      </div>
    </div>

    <input type="text" class="notes-title-input" id="notesTitleInput" placeholder="Untitled note" value="${escapeHtml(note.title)}" ${inTrash ? 'disabled' : ''}>

    <div class="notes-tag-editor" id="notesTagEditor">
      ${note.tags.map((t) => `<span class="tag-chip note-tag-chip">${escapeHtml(t)}${inTrash ? '' : `<button data-remove-tag="${escapeHtml(t)}" aria-label="Remove tag">✕</button>`}</span>`).join('')}
      ${inTrash ? '' : '<input type="text" class="notes-tag-input" id="notesTagInput" placeholder="Add tag…">'}
    </div>

    <div class="notes-editor-body mode-${state.editorMode}">
      <textarea class="notes-textarea" id="notesTextarea" placeholder="Start writing in Markdown…" ${inTrash ? 'disabled' : ''}>${note.body}</textarea>
      <div class="notes-preview markdown-body" id="notesPreview">${renderMarkdown(note.body)}</div>
    </div>

    <div class="notes-editor-footer">
      <span>${countWords(note.body)} words</span>
      <span>Updated ${formatDateTime(note.updatedAt)}</span>
    </div>
  `;

  wireEditorEvents(note, inTrash);
}

function wireEditorEvents(note, inTrash) {
  const pane = document.getElementById('notesEditorPane');

  pane.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editorMode = btn.dataset.mode;
      paintEditor();
    });
  });

  if (inTrash) {
    document.getElementById('restoreBtn').addEventListener('click', async () => {
      await restoreNote(note.id);
      toastSuccess('Note restored');
      paintList(); paintEditor();
    });
    document.getElementById('deleteForeverBtn').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete forever?',
        message: 'This permanently removes the note. This can\u2019t be undone.',
        confirmLabel: 'Delete forever',
        danger: true
      });
      if (!ok) return;
      await deleteNoteForever(note.id);
      state.selectedId = null;
      toastSuccess('Note deleted');
      paintList(); paintEditor(); paintTagFilter();
    });
    return; // trashed notes are read-only otherwise
  }

  const titleInput = document.getElementById('notesTitleInput');
  const textarea = document.getElementById('notesTextarea');
  const preview = document.getElementById('notesPreview');

  const saveTitleOrBody = debounce(async () => {
    await updateNote(note.id, { title: titleInput.value, body: textarea.value });
    flashSaved();
    paintList();
  }, 500);

  titleInput.addEventListener('input', saveTitleOrBody);
  textarea.addEventListener('input', () => {
    preview.innerHTML = renderMarkdown(textarea.value);
    saveTitleOrBody();
  });

  pane.querySelectorAll('[data-fmt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyFormat(textarea, btn.dataset.fmt);
      preview.innerHTML = renderMarkdown(textarea.value);
      saveTitleOrBody();
    });
  });

  // ---- Tags ----
  const tagInput = document.getElementById('notesTagInput');
  pane.querySelectorAll('[data-remove-tag]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tags = note.tags.filter((t) => t !== btn.dataset.removeTag);
      await updateNote(note.id, { tags });
      flashSaved();
      paintEditor(); paintList(); paintTagFilter();
    });
  });
  if (tagInput) {
    tagInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' && e.key !== ',') return;
      e.preventDefault();
      const raw = tagInput.value.trim().replace(/,$/, '');
      if (!raw) return;
      const tags = Array.from(new Set([...note.tags, raw]));
      await updateNote(note.id, { tags });
      flashSaved();
      paintEditor(); paintList(); paintTagFilter();
    });
  }

  // ---- Actions ----
  document.getElementById('pinBtn').addEventListener('click', async () => { await togglePin(note.id); paintEditor(); paintList(); });
  document.getElementById('archiveBtn').addEventListener('click', async () => {
    await toggleArchive(note.id);
    toastInfo(note.archived ? 'Note unarchived' : 'Note archived');
    paintEditor(); paintList();
  });
  document.getElementById('trashBtn').addEventListener('click', async () => {
    await trashNote(note.id);
    toastInfo('Moved to trash');
    state.selectedId = null;
    paintList(); paintEditor(); paintTagFilter();
  });
  document.getElementById('duplicateBtn').addEventListener('click', async () => {
    const copy = await duplicateNote(note.id);
    state.selectedId = copy.id;
    toastSuccess('Note duplicated');
    paintList(); paintEditor();
  });
  document.getElementById('exportBtn').addEventListener('click', () => {
    const filename = `${slugify(note.title) || 'untitled-note'}.md`;
    downloadText(note.body, filename, 'text/markdown');
    toastSuccess('Exported', filename);
  });
}

function flashSaved() {
  const el = document.getElementById('saveIndicator');
  if (!el) return;
  el.textContent = 'Saved';
  el.classList.add('show');
  clearTimeout(saveIndicatorTimer);
  saveIndicatorTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

/** Wraps or prefixes the current textarea selection with Markdown syntax. */
function applyFormat(textarea, kind) {
  const { selectionStart: s, selectionEnd: e, value } = textarea;
  const selected = value.slice(s, e);

  const wrap = (before, after = before) => {
    textarea.value = value.slice(0, s) + before + selected + after + value.slice(e);
    textarea.selectionStart = s + before.length;
    textarea.selectionEnd = s + before.length + selected.length;
  };
  const linePrefix = (prefix) => {
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    textarea.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    textarea.selectionStart = s + prefix.length;
    textarea.selectionEnd = e + prefix.length;
  };

  if (kind === 'bold') wrap('**');
  else if (kind === 'italic') wrap('*');
  else if (kind === 'code') wrap('`');
  else if (kind === 'link') wrap('[', '](https://)');
  else if (kind === 'ul') linePrefix('- ');
  else if (kind === 'h2') linePrefix('## ');

  textarea.focus();
}
