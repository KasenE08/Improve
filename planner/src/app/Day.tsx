import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { DateKey, FixedBlock, Ms } from '../core/types';
import { addDays, at, planDay } from '../core/time';
import { occurrencesOn } from '../core/availability';
import { actions, type AppData } from './model';
import { commit } from './store';
import { useUI } from './ui';
import { fmtDay, fmtTime } from './format';
import { colorHex } from './colors';
import { ScopeChoice } from './EventView';

const DAY_START = 4 * 60; // the day runs 4 AM → 4 AM, like the rest of Improve
const MIN_MS = 60_000;
const SHORTEST = 5; // minutes: the smallest a block is drawn
const ZOOM_KEY = /\/dev\//.test(location.pathname) ? 'imp_dev_planner_zoom' : 'imp_planner_zoom';
const clampZoom = (z: number) => Math.min(4, Math.max(0.6, z));
const loadZoom = () => { try { return clampZoom(Number(localStorage.getItem(ZOOM_KEY)) || 1); } catch { return 1; } };
const saveZoom = (z: number) => { try { localStorage.setItem(ZOOM_KEY, String(z)); } catch { /* private mode */ } };
const hourLabel = (h: number) => (h === 0 ? '12 AM' : h === 12 ? 'Noon' : h < 12 ? `${h} AM` : `${h - 12} PM`);

interface Entry { block: FixedBlock; date: DateKey; start: Ms; end: Ms }

function entriesFor(d: AppData, key: DateKey): Entry[] {
  const from = at(key, DAY_START);
  const to = at(addDays(key, 1), DAY_START);
  const out: Entry[] = [];
  for (const date of [addDays(key, -1), key]) {
    for (const o of occurrencesOn(date, d.blocks, d.locations)) {
      if (o.end > from && o.start < to && o.start >= from - 24 * 60 * MIN_MS) out.push({ block: o.block, date, start: o.start, end: o.end });
    }
  }
  return out.filter((e) => e.start < to && e.end > from).sort((a, b) => a.start - b.start);
}

/** Side by side when they overlap (Google Calendar style). A block is never drawn under 5 minutes tall. */
function lanes(list: Entry[]) {
  const vend = (e: Entry) => Math.max(e.end, e.start + SHORTEST * MIN_MS);
  const out: { e: Entry; lane: number; lanes: number }[] = [];
  let group: typeof out = [];
  let groupEnd = -Infinity;
  const flush = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); for (const g of group) g.lanes = n; out.push(...group); group = []; };
  for (const e of list) {
    if (e.start >= groupEnd && group.length) flush();
    const ends: number[] = [];
    for (const g of group) ends[g.lane] = Math.max(ends[g.lane] ?? -Infinity, vend(g.e));
    let lane = 0;
    while (ends[lane] !== undefined && ends[lane] > e.start) lane++;
    group.push({ e, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, vend(e));
  }
  if (group.length) flush();
  return out;
}

