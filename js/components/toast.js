/**
 * toast.js
 * --------
 * Toast notifications. A single stack node (#toastStack, in index.html)
 * that any module can push into via `showToast(...)` — no per-module
 * toast containers, so stacking/positioning is consistent app-wide.
 * @module components/toast
 */

import { escapeHtml } from '../utils/helpers.js';

const ICONS = { success: '✓', error: '⚠', info: 'ℹ' };
const DEFAULT_DURATION = 4200;

/**
 * Shows a toast notification.
 * @param {{type?: 'success'|'error'|'info', title: string, description?: string, duration?: number}} opts
 */
export function showToast({ type = 'info', title, description = '', duration = DEFAULT_DURATION }) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;

  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.setAttribute('role', 'status');
  node.innerHTML = `
    <span class="t-icon">${ICONS[type] || ICONS.info}</span>
    <div class="t-body">
      <div class="t-title">${escapeHtml(title)}</div>
      ${description ? `<div class="t-desc">${escapeHtml(description)}</div>` : ''}
    </div>
    <button class="t-close" aria-label="Dismiss">✕</button>
  `;

  const remove = () => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 220);
  };
  node.querySelector('.t-close').addEventListener('click', remove);

  stack.appendChild(node);
  if (duration > 0) setTimeout(remove, duration);
  return remove;
}

/** Convenience wrappers for the common cases. */
export const toastSuccess = (title, description) => showToast({ type: 'success', title, description });
export const toastError = (title, description) => showToast({ type: 'error', title, description });
export const toastInfo = (title, description) => showToast({ type: 'info', title, description });
