import { useRef, useState } from 'preact/hooks';
import type { Ms, Task } from '../core/types';
import { actions, type AppData } from './model';
import { commit } from './store';
import { SheetFrame, useUI } from './ui';
import { fmtDay, fmtDue, fmtDur, fmtTime } from './format';
import { Icon } from './icons';
import { ClassTag } from './ClassPicker';
import { planDay } from '../core/time';

const PXM = 1.6; // pixels per minute inside the block
const ROW_MIN = 56;

/** Assignments inside one Homework block (start..end), in the order they're placed. */
export const workIn = (d: AppData, start: Ms, end: Ms): Task[] =>
  d.tasks.filter((t) => t.at != null && t.at >= start && t.at < end).sort((a, b) => a.at! - b.at!);

/** A Homework block opened as its own page: a timeline of just this block. Hold ≡ to drag and reorder. */
export function WorkBlock({ data, blockId, start, end }: { data: AppData; blockId: string; start: Ms; end: Ms }) {
  const ui = useUI();
  const block = data.blocks.find((b) => b.id === blockId);
  const tasks = workIn(data, start, end);
  const [drag, setDrag] = useState<{ id: string; y0: number; dy: number } | null>(null);
  const rows = useRef<HTMLOListElement>(null);
  const used = tasks.reduce((m, t) => m + t.estimateMin, 0);
  const total = Math.round((end - start) / 60_000);

  // Where the dragged row would land: the slot whose middle it has passed
  const targetIndex = () => {
    if (!drag || !rows.current) return -1;
    const els = Array.from(rows.current.querySelectorAll<HTMLElement>('[data-row]'));
    const me = els.find((el) => el.dataset.row === drag.id);
    if (!me) return -1;
    const r = me.getBoundingClientRect();
    const mid = r.top + r.height / 2 + drag.dy;
    let i = 0;
    for (const el of els) {
      if (el === me) continue;
      const b = el.getBoundingClientRect();
      if (mid > b.top + b.height / 2) i++;
    }
    return i;
  };

  const onDown = (id: string) => (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, y0: e.clientY, dy: 0 });
  };
  const onMove = (e: PointerEvent) => drag && setDrag({ ...drag, dy: e.clientY - drag.y0 });
  const onUp = () => {
    if (!drag) return;
    const i = targetIndex();
    const ids = tasks.map((t) => t.id).filter((x) => x !== drag.id);
    if (i >= 0) {
      ids.splice(i, 0, drag.id);
      commit((d, n) => actions.reorderWork(d, ids, n));
    }
    setDrag(null);
  };

  return (
    <SheetFrame title={block?.title ?? 'Homework'} full>
      <div class="wb-head">
        <span>{fmtDay(planDay(start), { weekday: 'long', month: 'short', day: 'numeric' })} · {fmtTime(start)} – {fmtTime(end)}</span>
        <span class={used > total ? 'warn' : ''}>{fmtDur(used)} of {fmtDur(total)} planned</span>
      </div>
      {!tasks.length && <p class="hint wb-empty">Nothing in this block. Add an assignment from the calendar and it lands in the next block before it's due.</p>}
      <ol class="wb-list" ref={rows} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
        {tasks.map((t) => {
          const cls = data.classes.find((c) => c.id === t.classId);
          const done = t.status === 'done';
          const tEnd = t.at! + t.estimateMin * 60_000;
          const late = !done && t.due !== null && tEnd > t.due;
          const moving = drag?.id === t.id;
          return (
            <li
              data-row={t.id}
              class={`wb-row ${done ? 'done' : ''} ${moving ? 'moving' : ''}`}
              style={{ minHeight: `${Math.max(ROW_MIN, t.estimateMin * PXM)}px`, '--cat': cls?.color ?? 'var(--imp-accent)', transform: moving ? `translateY(${drag!.dy}px)` : undefined }}
            >
              <span class="wb-time">{fmtTime(t.at!)}</span>
              <div class="wb-card">
                <button
                  class={`tl-check ${done ? 'on' : ''}`}
                  aria-label={done ? 'Mark not done' : 'Mark done'}
                  onClick={() => commit((d, n) => (done ? actions.reopenTask(d, t.id, n) : actions.completeTask(d, t.id, n)))}
                >
                  {done && <Icon name="check" size={14} />}
                </button>
                <button class="wb-main" onClick={() => ui.open({ kind: 'detail', id: t.id })}>
                  <span class="wb-title">{t.title}</span>
                  <span class="wb-sub">
                    {cls && <ClassTag c={cls} />}
                    {fmtDur(t.estimateMin)}{t.due !== null && <> · due {fmtDue(t.due)}</>}{late && <b class="warn"> · late</b>}
                  </span>
                </button>
                <span class="wb-grip" aria-label="Drag to reorder" onPointerDown={onDown(t.id)}>
                  <Icon name="more" size={18} />
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {block && (
        <button class="btn wide wb-edit" onClick={() => ui.open({ kind: 'block', block, date: planDay(start) })}>
          <Icon name="edit" size={16} /> Edit this event
        </button>
      )}
      <p class="hint wb-hint">Soonest due goes first. Drag ⋯ to change the order. Anything not done when the block ends moves to the next one.</p>
    </SheetFrame>
  );
}
