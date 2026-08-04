/**
 * settingsData.js
 * ---------------
 * Backup/export/import logic, kept separate from settings.js (the view)
 * so the command palette can trigger "Export Data" / "Backup" without
 * needing the Settings page to be mounted.
 * @module modules/settings/settingsData
 */

import { exportAllData, importAllData } from '../../db.js';
import { downloadJSON, pickFile, readFileAsText } from '../../utils/export.js';
import { toastSuccess, toastError } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';

/** Exports every store to a single timestamped JSON file the user can keep as a backup. */
export async function exportAllDataToFile() {
  try {
    const dump = await exportAllData();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJSON({ app: 'hub', version: 1, exportedAt: new Date().toISOString(), data: dump }, `hub-backup-${stamp}.json`);
    toastSuccess('Backup exported', 'Your data was saved as a JSON file.');
  } catch (err) {
    console.error(err);
    toastError('Export failed', 'Could not export your data. See console for details.');
  }
}

/** Prompts for a backup JSON file and restores it, replacing current data after confirmation. */
export async function importDataFromFile() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await readFileAsText(file));
  } catch {
    toastError('Import failed', 'That file is not valid JSON.');
    return;
  }
  const dump = parsed && parsed.data ? parsed.data : parsed;
  if (!dump || typeof dump !== 'object') {
    toastError('Import failed', 'This file doesn\u2019t look like a Hub backup.');
    return;
  }
  const confirmed = await confirmDialog({
    title: 'Restore this backup?',
    message: 'This replaces your current Notes, Clipboard items, QR codes, AI chats and other saved data with the contents of this file. This can\u2019t be undone.',
    confirmLabel: 'Restore',
    danger: true
  });
  if (!confirmed) return;
  try {
    await importAllData(dump);
    toastSuccess('Backup restored', 'Reloading to apply your restored data…');
    setTimeout(() => window.location.reload(), 900);
  } catch (err) {
    console.error(err);
    toastError('Import failed', 'Something went wrong while restoring. See console for details.');
  }
}

/** Wipes every store after confirmation — the nuclear option in Settings. */
export async function clearAllDataWithConfirm() {
  const confirmed = await confirmDialog({
    title: 'Erase all data?',
    message: 'This permanently deletes every note, clipboard item, QR code, AI chat and other saved item on this device. Consider exporting a backup first.',
    confirmLabel: 'Erase everything',
    danger: true
  });
  if (!confirmed) return;
  const { clear } = await import('../../db.js');
  const stores = ['notes', 'clipboardItems', 'qrCodes', 'aiChats', 'aiMessages', 'habits', 'bookmarks', 'journalEntries', 'focusSessions'];
  for (const s of stores) await clear(s);
  toastSuccess('All data erased', 'Reloading…');
  setTimeout(() => window.location.reload(), 700);
}
