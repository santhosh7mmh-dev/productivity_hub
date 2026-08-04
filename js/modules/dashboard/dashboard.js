/**
 * dashboard.js
 * ------------
 * The home view. Renders the welcome hero (the hero-glow micro-
 * interaction from effects.js hooks onto `.home-hero` automatically —
 * see effects/effects.js's MutationObserver) and a grid of tool cards.
 * QR/Clipboard/AI Workspace ship in later phases, so their cards are
 * visibly marked "Coming in Phase N" rather than silently broken
 * links — this is product state, not a placeholder left in the code.
 * @module modules/dashboard/dashboard
 */

import { navigate } from '../../router.js';
import { toastError } from '../../components/toast.js';

const TOOLS = [
  { path: 'pdf-toolkit', icon: '🧰', title: 'PDF Toolkit', desc: 'Merge, split, compress, watermark, OCR, and convert PDFs — entirely in your browser.', phase: 1, ready: true },
  { path: 'notes', icon: '📝', title: 'Notes', desc: 'Markdown notes with live preview, tags, and full-text search.', phase: 2, ready: true },
  { path: 'qr', icon: '📷', title: 'QR Toolkit', desc: 'Generate and scan QR codes for links, WiFi, contacts, and more.', phase: 3, ready: true },
  { path: 'clipboard', icon: '📋', title: 'Clipboard Manager', desc: 'A searchable history of everything you\u2019ve pasted, organized into folders.', phase: 4, ready: true },
  { path: 'ai', icon: '🤖', title: 'AI Workspace', desc: 'Chat with a free built-in model, or bring your own OpenAI, Gemini, or OpenRouter key.', phase: 5, ready: false },
  { path: 'settings', icon: '⚙', title: 'Settings', desc: 'Theme, accent color, motion, backup and restore.', phase: 1, ready: true }
];

function toolCardHtml(tool) {
  return `
    <div class="tool-card${tool.ready ? '' : ' disabled'}" data-path="${tool.path}" ${tool.ready ? '' : 'aria-disabled="true"'}>
      <div class="tc-icon">${tool.icon}</div>
      <h3>${tool.title}</h3>
      <p>${tool.desc}</p>
      <div class="tc-meta">
        ${tool.ready
          ? '<span class="badge badge-mint">Ready</span>'
          : `<span class="badge badge-muted">Coming in Phase ${tool.phase}</span>`}
      </div>
    </div>`;
}

export function renderDashboard(container) {
  container.innerHTML = `
    <p class="hint" style="margin-bottom:14px; color:var(--muted);">Everything runs locally in your browser — nothing is uploaded anywhere.</p>

    <div class="home-hero glass-panel">
      <div class="hero-glow" aria-hidden="true"></div>
      <div class="hh-text">
        <h2>Welcome back</h2>
        <p>Pick a tool below, or search for what you need.</p>
      </div>
      <div class="hh-meta">
        <div>Phase 4 — Clipboard Manager</div>
        <div>Version 0.1.0</div>
      </div>
    </div>

    <div class="donate-card glass-panel" id="donateCard">
      <div class="donate-card-head">
        <h3>☕ Like what you see?</h3>
        <span class="badge badge-warm">Optional tip</span>
      </div>
      <p>All tools are free and always will be. But if they've been useful, you can support development with a small donation.</p>
      <div class="donate-card-row">
        <input type="number" class="input" id="donateAmountInput" placeholder="Amount (₹)" min="1" value="100">
        <button class="btn btn-secondary" id="donateBtnHome">Support</button>
      </div>
      <div style="text-align:center; font-size:12px; color:var(--muted); margin-top:12px;">
        UPI: <strong>7010587974@kotakbank</strong>
      </div>
    </div>

    <div class="card-grid">
      ${TOOLS.map(toolCardHtml).join('')}
    </div>
  `;

  container.querySelectorAll('.tool-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('disabled')) return;
      navigate(card.dataset.path);
    });
  });

  // Wire up donation button
  const donateBtn = container.querySelector('#donateBtnHome');
  const amountInput = container.querySelector('#donateAmountInput');
  if (donateBtn) {
    donateBtn.addEventListener('click', () => {
      const amount = (amountInput.value || '100').trim();
      if (!amount || isNaN(amount) || amount < 1) {
        toastError('Enter an amount', 'Minimum tip is ₹1');
        return;
      }
      alert(`To donate ₹${amount}, scan the QR code below or use:\n\nUPI: 7010587974@kotakbank\n\nThank you so much for supporting this project! 💚`);
    });
  }
}

