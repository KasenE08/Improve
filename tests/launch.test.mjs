// Run: node tests/launch.test.mjs  (launch-day wipe keeps setup, clears test data once)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
globalThis.document = undefined;
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const L = await import(J('launch.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); } else console.log('ok', m); };
const set = (k, v) => { mem['imp_' + k] = JSON.stringify(v); };
const get = (k) => JSON.parse(mem['imp_' + k] ?? 'null');

eq(L.START, '2026-10-26', 'starts Monday Oct 26');
eq(L.MONTHLY_START, '2026-11-02', 'monthly habits start Monday Nov 2');
eq([L.monthlyOpen('2026-11-01'), L.monthlyOpen('2026-11-02')], [false, true], 'monthly opens Nov 2');
eq(L.unlockAt().getHours() * 60 + L.unlockAt().getMinutes(), 241, 'unlocks at 4:01 AM');

set('habits', [{ id: 'sleep' }]); set('categories', [{ id: 'body' }]); set('profile', { name: 'KASEN' });
set('log', { '2026-10-25': { sleep: { n: 1, xp: 20 } } });
set('bonus', { '2026-10-25': { perfect: { xp: 50 } } });
set('planner_day', { date: '2026-10-25', ids: [] });
set('food', { settings: { calGoal: 2800 }, foods: [{ id: 'f' }], savedMeals: [{ id: 'm' }], entries: [{ date: '2026-10-25' }, { date: '2026-10-26' }] });
set('money', { settings: { setup: true }, categories: [{ id: 'food', budget: 20000 }], entries: [{ date: '2026-10-20' }, { date: '2026-10-27' }], reviews: { '2026-10': { doneAt: new Date(2026, 9, 22).toISOString() }, '2026-11': { doneAt: new Date(2026, 10, 3).toISOString() } } });
set('journal', { settings: { minWords: 30 }, days: { '2026-10-25': 'test', '2026-10-26': 'day one' } });
set('planner', { blocks: [{ id: 'school' }], locations: [{ id: 'home' }], settings: { x: 1 }, tasks: [{ id: 'old', createdAt: new Date(2026, 9, 20).getTime() }, { id: 'new', createdAt: new Date(2026, 9, 26, 9).getTime() }], plan: { items: [1] }, push: { deviceId: 'd' } });

eq(L.wipeTestData(), true, 'wipe runs');
eq([get('log'), get('bonus'), get('planner_day')], [{}, {}, null], 'XP, bonuses, planner day cleared');
eq([get('habits'), get('categories'), get('profile')], [[{ id: 'sleep' }], [{ id: 'body' }], { name: 'KASEN' }], 'habits, categories, name kept');
const f = get('food');
eq([f.entries, f.foods.length, f.savedMeals.length, f.settings.calGoal], [[{ date: '2026-10-26' }], 1, 1, 2800], 'food: old log gone, foods/meals/goals kept');
const m = get('money');
eq([m.entries, Object.keys(m.reviews), m.categories[0].budget, m.settings.setup], [[{ date: '2026-10-27' }], ['2026-11'], 20000, true], 'money: old entries + October review gone, budgets/pay kept');
const j = get('journal');
eq([Object.keys(j.days), j.settings.minWords], [['2026-10-26'], 30], 'journal: old days gone, goal kept');
const p = get('planner');
eq([p.tasks.map((t) => t.id), p.plan, p.blocks.length, p.push.deviceId], [['new'], null, 1, 'd'], 'planner: old tasks gone, fixed schedule + notifications kept');

set('log', { '2026-11-02': { sleep: { n: 1, xp: 20 } } });
eq(L.wipeTestData(), false, 'second run does nothing');
eq(get('log'), { '2026-11-02': { sleep: { n: 1, xp: 20 } } }, 'real data after launch is never wiped');
eq(Object.keys(mem).every((k) => k.startsWith('imp_')), true, 'only imp_ keys');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
