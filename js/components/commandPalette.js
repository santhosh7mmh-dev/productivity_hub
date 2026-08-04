/**
 * commandPalette.js
 * -----------------
 * Ctrl+/ command palette. Modules register commands via
 * `registerCommand` (e.g. Notes will later register "New note"); this
 * file only owns the overlay, fuzzy filtering, and keyboard navigation.
 * @module components/commandPalette
 */

import { navigate } from '../router.js';
import { registerShortcut } from '../utils/keyboard.js';
import { fuzzyScore, escapeHtml } from '../utils/helpers.js';
import { NAV_ITEMS } from './sidebar.js';
import { exportAllDataToFile } from '../modules/settings/settingsData.js';

/** @type {{id: string, group: string, label: string, icon: string, keywords?: string, run: Function}[]} */
const commands = [];

/**
 * Registers a command shown in the palette.
 * @param {{id: string, group: string, label: string, icon?: string, keywords?: string, run: Function}} cmd
 */
export function registerCommand(cmd) {
  // Replace if already registered (lets a module re-register after data changes).
  const existingIdx = commands.findIndex((c) => c.id === cmd.id);
  if (existingIdx >= 0) commands[existingIdx] = cmd;
  else commands.push(cmd);
}

export function unregisterCommand(id) {
  const idx = commands.findIndex((c) => c.id === id);
  if (idx >= 0) commands.splice(idx, 1);
}

function registerBuiltins() {
  for (const item of NAV_ITEMS) {
    registerCommand({
      id: `nav.${item.path}`,
      group: 'Go to',
      label: item.label,
      icon: item.icon,
      run: () => navigate(item.path)
    });
  }
  registerCommand({ id: 'action.new-note', group: 'Create', label: 'New note', icon: '📝', run: () => navigate('notes', { action: 'new' }) });
  registerCommand({ id: 'action.new-chat', group: 'Create', label: 'New AI chat', icon: '🤖', run: () => navigate('ai', { action: 'new' }) });
  registerCommand({ id: 'action.new-qr', group: 'Create', label: 'Generate QR code', icon: '📷', run: () => navigate('qr', { action: 'new' }) });
  registerCommand({ id: 'action.export', group: 'Data', label: 'Export data', icon: '⬇', keywords: 'backup download json', run: exportAllDataToFile });
  registerCommand({ id: 'action.backup', group: 'Data', label: 'Backup now', icon: '💾', keywords: 'export save', run: exportAllDataToFile });
  registerCommand({ id: 'nav.settings.direct', group: 'Data', label: 'Open Settings', icon: '⚙', run: () => navigate('settings') });
}

let selectedIndex = 0;
let filtered = [];

function overlay() { return document.getElementById('cmdkOverlay'); }
function input() { return document.getElementById('cmdkInput'); }
function resultsEl() { return document.getElementById('cmdkResults'); }

function scoreAndFilter(query) {
  if (!query.trim()) return commands.slice();
  return commands
    .map((c) => ({ c, score: Math.max(fuzzyScore(query, c.label), fuzzyScore(query, c.keywords || '')) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.c);
}

function render() {
  const groups = new Map();
  filtered.forEach((c, i) => {
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group).push({ ...c, index: i });
  });

  if (!filtered.length) {
    resultsEl().innerHTML = `<div class="cmdk-empty">No matching commands.</div>`;
    return;
  }

  let html = '';
  for (const [group, items] of groups) {
    html += `<div class="cmdk-group-label">${escapeHtml(group)}</div>`;
    for (const item of items) {
      html += `
        <div class="cmdk-item${item.index === selectedIndex ? ' active' : ''}" data-index="${item.index}">
          <span class="ci-glyph">${item.icon || '›'}</span>
          <span>${escapeHtml(item.label)}</span>
        </div>`;
    }
  }
  resultsEl().innerHTML = html;
  resultsEl().querySelectorAll('.cmdk-item').forEach((node) => {
    node.addEventListener('click', () => runSelected(Number(node.dataset.index)));
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

function runSelected(index) {
  const cmd = filtered[index];
  if (!cmd) return;
  closePalette();
  cmd.run();
}

export function openPalette() {
  filtered = scoreAndFilter('');
  selectedIndex = 0;
  input().value = '';
  render();
  overlay().classList.add('show');
  requestAnimationFrame(() => input().focus());
}

export function closePalette() {
  overlay().classList.remove('show');
}

function handleKeydown(e) {
  if (e.key === 'Escape') { closePalette(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1); updateActiveClasses(); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); updateActiveClasses(); return; }
  if (e.key === 'Enter') { e.preventDefault(); runSelected(selectedIndex); }
}

/** Wires shortcuts and DOM listeners. Call once at boot. */
export function initCommandPalette() {
  registerBuiltins();

  registerShortcut('ctrl+/', () => {
    overlay().classList.contains('show') ? closePalette() : openPalette();
  }, { description: 'Toggle command palette', allowInInputs: true });

  input().addEventListener('input', () => {
    filtered = scoreAndFilter(input().value);
    selectedIndex = 0;
    render();
  });
  input().addEventListener('keydown', handleKeydown);
  overlay().addEventListener('click', (e) => { if (e.target === overlay()) closePalette(); });
}
