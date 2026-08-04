/**
 * helpers.js
 * ----------
 * Small, dependency-free, general-purpose utilities. Nothing in this file
 * should know about any specific module (Notes, QR, etc.) — if a function
 * needs domain knowledge, it belongs in that module instead.
 * @module utils/helpers
 */

/**
 * Generates a RFC4122-ish v4 UUID. Uses crypto.randomUUID when available
 * (all modern browsers) and falls back to a Math.random implementation
 * for older environments so the app never hard-crashes on id generation.
 * @returns {string}
 */
export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Debounces a function: delays invoking `fn` until `wait` ms have
 * elapsed since the last call. Useful for auto-save and search inputs.
 * @param {Function} fn
 * @param {number} wait
 * @returns {Function}
 */
export function debounce(fn, wait = 300) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Throttles a function so it fires at most once per `wait` ms, used for
 * high-frequency events like pointermove in the effects engine.
 * @param {Function} fn
 * @param {number} wait
 * @returns {Function}
 */
export function throttle(fn, wait = 100) {
  let last = 0;
  let pendingArgs = null;
  let timer = null;
  return function throttled(...args) {
    const now = performance.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn.apply(this, args);
    } else {
      pendingArgs = args;
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = performance.now();
        fn.apply(this, pendingArgs);
      }, remaining);
    }
  };
}

/** Clamps `n` between `min` and `max`. */
export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

/**
 * Escapes a string for safe insertion into innerHTML — every place in the
 * app that interpolates user text into HTML must run it through this.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/** Strips HTML tags, leaving plain text — used for search indexing/snippets. */
export function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html ?? '';
  return div.textContent || '';
}

/**
 * Formats a Date/timestamp as a short relative string ("2m ago",
 * "3h ago", "5d ago"), falling back to a locale date for anything older.
 * @param {number|Date} input
 */
export function formatRelativeTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Formats a Date as "Jan 5, 2026, 3:04 PM" for detail views. */
export function formatDateTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

/** Counts words in plain text (whitespace-delimited, ignores empty tokens). */
export function countWords(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Estimated reading time in minutes at 200 wpm, minimum 1. */
export function readingTime(text) {
  return Math.max(1, Math.round(countWords(text) / 200));
}

/**
 * Tiny helper for building DOM nodes without a template engine.
 * @param {string} tag
 * @param {Object} [attrs]
 * @param {(Node|string)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Returns true if the viewport is coarse-pointer-primary (touch device). */
export function isTouchPrimary() {
  return window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

/** Returns true if the user (OS-level) prefers reduced motion. */
export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Very small fuzzy-match scorer for command palette / search: returns a
 * score (higher = better) if every character of `query` appears in
 * `target` in order, or -1 if it doesn't match at all. Consecutive and
 * early matches score higher, which gives reasonable "fuzzy" ranking
 * without pulling in a dependency.
 * @param {string} query
 * @param {string} target
 * @returns {number}
 */
export function fuzzyScore(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let consecutive = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return -1;
    consecutive = idx === ti ? consecutive + 1 : 0;
    score += 10 - Math.min(9, idx - ti) + consecutive * 2;
    ti = idx + 1;
  }
  score += Math.max(0, 20 - t.length) * 0.2; // slight bonus for shorter targets
  return score;
}

/** Generates a short, readable id fragment, e.g. for anchor targets. */
export function slugify(str) {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
