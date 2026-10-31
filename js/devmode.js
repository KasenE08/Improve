// Dev preview (kasene08.github.io/Improve/dev/): the redesign is tested there before it goes live.
// It keeps its own copy of the data under "imp_dev_" so testing can never change the real app's data.
// (Still inside the "imp_" rule: every key this app touches starts with "imp_".)
const path = typeof location !== 'undefined' ? location.pathname : '';
export const DEV = /\/dev\//.test(path);
export const PREFIX = DEV ? 'imp_dev_' : 'imp_';

/** Is this storage key one of this copy's keys? (The real app skips the preview's keys.) */
export const isAppKey = (k) => !!k && k.startsWith(PREFIX) && (DEV || !k.startsWith('imp_dev_'));
/** Storage key → the name used in backups ("imp_log"), so backups work in both. */
export const toReal = (k) => 'imp_' + k.slice(PREFIX.length);
/** "imp_log" or "log" → this copy's storage key. */
export const toStore = (k) => PREFIX + k.replace(/^imp_/, '');

/** First open of the preview: copy the real app's data in. The real keys are only read, never written. */
export function seedDev(force = false) {
  if (!DEV) return false;
  try {
    if (!force && localStorage.getItem('imp_dev_seeded')) return false;
    const real = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('imp_') && !k.startsWith('imp_dev_')) real.push(k);
    }
    if (force) {
      const mine = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('imp_dev_')) mine.push(k); }
      for (const k of mine) localStorage.removeItem(k);
    }
    for (const k of real) {
      let v = localStorage.getItem(k);
      if (k === 'imp_planner') { // notifications stay with the real app
        try { v = JSON.stringify({ ...JSON.parse(v), push: null }); } catch (_) { continue; }
      }
      localStorage.setItem(toStore(k), v);
    }
    localStorage.setItem('imp_dev_seeded', JSON.stringify(new Date().toISOString()));
    return true;
  } catch (_) {
    return false;
  }
}
