// Habits that tick themselves from other tabs. A habit opts in with habit.auto = one of these keys.
export const AUTO = {
  'food:calories': 'Food: hit calories',
  'food:protein': 'Food: hit protein',
  'food:water': 'Food: hit water goal',
  'money:save': 'Money: saved from this week\'s paycheck',
  'money:review': 'Money: monthly budget review done',
  'journal:words': 'Journal: wrote enough words today',
};
export const isAuto = (h) => !!h && typeof h.auto === 'string' && h.auto in AUTO;
export const autoTab = (h) => ({ food: 'Food', planner: 'Planner', money: 'Money', journal: 'Journal' }[String(h?.auto).split(':')[0]] || 'another tab');
