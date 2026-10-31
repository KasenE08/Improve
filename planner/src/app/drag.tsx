import { useEffect, useRef, useState } from 'preact/hooks';

/** A day in the week strip or month (keeps the time of day), or a time on the day's calendar. */
export type DropTarget = { day: string } | { time: number };

interface Drag {
  id: string;
  title: string;
  x: number;
  y: number;
  over: DropTarget | null;
  /** Height of the card being dragged, for the drop outline. */
  h: number;
  /** Where the finger is on the card (from its top), so the card's top lands where it's dropped. */
  dy: number;
}

const HOLD_MS = 450;
const MOVE_TOLERANCE = 8;

function targetAt(x: number, y: number, dy: number): DropTarget | null {
  const hit = document.elementFromPoint(x, y);
  const day = hit?.closest<HTMLElement>('[data-drop-day]');
  if (day) return { day: day.dataset.dropDay! };
  // On the day's calendar: the time under the card's top, in 5-minute steps
  const grid = hit?.closest<HTMLElement>('[data-drop-grid]');
  if (!grid) return null;
  const px = Number(grid.dataset.px) || 1;
  const min = Math.round((y - dy - grid.getBoundingClientRect().top) / px / 5) * 5;
  return { time: Number(grid.dataset.dropGrid) + Math.max(0, min) * 60_000 };
}

/**
 * Press and hold an item, then drag it onto a day in the week strip or into a slot in the day's list.
 * Moving before the hold completes is treated as a normal scroll.
 */
export function useDrag(onDrop: (id: string, target: DropTarget) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  /** Pointer of the press in progress; any other finger or touch is ignored until it ends. */
  const activePointer = useRef<number | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  // While dragging, stop the page from scrolling under the finger and auto-scroll near the edges.
  useEffect(() => {
    if (!drag) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    let raf = 0;
    const tick = () => {
      const d = live.current;
      if (d) {
        const before = scrollY;
        // Over the day's hours (their own scroll area): scroll that; otherwise the page
        const box = document.querySelector<HTMLElement>('.tl-scroll');
        const boxBefore = box?.scrollTop;
        const r = box?.getBoundingClientRect();
        if (box && r && d.y > r.top && !(d.over && 'day' in d.over)) {
          if (d.y > r.bottom - 70) box.scrollTop += 8;
          else if (d.y < r.top + 50) box.scrollTop -= 8;
        } else if (d.y > innerHeight - 110) scrollBy(0, 8);
        else if (d.y < 170 && !(d.over && 'day' in d.over)) scrollBy(0, -8);
        // The page moved under a still finger: update where it would drop.
        if (scrollY !== before || box?.scrollTop !== boxBefore) {
          live.current = { ...d, over: targetAt(d.x, d.y, d.dy) };
          setDrag(live.current);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('touchmove', block);
      cancelAnimationFrame(raf);
    };
  }, [!!drag]);

  const bind = (id: string, title: string) => ({
    onPointerDown(e: PointerEvent) {
      if ((e.target as HTMLElement).closest('button')) return;
      const card = e.currentTarget as HTMLElement;
      const h = card.offsetHeight;
      const dy = e.clientY - card.getBoundingClientRect().top;
      // Only one drag at a time, from the first finger: a second touch can't grab another assignment.
      if (!e.isPrimary || activePointer.current !== null) return;
      const pid = e.pointerId;
      activePointer.current = pid;
      const sx = e.clientX;
      const sy = e.clientY;
      let x = sx;
      let y = sy;
      const timer = setTimeout(() => {
        live.current = { id, title, x, y, over: targetAt(x, y, dy), h, dy };
        setDrag(live.current);
      }, HOLD_MS);
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        x = ev.clientX;
        y = ev.clientY;
        if (!live.current) {
          if (Math.hypot(x - sx, y - sy) > MOVE_TOLERANCE) end();
          return;
        }
        live.current = { ...live.current, x, y, over: targetAt(x, y, live.current.dy) };
        setDrag(live.current);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        const d = live.current;
        end();
        if (d) {
          suppressClick.current = true;
          setTimeout(() => (suppressClick.current = false), 400);
          if (d.over) dropRef.current(d.id, d.over);
        }
      };
      const end = () => {
        clearTimeout(timer);
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', cancel);
        live.current = null;
        activePointer.current = null;
        setDrag(null);
      };
      const cancel = (ev: PointerEvent) => ev.pointerId === pid && end();
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', cancel);
    },
    onContextMenu(e: Event) {
      e.preventDefault();
    },
    /** Wrap the item's tap handler so a finished drag doesn't also count as a tap. */
    guard(fn: () => void) {
      return () => {
        if (!suppressClick.current) fn();
      };
    },
  });

  const isOver = (t: { day: string }) => !!drag?.over && 'day' in drag.over && drag.over.day === t.day;

  const ghost = drag && (
    <div class="drag-ghost" style={{ left: `${drag.x}px`, top: `${drag.y}px` }}>
      {drag.title}
    </div>
  );

  return { drag, bind, isOver, ghost };
}
