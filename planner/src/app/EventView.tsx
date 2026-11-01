import { useState } from 'preact/hooks';
import type { FixedBlock, Ms } from '../core/types';
import { actions, type AppData } from './model';
import { commit } from './store';
import { SheetFrame, useUI } from './ui';
import { fmtDay, fmtTime, recurrenceText } from './format';
import { Icon } from './icons';
import { colorHex } from './colors';

/** "Just this one / All of them" for a repeating event. */
export function ScopeChoice({ title, onPick, onCancel }: { title: string; onPick: (scope: 'one' | 'all') => void; onCancel: () => void }) {
  return (
    <div class="ev-choice-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div class="ev-choice" role="dialog" aria-label={title}>
        <p>{title}</p>
        <button class="btn wide" onClick={() => onPick('one')}>Just this one</button>
        <button class="btn wide" onClick={() => onPick('all')}>All of them</button>
        <button class="btn wide ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const repeats = (b: FixedBlock) => b.recurrence.kind !== 'once';

/** Tapping a block: name, time and full notes. ⋯ has Edit and Delete. */
export function EventView({ data, blockId, date, start, end }: { data: AppData; blockId: string; date: string; start: Ms; end: Ms }) {
  const ui = useUI();
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState(false);
  const b = data.blocks.find((x) => x.id === blockId);
  if (!b) return null;

  const del = (scope: 'one' | 'all') => {
    commit((d, now) => actions.deleteOccurrence(d, b.id, date, scope, now));
    ui.close();
  };
  const action = (
    <div class="ev-more">
      <button class="icon-btn" aria-label="More" onClick={() => setMenu(!menu)}><Icon name="more" /></button>
      {menu && (
        <div class="ev-menu" role="menu">
          <button role="menuitem" onClick={() => ui.open({ kind: 'form', block: b, date })}><Icon name="edit" size={16} /> Edit</button>
          <button role="menuitem" class="danger" onClick={() => {
            setMenu(false);
            if (repeats(b)) setAsking(true);
            else if (confirm(`Delete "${b.title}"?`)) del('all');
          }}><Icon name="trash" size={16} /> Delete</button>
        </div>
      )}
    </div>
  );

  return (
    <SheetFrame title="" action={action}>
      <div class="ev-view" style={{ '--ev': colorHex(b.color) }}>
        <h2>{b.title}</h2>
        <p class="ev-when">{fmtDay(start, { weekday: 'long', month: 'long', day: 'numeric' })} · {fmtTime(start)} – {fmtTime(end)}</p>
        {repeats(b) && <p class="ev-repeat"><Icon name="repeat" size={14} /> {recurrenceText(b.recurrence)}</p>}
        {b.notes && <p class="ev-notes">{b.notes}</p>}
      </div>
      {asking && <ScopeChoice title={`Delete "${b.title}"`} onPick={del} onCancel={() => setAsking(false)} />}
    </SheetFrame>
  );
}
