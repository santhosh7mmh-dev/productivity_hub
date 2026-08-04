/**
 * pdftoolkit.js
 * -------------
 * Wires the existing, fully-built "PDF Toolkit" app in as a Hub module.
 *
 * That app (tools/pdf-toolkit/) is a large (~2,600-line), independently
 * built single-page app with its own CSS design system and its own
 * `getElementById`-driven vanilla JS — and it happens to reuse several
 * of the exact same class/id names the Hub itself uses (`.btn`, `.card`,
 * `.modal-box`, `.field`, `#status`, ...) because both were designed
 * with a similar "glass, indigo, Linear/Arc-inspired" aesthetic.
 *
 * Flattening its markup into the Hub's own DOM would silently apply the
 * wrong rules from whichever stylesheet loaded second, and its `<script>`
 * would collide with the Hub's own ids at runtime. Rather than rewrite
 * ~2,600 lines of working, tested tooling to de-risk a merge, this
 * module embeds it in a sandboxed `<iframe>` — its own document, own
 * style scope, own script scope, zero collision risk — while still
 * living inside the Hub's sidebar/router/command-palette shell so it
 * feels like one app rather than a link out to somewhere else.
 * The one thing that used to drift from the rest of the Hub was theme:
 * the embedded app shipped with its own independent palette and its own
 * light/dark toggle wired to its own localStorage key. Its stylesheet's
 * color values now match css/tokens.css directly, and this module keeps
 * its light/dark *state* in sync live by posting the Hub's current theme
 * into the iframe on load and again on every `pref:change` — so switching
 * theme anywhere in the Hub updates the toolkit immediately too.
 * @module modules/pdftoolkit
 */

import { getPref } from '../../storage.js';

const TOOLKIT_URL = 'tools/pdf-toolkit/index.html';

/**
 * @param {HTMLElement} container
 * @returns {Function} cleanup — restores the app-view's normal padding
 *   when the user navigates away, so other routes aren't affected by
 *   this route's full-bleed layout.
 */
export function renderPdfToolkit(container) {
  container.classList.add('full-bleed');

  container.innerHTML = `
    <div class="pdftoolkit-frame-wrap">
      <div class="pdftoolkit-loading" id="pdftoolkitLoading">
        <div class="skeleton" style="width:220px;height:22px;margin-bottom:10px;"></div>
        <div class="skeleton" style="width:320px;height:14px;"></div>
      </div>
      <iframe
        id="pdftoolkitFrame"
        class="pdftoolkit-frame"
        src="${TOOLKIT_URL}"
        title="PDF Toolkit"
        loading="lazy"
        referrerpolicy="no-referrer"
      ></iframe>
    </div>`;

  const frame = container.querySelector('#pdftoolkitFrame');
  const loading = container.querySelector('#pdftoolkitLoading');

  const sendTheme = async () => {
    const theme = await getPref('theme');
    frame.contentWindow?.postMessage({ type: 'hub:theme', dark: theme === 'dark' }, window.location.origin);
  };

  frame.addEventListener('load', () => {
    loading.style.display = 'none';
    frame.classList.add('ready');
    sendTheme();
  }, { once: true });

  document.addEventListener('pref:change', sendTheme);

  return () => {
    container.classList.remove('full-bleed');
    document.removeEventListener('pref:change', sendTheme);
  };
}
