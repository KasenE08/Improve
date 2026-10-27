// "Finished today's work": ticks when every assignment the planner put on today is Done.
// Reads the Planner tab's saved data (imp_planner) directly, so it works without opening the tab.
//
// Today's list only grows during the day (imp_planner_day), so moving a task off today
// (e.g. "Falling behind") doesn't count as finishing it. Deleted tasks drop off the list.
// A day with nothing planned is a day off (no tick, no XP; streak and Perfect Day unaffected),
// once the planner has tasks or fixed times.
import * as store from './store.js';
import * as H from './habits.js';
import * as R from './rewards.js';
import { dayKey, appNow } from './dates.js';

export function plannerHit(data, date = appNow()) {
  const today = dayKey(date);
  const tasks = new Map((data.tasks || []).map((t) => [t.id, t]));
  let day = store.get('planner_day', null);
  if (!day || day.date !== today) day = { date: today, ids: [] };
  for (const i of data.plan?.items || []) {
    // 4:01 AM day like the rest of the app: work planned 12–2am counts for the night before
    if (dayKey(appNow(new Date(i.start))) === today && !day.ids.includes(i.taskId)) day.ids.push(i.taskId);
  }
  // Tasks finished today count as today's work too (e.g. done early, before they were planned)
  for (const t of data.tasks || []) {
    if (t.status === 'done' && t.completedAt && dayKey(appNow(new Date(t.completedAt))) === today && !day.ids.includes(t.id)) day.ids.push(t.id);
  }
  day.ids = day.ids.filter((id) => tasks.has(id));
  store.set('planner_day', day);
  if (!day.ids.length) return 'off';
  return day.ids.every((id) => tasks.get(id).status === 'done');
}

// Returns bonuses newly earned (for celebrations).
export function recheckPlanner(date = new Date()) {
  const data = store.get('planner', null);
  // Not set up yet (no tasks and no fixed times): nothing to judge, no free XP
  if (!data || (!data.tasks?.length && !data.blocks?.length)) return [];
  const hit = plannerHit(data, appNow(date));
  let changed = false;
  const day = dayKey(appNow(date));
  for (const h of H.getHabits()) {
    if (h.auto !== 'planner:work') continue;
    changed = H.setExcused(h, day, hit === 'off') || changed;
    changed = H.setDone(h, day, hit === true, date) || changed;
  }
  return changed ? R.sync(appNow(date)) : [];
}
