import { describe, expect, it } from 'vitest';
import { actions, emptyData, normalize, replan } from '../src/app/model';
import { occurrencesOn } from '../src/core/availability';
import { BLOCKS, LOCATIONS, MON, TUE, WED, T, fmt, task, PACKED } from './fixtures';

const NOW = T(MON, '15:00');
const base = () => replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS, settings: PACKED }, NOW);

describe('classes', () => {
  it('are saved, tag assignments, and deleting one just removes the tag', () => {
    let d = actions.saveClass(base(), { id: 'macro', name: 'AP Macro', color: '#3b82f6', format: 'online' });
    d = actions.saveTask(d, task({ id: 'a', estimateMin: 45, classId: 'macro' }), NOW);
    expect(d.classes.map((c) => c.name)).toEqual(['AP Macro']);
    d = actions.saveClass(d, { id: 'macro', name: 'AP Macroeconomics', color: '#16a34a', format: 'online' });
    expect(d.classes).toHaveLength(1);
    expect(d.classes[0].name).toBe('AP Macroeconomics');
    d = actions.deleteClass(d, 'macro');
    expect(d.classes).toEqual([]);
    expect(d.tasks.find((t) => t.id === 'a')!.classId).toBeUndefined();
  });

  it('older saves load with no classes', () => {
    const d = normalize({ tasks: [] } as never);
    expect([d.classes, d.behindDays, d.dragAt]).toEqual([[], [], null]);
  });
});

describe('for "Finished today\'s work"', () => {
  it('Falling behind remembers the day', () => {
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 45, due: T(TUE, '23:59') }), NOW);
    d = actions.fallingBehind(d, NOW);
    expect(d.behindDays).toEqual([MON]);
  });

  it('dragging remembers when, so the new time counts', () => {
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 45, due: T(WED, '23:59') }), NOW);
    expect(d.dragAt).toBeNull();
    d = actions.moveToDay(d, 'a', TUE, NOW + 1000);
    expect(d.dragAt).toBe(NOW + 1000);
    d = actions.reorderDay(d, TUE, ['a'], NOW + 2000);
    expect(d.dragAt).toBe(NOW + 2000);
  });
});

describe('place to place', () => {
  // Wednesday: School 9:00–2:47, Archery 6:00–7:00 at the range (30 min from home, 15 back)
  it('from home by default', () => {
    const arch = occurrencesOn(WED, BLOCKS, LOCATIONS).find((o) => o.block.id === 'archery')!;
    expect([fmt(arch.leave), fmt(arch.arrive)]).toEqual([`${WED} 17:30`, `${WED} 19:15`]);
  });

  it('coming straight from school: leaves school for the range, no time at home in between', () => {
    const blocks = BLOCKS.map((b) => (b.id === 'archery' ? { ...b, fromLocationId: 'school', startMin: 15 * 60 } : b));
    const locs = LOCATIONS.map((l) => (l.id === 'range' ? { ...l, travelFrom: { school: 20 } } : l));
    const occ = occurrencesOn(WED, blocks, locs);
    const school = occ.find((o) => o.block.id === 'school')!;
    const arch = occ.find((o) => o.block.id === 'archery')!;
    expect(fmt(arch.leave)).toBe(`${WED} 14:47`); // straight from school (it ends 2:47, archery at 3:00 is 20 min away)
    expect(fmt(school.arrive)).toBe(`${WED} 14:47`); // not home in between
    expect([arch.fromTitle, school.toTitle]).toEqual(['School', 'Archery']);
  });

  it('with time to spare, leaves when the travel time says (and the wait is still away from home)', () => {
    const blocks = BLOCKS.map((b) => (b.id === 'archery' ? { ...b, fromLocationId: 'school' } : b));
    const locs = LOCATIONS.map((l) => (l.id === 'range' ? { ...l, travelFrom: { school: 20 } } : l));
    const occ = occurrencesOn(WED, blocks, locs);
    expect(fmt(occ.find((o) => o.block.id === 'archery')!.leave)).toBe(`${WED} 17:40`);
    expect(fmt(occ.find((o) => o.block.id === 'school')!.arrive)).toBe(`${WED} 17:40`);
  });

  it('nothing is scheduled at home while you are out between the two', () => {
    const blocks = BLOCKS.map((b) => (b.id === 'archery' ? { ...b, fromLocationId: 'school' } : b));
    let d = replan({ ...emptyData(), blocks, locations: LOCATIONS, settings: PACKED }, T(WED, '8:00'));
    d = actions.setTravel(d, 'school', 'range', 20, T(WED, '8:00'));
    d = actions.saveTask(d, task({ id: 'x', estimateMin: 45, due: T(WED, '23:59') }), T(WED, '8:00'));
    const start = d.plan!.items.find((i) => i.taskId === 'x')!.start;
    expect(start >= T(WED, '19:00')).toBe(true);
  });

  it('places can be added from an event form', () => {
    const d = actions.savePlace(base(), { id: 'pool', name: 'Pool', fromHomeMin: 10, toHomeMin: 10 }, NOW);
    expect(d.locations.some((l) => l.name === 'Pool')).toBe(true);
  });
});
