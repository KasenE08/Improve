// Local-time date helpers. All keys are in the phone's local timezone.
// Day keys look like "2026-10-24" and sort correctly as plain strings.

const pad = (n) => String(n).padStart(2, '0');

// The app's day runs 4:01 AM → 4:00 AM (same as the Food tab), so late-night check-ins
// still count for the day/week/month you're finishing. appNow() is the moment to use for
// "today": before 4:01 AM it returns noon of the previous calendar day.
export const DAY_START_MIN = 4 * 60 + 1;
export function appNow(d = new Date()) {
  if (d.getHours() * 60 + d.getMinutes() >= DAY_START_MIN) return d;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12);
}

export function dayKey(d = appNow()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

// Monday of the week containing d
export function weekStart(d = appNow()) {
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(d, -dow);
}

// [startKey, endKey] (inclusive) of the period that contains d
export function periodRange(freq, d = appNow()) {
  if (freq === 'weekly') {
    const s = weekStart(d);
    return [dayKey(s), dayKey(addDays(s, 6))];
  }
  if (freq === 'monthly') {
    const s = new Date(d.getFullYear(), d.getMonth(), 1);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return [dayKey(s), dayKey(e)];
  }
  const k = dayKey(d);
  return [k, k];
}

// Whole days left in the period after today (0 on the last day)
export function daysLeft(freq, d = appNow()) {
  const [, end] = periodRange(freq, d);
  return Math.round((fromDayKey(end) - fromDayKey(dayKey(d))) / 86400000);
}

export function msUntilMidnight(d = new Date()) {
  return addDays(d, 1).getTime() - d.getTime();
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function prettyDate(d = appNow()) {
  return `${DOW[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}`;
}
