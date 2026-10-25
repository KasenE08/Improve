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

const day = new Date(2026, 9, 26, 16); // Mon Oct 26, 4 PM (after the 3 PM tick time)
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
P.recheckPlanner(new Date(2026, 9, 27, 16));
eq(!!H.getLog()['2026-10-27']?.['work-on-schedule'], true, 'next day starts fresh (nothing planned)');
eq(done(), true, 'yesterday keeps its result');

// Deleted tasks drop off the list
save({ tasks: [task('c')], plan: { items: [{ taskId: 'c', start: new Date(2026, 9, 28, 15).getTime(), end: new Date(2026, 9, 28, 16).getTime() }] } });
P.recheckPlanner(new Date(2026, 9, 28, 16));
save({ tasks: [], blocks: [{ id: 'school' }], plan: { items: [] } });
P.recheckPlanner(new Date(2026, 9, 28, 16, 30));
eq(!!H.getLog()['2026-10-28']?.['work-on-schedule'], true, 'deleted task no longer blocks the day');

// ---- Waits until 3 PM ----
eq(H.getHabits().find((h) => h.id === 'work-on-schedule').autoAfter, 900, 'Work done on schedule waits until 3 PM');
save({ tasks: [], blocks: [{ id: 'school' }], plan: { items: [] } });
P.recheckPlanner(new Date(2026, 9, 29, 14, 59));
eq(!!H.getLog()['2026-10-29']?.['work-on-schedule'], false, 'empty day, 2:59 PM: not yet');
P.recheckPlanner(new Date(2026, 9, 29, 15, 0));
eq(!!H.getLog()['2026-10-29']?.['work-on-schedule'], true, '3:00 PM: ticks');
P.recheckPlanner(new Date(2026, 9, 30, 1, 30));
eq(!!H.getLog()['2026-10-29']?.['work-on-schedule'], true, '1:30 AM next night still counts as the same day, stays ticked');
save({ tasks: [task('x')], blocks: [{ id: 'school' }], plan: { items: [{ taskId: 'x', start: new Date(2026, 9, 30, 10).getTime(), end: new Date(2026, 9, 30, 11).getTime() }] } });
P.recheckPlanner(new Date(2026, 9, 30, 11));
save({ tasks: [task('x', 'done')], blocks: [{ id: 'school' }], plan: { items: [] } });
P.recheckPlanner(new Date(2026, 9, 30, 11, 30));
eq(!!H.getLog()['2026-10-30']?.['work-on-schedule'], false, 'all done by 11:30 AM: still waits for 3 PM');
P.recheckPlanner(new Date(2026, 9, 30, 15, 1));
eq(!!H.getLog()['2026-10-30']?.['work-on-schedule'], true, 'ticks at 3 PM');

// Backups never carry this phone's notification keys, and restore keeps them
save({ tasks: [], plan: null, push: { url: 'https://x', deviceId: 'd', secret: 's' } });
const b = B.buildBackup();
eq(b.data.imp_planner.push, null, 'backup strips notification keys');
B.restoreBackup(JSON.parse(JSON.stringify(b)));
eq(JSON.parse(mem.imp_planner).push?.deviceId, 'd', 'restore keeps this phone\'s notification setup');
eq(Object.keys(mem).every((k) => k.startsWith('imp_')), true, 'only imp_ keys');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;

// ---- Upgrade to schema 5 sets the 3 PM wait on the existing habit only ----
for (const k of Object.keys(mem)) delete mem[k];
mem.imp_schema = '4';
mem.imp_habits = JSON.stringify([{ id: 'work-on-schedule', auto: 'planner:work', name: 'Work (mine)' }, { id: 'journal', auto: 'journal:words' }]);
H.init();
eq(JSON.parse(mem.imp_habits).filter((h) => h.id !== 'proactive').map((h) => [h.id, h.autoAfter ?? null, h.name ?? null]), [['work-on-schedule', 900, 'Work (mine)'], ['journal', null, null]], 'upgrade: 3 PM on Work done on schedule only, edits kept');
