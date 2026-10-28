// "Finished today's work": ticks when every assignment that's today's work is Done.
// Reads the Planner tab's saved data (imp_planner) directly, so it works without opening the tab.
//
// Today's work (the app day, 4:01 AM → 4:00 AM) is:
//   - everything the planner currently has on today,
//   - anything whose planned time already came today (locked in, so "Falling behind" pushing it
//     to tomorrow doesn't count as finishing it), and
//   - anything finished today.
// A task the planner moves off today before its time comes simply drops off. Deleted tasks drop off.
// Nothing at all = a day off (no tick, no XP; streak and Perfect Day unaffected), once the planner
// has tasks or fixed times. Locked-in tasks are kept in imp_planner_day { date, locked }.
import * as store from './store.js';
import * as H from './habits.js';
import * as R from './rewards.js';
import { dayKey, appNow } from './dates.js';

// date: a moment in the app day being judged; now: the real current time
export function plannerHit(data, date = appNow(), now = new Date()) {
  const today = dayKey(date);
  const nowMs = now.getTime();
  const tasks = new Map((data.tasks || []).map((t) => [t.id, t]));
  let day = store.get('planner_day', null);
  if (!day || day.date !== today || !Array.isArray(day.locked)) day = { date: today, locked: [] }; // older saves: start fresh
  const lock = (id) => { if (!day.locked.includes(id)) day.locked.push(id); };
  const planned = [];
  for (const i of data.plan?.items || []) {
    if (dayKey(appNow(new Date(i.start))) !== today) continue; // 12–2am work counts for the night before
    planned.push(i.taskId);
    if (i.start <= nowMs) lock(i.taskId); // its time came: stays today's work
  }
  // Tasks finished today count as today's work too (e.g. done early, before they were planned)
  for (const t of data.tasks || []) {
    if (t.status === 'done' && t.completedAt && dayKey(appNow(new Date(t.completedAt))) === today) lock(t.id);
  }
  day.locked = day.locked.filter((id) => tasks.has(id));
  store.set('planner_day', day);
  const ids = [...new Set([...day.locked, ...planned.filter((id) => tasks.has(id))])];
  if (!ids.length) return 'off';
  return ids.every((id) => tasks.get(id).status === 'done');
}

// Returns bonuses newly earned (for celebrations).
export function recheckPlanner(date = new Date()) {
  const data = store.get('planner', null);
  // Not set up yet (no tasks and no fixed times): nothing to judge, no free XP
  if (!data || (!data.tasks?.length && !data.blocks?.length)) return [];
  const hit = plannerHit(data, appNow(date), date);
  let changed = false;
  const day = dayKey(appNow(date));
  for (const h of H.getHabits()) {
    if (h.auto !== 'planner:work') continue;
    changed = H.setExcused(h, day, hit === 'off') || changed;
    changed = H.setDone(h, day, hit === true, date) || changed;
  }
  return changed ? R.sync(appNow(date)) : [];
}
