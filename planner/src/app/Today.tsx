import { useEffect, useRef, useState } from 'preact/hooks';
import type { DateKey, FixedBlock, Ms, SchoolClass, Task } from '../core/types';
import { addDays, at, planDay } from '../core/time';
import { occurrencesOn } from '../core/availability';
import { actions, type AppData } from './model';
import { commit, getData } from './store';
import { useDrag, type DropTarget } from './drag';
import { MonthGrid, monthStart } from './MonthGrid';
import { Icon } from './icons';
import { useUI } from './ui';
import { ClassTag } from './ClassPicker';
import { fmtDay, fmtDue, fmtTime } from './format';

// The day is a calendar, like Google Calendar: everything sits at the time you put it.
type Entry =
  | { kind: 'event'; start: Ms; end: Ms; block: FixedBlock }
  | { kind: 'task'; start: Ms; end: Ms; task: Task; late: boolean; cls?: SchoolClass };

const PX = 1.25; // pixels per minute (75 px an hour)
const LABEL_W = 48;
const MIN_H = 24;
const hourLabel = (h: number) => (h === 0 ? '12 AM' : h === 12 ? 'Noon' : h < 12 ? `${h} AM` : `${h - 12} PM`);

function entriesFor(d: AppData, key: DateKey): Entry[] {
  // A day on screen runs 4 AM → 4 AM, like the rest of Improve (late-night work shows under the night before)
  const from = at(key, 4 * 60);
  const to = at(addDays(key, 1), 4 * 60);
  const tasks = new Map(d.tasks.map((t) => [t.id, t]));
  const out: Entry[] = [];
  for (const o of [...occurrencesOn(addDays(key, -1), d.blocks, d.locations), ...occurrencesOn(key, d.blocks, d.locations)]) {
    if (o.end > from && o.start < to) out.push({ kind: 'event', start: o.start, end: o.end, block: o.block });
  }
  for (const i of d.plan?.items ?? []) {
    const task = tasks.get(i.taskId);
    if (task && i.start >= from && i.start < to) out.push({ kind: 'task', start: i.start, end: i.end, task, late: i.late, cls: d.classes.find((c) => c.id === task.classId) });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Side-by-side lanes for things that overlap (like Google Calendar). A short entry still takes up
 *  its drawn height (MIN_H), so it counts as overlapping anything inside that height. */
function layoutLanes<T extends { start: Ms; end: Ms }>(list: T[], minMs = 0): { e: T; lane: number; lanes: number }[] {
  const vend = (e: T) => Math.max(e.end, e.start + minMs);
  const out: { e: T; lane: number; lanes: number }[] = [];
  let group: { e: T; lane: number; lanes: number }[] = [];
  let groupEnd = -Infinity;
  const flush = () => {
    const n = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const g of group) g.lanes = n;
    out.push(...group);
    group = [];
  };
  for (const e of [...list].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (e.start >= groupEnd && group.length) flush();
    const ends: Ms[] = [];
    for (const g of group) ends[g.lane] = Math.max(ends[g.lane] ?? -Infinity, vend(g.e));
    let lane = 0;
    while (ends[lane] !== undefined && ends[lane] > e.start) lane++;
    group.push({ e, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, vend(e));
  }
  if (group.length) flush();
  return out;
}

export function Today({ data, now }: { data: AppData; now: Ms }) {
  const today = planDay(now);
  const [day, setDay] = useState<DateKey>(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [month, setMonth] = useState<DateKey>(monthStart(today));
  const ui = useUI();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, weekOffset * 7 + i));
  const entries = entriesFor(data, day);
  const toDo = data.tasks.filter((t) => t.status !== 'done').length;
  const countFor = (k: DateKey) => entriesFor(data, k).filter((e) => e.kind === 'task' && e.task.status !== 'done').length; // dot = assignments to do

  // Drag an assignment or a one-time event: onto a date (same time that day) or to a time on the day
  const onDrop = (id: string, target: DropTarget) => {
    const cur = getData();
    const n = Date.now();
    const ev = id.startsWith('ev:') ? cur.blocks.find((b) => b.id === id.slice(3)) : undefined;
    const task = ev ? undefined : cur.tasks.find((t) => t.id === id);
    if (!ev && !task?.at) return;
    const oldStart = ev ? at(day, ev.startMin) : task!.at!;
    const start = 'time' in target
      ? target.time
      : at(target.day, Math.round((oldStart - at(planDay(oldStart), 0)) / 60_000));
    if (ev) {
      const k = planDay(start);
      commit((d) => actions.moveEvent(d, ev.id, k, Math.round((start - at(k, 0)) / 60_000), n));
    } else commit((d) => actions.moveTask(d, id, start, n));
  };
  const dnd = useDrag(onDrop);

  // ---- 24-hour day: 4 AM → 4 AM, 1 minute = PX px ----
  const gridStart = at(day, 4 * 60);
  const y = (ms: Ms) => ((ms - gridStart) / 60_000) * PX;
  const placed = layoutLanes(entries, ((MIN_H + 2) / PX) * 60_000);
  const showNow = planDay(now) === day;
  const gridRef = useRef<HTMLDivElement>(null);
  // The hours scroll in their own area under the fixed top, sized to the screen; they open at now
  // (today) or the first thing that day.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const fit = () => { el.style.height = `${Math.max(320, innerHeight - el.getBoundingClientRect().top - 8)}px`; };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [mode]);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const target = showNow ? now : entries[0]?.start ?? at(day, 8 * 60);
    el.scrollTop = Math.max(0, y(target) - el.clientHeight * 0.3);
  }, [day, mode]);
  const over = dnd.drag?.over;
  const dropY = over && 'time' in over ? y(over.time) : null;

  return (
    <div class="plan">
      <div class="plan-top">
        <button
          class="plan-month"
          onClick={() => {
            if (mode === 'month') return setMode('week');
            setMonth(monthStart(day));
            setMode('month');
          }}
          aria-expanded={mode === 'month'}
        >
          {fmtDay(mode === 'month' ? month : day, { month: 'long', year: 'numeric' })}
          <Icon name={mode === 'month' ? 'chevronUp' : 'chevronDown'} size={16} />
        </button>
        <button class="todo-pill" onClick={() => ui.open({ kind: 'list' })}>
          {toDo ? `${toDo} to do` : 'All done'}
          <Icon name="chevronRight" size={16} />
        </button>
      </div>

      {data.push?.error && <div class="card small warn">Notifications: {data.push.error}</div>}

      {mode === 'month' ? (
        <MonthGrid data={data} month={month} setMonth={setMonth} selected={day} today={today} onSelect={(k) => { setDay(k); setMode('week'); }} isOver={dnd.isOver} />
      ) : (
        <div class="week">
          <button class="icon-btn" aria-label="Previous week" disabled={weekOffset === 0} onClick={() => setWeekOffset(weekOffset - 1)}>
            <Icon name="chevronLeft" />
          </button>
          {days.map((k) => (
            <button
              class={`day ${k === day ? 'on' : ''} ${k === today ? 'today' : ''} ${dnd.isOver({ day: k }) ? 'drop-over' : ''}`}
              data-drop-day={k}
              onClick={() => setDay(k)}
            >
              <span>{fmtDay(k, { weekday: 'narrow' })}</span>
              <strong>{fmtDay(k, { day: 'numeric' })}</strong>
              <i class={countFor(k) ? 'has' : ''} />
            </button>
          ))}
          <button class="icon-btn" aria-label="Next week" onClick={() => setWeekOffset(weekOffset + 1)}>
            <Icon name="chevronRight" />
          </button>
        </div>
      )}

      <div class="tl-scroll" ref={gridRef}>
        <ol class="tl" data-drop-grid={gridStart} data-px={PX} style={{ height: `${24 * 60 * PX}px` }}>
          {Array.from({ length: 24 }, (_, h) => (
            <li class="tl-hour" style={{ top: `${h * 60 * PX}px` }} aria-hidden="true">
              <span>{h === 0 ? '' : hourLabel((4 + h) % 24)}</span>
            </li>
          ))}
          {placed.map(({ e, lane, lanes }) => {
            const top = Math.max(0, y(e.start));
            const h = Math.max(MIN_H, y(e.end) - top - 2);
            const pos = {
              top: `${top}px`,
              height: `${h}px`,
              left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${lane / lanes})`,
              width: `calc((100% - ${LABEL_W}px) / ${lanes} - 4px)`,
            };
            return e.kind === 'event'
              ? <EventEntry e={e} dnd={dnd} pos={pos} h={h} />
              : <TaskEntry e={e} dnd={dnd} pos={pos} h={h} />;
          })}
          {showNow && <li class="tl-now" style={{ top: `${y(now)}px` }} aria-label={`Now, ${fmtTime(now)}`} />}
          {dropY !== null && dnd.drag && (
            <li class="tl-drop" style={{ top: `${dropY}px`, height: `${dnd.drag.h}px` }}>
              <span>{fmtTime((over as { time: number }).time)} · {dnd.drag.title}</span>
            </li>
          )}
        </ol>
      </div>
      {dnd.ghost}
      {dnd.drag && <div class="drag-hint">Drop on a time, or on a date to move it to that day</div>}

      <button class="plan-fab" aria-label="Add" onClick={() => ui.open({ kind: 'add' })}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}

function EventEntry({ e, dnd, pos, h }: { e: Extract<Entry, { kind: 'event' }>; dnd: ReturnType<typeof useDrag>; pos: Record<string, string>; h: number }) {
  const ui = useUI();
  const b = e.block;
  // Events stay put; tap one to change its time
  const open = () => ui.open({ kind: 'block', block: b, date: planDay(e.start) });
  return (
    <li class={`tl-ev event ${h < 40 ? 'short' : ''}`} style={pos} onClick={open}>
      <div class="body">
        <div class="title">{b.recurrence.kind !== 'once' && <Icon name="repeat" size={12} />}{b.title}</div>
        <div class="meta">{fmtTime(e.start)} – {fmtTime(e.end)}</div>
      </div>
    </li>
  );
}

function TaskEntry({ e, dnd, pos, h }: { e: Extract<Entry, { kind: 'task' }>; dnd: ReturnType<typeof useDrag>; pos: Record<string, string>; h: number }) {
  const ui = useUI();
  const t = e.task;
  const done = t.status === 'done';
  const drag = done ? null : dnd.bind(t.id, t.title);
  const open = () => ui.open({ kind: 'detail', id: t.id });
  return (
    <li
      class={`tl-ev task ${done ? 'done' : ''} ${e.late ? 'late' : ''} ${h < 40 ? 'short' : ''} ${dnd.drag?.id === t.id ? 'dragging' : ''}`}
      style={{ ...pos, '--cat': e.cls?.color ?? 'var(--imp-accent)' }}
      onPointerDown={drag?.onPointerDown}
      onContextMenu={drag?.onContextMenu}
      onClick={drag ? drag.guard(open) : open}
    >
      <button
        class={`tl-check ${done ? 'on' : ''}`}
        aria-label={done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
        onClick={(ev) => {
          ev.stopPropagation();
          commit((d, n) => (done ? actions.reopenTask(d, t.id, n) : actions.completeTask(d, t.id, n)));
        }}
      >
        {done && <Icon name="check" size={12} />}
      </button>
      <div class="body">
        <div class="title">{t.title}</div>
        <div class="meta">
          {fmtTime(e.start)} – {fmtTime(e.end)}
          {h >= 56 && t.due !== null ? ` · due ${fmtDue(t.due)}` : ''}
        </div>
        {h >= 70 && e.cls && <ClassTag c={e.cls} />}
        {h >= 110 && t.notes && <p class="note-preview"><span>{t.notes}</span></p>}
        {e.late && h >= 56 && <div class="warn small">Ends after it's due</div>}
      </div>
    </li>
  );
}
