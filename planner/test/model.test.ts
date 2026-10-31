import { describe, expect, it } from 'vitest';
import { actions, emptyData, endOfDayMin, exportBackup, nightWindow, normalize, parseBackup, refreshIfStale, replan } from '../src/app/model';
import { BLOCKS, LOCATIONS, MON, TUE, T, task, PACKED } from './fixtures';

const base = () => replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS, settings: PACKED }, T(MON, '15:00'));
const startOf = (d: ReturnType<typeof base>, id: string) => d.plan!.items.find((i) => i.taskId === id)?.start;

describe('app model', () => {

  it('notes never move anything', () => {
    const d = actions.saveTask(base(), task({ id: 'a', estimateMin: 45 }), T(MON, '15:00'));
    const n = actions.setNotes(d, 'a', 'bring calculator');
    expect(n.plan).toBe(d.plan);
    expect(n.tasks[0].notes).toBe('bring calculator');
  });

  it('replans automatically on a new day', () => {
    const d = base();
    expect(refreshIfStale(d, T(MON, '20:00'))).toBe(d);
    expect(refreshIfStale(d, T(TUE, '07:00')).plan!.at).toBe(T(TUE, '07:00'));
  });

  it('backup round-trips and rejects other files', () => {
    const d = actions.saveTask(base(), task({ id: 'a', estimateMin: 30, notes: 'x', at: T(TUE, '16:00') }), T(MON, '15:00'));
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

  it('falling-behind window is empty, not backwards, when the day already ends after it', () => {
    const d = { ...emptyData(), settings: { ...emptyData().settings, dayEndMin: 26 * 60, latestNightMin: 60 } };
    const w = nightWindow(d, T(MON, '22:00'));
    expect(w.end).toBeGreaterThanOrEqual(w.start);
  });
});
