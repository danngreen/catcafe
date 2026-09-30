// Holidays: a few weeks a year when the valley dresses up.
//
// A holiday is a real-world date range, not an in-game one. The in-game year
// has its own Spring/Summer/Autumn/Winter (clock.season), which only decides the
// weather; Halloween is in October because that's when the family is carving
// pumpkins, whatever day the valley is on.
//
// Who decides whether it's on:
//   - `?holiday=halloween` (or `?holiday=off`) in the address bar, first. For
//     previewing on any day, and for tests.
//   - the server, when there is one. It goes by its own calendar and the
//     HOLIDAY environment variable, and tells every player the same thing, so
//     a shared valley is never half decorated because two phones disagree about
//     the date.
//   - this device's own calendar, when playing alone with no server.
//
// It's decided once, before the world is built, and holds until the page is
// reloaded: trees, costumes and decorations are baked when the world is made.
//
// What a holiday touches is marked in the content with `holiday: 'halloween'`
// (items, quests) and gated through `inHoliday()`, so it all simply goes quiet
// afterwards. Nothing is deleted from anybody's save.
//
// This file must stay free of browser APIs: the server imports it too.

/** Every holiday there is. `from` and `to` are MM-DD, inclusive. */
export const HOLIDAYS = [
  { id: 'halloween', name: 'Halloween', from: '10-15', to: '11-02' },
];

const BY_ID = Object.fromEntries(HOLIDAYS.map((h) => [h.id, h]));

/**
 * Which holiday is on at `date`, as { id, year }, or null. `override` is an
 * id to force one on, or 'off' to force them all off; anything else falls
 * through to the calendar.
 *
 * `year` is the year the holiday started, so a window that runs over New Year
 * (Christmas into January) is still one holiday. It's what a valley remembers
 * so that each year's quests can be played again.
 */
export function holidayOn(date = new Date(), override = null) {
  const o = typeof override === 'string' ? override.trim().toLowerCase() : '';
  if (o === 'off' || o === 'none') return null;
  if (BY_ID[o]) return { id: o, year: startYear(BY_ID[o], date) };
  const md = monthDay(date);
  for (const h of HOLIDAYS) {
    if (within(md, h.from, h.to)) return { id: h.id, year: startYear(h, date) };
  }
  return null;
}

function monthDay(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function within(md, from, to) {
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

function startYear(h, date) {
  const y = date.getFullYear();
  // In the January half of a window that wraps the new year, it started last year.
  return h.from > h.to && monthDay(date) <= h.to ? y - 1 : y;
}

// ---------------------------------------------------------------------------
// The one that's on, for this page
// ---------------------------------------------------------------------------

let current = null;

/** Set once at startup, before the world is built. */
export function setHoliday(h) {
  current = h && BY_ID[h.id] ? { id: h.id, year: Number(h.year) || new Date().getFullYear() } : null;
}

/** { id, year } or null. */
export function holiday() { return current; }

/** Is this particular holiday on? */
export const isHoliday = (id) => !!current && current.id === id;

/** The display name of a holiday id. */
export const holidayName = (id) => (BY_ID[id] ? BY_ID[id].name : id);

/**
 * Whether a piece of content is live now: anything not tied to a holiday
 * always is, anything tied to one only while it's on.
 */
export function inHoliday(entry) {
  return !entry || !entry.holiday || isHoliday(entry.holiday);
}
