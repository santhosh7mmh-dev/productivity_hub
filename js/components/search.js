/**
 * search.js
 * ---------
 * Ctrl+K global search. Unlike the command palette (fixed list of
 * actions), this searches actual user *data* — notes, clipboard items,
 * AI chats, etc. Modules register a provider via `registerSearchProvider`
 * so this file never needs to import Notes/Clipboard/AI directly; it
 * stays generic and future modules plug into it without editing this
 * file at all.
 * @module components/search
 */

import { registerShortcut } from '../utils/keyboard.js';
import { debounce, escapeHtml, fuzzyScore } from '../utils/helpers.js';
import { NAV_ITEMS } from './sidebar.js';
import { navigate } from '../router.js';

/**
 * @typedef {Object} SearchResult
 * @property {string} id
 * @property {string} title
 * @property {string} [snippet]
 * @property {string} icon
 * @property {Function} onOpen
 */

/** @type {Map<string, (query: string) => Promise<SearchResult[]>|SearchResult[]>} */
const providers = new Map();

/**
 * Registers a data source for global search.
 * @param {string} sourceName - e.g. "Notes", "Clipboard", "AI Chats"
 * @param {(query: string) => Promise<SearchResult[]>|SearchResult[]} searchFn
 */
export function registerSearchProvider(sourceName, searchFn) {
  providers.set(sourceName, searchFn);
}

export function unregisterSearchProvider(sourceName) {
  providers.delete(sourceName);
}

// Always-available fallback provider: jump straight to any section by name.
providers.set('Go to', (query) => {
  if (!query.trim()) return [];
  return NAV_ITEMS
    .map((item) => ({ item, score: fuzzyScore(query, item.label) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => ({
      id: `nav.${r.item.path}`,
      title: r.item.label,
      snippet: 'Section',
      icon: r.item.icon,
      onOpen: () => navigate(r.item.path)
    }));
});

let flatResults = [];
let selectedIndex = 0;

function overlay() { return document.getElementById('searchOverlay'); }
function input() { return document.getElementById('searchInput'); }
function resultsEl() { return document.getElementById('searchResults'); }

async function runSearch(query) {
  const grouped = [];
  for (const [source, fn] of providers) {
    if (!query.trim() && source !== 'Go to') continue; // avoid dumping all data with an empty query
    const results = await fn(query);
    if (results && results.length) grouped.push({ source, results });
  }
  return grouped;
}

function render(grouped) {
  flatResults = [];
  if (!grouped.length) {
    resultsEl().innerHTML = `<div class="cmdk-empty">${input().value.trim() ? 'No results.' : 'Start typing to search everything…'}</div>`;
    return;
  }
  let html = '';
  for (const { source, results } of grouped) {
    html += `<div class="cmdk-group-label">${escapeHtml(source)}</div>`;
    for (const r of results) {
      const idx = flatResults.length;
      flatResults.push(r);
      html += `
        <div class="cmdk-item${idx === selectedIndex ? ' active' : ''}" data-index="${idx}">
          <span class="ci-glyph">${r.icon || '›'}</span>
          <span>${escapeHtml(r.title)}</span>
          ${r.snippet ? `<span class="ci-sub">${escapeHtml(r.snippet)}</span>` : ''}
        </div>`;
    }
  }
  resultsEl().innerHTML = html;
  resultsEl().querySelectorAll('.cmdk-item').forEach((node) => {
    node.addEventListener('click', () => openSelected(Number(node.dataset.index)));
    node.addEventListener('mousemove', () => {
      selectedIndex = Number(node.dataset.index);
      updateActiveClasses();
    });
  });
}

function updateActiveClasses() {
  resultsEl().querySelectorAll('.cmdk-item').forEach((node) => {
    node.classList.toggle('active', Number(node.dataset.index) === selectedIndex);
  });
  resultsEl().querySelector('.cmdk-item.active')?.scrollIntoView({ block: 'nearest' });
}

function openSelected(index) {
  const r = flatResults[index];
  if (!r) return;
  closeSearch();
  r.onOpen();
}

const doSearch = debounce(async () => {
  const grouped = await runSearch(input().value);
  selectedIndex = 0;
  render(grouped);
}, 150);

export function openSearch() {
  input().value = '';
  selectedIndex = 0;
  render([]);
  overlay().classList.add('show');
  requestAnimationFrame(() => input().focus());
  doSearch();
}

export function closeSearch() {
  overlay().classList.remove('show');
}

function handleKeydown(e) {
  if (e.key === 'Escape') { closeSearch(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, flatResults.length - 1); updateActiveClasses(); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); updateActiveClasses(); return; }
  if (e.key === 'Enter') { e.preventDefault(); openSelected(selectedIndex); }
}

/** Wires shortcuts and DOM listeners. Call once at boot. */
export function initSearch() {
  registerShortcut('ctrl+k', () => {
    overlay().classList.contains('show') ? closeSearch() : openSearch();
  }, { description: 'Toggle global search', allowInInputs: true });

  document.addEventListener('search:open', openSearch);

  input().addEventListener('input', doSearch);
  input().addEventListener('keydown', handleKeydown);
  overlay().addEventListener('click', (e) => { if (e.target === overlay()) closeSearch(); });
}
