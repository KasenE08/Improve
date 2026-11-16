// Run: node tests/perfect.test.mjs  (Perfect Week and Perfect Month)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
const R = await import(J('rewards.js'));
const { dayKey, addDays } = await import(J('dates.js'));

let fails = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, '\n  got', a, '\n  want', b); } else console.log('ok', m);
};

const perfectRange = (from, n) => { const b = R.getBonus(); for (let i = 0; i < n; i++) (b[dayKey(addDays(from, i))] ||= {}).perfect = { type: 'perfect', xp: 100 }; localStorage.setItem('imp_bonus', JSON.stringify(b)); };
const doAllDailies = (d) => { for (const h of H.getHabits().filter((x) => x.frequency === 'daily' && !H.isLimit(x))) while (H.progress(h, d) < h.target) H.step(h, 1, d); };

// Week of Mon Feb 1 – Sun Feb 7, 2027: Mon–Sat already perfect, finish Sunday
const mon = new Date(2027, 1, 1, 12);
perfectRange(mon, 6);
eq(R.allPerfect(R.getBonus(), '2027-02-01', '2027-02-07'), false, 'Sunday not done yet: not a Perfect Week');
const sun = addDays(mon, 6);
doAllDailies(sun);
let added = R.sync(sun);
eq(added.map((b) => b.type).filter((t) => t.startsWith('perfect')).sort(), ['perfect', 'perfectWeek'], 'Sunday done: Perfect Day + Perfect Week');
eq(R.getBonus()['2027-02-07'].perfectWeek.from, '2027-02-01', 'Perfect Week stored on Sunday with its range');
eq(R.sync(sun).length, 0, 'not awarded twice');
eq(R.perfectCounts().weeks, 1, 'You tab: 1 Perfect Week');

// A Perfect Day on a Wednesday doesn't make a week
eq(R.allPerfect(R.getBonus(), '2027-02-08', '2027-02-14'), false, 'next week empty');

// Undo on Sunday removes it
const daily = H.getHabits().find((x) => x.frequency === 'daily' && !H.isLimit(x));
H.step(daily, -1, sun);
R.sync(sun);
eq([!!R.getBonus()['2027-02-07']?.perfect, !!R.getBonus()['2027-02-07']?.perfectWeek], [false, false], 'undo removes Perfect Day and Week');
H.step(daily, 1, sun); R.sync(sun);

// Perfect Month: Feb 2027 (28 days). Feb 1–27 perfect, finish Feb 28
perfectRange(mon, 27);
const last = new Date(2027, 1, 28, 12);
doAllDailies(last);
added = R.sync(last);
eq(added.map((b) => b.type).filter((t) => t.startsWith('perfect')).sort(), ['perfect', 'perfectMonth', 'perfectWeek'], 'Feb 28 (a Sunday): Day, Week and Month');
eq(R.perfectCounts(), { days: 28, weeks: 4, months: 1 }, 'totals: 28 days, 4 weeks, 1 month');

// A month with one missed day isn't perfect
const b = R.getBonus(); delete b['2027-02-15']; localStorage.setItem('imp_bonus', JSON.stringify(b));
eq(R.perfectCounts(), { days: 27, weeks: 3, months: 0 }, 'one missed day: no Perfect Month, that week gone');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
if (fails) process.exit(1);
