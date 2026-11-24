// Ticks the Money habits on the Today tab (both daily habits that only show on some days):
//   money:checkin  Sundays: the weekly check-in is done (any day that week)
//   money:save     paydays: that week's payday is marked done on the Payday page (saved what it calls for)
import { appNow, periodRange } from '../dates.js';
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as M from './store.js';
import { saveStatus, checkedInWeek, paydaysBetween } from './logic.js';

// Re-checks the week / month containing `date` (today, or the date of a back-dated entry).
// Returns bonuses newly earned (for celebrations).
export function recheckMoney(date = appNow(), now = new Date()) {
  const state = M.getState();
  const [ws, we] = periodRange('weekly', date);
  let changed = false;
  for (const h of H.getHabits()) {
    if (h.auto === 'money:checkin') {
      changed = H.setDone(h, we, checkedInWeek(state, date), now) || changed; // the week's Sunday
    }
    if (h.auto === 'money:save' && state.settings.setup) {
      const save = saveStatus(state, date);
      for (const k of paydaysBetween(state.settings.pay, ws, we)) changed = H.setDone(h, k, !!save.hit, now) || changed;
    }
  }
  return changed ? R.sync(date) : [];
}
