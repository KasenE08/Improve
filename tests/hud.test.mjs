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

// Day circles: share of daily habits done; Perfect Day solid
const { dayStatus, weekStatus } = await import(J('hud.js'));
const dailies = H.getHabits().filter((h) => h.frequency === 'daily');
const goals = dailies.filter((h) => !H.isLimit(h) && !h.auto);
const day = '2026-10-27';
const st0 = dayStatus(day);
eq([st0.total, st0.done], [dailies.length, dailies.filter((h) => H.isLimit(h)).length], 'empty day: only limits (at or under) count as done');
const tue = new Date(2026, 9, 27, 12);
H.step(goals[0], +1, tue);
eq(dayStatus(day).done, st0.done + 1, 'a tick fills the circle');
H.setExcused(goals[1], day, true);
eq(dayStatus(day).total, st0.total - 1, 'a day off is left out');
for (const h of dailies) if (!H.isLimit(h)) while (H.progress(h, tue) < h.target) { if (!H.step(h, +1, tue) && H.progress(h, tue) < h.target) H.setDone(h, day, true, new Date(2026, 9, 28, 12)); }
R.sync(tue);
const st1 = dayStatus(day);
eq([st1.done, st1.total, st1.perfect], [st1.total, st1.total, true], 'everything done: Perfect Day');
eq(dayStatus('2026-10-20'), null, 'before launch: blank');

// Weekly bar: weekly habits only
const weeklies = H.getHabits().filter((h) => h.frequency === 'weekly');
const w0 = weekStatus(tue);
eq(w0.total, weeklies.length, 'weekly bar counts weekly habits only');
const wg = weeklies.find((h) => !H.isLimit(h) && !h.auto);
for (let i = 0; i < wg.target; i++) H.step(wg, +1, tue);
eq(weekStatus(tue).done, w0.done + 1, 'finishing a weekly habit moves the bar');

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('all passed');
