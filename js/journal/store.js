// Journal: one long note, split by day. Saved under Improve's own key: imp_journal.
import * as store from '../store.js';

const KEY = 'journal';
export const DEFAULT_MIN_WORDS = 25;

export function getJournal() {
  const j = store.get(KEY, null) || {};
  return { settings: { minWords: DEFAULT_MIN_WORDS, ...(j.settings || {}) }, days: j.days || {} };
}

export const getDay = (key) => getJournal().days[key] || '';

export function setDay(key, text) {
  const j = getJournal();
  if (text.trim()) j.days[key] = text; else delete j.days[key];
  store.set(KEY, j);
}

export function setMinWords(n) {
  const j = getJournal();
  j.settings.minWords = n;
  store.set(KEY, j);
}

export const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);
