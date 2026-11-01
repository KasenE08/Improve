import { describe, expect, it } from 'vitest';
import { actions, emptyData, replan, refreshIfStale } from '../src/app/model';
import type { FixedBlock } from '../src/core/types';
import { BLOCKS, LOCATIONS, MON, TUE, WED, T, fmt, task } from './fixtures';

const NOW = T(MON, '15:00');
const HW: FixedBlock = { id: 'hw', title: 'Homework', tag: 'other', locationId: 'home', startMin: 16 * 60, endMin: 17 * 60, recurrence: { kind: 'daily' }, holdsWork: true };
const base = () => replan({ ...emptyData(), blocks: [...BLOCKS, HW], locations: LOCATIONS }, NOW);
const at = (d: ReturnType<typeof base>, id: string) => { const t = d.tasks.find((x) => x.id === id)!; return t.at == null ? null : fmt(t.at); };

describe('homework blocks', () => {
  it('assignments go into the next Homework block, soonest due first, back to back', () => {
    let d = actions.saveTask(base(), task({ id: 'late', estimateMin: 20, due: T(WED, '23:59') }), NOW);
    d = actions.saveTask(d, task({ id: 'soon', estimateMin: 30, due: T(TUE, '23:59') }), NOW);
    expect([at(d, 'soon'), at(d, 'late')]).toEqual([`${MON} 16:00`, `${MON} 16:30`]);
  });

  it('extras roll into the next block; nothing fits before it is due = warning', () => {
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 45, due: T(WED, '23:59') }), NOW);
    d = actions.saveTask(d, task({ id: 'b', estimateMin: 45, due: T(WED, '23:59') }), NOW);
    d = actions.saveTask(d, task({ id: 'c', estimateMin: 90, due: T(WED, '23:59') }), NOW);
    expect([at(d, 'a'), at(d, 'b'), at(d, 'c')]).toEqual([`${MON} 16:00`, `${TUE} 16:00`, null]);
    expect(d.plan!.warnings).toEqual([{ kind: 'unscheduled', taskId: 'c' }]);
  });

  it('unfinished work moves to the next block once a block ends; reorder sticks', () => {
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 30, due: T(WED, '23:59') }), NOW);
    d = actions.saveTask(d, task({ id: 'b', estimateMin: 30, due: T(WED, '23:00') }), NOW);
    expect([at(d, 'b'), at(d, 'a')]).toEqual([`${MON} 16:00`, `${MON} 16:30`]);
    d = actions.reorderWork(d, ['a', 'b'], NOW);
    expect([at(d, 'a'), at(d, 'b')]).toEqual([`${MON} 16:00`, `${MON} 16:30`]);
    d = refreshIfStale(d, T(MON, '17:30'));
    expect([at(d, 'a'), at(d, 'b')]).toEqual([`${TUE} 16:00`, `${TUE} 16:30`]);
  });
});
