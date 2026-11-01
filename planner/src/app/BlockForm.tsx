import { useState } from 'preact/hooks';
import type { FixedBlock, Recurrence } from '../core/types';
import { dateKey } from '../core/time';
import { actions, type AppData } from './model';
import { commit } from './store';
import { Chips, Field, SheetFrame, useUI } from './ui';
import { fmtDay, inputToMin, minToInput, uid, WEEKDAYS } from './format';

type Repeat = 'never' | 'daily' | 'weekly' | 'monthly';
const REPEATS: { v: Repeat; label: string }[] = [
  { v: 'never', label: 'Never' },
  { v: 'daily', label: 'Daily' },
  { v: 'weekly', label: 'Weekly' },
  { v: 'monthly', label: 'Monthly' },
];
const weekdayOf = (k: string) => new Date(`${k}T12:00`).getDay();

/** An event on the calendar (archery, work, a game). Repeating is chosen right here. */
export function BlockForm({ block, date }: { data: AppData; block?: FixedBlock; date?: string }) {
  const ui = useUI();
  const r = block?.recurrence;
  const firstDay = r?.kind === 'once' ? r.date : block?.startDate ?? date ?? dateKey(Date.now());
  const [title, setTitle] = useState(block?.title ?? '');
  const [day, setDay] = useState(firstDay);
  const [start, setStart] = useState(minToInput(block?.startMin ?? 18 * 60));
  const [end, setEnd] = useState(minToInput(block?.endMin ?? 19 * 60));
  const [repeat, setRepeat] = useState<Repeat>(
    !r || r.kind === 'once' ? 'never' : r.kind === 'daily' ? 'daily' : r.kind === 'weekly' ? 'weekly' : 'monthly',
  );
  const [weekdays, setWeekdays] = useState<number[]>(r?.kind === 'weekly' ? r.weekdays : [weekdayOf(firstDay)]);
  const [until, setUntil] = useState(block?.endDate ?? '');
  const [holdsWork, setHoldsWork] = useState(!!block?.holdsWork);
  const [error, setError] = useState('');

  const recurrence = (): Recurrence => {
    if (repeat === 'never') return { kind: 'once', date: day };
    if (repeat === 'daily') return { kind: 'daily' };
    if (repeat === 'weekly') return { kind: 'weekly', weekdays };
    return { kind: 'monthlyDate', day: Number(day.slice(8, 10)) };
  };

  const save = () => {
    if (!title.trim()) return setError('Give it a name.');
    if (repeat === 'weekly' && !weekdays.length) return setError('Pick at least one day.');
    const s = inputToMin(start);
    let e = inputToMin(end);
    if (e <= s) e += 24 * 60; // ends after midnight
    const next: FixedBlock = {
      ...(block ?? { tag: 'other', locationId: 'home' }),
      id: block?.id ?? uid(),
      title: title.trim(),
      startMin: s,
      endMin: e,
      recurrence: recurrence(),
      startDate: repeat === 'never' ? undefined : day,
      endDate: repeat !== 'never' && until ? until : undefined,
      skipDates: repeat === 'never' ? undefined : block?.skipDates,
      holdsWork: holdsWork || undefined,
    } as FixedBlock;
    commit((d, now) => actions.saveBlock(d, next, now));
    ui.close();
  };

  return (
    <SheetFrame title={block ? 'Edit event' : 'New event'} onSave={save}>
      <Field label="Name">
        <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="e.g. Archery" />
      </Field>
      <Field label={repeat === 'never' ? 'Day' : 'Starting'}>
        <input type="date" value={day} onInput={(e) => setDay(e.currentTarget.value)} />
      </Field>
      <div class="row2">
        <Field label="Starts">
          <input type="time" value={start} onInput={(e) => setStart(e.currentTarget.value)} />
        </Field>
        <Field label="Ends">
          <input type="time" value={end} onInput={(e) => setEnd(e.currentTarget.value)} />
        </Field>
      </div>
      <div class="field">
        <span class="field-label">Repeats</span>
        <div class="segmented" role="radiogroup">
          {REPEATS.map((o) => (
            <button type="button" role="radio" aria-checked={repeat === o.v} class={repeat === o.v ? 'on' : ''} onClick={() => setRepeat(o.v)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {repeat === 'weekly' && (
        <Chips
          options={WEEKDAYS.map((l, i) => ({ value: i, label: l }))}
          selected={weekdays}
          onToggle={(d) => setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort())}
        />
      )}
      {repeat === 'monthly' && <p class="hint">Every month on the {Number(day.slice(8, 10))}{['th', 'st', 'nd', 'rd'][Number(day.slice(8, 10)) % 10 < 4 && Math.floor(Number(day.slice(8, 10)) / 10) !== 1 ? Number(day.slice(8, 10)) % 10 : 0]}.</p>}
      {repeat !== 'never' && (
        <Field label="Until (optional)">
          <input type="date" value={until} onInput={(e) => setUntil(e.currentTarget.value)} />
        </Field>
      )}
      <label class="work-toggle">
        <input type="checkbox" checked={holdsWork} onChange={(e) => setHoldsWork(e.currentTarget.checked)} />
        <span><b>Holds assignments</b><small>A Homework block: assignments go inside it automatically</small></span>
      </label>
      {error && <p class="warn">{error}</p>}
      {block && (
        <div class="detail-more">
          {block.recurrence.kind !== 'once' && date && (
            <button
              class="btn"
              onClick={() => {
                commit((d, now) => actions.saveBlock(d, { ...block, skipDates: [...new Set([...(block.skipDates ?? []), date])].sort() }, now));
                ui.close();
              }}
            >
              Skip {fmtDay(date, { weekday: 'short', month: 'short', day: 'numeric' })}
            </button>
          )}
          <button
            class="btn danger"
            onClick={() => {
              if (!confirm(block.recurrence.kind === 'once' ? `Delete "${block.title}"?` : `Delete every "${block.title}"?`)) return;
              commit((d, now) => actions.deleteBlock(d, block.id, now));
              ui.close();
            }}
          >
            {block.recurrence.kind === 'once' ? 'Delete' : 'Delete all'}
          </button>
        </div>
      )}
    </SheetFrame>
  );
}
