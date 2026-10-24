// Habits that tick themselves from other tabs. A habit opts in with habit.auto = one of these keys.
export const AUTO = {
  'food:calories': 'Food: hit calories',
  'food:protein': 'Food: hit protein',
  'planner:work': "Planner: all of today's tasks done",
};
export const isAuto = (h) => !!h && typeof h.auto === 'string' && h.auto in AUTO;
export const autoTab = (h) => ({ food: 'Food', planner: 'Planner' }[String(h?.auto).split(':')[0]] || 'another tab');
