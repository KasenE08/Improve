// One-time copy from the old Calorie Tracker app. Read-only: the old app's data is
// never changed or deleted.
import { validateBackup } from './logic.js';

const OLD_KEY = 'calorie-tracker.v1'; // the old app's localStorage key (same website)

// Works only when both apps share storage (e.g. both used in Safari). Home-screen
// apps on iPhone each have their own storage, so this usually finds nothing there.
export function readOldAppStorage() {
  let raw = null;
  try { raw = localStorage.getItem(OLD_KEY); } catch (_) { /* blocked */ }
  if (!raw) return { ok: false, error: 'No Calorie Tracker data found in this app’s storage. Use a backup file instead.' };
  try {
    return validateBackup({ app: 'calorie-tracker', ...JSON.parse(raw) });
  } catch (_) {
    return { ok: false, error: 'The old app’s data couldn’t be read.' };
  }
}

export async function readBackupFile(file) {
  try {
    return validateBackup(JSON.parse(await file.text()));
  } catch (_) {
    return { ok: false, error: 'That file couldn’t be read as a Calorie Tracker backup.' };
  }
}
