/**
 * PDF Toolkit — Activation Key Validator
 * ---------------------------------------
 * Paste this into Extensions > Apps Script on the Google Sheet that
 * holds your activation keys, then deploy it as a Web App (see setup
 * notes at the bottom of this file).
 *
 * Expected sheet layout — a tab (rename SHEET_NAME below to match)
 * with a header row and one key per row:
 *
 *   | Key            | Status | Activations | LastActivated | Note        |
 *   |----------------|--------|-------------|---------------|-------------|
 *   | PRO-AB12-CD34  | active |             |               | sold on Gumroad |
 *   | PRO-EF56-GH78  | active |             |               |             |
 *
 * - Status: "active" (default/blank also counts as active) or "revoked".
 *   Set a row to "revoked" any time you want to kill a key immediately.
 * - Activations / LastActivated are filled in automatically so you can
 *   see usage — keys are NOT single-use by default (a customer can
 *   activate the same key on more than one of their own devices).
 *   See the comment near the bottom if you want strict single-use keys.
 */

const SHEET_NAME = 'Keys'; // must match your tab name exactly

function doGet(e) {
  const rawKey = (e.parameter.key || '').trim().toUpperCase();
  if (!rawKey) {
    return jsonResponse({ valid: false, message: 'No key provided.' });
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    return jsonResponse({ valid: false, message: 'Server misconfigured: sheet not found.' });
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const keyCol = headers.indexOf('Key');
  const statusCol = headers.indexOf('Status');
  const activationsCol = headers.indexOf('Activations');
  const lastCol = headers.indexOf('LastActivated');

  if (keyCol === -1 || statusCol === -1) {
    return jsonResponse({ valid: false, message: 'Server misconfigured: missing Key/Status columns.' });
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sheetKey = String(row[keyCol] || '').trim().toUpperCase();
    if (sheetKey !== rawKey) continue;

    const status = String(row[statusCol] || 'active').trim().toLowerCase();
    if (status === 'revoked') {
      return jsonResponse({ valid: false, message: 'This key has been revoked.' });
    }

    // Record usage (best-effort; doesn't block validation if columns are missing).
    const rowIndex = i + 1; // Sheet rows are 1-indexed
    if (activationsCol !== -1) {
      const current = Number(row[activationsCol]) || 0;
      sheet.getRange(rowIndex, activationsCol + 1).setValue(current + 1);
    }
    if (lastCol !== -1) {
      sheet.getRange(rowIndex, lastCol + 1).setValue(new Date());
    }

    return jsonResponse({ valid: true, message: 'Key activated.' });
  }

  return jsonResponse({ valid: false, message: 'Key not found.' });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ---- Deployment steps ----
 * 1. Open your Google Sheet > Extensions > Apps Script.
 * 2. Delete any starter code and paste this whole file in.
 * 3. Click Deploy > New deployment.
 * 4. Type: "Web app".
 * 5. Execute as: "Me".
 * 6. Who has access: "Anyone" (required so the app can reach it without
 *    a Google login — it only exposes valid/invalid + a message, nothing
 *    else from your sheet).
 * 7. Click Deploy, authorize the permissions Google asks for.
 * 8. Copy the Web app URL (ends in /exec).
 * 9. Paste that URL into KEY_VALIDATION_URL near the top of app.js.
 *
 * Whenever you edit this script after the first deploy, use
 * Deploy > Manage deployments > (pencil icon) > New version, otherwise
 * the live /exec URL keeps running the old code.
 *
 * ---- Want strict single-use keys instead? ----
 * Replace the "Record usage" block above with something like:
 *
 *   if (status === 'used') {
 *     return jsonResponse({ valid: false, message: 'This key has already been used.' });
 *   }
 *   sheet.getRange(rowIndex, statusCol + 1).setValue('used');
 *
 * ...and set new keys' Status to "active" (not "used") when you add them.
 */
