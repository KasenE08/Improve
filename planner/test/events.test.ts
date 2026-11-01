import { describe, expect, it } from 'vitest';
import { actions, emptyData, normalize, replan } from '../src/app/model';
import { notifications } from '../src/app/notify';
import type { FixedBlock } from '../src/core/types';
import { LOCATIONS, MON, TUE, T, fmt, task } from './fixtures';

const NOW = T(MON, '15:00');
const GYM: FixedBlock = { id: 'gym', title: 'Gym', tag: 'gym', locationId: 'home', startMin: 17 * 60, endMin: 18 * 60, recurrence: { kind: 'daily' } };
const base = () => replan({ ...emptyData(), blocks: [GYM], locations: LOCATIONS }, NOW);
const gymOn = (d: ReturnType<typeof base>, k: string) => d.plan!.events!.filter((e) => e.title === 'Gym' && fmt(e.start).startsWith(k)).map((e) => fmt(e.start));

describe('plain calendar (version 2)', () => {
  it('old saves: assignments become one-time events at their time, events get a color', () => {
    const d = normalize({ blocks: [GYM], tasks: [task({ id: 'a', title: 'Essay', estimateMin: 45, at: T(TUE, '16:00'), notes: 'MLA' })] });
    expect(d.version).toBe(2);
    expect(d.tasks).toEqual([]);
    const e = d.blocks.find((b) => b.title === 'Essay')!;
    expect([e.recurrence, e.startMin, e.endMin, e.notes]).toEqual([{ kind: 'once', date: TUE }, 16 * 60, 16 * 60 + 45, 'MLA']);
    expect(d.blocks.find((b) => b.id === 'gym')!.color).toBe('green');
  });

  it('moving a repeating event: just this one, or all of them', () => {
    const one = actions.moveOccurrence(base(), 'gym', TUE, 60, 'one', NOW);
    expect([gymOn(one, MON), gymOn(one, TUE)]).toEqual([[`${MON} 17:00`], [`${TUE} 18:00`]]);
    const all = actions.moveOccurrence(base(), 'gym', TUE, -1, 'all', NOW);
    expect([gymOn(all, MON), gymOn(all, TUE)]).toEqual([[`${MON} 16:59`], [`${TUE} 16:59`]]);
  });

  it('deleting a repeating event: just this one, or all of them', () => {
    const one = actions.deleteOccurrence(base(), 'gym', TUE, 'one', NOW);
    expect([gymOn(one, MON).length, gymOn(one, TUE).length]).toEqual([1, 0]);
    expect(actions.deleteOccurrence(base(), 'gym', TUE, 'all', NOW).blocks).toEqual([]);
  });

  it('reminders: 5 minutes by default, each event can change it or turn it off', () => {
    const at = (b: Partial<FixedBlock>) => notifications(replan({ ...emptyData(), blocks: [{ ...GYM, ...b }], locations: LOCATIONS }, NOW), NOW).filter((n) => fmt(n.at).startsWith(MON)).map((n) => [fmt(n.at), n.body]);
    expect(at({})).toEqual([[`${MON} 16:55`, 'In 5 min · 5:00pm–6:00pm']]);
    expect(at({ remindMin: 30 })[0][0]).toBe(`${MON} 16:30`);
    expect(at({ remindMin: 0 })[0][1]).toMatch(/^Starting now/);
    expect(at({ remindMin: null })).toEqual([]);
  });
});
