// Which holiday the server says it is, for every valley it hosts.
//
// One answer for everybody, from this machine's calendar, so a shared valley is
// never half-decorated because two phones disagree about the date. HOLIDAY=
// halloween forces one on, HOLIDAY=off forces them all off; unset, it goes by
// the date. It is looked at again every ten minutes, so a holiday starts and
// ends on its own without anybody restarting anything.
//
// The date is this machine's local date. A server kept in UTC turns over at
// UTC midnight; `TZ=America/Los_Angeles` in the service puts it on house time.

import { holidayOn } from '../src/holidays/index.js';

const CHECK_EVERY_MS = 10 * 60 * 1000;

let current = holidayOn(new Date(), process.env.HOLIDAY || null);

/** { id, year } or null. */
export const currentHoliday = () => current;

/** Call `onChange(next)` whenever the answer changes. */
export function watchHoliday(onChange) {
  const t = setInterval(() => {
    const next = holidayOn(new Date(), process.env.HOLIDAY || null);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next;
    onChange(next);
  }, CHECK_EVERY_MS);
  if (t.unref) t.unref();
  return t;
}
