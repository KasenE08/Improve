// Starting data. Copied into localStorage on first launch; after that the
// stored copy is the source of truth and everything is editable in the app.

export const DEFAULT_CATEGORIES = [
  { id: 'body', name: 'Body', icon: 'body' },
  { id: 'diet', name: 'Diet', icon: 'diet' },
  { id: 'skin', name: 'Skin & Hygiene', icon: 'skin' },
  { id: 'mind', name: 'Mind', icon: 'mind' },
  { id: 'money', name: 'Money', icon: 'money' },
  { id: 'style', name: 'Style', icon: 'style' },
  { id: 'people', name: 'People', icon: 'people' },
];

// [id, name, category, frequency, target per period (a limit's max), XP per completion, auto source, kind]
// XP = difficulty × importance (rated Oct 2026): base by difficulty × 1 / 1.5 / 2 for Nice / Important / Core.
// "auto" marks habits that a later phase will check off from another tab.
const rows = [
  ['lift', 'Lift', 'body', 'weekly', 5, 40],
  ['sleep', '7–9 hrs sleep', 'body', 'daily', 1, 30],
  ['steps', '8–10k steps', 'body', 'daily', 1, 20],
  ['mobility', 'Mobility/stretching', 'body', 'daily', 1, 10],
  ['progress-photo', 'Progress photo + weigh-in', 'body', 'weekly', 1, 25],
  ['body-checkin', 'Body check-in (measurements, face/build)', 'body', 'monthly', 1, 45],

  ['calories', 'Hit calories', 'diet', 'daily', 1, 60, 'food:calories'],
  ['protein', 'Hit protein', 'diet', 'daily', 1, 40, 'food:protein'],
  ['water', '100 oz water', 'diet', 'daily', 1, 30, 'food:water'],
  ['fast-food', 'Fast food', 'diet', 'weekly', 2, 40, null, 'limit'],

  ['skincare', 'Skincare (AM + PM)', 'skin', 'daily', 2, 10],
  ['oral-care', 'Full oral care (brush, floss, tongue scraper, mouthwash)', 'skin', 'daily', 2, 5],
  ['shower', 'Shower, deodorant, scent', 'skin', 'daily', 1, 5],
  ['hands-off-face', 'Hands off face', 'skin', 'daily', 1, 20],
  ['nails-brows', 'Nails & brows', 'skin', 'weekly', 1, 15],
  ['haircut', 'Haircut', 'skin', 'monthly', 1, 30],
  ['restock', 'Restock products', 'skin', 'monthly', 1, 45],

  ['no-fap', 'No fap', 'mind', 'daily', 1, 60],
  ['work-on-schedule', "Finished today's work", 'mind', 'daily', 1, 60, 'planner:work'],
  ['no-phone-am', 'No phone first 30 min of morning', 'mind', 'daily', 1, 20],
  ['journal', 'Journal', 'mind', 'daily', 1, 15, 'journal:words'],
  ['kept-word', 'Kept my word', 'mind', 'daily', 1, 15],
  ['proactive', 'Be proactive', 'mind', 'daily', 1, 30],

  ['log-spending', 'Log spending', 'money', 'daily', 1, 15],
  ['save-paycheck', 'Save set % of paycheck', 'money', 'weekly', 1, 20, 'money:save'],
  ['budget-review', 'Budget review', 'money', 'monthly', 1, 50, 'money:review'],

  ['dressed', 'Dressed intentionally', 'style', 'daily', 1, 10],
  ['clean-shoes', 'Clean shoes', 'style', 'weekly', 1, 25],

  ['friends', 'Time with friends', 'people', 'weekly', 1, 60],
  ['family', 'Family time', 'people', 'weekly', 1, 40],
  ['try-new', 'Try something new', 'people', 'monthly', 1, 150],
];

// Auto habits that wait until a time of day before ticking (minutes after midnight)
const AUTO_AFTER = { 'work-on-schedule': 15 * 60 };

export const DEFAULT_HABITS = rows.map(([id, name, category, frequency, target, xp, auto, kind], order) => ({
  id, name, category, frequency, target, xp, order, archived: false, auto: auto || null,
  ...(kind === 'limit' ? { kind, limitSince: '2026-10-26' } : {}),
  ...(id in AUTO_AFTER ? { autoAfter: AUTO_AFTER[id] } : {}),
}));

export const DEFAULT_PROFILE = { name: 'KASEN' };
