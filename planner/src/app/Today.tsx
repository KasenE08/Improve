import { useEffect, useRef, useState } from 'preact/hooks';
import type { BlockTag, DateKey, FixedBlock, Ms, SchoolClass, Task } from '../core/types';
import { addDays, at, DAY_START_MIN, planDay } from '../core/time';
import { occurrencesOn } from '../core/availability';
import type { AppData } from './model';
import { actions } from './model';
import { commit, getData } from './store';
import { fixLateness, moveInOrder, newlyLate } from './model';
import { useDrag, type DropTarget } from './drag';
import { MonthGrid, monthStart } from './MonthGrid';
import { CATEGORY_ICONS, Icon, TAG_STYLE } from './icons';
import { categoryRank } from '../core/priority';
import { choose } from './dialog';
import { useUI } from './ui';
import { ClassTag } from './ClassPicker';
import { category, fmtDay, fmtDue, fmtDur, fmtTime, inputToMin, minToInput, TAG_LABELS } from './format';

type Entry =
  | { kind: 'block'; start: Ms; end: Ms; title: string; sub: string; soft: boolean; tag: string; tagKey: BlockTag; block: FixedBlock }
  | { kind: 'task'; start: Ms; end: Ms; task: Task; late: boolean; night?: boolean; cls?: SchoolClass }
  | { kind: 'reminder'; start: Ms; title: string }
  | { kind: 'now'; start: Ms };

function entriesFor(d: AppData, key: DateKey, now: Ms): Entry[] {
  // A day on screen runs 4:01 AM → 4:00 AM (late-night work shows under the night before)
  const dayStart = at(key, DAY_START_MIN);
  const dayEnd = at(addDays(key, 1), DAY_START_MIN);
  const inDay = (t: Ms) => t >= dayStart && t < dayEnd;
  const locs = new Map(d.locations.map((l) => [l.id, l]));
  const tasks = new Map(d.tasks.map((t) => [t.id, t]));
  const out: Entry[] = [];

  for (const o of occurrencesOn(key, d.blocks, d.locations, d.arrivals)) {
    const loc = locs.get(o.block.locationId);
    const away = o.leave !== o.start || o.arrive !== o.end;
    const travel = o.fromTitle || o.toTitle
      ? [o.fromTitle ? `from ${o.fromTitle} · leave ${fmtTime(o.leave)}` : away ? `leave ${fmtTime(o.leave)}` : null, o.toTitle ? `then ${o.toTitle}` : `home ${fmtTime(o.arrive)}`].filter(Boolean).join(' · ')
      : away ? `leave ${fmtTime(o.leave)} · home ${fmtTime(o.arrive)}` : null;
    out.push({
      kind: 'block',
      block: o.block,
      start: o.start,
      end: o.end,
      title: o.block.title,
      sub: [loc && loc.id !== 'home' ? loc.name : null, travel].filter(Boolean).join(' · '),
      soft: o.block.blocksScheduling === false,
      tag: TAG_LABELS[o.block.tag],
      tagKey: o.block.tag,
    });
  }
  for (const i of d.plan?.items ?? []) {
    const task = tasks.get(i.taskId);
    if (task && inDay(i.start)) out.push({ kind: 'task', start: i.start, end: i.end, task, late: i.late, night: i.night, cls: d.classes.find((c) => c.id === task.classId) });
  }
  for (const r of d.plan?.blockReminders ?? []) {
    if (inDay(r.at)) out.push({ kind: 'reminder', start: r.at, title: r.title });
  }
  if (inDay(now)) out.push({ kind: 'now', start: now });
  return out.sort((a, b) => a.start - b.start || (a.kind === 'now' ? -1 : b.kind === 'now' ? 1 : 0));
}

