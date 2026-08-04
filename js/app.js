/**
 * app.js
 * ------
 * Application entry point. Responsible only for boot order — every
 * piece of actual behavior lives in its own module. Boot order matters
 * here: theme must apply before first paint (no flash of wrong theme),
 * the DB must be open before any module tries to read from it, and the
 * router must be initialized last so every command/search provider is
 * already registered by the time a route can render.
 * @module app
 */

import { initDb } from './db.js';
import { initTheme } from './theme.js';
import { initKeyboardManager } from './utils/keyboard.js';
import { initModal } from './components/modal.js';
import { initSidebar } from './components/sidebar.js';
import { initCommandPalette } from './components/commandPalette.js';
import { initSearch } from './components/search.js';
import { registerRoute, initRouter } from './router.js';
import { initEffects } from './effects/effects.js';
import { renderDashboard } from './modules/dashboard/dashboard.js';
import { renderSettings } from './modules/settings/settings.js';
import { renderPdfToolkit } from './modules/pdftoolkit/pdftoolkit.js';
import { renderClipboard } from './modules/clipboard/clipboard.js';
import { renderNotes } from './modules/notes/notes.js';
import { renderQr } from './modules/qr/qr.js';
import { toastInfo } from './components/toast.js';

/** Tiny shared "not built yet" view for routes whose module ships in a
 *  later phase. This is product state (see dashboard.js's tool cards),
 *  not a code TODO — the route itself is fully wired and will simply
 *  render real content once that phase's module registers over it. */
function renderComingSoon(container, { icon, title, phase }) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="es-icon">${icon}</div>
      <h3>${title}</h3>
      <p>This module ships in Phase ${phase} of the build. The dashboard, sidebar, search, and command palette are already wired up for it — this view just doesn't have its own module yet.</p>
    </div>`;
}

function registerRoutes() {
  registerRoute('dashboard', renderDashboard, 'Dashboard');
  registerRoute('settings', renderSettings, 'Settings');
  registerRoute('pdf-toolkit', renderPdfToolkit, 'PDF Toolkit');
  registerRoute('notes', renderNotes, 'Notes');
  registerRoute('qr', renderQr, 'QR Toolkit');
  registerRoute('clipboard', renderClipboard, 'Clipboard');
  registerRoute('ai', (c) => renderComingSoon(c, { icon: '🤖', title: 'AI Workspace', phase: 5 }), 'AI Workspace');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed (offline support disabled):', err);
    });
  });
}

async function boot() {
  await initDb();
  await initTheme();       // must run before first paint — applies theme/accent/motion attrs

  initKeyboardManager();
  initModal();
  await initSidebar();
  initCommandPalette();
  initSearch();

  registerRoutes();
  initRouter();            // triggers the first route render

  // Effects attach after the first route render so the dashboard's
  // .home-hero already exists for the MutationObserver's initial pass.
  initEffects();

  registerServiceWorker();

  if (!sessionStorage.getItem('hub.welcomed')) {
    sessionStorage.setItem('hub.welcomed', '1');
    toastInfo('Phase 4 loaded', 'Clipboard Manager is ready alongside PDF Toolkit, Notes, QR Toolkit, and Settings. Try Ctrl+K to search or Ctrl+/ for commands.');
  }
}

boot().catch((err) => {
  console.error('Failed to start the app:', err);
  const view = document.getElementById('appView');
  if (view) {
    view.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">⚠</div>
        <h3>Something went wrong starting Hub</h3>
        <p>Check the browser console for details, then try reloading the page.</p>
      </div>`;
  }
});
