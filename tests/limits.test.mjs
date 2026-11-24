// Run: node tests/limits.test.mjs  (fast food passes, and the Nov 2026 upgrade to all-daily habits)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
const R = await import(J('rewards.js'));
const S = await import(J('stats.js'));
const { migrate22, legacyStreak } = await import(J('migrate.js'));
const { dayKey, addDays } = await import(J('dates.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); } else console.log('ok', m); };
const at = (m, d, h = 12) => new Date(2026, m, d, h); // month is 0-based
const clear = () => { for (const k of Object.keys(mem)) delete mem[k]; };

// ---- Fast food: taps count meals, never XP ----
clear();
H.init();
const ff = () => H.getHabits().find((h) => H.isFastFood(h));
eq(H.step(ff(), 1, at(9, 27)), 0, 'a meal gives no XP');
H.step(ff(), 1, at(9, 29));
eq(H.progress(ff(), at(9, 30)), 2, '2 meals this week');
eq([S.compute().total, S.compute().checkins], [0, 0], 'meals are no XP and not check-ins');
H.step(ff(), -1, at(9, 30));
eq(H.progress(ff(), at(9, 30)), 1, 'undo takes back the latest meal this week');
for (let i = 0; i < 120; i++) H.step(ff(), 1, at(9, 30));
eq(H.usesOn(ff(), '2026-10-30'), H.LIMIT_MAX_USES, 'meals capped at 99 a day');

// ---- Schema 22: every habit daily, content added, streaks kept ----
clear();
const now = new Date(2026, 10, 24, 12); // Tue Nov 24
const old = [
  { id: 'sleep', name: '8 hours sleep', category: 'body', frequency: 'daily', target: 1, xp: 30, order: 0, rule: '7 hours minimum', streakFrom: '2026-11-09' },
  { id: 'no-fap', name: 'No night tv', category: 'mind', frequency: 'daily', target: 1, xp: 60, order: 1, grace: false, streakFrom: '2026-11-09' },
  { id: 'h_mwei4zi6qxno', name: 'Stretching', category: 'body', frequency: 'daily', target: 1, xp: 10, order: 2, grace: true },
  { id: 'lift', name: 'Lift', category: 'body', frequency: 'weekly', target: 5, xp: 40, order: 3, streakFrom: '2026-11-09', startsOn: '2026-11-09' },
  { id: 'h_mvn3jd67szxn', name: 'Fast Food', category: 'diet', frequency: 'weekly', target: 2, xp: 40, order: 4, kind: 'limit', streakFrom: '2026-11-09' },
  { id: 'log-spending', name: 'Sunday money check-in', category: 'money', frequency: 'weekly', target: 1, xp: 15, order: 5, auto: 'money:checkin' },
  { id: 'try-new', name: 'Try something new', category: 'people', frequency: 'monthly', target: 1, xp: 150, order: 6 },
  { id: 'phone-free-day', name: 'One full day off my phone', category: 'mind', frequency: 'monthly', target: 1, xp: 40, order: 7 },
  { id: 'h_mw25rarzdrv8', name: 'AI automation >> Post', category: 'work', frequency: 'daily', target: 1, xp: 30, order: 8 },
  { id: 'h_mwe9ptqnyvog', name: '150g protein', category: 'diet', frequency: 'daily', target: 1, xp: 40, order: 9, auto: 'food:protein', rule: '120g minimum' },
];
const log = {};
const tick = (k, id, n = 1) => ((log[k] ||= {})[id] = { n, xp: 10 });
for (let i = 9; i <= 23; i++) { const k = `2026-11-${String(i).padStart(2, '0')}`; if (i !== 15) tick(k, 'sleep'); tick(k, 'no-fap'); tick(k, 'h_mwei4zi6qxno'); }
for (const k of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']) tick(k, 'lift');
tick('2026-11-24', 'sleep'); // already done today
tick('2026-11-15', 'log-spending'); tick('2026-11-22', 'log-spending');
mem.imp_schema = '21';
mem.imp_habits = JSON.stringify(old);
mem.imp_log = JSON.stringify(log);
mem.imp_bonus = JSON.stringify({ '2026-11-15': { 'limit:h_mvn3jd67szxn': { type: 'limit' } }, '2026-11-22': { 'limit:h_mvn3jd67szxn': { type: 'limit' } } });
mem.imp_food = JSON.stringify({ version: 1, settings: { calGoal: 2200, proteinGoal: 150, proteinMin: 120, calRange: 10, waterGoal: 100 } });
mem.imp_journal = JSON.stringify({ settings: { minWords: 100 }, days: {} });
const legacy = Object.fromEntries(old.map((h) => [h.id, legacyStreak(h, now, { counts: H.countsIndex(log), bonus: JSON.parse(mem.imp_bonus), ex: {} }).count]));
eq([legacy.sleep, legacy['no-fap'], legacy.lift, legacy.h_mvn3jd67szxn, legacy['log-spending']], [15, 15, 2, 2, 2], 'old rules: sleep 15 (14 days, grace over Nov 15, + today), no TV 15, lift 2 weeks, fast food 2 weeks, check-in 2 weeks');
H.init();
migrate22(now);
const all = Object.fromEntries(JSON.parse(mem.imp_habits).map((h) => [h.id, h]));
eq([all['try-new'].archived, all['phone-free-day'].archived], [true, true], 'habits not on the new list are removed (history kept)');
eq(Object.values(all).filter((h) => !h.archived).every((h) => h.frequency === 'daily'), true, 'every habit is daily');
eq([all.sleep.name, all.sleep.rule, all.sleep.twoMin, all.sleep.full], ['Sleep', '6 hours minimum · 8 recommended', '6 hours', '8 hours'], 'Sleep gets its name, subtitle, 2-min and Full');
eq([all['no-fap'].name, all['no-fap'].twoMin, 'grace' in all['no-fap'], 'streakFrom' in all['no-fap']], ['No Night TV', null, false, false], 'No Night TV: Full only; grace day and old resets gone');
eq([all.lift.kind, all.lift.target, all.h_mvn3jd67szxn.kind, all.h_mvn3jd67szxn.target, all['log-spending'].days], ['lift', 5, 'fastfood', 2, 'sun'], 'Lift 5 a week, fast food 2 passes, check-in on Sundays');
eq([all.h_mwe9ptqnyvog.name, all.h_mwe9ptqnyvog.rule, all.h_mwe9ptqnyvog.twoMin], ['130g protein', null, '115g'], 'protein → 130 g (2-min 115 g)');
eq([all.h_mw25rarzdrv8.category, all.sleep.category], ['work', 'body'], 'categories kept');
eq([JSON.parse(mem.imp_food).settings.proteinGoal, JSON.parse(mem.imp_food).settings.proteinMin, JSON.parse(mem.imp_food).settings.waterMin, JSON.parse(mem.imp_food).settings.calMax, JSON.parse(mem.imp_journal).settings.shortWords], [130, 115, 80, 2700, 25], 'goals: protein 130/115, water 2-min 80, calories 2-min ≤ 2700, journal 2-min 25');
const st = (id, d = now) => R.streak(H.getAllHabits().find((h) => h.id === id), d).count;
eq([st('sleep'), st('no-fap'), st('h_mwei4zi6qxno'), st('lift'), st('h_mvn3jd67szxn'), st('log-spending')], [15, 15, 15, 2, 2, 2], 'every streak kept as it was (sleep counts today again under the new rules)');
eq(st('no-fap', at(10, 26)), 0, 'new rules from today: missing days breaks it');
mem.imp_schema = String(H.SCHEMA);
const before = mem.imp_habits;
H.init();
eq(mem.imp_habits, before, 'init after the upgrade changes nothing');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exitCode = fails ? 1 : 0;