export function Today({ data, now }: { data: AppData; now: Ms }) {
  const today = planDay(now);
  const [day, setDay] = useState<DateKey>(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [month, setMonth] = useState<DateKey>(monthStart(today));
  const ui = useUI();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, weekOffset * 7 + i));
  const entries = entriesFor(data, day, now);
  const school = occurrencesOn(day, data.blocks, data.locations).find((o) => o.block.tag === 'school');
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  /** This day's assignments that can be reordered, top to bottom. */
  const order = entries.filter((e): e is Extract<Entry, { kind: 'task' }> => e.kind === 'task' && e.task.status === 'todo').map((e) => e.task.id);
  /**
   * Dropping `id` before entry `p`: the day's new order, the fixed time just above it (start after that ends)
   * and the one just below (it should fit before that). Null when it would land where it already is.
   */
  const spotAt = (p: number, id: string) => {
    const isTodo = (e: Entry) => e.kind === 'task' && e.task.status === 'todo';
    const isSelf = (e: Entry) => e.kind === 'task' && e.task.id === id;
    type Card = Extract<Entry, { kind: 'block' | 'task' }>;
    const cards = entries.map((e, i) => ({ e, i })).filter((c): c is { e: Card; i: number } => c.e.kind === 'block' || c.e.kind === 'task');
    const self = cards.findIndex(({ e }) => isSelf(e));
    if (self === -1 || p === cards[self].i || p === (cards[self + 1]?.i ?? entries.length)) return null;
    const above = cards.filter(({ e, i }) => i < p && !isSelf(e));
    const slot = above.filter(({ e }) => isTodo(e)).length + (cards[self].i < p ? 1 : 0);
    let lastTodo = -1;
    above.forEach(({ e }, k) => isTodo(e) && (lastTodo = k));
    const fixedAbove = above.slice(lastTodo + 1).map(({ e }) => e.end);
    const below = cards.find(({ e, i }) => i >= p && !isSelf(e))?.e;
    return {
      ids: moveInOrder(order, id, slot) ?? order,
      after: fixedAbove.length ? Math.max(...fixedAbove) : undefined,
      before: below && !isTodo(below)
        ? { start: below.start, title: below.kind === 'block' ? below.title : below.task.title }
        : undefined,
    };
  };
  const onDrop = async (id: string, target: DropTarget) => {
    const cur = getData();
    const n = Date.now();
    let next: AppData;
    const notes: string[] = [];
    const movedTitle = cur.tasks.find((t) => t.id === id)?.title ?? 'this';
    if ('day' in target) {
      next = actions.moveToDay(cur, id, target.day, n);
      const slot = next.plan?.items.find((i) => i.taskId === id);
      if (slot && planDay(slot.start) !== target.day) {
        notes.push(`No room on ${fmtDay(target.day)}, so it goes to ${fmtDue(slot.start)}.`);
      }
    } else {
      // Reorder this day's list: the dragged one goes into the outlined spot, the rest shift up or down.
      const spot = spotAt(target.at, id);
      if (!spot) return;
      next = actions.reorderDay(cur, day, spot.ids, n, { id, after: spot.after });
      const slot = next.plan?.items.find((i) => i.taskId === id);
      if (slot && planDay(slot.start) !== day) notes.push(`No room on ${fmtDay(day)}, so it goes to ${fmtDue(slot.start)}.`);
      else if (slot && spot.before && slot.start >= spot.before.start) {
        notes.push(`It doesn't fit before "${spot.before.title}", so it goes after it (${fmtTime(slot.start)}).`);
      }
    }
    // If anything ends up late, offer the smallest help that gets it done on time.
    const fix = fixLateness(cur, next, id, n, 'day' in target ? target.day === planDay(n) : day === planDay(n));
    if (fix) {
      const allOnTime = fix.tasks.every((t) => !fix.data.plan!.items.some((i) => i.taskId === t.id && i.late));
      const how = fix.skipBreak && fix.night
        ? 'Skipping the break and working past midnight (until 2am)'
        : fix.skipBreak
          ? 'Skipping the 30-minute break'
          : 'Working past midnight (until 2am)';
      const pick = await choose(
        `Moving "${movedTitle}": ${fix.tasks.map((t) => `"${t.title}"`).join(', ')} would be late. ${how} gets ${allOnTime ? 'it' : 'more'} done on time.`,
        [fix.skipBreak && fix.night ? 'Skip break & work late' : fix.skipBreak ? 'Skip the break' : 'Work past midnight', 'Move anyway (late)', 'Cancel'],
      );
      if (pick === 0) commit(() => fix.data);
      else if (pick === 1) commit(() => next);
      return;
    }
    const late = newlyLate(cur, next);
    if (late.length) notes.push(`This makes ${late.map((t) => `"${t.title}"`).join(', ')} late.`);
    if (notes.length && !confirm(`Moving "${movedTitle}": ${notes.join(' ')} Move anyway?`)) return;
    commit(() => next);
  };
  const dnd = useDrag(onDrop);
  const dropAt = (() => {
    const over = dnd.drag?.over;
    return over && 'at' in over && spotAt(over.at, dnd.drag!.id) ? over.at : null;
  })();

  const countFor = (k: DateKey) =>
    (data.plan?.items ?? []).filter((i) => planDay(i.start) === k && tasks.get(i.taskId)?.status !== 'done').length;
  const toDo = data.tasks.filter((t) => t.status !== 'done').length;

  // ---- 24-hour timeline (like Google Calendar): the app day runs 4 AM → 4 AM; 1 minute = PX px ----
  const gridStart = at(day, 4 * 60);
  const y = (ms: Ms) => ((ms - gridStart) / 60_000) * PX;
  const placed = layoutLanes(entries.filter((e): e is Extract<Entry, { kind: 'block' | 'task' }> => e.kind === 'block' || e.kind === 'task'));
  const nowEntry = entries.find((e) => e.kind === 'now');
  const firstEvent = entries.find((e) => e.kind === 'block' || e.kind === 'task');
  const gridRef = useRef<HTMLDivElement>(null);
  // The hours scroll in their own area under the fixed top (like Google Calendar), sized to the screen,
  // and open scrolled to now (today) or the first thing planned (other days).
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
    const target = nowEntry ? nowEntry.start : firstEvent ? firstEvent.start : at(day, 8 * 60);
    el.scrollTop = Math.max(0, y(target) - el.clientHeight * 0.3);
  }, [day, mode]);
  const lastEnd = Math.max(gridStart, ...placed.map((p) => p.e.end));
  const dropY = dropAt === null ? null : dropAt < entries.length ? y(entries[dropAt].start) : y(lastEnd);

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
              <i class={countFor(k) ? 'has' : ''} aria-label={countFor(k) ? `${countFor(k)} assignments` : undefined} />
            </button>
          ))}
          <button class="icon-btn" aria-label="Next week" onClick={() => setWeekOffset(weekOffset + 1)}>
            <Icon name="chevronRight" />
          </button>
        </div>
      )}

      {school && day === today && now >= school.end && (
        <div class="arrival-pill">
          <span>Home from school</span>
          {data.arrivals[day] === undefined ? (
            <button class="link" onClick={() => { const t = new Date(); commit((d, n) => actions.setArrival(d, day, t.getHours() * 60 + t.getMinutes(), n)); }}>
              I'm home
            </button>
          ) : null}
          <input
            type="time"
            aria-label="Time home from school"
            value={data.arrivals[day] !== undefined ? minToInput(data.arrivals[day]) : minToInput(Math.round((school.arrive - at(day, 0)) / 60_000))}
            onChange={(e) => {
              const v = e.currentTarget.value;
              commit((d, n) => actions.setArrival(d, day, v ? inputToMin(v) : null, n));
            }}
          />
        </div>
      )}

      {day === today && <Warnings data={data} />}

      {data.blocks.length === 0 && (
        <div class="card muted small">No repeating times yet. Tap + to add school, practice or work, or import a backup under ⋯.</div>
      )}

      <div class="tl-scroll" ref={gridRef}>
      <ol class="tl" data-drop-list={entries.length} style={{ height: `${24 * 60 * PX}px` }}>
        {Array.from({ length: 24 }, (_, h) => (
          <li class="tl-hour" style={{ top: `${h * 60 * PX}px` }} aria-hidden="true">
            <span>{h === 0 ? '' : hourLabel((4 + h) % 24)}</span>
          </li>
        ))}
        {placed.map(({ e, lane, lanes }) => {
          const i = entries.indexOf(e);
          const top = y(e.start);
          const h = Math.max(MIN_H, y(e.end) - top - 2);
          const pos = { top: `${top}px`, height: `${h}px`, left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${lane / lanes})`, width: `calc((100% - ${LABEL_W}px) / ${lanes} - 4px)` };
          if (e.kind === 'block') {
            const st = TAG_STYLE[e.tagKey];
            return (
              <li class={`tl-ev block ${e.soft ? 'soft' : ''} ${h < 40 ? 'short' : ''}`} style={{ ...pos, '--cat': st.color }} data-drop-at={i} onClick={() => ui.open({ kind: 'block', block: e.block })}>
                <div class="body">
                  <div class="title">{e.title}</div>
                  <div class="meta">{fmtTime(e.start)} – {fmtTime(e.end)}</div>
                  {e.sub && h >= 56 && <div class="meta">{e.sub}</div>}
                </div>
              </li>
            );
          }
          return <TaskEntry e={e} dnd={dnd} at={i} pos={pos} h={h} />;
        })}
        {entries.filter((e): e is Extract<Entry, { kind: 'reminder' }> => e.kind === 'reminder').map((r) => (
          <li class="tl-reminder" style={{ top: `${y(r.start)}px` }}>
            <Icon name="bell" size={12} /> {fmtTime(r.start)} {r.title}
          </li>
        ))}
        {nowEntry && (
          <li class="tl-now" style={{ top: `${y(nowEntry.start)}px` }} aria-label={`Now, ${fmtTime(nowEntry.start)}`} />
        )}
        {dropY !== null && dnd.drag && <li class="tl-drop" style={{ top: `${dropY}px` }}><span>{dnd.drag.title}</span></li>}
      </ol>
      </div>
      {dnd.ghost}
      {dnd.drag && <div class="drag-hint">Drop on a date to move it there, or on the day to reorder</div>}

      {day === today && <BehindPrompt data={data} now={now} />}

      <button class="plan-fab" aria-label="Add" onClick={() => ui.open({ kind: 'add' })}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}

const PX = 1.25; // pixels per minute (75 px an hour)
const LABEL_W = 48;
const MIN_H = 24;
const hourLabel = (h: number) => (h === 0 ? '12 AM' : h === 12 ? 'Noon' : h < 12 ? `${h} AM` : `${h - 12} PM`);

/** Side-by-side lanes for things that overlap (like Google Calendar). */
function layoutLanes<T extends { start: Ms; end: Ms }>(list: T[]): { e: T; lane: number; lanes: number }[] {
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
    for (const g of group) ends[g.lane] = Math.max(ends[g.lane] ?? -Infinity, g.e.end);
    let lane = 0;
    while (ends[lane] !== undefined && ends[lane] > e.start) lane++;
    group.push({ e, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, e.end);
  }
  if (group.length) flush();
  return out;
}

/**
 * 10 minutes after an assignment should have started (and it hasn't): a full-screen question.
 * Yes = "Falling behind" (reschedule the rest; no tick for "Finished today's work" today). No = leave it.
 */
function BehindPrompt({ data, now }: { data: AppData; now: Ms }) {
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const asked = new Set(data.behindAsked ?? []);
  const today = planDay(now);
  if ((data.behindDays ?? []).includes(today)) return null;
  const late = (data.plan?.items ?? []).find((i) => {
    const t = tasks.get(i.taskId);
    return t && t.status === 'todo' && planDay(i.start) === today && now >= i.start + 10 * 60_000 && now < i.end + 6 * 60 * 60_000 && !asked.has(`${i.taskId}@${i.start}`);
  });
  if (!late) return null;
  const t = tasks.get(late.taskId)!;
  const key = `${late.taskId}@${late.start}`;
  return (
    <div class="behind-overlay" role="alertdialog" aria-modal="true" aria-label="Falling behind?">
      <div class="behind-box">
        <span class="behind-icon"><Icon name="clock" size={30} /></span>
        <h2>Falling behind?</h2>
        <p>
          <b>{t.title}</b> was planned for {fmtTime(late.start)} and hasn't been started.
        </p>
        <p class="muted small">Yes reschedules everything you haven't started, beginning in 5 minutes. "Finished today's work" can't tick today.</p>
        <button class="btn primary wide" onClick={() => commit((d, n) => actions.markBehindAsked(actions.fallingBehind(d, n), key))}>
          Yes, reschedule
        </button>
        <button class="btn wide" onClick={() => commit((d) => actions.markBehindAsked(d, key))}>
          No, I'm on it
        </button>
      </div>
    </div>
  );
}

function TaskEntry({ e, dnd, at, pos, h }: { e: Extract<Entry, { kind: 'task' }>; dnd: ReturnType<typeof useDrag>; at: number; pos: Record<string, string>; h: number }) {
  const ui = useUI();
  const t = e.task;
  const cat = category(t);
  const drag = t.status === 'todo' ? dnd.bind(t.id, t.title) : null;
  const open = () => ui.open({ kind: 'detail', id: t.id });
  return (
    <li
      class={`tl-ev task ${t.status} ${e.late ? 'late' : ''} ${h < 40 ? 'short' : ''} ${dnd.drag?.id === t.id ? 'dragging' : ''}`}
      style={{ ...pos, '--cat': e.cls?.color ?? cat.color }}
      data-drop-at={at}
      onPointerDown={drag?.onPointerDown}
      onContextMenu={drag?.onContextMenu}
      onClick={drag ? drag.guard(open) : open}
    >
      <div class="body">
        <div class="title">{t.status === 'done' && <Icon name="check" size={14} />}{t.title}</div>
        <div class="meta">
          {fmtTime(e.start)} – {fmtTime(e.end)}
          {h >= 56 ? ` · ${t.due === null ? 'missing, ASAP' : `due ${fmtDue(t.due)}`}` : ''}
        </div>
        {h >= 70 && e.cls && <ClassTag c={e.cls} />}
        {h >= 110 && t.notes && <p class="note-preview"><span>{t.notes}</span></p>}
        {e.late && h >= 56 && <div class="warn small">Can't finish before it's due</div>}
        {e.night && !e.late && h >= 56 && <div class="small night">Past midnight to finish on time</div>}
      </div>
      {t.status !== 'done' && (
        <button
          class={`btn small tl-start ${h < 40 ? 'icon-only' : ''}`}
          aria-label={t.status === 'todo' ? `Start ${t.title}` : `Done with ${t.title}`}
          onClick={(ev) => {
            ev.stopPropagation();
            commit((d, n) => (t.status === 'todo' ? actions.startTask(d, t.id, n) : actions.completeTask(d, t.id, n)));
          }}
        >
          {h < 40 ? <Icon name={t.status === 'todo' ? 'play' : 'check'} size={13} /> : t.status === 'todo' ? 'Start' : 'Done'}
        </button>
      )}
    </li>
  );
}

// "Even working until 2am" only makes sense when there was extra late-night time before the due time
const lateNightHelps = (data: AppData, due: number) => !!data.night && data.night.end > data.night.start && due > data.night.start;

function Warnings({ data }: { data: AppData }) {
  const ui = useUI();
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const list = (data.plan?.warnings ?? []).filter((w) => tasks.get(w.taskId)?.status !== 'done');
  if (!list.length) return null;
  return (
    <div class="card overload">
      <strong><Icon name="alert" size={16} /> Overload</strong>
      {list.map((w) => {
        const t = tasks.get(w.taskId)!;
        return (
          <button class="link warn-row" onClick={() => ui.open({ kind: 'detail', id: t.id })}>
            {w.kind === 'late'
              ? `${t.title}: finishes ${fmtDue(w.end)}, due ${fmtDue(w.due)}${lateNightHelps(data, w.due) ? ' (even working until ' + fmtTime(data.night!.end) + ')' : ''}`
              : `${t.title}: no time fits in the next ${data.settings.horizonDays} days`}
          </button>
        );
      })}
    </div>
  );
}

const hasOpenWork = (d: AppData) => d.tasks.some((t) => t.status === 'todo');

export function behind() {
  const first = Date.now() + 5 * 60_000;
  if (!confirm(`Reschedule everything you haven't started, beginning at ${fmtTime(first)}?`)) return;
  let msg = '';
  commit((d, n) => {
    const next = actions.fallingBehind(d, n);
    const items = next.plan?.items.filter((i) => next.tasks.find((t) => t.id === i.taskId)?.status === 'todo') ?? [];
    const parts = [items.length ? `Rescheduled. First assignment at ${fmtTime(Math.min(...items.map((i) => i.start)))}.` : 'Nothing left to reschedule.'];
    if (items.some((i) => i.night)) parts.push('Some work runs past midnight to finish on time.');
    if (next.plan?.warnings.length) parts.push("Some assignments still can't be done on time. See Overload.");
    msg = parts.join(' ');
    return next;
  });
  alert(msg);
}
