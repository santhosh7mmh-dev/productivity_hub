pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const { PDFDocument, PDFDict, PDFArray, PDFString, PDFHexString, PDFName, PDFNumber, PDFRawStream } = PDFLib;

/* ============================================================
   Shared: pure-JS MD5 + RC4 for the PDF Standard Security Handler
   (RC4 40-bit, V1/R2) — used by the Password protect tool.
   ============================================================ */
function md5(bytes) {
  function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }
  const s = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
             5, 9,14,20,5, 9,14,20,5, 9,14,20,5, 9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
             6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) | 0;

  const origLen = bytes.length;
  const bitLenLow = (origLen * 8) >>> 0;
  const bitLenHigh = Math.floor(origLen / 0x20000000);

  let newLen = origLen + 1;
  while (newLen % 64 !== 56) newLen++;
  const padded = new Uint8Array(newLen + 8);
  padded.set(bytes);
  padded[origLen] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(newLen, bitLenLow, true);
  dv.setUint32(newLen + 4, bitLenHigh, true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
    const M = new Int32Array(16);
    for (let i = 0; i < 16; i++) M[i] = dv.getInt32(chunkStart + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, s[i])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }

  const out = new Uint8Array(16);
  const outDv = new DataView(out.buffer);
  outDv.setInt32(0, a0, true); outDv.setInt32(4, b0, true);
  outDv.setInt32(8, c0, true); outDv.setInt32(12, d0, true);
  return out;
}
function rc4(keyBytes, data) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) & 0xff;
    const t = S[i]; S[i] = S[j]; S[j] = t;
  }
  const out = new Uint8Array(data.length);
  let i = 0; j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const t = S[i]; S[i] = S[j]; S[j] = t;
    out[k] = data[k] ^ S[(S[i] + S[j]) & 0xff];
  }
  return out;
}
const PAD = new Uint8Array([
  0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,
  0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A
]);
function padPassword(pw) {
  const enc = new TextEncoder().encode(pw || '');
  const out = new Uint8Array(32);
  const n = Math.min(enc.length, 32);
  out.set(enc.subarray(0, n));
  out.set(PAD.subarray(0, 32 - n), n);
  return out;
}
function concatBytes(...arrs) {
  let len = 0; for (const a of arrs) len += a.length;
  const out = new Uint8Array(len); let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
function computeO(ownerPw, userPw) {
  const paddedOwner = padPassword(ownerPw || userPw);
  const key = md5(paddedOwner).subarray(0, 5);
  return rc4(key, padPassword(userPw));
}
function computeEncryptionKey(userPw, ownerO, permissions, idBytes) {
  const pBytes = new Uint8Array(4);
  new DataView(pBytes.buffer).setInt32(0, permissions, true);
  const input = concatBytes(padPassword(userPw), ownerO, pBytes, idBytes);
  return md5(input).subarray(0, 5);
}
function computeU(encKey) { return rc4(encKey, PAD); }
function objectKey(encKey, objNum, genNum) {
  const extra = new Uint8Array(5);
  extra[0] = objNum & 0xff; extra[1] = (objNum >> 8) & 0xff; extra[2] = (objNum >> 16) & 0xff;
  extra[3] = genNum & 0xff; extra[4] = (genNum >> 8) & 0xff;
  const hash = md5(concatBytes(encKey, extra));
  return hash.subarray(0, Math.min(encKey.length + 5, 16));
}
function bytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}
function randomBytes(n) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

async function encryptPdfBytes(bytes, userPassword) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const idBytes = randomBytes(16);
  const permissions = -4;
  const oValue = computeO(userPassword, userPassword);
  const encKey = computeEncryptionKey(userPassword, oValue, permissions, idBytes);
  const uValue = computeU(encKey);

  function walk(obj, key) {
    if (obj instanceof PDFDict) {
      for (const [name, value] of Array.from(obj.dict.entries())) obj.dict.set(name, walk(value, key));
      return obj;
    }
    if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.array.length; i++) obj.array[i] = walk(obj.array[i], key);
      return obj;
    }
    if (obj instanceof PDFRawStream) {
      obj.dict = walk(obj.dict, key);
      obj.contents = rc4(key, obj.contents);
      return obj;
    }
    if (obj instanceof PDFHexString) return PDFHexString.of(bytesToHex(rc4(key, obj.asBytes())));
    if (obj instanceof PDFString) return PDFHexString.of(bytesToHex(rc4(key, obj.asBytes())));
    return obj;
  }
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    walk(obj, objectKey(encKey, ref.objectNumber, ref.generationNumber));
  }
  const idHex = bytesToHex(idBytes);
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(idHex), PDFHexString.of(idHex)]);
  const encryptDict = ctx.obj({
    Filter: PDFName.of('Standard'), V: PDFNumber.of(1), R: PDFNumber.of(2),
    O: PDFHexString.of(bytesToHex(oValue)), U: PDFHexString.of(bytesToHex(uValue)),
    P: PDFNumber.of(permissions),
  });
  ctx.trailerInfo.Encrypt = ctx.register(encryptDict);
  return await doc.save({ useObjectStreams: false });
}

/* ============================================================
   Shared helpers
   ============================================================ */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}
async function renderPdfPageThumb(pdfjsDoc, pageNum, maxDim) {
  maxDim = maxDim || 140;
  const page = await pdfjsDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  const scale = maxDim / Math.max(viewport.width, viewport.height);
  const scaledViewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;
  return canvas.toDataURL('image/png');
}

/* ============================================================
   CONFIGURATION
   ============================================================ */
const IS_PRO = false; // set true to unlock everything, e.g. for a "pro build" of this file

// Registry of every real tool. `pro: true` locks it behind the upgrade modal
// unless IS_PRO or a valid key has been activated. Add future tools here —
// just set pro:true/false, nothing else needs to change.
const TOOL_DEFS = [
  { id: 'img2pdf',        name: 'Images → PDF',      icon: '📷', pro: false, desc: 'Combine PNG, JPG, WEBP and other images into one PDF.' },
  { id: 'merge',          name: 'Merge PDFs',        icon: '📄', pro: false,  desc: 'Combine multiple PDFs and reorder pages.' },
  { id: 'split',          name: 'Split PDF',         icon: '✂️', pro: false,  desc: 'Extract pages or split into multiple files.' },
  { id: 'compress',       name: 'Compress PDF',      icon: '🗜️', pro: false,  desc: 'Shrink file size by recompressing images.' },
  { id: 'protect',        name: 'Password Protect',  icon: '🔒', pro: false,  desc: 'Add a password to lock your PDF.' },
  { id: 'rotate',         name: 'Rotate Pages',      icon: '🔄', pro: false, desc: 'Rotate one or all pages 90° at a time.' },
  { id: 'deletepages',    name: 'Delete Pages',      icon: '🗑️', pro: false, desc: 'Remove unwanted pages.' },
  { id: 'extractpages',   name: 'Extract Pages',     icon: '📑', pro: false, desc: 'Pull specific pages into a new PDF.' },
  { id: 'reverse',        name: 'Reverse Pages',     icon: '↩️', pro: false, desc: 'Flip the page order.' },
  { id: 'pagenumbers',    name: 'Add Page Numbers',  icon: '🔢', pro: false, desc: 'Stamp page numbers onto every page.' },
  { id: 'watermark',      name: 'Watermark PDF',     icon: '💧', pro: false, desc: 'Overlay text across every page.' },
  { id: 'pdf2img',        name: 'PDF → Images',      icon: '🖼️', pro: false, desc: 'Export each page as a PNG.' },
  { id: 'extractimages',  name: 'Extract Images',    icon: '🧩', pro: false, desc: 'Pull embedded images out of a PDF.' },
  { id: 'metadata',       name: 'PDF Metadata',      icon: 'ℹ️', pro: false, desc: 'View title, author, and other details.' },
  { id: 'removemeta',     name: 'Remove Metadata',   icon: '🧹', pro: false, desc: 'Strip identifying info from a PDF.' },

  {
    id: 'linebreaks',
    name: 'Convert Line Breaks to Paragraphs',
    icon: '📑',
    pro: false,
    desc: 'Turn Shift+Enter line breaks in a DOCX into real paragraph breaks.'
  },

  { id: 'ocr',            name: 'OCR PDF',            icon: '🔎', pro: false,  desc: 'Recognize text in scanned PDFs — searchable PDF or plain text.' },

];

const COMING_SOON = [
  { name: 'AI Summary', icon: '🧠' },
  { name: 'Chat with PDF', icon: '💬' },
  { name: 'Extract Tables', icon: '📊' },
  { name: 'Invoice Reader', icon: '🧾' },
];

// Maps every tool to its download card / filename input / download button,
// so Settings (default filename, remember filename, auto-download) can hook
// in generically without touching each tool's own logic.
const DOWNLOAD_CARDS = [
  { tool: 'img2pdf',       card: 'img-downloadCard',        filenameInput: 'img-filename',        downloadBtn: 'img-downloadBtn' },
  { tool: 'merge',         card: 'merge-downloadCard',      filenameInput: 'merge-filename',      downloadBtn: 'merge-downloadBtn' },
  { tool: 'split',         card: 'split-downloadCard',      filenameInput: 'split-filename',      downloadBtn: 'split-downloadBtn' },
  { tool: 'compress',      card: 'compress-downloadCard',   filenameInput: 'compress-filename',   downloadBtn: 'compress-downloadBtn' },
  { tool: 'protect',       card: 'protect-downloadCard',    filenameInput: 'protect-filename',    downloadBtn: 'protect-downloadBtn' },
  { tool: 'rotate',        card: 'rotate-downloadCard',     filenameInput: 'rotate-filename',     downloadBtn: 'rotate-downloadBtn' },
  { tool: 'deletepages',   card: 'deletepages-downloadCard',filenameInput: 'deletepages-filename',downloadBtn: 'deletepages-downloadBtn' },
  { tool: 'extractpages',  card: 'extractpages-downloadCard',filenameInput: 'extractpages-filename',downloadBtn: 'extractpages-downloadBtn' },
  { tool: 'reverse',       card: 'reverse-downloadCard',    filenameInput: 'reverse-filename',    downloadBtn: 'reverse-downloadBtn' },
  { tool: 'pagenumbers',   card: 'pagenumbers-downloadCard',filenameInput: 'pagenumbers-filename',downloadBtn: 'pagenumbers-downloadBtn' },
  { tool: 'watermark',     card: 'watermark-downloadCard',  filenameInput: 'watermark-filename',  downloadBtn: 'watermark-downloadBtn' },
  { tool: 'pdf2img',       card: 'pdf2img-downloadCard',    filenameInput: 'pdf2img-filename',    downloadBtn: 'pdf2img-downloadBtn' },
  { tool: 'extractimages', card: 'extractimages-downloadCard',filenameInput: 'extractimages-filename',downloadBtn: 'extractimages-downloadBtn' },
  { tool: 'removemeta',    card: 'removemeta-downloadCard', filenameInput: 'removemeta-filename', downloadBtn: 'removemeta-downloadBtn' },
  { tool: 'ocr',           card: 'ocr-downloadCard',        filenameInput: 'ocr-filename',        downloadBtn: 'ocr-downloadBtn' },
];

