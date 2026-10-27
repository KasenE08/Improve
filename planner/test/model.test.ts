import { describe, expect, it } from 'vitest';
import { actions, emptyData, endOfDayMin, exportBackup, nightWindow, normalize, parseBackup, refreshIfStale, replan } from '../src/app/model';
import { BLOCKS, LOCATIONS, MON, TUE, T, task, PACKED } from './fixtures';

const base = () => replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS, settings: PACKED }, T(MON, '15:00'));
const startOf = (d: ReturnType<typeof base>, id: string) => d.plan!.items.find((i) => i.taskId === id)?.start;

describe('app model', () => {
  it('adding a task reschedules everything around it', () => {
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 45, due: T(TUE, '23:59') }), T(MON, '15:00'));
    expect(startOf(d, 'a')).toBe(T(MON, '17:45'));
    d = actions.saveTask(d, task({ id: 'b', estimateMin: 45, due: T(MON, '23:00') }), T(MON, '15:01'));
    expect(startOf(d, 'b')).toBe(T(MON, '17:45'));
    expect(startOf(d, 'a')).toBe(T(MON, '19:00'));
  });

  it('finishing early leaves the rest of the plan where it was', () => {
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 45 }), T(MON, '15:00'));
    d = actions.saveTask(d, task({ id: 'b', estimateMin: 45 }), T(MON, '15:00'));
    d = actions.startTask(d, 'a', T(MON, '17:45'));
    d = actions.completeTask(d, 'a', T(MON, '18:00'));
    expect(startOf(d, 'b')).toBe(T(MON, '19:00'));
    expect(d.tasks.find((t) => t.id === 'a')).toMatchObject({ status: 'done', startedAt: T(MON, '17:45'), completedAt: T(MON, '18:00') });
  });

  it('notes never move anything', () => {
    const d = actions.saveTask(base(), task({ id: 'a', estimateMin: 45 }), T(MON, '15:00'));
    const n = actions.setNotes(d, 'a', 'bring calculator');
    expect(n.plan).toBe(d.plan);
    expect(n.tasks[0].notes).toBe('bring calculator');
  });

  it('the arrival time input reschedules schoolwork to an hour after arriving', () => {
    const THU = '2026-10-15';
    let d = actions.saveTask(base(), task({ id: 'a', estimateMin: 30 }), T(THU, '15:00'));
    expect(startOf(d, 'a')).toBe(T(THU, '16:05'));
    d = actions.setArrival(d, THU, 15 * 60 + 40, T(THU, '15:41'));
    expect(startOf(d, 'a')).toBe(T(THU, '16:40'));
  });

  it('replans automatically on a new day', () => {
    const d = base();
    expect(refreshIfStale(d, T(MON, '20:00'))).toBe(d);
    expect(refreshIfStale(d, T(TUE, '07:00')).plan!.at).toBe(T(TUE, '07:00'));
  });

  it('backup round-trips and rejects other files', () => {
    const d = actions.saveTask(base(), task({ id: 'a', estimateMin: 30, notes: 'x' }), T(MON, '15:00'));
    const back = parseBackup(exportBackup(d, T(MON, '15:00')), T(MON, '15:00'));
    expect(back.tasks).toEqual(d.tasks);
    expect(back.blocks).toEqual(d.blocks);
    expect(() => parseBackup('not json', 0)).toThrow(/not valid JSON/);
    expect(() => parseBackup('{"app":"other","data":{}}', 0)).toThrow(/not a Schedule Planner backup/);
    expect(() => parseBackup('{"app":"schedule-app-planner","data":{"tasks":5}}', 0)).toThrow(/damaged/);
  });

  it('older saves get missing settings and Home filled in', () => {
    const d = normalize({ settings: { breakMin: 25 } as never, locations: [] });
    expect(d.settings.breakMin).toBe(25);
    expect(d.settings.dayEndMin).toBe(1440);
    expect(d.locations[0].id).toBe('home');
  });

  it('"No work after" past midnight (2am) means the next morning, not before the day starts', () => {
    // The bug: 2:00 AM was saved as 120 (2 AM the same morning) → no free time at all → every task overloaded.
    expect(endOfDayMin(120, 7 * 60)).toBe(26 * 60);
    expect(endOfDayMin(0, 7 * 60)).toBe(24 * 60);
    expect(endOfDayMin(23 * 60, 7 * 60)).toBe(23 * 60);
    const healed = normalize({ settings: { dayEndMin: 120, earliestStartMin: 7 * 60 } as never });
    expect(healed.settings.dayEndMin).toBe(26 * 60);
    let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS, settings: { ...PACKED, dayEndMin: endOfDayMin(120, PACKED.earliestStartMin) } }, T(MON, '15:00'));
    d = actions.saveTask(d, task({ id: 'a', estimateMin: 45, due: T(TUE, '23:59') }), T(MON, '15:00'));
    expect(d.plan!.warnings).toEqual([]);
    expect(startOf(d, 'a')).toBeDefined();
  });

  it('falling-behind window is empty, not backwards, when the day already ends after it', () => {
    const d = { ...emptyData(), settings: { ...emptyData().settings, dayEndMin: 26 * 60, latestNightMin: 60 } };
    const w = nightWindow(d, T(MON, '22:00'));
    expect(w.end).toBeGreaterThanOrEqual(w.start);
  });
});
