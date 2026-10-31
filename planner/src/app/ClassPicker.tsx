import { useState } from 'preact/hooks';
import type { Format, SchoolClass } from '../core/types';
import { actions, type AppData } from './model';
import { commit } from './store';
import { uid } from './format';

export const CLASS_COLORS = ['#e5484d', '#f97316', '#eab308', '#16a34a', '#0d9488', '#0ea5e9', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#78716c', '#334155'];

/** Online / Paper / Other: exactly one. */
export function TypePicker({ value, onChange }: { value: Format | null; onChange: (f: Format | null) => void }) {
  const opts: { v: Format | null; label: string }[] = [
    { v: 'online', label: 'Online' },
    { v: 'paper', label: 'Paper' },
    { v: null, label: 'Other' },
  ];
  return (
    <div class="segmented type-pick" role="radiogroup">
      {opts.map((o) => (
        <button type="button" role="radio" aria-checked={value === o.v} class={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A small colored tag for a class. */
export function ClassTag({ c }: { c: SchoolClass | undefined }) {
  if (!c) return null;
  return (
    <span class="class-tag" style={{ '--c': c.color }}>
      <i />
      {c.name}
    </span>
  );
}

/**
 * Class dropdown for an assignment: pick one, make a new one, or edit the picked one, all right here
 * (no settings page). Picking a class fills in its usual type.
 */
export function ClassPicker(p: { data: AppData; value: string | undefined; onChange: (id: string | undefined, c?: SchoolClass) => void }) {
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [isNew, setIsNew] = useState(false);
  const current = p.data.classes.find((c) => c.id === p.value);

  const startNew = () => {
    setIsNew(true);
    setEditing({ id: uid(), name: '', color: CLASS_COLORS[p.data.classes.length % CLASS_COLORS.length], format: 'online' });
  };
  const save = () => {
    if (!editing || !editing.name.trim()) return;
    const c = { ...editing, name: editing.name.trim() };
    commit((d) => actions.saveClass(d, c));
    p.onChange(c.id, c);
    setEditing(null);
    setIsNew(false);
  };

  return (
    <div class="class-pick">
      <div class="row">
        <select
          value={editing && isNew ? '__new' : (p.value ?? '')}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === '__new') return startNew();
            setEditing(null);
            setIsNew(false);
            p.onChange(v || undefined, p.data.classes.find((c) => c.id === v));
          }}
        >
          <option value="">No class</option>
          {p.data.classes.map((c) => (
            <option value={c.id}>{c.name}</option>
          ))}
          <option value="__new">+ New class…</option>
        </select>
        {current && !editing && (
          <button type="button" class="link" onClick={() => { setIsNew(false); setEditing({ ...current }); }}>
            Edit
          </button>
        )}
      </div>
      {editing && (
        <div class="class-edit">
          <input
            value={editing.name}
            placeholder="Class name, e.g. AP Macro"
            onInput={(e) => setEditing({ ...editing, name: e.currentTarget.value })}
            autoFocus
          />
          <div class="swatches" role="radiogroup" aria-label="Color">
            {CLASS_COLORS.map((col) => (
              <button
                type="button"
                role="radio"
                aria-checked={editing.color === col}
                aria-label={col}
                class={editing.color === col ? 'on' : ''}
                style={{ '--c': col }}
                onClick={() => setEditing({ ...editing, color: col })}
              />
            ))}
          </div>
          <span class="field-label">Usually</span>
          <TypePicker value={editing.format} onChange={(f) => setEditing({ ...editing, format: f })} />
          <div class="row class-edit__btns">
            <button type="button" class="btn small primary" disabled={!editing.name.trim()} onClick={save}>
              {isNew ? 'Add class' : 'Save class'}
            </button>
            <button type="button" class="btn small" onClick={() => { setEditing(null); setIsNew(false); }}>
              Cancel
            </button>
            {!isNew && (
              <button
                type="button"
                class="link danger"
                onClick={() => {
                  if (!confirm(`Delete the class "${editing.name}"? Its assignments just lose the tag.`)) return;
                  commit((d) => actions.deleteClass(d, editing.id));
                  p.onChange(undefined);
                  setEditing(null);
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