export function Day({ data, now }: { data: AppData; now: Ms }) {
  const ui = useUI();
  const today = planDay(now);
  const [day, setDay] = useState<DateKey>(today);
  const [slide, setSlide] = useState('');
  const [px, setPx] = useState(loadZoom); // pixels per minute
  const [drag, setDrag] = useState<{ key: string; delta: number } | null>(null);
  const [asking, setAsking] = useState<{ e: Entry; delta: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const live = useRef({ px, day, dragging: false, pinch: null as null | { d0: number; z0: number; focal: number; midY: number }, swipe: null as null | { x: number; y: number } });
  live.current.px = px;
  live.current.day = day;

  const gridStart = at(day, DAY_START);
  const y = (ms: Ms) => ((ms - gridStart) / MIN_MS) * px;
  const placed = lanes(entriesFor(data, day));
  const showNow = planDay(now) === day;

  // Fill the screen below the header; open with "now" a quarter of the way down
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => { el.style.height = `${Math.max(300, window.innerHeight - el.getBoundingClientRect().top - 8)}px`; };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && day === today) el.scrollTop = Math.max(0, ((now - gridStart) / MIN_MS) * px - el.clientHeight / 4);
  }, [day]);

  // Swipe for days, pinch to zoom, and no scrolling while a block is being dragged
  useEffect(() => {
    const el = scroller.current!;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      const L = live.current;
      if (e.touches.length === 2) {
        const r = el.getBoundingClientRect();
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        L.pinch = { d0: dist(e.touches), z0: L.px, focal: (el.scrollTop + midY) / L.px, midY };
        L.swipe = null;
      } else if (e.touches.length === 1) L.swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onMove = (e: TouchEvent) => {
      const L = live.current;
      if (L.dragging) { e.preventDefault(); return; }
      if (L.pinch && e.touches.length === 2) {
        e.preventDefault();
        const z = clampZoom(L.pinch.z0 * (dist(e.touches) / L.pinch.d0));
        setPx(z);
        requestAnimationFrame(() => { el.scrollTop = L.pinch ? L.pinch.focal * z - L.pinch.midY : el.scrollTop; });
      }
    };
    const onEnd = (e: TouchEvent) => {
      const L = live.current;
      if (L.pinch && e.touches.length < 2) { L.pinch = null; saveZoom(L.px); return; }
      const t = e.changedTouches[0];
      if (L.swipe && !L.dragging && t) {
        const dx = t.clientX - L.swipe.x;
        const dy = t.clientY - L.swipe.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
          setSlide(dx < 0 ? 'from-right' : 'from-left');
          setDay((k) => addDays(k, dx < 0 ? 1 : -1));
        }
      }
      L.swipe = null;
    };
    const noZoom = (e: Event) => e.preventDefault(); // iOS page zoom
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('gesturestart', noZoom);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('gesturestart', noZoom);
    };
  }, []);

  // Tap an empty spot: a new event starting there (to the nearest 5 minutes; change it in the form)
  const onGridClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.pd-ev')) return;
    const r = grid.current!.getBoundingClientRect();
    const min = Math.round((e.clientY - r.top) / px / 5) * 5;
    ui.open({ kind: 'form', date: day, startMin: DAY_START + Math.max(0, Math.min(24 * 60 - 60, min)) });
  };

  // Hold a block to drag it, minute by minute. A tap opens it.
  const blockHandlers = (en: Entry) => {
    const key = `${en.block.id}@${en.date}`;
    return {
      onPointerDown: (e: PointerEvent) => {
        const y0 = e.clientY;
        let held = false;
        let moved = false;
        let delta = 0;
        const timer = setTimeout(() => {
          held = true;
          live.current.dragging = true;
          navigator.vibrate?.(15);
          setDrag({ key, delta: 0 });
        }, 400);
        const move = (ev: PointerEvent) => {
          if (!held) { if (Math.abs(ev.clientY - y0) > 8) { moved = true; clearTimeout(timer); } return; }
          delta = Math.round((ev.clientY - y0) / live.current.px);
          setDrag({ key, delta });
        };
        const up = () => {
          clearTimeout(timer);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', cancel);
          live.current.dragging = false;
          if (!held) {
            if (!moved) ui.open({ kind: 'view', blockId: en.block.id, date: en.date, start: en.start, end: en.end });
            return;
          }
          setDrag(null);
          if (!delta) return;
          if (en.block.recurrence.kind !== 'once') setAsking({ e: en, delta });
          else commit((d, n) => actions.moveOccurrence(d, en.block.id, en.date, delta, 'all', n));
        };
        const cancel = () => { clearTimeout(timer); live.current.dragging = false; setDrag(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
      },
      onContextMenu: (e: Event) => e.preventDefault(),
    };
  };

  return (
    <div class="pd">
      <div class="pd-head">
        <div class="pd-date">
          <span>{fmtDay(day, { weekday: 'long' })}</span>
          <b>{fmtDay(day, { month: 'long', day: 'numeric' })}</b>
        </div>
        {day !== today && <button class="pd-today" onClick={() => { setSlide(day > today ? 'from-left' : 'from-right'); setDay(today); }}>Today</button>}
      </div>
      <div class="pd-scroll" ref={scroller}>
        <div key={day} class={`pd-grid ${slide}`} ref={grid} style={{ height: `${24 * 60 * px}px` }} onClick={onGridClick}>
          {Array.from({ length: 24 }, (_, h) => (
            <div class="pd-hour" style={{ top: `${h * 60 * px}px` }} aria-hidden="true">
              <span>{h === 0 ? '' : hourLabel((4 + h) % 24)}</span>
            </div>
          ))}
          {placed.map(({ e, lane, lanes: n }) => {
            const key = `${e.block.id}@${e.date}`;
            const delta = drag?.key === key ? drag.delta : 0;
            const top = y(e.start + delta * MIN_MS);
            const h = Math.max(SHORTEST, (e.end - e.start) / MIN_MS) * px - 2;
            const lines = Math.max(0, Math.floor((h - 38) / 17));
            const one = h < 34;
            return (
              <div
                class={`pd-ev ${one ? 'one' : ''} ${delta || drag?.key === key ? 'dragging' : ''}`}
                style={{
                  top: `${top}px`, height: `${Math.max(4, h)}px`, '--ev': colorHex(e.block.color),
                  left: `calc(52px + (100% - 56px) * ${lane / n})`, width: `calc((100% - 56px) / ${n} - 3px)`,
                }}
                {...blockHandlers(e)}
              >
                <div class="pd-ev__title">{e.block.title}{one && <span class="pd-ev__time">, {fmtTime(e.start + delta * MIN_MS)}</span>}</div>
                {!one && <div class="pd-ev__time">{fmtTime(e.start + delta * MIN_MS)} – {fmtTime(e.end + delta * MIN_MS)}</div>}
                {!one && lines > 0 && e.block.notes && <div class="pd-ev__notes" style={{ WebkitLineClamp: lines }}>{e.block.notes}</div>}
              </div>
            );
          })}
          {showNow && <div class="pd-now" style={{ top: `${y(now)}px` }} aria-label={`Now, ${fmtTime(now)}`} />}
        </div>
      </div>
      {asking && (
        <ScopeChoice
          title={`Move "${asking.e.block.title}"`}
          onPick={(scope) => { const a = asking; setAsking(null); commit((d, n) => actions.moveOccurrence(d, a.e.block.id, a.e.date, a.delta, scope, n)); }}
          onCancel={() => setAsking(null)}
        />
      )}
    </div>
  );
}
