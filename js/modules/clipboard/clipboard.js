/**
 * clipboard.js
 * ------------
 * Phase 4: the Clipboard Manager view. A searchable history of saved
 * snippets/links, organized into categories ("folders"), with pin,
 * copy, edit-category and delete actions. Items can be added either by
 * typing/pasting into the composer box or via the "Paste from
 * clipboard" button (navigator.clipboard.readText, where permitted by
 * the browser). Follows the same list/registration pattern as notes.js.
 * @module modules/clipboard/clipboard
 */

import {
  addClipboardItem, deleteClipboardItem, togglePinItem, updateClipboardItem,
  listClipboardItems, getAllCategories, clearUnpinned
} from './clipboardData.js';
import { registerSearchProvider } from '../../components/search.js';
import { registerCommand } from '../../components/commandPalette.js';
import { navigate } from '../../router.js';
import { confirmDialog } from '../../components/modal.js';
import { toastSuccess, toastError, toastInfo } from '../../components/toast.js';
import { escapeHtml, formatRelativeTime, fuzzyScore, debounce } from '../../utils/helpers.js';

const state = {
  category: 'All',
  query: ''
};

let containerRef = null;

/* ============================================================
   Search + command palette integration (registered once, at import)
   ============================================================ */

registerSearchProvider('Clipboard', async (query) => {
  const items = await listClipboardItems({});
  return items
    .map((i) => ({ item: i, score: fuzzyScore(query, i.text) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ item }) => ({
      id: `clip.${item.id}`,
      title: item.text.length > 60 ? `${item.text.slice(0, 60)}…` : item.text,
      snippet: item.category,
      icon: '📋',
      onOpen: () => navigate('clipboard')
    }));
});

registerCommand({
  id: 'action.new-clipboard-item',
  group: 'Create',
  label: 'New clipboard item',
  icon: '📋',
  run: () => navigate('clipboard', { action: 'new' })
});

/* ============================================================
   Route entry point
   ============================================================ */

export async function renderClipboard(container, params) {
  containerRef = container;

  await paintShell(container);

  if (params.get('action') === 'new') {
    navigate('clipboard'); // drop ?action=new so re-renders don't loop
    container.querySelector('#clipComposer')?.focus();
  }

  return function cleanup() {
    containerRef = null;
  };
}

/* ============================================================
   Shell
   ============================================================ */

async function paintShell(container) {
  const categories = await getAllCategories();

  container.innerHTML = `
    <div class="clip-layout">
      <div class="clip-composer glass-panel">
        <textarea class="textarea" id="clipComposer" rows="2" placeholder="Paste or type something to save…"></textarea>
        <div class="clip-composer-row">
          <select class="select" id="clipCategorySelect">
            ${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
            <option value="__new__">+ New category…</option>
          </select>
          <button class="btn btn-secondary" id="clipPasteBtn">📥 Paste from clipboard</button>
          <button class="btn btn-primary" id="clipSaveBtn">Save item</button>
        </div>
      </div>

      <div class="clip-toolbar">
        <input type="text" class="input" id="clipSearchInput" placeholder="Search saved items…">
        <select class="select" id="clipFilterSelect">
          <option value="All">All categories</option>
          ${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        </select>
        <button class="btn btn-secondary" id="clipClearBtn">Clear unpinned</button>
      </div>

      <div class="clip-list" id="clipList"></div>
    </div>
  `;

  container.querySelector('#clipCategorySelect').addEventListener('change', (e) => {
    if (e.target.value === '__new__') {
      const name = prompt('New category name');
      e.target.value = 'General';
      if (name && name.trim()) {
        const opt = document.createElement('option');
        opt.value = name.trim();
        opt.textContent = name.trim();
        opt.selected = true;
        e.target.insertBefore(opt, e.target.lastElementChild);
      }
    }
  });

  container.querySelector('#clipPasteBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { toastInfo('Clipboard is empty'); return; }
      container.querySelector('#clipComposer').value = text;
    } catch {
      toastError('Couldn\u2019t read clipboard', 'Your browser blocked clipboard access — paste manually instead.');
    }
  });

  container.querySelector('#clipSaveBtn').addEventListener('click', () => saveComposer(container));
  container.querySelector('#clipComposer').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveComposer(container);
  });

  container.querySelector('#clipFilterSelect').addEventListener('change', (e) => {
    state.category = e.target.value;
    paintList(container);
  });

  const debouncedSearch = debounce(() => {
    state.query = container.querySelector('#clipSearchInput').value;
    paintList(container);
  }, 150);
  container.querySelector('#clipSearchInput').addEventListener('input', debouncedSearch);

  container.querySelector('#clipClearBtn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Clear unpinned items?',
      message: 'This removes every unpinned saved item. Pinned items are kept.',
      confirmLabel: 'Clear',
      danger: true
    });
    if (!ok) return;
    await clearUnpinned();
    toastSuccess('Unpinned items cleared');
    paintList(container);
  });

  await paintList(container);
}

/* ============================================================
   List pane
   ============================================================ */

async function paintList(container) {
  const listEl = container.querySelector('#clipList');
  const items = await listClipboardItems({ category: state.category, query: state.query });

  if (!items.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">📋</div>
        <h3>No saved items yet</h3>
        <p>Paste or type something above and hit Save — everything stays on this device.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = items.map((i) => `
    <div class="note-card clip-card" data-id="${i.id}">
      <div class="nc-top">
        <span class="tag-chip">${escapeHtml(i.category || 'General')}</span>
        <span class="nc-time">${formatRelativeTime(i.createdAt)}</span>
      </div>
      <div class="nc-snippet clip-text">${escapeHtml(i.text)}</div>
      <div class="clip-card-actions">
        <button class="btn-icon" data-action="copy" title="Copy">📄</button>
        <button class="btn-icon" data-action="pin" title="${i.pinned ? 'Unpin' : 'Pin'}">${i.pinned ? '📌' : '📍'}</button>
        <button class="btn-icon" data-action="delete" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.clip-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      const item = items.find((i) => i.id === id);
      try {
        await navigator.clipboard.writeText(item.text);
        toastSuccess('Copied to clipboard');
      } catch {
        toastError('Couldn\u2019t copy', 'Your browser blocked clipboard access.');
      }
    });
    card.querySelector('[data-action="pin"]').addEventListener('click', async () => {
      await togglePinItem(id);
      paintList(container);
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await deleteClipboardItem(id);
      toastInfo('Item deleted');
      paintList(container);
    });
  });
}

async function saveComposer(container) {
  const text = container.querySelector('#clipComposer').value;
  const category = container.querySelector('#clipCategorySelect').value || 'General';
  if (!text.trim()) { toastError('Nothing to save', 'Type or paste something first.'); return; }
  await addClipboardItem(text, category === '__new__' ? 'General' : category);
  container.querySelector('#clipComposer').value = '';
  toastSuccess('Saved to clipboard history');
  await paintShell(container); // repaint to refresh category dropdowns too
}
