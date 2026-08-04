/**
 * qr.js
 * -----
 * Phase 3: the QR Toolkit view. Three tabs sharing one panel:
 *  - Generate: build a QR from text/URL/WiFi/contact/email/phone, preview
 *    it live on a canvas, download it as a PNG, or save it to History.
 *  - Scan: decode a QR from an uploaded image, or live via the camera.
 *  - History: everything saved from Generate, stored in the `qrCodes`
 *    IndexedDB store already reserved for this module in db.js.
 *
 * The actual QR encode/decode algorithms are loaded on demand from esm.sh
 * (qrcode for encoding, jsqr for decoding) rather than vendored, so the
 * Hub's own bundle stays dependency-free until someone actually opens
 * this tool — same lazy-load spirit as the PDF Toolkit's CDN scripts.
 * @module modules/qr/qr
 */

import { put, getAll, remove } from '../../db.js';
import { toastSuccess, toastError, toastInfo } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';
import { downloadFile } from '../../utils/export.js';
import { uuid, escapeHtml, formatRelativeTime } from '../../utils/helpers.js';

let QRCodeLib = null;
let jsQR = null;
async function loadEncoder() {
  if (!QRCodeLib) QRCodeLib = (await import('https://esm.sh/qrcode@1.5.3')).default;
  return QRCodeLib;
}
async function loadDecoder() {
  if (!jsQR) jsQR = (await import('https://esm.sh/jsqr@1.4.0')).default;
  return jsQR;
}

