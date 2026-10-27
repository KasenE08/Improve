// Run: node tests/phase2.test.mjs  (levels, streaks, bonuses, Phase 1 upgrade, backup)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const L = await import(J('levels.js'));
const H = await import(J('habits.js'));
const R = await import(J('rewards.js'));
const S = await import(J('stats.js'));
const B = await import(J('backup.js'));
const { addDays } = await import(J('dates.js'));

let fails = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, '\n  got', a, '\n  want', b); } else console.log('ok', m);
};

// ---- Level curve (2× faster: 150 + 30 per level) ----
eq(L.need(1), 300, 'LV1→2 needs 300');
eq(L.need(10), 840, 'LV10→11 needs 840');
eq(L.levelFromXP(0).level, 1, '0 XP = LV1');
eq(L.levelFromXP(299).level, 1, '299 XP = LV1');
eq(L.levelFromXP(300).level, 2, '300 XP = LV2');
eq(L.xpToReach(10), 4860, 'LV10 at 4,860 total XP');
eq(L.xpToReach(50), 85260, 'LV50 at 85,260 total XP');
eq(L.levelFromXP(L.xpToReach(50)).level, 50, 'levelFromXP matches xpToReach');
eq(L.rankFor(1).name, 'Initiate', 'rank LV1');
eq(L.rankFor(9).name, 'Apprentice', 'rank LV9');
eq(L.rankFor(10).name, 'Adept', 'rank LV10');
eq(L.rankFor(100).name, 'Ascended', 'rank LV100');

// ---- Upgrade from Phase 1 keeps data ----
const day0 = new Date(2026, 9, 20, 9); // Tue
mem.imp_schema = '1';
H.init(); // would seed if fresh; schema 1 must NOT be reseeded
eq(mem.imp_schema, String(H.SCHEMA), 'schema bumped to current');
mem.imp_schema = '1';
delete mem.imp_habits; delete mem.imp_categories;
const { DEFAULT_HABITS, DEFAULT_CATEGORIES } = await import(J('defaults.js'));
mem.imp_habits = JSON.stringify(DEFAULT_HABITS); mem.imp_categories = JSON.stringify(DEFAULT_CATEGORIES);
mem.imp_profile = JSON.stringify({ name: 'TESTER' });
// Phase 1 style log (no "c" field): a perfect day on Oct 20
const dailies = DEFAULT_HABITS.filter((h) => h.frequency === 'daily');
mem.imp_log = JSON.stringify({ '2026-10-20': Object.fromEntries(dailies.map((h) => [h.id, { n: 1, xp: h.xp }])) });
const found = H.init();
eq(found, 1, 'init reports old schema 1');
eq(H.getProfile().name, 'TESTER', 'profile kept');
R.awardPastPerfectDays(new Date(2026, 9, 24));
eq(R.getBonus()['2026-10-20']?.perfect?.xp, 100, 'past perfect day awarded on upgrade');
eq(S.compute().total, 470 + 100, 'total XP = 470 dailies + 100 bonus');
eq(S.compute().categories.find((c) => c.id === 'body').xp, 60, 'old entries count toward category via habit');

// ---- Perfect Day: earned and undone ----
const sat = new Date(2026, 9, 24, 10);
const hs = H.getHabits();
for (const h of hs.filter((h) => h.frequency === 'daily')) H.step(h, 1, sat);
let added = R.sync(sat);
eq(added.some((b) => b.type === 'perfect'), true, 'perfect day added when all dailies done');
eq(S.today(sat).earned, 470 + 100, 'daily meter includes bonus');
eq(S.today(sat).max, 470 + 100, 'daily meter full on perfect day');
H.step(hs.find((h) => h.id === 'journal'), -1, sat);
R.sync(sat);
eq(!!R.getBonus()['2026-10-24']?.perfect, false, 'undo removes perfect day');
H.step(hs.find((h) => h.id === 'journal'), 1, sat);
R.sync(sat);

