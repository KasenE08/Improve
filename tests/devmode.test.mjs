// Run: node tests/devmode.test.mjs  (the dev preview keeps its own copy and never writes the real data)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
globalThis.location = { pathname: '/Improve/dev/' };
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, a, b); } else console.log('ok', m); };

// The real app's data, plus another app's key on the same site
mem.imp_log = JSON.stringify({ '2026-10-30': { a: { n: 1 } } });
mem.imp_planner = JSON.stringify({ tasks: [1], push: { deviceId: 'phone' } });
mem['calorie-tracker.v1'] = 'other app';
const realBefore = JSON.stringify(mem);

const J = (p) => new URL('../js/' + p, import.meta.url).href;
const store = await import(J('store.js'));
const B = await import(J('backup.js'));

eq(JSON.parse(mem.imp_dev_log), { '2026-10-30': { a: { n: 1 } } }, 'first open copies the real data in');
eq(JSON.parse(mem.imp_dev_planner).push, null, 'notification keys are not copied');
eq(store.get('log')['2026-10-30'].a.n, 1, 'reads come from the copy');
store.set('log', {});
store.set('newthing', 1);
eq([mem.imp_log, mem.imp_newthing, mem.imp_dev_newthing], [JSON.parse(realBefore).imp_log, undefined, '1'], 'writes go to the copy only');
eq(Object.keys(B.buildBackup().data).sort(), ['imp_log', 'imp_newthing', 'imp_planner'], 'backups use the real names');
B.restoreBackup({ data: { imp_habits: [], imp_log: { x: 1 } } });
eq([JSON.parse(mem.imp_dev_log), mem.imp_log, mem['calorie-tracker.v1']], [{ x: 1 }, JSON.parse(realBefore).imp_log, 'other app'], 'restoring in dev only replaces the copy');
eq(mem.imp_planner, JSON.parse(realBefore).imp_planner, 'real planner untouched');

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('all passed');