/* ============================================================
   PRO SYSTEM
   ============================================================ */
function isProUnlocked() {
  // Everything is free now! No more Pro paywall.
  return true;
}

// Derives a best-effort device identifier from stable browser/environment
// signals. This is NOT a strong hardware ID (browsers don't expose one) —
// it's a fingerprint-ish value the backend can use to loosely bind a key to
// a device. Users clearing storage or switching browsers will get a new ID.
async function getHWID() {
  const encoder = new TextEncoder();

  const text =
    navigator.userAgent +
    navigator.language +
    screen.width +
    screen.height +
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const hash = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(text)
  );

  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Returns { ok: true } on success, or { ok: false, message } on failure.
// Validates the key against the local Node.js license server.
async function activateProKey(rawKey) {
  const key = (rawKey || '').trim().toUpperCase();
  if (!key) return { ok: false, message: 'Enter a key first.' };

  const hwid = await getHWID();

  try {
    const res = await fetch("https://license-server-backend.onrender.com/api/activate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        key,
        hwid
      })
    });

    if (!res.ok) {
      throw new Error("Bad response: " + res.status);
    }

    const data = await res.json();

    if (data.valid) {
      localStorage.setItem("pdftk_pro", "true");
      localStorage.setItem("pdftk_pro_key", key);
      localStorage.setItem("pdftk_hwid", hwid);
      return { ok: true };
    }

    return {
      ok: false,
      message: data.message || "Invalid activation key."
    };
  } catch (err) {
    console.error("Key validation request failed:", err);
    return {
      ok: false,
      message: "Couldn't reach the license server."
    };
  }
}

function isToolLocked(toolId) {
  const def = TOOL_DEFS.find(t => t.id === toolId);
  if (!def) return false;
  return def.pro && !isProUnlocked();
}
// Wraps an existing tool's event handler with a Pro check, without touching
// the handler's own logic. Usage: btn.addEventListener('click', proGuardedHandler('merge', async () => {...}))
function proGuardedHandler(toolId, handler) {
  return async function (...args) {
    if (isToolLocked(toolId)) { openUpgradeModal(); return; }
    return handler.apply(this, args);
  };
}
async function verifySavedLicense() {

    const key = localStorage.getItem("pdftk_pro_key");
    if (!key) return;

    const hwid =
        localStorage.getItem("pdftk_hwid") ||
        await getHWID();

    try {

        const res = await fetch(
            "https://license-server-backend.onrender.com/api/activate/verify",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    key,
                    hwid
                })
            }
        );

        const data = await res.json();

        if (data.valid) {

            localStorage.setItem("pdftk_pro", "true");

        } else {

            localStorage.removeItem("pdftk_pro");
            localStorage.removeItem("pdftk_pro_key");
            localStorage.removeItem("pdftk_hwid");

            refreshProUI();
            renderHome();

            alert(data.message);

        }

    } catch (err) {

        console.error(err);

    }

}

function refreshProUI() {
  const unlocked = isProUnlocked();
  document.querySelectorAll('.pro-badge').forEach(b => { b.style.display = unlocked ? 'none' : 'inline-block'; });
  ['merge', 'split', 'compress', 'protect', 'ocr'].forEach(id => {
    const banner = document.getElementById(id + '-lockBanner');
    if (banner) banner.style.display = unlocked ? 'none' : 'flex';
  });
  const pill = document.getElementById('proPillBtn');
  if (pill) {
    if (unlocked) { pill.textContent = '⭐ Pro'; pill.classList.add('unlocked'); }
    else { pill.textContent = '⭐ Upgrade'; pill.classList.remove('unlocked'); }
  }
  const status = document.getElementById('homeProStatus');
  if (status) status.textContent = unlocked ? 'Pro edition — everything unlocked' : 'Free edition';
}

/* ============================================================
   UPGRADE MODAL
   ============================================================ */
function openUpgradeModal() {
  // Now just opens a "Support Me" donation modal since everything is free
  document.getElementById('upgradeModal').classList.add('show');
}
function closeUpgradeModal() {
  document.getElementById('upgradeModal').classList.remove('show');
}
document.getElementById('upgradeCloseBtn').addEventListener('click', closeUpgradeModal);
document.getElementById('proPillBtn').addEventListener('click', openUpgradeModal);
// Optional: wire up donation amount buttons
document.querySelectorAll('.donate-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const amount = e.target.dataset.amount;
    alert(`To donate ₹${amount}, scan the QR code or use UPI ID: 7010587974@kotakbank\n\nThank you for supporting this project! ❤️`);
  });
});

/* ============================================================
   TOASTS
   ============================================================ */
function showToast(message) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

/* ============================================================
   SETTINGS
   ============================================================ */
const DEFAULT_SETTINGS = {
  darkMode: false,
  defaultFilename: '',
  autoDownload: false,
  rememberFilename: true,
  animations: true,
};
function loadSettings() {
  try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem('pdftk_settings') || '{}')); }
  catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
}
function saveSettings(settings) {
  localStorage.setItem('pdftk_settings', JSON.stringify(settings));
}
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('themeToggleBtn').textContent = dark ? '☀️' : '🌙';
}
function applyAnimations(enabled) {
  document.documentElement.classList.toggle('no-anim', !enabled);
}
function applySettingsToUI() {
  const s = loadSettings();
  applyTheme(s.darkMode);
  applyAnimations(s.animations);
  document.getElementById('settings-darkMode').checked = s.darkMode;
  document.getElementById('settings-defaultFilename').value = s.defaultFilename;
  document.getElementById('settings-autoDownload').checked = s.autoDownload;
  document.getElementById('settings-rememberFilename').checked = s.rememberFilename;
  document.getElementById('settings-animations').checked = s.animations;
}
function toggleTheme() {
  const s = loadSettings();
  s.darkMode = !s.darkMode;
  saveSettings(s);
  applyTheme(s.darkMode);
  document.getElementById('settings-darkMode').checked = s.darkMode;
}
document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
document.getElementById('qaTheme').addEventListener('click', toggleTheme);
document.getElementById('qaSettings').addEventListener('click', () => showView('settings'));
document.getElementById('qaUpgrade').addEventListener('click', openUpgradeModal);

document.getElementById('settings-darkMode').addEventListener('change', e => {
  const s = loadSettings(); s.darkMode = e.target.checked; saveSettings(s); applyTheme(s.darkMode);
});

/* ---- Hub theme sync ----
   When embedded in the Hub's iframe (see js/modules/pdftoolkit/pdftoolkit.js),
   the parent posts { type: 'hub:theme', dark } whenever the user's theme
   preference changes anywhere in the app, so this view never falls out of
   sync with the rest of the Hub. Standalone (opened directly, outside the
   Hub) this listener simply never fires and the toolkit's own toggle/local
   storage keeps working exactly as before. */
window.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'hub:theme') return;
  const s = loadSettings();
  s.darkMode = !!event.data.dark;
  saveSettings(s);
  applyTheme(s.darkMode);
  document.getElementById('settings-darkMode').checked = s.darkMode;
});
if (window.parent !== window) {
  try { window.parent.postMessage({ type: 'pdftoolkit:ready' }, window.location.origin); } catch (e) {}
}
document.getElementById('settings-defaultFilename').addEventListener('change', e => {
  const s = loadSettings(); s.defaultFilename = e.target.value.trim(); saveSettings(s);
});
document.getElementById('settings-autoDownload').addEventListener('change', e => {
  const s = loadSettings(); s.autoDownload = e.target.checked; saveSettings(s);
});
document.getElementById('settings-rememberFilename').addEventListener('change', e => {
  const s = loadSettings(); s.rememberFilename = e.target.checked; saveSettings(s);
});
document.getElementById('settings-animations').addEventListener('change', e => {
  const s = loadSettings(); s.animations = e.target.checked; saveSettings(s); applyAnimations(s.animations);
});

// Generic hook: whenever any tool's download card appears, apply the
// filename settings and (optionally) auto-trigger the download — without
// modifying that tool's own generation logic at all.
function setupSettingsHooks() {
  DOWNLOAD_CARDS.forEach(({ tool, card, filenameInput, downloadBtn }) => {
    const cardEl = document.getElementById(card);
    const inputEl = document.getElementById(filenameInput);
    if (!cardEl) return;
    if (inputEl) {
      inputEl.addEventListener('change', () => {
        const s = loadSettings();
        if (s.rememberFilename) localStorage.setItem('pdftk_filename_' + tool, inputEl.value);
      });
    }
    const observer = new MutationObserver(() => {
      if (!cardEl.classList.contains('show')) return;
      const s = loadSettings();
      if (inputEl) {
        if (s.defaultFilename) {
          inputEl.value = s.defaultFilename;
        } else if (s.rememberFilename) {
          const remembered = localStorage.getItem('pdftk_filename_' + tool);
          if (remembered) inputEl.value = remembered;
        }
      }
      if (s.autoDownload) {
        const btn = document.getElementById(downloadBtn);
        if (btn) setTimeout(() => btn.click(), 150);
      }
    });
    observer.observe(cardEl, { attributes: true, attributeFilter: ['class'] });
  });
}

/* ============================================================
   RECENT TOOLS
   ============================================================ */
function pushRecentTool(toolId) {
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem('pdftk_recent') || '[]'); } catch (e) { recent = []; }
  recent = recent.filter(r => r !== toolId);
  recent.unshift(toolId);
  recent = recent.slice(0, 5);
  localStorage.setItem('pdftk_recent', JSON.stringify(recent));
}
function getRecentTools() {
  try { return JSON.parse(localStorage.getItem('pdftk_recent') || '[]'); } catch (e) { return []; }
}

