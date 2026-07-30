// The clock. A full day — dawn through night and round again — takes twenty
// real minutes. Weekends bring more customers; several shops keep their own
// hours and simply won't open for you.

import { clamp, lerp } from '../engine/util.js';
import { P } from '../art/palette.js';

export const DAY_SECONDS = 20 * 60;
export const HOUR_SECONDS = DAY_SECONDS / 24;

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

export class Clock {
  constructor(startDay = 0, startHour = 8) {
    this.day = startDay;                 // absolute day since the game began
    this.t = startHour * HOUR_SECONDS;   // seconds elapsed today
    this.newDay = false;                 // set for one frame when the date rolls
    this.newHour = false;
    this._lastHour = this.hour;
    this.paused = false;
  }

  update(dt, speed = 1) {
    if (this.paused) { this.newDay = false; this.newHour = false; return; }
    this.newDay = false;
    this.t += dt * speed;
    if (this.t >= DAY_SECONDS) {
      this.t -= DAY_SECONDS;
      this.day++;
      this.newDay = true;
    }
    const h = this.hour;
    this.newHour = h !== this._lastHour;
    this._lastHour = h;
  }

  /** Skip forward to a given hour, rolling the date if needed. */
  skipTo(hour) {
    const target = hour * HOUR_SECONDS;
    if (target <= this.t) { this.day++; this.newDay = true; }
    this.t = target;
    this._lastHour = this.hour;
  }

  get hour() { return Math.floor(this.t / HOUR_SECONDS); }
  get minute() { return Math.floor((this.t % HOUR_SECONDS) / HOUR_SECONDS * 60); }
  get hourFloat() { return this.t / HOUR_SECONDS; }
  /** Seconds since the valley began. Deadlines need a clock that never wraps. */
  get absolute() { return this.day * DAY_SECONDS + this.t; }
  get dayOfWeek() { return this.day % 7; }
  get dayName() { return DAY_NAMES[this.dayOfWeek]; }
  get dayFull() { return DAY_FULL[this.dayOfWeek]; }
  get isWeekend() { return this.dayOfWeek === 0 || this.dayOfWeek === 6; }
  get week() { return Math.floor(this.day / 7) + 1; }
  get season() { return SEASONS[Math.floor(this.day / 28) % 4]; }

  /** "7:05 am" — the HUD reads better in 12-hour time. */
  format() {
    const h24 = this.hour;
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    const m = String(this.minute).padStart(2, '0');
    return `${h}:${m}${h24 < 12 ? 'am' : 'pm'}`;
  }

  /**
   * How dark it is, 0..1, and what colour the darkness is.
   * Dawn 5-7, day 7-17, dusk 17-20, night 20-5.
   */
  lighting() {
    const h = this.hourFloat;
    let night = 0;
    let tint = P.nightTint;
    if (h >= 20 || h < 5) {
      night = 0.62;
      tint = P.nightTint;
    } else if (h >= 5 && h < 7) {
      const t = (h - 5) / 2;
      night = lerp(0.62, 0, t);
      tint = t < 0.6 ? P.dawnTint : P.nightTint;
      if (t < 0.6) night = lerp(0.62, 0.10, t / 0.6);
    } else if (h >= 17 && h < 20) {
      const t = (h - 17) / 3;
      night = lerp(0, 0.62, t);
      tint = t < 0.66 ? P.duskTint : P.nightTint;
      if (t < 0.66) night = lerp(0, 0.30, t / 0.66);
    }
    return { night: clamp(night, 0, 1), tint };
  }

  /** True while lamps should be lit. */
  get isDark() { const h = this.hourFloat; return h >= 18.5 || h < 6.2; }

  /** Which music track suits the current place and hour. */
  trackFor(mapMusic) {
    if (this.isDark && (mapMusic === 'field' || mapMusic === 'town')) return 'night';
    return mapMusic;
  }

  /** Serialise / restore. */
  save() { return { day: this.day, t: this.t }; }
  load(s) { if (!s) return; this.day = s.day | 0; this.t = s.t || 0; this._lastHour = this.hour; }
}

/** Is a shop open right now? */
export function shopOpen(shop, clock) {
  if (!shop) return false;
  const days = shop.days || [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(clock.dayOfWeek)) return false;
  const [o, c] = shop.hours || [0, 24];
  const h = clock.hourFloat;
  return h >= o && h < c;
}

/** Human-readable opening hours, for the "sorry, we're closed" sign. */
export function hoursText(shop) {
  if (!shop) return '';
  const [o, c] = shop.hours || [0, 24];
  const fmt = (h) => {
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}${h < 12 ? 'am' : 'pm'}`;
  };
  const days = shop.days || [0, 1, 2, 3, 4, 5, 6];
  let dayStr;
  if (days.length === 7) dayStr = 'Every day';
  else if (days.length === 6 && !days.includes(0)) dayStr = 'Mon-Sat';
  else if (days.length === 5 && !days.includes(0) && !days.includes(6)) dayStr = 'Weekdays';
  else if (days.length === 2 && days.includes(0) && days.includes(6)) dayStr = 'Weekends';
  else dayStr = days.map((d) => DAY_NAMES[d]).join(' ');
  return `${dayStr}, ${fmt(o)}-${fmt(c)}`;
}
