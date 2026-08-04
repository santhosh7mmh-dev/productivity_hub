/**
 * export.js
 * ---------
 * Generic "turn data into a downloaded file" helpers. Domain-specific
 * export logic (e.g. Notes -> PDF) stays in that module and calls into
 * these primitives rather than duplicating blob/anchor plumbing.
 * @module utils/export
 */

/**
 * Triggers a browser download for arbitrary blob content.
 * @param {Blob|string} content
 * @param {string} filename
 * @param {string} [mimeType]
 */
export function downloadFile(content, filename, mimeType = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a delay so Safari/Firefox have time to actually start the download.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Downloads a JS value as pretty-printed JSON. */
export function downloadJSON(value, filename) {
  downloadFile(JSON.stringify(value, null, 2), filename, 'application/json');
}

/** Downloads a plain-text/markdown string. */
export function downloadText(text, filename, mimeType = 'text/plain') {
  downloadFile(text, filename, mimeType);
}

/**
 * Reads a File object as text (used by "Import data" / "Import Markdown").
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Opens a hidden file input and resolves with the chosen File (or null
 * if the user cancels). Avoids every module needing its own <input>.
 * @param {string} [accept] - e.g. ".json,.md"
 * @returns {Promise<File|null>}
 */
export function pickFile(accept = '') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    let resolved = false;
    input.addEventListener('change', () => {
      resolved = true;
      resolve(input.files && input.files[0] ? input.files[0] : null);
      input.remove();
    });
    // If the user cancels the native dialog, `change` never fires; clean
    // up on window focus-return as a best-effort fallback.
    window.addEventListener('focus', function onFocus() {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => { if (!resolved) { resolve(null); input.remove(); } }, 300);
    }, { once: true });
    input.click();
  });
}