/* ============================================================
   ROUTER
   ============================================================ */
function showView(viewId) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + viewId);
  if (panel) panel.classList.add('active');
  if (viewId === 'settings') applySettingsToUI();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function navigateToTool(toolId) {
  if (isToolLocked(toolId)) { openUpgradeModal(); return; }
  pushRecentTool(toolId);
  showView(toolId);
  renderRecentChips();
}
document.getElementById('brandHome').addEventListener('click', () => showView('home'));

/* ============================================================
   HOME DASHBOARD
   ============================================================ */
function renderHome() {
  const grid = document.getElementById('homeGrid');
  grid.innerHTML = '';
  TOOL_DEFS.forEach(def => {
    const locked = isToolLocked(def.id);
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.dataset.toolId = def.id;
    card.dataset.toolName = def.name.toLowerCase();
    card.innerHTML = `
      <span class="t-icon">${def.icon}</span>
      <span class="t-name">${def.name}</span>
      <span class="t-desc">${def.desc}</span>
      ${locked ? '<span class="t-lock" title="Pro tool">🔒</span>' : ''}
    `;
    card.addEventListener('click', () => navigateToTool(def.id));
    grid.appendChild(card);
  });

  const csGrid = document.getElementById('comingSoonGrid');
  csGrid.innerHTML = '';
  COMING_SOON.forEach(item => {
    const card = document.createElement('div');
    card.className = 'coming-soon-card';
    card.innerHTML = `<span class="cs-icon">${item.icon}</span>${item.name}<span class="cs-tag">Coming soon</span>`;
    csGrid.appendChild(card);
  });

  refreshProUI();
  renderRecentChips();
}
function renderRecentChips() {
  const recent = getRecentTools();
  const section = document.getElementById('recentSection');
  const row = document.getElementById('recentChips');
  if (recent.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  row.innerHTML = '';
  recent.forEach(id => {
    const def = TOOL_DEFS.find(t => t.id === id);
    if (!def) return;
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = `${def.icon} ${def.name}`;
    chip.addEventListener('click', () => navigateToTool(id));
    row.appendChild(chip);
  });
}

/* ============================================================
   SEARCH
   ============================================================ */
const searchInput = document.getElementById('toolSearch');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  const cards = Array.from(document.querySelectorAll('#homeGrid .tool-card'));
  if (!q) {
    cards.forEach(c => { c.classList.remove('filtered-out', 'search-match'); });
    return;
  }
  if (document.getElementById('panel-home') && !document.getElementById('panel-home').classList.contains('active')) {
    showView('home');
  }
  let matches = [];
  cards.forEach(c => {
    const isMatch = c.dataset.toolName.includes(q);
    c.classList.toggle('filtered-out', !isMatch);
    c.classList.toggle('search-match', isMatch);
    if (isMatch) matches.push(c.dataset.toolId);
  });
  searchInput.dataset.topMatch = matches[0] || '';
});
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && searchInput.dataset.topMatch) {
    navigateToTool(searchInput.dataset.topMatch);
    searchInput.value = '';
    document.querySelectorAll('#homeGrid .tool-card').forEach(c => c.classList.remove('filtered-out', 'search-match'));
  }
});

function setupDropzone(zoneId, inputId, onFiles) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    onFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', e => { onFiles(e.target.files); input.value = ''; });
}

/* ============================================================
   Shared crop modal
   ============================================================ */
let cropperInstance = null;
let cropResolve = null;
function openCropper(dataUrl) {
  return new Promise(resolve => {
    cropResolve = resolve;
    const modal = document.getElementById('cropModal');
    const img = document.getElementById('cropImage');
    img.src = dataUrl;
    modal.classList.add('show');
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
    img.onload = () => {
      cropperInstance = new Cropper(img, { viewMode: 1, autoCropArea: 1, background: false });
    };
  });
}
document.getElementById('cropCancelBtn').addEventListener('click', () => {
  document.getElementById('cropModal').classList.remove('show');
  if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
  if (cropResolve) cropResolve(null);
});
document.getElementById('cropApplyBtn').addEventListener('click', () => {
  if (!cropperInstance) return;
  const canvas = cropperInstance.getCroppedCanvas();
  const dataUrl = canvas.toDataURL('image/png');
  document.getElementById('cropModal').classList.remove('show');
  cropperInstance.destroy(); cropperInstance = null;
  if (cropResolve) cropResolve(dataUrl);
});

/* ============================================================
   TOOL 1: Images -> PDF
   ------------------------------------------------------------
   Reorder UX: drag handle (☰) + a live "Position" number input.
   Drag uses Pointer Events (unifies mouse/touch/pen) so it works
   smoothly on mobile, and reorders by detecting which row is
   under the pointer — no native HTML5 drag-and-drop, which has
   poor/inconsistent touch support.
   ============================================================ */
