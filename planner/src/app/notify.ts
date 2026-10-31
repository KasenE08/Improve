import type { Ms } from '../core/types';
import { addDays, at, dateKey } from '../core/time';
import { encryptPayload } from '../push/webpush';
import { fromB64url, toB64url, utf8 } from '../push/b64';
import type { AppData, PushState } from './model';
import { fmtDue, fmtDur, fmtTime } from './format';

export interface Note {
  at: Ms;
  title: string;
  body: string;
  /** Task to open when the notification is tapped. */
  taskId?: string;
  tag: string;
}

/** Reminders go out this long before each event and assignment. */
export const LEAD_MIN = 5;

/**
 * A reminder 5 minutes before every unfinished assignment and every event, from the start of today
 * through `notifyDays`. Deterministic, so it doubles as the "does the server need an update" fingerprint.
 */
export function notifications(d: AppData, now: Ms): Note[] {
  if (!d.plan) return [];
  const today = dateKey(now);
  const from = at(today, 0);
  const to = at(addDays(today, d.settings.notifyDays), 0);
  const tasks = new Map(d.tasks.map((t) => [t.id, t]));
  const lead = LEAD_MIN * 60_000;
  const out: Note[] = [];
  for (const i of d.plan.items) {
    const t = tasks.get(i.taskId);
    const when = i.start - lead;
    if (!t || t.status === 'done' || when < from || when >= to) continue;
    out.push({
      at: when,
      title: t.title,
      body: [`In ${LEAD_MIN} min · ${fmtTime(i.start)}–${fmtTime(i.end)} (${fmtDur(t.estimateMin)})`, t.due === null ? null : `Due ${fmtDue(t.due)}`]
        .filter(Boolean)
        .join('\n'),
      taskId: t.id,
      tag: `task-${t.id}`,
    });
  }
  for (const e of d.plan.events ?? []) {
    const when = e.start - lead;
    if (when < from || when >= to) continue;
    out.push({ at: when, title: e.title, body: `In ${LEAD_MIN} min · ${fmtTime(e.start)}–${fmtTime(e.end)}`, tag: `event-${e.blockId}-${e.start}` });
  }
  return out.sort((a, b) => a.at - b.at || a.tag.localeCompare(b.tag));
}

export const fingerprint = (notes: Note[]) => JSON.stringify(notes);

/** Encrypts each upcoming notification for this phone. The server only ever sees times and ciphertext. */
export async function encryptNotes(notes: Note[], push: Pick<PushState, 'p256dh' | 'auth'>, now: Ms) {
  const ua = fromB64url(push.p256dh);
  const auth = fromB64url(push.auth);
  return Promise.all(
    notes
      .filter((n) => n.at > now)
      .map(async (n) => ({
        at: n.at,
        body: toB64url(await encryptPayload(utf8(JSON.stringify({ title: n.title, body: n.body, tag: n.tag, taskId: n.taskId })), ua, auth)),
      })),
  );
}
