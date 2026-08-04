/**
 * theme.js
 * --------
 * Applies stored preferences to the live DOM via data-attributes and CSS
 * custom property overrides, and keeps everything in sync when Settings
 * changes a preference (through the `pref:change` event storage.js
 * dispatches) — no reload required for any theme-related setting.
 * @module theme
 */

import { getAllPrefs, ACCENT_PRESETS } from './storage.js';
import { prefersReducedMotion } from './utils/helpers.js';

const root = document.documentElement;

/** Applies an accent preset by overriding the two accent CSS variables
 *  on :root, on top of whatever the active dark/light theme set. */
function applyAccent(presetKey) {
  const preset = ACCENT_PRESETS[presetKey] || ACCENT_PRESETS.violet;
  root.style.setProperty('--accent', preset.accent);
  root.style.setProperty('--accent-2', preset.accent2);
  // Keep the *-rgb variants (used for glows/soft backgrounds) in sync.
  root.style.setProperty('--accent-rgb', hexToRgb(preset.accent));
  root.style.setProperty('--accent-2-rgb', hexToRgb(preset.accent2));
}

function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{1,2}/g);
  return m.map((h) => parseInt(h, 16)).join(', ');
}

function applyMotion(reduceMotionPref) {
  const shouldReduce = reduceMotionPref || prefersReducedMotion();
  root.setAttribute('data-motion', shouldReduce ? 'reduced' : 'full');
}

/** Applies the full preference set to the document. Safe to call repeatedly. */
export function applyPrefsToDom(prefs) {
  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-fontsize', prefs.fontSize);
  applyAccent(prefs.accent);
  applyMotion(prefs.reduceMotion);
  document.getElementById('app')?.setAttribute('data-sidebar', prefs.sidebarCollapsed ? 'collapsed' : 'expanded');
  root.setAttribute('data-sidebar', prefs.sidebarCollapsed ? 'collapsed' : 'expanded');
}

/** Reads all preferences from storage and applies them — call once at boot. */
export async function initTheme() {
  const prefs = await getAllPrefs();
  applyPrefsToDom(prefs);

  // Keep in sync with live setting changes from anywhere in the app.
  document.addEventListener('pref:change', async () => {
    applyPrefsToDom(await getAllPrefs());
  });

  // Keep in sync with OS-level motion preference changes mid-session.
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', async () => {
    applyPrefsToDom(await getAllPrefs());
  });

  return prefs;
}
