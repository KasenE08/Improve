// Run: node tests/hud.test.mjs  (header day circles, weekly bar, light/dark schedule)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
H.init();
const R = await import(J('rewards.js'));
const T = await import(J('theme.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, a, b); } else console.log('ok', m); };

// Light/dark: dark 7 PM → 4 AM; the switch lasts until the next automatic change
const at = (h, m = 0, d = 30) => new Date(2026, 9, d, h, m);
eq([T.autoTheme(at(18, 59)), T.autoTheme(at(19)), T.autoTheme(at(23, 30)), T.autoTheme(at(3, 59)), T.autoTheme(at(4))], ['light', 'dark', 'dark', 'dark', 'light'], 'automatic: dark 7 PM to 4 AM');
eq([T.nextSwitch(at(10)), T.nextSwitch(at(21)), T.nextSwitch(at(2))], [at(19).getTime(), at(4, 0, 31).getTime(), at(4).getTime()], 'next automatic change');
eq(T.toggleTheme(at(10)), 'dark', 'switch in the day → dark');
eq([T.currentTheme(at(18)), T.currentTheme(at(20))], ['dark', 'dark'], 'stays dark, then night is dark anyway');
eq(T.currentTheme(at(10, 0, 31)), 'light', 'next morning is automatic again');
eq(T.toggleTheme(at(21)), 'light', 'switch at night → light');
eq([T.currentTheme(at(23)), T.currentTheme(at(4, 1, 31))], ['light', 'light'], 'light until 4 AM, then light anyway');
eq(T.currentTheme(at(20, 0, 31)), 'dark', 'next evening is automatic again');

// Day circles: share of the day's habits done; Perfect Day (all Full) solid; a 2-min keeps it hollow
const { dayStatus } = await import(J('hud.js'));
H.saveHabits(H.getAllHabits().map((h) => ({ ...h, since: null })));
const day = '2026-10-27'; // a Tuesday (no Sunday check-in, no payday set up, no lift yet)
const tue = new Date(2026, 9, 27, 12);
const st0 = dayStatus(day);
eq([st0.total, st0.done], [12, 1], 'empty Tuesday: 12 habits show; fast food (none yet) counts as done');
const goals = H.getHabits().filter((h) => !H.isFastFood(h) && !H.isLift(h) && !h.days?.match(/sun|payday/));
H.step(goals[0], +1, tue);
eq(dayStatus(day).done, st0.done + 1, 'a tick fills the circle');
H.setExcused(goals[1], day, true);
eq(dayStatus(day).total, st0.total - 1, 'a day off is left out');
H.setExcused(goals[1], day, false);
const lift = H.getHabits().find((h) => H.isLift(h));
H.setLevel(lift, day, H.FULL);
eq(dayStatus(day).total, st0.total + 1, 'a lift session that day counts');
for (const h of goals) H.setLevel(h, day, h.twoMin ? H.MIN : H.FULL);
R.sync(tue);
let st1 = dayStatus(day);
eq([st1.done, st1.total, st1.perfect], [st1.total, st1.total, false], 'everything done but some 2-min: full ring, not a Perfect Day');
for (const h of goals) H.setLevel(h, day, H.FULL);
R.sync(tue);
st1 = dayStatus(day);
eq([st1.done, st1.total, st1.perfect], [st1.total, st1.total, true], 'everything Full: Perfect Day');
eq(dayStatus('2026-10-20'), null, 'before launch: blank');

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('all passed');
