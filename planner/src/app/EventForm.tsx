import { useState } from 'preact/hooks';
import type { FixedBlock, Recurrence } from '../core/types';
import { actions } from './model';
import { commit } from './store';
import { Chips, Field, SheetFrame, useUI } from './ui';
import { inputToMin, minToInput, uid, WEEKDAYS } from './format';
import { COLORS, DEFAULT_COLOR } from './colors';

type Repeat = 'never' | 'daily' | 'weekly' | 'monthly';
const REPEATS: [Repeat, string][] = [['never', 'Never'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];
const REMINDERS: [number | null, string][] = [[null, 'None'], [0, 'At start'], [5, '5 min'], [10, '10 min'], [30, '30 min']];
const weekdayOf = (k: string) => new Date(`${k}T12:00`).getDay();

/** New event (from tapping the timeline) or editing one. Times go minute by minute. */
export function EventForm({ block, date, startMin }: { block?: FixedBlock; date: string; startMin?: number }) {
  const ui = useUI();
  const r = block?.recurrence;
  const firstDay = r?.kind === 'once' ? r.date : block?.startDate ?? date;
  const s0 = block?.startMin ?? startMin ?? 17 * 60;
  const [title, setTitle] = useState(block?.title ?? '');
  const [day, setDay] = useState(firstDay);
  const [start, setStart] = useState(minToInput(s0 % (24 * 60)));
  const [end, setEnd] = useState(minToInput((block?.endMin ?? s0 + 60) % (24 * 60)));
  const [color, setColor] = useState(block?.color ?? DEFAULT_COLOR);
  const [notes, setNotes] = useState(block?.notes ?? '');
  const [repeat, setRepeat] = useState<Repeat>(!r || r.kind === 'once' ? 'never' : r.kind === 'daily' ? 'daily' : r.kind === 'weekly' ? 'weekly' : 'monthly');
  const [weekdays, setWeekdays] = useState<number[]>(r?.kind === 'weekly' ? r.weekdays : [weekdayOf(firstDay)]);
  const [remind, setRemind] = useState<number | null>(block ? (block.remindMin === undefined ? 5 : block.remindMin) : 5);
  const [error, setError] = useState('');

  const recurrence = (): Recurrence =>
    repeat === 'never' ? { kind: 'once', date: day }
      : repeat === 'daily' ? { kind: 'daily' }
      : repeat === 'weekly' ? { kind: 'weekly', weekdays }
      : { kind: 'monthlyDate', day: Number(day.slice(8, 10)) };

  const save = () => {
    if (!title.trim()) return setError('Give it a name.');
    if (repeat === 'weekly' && !weekdays.length) return setError('Pick at least one day.');
    // A late-night event (after midnight, tapped on this day's 4 AM–4 AM view) stays on this day's night
    let s = inputToMin(start);
    const lateNight = block ? block.startMin >= 24 * 60 : (startMin ?? 0) >= 24 * 60;
    if (s < 4 * 60 && lateNight) s += 24 * 60;
    let e = inputToMin(end);
    while (e <= s) e += 24 * 60;
    const next: FixedBlock = {
      ...(block ?? { tag: 'other', locationId: 'home' }),
      id: block?.id ?? uid(),
      title: title.trim(),
      startMin: s,
      endMin: e,
      recurrence: recurrence(),
      startDate: repeat === 'never' ? undefined : day,
      skipDates: repeat === 'never' ? undefined : block?.skipDates,
      color,
      notes: notes.trim() || undefined,
      remindMin: remind,
    } as FixedBlock;
    commit((d, now) => actions.saveBlock(d, next, now));
    ui.close();
  };

  return (
    <SheetFrame title={block ? 'Edit event' : 'New event'} onSave={save}>
      <Field label="Name">
        <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="e.g. Homework" autoFocus={!block} />
      </Field>
      <Field label={repeat === 'never' ? 'Day' : 'Starting'}>
        <input type="date" value={day} onInput={(e) => setDay(e.currentTarget.value)} />
      </Field>
      <div class="row2">
        <Field label="Starts">
          <input type="time" step={60} value={start} onInput={(e) => setStart(e.currentTarget.value)} />
        </Field>
        <Field label="Ends">
          <input type="time" step={60} value={end} onInput={(e) => setEnd(e.currentTarget.value)} />
        </Field>
      </div>
      <div class="field">
        <span class="field-label">Color</span>
        <div class="ev-colors" role="radiogroup">
          {COLORS.map((c) => (
            <button type="button" role="radio" aria-checked={color === c.id} aria-label={c.name} class={`ev-swatch ${color === c.id ? 'on' : ''}`} style={{ background: c.hex }} onClick={() => setColor(c.id)} />
          ))}
        </div>
      </div>
      <div class="field">
        <span class="field-label">Repeat</span>
        <div class="segmented" role="radiogroup">
          {REPEATS.map(([v, label]) => (
            <button type="button" role="radio" aria-checked={repeat === v} class={repeat === v ? 'on' : ''} onClick={() => setRepeat(v)}>{label}</button>
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
      <div class="field">
        <span class="field-label">Reminder</span>
        <div class="segmented" role="radiogroup">
          {REMINDERS.map(([v, label]) => (
            <button type="button" role="radio" aria-checked={remind === v} class={remind === v ? 'on' : ''} onClick={() => setRemind(v)}>{label}</button>
          ))}
        </div>
      </div>
      <Field label="Notes (optional)">
        <textarea rows={3} value={notes} onInput={(e) => setNotes(e.currentTarget.value)} placeholder="Anything to remember" />
      </Field>
      {error && <p class="warn">{error}</p>}
    </SheetFrame>
  );
}
