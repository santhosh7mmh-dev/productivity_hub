/**
 * effects.js
 * ----------
 * Module 5 — micro-interactions. Everything here is additive polish:
 * if this file failed to load entirely, the app would still work. It
 * self-disables on `[data-motion="reduced"]` (see theme.js, which sets
 * that attribute from both the OS setting and the in-app Settings
 * toggle) and on touch-primary devices for the parts that need a real
 * cursor (spotlight, magnetic hover) — those get a touch-appropriate
 * substitute instead (touch ripple).
 * @module effects/effects
 */

import { throttle, isTouchPrimary } from '../utils/helpers.js';

const root = document.documentElement;

function motionReduced() {
  return root.getAttribute('data-motion') === 'reduced';
}

/* ============================================================
   1. Document-wide cursor spotlight
   ============================================================ */
function initCursorSpotlight() {
  const spotlight = document.getElementById('cursorSpotlight');
  if (!spotlight) return;

  if (isTouchPrimary()) {
    document.body.classList.add('no-fine-pointer');
    return;
  }

  let idleTimer = null;
  const showSpotlight = () => {
    spotlight.classList.add('active');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => spotlight.classList.remove('active'), 2200);
  };

  const onMove = throttle((e) => {
    if (motionReduced()) return;
    root.style.setProperty('--cursor-x', `${e.clientX}px`);
    root.style.setProperty('--cursor-y', `${e.clientY}px`);
    showSpotlight();
  }, 16);

  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', () => spotlight.classList.remove('active'));
}

/* ============================================================
   2. Hero-card local glow (tighter spotlight, only over .home-hero)
   ============================================================ */
function initHeroGlow() {
  const attach = (heroEl) => {
    if (!heroEl || heroEl.dataset.glowBound) return;
    heroEl.dataset.glowBound = 'true';
    const onMove = throttle((e) => {
      if (motionReduced() || isTouchPrimary()) return;
      const rect = heroEl.getBoundingClientRect();
      heroEl.style.setProperty('--hero-x', `${e.clientX - rect.left}px`);
      heroEl.style.setProperty('--hero-y', `${e.clientY - rect.top}px`);
    }, 16);
    heroEl.addEventListener('pointermove', onMove);
  };

  // The hero card is re-created every time Dashboard mounts (it's inside
  // the router's swapped view), so watch for it instead of querying once.
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.home-hero').forEach(attach);
  });
  observer.observe(document.getElementById('appView'), { childList: true, subtree: true });
  document.querySelectorAll('.home-hero').forEach(attach);
}

/* ============================================================
   3. Touch ripple — brief glow centered on touch point
   ============================================================ */
function initTouchGlow() {
  if (!isTouchPrimary()) return;
  const glow = document.createElement('div');
  glow.className = 'touch-glow';
  document.body.appendChild(glow);

  document.addEventListener('pointerdown', (e) => {
    if (motionReduced() || e.pointerType !== 'touch') return;
    glow.style.left = `${e.clientX}px`;
    glow.style.top = `${e.clientY}px`;
    glow.classList.remove('firing');
    void glow.offsetWidth; // restart animation
    glow.classList.add('firing');
  }, { passive: true });
}

/* ============================================================
   4. Magnetic hover — buttons/cards nudge toward the cursor
   ============================================================ */
function initMagneticHover() {
  if (isTouchPrimary()) return;
  const STRENGTH = 0.18;
  const MAX_OFFSET = 8;

  const attachTarget = (el) => {
    if (el.dataset.magneticBound) return;
    el.dataset.magneticBound = 'true';
    el.classList.add('magnetic');
    el.addEventListener('pointermove', (e) => {
      if (motionReduced()) return;
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - (rect.left + rect.width / 2)) * STRENGTH;
      const dy = (e.clientY - (rect.top + rect.height / 2)) * STRENGTH;
      const cx = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx));
      const cy = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dy));
      el.style.transform = `translate(${cx}px, ${cy}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  };

  // Delegate discovery so dynamically-rendered buttons/cards get the
  // effect too, without every module having to call in explicitly.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.querySelectorAll?.('.btn-primary, .tool-card').forEach(attachTarget);
        if (node.matches?.('.btn-primary, .tool-card')) attachTarget(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('.btn-primary, .tool-card').forEach(attachTarget);
}

/* ============================================================
   5. Press ripple — small expanding-opacity ripple on click/tap
   ============================================================ */
function initPressRipple() {
  document.addEventListener('pointerdown', (e) => {
    if (motionReduced()) return;
    const target = e.target.closest('.btn, .tool-card, .nav-item');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    const prevPosition = getComputedStyle(target).position;
    if (prevPosition === 'static') target.style.position = 'relative';
    target.style.overflow = target.style.overflow || 'hidden';
    target.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

/** Boots every micro-interaction. Call once at boot, after the initial route render. */
export function initEffects() {
  initCursorSpotlight();
  initHeroGlow();
  initTouchGlow();
  initMagneticHover();
  initPressRipple();
}
