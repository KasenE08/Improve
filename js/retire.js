// Nov 27, 2026: the Habits section is retired. Improve is Food, Money and Journal now.
// Once: every habit is put away (archived, marked retired) so nothing ticks, pops up or counts any more.
// Their history (log, bonuses, streaks) stays in storage and in backups. Fast food meals move to the Food tab.
import * as store from './store.js';

export function retireHabits() {
  if (store.get('habits_retired')) return false;
  const habits = store.get('habits', []);
  const log = store.get('log', {});
  const ff = habits.filter((h) => h.kind === 'fastfood' || h.kind === 'limit').map((h) => h.id);
  if (ff.length) {
    const food = store.get('food', null) || { version: 1 };
    food.fastFood ||= {};
    for (const [day, row] of Object.entries(log)) {
      const n = ff.reduce((t, id) => t + (row[id]?.n || 0), 0);
      if (n && !food.fastFood[day]) food.fastFood[day] = n;
    }
    store.set('food', food);
  }
  store.set('habits', habits.map((h) => (h.archived ? h : { ...h, archived: true, retired: true })));
  store.set('habits_retired', new Date().toISOString());
  return true;
}
