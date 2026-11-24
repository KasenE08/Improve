// Ticks "Journal" on the Today tab when today's entry has enough words (only today counts).
import * as H from '../habits.js';
import * as R from '../rewards.js';
import { dayKey, appNow } from '../dates.js';
import { getJournal, wordCount } from './store.js';

// 0 = not yet, 1 = Minimum (shortWords), 2 = Full (minWords)
export function journalLevel(date = appNow()) {
  const j = getJournal();
  const w = wordCount(j.days[dayKey(date)] || '');
  return w >= j.settings.minWords ? 2 : w >= (j.settings.shortWords || 0) && w > 0 ? 1 : 0;
}
export const journalHit = (date = appNow()) => journalLevel(date) === 2;

// Returns bonuses newly earned (for celebrations).
export function recheckJournal(date = appNow()) {
  const hit = journalLevel(date);
  let changed = false;
  for (const h of H.getHabits()) if (h.auto === 'journal:words') changed = H.setDone(h, dayKey(date), hit) || changed;
  return changed ? R.sync(date) : [];
}
