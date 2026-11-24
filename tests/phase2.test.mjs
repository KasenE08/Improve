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
const { addDays, dayKey } = await import(J('dates.js'));

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
const dailies = DEFAULT_HABITS;
// (the schema 6 upgrade adds "Be proactive", so it's done that day too)
mem.imp_log = JSON.stringify({ '2026-10-20': { ...Object.fromEntries(dailies.map((h) => [h.id, { n: h.target, xp: h.xp }])), proactive: { n: 1, xp: 30 } } });
const found = H.init();
eq(found, 1, 'init reports old schema 1');
eq(H.getProfile().name, 'TESTER', 'profile kept');
R.awardPastPerfectDays(new Date(2026, 9, 24));
eq(R.getBonus()['2026-10-20']?.perfect?.xp, 100, 'past perfect day awarded on upgrade');
const dayXP = H.xpOnDay('2026-10-20');
H.archiveHabit('proactive');
eq(S.compute().total, dayXP + 100, 'total XP = that day + 100 bonus');

// ---- Perfect Day: every habit showing today done Full ----
const sat = new Date(2026, 9, 24, 10);
const hs = H.getHabits();
const fullDay = (d) => { for (const h of H.getHabits()) if (!H.isFastFood(h) && !H.isLift(h) && R.isScheduled(h, dayKey(d))) H.setLevel(h, dayKey(d), H.FULL); };
fullDay(sat);
let added = R.sync(sat);
eq(added.some((b) => b.type === 'perfect'), true, 'perfect day added when every habit is done Full');
H.step(hs.find((h) => h.id === 'journal'), -1, sat);
R.sync(sat);
eq(!!R.getBonus()['2026-10-24']?.perfect, false, 'undo removes perfect day');
H.step(hs.find((h) => h.id === 'journal'), 1, sat);
R.sync(sat);

// ---- Streak milestone at 7 days ----
const sleep = H.getHabits().find((h) => h.id === 'sleep');
const start = new Date(2026, 10, 1, 8);
for (let i = 0; i < 6; i++) { H.step(sleep, 1, addDays(start, i)); R.sync(addDays(start, i)); }
const first = Object.keys(R.getBonus()).find((k) => R.getBonus()[k]['streak:sleep']);
eq(R.streak(sleep, addDays(start, 5)).count, 6, '6-day streak');
eq(R.streak(sleep, addDays(start, 6)), { count: 6, current: false, level: 0, atRisk: false, min: false }, 'streak alive before today is done');
H.step(sleep, 1, addDays(start, 6));
added = R.sync(addDays(start, 6));
eq(added.map((b) => [b.type, b.n, b.xp]), [['streak', 7, 50]], '7-day milestone +50');
eq(first, '2026-11-03', 'the 3-day milestone came first');
eq(R.sync(addDays(start, 6)).length, 0, 'milestone not awarded twice');
H.step(sleep, -1, addDays(start, 6)); R.sync(addDays(start, 6));
eq(Object.values(R.getBonus()['2026-11-07'] || {}).filter((b) => b.type === 'streak').length, 0, 'undo removes milestone');
eq(R.streak(sleep, addDays(start, 7)).count, 0, 'a missed day breaks the streak (no grace day)');

// ---- Minimum (2-min) and Full ----
{
  const g0 = new Date(2027, 1, 1, 9); // Mon Feb 1 2027
  const L2 = (i, lv) => H.setLevel(sleep, dayKey(addDays(g0, i)), lv);
  L2(0, H.FULL); L2(1, H.FULL);
  eq(R.streak(sleep, addDays(g0, 1)).count, 2, 'Full, Full → 2');
  L2(2, H.MIN);
  eq(R.streak(sleep, addDays(g0, 2)).count, 2, '2-min holds (2)');
  eq(R.streak(sleep, addDays(g0, 3)).atRisk, true, 'after a 2-min: today needs Full (at risk)');
  L2(3, H.FULL);
  eq(R.streak(sleep, addDays(g0, 3)), { count: 3, current: true, level: 2, atRisk: false, min: false }, 'Full after a 2-min → 3');
  L2(4, H.MIN); L2(5, H.MIN);
  eq(R.streak(sleep, addDays(g0, 5)).count, 0, '2-min two days in a row breaks it');
  L2(6, H.FULL);
  eq(R.streak(sleep, addDays(g0, 6)).count, 1, 'starts again with Full');
  eq([R.milestoneXP(3), R.milestoneXP(60), R.milestoneXP(180), R.milestoneXP(365), R.milestoneXP(730), R.milestoneXP(50)], [20, 300, 800, 1500, 1500, 0], 'milestones 3, 7, 14, 30, 60, 100, 180, 365, then every 365');
  eq([R.tier(2), R.tier(6), R.tier(7), R.tier(30), R.tier(100)], [1, 1, 2, 3, 4], 'flame levels');
}

// ---- Lift: counts sessions, 5 a week ----
{
  const lift = H.getHabits().find((h) => H.isLift(h));
  const m = new Date(2027, 2, 1, 12); // Mon Mar 1 2027
  const day = (i) => dayKey(addDays(m, i));
  for (const i of [0, 1, 2]) H.setLevel(lift, day(i), H.FULL);
  H.setLevel(lift, day(3), H.MIN);
  eq(R.streak(lift, addDays(m, 4)).count, 3, '3 Full sessions + a 2-min = 3 (2-min holds; days off don\'t count)');
  H.setLevel(lift, day(5), H.FULL);
  eq([R.liftDone(lift, addDays(m, 5)), R.isScheduled(lift, day(6))], [5, false], '5/5 this week: hidden for the rest of the week');
  eq(R.streak(lift, addDays(m, 7)).count, 4, 'week of 5 sessions: kept (4)');
  H.setLevel(lift, day(7), H.MIN); H.setLevel(lift, day(9), H.MIN);
  eq(R.streak(lift, addDays(m, 9)).count, 0, '2-min sessions twice in a row break it');
  H.setLevel(lift, day(9), H.FULL);
  eq(R.streak(lift, addDays(m, 13)).count, 5, 'still this week: alive (5)');
  eq(R.streak(lift, addDays(m, 14)).count, 0, 'the week ended under 5/5: broken');
}

// ---- Fast food: 2 passes a week ----
{
  const m = new Date(2027, 3, 5, 12); // Mon Apr 5 2027
  H.upsertHabit({ ...H.getHabits().find((h) => H.isFastFood(h)), since: dayKey(m) });
  const ff = H.getHabits().find((h) => H.isFastFood(h));
  eq(R.streak(ff, addDays(m, 3)).count, 3, 'three days with none → 3 (today counts once it\'s over)');
  H.step(ff, +1, addDays(m, 3));
  eq(R.streak(ff, addDays(m, 4)).count, 3, 'a pass holds the streak');
  H.step(ff, +1, addDays(m, 4));
  eq([R.passesUsed(ff, addDays(m, 4)), R.streak(ff, addDays(m, 5)).count], [2, 3], 'second pass: 2/2, still holds');
  eq(R.streak(ff, addDays(m, 5)).atRisk, true, 'no passes left: at risk');
  H.step(ff, +1, addDays(m, 5));
  eq(R.streak(ff, addDays(m, 5)).count, 0, 'a third in one week resets it to 0');
  eq(R.passesUsed(ff, addDays(m, 7)), 0, 'passes reset Monday');
}

// ---- Category meters ----
const st = S.compute();
eq(S.weeklyPotential().total > 0, true, 'weekly potential');
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
