/**
 * settings.js
 * -----------
 * The Settings view. Reads/writes preferences through storage.js and
 * delegates backup/export/import/erase logic to settingsData.js so
 * that logic can also be triggered from the command palette.
 * @module modules/settings/settings
 */

import { getAllPrefs, setPref, ACCENT_PRESETS, saveProviderKey, listConfiguredProviders, clearProviderKey } from '../../storage.js';
import { exportAllDataToFile, importDataFromFile, clearAllDataWithConfirm } from './settingsData.js';
import { toastSuccess, toastError } from '../../components/toast.js';
import { escapeHtml } from '../../utils/helpers.js';
import { isUsingFallback } from '../../db.js';

const PROVIDER_META = {
  openai: { label: 'OpenAI', hint: 'Used for GPT models when you select them in AI Workspace.' },
  gemini: { label: 'Google Gemini', hint: 'Used for Gemini models when you select them in AI Workspace.' },
  openrouter: { label: 'OpenRouter', hint: 'A single key that can route to many third-party hosted models.' }
};

function section(title, bodyHtml, id = '') {
  return `
    <div class="glass-panel" style="padding: var(--sp-6); margin-bottom: var(--sp-5);" ${id ? `id="${id}"` : ''}>
      <h3 style="font-size: var(--text-md); margin-bottom: var(--sp-4);">${title}</h3>
      ${bodyHtml}
    </div>`;
}

export async function renderSettings(container) {
  const prefs = await getAllPrefs();
  const configured = await listConfiguredProviders();

  container.innerHTML = `
    <h2 style="margin-bottom: var(--sp-1);">Settings</h2>
    <p class="hint" style="color: var(--muted); margin-bottom: var(--sp-6);">
      Everything here is stored on this device${isUsingFallback() ? ' (using LocalStorage — IndexedDB isn\u2019t available in this browser)' : ' via IndexedDB'}. Nothing is sent anywhere.
    </p>

    ${section('Appearance', `
      <div class="toggle-row">
        <div class="tr-text"><strong>Theme</strong><span>Switch between dark and light.</span></div>
        <div class="field-row" role="radiogroup" aria-label="Theme">
          <button class="btn ${prefs.theme === 'dark' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-theme-choice="dark">Dark</button>
          <button class="btn ${prefs.theme === 'light' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-theme-choice="light">Light</button>
        </div>
      </div>
      <div class="toggle-row">
        <div class="tr-text"><strong>Font size</strong><span>Scales text across the whole app.</span></div>
        <div class="field-row">
          <button class="btn ${prefs.fontSize === 'sm' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-fontsize-choice="sm">Small</button>
          <button class="btn ${prefs.fontSize === 'md' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-fontsize-choice="md">Medium</button>
          <button class="btn ${prefs.fontSize === 'lg' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-fontsize-choice="lg">Large</button>
        </div>
      </div>
      <div class="field" style="margin-top: var(--sp-3);">
        <label>Accent color</label>
        <div class="swatch-row" id="accentSwatches">
          ${Object.entries(ACCENT_PRESETS).map(([key, p]) => `
            <span class="swatch${prefs.accent === key ? ' selected' : ''}" data-accent="${key}"
              style="background: linear-gradient(135deg, ${p.accent}, ${p.accent2});" data-tooltip="${escapeHtml(p.label)}"></span>
          `).join('')}
        </div>
      </div>
    `)}

    ${section('Motion', `
      <div class="toggle-row">
        <div class="tr-text"><strong>Reduce motion</strong><span>Turns off the ambient gradient, cursor spotlight, and other animations, independent of your OS setting.</span></div>
        <label class="switch">
          <input type="checkbox" id="reduceMotionToggle" ${prefs.reduceMotion ? 'checked' : ''}>
          <span class="track"></span><span class="thumb"></span>
        </label>
      </div>
    `)}

    ${section('AI Workspace providers', `
      <p class="hint" style="margin-bottom: var(--sp-4);">
        The free tier (no key needed) is always available in AI Workspace. Add your own key here only if you want to use OpenAI, Gemini, or OpenRouter directly with your own account.
      </p>
      <div id="providerList">
        ${Object.entries(PROVIDER_META).map(([key, meta]) => `
          <div class="toggle-row" data-provider-row="${key}">
            <div class="tr-text">
              <strong>${meta.label} ${configured[key] ? '<span class="badge badge-mint">Key saved</span>' : ''}</strong>
              <span>${meta.hint}</span>
            </div>
            <div class="field-row">
              <button class="btn btn-secondary btn-sm" data-provider-set="${key}">${configured[key] ? 'Replace key' : 'Add key'}</button>
              ${configured[key] ? `<button class="btn btn-ghost btn-sm" data-provider-clear="${key}">Remove</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `)}

    ${section('Backup', `
      <div class="toggle-row">
        <div class="tr-text"><strong>Export all data</strong><span>Downloads every note, clipboard item, QR code, and AI chat as one JSON file.</span></div>
        <button class="btn btn-secondary btn-sm" id="exportBtn">Export</button>
      </div>
      <div class="toggle-row">
        <div class="tr-text"><strong>Restore from backup</strong><span>Replaces current data with a previously exported file.</span></div>
        <button class="btn btn-secondary btn-sm" id="importBtn">Import</button>
      </div>
      <div class="toggle-row">
        <div class="tr-text"><strong style="color: var(--danger);">Erase all data</strong><span>Permanently deletes everything on this device.</span></div>
        <button class="btn btn-danger btn-sm" id="eraseBtn">Erase</button>
      </div>
    `)}
  `;

  // ---- Theme / font size ----
  container.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await setPref('theme', btn.dataset.themeChoice);
      renderSettings(container);
    });
  });
  container.querySelectorAll('[data-fontsize-choice]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await setPref('fontSize', btn.dataset.fontsizeChoice);
      renderSettings(container);
    });
  });

  // ---- Accent ----
  container.querySelectorAll('[data-accent]').forEach((swatch) => {
    swatch.addEventListener('click', async () => {
      await setPref('accent', swatch.dataset.accent);
      renderSettings(container);
    });
  });

  // ---- Motion ----
  document.getElementById('reduceMotionToggle').addEventListener('change', async (e) => {
    await setPref('reduceMotion', e.target.checked);
  });

  // ---- AI provider keys ----
  container.querySelectorAll('[data-provider-set]').forEach((btn) => {
    btn.addEventListener('click', () => openProviderKeyPrompt(btn.dataset.providerSet, container));
  });
  container.querySelectorAll('[data-provider-clear]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await clearProviderKey(btn.dataset.providerClear);
      toastSuccess('Key removed');
      renderSettings(container);
    });
  });

  // ---- Backup ----
  document.getElementById('exportBtn').addEventListener('click', exportAllDataToFile);
  document.getElementById('importBtn').addEventListener('click', () => importDataFromFile());
  document.getElementById('eraseBtn').addEventListener('click', () => clearAllDataWithConfirm());
}

