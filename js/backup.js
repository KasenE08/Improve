// Backup export / import. Only keys starting with "imp_" are ever read or written.
import * as store from './store.js';
import { dayKey } from './dates.js';

const SKIP = ['imp_design_']; // preview-only settings from the design samples

function appKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('imp_') && !SKIP.some((p) => k.startsWith(p))) keys.push(k);
  }
  return keys;
}

export function buildBackup() {
  const data = {};
  for (const k of appKeys()) {
    if (k === 'imp_last_backup' || k.startsWith('imp_planner-unreadable')) continue;
    data[k] = store.get(k);
  }
  // Notification keys belong to this phone only (same rule as the old planner app)
  if (data.imp_planner) data.imp_planner = { ...data.imp_planner, push: null };
  return { app: 'improve', format: 1, exportedAt: new Date().toISOString(), data };
}

// Opens the iPhone share sheet (Save to Files / iCloud / AirDrop), or downloads on other browsers.
// Resolves to true when the file was handed off, false if the person cancelled.
export async function exportBackup() {
  const json = JSON.stringify(buildBackup(), null, 1);
  const name = `improve-backup-${dayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Improve backup' });
    } catch (e) {
      if (e.name === 'AbortError') return false;
      throw e;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  store.set('last_backup', new Date().toISOString());
  return true;
}

// Checks a backup file. Returns { ok, backup, error }.
export function parseBackup(text) {
  let b;
  try { b = JSON.parse(text); } catch (_) { return { ok: false, error: 'Not a valid backup file.' }; }
  if (!b || b.app !== 'improve' || typeof b.data !== 'object' || !b.data) return { ok: false, error: 'This file is not an Improve backup.' };
  const keys = Object.keys(b.data);
  if (!keys.length || keys.some((k) => !k.startsWith('imp_'))) return { ok: false, error: 'Backup contains unexpected data.' };
  if (!('imp_habits' in b.data) || !('imp_log' in b.data)) return { ok: false, error: 'Backup is missing habits or history.' };
  return { ok: true, backup: b };
}

// Replaces all Improve data with the backup. Other apps' data is untouched.
export function restoreBackup(backup) {
  const push = store.get('planner', null)?.push ?? null; // keep this phone's notification setup
  for (const k of appKeys()) if (k !== 'imp_last_backup') localStorage.removeItem(k);
  for (const [k, v] of Object.entries(backup.data)) store.set(k, v);
  const planner = store.get('planner', null);
  if (planner) store.set('planner', { ...planner, push });
}

export const lastBackup = () => store.get('last_backup', null);
