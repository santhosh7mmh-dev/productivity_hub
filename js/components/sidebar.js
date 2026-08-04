/**
 * sidebar.js
 * ----------
 * Renders the primary navigation (desktop sidebar / mobile bottom bar,
 * handled by CSS media queries on the same markup — see components.css).
 * Owns the collapse/expand toggle and highlights the active route.
 * @module components/sidebar
 */

import { navigate, getCurrentPath } from '../router.js';
import { getPref, setPref } from '../storage.js';

/** Single source of truth for what appears in the sidebar. Each module
 *  that wants a nav entry adds itself here — this list also feeds the
 *  command palette's "Go to..." group (see commandPalette.js). */
export const NAV_ITEMS = [
  { path: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { path: 'pdf-toolkit', label: 'PDF Toolkit', icon: '🧰' },
  { path: 'notes', label: 'Notes', icon: '📝' },
  { path: 'qr', label: 'QR Toolkit', icon: '📷' },
  { path: 'clipboard', label: 'Clipboard', icon: '📋' },
  { path: 'ai', label: 'AI Workspace', icon: '🤖' },
  { path: 'settings', label: 'Settings', icon: '⚙' }
];

function renderNav() {
  const active = getCurrentPath();
  return NAV_ITEMS.map((item) => `
    <button class="nav-item${item.path === active ? ' active' : ''}" data-nav="${item.path}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
    </button>
  `).join('');
}

/** Re-renders just the active-state highlighting (called on every route change, cheap). */
export function refreshSidebarActiveState() {
  const nav = document.getElementById('sidebar');
  if (!nav) return;
  const active = getCurrentPath();
  nav.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === active);
  });
}

/** Renders the sidebar into #sidebar and wires all its interactions. Call once at boot. */
export async function initSidebar() {
  const nav = document.getElementById('sidebar');
  const collapsed = await getPref('sidebarCollapsed');

  nav.innerHTML = `
    <div class="sidebar-brand">
      <img src="icons/icon-192.png" alt="">
      <div>
        <strong>Hub</strong>
      </div>
    </div>
    <button class="sidebar-search" id="sidebarSearchBtn">
      <span>🔍</span>
      <span>Search</span>
      <kbd>Ctrl K</kbd>
    </button>
    <div class="sidebar-nav">${renderNav()}</div>
    <div class="sidebar-footer">
      <button class="nav-item" data-nav="settings">
        <span class="nav-icon">⌘</span>
        <span class="nav-label">Command palette</span>
      </button>
      <button class="sidebar-collapse-btn" id="sidebarCollapseBtn" aria-label="Toggle sidebar width">
        ${collapsed ? '»' : '«'}
      </button>
    </div>
  `;

  nav.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav));
  });

  document.getElementById('sidebarSearchBtn').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('search:open'));
  });
  document.getElementById('topbarSearchBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('search:open'));
  });

  document.getElementById('sidebarCollapseBtn').addEventListener('click', async () => {
    const isCollapsed = await getPref('sidebarCollapsed');
    await setPref('sidebarCollapsed', !isCollapsed);
    document.getElementById('sidebarCollapseBtn').textContent = !isCollapsed ? '»' : '«';
  });

  document.addEventListener('route:change', refreshSidebarActiveState);
}
