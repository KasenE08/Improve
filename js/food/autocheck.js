// Ticks "Hit calories" / "Hit protein" on the Today tab from the food log.
// Habits opt in with habit.auto = 'food:calories' or 'food:protein'.
// The food day (4:01 AM → 4:00 AM) maps to the same date in the habit log.
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as F from './store.js';
import * as L from './logic.js';

export const AUTO = { 'food:calories': 'Food: calories', 'food:protein': 'Food: protein', 'food:water': 'Food: water' };
export const isFoodAuto = (h) => !!h && typeof h.auto === 'string' && h.auto.startsWith('food:');

export function hitsFor(date) {
  const g = F.getGoals();
  const t = L.totals(F.entriesFor(date));
  return {
    'food:calories': L.hitCalories(t.cal, g.calGoal, g.calRange),
    'food:protein': L.hitProtein(t.protein, g.proteinMin),
    'food:water': L.hitWater(F.waterFor(date), g.waterGoal),
  };
}

// Re-check one date. Returns bonuses newly earned (for celebrations).
export function recheck(date) {
  const hits = hitsFor(date);
  let changed = false;
  for (const h of H.getHabits()) {
    if (h.auto in hits) changed = H.setDone(h, date, hits[h.auto]) || changed;
  }
  return changed ? R.sync(L.fromISODate(date)) : [];
}
