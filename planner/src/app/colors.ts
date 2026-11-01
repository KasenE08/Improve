// The event colors: each basic color and a dark version of it.
export const COLORS: { id: string; name: string; hex: string }[] = [
  { id: 'red', name: 'Red', hex: '#ef4444' },
  { id: 'darkred', name: 'Dark red', hex: '#991b1b' },
  { id: 'orange', name: 'Orange', hex: '#f97316' },
  { id: 'darkorange', name: 'Dark orange', hex: '#9a3412' },
  { id: 'yellow', name: 'Yellow', hex: '#eab308' },
  { id: 'darkyellow', name: 'Dark yellow', hex: '#a16207' },
  { id: 'green', name: 'Green', hex: '#22c55e' },
  { id: 'darkgreen', name: 'Dark green', hex: '#166534' },
  { id: 'blue', name: 'Blue', hex: '#3b82f6' },
  { id: 'darkblue', name: 'Dark blue', hex: '#1e3a8a' },
  { id: 'purple', name: 'Purple', hex: '#a855f7' },
  { id: 'darkpurple', name: 'Dark purple', hex: '#6b21a8' },
  { id: 'gray', name: 'Gray', hex: '#9ca3af' },
  { id: 'darkgray', name: 'Dark gray', hex: '#4b5563' },
];
export const DEFAULT_COLOR = 'blue';
export const colorHex = (id?: string) => (COLORS.find((c) => c.id === id) ?? COLORS.find((c) => c.id === DEFAULT_COLOR)!).hex;

/** A starting color for events made before colors existed, from what they're called. */
export function autoColor(title: string, tag?: string): string {
  const t = `${title} ${tag ?? ''}`.toLowerCase();
  if (/homework|\bhw\b|assignment|essay|study/.test(t)) return 'purple';
  if (/tutor/.test(t)) return 'darkblue';
  if (/school|class/.test(t)) return 'blue';
  if (/gym|lift|workout|run\b/.test(t)) return 'green';
  if (/archery|practice|activity|sport/.test(t)) return 'darkgreen';
  if (/work|shift|job/.test(t)) return 'orange';
  if (/interview|call|zoom|studio/.test(t)) return 'red';
  if (/grocer|gas|rice|chicken|wash|store/.test(t)) return 'yellow';
  if (/wake|dress|sleep|shower|bed/.test(t)) return 'gray';
  return 'darkgray';
}