async function openProviderKeyPrompt(provider, container) {
  const { openModal, closeModal } = await import('../../components/modal.js');
  const meta = PROVIDER_META[provider];
  openModal({
    html: `
      <h3>${escapeHtml(meta.label)} API key</h3>
      <p>Your key is encrypted with a passphrase before it\u2019s stored on this device. You\u2019ll need the same passphrase to use this provider later — pick something you\u2019ll remember, it\u2019s not recoverable if lost.</p>
      <div class="field" style="margin-top: var(--sp-4);">
        <label for="providerKeyInput">API key</label>
        <input type="password" class="input" id="providerKeyInput" autocomplete="off" placeholder="sk-...">
      </div>
      <div class="field" style="margin-top: var(--sp-3);">
        <label for="providerPassInput">Passphrase</label>
        <input type="password" class="input" id="providerPassInput" autocomplete="new-password" placeholder="A local passphrase, just for this device">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn btn-primary" data-action="save">Save key</button>
      </div>
    `,
    onOpen: (box) => {
      box.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);
      box.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const key = box.querySelector('#providerKeyInput').value.trim();
        const pass = box.querySelector('#providerPassInput').value;
        if (!key || !pass) { toastError('Missing info', 'Both the API key and a passphrase are required.'); return; }
        await saveProviderKey(provider, key, pass);
        closeModal();
        toastSuccess('Key saved', `${meta.label} is ready to use in AI Workspace.`);
        renderSettings(container);
      });
    }
  });
}
