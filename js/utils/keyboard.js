/**
 * keyboard.js
 * -----------
 * A single global keydown listener that dispatches to registered
 * shortcut handlers. Every module registers combos through
 * `registerShortcut` instead of adding its own document listener, so
 * there's one place to see every shortcut in the app and no risk of
 * two modules fighting over the same combo silently.
 * @module utils/keyboard
 */

/** @type {Map<string, {handler: Function, description: string, allowInInputs: boolean}>} */
const registry = new Map();

/**
 * Normalizes a KeyboardEvent into a combo string like "ctrl+k" or
 * "ctrl+shift+c", matching the format used as registry keys.
 * @param {KeyboardEvent} e
 * @returns {string}
 */
function comboFromEvent(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl'); // treat Cmd as Ctrl for cross-platform combos
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (!['control', 'meta', 'alt', 'shift'].includes(key)) parts.push(key);
  return parts.join('+');
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Registers a global keyboard shortcut.
 * @param {string} combo - e.g. "ctrl+k", "ctrl+shift+c", "ctrl+/"
 * @param {(e: KeyboardEvent) => void} handler
 * @param {{description?: string, allowInInputs?: boolean}} [opts]
 */
export function registerShortcut(combo, handler, opts = {}) {
  registry.set(combo.toLowerCase(), {
    handler,
    description: opts.description || '',
    allowInInputs: !!opts.allowInInputs
  });
}

/** Removes a previously registered shortcut. */
export function unregisterShortcut(combo) {
  registry.delete(combo.toLowerCase());
}

/** Returns all registered shortcuts, for a future "keyboard shortcuts" help panel. */
export function listShortcuts() {
  return Array.from(registry.entries()).map(([combo, meta]) => ({ combo, ...meta }));
}

let initialized = false;

/** Wires the single document-level keydown listener. Call once at boot. */
export function initKeyboardManager() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('keydown', (e) => {
    const combo = comboFromEvent(e);
    const entry = registry.get(combo);
    if (!entry) return;
    if (isTypingTarget(e.target) && !entry.allowInInputs) return;
    e.preventDefault();
    entry.handler(e);
  });
}