(function () {
  let pages = [];
  let idCounter = 0;
  const pageList = document.getElementById('img-pageList');
  const emptyMsg = document.getElementById('img-emptyMsg');
  const generateBtn = document.getElementById('img-generateBtn');
  const status = document.getElementById('img-status');
  const downloadCard = document.getElementById('img-downloadCard');
  let generatedBlob = null;

  // Scoped styles for the thumbnail-grid UI. Uses the same CSS variables the
  // rest of the app already relies on for its dark theme, so no visual
  // style is being introduced — just grid/hover/dragging affordances.
  (function injectGridStyles() {
    if (document.getElementById('img2pdf-grid-styles')) return;
    const style = document.createElement('style');
    style.id = 'img2pdf-grid-styles';
    style.textContent = `
      #img-pageList.img-tile-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 22px;
        list-style: none;
        padding: 0;
        margin: 0 0 22px;
      }
      #img-pageList .img-tile {
        position: relative;
        border-radius: 12px;
        overflow: hidden;
        cursor: grab;
        touch-action: none;
        background: var(--panel-bg, #fff);
        border: 1px solid var(--border, #333);
        box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        transition: transform .15s ease, box-shadow .15s ease;
        user-select: none;
      }
      #img-pageList .img-tile:hover {
        transform: translateY(-3px);
        box-shadow: 0 10px 24px rgba(0,0,0,0.18);
      }
      #img-pageList .img-tile.dragging {
        opacity: 0.5;
        cursor: grabbing;
        box-shadow: 0 10px 28px rgba(0,0,0,0.35);
      }
      #img-pageList .img-tile.drop-target {
        outline: 2px dashed var(--accent, #6c8cff);
        outline-offset: -2px;
      }
      #img-pageList .thumb-wrap {
        position: relative;
        aspect-ratio: 3 / 4;
        display: flex;
        align-items: center;
        justify-content: center;
        background: repeating-conic-gradient(#f0f1f4 0% 25%, #fafafc 0% 50%) 50% / 16px 16px;
        overflow: hidden;
      }
      #img-pageList .img-tile img.thumb {
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
      }
      #img-pageList .page-badge {
        position: absolute;
        bottom: 8px;
        left: 8px;
        background: rgba(0,0,0,0.62);
        color: #fff;
        font-size: 11px;
        line-height: 1;
        padding: 4px 8px;
        border-radius: 20px;
        pointer-events: none;
      }
      #img-pageList .name {
        padding: 8px 10px;
        font-size: 12px;
        color: var(--muted, #888);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #img-pageList .overlay-actions {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        gap: 6px;
        opacity: 0;
        transform: translateY(-4px);
        transition: opacity .15s ease, transform .15s ease;
      }
      #img-pageList .img-tile:hover .overlay-actions,
      #img-pageList .img-tile:focus-within .overlay-actions {
        opacity: 1;
        transform: translateY(0);
      }
      #img-pageList .overlay-actions button {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: none;
        background: rgba(255,255,255,0.95);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        box-shadow: 0 1px 5px rgba(0,0,0,0.25);
        touch-action: manipulation;
      }
      #img-pageList .overlay-actions button:hover { background: #fff; transform: scale(1.06); }
      #img-pageList .overlay-actions button.remove:hover { background: #ffe4e4; }
      body.reordering-pages { cursor: grabbing !important; }
      body.reordering-pages * { user-select: none !important; }
      .img-preview-box { max-width: 640px; }
      .img-preview-container {
        max-height: 70vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: repeating-conic-gradient(#f0f1f4 0% 25%, #fafafc 0% 50%) 50% / 16px 16px;
        border-radius: 8px;
        overflow: hidden;
      }
      .img-preview-container img {
        max-width: 100%;
        max-height: 70vh;
        object-fit: contain;
      }
    `;
    document.head.appendChild(style);
  })();

  setupDropzone('img-dropzone', 'img-fileInput', async (fileListRaw) => {
    const IMG_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;
    const files = Array.from(fileListRaw).filter(f => f.type.startsWith('image/') || IMG_EXT_RE.test(f.name));
    if (files.length === 0) { status.textContent = 'Please select image files (PNG, JPG, WEBP, etc).'; return; }
    status.textContent = 'Loading images...';
    for (const file of files) {
      const rawDataUrl = await fileToDataUrl(file);
      // Normalize every image to PNG via canvas so formats like JPG/WEBP/BMP/GIF
      // all embed reliably later on (the PDF generator always writes PNG frames).
      let dataUrl = rawDataUrl;
      try {
        const img = await loadImage(rawDataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        dataUrl = canvas.toDataURL('image/png');
      } catch (e) {
        console.error('Could not normalize image, using original:', file.name, e);
      }
      pages.push({ id: idCounter++, name: file.name, dataUrl });
    }
    status.textContent = '';
    downloadCard.classList.remove('show');
    render();
  });

  function removePage(id) { pages = pages.filter(p => p.id !== id); render(); }
  async function cropPage(id) {
    const p = pages.find(p => p.id === id);
    if (!p) return;
    const result = await openCropper(p.dataUrl);
    if (result) { p.dataUrl = result; render(); }
  }
  async function rotatePage(id) {
    const p = pages.find(p => p.id === id);
    if (!p) return;
    const img = await loadImage(p.dataUrl);
    const canvas = document.createElement('canvas');
    // Swap width/height for a 90° turn.
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    p.dataUrl = canvas.toDataURL('image/png');
    render();
  }
  function previewPage(id) {
    const p = pages.find(p => p.id === id);
    if (!p) return;
    document.getElementById('imgPreviewName').textContent = p.name;
    document.getElementById('imgPreviewImage').src = p.dataUrl;
    document.getElementById('imgPreviewModal').classList.add('show');
  }
  document.getElementById('imgPreviewCloseBtn').addEventListener('click', () => {
    document.getElementById('imgPreviewModal').classList.remove('show');
  });

  /* ---- Drag-to-reorder (pointer events, mobile-friendly) ----
     Press-and-hold anywhere on a tile to drag it to a new position.
     A short tap (no meaningful movement) opens the preview instead. */
  let dragId = null;
  let dragStarted = false;
  let dragStartX = 0, dragStartY = 0;
  const DRAG_THRESHOLD = 6; // px of movement before a hold becomes a drag

  function onPointerMove(e) {
    if (dragId == null) return;
    const point = e.touches && e.touches[0] ? e.touches[0] : e;

    if (!dragStarted) {
      const dx = point.clientX - dragStartX, dy = point.clientY - dragStartY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragStarted = true;
      const li = pageList.querySelector(`.img-tile[data-id="${dragId}"]`);
      if (li) li.classList.add('dragging');
      document.body.classList.add('reordering-pages');
    }

    const overEl = document.elementFromPoint(point.clientX, point.clientY);
    const overLi = overEl && overEl.closest('.img-tile');
    pageList.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    if (!overLi || !pageList.contains(overLi)) return;
    const overId = overLi.dataset.id;
    if (overId === String(dragId)) return;
    overLi.classList.add('drop-target');
    const fromIdx = pages.findIndex(p => String(p.id) === String(dragId));
    const toIdx = pages.findIndex(p => String(p.id) === overId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [item] = pages.splice(fromIdx, 1);
    pages.splice(toIdx, 0, item);
    render();
    const newLi = pageList.querySelector(`.img-tile[data-id="${dragId}"]`);
    if (newLi) newLi.classList.add('dragging');
  }

  function endDrag() {
    const wasClick = !dragStarted;
    const clickedId = dragId;
    dragId = null;
    dragStarted = false;
    document.body.classList.remove('reordering-pages');
    pageList.querySelectorAll('.dragging, .drop-target').forEach(el => el.classList.remove('dragging', 'drop-target'));
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
    if (wasClick && clickedId != null) previewPage(clickedId);
  }

  function startDrag(id, x, y) {
    dragId = id;
    dragStarted = false;
    dragStartX = x;
    dragStartY = y;
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
  }

  function render() {
    pageList.innerHTML = '';
    pageList.classList.add('img-tile-grid');
    emptyMsg.style.display = pages.length ? 'none' : 'block';
    generateBtn.disabled = pages.length === 0;
    pages.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'img-tile';
      li.dataset.id = String(p.id);
      li.title = 'Click to preview • Hold and drag to reorder';
      li.innerHTML = `
        <div class="overlay-actions">
          <button class="rotate" title="Rotate">↻</button>
          <button class="crop" title="Crop">✂️</button>
          <button class="remove" title="Remove">✕</button>
        </div>
        <div class="thumb-wrap">
          <img class="thumb" src="${p.dataUrl}" alt="">
          <span class="page-badge">${i + 1} of ${pages.length}</span>
        </div>
        <div class="name">${p.name}</div>`;

      li.querySelector('.rotate').addEventListener('click', (e) => { e.stopPropagation(); rotatePage(p.id); });
      li.querySelector('.crop').addEventListener('click', (e) => { e.stopPropagation(); cropPage(p.id); });
      li.querySelector('.remove').addEventListener('click', (e) => { e.stopPropagation(); removePage(p.id); });
      // Keep pointerdown from starting a drag when an action icon is pressed.
      li.querySelector('.overlay-actions').addEventListener('pointerdown', (e) => e.stopPropagation());

      li.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        startDrag(p.id, e.clientX, e.clientY);
      });

      pageList.appendChild(li);
    });
  }

  document.getElementById('img-clearBtn').addEventListener('click', () => {
    pages = []; render(); status.textContent = ''; downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', async () => {
    if (pages.length === 0) return;
    generateBtn.disabled = true;
    status.textContent = 'Generating PDF...';
    try {
      const { jsPDF } = window.jspdf;
      let pdf = null;
      for (let i = 0; i < pages.length; i++) {
        const img = await loadImage(pages[i].dataUrl);
        const orientation = img.width >= img.height ? 'landscape' : 'portrait';
        const pageSize = [img.width, img.height];
        if (i === 0) pdf = new jsPDF({ orientation, unit: 'px', format: pageSize });
        else pdf.addPage(pageSize, orientation);
        pdf.addImage(pages[i].dataUrl, 'PNG', 0, 0, img.width, img.height);
        status.textContent = `Adding page ${i + 1} of ${pages.length}...`;
      }
      generatedBlob = pdf.output('blob');
      status.textContent = `Done — ${pages.length} page${pages.length > 1 ? 's' : ''} ready.`;
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong generating the PDF.';
    } finally {
      generateBtn.disabled = false;
    }
  });

  document.getElementById('img-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('img-filename').value || 'converted').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 2: Merge & organize
   ============================================================ */
(function () {
  let pages = []; // {id, srcName, srcBytes(ArrayBuffer), pageIndex, thumb}
  let idCounter = 0;
  const pageList = document.getElementById('merge-pageList');
  const emptyMsg = document.getElementById('merge-emptyMsg');
  const generateBtn = document.getElementById('merge-generateBtn');
  const status = document.getElementById('merge-status');
  const downloadCard = document.getElementById('merge-downloadCard');
  let generatedBlob = null;

  setupDropzone('merge-dropzone', 'merge-fileInput', async (fileListRaw) => {
    const files = Array.from(fileListRaw).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) { status.textContent = 'Please select PDF files only.'; return; }
    status.textContent = 'Loading pages...';
    for (const file of files) {
      const buf = await fileToArrayBuffer(file);
      const pdfjsDoc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      for (let i = 1; i <= pdfjsDoc.numPages; i++) {
        const thumb = await renderPdfPageThumb(pdfjsDoc, i, 90);
        pages.push({ id: idCounter++, srcName: file.name, srcBytes: buf, pageIndex: i - 1, thumb });
        render();
      }
    }
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  function movePage(id, dir) {
    const idx = pages.findIndex(p => p.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= pages.length) return;
    [pages[idx], pages[newIdx]] = [pages[newIdx], pages[idx]];
    render();
  }
  function removePage(id) { pages = pages.filter(p => p.id !== id); render(); }

  function render() {
    pageList.innerHTML = '';
    emptyMsg.style.display = pages.length ? 'none' : 'block';
    generateBtn.disabled = pages.length === 0;
    pages.forEach((p, i) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <img class="thumb" src="${p.thumb}" alt="">
        <div class="info">
          <div class="name">${p.srcName} — page ${p.pageIndex + 1}</div>
          <div class="tag">Position ${i + 1} of ${pages.length}</div>
        </div>
        <div class="controls">
          <button class="icon-btn up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn down" title="Move down" ${i === pages.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn remove" title="Remove">✕</button>
        </div>`;
      li.querySelector('.up').onclick = () => movePage(p.id, -1);
      li.querySelector('.down').onclick = () => movePage(p.id, 1);
      li.querySelector('.remove').onclick = () => removePage(p.id);
      pageList.appendChild(li);
    });
  }

  document.getElementById('merge-clearBtn').addEventListener('click', () => {
    pages = []; render(); status.textContent = ''; downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('merge', async () => {
    if (pages.length === 0) return;
    generateBtn.disabled = true;
    status.textContent = 'Merging...';
    try {
      const outDoc = await PDFDocument.create();
      // cache loaded pdf-lib docs per source buffer to avoid reloading repeatedly
      const cache = new Map();
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        let srcDoc = cache.get(p.srcBytes);
        if (!srcDoc) {
          srcDoc = await PDFDocument.load(p.srcBytes.slice(0));
          cache.set(p.srcBytes, srcDoc);
        }
        const [copied] = await outDoc.copyPages(srcDoc, [p.pageIndex]);
        outDoc.addPage(copied);
        status.textContent = `Merging page ${i + 1} of ${pages.length}...`;
      }
      const bytes = await outDoc.save();
      generatedBlob = new Blob([bytes], { type: 'application/pdf' });
      status.textContent = `Done — ${pages.length} pages merged.`;
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong merging the PDFs.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('merge-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('merge-filename').value || 'merged').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 3: Split
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  let pageThumbs = []; // {pageIndex, thumb, checked}
  const pageList = document.getElementById('split-pageList');
  const emptyMsg = document.getElementById('split-emptyMsg');
  const optionsBox = document.getElementById('split-options');
  const generateBtn = document.getElementById('split-generateBtn');
  const status = document.getElementById('split-status');
  const downloadCard = document.getElementById('split-downloadCard');
  const rangesField = document.getElementById('split-ranges-field');
  let generatedBlob = null;
  let generatedExt = '.pdf';

  document.querySelectorAll('input[name="split-mode"]').forEach(r => {
    r.addEventListener('change', () => {
      rangesField.style.display = document.querySelector('input[name="split-mode"]:checked').value === 'ranges' ? 'block' : 'none';
    });
  });

  setupDropzone('split-dropzone', 'split-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    status.textContent = 'Loading pages...';
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    const pdfjsDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
    pageThumbs = [];
    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      const thumb = await renderPdfPageThumb(pdfjsDoc, i, 90);
      pageThumbs.push({ pageIndex: i - 1, thumb, checked: true });
      render();
    }
    status.textContent = '';
    optionsBox.style.display = 'block';
    generateBtn.disabled = false;
    downloadCard.classList.remove('show');
  });

  function render() {
    pageList.innerHTML = '';
    emptyMsg.style.display = pageThumbs.length ? 'none' : 'block';
    pageThumbs.forEach((p) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <input type="checkbox" ${p.checked ? 'checked' : ''}>
        <img class="thumb" src="${p.thumb}" alt="">
        <div class="info">
          <div class="name">Page ${p.pageIndex + 1}</div>
        </div>`;
      li.querySelector('input').onchange = (e) => { p.checked = e.target.checked; };
      pageList.appendChild(li);
    });
  }

  document.getElementById('split-clearBtn').addEventListener('click', () => {
    srcBytes = null; pageThumbs = []; render();
    optionsBox.style.display = 'none';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  function parseRanges(str, maxPage) {
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    const ranges = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) continue;
      let start = parseInt(m[1], 10) - 1;
      let end = m[2] ? parseInt(m[2], 10) - 1 : start;
      start = Math.max(0, start); end = Math.min(maxPage - 1, end);
      if (start <= end) ranges.push([start, end]);
    }
    return ranges;
  }

  generateBtn.addEventListener('click', proGuardedHandler('split', async () => {
    if (!srcBytes) return;
    const mode = document.querySelector('input[name="split-mode"]:checked').value;
    generateBtn.disabled = true;
    status.textContent = 'Processing...';
    try {
      const srcDoc = await PDFDocument.load(srcBytes.slice(0));

      if (mode === 'selected') {
        const indices = pageThumbs.filter(p => p.checked).map(p => p.pageIndex);
        if (indices.length === 0) { status.textContent = 'Select at least one page.'; generateBtn.disabled = false; return; }
        const outDoc = await PDFDocument.create();
        const copied = await outDoc.copyPages(srcDoc, indices);
        copied.forEach(p => outDoc.addPage(p));
        const bytes = await outDoc.save();
        generatedBlob = new Blob([bytes], { type: 'application/pdf' });
        generatedExt = '.pdf';
        status.textContent = `Done — ${indices.length} pages extracted.`;
      } else if (mode === 'every') {
        const zip = new JSZip();
        for (let i = 0; i < srcDoc.getPageCount(); i++) {
          const outDoc = await PDFDocument.create();
          const [copied] = await outDoc.copyPages(srcDoc, [i]);
          outDoc.addPage(copied);
          const bytes = await outDoc.save();
          zip.file(`page-${i + 1}.pdf`, bytes);
          status.textContent = `Splitting page ${i + 1} of ${srcDoc.getPageCount()}...`;
        }
        generatedBlob = await zip.generateAsync({ type: 'blob' });
        generatedExt = '.zip';
        status.textContent = `Done — ${srcDoc.getPageCount()} PDFs zipped.`;
      } else if (mode === 'ranges') {
        const rangeStr = document.getElementById('split-ranges').value;
        const ranges = parseRanges(rangeStr, srcDoc.getPageCount());
        if (ranges.length === 0) { status.textContent = 'Enter at least one valid range, e.g. 1-3.'; generateBtn.disabled = false; return; }
        const zip = new JSZip();
        for (let r = 0; r < ranges.length; r++) {
          const [start, end] = ranges[r];
          const indices = [];
          for (let i = start; i <= end; i++) indices.push(i);
          const outDoc = await PDFDocument.create();
          const copied = await outDoc.copyPages(srcDoc, indices);
          copied.forEach(p => outDoc.addPage(p));
          const bytes = await outDoc.save();
          zip.file(`pages-${start + 1}-${end + 1}.pdf`, bytes);
          status.textContent = `Building range ${r + 1} of ${ranges.length}...`;
        }
        generatedBlob = await zip.generateAsync({ type: 'blob' });
        generatedExt = '.zip';
        status.textContent = `Done — ${ranges.length} PDFs zipped.`;
      }
      document.getElementById('split-ext').textContent = generatedExt;
      document.getElementById('split-filename').value = srcName + (generatedExt === '.zip' ? '-split' : '-extract');
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong splitting the PDF.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('split-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('split-filename').value || 'split-output').trim();
    triggerDownload(generatedBlob, name.replace(/\.(pdf|zip)$/i, '') + generatedExt);
  });
})();

/* ============================================================
   TOOL 4: Compress
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  const emptyMsg = document.getElementById('compress-emptyMsg');
  const optionsBox = document.getElementById('compress-options');
  const generateBtn = document.getElementById('compress-generateBtn');
  const status = document.getElementById('compress-status');
  const downloadCard = document.getElementById('compress-downloadCard');
  const qualitySlider = document.getElementById('compress-quality');
  const qualityVal = document.getElementById('compress-quality-val');
  let generatedBlob = null;

  qualitySlider.addEventListener('input', () => { qualityVal.textContent = qualitySlider.value; });

  setupDropzone('compress-dropzone', 'compress-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    emptyMsg.textContent = `Loaded ${file.name} (${fmtBytes(srcBytes.byteLength)})`;
    optionsBox.style.display = 'block';
    generateBtn.disabled = false;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  document.getElementById('compress-clearBtn').addEventListener('click', () => {
    srcBytes = null;
    emptyMsg.textContent = 'No PDF loaded yet.';
    optionsBox.style.display = 'none';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  function jpegBytesToBlobUrl(bytes) {
    return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  }

  generateBtn.addEventListener('click', proGuardedHandler('compress', async () => {
    if (!srcBytes) return;
    generateBtn.disabled = true;
    const quality = parseInt(qualitySlider.value, 10) / 100;
    status.textContent = 'Analyzing images...';
    try {
      const doc = await PDFDocument.load(srcBytes.slice(0));
      const ctx = doc.context;
      let recompressed = 0;
      for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream)) continue;
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of('Subtype'));
        if (!subtype || subtype.toString() !== '/Image') continue;
        const filter = dict.get(PDFName.of('Filter'));
        const filterName = filter ? filter.toString() : '';
        if (filterName.indexOf('DCTDecode') === -1) continue; // only recompress existing JPEGs

        try {
          const url = jpegBytesToBlobUrl(obj.contents);
          const img = await loadImage(url);
          URL.revokeObjectURL(url);
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          const newBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
          const newBytes = new Uint8Array(await newBlob.arrayBuffer());
          if (newBytes.length < obj.contents.length) {
            obj.contents = newBytes;
            dict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length));
            recompressed++;
          }
        } catch (imgErr) {
          console.warn('Skipping an image (could not decode):', imgErr);
        }
        status.textContent = `Recompressed ${recompressed} image(s)...`;
      }
      const outBytes = await doc.save({ useObjectStreams: true });
      generatedBlob = new Blob([outBytes], { type: 'application/pdf' });
      const before = srcBytes.byteLength, after = outBytes.length;
      const pct = before > 0 ? Math.round((1 - after / before) * 100) : 0;
      document.getElementById('compress-sizeNote').textContent =
        `${fmtBytes(before)} → ${fmtBytes(after)}` + (pct > 0 ? ` (${pct}% smaller)` : ' (already fairly compact)');
      status.textContent = recompressed > 0
        ? `Done — recompressed ${recompressed} image(s).`
        : 'Done — no compressible JPEG images found, but the file was repacked.';
      document.getElementById('compress-filename').value = srcName + '-compressed';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong compressing the PDF.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('compress-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('compress-filename').value || 'compressed').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 5: Password protect
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  const emptyMsg = document.getElementById('protect-emptyMsg');
  const optionsBox = document.getElementById('protect-options');
  const generateBtn = document.getElementById('protect-generateBtn');
  const status = document.getElementById('protect-status');
  const downloadCard = document.getElementById('protect-downloadCard');
  let generatedBlob = null;

  setupDropzone('protect-dropzone', 'protect-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    emptyMsg.textContent = `Loaded ${file.name} (${fmtBytes(srcBytes.byteLength)})`;
    optionsBox.style.display = 'block';
    generateBtn.disabled = false;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  document.getElementById('protect-clearBtn').addEventListener('click', () => {
    srcBytes = null;
    emptyMsg.textContent = 'No PDF loaded yet.';
    optionsBox.style.display = 'none';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('protect', async () => {
    if (!srcBytes) return;
    const pw = document.getElementById('protect-userpw').value;
    if (!pw) { status.textContent = 'Enter a password first.'; return; }
    generateBtn.disabled = true;
    status.textContent = 'Encrypting...';
    try {
      const outBytes = await encryptPdfBytes(new Uint8Array(srcBytes.slice(0)), pw);
      generatedBlob = new Blob([outBytes], { type: 'application/pdf' });
      status.textContent = 'Done — the PDF is now password protected.';
      document.getElementById('protect-filename').value = srcName + '-protected';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong protecting the PDF.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('protect-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('protect-filename').value || 'protected').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 6: Rotate pages
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  let pageInfos = []; // {pageIndex, thumb, rotation}
  const pageList = document.getElementById('rotate-pageList');
  const emptyMsg = document.getElementById('rotate-emptyMsg');
  const optionsBox = document.getElementById('rotate-options');
  const generateBtn = document.getElementById('rotate-generateBtn');
  const status = document.getElementById('rotate-status');
  const downloadCard = document.getElementById('rotate-downloadCard');
  let generatedBlob = null;

  setupDropzone('rotate-dropzone', 'rotate-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    status.textContent = 'Loading pages...';
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    const pdfjsDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
    pageInfos = [];
    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      const thumb = await renderPdfPageThumb(pdfjsDoc, i, 90);
      pageInfos.push({ pageIndex: i - 1, thumb, rotation: 0 });
      render();
    }
    status.textContent = '';
    optionsBox.style.display = 'block';
    generateBtn.disabled = false;
    downloadCard.classList.remove('show');
  });

  function render() {
    pageList.innerHTML = '';
    emptyMsg.style.display = pageInfos.length ? 'none' : 'block';
    pageInfos.forEach((p) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <img class="thumb page-thumb-mini" style="transform: rotate(${p.rotation}deg);" src="${p.thumb}" alt="">
        <div class="info">
          <div class="name">Page ${p.pageIndex + 1}</div>
          <div class="tag">${p.rotation}°</div>
        </div>
        <div class="controls">
          <button class="icon-btn rot-left" title="Rotate left">↺</button>
          <button class="icon-btn rot-right" title="Rotate right">↻</button>
        </div>`;
      li.querySelector('.rot-left').onclick = () => { p.rotation = (p.rotation - 90 + 360) % 360; render(); };
      li.querySelector('.rot-right').onclick = () => { p.rotation = (p.rotation + 90) % 360; render(); };
      pageList.appendChild(li);
    });
  }

  document.getElementById('rotate-allLeft').addEventListener('click', () => {
    pageInfos.forEach(p => { p.rotation = (p.rotation - 90 + 360) % 360; });
    render();
  });
  document.getElementById('rotate-allRight').addEventListener('click', () => {
    pageInfos.forEach(p => { p.rotation = (p.rotation + 90) % 360; });
    render();
  });

  document.getElementById('rotate-clearBtn').addEventListener('click', () => {
    srcBytes = null; pageInfos = []; render();
    optionsBox.style.display = 'none';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('rotate', async () => {
    if (!srcBytes) return;
    generateBtn.disabled = true;
    status.textContent = 'Rotating...';
    try {
      const doc = await PDFDocument.load(srcBytes.slice(0));
      const docPages = doc.getPages();
      pageInfos.forEach(p => {
        const page = docPages[p.pageIndex];
        const current = page.getRotation().angle;
        page.setRotation(PDFLib.degrees(current + p.rotation));
      });
      const bytes = await doc.save();
      generatedBlob = new Blob([bytes], { type: 'application/pdf' });
      status.textContent = 'Done — pages rotated.';
      document.getElementById('rotate-filename').value = srcName + '-rotated';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong rotating the PDF.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('rotate-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('rotate-filename').value || 'rotated').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 7: Delete pages
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  let pageThumbs = []; // {pageIndex, thumb, checked} — checked = keep
  const pageList = document.getElementById('deletepages-pageList');
  const emptyMsg = document.getElementById('deletepages-emptyMsg');
  const generateBtn = document.getElementById('deletepages-generateBtn');
  const status = document.getElementById('deletepages-status');
  const downloadCard = document.getElementById('deletepages-downloadCard');
  let generatedBlob = null;

  setupDropzone('deletepages-dropzone', 'deletepages-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    status.textContent = 'Loading pages...';
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    const pdfjsDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
    pageThumbs = [];
    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      const thumb = await renderPdfPageThumb(pdfjsDoc, i, 90);
      pageThumbs.push({ pageIndex: i - 1, thumb, checked: true });
      render();
    }
    status.textContent = '';
    generateBtn.disabled = false;
    downloadCard.classList.remove('show');
  });

  function render() {
    pageList.innerHTML = '';
    emptyMsg.style.display = pageThumbs.length ? 'none' : 'block';
    pageThumbs.forEach((p) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <input type="checkbox" ${p.checked ? 'checked' : ''}>
        <img class="thumb" src="${p.thumb}" alt="">
        <div class="info"><div class="name">Page ${p.pageIndex + 1}</div></div>`;
      li.querySelector('input').onchange = (e) => { p.checked = e.target.checked; };
      pageList.appendChild(li);
    });
  }

  document.getElementById('deletepages-clearBtn').addEventListener('click', () => {
    srcBytes = null; pageThumbs = []; render();
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('deletepages', async () => {
    if (!srcBytes) return;
    const keepIndices = pageThumbs.filter(p => p.checked).map(p => p.pageIndex);
    if (keepIndices.length === 0) { status.textContent = 'Keep at least one page.'; return; }
    generateBtn.disabled = true;
    status.textContent = 'Removing pages...';
    try {
      const srcDoc = await PDFDocument.load(srcBytes.slice(0));
      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(srcDoc, keepIndices);
      copied.forEach(p => outDoc.addPage(p));
      const bytes = await outDoc.save();
      generatedBlob = new Blob([bytes], { type: 'application/pdf' });
      status.textContent = `Done — ${pageThumbs.length - keepIndices.length} page(s) removed.`;
      document.getElementById('deletepages-filename').value = srcName + '-pages-removed';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong removing pages.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('deletepages-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('deletepages-filename').value || 'pages-removed').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 8: Extract pages
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  let pageThumbs = []; // {pageIndex, thumb, checked} — checked = extract
  const pageList = document.getElementById('extractpages-pageList');
  const emptyMsg = document.getElementById('extractpages-emptyMsg');
  const generateBtn = document.getElementById('extractpages-generateBtn');
  const status = document.getElementById('extractpages-status');
  const downloadCard = document.getElementById('extractpages-downloadCard');
  let generatedBlob = null;

  setupDropzone('extractpages-dropzone', 'extractpages-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    status.textContent = 'Loading pages...';
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    const pdfjsDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
    pageThumbs = [];
    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      const thumb = await renderPdfPageThumb(pdfjsDoc, i, 90);
      pageThumbs.push({ pageIndex: i - 1, thumb, checked: false });
      render();
    }
    status.textContent = '';
    generateBtn.disabled = false;
    downloadCard.classList.remove('show');
  });

  function render() {
    pageList.innerHTML = '';
    emptyMsg.style.display = pageThumbs.length ? 'none' : 'block';
    pageThumbs.forEach((p) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <input type="checkbox" ${p.checked ? 'checked' : ''}>
        <img class="thumb" src="${p.thumb}" alt="">
        <div class="info"><div class="name">Page ${p.pageIndex + 1}</div></div>`;
      li.querySelector('input').onchange = (e) => { p.checked = e.target.checked; };
      pageList.appendChild(li);
    });
  }

  document.getElementById('extractpages-clearBtn').addEventListener('click', () => {
    srcBytes = null; pageThumbs = []; render();
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('extractpages', async () => {
    if (!srcBytes) return;
    const indices = pageThumbs.filter(p => p.checked).map(p => p.pageIndex);
    if (indices.length === 0) { status.textContent = 'Check at least one page to extract.'; return; }
    generateBtn.disabled = true;
    status.textContent = 'Extracting...';
    try {
      const srcDoc = await PDFDocument.load(srcBytes.slice(0));
      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(srcDoc, indices);
      copied.forEach(p => outDoc.addPage(p));
      const bytes = await outDoc.save();
      generatedBlob = new Blob([bytes], { type: 'application/pdf' });
      status.textContent = `Done — ${indices.length} page(s) extracted.`;
      document.getElementById('extractpages-filename').value = srcName + '-extracted';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong extracting pages.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('extractpages-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('extractpages-filename').value || 'extracted').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 9: Reverse page order
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  const emptyMsg = document.getElementById('reverse-emptyMsg');
  const generateBtn = document.getElementById('reverse-generateBtn');
  const status = document.getElementById('reverse-status');
  const downloadCard = document.getElementById('reverse-downloadCard');
  let generatedBlob = null;

  setupDropzone('reverse-dropzone', 'reverse-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    const doc = await PDFDocument.load(srcBytes.slice(0));
    const pageCount = doc.getPageCount();
    emptyMsg.textContent = `Loaded ${file.name} — ${pageCount} page${pageCount > 1 ? 's' : ''}.`;
    generateBtn.disabled = false;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  document.getElementById('reverse-clearBtn').addEventListener('click', () => {
    srcBytes = null;
    emptyMsg.textContent = 'No PDF loaded yet.';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('reverse', async () => {
    if (!srcBytes) return;
    generateBtn.disabled = true;
    status.textContent = 'Reversing...';
    try {
      const srcDoc = await PDFDocument.load(srcBytes.slice(0));
      const total = srcDoc.getPageCount();
      const order = Array.from({ length: total }, (_, i) => total - 1 - i);
      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(srcDoc, order);
      copied.forEach(p => outDoc.addPage(p));
      const bytes = await outDoc.save();
      generatedBlob = new Blob([bytes], { type: 'application/pdf' });
      status.textContent = 'Done — page order reversed.';
      document.getElementById('reverse-filename').value = srcName + '-reversed';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong reversing the PDF.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('reverse-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('reverse-filename').value || 'reversed').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 10: Add page numbers
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  const emptyMsg = document.getElementById('pagenumbers-emptyMsg');
  const optionsBox = document.getElementById('pagenumbers-options');
  const generateBtn = document.getElementById('pagenumbers-generateBtn');
  const status = document.getElementById('pagenumbers-status');
  const downloadCard = document.getElementById('pagenumbers-downloadCard');
  let generatedBlob = null;

  setupDropzone('pagenumbers-dropzone', 'pagenumbers-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    emptyMsg.textContent = `Loaded ${file.name} (${fmtBytes(srcBytes.byteLength)})`;
    optionsBox.style.display = 'block';
    generateBtn.disabled = false;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  document.getElementById('pagenumbers-clearBtn').addEventListener('click', () => {
    srcBytes = null;
    emptyMsg.textContent = 'No PDF loaded yet.';
    optionsBox.style.display = 'none';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('pagenumbers', async () => {
    if (!srcBytes) return;
    generateBtn.disabled = true;
    status.textContent = 'Stamping page numbers...';
    try {
      const doc = await PDFDocument.load(srcBytes.slice(0));
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const position = document.getElementById('pagenumbers-position').value;
      const format = document.getElementById('pagenumbers-format').value || '{n} of {total}';
      const startAt = parseInt(document.getElementById('pagenumbers-start').value, 10) || 1;
      const docPages = doc.getPages();
      const total = docPages.length;
      const margin = 24;
      const fontSize = 10;
      docPages.forEach((page, i) => {
        const { width, height } = page.getSize();
        const n = startAt + i;
        const text = format.replace('{n}', n).replace('{total}', total);
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        let x, y;
        if (position.startsWith('bottom')) y = margin; else y = height - margin;
        if (position.endsWith('center')) x = (width - textWidth) / 2;
        else if (position.endsWith('right')) x = width - textWidth - margin;
        else x = margin;
        page.drawText(text, { x, y, size: fontSize, font, color: PDFLib.rgb(0.3, 0.3, 0.3) });
        status.textContent = `Stamping page ${i + 1} of ${total}...`;
      });
      const bytes = await doc.save();
      generatedBlob = new Blob([bytes], { type: 'application/pdf' });
      status.textContent = 'Done — page numbers added.';
      document.getElementById('pagenumbers-filename').value = srcName + '-numbered';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong adding page numbers.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('pagenumbers-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('pagenumbers-filename').value || 'numbered').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 11: Watermark
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  const emptyMsg = document.getElementById('watermark-emptyMsg');
  const optionsBox = document.getElementById('watermark-options');
  const generateBtn = document.getElementById('watermark-generateBtn');
  const status = document.getElementById('watermark-status');
  const downloadCard = document.getElementById('watermark-downloadCard');
  const opacitySlider = document.getElementById('watermark-opacity');
  const opacityVal = document.getElementById('watermark-opacity-val');
  const sizeSlider = document.getElementById('watermark-size');
  const sizeVal = document.getElementById('watermark-size-val');
  let generatedBlob = null;

  opacitySlider.addEventListener('input', () => { opacityVal.textContent = opacitySlider.value; });
  sizeSlider.addEventListener('input', () => { sizeVal.textContent = sizeSlider.value; });

  setupDropzone('watermark-dropzone', 'watermark-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    emptyMsg.textContent = `Loaded ${file.name} (${fmtBytes(srcBytes.byteLength)})`;
    optionsBox.style.display = 'block';
    generateBtn.disabled = false;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  document.getElementById('watermark-clearBtn').addEventListener('click', () => {
    srcBytes = null;
    emptyMsg.textContent = 'No PDF loaded yet.';
    optionsBox.style.display = 'none';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('watermark', async () => {
    if (!srcBytes) return;
    generateBtn.disabled = true;
    status.textContent = 'Applying watermark...';
    try {
      const doc = await PDFDocument.load(srcBytes.slice(0));
      const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      const text = document.getElementById('watermark-text').value || 'CONFIDENTIAL';
      const opacity = parseInt(opacitySlider.value, 10) / 100;
      const fontSize = parseInt(sizeSlider.value, 10);
      const docPages = doc.getPages();
      docPages.forEach((page, i) => {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        page.drawText(text, {
          x: width / 2 - textWidth / 2,
          y: height / 2,
          size: fontSize,
          font,
          color: PDFLib.rgb(0.6, 0.1, 0.1),
          opacity,
          rotate: PDFLib.degrees(45),
        });
        status.textContent = `Watermarking page ${i + 1} of ${docPages.length}...`;
      });
      const bytes = await doc.save();
      generatedBlob = new Blob([bytes], { type: 'application/pdf' });
      status.textContent = 'Done — watermark applied.';
      document.getElementById('watermark-filename').value = srcName + '-watermarked';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong applying the watermark.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('watermark-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('watermark-filename').value || 'watermarked').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 12: PDF -> Images
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  const emptyMsg = document.getElementById('pdf2img-emptyMsg');
  const optionsBox = document.getElementById('pdf2img-options');
  const generateBtn = document.getElementById('pdf2img-generateBtn');
  const status = document.getElementById('pdf2img-status');
  const downloadCard = document.getElementById('pdf2img-downloadCard');
  const scaleSlider = document.getElementById('pdf2img-scale');
  const scaleVal = document.getElementById('pdf2img-scale-val');
  let generatedBlob = null;

  scaleSlider.addEventListener('input', () => { scaleVal.textContent = scaleSlider.value; });

  setupDropzone('pdf2img-dropzone', 'pdf2img-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    const pdfjsDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
    emptyMsg.textContent = `Loaded ${file.name} — ${pdfjsDoc.numPages} page${pdfjsDoc.numPages > 1 ? 's' : ''}.`;
    optionsBox.style.display = 'block';
    generateBtn.disabled = false;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  document.getElementById('pdf2img-clearBtn').addEventListener('click', () => {
    srcBytes = null;
    emptyMsg.textContent = 'No PDF loaded yet.';
    optionsBox.style.display = 'none';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('pdf2img', async () => {
    if (!srcBytes) return;
    generateBtn.disabled = true;
    status.textContent = 'Rendering pages...';
    try {
      const pdfjsDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
      const scale = parseInt(scaleSlider.value, 10);
      const zip = new JSZip();
      for (let i = 1; i <= pdfjsDoc.numPages; i++) {
        const page = await pdfjsDoc.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const dataUrl = canvas.toDataURL('image/png');
        zip.file(`page-${i}.png`, dataUrl.split(',')[1], { base64: true });
        status.textContent = `Rendered page ${i} of ${pdfjsDoc.numPages}...`;
      }
      generatedBlob = await zip.generateAsync({ type: 'blob' });
      status.textContent = `Done — ${pdfjsDoc.numPages} image(s) zipped.`;
      document.getElementById('pdf2img-filename').value = srcName + '-pages';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong exporting images.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('pdf2img-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('pdf2img-filename').value || 'pages').trim();
    triggerDownload(generatedBlob, name.replace(/\.zip$/i, '') + '.zip');
  });
})();

/* ============================================================
   TOOL 13: Extract images (JPEG images embedded in the PDF)
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  const emptyMsg = document.getElementById('extractimages-emptyMsg');
  const generateBtn = document.getElementById('extractimages-generateBtn');
  const status = document.getElementById('extractimages-status');
  const downloadCard = document.getElementById('extractimages-downloadCard');
  let generatedBlob = null;

  setupDropzone('extractimages-dropzone', 'extractimages-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    emptyMsg.textContent = `Loaded ${file.name} (${fmtBytes(srcBytes.byteLength)})`;
    generateBtn.disabled = false;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  document.getElementById('extractimages-clearBtn').addEventListener('click', () => {
    srcBytes = null;
    emptyMsg.textContent = 'No PDF loaded yet.';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('extractimages', async () => {
    if (!srcBytes) return;
    generateBtn.disabled = true;
    status.textContent = 'Scanning for images...';
    try {
      const doc = await PDFDocument.load(srcBytes.slice(0));
      const ctx = doc.context;
      const zip = new JSZip();
      let found = 0;
      for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream)) continue;
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of('Subtype'));
        if (!subtype || subtype.toString() !== '/Image') continue;
        const filter = dict.get(PDFName.of('Filter'));
        const filterName = filter ? filter.toString() : '';
        if (filterName.indexOf('DCTDecode') === -1) continue; // only JPEGs are extracted directly
        found++;
        zip.file(`image-${found}.jpg`, obj.contents);
        status.textContent = `Found ${found} image(s)...`;
      }
      if (found === 0) {
        status.textContent = 'No extractable JPEG images were found in this PDF.';
        generateBtn.disabled = false;
        return;
      }
      generatedBlob = await zip.generateAsync({ type: 'blob' });
      status.textContent = `Done — ${found} image(s) zipped.`;
      document.getElementById('extractimages-filename').value = srcName + '-images';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong extracting images.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('extractimages-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('extractimages-filename').value || 'images').trim();
    triggerDownload(generatedBlob, name.replace(/\.zip$/i, '') + '.zip');
  });
})();

/* ============================================================
   TOOL 14: Metadata viewer (read-only, no Pro gate, no output file)
   ============================================================ */
(function () {
  const emptyMsg = document.getElementById('metadata-emptyMsg');
  const list = document.getElementById('metadata-list');

  setupDropzone('metadata-dropzone', 'metadata-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = 'Reading metadata...';
    list.style.display = 'none';
    try {
      const buf = await fileToArrayBuffer(file);
      const doc = await PDFDocument.load(buf.slice(0), { updateMetadata: false });
      const created = doc.getCreationDate();
      const modified = doc.getModificationDate();
      const fields = [
        ['Title', doc.getTitle()],
        ['Author', doc.getAuthor()],
        ['Subject', doc.getSubject()],
        ['Keywords', doc.getKeywords()],
        ['Creator', doc.getCreator()],
        ['Producer', doc.getProducer()],
        ['Created', created ? created.toLocaleString() : ''],
        ['Modified', modified ? modified.toLocaleString() : ''],
        ['Page count', String(doc.getPageCount())],
        ['File size', fmtBytes(buf.byteLength)],
      ];
      list.innerHTML = '';
      fields.forEach(([label, value]) => {
        const li = document.createElement('li');
        li.innerHTML = `<div class="info"><div class="name">${label}</div><div class="tag">${value || '—'}</div></div>`;
        list.appendChild(li);
      });
      emptyMsg.style.display = 'none';
      list.style.display = 'flex';
    } catch (err) {
      console.error(err);
      emptyMsg.textContent = "Couldn't read this PDF's metadata.";
      list.style.display = 'none';
    }
  });
})();

/* ============================================================
   TOOL 15: Remove metadata
   ============================================================ */
(function () {
  let srcBytes = null;
  let srcName = 'document';
  const emptyMsg = document.getElementById('removemeta-emptyMsg');
  const generateBtn = document.getElementById('removemeta-generateBtn');
  const status = document.getElementById('removemeta-status');
  const downloadCard = document.getElementById('removemeta-downloadCard');
  let generatedBlob = null;

  setupDropzone('removemeta-dropzone', 'removemeta-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw)[0];
    if (!file) return;
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    emptyMsg.textContent = `Loaded ${file.name} (${fmtBytes(srcBytes.byteLength)})`;
    generateBtn.disabled = false;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  document.getElementById('removemeta-clearBtn').addEventListener('click', () => {
    srcBytes = null;
    emptyMsg.textContent = 'No PDF loaded yet.';
    generateBtn.disabled = true;
    status.textContent = '';
    downloadCard.classList.remove('show');
  });

  generateBtn.addEventListener('click', proGuardedHandler('removemeta', async () => {
    if (!srcBytes) return;
    generateBtn.disabled = true;
    status.textContent = 'Stripping metadata...';
    try {
      const doc = await PDFDocument.load(srcBytes.slice(0));
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setCreator('');
      doc.setProducer('');
      const bytes = await doc.save();
      generatedBlob = new Blob([bytes], { type: 'application/pdf' });
      status.textContent = 'Done — metadata removed.';
      document.getElementById('removemeta-filename').value = srcName + '-cleaned';
      downloadCard.classList.add('show');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong removing metadata.';
    } finally {
      generateBtn.disabled = false;
    }
  }));

  document.getElementById('removemeta-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('removemeta-filename').value || 'cleaned').trim();
    triggerDownload(generatedBlob, name.replace(/\.pdf$/i, '') + '.pdf');
  });
})();

/* ============================================================
   TOOL 17: OCR PDF (Pro)
   ------------------------------------------------------------
   Client-side OCR using Tesseract.js:
     1. Each selected page is rasterized with pdf.js at a scale
        chosen by the "quality" slider (higher scale = sharper
        input image = better recognition, slower).
     2. Tesseract recognizes text + per-word bounding boxes.
     3. "Searchable PDF" mode rebuilds a new PDF with pdf-lib:
        the original page image on top, and an invisible text
        layer (opacity 0, real selectable/searchable characters)
        positioned word-for-word underneath using the bounding
        boxes, converted from raster pixels back to PDF points.
     4. "Plain text" mode just concatenates recognized text per
        page into a .txt file — this always works regardless of
        script, since it's plain Unicode text with no font/glyph
        embedding involved.
   Note: the invisible text layer uses the standard Helvetica
   font, which only supports Latin-script characters. For non-
   Latin scripts (Tamil, Hindi, Chinese, Arabic, Russian, ...)
   the OCR itself still runs and those words are skipped in the
   invisible layer rather than corrupting the file — use "Plain
   text" output for guaranteed full-fidelity results with those
   languages.
   ============================================================ */
(function () {
  const dropzone = document.getElementById('ocr-dropzone');
  const emptyMsg = document.getElementById('ocr-emptyMsg');
  const optionsBox = document.getElementById('ocr-options');
  const generateBtn = document.getElementById('ocr-generateBtn');
  const clearBtn = document.getElementById('ocr-clearBtn');
  const status = document.getElementById('ocr-status');
  const progressTrack = document.getElementById('ocr-progressTrack');
  const progressFill = document.getElementById('ocr-progressFill');
  const progressDetail = document.getElementById('ocr-progressDetail');
  const previewField = document.getElementById('ocr-previewField');
  const previewBox = document.getElementById('ocr-previewBox');
  const downloadCard = document.getElementById('ocr-downloadCard');
  const qualitySlider = document.getElementById('ocr-quality');
  const qualityVal = document.getElementById('ocr-quality-val');
  const pagesInput = document.getElementById('ocr-pages');
  const fileExtLabel = document.getElementById('ocr-fileExt');

  const QUALITY_LABELS = { 1: 'Fast', 2: 'Balanced', 3: 'Best' };
  const QUALITY_SCALES = { 1: 1.6, 2: 2.2, 3: 3.0 };

  let srcBytes = null;
  let srcName = 'document';
  let numPages = 0;
  let generatedBlob = null;
  let generatedExt = 'pdf';

  // Scoped styles for the language chip grid — self-contained, doesn't
  // touch the shared stylesheet or any other tool's markup.
  (function injectOcrStyles() {
    if (document.getElementById('ocr-tool-styles')) return;
    const style = document.createElement('style');
    style.id = 'ocr-tool-styles';
    style.textContent = `
      #ocr-langGrid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ocr-lang-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 20px;
        border: 1px solid var(--border, #444);
        font-size: 13px;
        cursor: pointer;
        user-select: none;
        margin: 0 !important;
        font-weight: 400 !important;
      }
      .ocr-lang-chip:has(input:checked) {
        border-color: var(--accent, #6c8cff);
        background: rgba(108, 140, 255, 0.12);
      }
      .ocr-lang-chip input { margin: 0; }
    `;
    document.head.appendChild(style);
  })();

  qualitySlider.addEventListener('input', () => {
    qualityVal.textContent = QUALITY_LABELS[qualitySlider.value];
  });

  document.querySelectorAll('input[name="ocr-output"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const mode = document.querySelector('input[name="ocr-output"]:checked').value;
      fileExtLabel.textContent = mode === 'txt' ? '.txt' : '.pdf';
      const filenameField = document.getElementById('ocr-filename');
      if (filenameField.value === 'searchable' || filenameField.value === 'extracted-text') {
        filenameField.value = mode === 'txt' ? 'extracted-text' : 'searchable';
      }
    });
  });

  setupDropzone('ocr-dropzone', 'ocr-fileInput', async (fileListRaw) => {
    const file = Array.from(fileListRaw).find(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!file) { status.textContent = 'Please select a PDF file.'; return; }
    srcName = file.name.replace(/\.pdf$/i, '');
    srcBytes = await fileToArrayBuffer(file);
    const pdfjsDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
    numPages = pdfjsDoc.numPages;
    emptyMsg.textContent = `Loaded ${file.name} — ${numPages} page${numPages > 1 ? 's' : ''}.`;
    optionsBox.style.display = 'block';
    generateBtn.disabled = false;
    status.textContent = '';
    previewField.style.display = 'none';
    downloadCard.classList.remove('show');
  });

  clearBtn.addEventListener('click', () => {
    srcBytes = null;
    numPages = 0;
    emptyMsg.textContent = 'No PDF loaded yet.';
    optionsBox.style.display = 'none';
    generateBtn.disabled = true;
    status.textContent = '';
    progressTrack.style.display = 'none';
    progressDetail.style.display = 'none';
    previewField.style.display = 'none';
    downloadCard.classList.remove('show');
  });

  function parsePageIndices(str, total) {
    const trimmed = (str || '').trim();
    if (!trimmed) return Array.from({ length: total }, (_, i) => i);
    const indices = new Set();
    trimmed.split(',').map(s => s.trim()).filter(Boolean).forEach(part => {
      const m = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return;
      let start = Math.max(1, parseInt(m[1], 10));
      let end = m[2] ? Math.max(1, parseInt(m[2], 10)) : start;
      if (end < start) { const t = start; start = end; end = t; }
      for (let p = start; p <= Math.min(end, total); p++) indices.add(p - 1);
    });
    return Array.from(indices).sort((a, b) => a - b);
  }

  function setProgress(fraction, detailText) {
    progressTrack.style.display = 'block';
    progressDetail.style.display = 'flex';
    progressFill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    progressDetail.textContent = detailText || '';
  }

  generateBtn.addEventListener('click', proGuardedHandler('ocr', async () => {
    if (!srcBytes) return;
    const langs = Array.from(document.querySelectorAll('#ocr-langGrid input:checked')).map(c => c.value);
    const langString = (langs.length ? langs : ['eng']).join('+');
    const pageIndices = parsePageIndices(pagesInput.value, numPages);
    const outputMode = document.querySelector('input[name="ocr-output"]:checked').value;
    const renderScale = QUALITY_SCALES[qualitySlider.value] || 2.2;

    if (pageIndices.length === 0) { status.textContent = 'No valid pages selected.'; return; }

    generateBtn.disabled = true;
    clearBtn.disabled = true;
    previewField.style.display = 'none';
    downloadCard.classList.remove('show');
    generatedBlob = null;
    status.textContent = 'Loading OCR engine...';
    setProgress(0, `Preparing — 0 of ${pageIndices.length} pages`);

    let worker = null;
    try {
      worker = await Tesseract.createWorker(langString, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            const overall = (currentPageNum - 1 + m.progress) / pageIndices.length;
            setProgress(overall, `Page ${currentPageNum} of ${pageIndices.length} — recognizing text (${Math.round(m.progress * 100)}%)`);
          } else if (m.status) {
            status.textContent = m.status.charAt(0).toUpperCase() + m.status.slice(1) + '...';
          }
        }
      });
    } catch (err) {
      console.error(err);
      status.textContent = 'Could not load the OCR engine (check your internet connection) — please try again.';
      generateBtn.disabled = false;
      clearBtn.disabled = false;
      return;
    }

    let currentPageNum = 0;
    const pdfjsDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
    let outDoc = null, helveticaFont = null;
    if (outputMode === 'pdf') {
      outDoc = await PDFDocument.create();
      helveticaFont = await outDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    }
    let firstPageText = '';
    const textParts = [];

    try {
      for (let i = 0; i < pageIndices.length; i++) {
        currentPageNum = i + 1;
        const pageIndex = pageIndices[i];
        status.textContent = `Rendering page ${pageIndex + 1}...`;
        setProgress(i / pageIndices.length, `Page ${currentPageNum} of ${pageIndices.length} — rendering`);

        const page = await pdfjsDoc.getPage(pageIndex + 1);
        const pointViewport = page.getViewport({ scale: 1 }); // page size in PDF points
        const renderViewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement('canvas');
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: renderViewport }).promise;

        status.textContent = `Reading text on page ${pageIndex + 1}...`;
        const { data } = await worker.recognize(canvas);
        if (i === 0) firstPageText = data.text || '';
        textParts.push(data.text || '');

        if (outputMode === 'pdf') {
          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const jpegBytes = await (await fetch(jpegDataUrl)).arrayBuffer();
          const jpgImage = await outDoc.embedJpg(jpegBytes);
          const pdfPage = outDoc.addPage([pointViewport.width, pointViewport.height]);
          pdfPage.drawImage(jpgImage, { x: 0, y: 0, width: pointViewport.width, height: pointViewport.height });

          (data.words || []).forEach(word => {
            const text = (word.text || '').trim();
            if (!text || !word.bbox) return;
            const x0pt = word.bbox.x0 / renderScale;
            const y1pt = word.bbox.y1 / renderScale;
            const heightPt = Math.max(1, y1pt - (word.bbox.y0 / renderScale));
            const fontSize = Math.max(1, heightPt * 0.85);
            const yFromBottom = pointViewport.height - y1pt;
            try {
              pdfPage.drawText(text, {
                x: x0pt,
                y: yFromBottom,
                size: fontSize,
                font: helveticaFont,
                opacity: 0
              });
            } catch (e) {
              // Non-Latin glyph the standard font can't encode — the OCR
              // text still exists in the "Plain text" export; skipping
              // it here just means this one word isn't selectable in
              // the PDF's invisible layer.
            }
          });
        }
      }
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong running OCR.';
      await worker.terminate();
      generateBtn.disabled = false;
      clearBtn.disabled = false;
      progressTrack.style.display = 'none';
      progressDetail.style.display = 'none';
      return;
    }

    await worker.terminate();

    if (outputMode === 'pdf') {
      const pdfBytes = await outDoc.save();
      generatedBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      generatedExt = 'pdf';
    } else {
      generatedBlob = new Blob([textParts.join('\n\n----- Page break -----\n\n')], { type: 'text/plain' });
      generatedExt = 'txt';
    }

    previewBox.value = (firstPageText || '(No text recognized on this page.)').slice(0, 3000);
    previewField.style.display = 'block';
    setProgress(1, `Done — ${pageIndices.length} of ${pageIndices.length} pages`);
    status.textContent = `Done — recognized ${pageIndices.length} page${pageIndices.length > 1 ? 's' : ''}.`;
    downloadCard.classList.add('show');
    generateBtn.disabled = false;
    clearBtn.disabled = false;
  }));

  document.getElementById('ocr-downloadBtn').addEventListener('click', () => {
    if (!generatedBlob) return;
    const name = (document.getElementById('ocr-filename').value || 'ocr-output').trim();
    triggerDownload(generatedBlob, name.replace(/\.(pdf|txt)$/i, '') + '.' + generatedExt);
  });
})();

/* ============================================================
   INIT — build the home dashboard, apply saved settings, and
   wire up the generic settings hooks (auto-download, filenames).
   ============================================================ */
(async () => {

    await verifySavedLicense();

    setupSettingsHooks();

    applySettingsToUI();

    renderHome();

})();
