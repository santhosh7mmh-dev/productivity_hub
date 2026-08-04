/**
 * modal.js
 * --------
 * A single reusable modal overlay (#modalRoot / #modalBox in index.html)
 * with two entry points: `confirmDialog` for the common "are you sure?"
 * case, and `openModal` for anything needing custom HTML/behavior
 * (e.g. a future "rename conversation" prompt in AI Workspace).
 * @module components/modal
 */

import { escapeHtml } from '../utils/helpers.js';

const overlay = () => document.getElementById('modalRoot');
const box = () => document.getElementById('modalBox');

let activeCloseHandler = null;

/** Closes whatever modal is currently open, running its close handler if any. */
export function closeModal() {
  const ov = overlay();
  if (!ov.classList.contains('show')) return;
  ov.classList.remove('show');
  box().innerHTML = '';
  if (typeof activeCloseHandler === 'function') activeCloseHandler();
  activeCloseHandler = null;
}

/**
 * Opens the modal with arbitrary content.
 * @param {{html: string, size?: 'md'|'lg', onOpen?: (box: HTMLElement) => void, onClose?: Function}} opts
 */
export function openModal({ html, size = 'md', onOpen, onClose }) {
  const ov = overlay();
  const b = box();
  b.className = `modal-box${size === 'lg' ? ' modal-lg' : ''}`;
  b.innerHTML = html;
  ov.classList.add('show');
  activeCloseHandler = onClose || null;
  if (typeof onOpen === 'function') onOpen(b);
  const firstFocusable = b.querySelector('input, textarea, button, [tabindex]');
  if (firstFocusable) firstFocusable.focus();
}

/**
 * Shows a confirm/alert dialog and resolves true/false with the user's choice.
 * @param {{title: string, message: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean}} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    openModal({
      html: `
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      `,
      onOpen: (b) => {
        b.querySelector('[data-action="confirm"]').addEventListener('click', () => { resolve(true); closeModal(); });
        b.querySelector('[data-action="cancel"]').addEventListener('click', () => { resolve(false); closeModal(); });
      },
      onClose: () => resolve(false)
    });
  });
}

/** Wires the overlay-click-to-close and Escape-to-close behavior. Call once at boot. */
export function initModal() {
  overlay().addEventListener('click', (e) => {
    if (e.target === overlay()) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay().classList.contains('show')) closeModal();
  });
}