const TYPES = [
  { key: 'text', label: 'Text / URL' },
  { key: 'wifi', label: 'WiFi' },
  { key: 'contact', label: 'Contact' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' }
];

const state = {
  tab: 'generate',
  type: 'text',
  ecLevel: 'M',
  size: 280,
  lastPayload: '',
  lastLabel: '',
  cameraStream: null
};

function fieldsHtml() {
  switch (state.type) {
    case 'wifi':
      return `
        <div class="field"><label>Network name (SSID)</label><input class="input" id="qrWifiSsid" placeholder="Home WiFi"></div>
        <div class="field"><label>Password</label><input class="input" id="qrWifiPass" placeholder="Leave blank if open"></div>
        <div class="field"><label>Encryption</label>
          <select class="select" id="qrWifiEnc">
            <option value="WPA">WPA/WPA2</option>
            <option value="WEP">WEP</option>
            <option value="nopass">None (open)</option>
          </select>
        </div>`;
    case 'contact':
      return `
        <div class="field"><label>Full name</label><input class="input" id="qrContactName" placeholder="Jane Doe"></div>
        <div class="field"><label>Phone</label><input class="input" id="qrContactPhone" placeholder="+1 555 0100"></div>
        <div class="field"><label>Email</label><input class="input" id="qrContactEmail" placeholder="jane@example.com"></div>
        <div class="field"><label>Organization</label><input class="input" id="qrContactOrg" placeholder="Optional"></div>`;
    case 'email':
      return `
        <div class="field"><label>To</label><input class="input" id="qrEmailTo" placeholder="someone@example.com"></div>
        <div class="field"><label>Subject</label><input class="input" id="qrEmailSubject" placeholder="Optional"></div>
        <div class="field"><label>Body</label><textarea class="textarea" id="qrEmailBody" placeholder="Optional"></textarea></div>`;
    case 'phone':
      return `<div class="field"><label>Phone number</label><input class="input" id="qrPhoneNumber" placeholder="+1 555 0100"></div>`;
    default:
      return `<div class="field"><label>Text or URL</label><textarea class="textarea" id="qrText" placeholder="https://example.com or any text">${escapeHtml(state.lastPayload && state.type === 'text' ? '' : '')}</textarea></div>`;
  }
}

function buildPayload(container) {
  const v = (id) => container.querySelector(id)?.value.trim() || '';
  switch (state.type) {
    case 'wifi': {
      const ssid = v('#qrWifiSsid'), pass = v('#qrWifiPass'), enc = container.querySelector('#qrWifiEnc')?.value || 'WPA';
      if (!ssid) return null;
      const esc = (s) => s.replace(/([\\;,:"])/g, '\\$1');
      return `WIFI:T:${enc};S:${esc(ssid)};P:${esc(pass)};;`;
    }
    case 'contact': {
      const name = v('#qrContactName'), phone = v('#qrContactPhone'), email = v('#qrContactEmail'), org = v('#qrContactOrg');
      if (!name && !phone && !email) return null;
      return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\n${org ? `ORG:${org}\n` : ''}${phone ? `TEL:${phone}\n` : ''}${email ? `EMAIL:${email}\n` : ''}END:VCARD`;
    }
    case 'email': {
      const to = v('#qrEmailTo'), subject = v('#qrEmailSubject'), body = v('#qrEmailBody');
      if (!to) return null;
      return `mailto:${to}${subject || body ? `?${[subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join('&')}` : ''}`;
    }
    case 'phone': {
      const num = v('#qrPhoneNumber');
      return num ? `tel:${num}` : null;
    }
    default: {
      const text = v('#qrText');
      return text || null;
    }
  }
}

async function renderPreview(container, payload) {
  const canvasWrap = container.querySelector('#qrPreviewWrap');
  if (!payload) {
    canvasWrap.innerHTML = `<div class="empty-state" style="padding:var(--sp-8) 0;"><div class="es-icon">📷</div><p>Fill in the fields and hit Generate to see a preview.</p></div>`;
    return;
  }
  try {
    const QRCode = await loadEncoder();
    canvasWrap.innerHTML = `<canvas id="qrCanvas"></canvas>`;
    const canvas = canvasWrap.querySelector('#qrCanvas');
    await QRCode.toCanvas(canvas, payload, {
      width: state.size,
      margin: 2,
      errorCorrectionLevel: state.ecLevel,
      color: { dark: '#000000ff', light: '#ffffffff' }
    });
    state.lastPayload = payload;
    container.querySelector('#qrDownloadBtn').disabled = false;
    container.querySelector('#qrSaveBtn').disabled = false;
  } catch (err) {
    console.error('QR generate error:', err);
    canvasWrap.innerHTML = `<div class="empty-state" style="padding:var(--sp-8) 0;"><div class="es-icon">⚠</div><p>Couldn't generate that QR code. Try shorter content.</p></div>`;
    toastError('Generation failed', err.message || 'Unknown error');
  }
}

function paintGenerate(container) {
  container.innerHTML = `
    <div class="qr-grid">
      <div class="glass-panel qr-form">
        <div class="field"><label>Type</label>
          <select class="select" id="qrType">
            ${TYPES.map((t) => `<option value="${t.key}" ${t.key === state.type ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div id="qrFields">${fieldsHtml()}</div>
        <div class="field-row" style="margin-top:var(--sp-2);">
          <div class="field" style="flex:1;">
            <label>Error correction</label>
            <select class="select" id="qrEc">
              ${['L', 'M', 'Q', 'H'].map((l) => `<option value="${l}" ${l === state.ecLevel ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="flex:1;">
            <label>Size</label>
            <select class="select" id="qrSize">
              ${[200, 280, 360, 480].map((s) => `<option value="${s}" ${s === state.size ? 'selected' : ''}>${s}×${s}px</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn btn-primary" id="qrGenerateBtn" style="width:100%;margin-top:var(--sp-2);">Generate</button>
      </div>

      <div class="glass-panel qr-preview">
        <div id="qrPreviewWrap" class="qr-preview-wrap">
          <div class="empty-state" style="padding:var(--sp-8) 0;"><div class="es-icon">📷</div><p>Fill in the fields and hit Generate to see a preview.</p></div>
        </div>
        <div class="field-row" style="margin-top:var(--sp-4);">
          <button class="btn btn-secondary" id="qrDownloadBtn" disabled>Download PNG</button>
          <button class="btn btn-secondary" id="qrSaveBtn" disabled>Save to History</button>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#qrType').addEventListener('change', (e) => {
    state.type = e.target.value;
    container.querySelector('#qrFields').innerHTML = fieldsHtml();
  });
  container.querySelector('#qrEc').addEventListener('change', (e) => { state.ecLevel = e.target.value; });
  container.querySelector('#qrSize').addEventListener('change', (e) => { state.size = Number(e.target.value); });

  container.querySelector('#qrGenerateBtn').addEventListener('click', () => {
    const payload = buildPayload(container);
    if (!payload) {
      toastError('Nothing to encode', 'Fill in at least one field first.');
      return;
    }
    renderPreview(container, payload);
  });

  container.querySelector('#qrDownloadBtn').addEventListener('click', () => {
    const canvas = container.querySelector('#qrCanvas');
    if (!canvas) return;
    canvas.toBlob((blob) => downloadFile(blob, `qr-${Date.now()}.png`, 'image/png'));
  });

  container.querySelector('#qrSaveBtn').addEventListener('click', async () => {
    const canvas = container.querySelector('#qrCanvas');
    if (!canvas || !state.lastPayload) return;
    const record = {
      id: uuid(),
      type: state.type,
      payload: state.lastPayload,
      dataUrl: canvas.toDataURL('image/png'),
      createdAt: new Date().toISOString()
    };
    await put('qrCodes', record);
    toastSuccess('Saved', 'Added to History.');
  });
}

function paintScan(container) {
  container.innerHTML = `
    <div class="qr-grid">
      <div class="glass-panel qr-form">
        <div class="field">
          <label>Upload an image</label>
          <input type="file" class="input" id="qrScanFile" accept="image/*">
        </div>
        <p class="hint" style="color:var(--muted);margin:var(--sp-2) 0;">or</p>
        <button class="btn btn-secondary" id="qrCameraBtn" style="width:100%;">📸 Scan with camera</button>
        <video id="qrVideo" playsinline style="width:100%;border-radius:var(--r-md);margin-top:var(--sp-3);display:none;"></video>
      </div>
      <div class="glass-panel qr-preview">
        <div id="qrScanResult" class="qr-preview-wrap">
          <div class="empty-state" style="padding:var(--sp-8) 0;"><div class="es-icon">🔍</div><p>Upload an image or scan with your camera to decode a QR code.</p></div>
        </div>
      </div>
    </div>
  `;

  const showResult = (text) => {
    const wrap = container.querySelector('#qrScanResult');
    const isUrl = /^https?:\/\//i.test(text);
    wrap.innerHTML = `
      <div class="field"><label>Decoded content</label><textarea class="textarea" readonly style="min-height:120px;">${escapeHtml(text)}</textarea></div>
      <div class="field-row">
        <button class="btn btn-secondary btn-sm" id="qrCopyBtn">Copy</button>
        ${isUrl ? `<button class="btn btn-secondary btn-sm" id="qrOpenBtn">Open link</button>` : ''}
      </div>`;
    wrap.querySelector('#qrCopyBtn').addEventListener('click', async () => {
      await navigator.clipboard.writeText(text);
      toastSuccess('Copied to clipboard');
    });
    wrap.querySelector('#qrOpenBtn')?.addEventListener('click', () => window.open(text, '_blank', 'noopener'));
  };

  const decodeImageData = async (imageData) => {
    const decoder = await loadDecoder();
    return decoder(imageData.data, imageData.width, imageData.height);
  };

  container.querySelector('#qrScanFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = await decodeImageData(imageData);
      if (result) showResult(result.data);
      else toastError('No QR code found', 'Try a clearer or closer image.');
    };
    img.src = URL.createObjectURL(file);
  });

  const video = container.querySelector('#qrVideo');
  let scanning = false;
  container.querySelector('#qrCameraBtn').addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      state.cameraStream = stream;
      video.srcObject = stream;
      video.style.display = 'block';
      await video.play();
      scanning = true;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const decoder = await loadDecoder();
      const tick = () => {
        if (!scanning) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = decoder(imageData.data, imageData.width, imageData.height);
          if (result) {
            scanning = false;
            stream.getTracks().forEach((t) => t.stop());
            video.style.display = 'none';
            showResult(result.data);
            return;
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (err) {
      toastError('Camera unavailable', err.message || 'Could not access the camera.');
    }
  });
}

async function paintHistory(container) {
  const items = (await getAll('qrCodes')).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="es-icon">🗂</div><h3>No saved codes yet</h3><p>Codes you save from the Generate tab will show up here.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="qr-history-grid">
      ${items.map((it) => `
        <div class="glass-panel qr-history-item" data-id="${it.id}">
          <img src="${it.dataUrl}" alt="">
          <div class="qhi-body">
            <div class="qhi-payload">${escapeHtml(it.payload.slice(0, 60))}${it.payload.length > 60 ? '…' : ''}</div>
            <div class="qhi-meta">${escapeHtml(it.type)} · ${formatRelativeTime(it.createdAt)}</div>
          </div>
          <div class="field-row">
            <button class="btn btn-ghost btn-sm" data-download="${it.id}">Download</button>
            <button class="btn btn-ghost btn-sm" data-delete="${it.id}">Delete</button>
          </div>
        </div>`).join('')}
    </div>`;

  container.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = items.find((i) => i.id === btn.dataset.download);
      fetch(item.dataUrl).then((r) => r.blob()).then((blob) => downloadFile(blob, `qr-${item.id}.png`, 'image/png'));
    });
  });
  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Delete this QR code?', message: 'This can\u2019t be undone.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      await remove('qrCodes', btn.dataset.delete);
      toastInfo('Deleted');
      paintHistory(container);
    });
  });
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((t) => t.stop());
    state.cameraStream = null;
  }
}

const TABS = [
  { key: 'generate', label: 'Generate', icon: '✨' },
  { key: 'scan', label: 'Scan', icon: '🔍' },
  { key: 'history', label: 'History', icon: '🗂' }
];

export function renderQr(container) {
  container.innerHTML = `
    <div class="qr-view">
      <div class="notes-view-tabs" id="qrTabs">
        ${TABS.map((t) => `<button class="nvt ${t.key === state.tab ? 'active' : ''}" data-tab="${t.key}">${t.icon} ${t.label}</button>`).join('')}
      </div>
      <div id="qrTabPanel" style="margin-top:var(--sp-4);"></div>
    </div>
  `;

  const panel = container.querySelector('#qrTabPanel');

  function paintTab() {
    stopCamera();
    if (state.tab === 'generate') paintGenerate(panel);
    else if (state.tab === 'scan') paintScan(panel);
    else paintHistory(panel);
  }

  container.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      container.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
      paintTab();
    });
  });

  paintTab();

  return () => stopCamera();
}