// ---- Streak milestone at 7 days ----
const sleep = H.getHabits().find((h) => h.id === 'sleep');
const start = new Date(2026, 10, 1, 8);
for (let i = 0; i < 6; i++) { H.step(sleep, 1, addDays(start, i)); R.sync(addDays(start, i)); }
eq(R.streak(sleep, addDays(start, 5)).count, 6, '6-day streak');
eq(R.streak(sleep, addDays(start, 6)), { count: 6, current: false }, 'streak alive before today is done');
H.step(sleep, 1, addDays(start, 6));
added = R.sync(addDays(start, 6));
eq(added.map((b) => [b.type, b.n, b.xp]), [['streak', 7, 50]], '7-day milestone +50');
eq(R.sync(addDays(start, 6)).length, 0, 'milestone not awarded twice');
H.step(sleep, -1, addDays(start, 6)); R.sync(addDays(start, 6));
eq(Object.values(R.getBonus()['2026-11-07'] || {}).length, 0, 'undo removes milestone');
eq(R.streak(sleep, addDays(start, 8)).count, 0, 'missed day resets streak');

// ---- Weekly streak milestone stays for the week ----
const fam = H.getHabits().find((h) => h.id === 'family');
const mon = new Date(2026, 11, 7, 9); // Monday Dec 7
for (let w = 0; w < 7; w++) { const d = addDays(mon, w * 7 + 2); H.step(fam, 1, d); R.sync(d); }
const lastWeekDay = addDays(mon, 6 * 7 + 2);
eq(R.streak(fam, lastWeekDay).count, 7, '7-week streak');
const holder = Object.keys(R.getBonus()).find((k) => R.getBonus()[k]['streak:family']);
eq(holder, '2027-01-20', 'weekly milestone stored on completion day');
R.sync(addDays(lastWeekDay, 2));
eq(!!R.getBonus()['2027-01-20']['streak:family'], true, 'later sync same week keeps it');

// ---- Monthly streak counts first-Monday months ----
{
  const cut = H.getHabits().find((h) => h.id === 'haircut');
  for (const d of [new Date(2027, 2, 10, 12), new Date(2027, 3, 12, 12), new Date(2027, 4, 4, 12)]) H.step(cut, 1, d); // Mar 1–Apr 4, Apr 5–May 2, May 3–Jun 6
  eq(R.streak(cut, new Date(2027, 4, 20, 12)).count, 3, '3-month streak across Monday-months');
  eq(R.streak(cut, new Date(2027, 5, 10, 12)), { count: 3, current: false }, 'next month (Jun 7–) not done yet: streak alive');
}

// ---- Category meters are scaled ----
const st = S.compute();
const pot = S.weeklyPotential();
eq(Math.round(pot.total), Math.round(470 * 7 + 525 + 320 * 12 / 52), 'weekly potential total');
const people = st.categories.find((c) => c.id === 'people');
eq(people.scale < 0.05, true, 'People curve scaled down');
eq(st.categories.every((c) => c.level >= 1), true, 'all categories have a level');

// ---- Ranks editable ----
L.saveRanks([{ min: 1, name: 'Rookie' }, { min: 3, name: 'Pro' }]);
eq(L.rankFor(5).name, 'Pro', 'custom ranks used');

// ---- Backup round trip, imp_ only ----
mem.other_app_key = 'keep me';
mem.imp_design_iconset_pixel = 'lucide';
const backup = B.buildBackup();
eq(Object.keys(backup.data).every((k) => k.startsWith('imp_') && !k.startsWith('imp_design_')), true, 'backup has only imp_ app keys');
eq(B.parseBackup('nope').ok, false, 'rejects junk');
eq(B.parseBackup(JSON.stringify({ app: 'improve', data: { evil: 1, imp_habits: [], imp_log: {} } })).ok, false, 'rejects non-imp keys');
const snapshot = JSON.stringify(backup);
H.saveProfile({ name: 'CHANGED' });
B.restoreBackup(JSON.parse(snapshot));
eq(H.getProfile().name, 'TESTER', 'restore brings data back');
eq(mem.other_app_key, 'keep me', 'other apps untouched by restore');
eq(Object.keys(mem).filter((k) => !k.startsWith('imp_')), ['other_app_key'], 'app writes only imp_ keys');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exitCode = fails ? 1 : 0;
