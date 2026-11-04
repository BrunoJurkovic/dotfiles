// Source: ~/.dotfiles/herdr-app/.config/herdr-app/lib/time.js (copied in by herdr-reload; edit there).
// Durations as short text. Draw them in MONO 11 so digits don't jitter. All take milliseconds.

const minutes = (ms) => Math.max(0, Math.floor(ms / 60000));

// How long something has been working: <1m, 4m, 1h12m, 2d3h.
export function worked(ms) {
  const m = minutes(ms);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h${m % 60}m` : `${Math.floor(h / 24)}d${h % 24}h`;
}

// How long ago something happened, one unit: <1m, 4m, 3h, 2d.
export function ago(ms) {
  const m = minutes(ms);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// Time until a limit resets, spoken: now, 45m, 2h 13m, 3d 4h.
export function resetsIn(ms) {
  const m = minutes(ms);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
