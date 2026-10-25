// Ticks the Money habits on the Today tab:
//   money:save   (weekly)  saved what this week's paycheck calls for; a week with no payday counts as done
//   money:review (monthly) this month's budget review is finished
import { appNow } from '../dates.js';
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as M from './store.js';
import { saveStatus, reviewDone } from './logic.js';

// Re-checks the week / month containing `date` (today, or the date of a back-dated entry).
// Returns bonuses newly earned (for celebrations).
export function recheckMoney(date = appNow(), now = new Date()) {
  const state = M.getState();
  const save = saveStatus(state, date);
  let changed = false;
  for (const h of H.getHabits()) {
    if (h.auto === 'money:save' && save.judge) changed = H.setPeriodDone(h, date, save.hit, now) || changed;
    if (h.auto === 'money:review') changed = H.setPeriodDone(h, date, reviewDone(state, date), now) || changed;
  }
  return changed ? R.sync(date) : [];
}
