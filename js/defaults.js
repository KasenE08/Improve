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

// [id, name, category, frequency, target per period, XP per completion, auto source]
// "auto" marks habits that a later phase will check off from another tab.
const rows = [
  ['lift', 'Lift', 'body', 'weekly', 5, 20],
  ['sleep', '7–9 hrs sleep', 'body', 'daily', 1, 20],
  ['steps', '8–10k steps', 'body', 'daily', 1, 10],
  ['mobility', 'Mobility/stretching', 'body', 'daily', 1, 10],
  ['progress-photo', 'Progress photo + weigh-in', 'body', 'weekly', 1, 25],
  ['body-checkin', 'Body check-in (measurements, face/build)', 'body', 'monthly', 1, 50],

  ['calories', 'Hit calories', 'diet', 'daily', 1, 20, 'food:calories'],
  ['protein', 'Hit protein', 'diet', 'daily', 1, 20, 'food:protein'],
  ['water', '3L water', 'diet', 'daily', 1, 10],
  ['no-alcohol', 'No alcohol, low sodium', 'diet', 'daily', 1, 5],

  ['am-skincare', 'AM skincare (cleanser, moisturizer, sunscreen)', 'skin', 'daily', 1, 10],
  ['pm-skincare', 'PM skincare (cleanser, moisturizer)', 'skin', 'daily', 1, 10],
  ['oral-care', 'Full oral care (brush, floss, tongue scraper, mouthwash)', 'skin', 'daily', 1, 10],
  ['shower', 'Shower, deodorant, scent', 'skin', 'daily', 1, 5],
  ['hands-off-face', 'Hands off face', 'skin', 'daily', 1, 5],
  ['nails-brows', 'Nails & brows', 'skin', 'weekly', 1, 25],
  ['haircut', 'Haircut', 'skin', 'monthly', 1, 50],
  ['restock', 'Restock products', 'skin', 'monthly', 1, 50],

  ['no-fap', 'No fap', 'mind', 'daily', 1, 20],
  ['work-on-schedule', 'Work done on schedule', 'mind', 'daily', 1, 20, 'planner:work'],
  ['no-phone-am', 'No phone first 30 min of morning', 'mind', 'daily', 1, 10],
  ['journal', 'Journal', 'mind', 'daily', 1, 10, 'journal:words'],
  ['kept-word', 'Kept my word', 'mind', 'daily', 1, 10],
  ['weekly-review', 'Weekly review (wins, misses, staying calm)', 'mind', 'weekly', 1, 25],

  ['log-spending', 'Log spending', 'money', 'daily', 1, 5],
  ['save-paycheck', 'Save set % of paycheck', 'money', 'weekly', 1, 25, 'money:save'],
  ['budget-review', 'Budget review', 'money', 'monthly', 1, 50, 'money:review'],

  ['dressed', 'Dressed intentionally', 'style', 'daily', 1, 5],
  ['clean-shoes', 'Clean shoes', 'style', 'weekly', 1, 25],
  ['wardrobe-review', 'Wardrobe review', 'style', 'monthly', 1, 50],

  ['friends', 'Time with friends', 'people', 'weekly', 1, 25],
  ['family', 'Family time', 'people', 'weekly', 1, 25],
  ['try-new', 'Try something new', 'people', 'monthly', 1, 50],
];

export const DEFAULT_HABITS = rows.map(([id, name, category, frequency, target, xp, auto], order) => ({
  id, name, category, frequency, target, xp, order, archived: false, auto: auto || null,
}));

export const DEFAULT_PROFILE = { name: 'KASEN' };
