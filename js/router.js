/**
 * router.js
 * ---------
 * A minimal hash-based router. No build step and no history-API server
 * config needed (works from a plain `file://` or any static host), which
 * matters for a PWA that's meant to also work fully offline.
 *
 * Modules register a route with `registerRoute(path, renderFn)`; the
 * router owns swapping #appView's content and firing lifecycle events
 * so modules can clean up (cancel timers, close DB cursors, etc.) when
 * navigated away from.
 * @module router
 */

/** @type {Map<string, {render: Function, title: string}>} */
const routes = new Map();
let currentPath = null;
let currentCleanup = null;
const viewEl = () => document.getElementById('appView');

/**
 * Registers a route.
 * @param {string} path - e.g. "dashboard", "notes", "settings"
 * @param {(container: HTMLElement, params: URLSearchParams) => (void|Function)} render
 *   May return a cleanup function, called automatically on navigation away.
 * @param {string} [title]
 */
export function registerRoute(path, render, title = '') {
  routes.set(path, { render, title });
}

/** Programmatic navigation — updates the URL hash, which triggers the actual render. */
export function navigate(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  window.location.hash = `#/${path}${query ? `?${query}` : ''}`;
}

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, queryStr] = hash.split('?');
  return { path: path || 'dashboard', params: new URLSearchParams(queryStr || '') };
}

async function renderCurrent() {
  const { path, params } = parseHash();
  const route = routes.get(path) || routes.get('dashboard');
  const resolvedPath = routes.has(path) ? path : 'dashboard';

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (err) { console.error('Route cleanup error:', err); }
    currentCleanup = null;
  }

  currentPath = resolvedPath;
  const container = viewEl();
  container.classList.remove('view-enter');
  // Force reflow so the enter animation replays on every navigation.
  void container.offsetWidth;
  container.classList.add('view-enter');

  document.title = route.title ? `${route.title} — Hub` : 'Hub';
  document.dispatchEvent(new CustomEvent('route:change', { detail: { path: resolvedPath } }));

  const result = route.render(container, params);
  if (typeof result === 'function') currentCleanup = result;
  else if (result && typeof result.then === 'function') await result;
}

/** Returns the currently active route path (for sidebar/nav highlighting). */
export function getCurrentPath() {
  return currentPath;
}

/** Boots the router: renders the current hash and listens for future changes. */
export function initRouter() {
  window.addEventListener('hashchange', renderCurrent);
  if (!window.location.hash) window.location.hash = '#/dashboard';
  else renderCurrent();
}
