// Run: node tests/journal.test.mjs  (word counts, day sections, "Journal" auto-check, upgrade)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
const S = await import(J('journal/store.js'));
const A = await import(J('journal/autocheck.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); } else console.log('ok', m); };
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

eq(S.wordCount(''), 0, 'empty = 0 words');
eq(S.wordCount('   \n  '), 0, 'whitespace = 0 words');
eq(S.wordCount('Hit the gym.\nFelt good,  ate well'), 7, 'counts across lines and double spaces');

H.init();
eq(H.getHabits().find((h) => h.id === 'journal').auto, 'journal:words', 'fresh install: Journal is auto');
const sat = new Date(2026, 9, 24, 21);
const done = (k) => !!H.getLog()[k]?.journal;

S.setDay('2026-10-24', words(24));
A.recheckJournal(sat);
eq(done('2026-10-24'), false, '24 words: not yet');
S.setDay('2026-10-24', words(25));
A.recheckJournal(sat);
eq(done('2026-10-24'), true, '25 words: ticked');
eq(H.getLog()['2026-10-24'].journal.xp, 10, 'earns the habit XP');
S.setDay('2026-10-24', words(3));
A.recheckJournal(sat);
eq(done('2026-10-24'), false, 'deleting back under the goal unticks');

S.setMinWords(3);
A.recheckJournal(sat);
eq(done('2026-10-24'), true, 'custom goal of 3 words');
S.setMinWords(25);

// Only today's section counts
S.setDay('2026-10-23', words(100));
A.recheckJournal(sat);
eq(done('2026-10-23'), false, 'editing a past day does not tick that day');
eq(done('2026-10-24'), false, 'and does not count toward today');

// A new day is a new, empty section
const sun = new Date(2026, 9, 25, 9);
eq(S.getDay('2026-10-25'), '', 'new day starts empty');
eq(Object.keys(S.getJournal().days).sort(), ['2026-10-23', '2026-10-24'], 'past sections kept');
S.setDay('2026-10-25', '   ');
eq('2026-10-25' in S.getJournal().days, false, 'blank sections are not stored');
A.recheckJournal(sun);
eq(done('2026-10-25'), false, 'nothing written today');
eq(Object.keys(mem).every((k) => k.startsWith('imp_')), true, 'only imp_ keys');

// Upgrade from schema 3 keeps the habit, makes it auto
for (const k of Object.keys(mem)) delete mem[k];
mem.imp_schema = '3';
mem.imp_habits = JSON.stringify([{ id: 'journal', name: 'Journal (night)', auto: null, xp: 15 }, { id: 'kept-word', auto: null }]);
H.init();
eq(JSON.parse(mem.imp_habits).filter((h) => h.id !== 'proactive').map((h) => [h.id, h.auto, h.xp ?? null]), [['journal', 'journal:words', 15], ['kept-word', null, null]], 'upgrade makes Journal auto, keeps edits');

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
