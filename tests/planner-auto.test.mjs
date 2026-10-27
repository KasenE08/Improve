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
eq([done(), H.isExcused('work-on-schedule', '2026-10-26')], [false, true], 'set up, nothing planned today: day off (no tick, no XP)');

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
eq(H.getLog()['2026-10-26']['work-on-schedule'].xp, 60, 'earns the habit XP');

save({ tasks: [task('a', 'done')], plan: { items: [] } });
P.recheckPlanner(new Date(2026, 9, 27, 16));
eq([!!H.getLog()['2026-10-27']?.['work-on-schedule'], H.isExcused('work-on-schedule', '2026-10-27')], [false, true], 'next day starts fresh (nothing planned = day off)');
eq(H.isExcused('work-on-schedule', '2026-10-26'), false, 'a day with tasks is no longer a day off');
eq(done(), true, 'yesterday keeps its result');

// Deleted tasks drop off the list
save({ tasks: [task('c')], plan: { items: [{ taskId: 'c', start: new Date(2026, 9, 28, 15).getTime(), end: new Date(2026, 9, 28, 16).getTime() }] } });
P.recheckPlanner(new Date(2026, 9, 28, 16));
save({ tasks: [], blocks: [{ id: 'school' }], plan: { items: [] } });
P.recheckPlanner(new Date(2026, 9, 28, 16, 30));
eq([!!H.getLog()['2026-10-28']?.['work-on-schedule'], H.isExcused('work-on-schedule', '2026-10-28')], [false, true], 'deleted task drops off; nothing left = day off');

// ---- Waits until 3 PM ----
eq(H.getHabits().find((h) => h.id === 'work-on-schedule').autoAfter, 900, 'Work done on schedule waits until 3 PM');
save({ tasks: [], blocks: [{ id: 'school' }], plan: { items: [] } });
P.recheckPlanner(new Date(2026, 9, 29, 14, 59));
eq(!!H.getLog()['2026-10-29']?.['work-on-schedule'], false, 'empty day, 2:59 PM: no tick');
P.recheckPlanner(new Date(2026, 9, 29, 15, 0));
eq([!!H.getLog()['2026-10-29']?.['work-on-schedule'], H.isExcused('work-on-schedule', '2026-10-29')], [false, true], 'empty day, 3 PM: still no XP, day off');
{ // a planned day that's finished, at 1:30 AM the next night, still counts for that day
  save({ tasks: [task('n')], blocks: [{ id: 'school' }], plan: { items: [{ taskId: 'n', start: new Date(2026, 9, 29, 20).getTime(), end: new Date(2026, 9, 29, 21).getTime() }] } });
  P.recheckPlanner(new Date(2026, 9, 29, 20));
  save({ tasks: [task('n', 'done')], blocks: [{ id: 'school' }], plan: { items: [] } });
  P.recheckPlanner(new Date(2026, 9, 30, 1, 30));
  eq([!!H.getLog()['2026-10-29']?.['work-on-schedule'], H.isExcused('work-on-schedule', '2026-10-29')], [true, false], '1:30 AM next night: same day, ticks; no longer a day off');
}
save({ tasks: [task('x')], blocks: [{ id: 'school' }], plan: { items: [{ taskId: 'x', start: new Date(2026, 9, 30, 10).getTime(), end: new Date(2026, 9, 30, 11).getTime() }] } });
P.recheckPlanner(new Date(2026, 9, 30, 11));
save({ tasks: [task('x', 'done')], blocks: [{ id: 'school' }], plan: { items: [] } });
P.recheckPlanner(new Date(2026, 9, 30, 11, 30));
eq(!!H.getLog()['2026-10-30']?.['work-on-schedule'], false, 'all done by 11:30 AM: still waits for 3 PM');
P.recheckPlanner(new Date(2026, 9, 30, 15, 1));
eq(!!H.getLog()['2026-10-30']?.['work-on-schedule'], true, 'ticks at 3 PM');

// ---- Days off don't break the streak or block Perfect Day ----
{
  const R = await import(J('rewards.js'));
  const work = H.getHabits().find((h) => h.id === 'work-on-schedule');
  mem.imp_log = '{}'; mem.imp_excused = '{}'; mem.imp_bonus = '{}';
  const at = (d) => new Date(2026, 10, d, 16);
  H.setDone(work, '2026-11-02', true, at(2)); H.setDone(work, '2026-11-03', true, at(3));
  H.setExcused(work, '2026-11-04', true);
  H.setDone(work, '2026-11-05', true, at(5));
  eq(R.streak(work, at(5)).count, 3, 'streak skips the day off (Mon, Tue, [Wed off], Thu = 3)');
  eq(R.streak(work, at(6)), { count: 3, current: false }, 'still alive the next day before it\'s done');
  const others = H.getHabits().filter((h) => h.frequency === 'daily' && h.id !== 'work-on-schedule');
  H.setExcused(work, '2026-11-07', true);
  for (const h of others) for (let i = 0; i < h.target; i++) H.step(h, 1, at(7));
  eq(R.sync(at(7)).some((b) => b.type === 'perfect'), true, 'Perfect Day with Work as a day off');
  const S = await import(J('stats.js'));
  eq(S.today(at(7)).earned >= S.today(at(7)).max, true, 'today meter full without the day-off habit');
}

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

// A task finished today counts as a work day even if it was never on today's plan
{
  mem.imp_planner_day = 'null';
  const t1 = new Date(2026, 10, 10, 9).getTime();
  save({ tasks: [{ ...task('early', 'done'), completedAt: t1 }], blocks: [{ id: 'school' }], plan: { items: [] } });
  P.recheckPlanner(new Date(2026, 10, 10, 15, 30));
  eq([!!H.getLog()['2026-11-10']?.['work-on-schedule'], H.isExcused('work-on-schedule', '2026-11-10')], [true, false], 'finished a task today (unplanned): ticks, not a day off');
}

// Work planned after midnight (12–2am) belongs to the night before, like the rest of the app
{
  mem.imp_planner_day = 'null';
  const tue = (h, m = 0) => new Date(2026, 10, 10, h, m).getTime();
  const wed = (h, m = 0) => new Date(2026, 10, 11, h, m).getTime();
  save({ tasks: [task('eve'), task('late')], blocks: [{ id: 'school' }], plan: { items: [{ taskId: 'eve', start: tue(21), end: tue(22) }, { taskId: 'late', start: wed(0, 30), end: wed(1, 10) }] } });
  P.recheckPlanner(new Date(2026, 10, 10, 21, 30));
  eq(JSON.parse(mem.imp_planner_day).ids, ['eve', 'late'], '12:30am task counts as Tuesday night');
  save({ tasks: [task('eve', 'done'), task('late')], blocks: [{ id: 'school' }], plan: { items: [{ taskId: 'late', start: wed(0, 30), end: wed(1, 10) }] } });
  P.recheckPlanner(new Date(2026, 10, 10, 23, 0));
  eq(!!H.getLog()['2026-11-10']?.['work-on-schedule'], false, '11 PM: 12:30am task still to do → not ticked');
  save({ tasks: [task('eve', 'done'), task('late', 'done')], blocks: [{ id: 'school' }], plan: { items: [] } });
  P.recheckPlanner(new Date(2026, 10, 11, 1, 15));
  eq(!!H.getLog()['2026-11-10']?.['work-on-schedule'], true, 'finished at 1:15am → Tuesday ticks');
}
