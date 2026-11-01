import { useState } from 'preact/hooks';
import type { Task } from '../core/types';
import { at, dateKey } from '../core/time';
import { actions, type AppData } from './model';
import { commit } from './store';
import { Field, SheetFrame, useUI } from './ui';
import { inputToMin, minToInput, uid } from './format';
import { ClassPicker } from './ClassPicker';

const LENGTHS = [15, 30, 45, 60, 90, 120];

/** An assignment goes on the calendar at the time you pick, like an event, with a class, due date and notes. */
export function TaskForm({ data, task }: { data: AppData; task?: Task }) {
  const ui = useUI();
  const now = Date.now();
  const start = task?.at ?? Math.ceil(now / (30 * 60_000)) * 30 * 60_000;
  const due = task?.due ? new Date(task.due) : null;
  const [title, setTitle] = useState(task?.title ?? '');
  const [classId, setClassId] = useState<string | undefined>(task?.classId);
  const [day, setDay] = useState(dateKey(start));
  const [time, setTime] = useState(minToInput(Math.round((start - at(dateKey(start), 0)) / 60_000)));
  const [length, setLength] = useState(task?.estimateMin ?? 30);
  const [dueDate, setDueDate] = useState(due ? dateKey(due) : '');
  const [dueTime, setDueTime] = useState(due ? due.toTimeString().slice(0, 5) : '23:59');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [error, setError] = useState('');
  const auto = data.blocks.some((b) => b.holdsWork); // Homework blocks place assignments themselves

  const save = () => {
    if (!title.trim()) return setError('Give it a name.');
    if (!auto && (!day || !time)) return setError('Pick when you’ll do it.');
    if (!(length > 0)) return setError('How long will it take?');
    const cls = data.classes.find((c) => c.id === classId);
    const next: Task = {
      ...(task ?? { type: 'other', missing: false, createdAt: Date.now(), status: 'todo' }),
      id: task?.id ?? uid(),
      title: title.trim(),
      classId,
      formats: cls?.format ? [cls.format] : task?.formats ?? [],
      at: auto ? task?.at : at(day, inputToMin(time)),
      estimateMin: Math.round(length),
      estimateManual: true,
      due: dueDate ? at(dueDate, inputToMin(dueTime)) : null,
      notes: notes.trim() || undefined,
    } as Task;
    commit((d0, n) => actions.saveTask(d0, next, n));
    ui.close();
  };

  return (
    <SheetFrame title={task ? 'Edit assignment' : 'New assignment'} onSave={save}>
      <Field label="Name">
        <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="e.g. 2.6 worksheet" />
      </Field>
      <div class="field">
        <span class="field-label">Class</span>
        <ClassPicker data={data} value={classId} onChange={(id) => setClassId(id)} />
      </div>
      {auto ? (
        <p class="hint">Goes into your next Homework block before it's due.</p>
      ) : (
      <div class="row2">
        <Field label="Day">
          <input type="date" value={day} onInput={(e) => setDay(e.currentTarget.value)} />
        </Field>
        <Field label="Starts">
          <input type="time" value={time} onInput={(e) => setTime(e.currentTarget.value)} />
        </Field>
      </div>
      )}
      <div class="field">
        <span class="field-label">How long</span>
        <div class="segmented len-pick" role="radiogroup">
          {LENGTHS.map((m) => (
            <button type="button" role="radio" aria-checked={length === m} class={length === m ? 'on' : ''} onClick={() => setLength(m)}>
              {m < 60 ? `${m}m` : `${m / 60}h`.replace('.5h', '½h')}
            </button>
          ))}
        </div>
        {!LENGTHS.includes(length) && <span class="hint">{length} min</span>}
      </div>
      <div class="row2">
        <Field label="Due (optional)">
          <input type="date" value={dueDate} onInput={(e) => setDueDate(e.currentTarget.value)} />
        </Field>
        <Field label="Due time">
          <input type="time" value={dueTime} disabled={!dueDate} onInput={(e) => setDueTime(e.currentTarget.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea rows={4} placeholder="Pages, links, what the teacher said…" value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
      </Field>
      {error && <p class="warn">{error}</p>}
    </SheetFrame>
  );
}
