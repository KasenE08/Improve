import { actions, type AppData } from './model';
import { commit } from './store';
import { SheetFrame, useUI } from './ui';
import { fmtDue, fmtDur, fmtTime } from './format';
import { Icon } from './icons';
import { ClassTag } from './ClassPicker';

/** An assignment on its own page: when, due, notes, and Done. */
export function TaskDetail({ data, id }: { data: AppData; id: string }) {
  const ui = useUI();
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return null;
  const cls = data.classes.find((c) => c.id === t.classId);
  const end = t.at != null ? t.at + t.estimateMin * 60_000 : null;
  const late = t.status !== 'done' && t.due !== null && end !== null && end > t.due;
  const done = t.status === 'done';
  const lines = (t.notes ?? '').split('\n').length;

  return (
    <SheetFrame title="Assignment" full>
      <div class="detail-head" style={{ '--cat': cls?.color ?? 'var(--imp-accent)' }}>
        {cls && <ClassTag c={cls} />}
        <h2 class={done ? 'is-done' : ''}>{t.title}</h2>
      </div>

      <button
        class={`btn ${done ? '' : 'primary'} wide done-btn`}
        onClick={() => commit((d, n) => (done ? actions.reopenTask(d, id, n) : actions.completeTask(d, id, n)))}
      >
        <Icon name="check" size={18} /> {done ? 'Done · tap to undo' : 'Mark done'}
      </button>

      <div class="group">
        <div class="g-row">
          <span class="g-label">When</span>
          <span class="g-value">{t.at != null ? `${fmtDue(t.at)} – ${fmtTime(end!)} (${fmtDur(t.estimateMin)})` : 'Not on the calendar'}</span>
        </div>
        <div class="g-row">
          <span class="g-label">Due</span>
          <span class={`g-value ${late ? 'warn' : ''}`}>{t.due === null ? 'No due date' : fmtDue(t.due)}{late ? ' · ends after' : ''}</span>
        </div>
        {done && t.completedAt && (
          <div class="g-row">
            <span class="g-label">Finished</span>
            <span class="g-value">{fmtDue(t.completedAt)}</span>
          </div>
        )}
      </div>

      <label class="field">
        <span class="field-label">Notes</span>
        <textarea
          class="notes-full"
          rows={Math.max(4, lines + 1)}
          placeholder="Add notes…"
          value={t.notes ?? ''}
          onChange={(e) => {
            const v = e.currentTarget.value;
            commit((d) => actions.setNotes(d, id, v));
          }}
        />
      </label>

      <div class="detail-more">
        <button class="btn" onClick={() => ui.open({ kind: 'task', task: t })}>
          <Icon name="edit" size={16} /> Edit
        </button>
        <button
          class="btn danger"
          onClick={() => {
            if (!confirm(`Delete "${t.title}"?`)) return;
            commit((d, n) => actions.deleteTask(d, id, n));
            ui.close();
          }}
        >
          <Icon name="trash" size={16} /> Delete
        </button>
      </div>
    </SheetFrame>
  );
}
