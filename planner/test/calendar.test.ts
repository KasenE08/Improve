import { describe, expect, it } from 'vitest';
import { actions, emptyData, normalize, replan } from '../src/app/model';
import { BLOCKS, LOCATIONS, MON, TUE, WED, T, fmt, task } from './fixtures';

const NOW = T(MON, '15:00');
const base = () => replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, NOW);
const item = (d: ReturnType<typeof base>, id: string) => d.plan!.items.find((i) => i.taskId === id)!;

describe('calendar style', () => {
  it('an assignment sits exactly where you put it, for its length; nothing moves it', () => {
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 45, at: T(MON, '16:10'), due: T(TUE, '23:59') }), NOW);
    d = actions.saveTask(d, task({ id: 'b', estimateMin: 30, at: T(MON, '16:10') }), NOW); // same time: both stay
    expect([fmt(item(d, 'a').start), fmt(item(d, 'a').end), fmt(item(d, 'b').start)]).toEqual([`${MON} 16:10`, `${MON} 16:55`, `${MON} 16:10`]);
  });

  it('ending after it is due is flagged (until it is done)', () => {
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 60, at: T(MON, '22:30'), due: T(MON, '23:00') }), NOW);
    expect(item(d, 'a').late).toBe(true);
    d = actions.completeTask(d, 'a', NOW);
    expect(item(d, 'a').late).toBe(false);
  });

  it('dragging moves it to the new time or day', () => {
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 30, at: T(MON, '16:00') }), NOW);
    d = actions.moveTask(d, 'a', T(TUE, '19:15'), NOW);
    expect(fmt(item(d, 'a').start)).toBe(`${TUE} 19:15`);
  });

  it('one-time events can be dragged too; repeating ones stay', () => {
    let d = actions.saveBlock(base(), { id: 'game', title: 'Game', tag: 'other', locationId: 'home', startMin: 18 * 60, endMin: 20 * 60, recurrence: { kind: 'once', date: TUE } }, NOW);
    d = actions.moveEvent(d, 'game', WED, 17 * 60 + 30, NOW);
    const g = d.blocks.find((b) => b.id === 'game')!;
    expect([g.recurrence, g.startMin, g.endMin]).toEqual([{ kind: 'once', date: WED }, 17 * 60 + 30, 19 * 60 + 30]);
    const gym = d.blocks.find((b) => b.id === 'gym')!;
    expect(actions.moveEvent(d, 'gym', WED, 6 * 60, NOW).blocks.find((b) => b.id === 'gym')).toEqual(gym);
  });

  it('the next two weeks of events are listed for Home and reminders', () => {
    const ev = base().plan!.events!;
    expect(ev.some((e) => e.title === 'Gym' && fmt(e.start) === `${MON} 20:00`)).toBe(true);
    expect(ev.some((e) => e.title === 'Archery' && fmt(e.start) === `${WED} 18:00`)).toBe(true);
  });

});
