// Ticks "Journal" on the Today tab when today's entry has enough words (only today counts).
import * as H from '../habits.js';
import * as R from '../rewards.js';
import { dayKey } from '../dates.js';
import { getJournal, wordCount } from './store.js';

export function journalHit(date = new Date()) {
  const j = getJournal();
  return wordCount(j.days[dayKey(date)] || '') >= j.settings.minWords;
}

// Returns bonuses newly earned (for celebrations).
export function recheckJournal(date = new Date()) {
  const hit = journalHit(date);
  let changed = false;
  for (const h of H.getHabits()) if (h.auto === 'journal:words') changed = H.setDone(h, dayKey(date), hit) || changed;
  return changed ? R.sync(date) : [];
}
