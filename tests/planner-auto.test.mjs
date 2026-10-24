// Run: node tests/planner-auto.test.mjs  ("Work done on schedule" from the Planner tab's data)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
H.init();
const P = await import(J('planner-auto.js'));
const B = await import(J('backup.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, a, b); } else console.log('ok', m); };

const day = new Date(2026, 9, 26, 12); // Mon Oct 26, noon
const t = (h) => new Date(2026, 9, 26, h).getTime();
const done = () => !!H.getLog()['2026-10-26']?.['work-on-schedule'];
const save = (d) => { mem.imp_planner = JSON.stringify(d); };
const task = (id, status = 'todo') => ({ id, title: id, status });

P.recheckPlanner(day);
eq(done(), false, 'planner never set up: no free XP');

save({ tasks: [], blocks: [], plan: { items: [] } });
P.recheckPlanner(day);
eq(done(), false, 'empty planner (just opened): no free XP');

save({ tasks: [], blocks: [{ id: 'school' }], plan: { items: [] } });
P.recheckPlanner(day);
eq(done(), true, 'set up, nothing planned today: counts as done');

save({ tasks: [task('a'), task('b')], plan: { items: [{ taskId: 'a', start: t(15), end: t(16) }, { taskId: 'b', start: t(17), end: t(18) }] } });
P.recheckPlanner(day);
eq(done(), false, 'two tasks planned, none done');

save({ tasks: [task('a', 'done'), task('b', 'inProgress')], plan: { items: [{ taskId: 'a', start: t(15), end: t(16) }, { taskId: 'b', start: t(17), end: t(18) }] } });
P.recheckPlanner(day);
eq(done(), false, 'one done, one in progress');

// "Falling behind" moved b to tomorrow: still counts as today's
save({ tasks: [task('a', 'done'), task('b')], plan: { items: [{ taskId: 'b', start: t(17) + 86400000, end: t(18) + 86400000 }] } });
P.recheckPlanner(day);
eq(done(), false, 'moving a task off today does not count as done');

save({ tasks: [task('a', 'done'), task('b', 'done')], plan: { items: [] } });
P.recheckPlanner(day);
eq(done(), true, 'both done: ticked');
eq(H.getLog()['2026-10-26']['work-on-schedule'].xp, 20, 'earns the habit XP');

save({ tasks: [task('a', 'done')], plan: { items: [] } });
P.recheckPlanner(new Date(2026, 9, 27, 9));
eq(!!H.getLog()['2026-10-27']?.['work-on-schedule'], true, 'next day starts fresh (nothing planned)');
eq(done(), true, 'yesterday keeps its result');

// Deleted tasks drop off the list
save({ tasks: [task('c')], plan: { items: [{ taskId: 'c', start: new Date(2026, 9, 28, 15).getTime(), end: new Date(2026, 9, 28, 16).getTime() }] } });
P.recheckPlanner(new Date(2026, 9, 28, 9));
save({ tasks: [], blocks: [{ id: 'school' }], plan: { items: [] } });
P.recheckPlanner(new Date(2026, 9, 28, 10));
eq(!!H.getLog()['2026-10-28']?.['work-on-schedule'], true, 'deleted task no longer blocks the day');

// Backups never carry this phone's notification keys, and restore keeps them
save({ tasks: [], plan: null, push: { url: 'https://x', deviceId: 'd', secret: 's' } });
const b = B.buildBackup();
eq(b.data.imp_planner.push, null, 'backup strips notification keys');
B.restoreBackup(JSON.parse(JSON.stringify(b)));
eq(JSON.parse(mem.imp_planner).push?.deviceId, 'd', 'restore keeps this phone\'s notification setup');
eq(Object.keys(mem).every((k) => k.startsWith('imp_')), true, 'only imp_ keys');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
