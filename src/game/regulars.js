// Regulars: the people who come to you.
//
// Most of the cast stand somewhere in the valley waiting to be found. A regular
// does the opposite — they let themselves into your cafe every so often, cross
// the room, and wait to be spoken to. You cannot go and look for them, which
// makes the cafe somewhere to be rather than somewhere to leave from.
//
// Whether one is due is worked out from the world seed and the date, the same
// trick the weather uses: every player in a shared valley gets the same visitor
// on the same evening with nothing sent between them.

import { VILLAGERS } from '../world/places.js';

export const REGULARS = VILLAGERS.filter((v) => v.regular);
export const REGULAR_BY_ID = Object.fromEntries(REGULARS.map((r) => [r.id, r]));

/** How long they stay once they are in, in game-hours. */
const STAY_HOURS = 3;

/** Deterministic hash of a string and two numbers. */
function hash(id, a, b) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h ^= Math.imul(a | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= Math.imul(b | 0, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/**
 * When a regular is due on a given day, or null if they are not coming.
 *
 * Deliberately less than daily: a visitor you can count on is a shopkeeper.
 * Night folk arrive after dark and daytime ones in the afternoon, so whoever
 * turns up suits the hour they turn up in.
 */
export function visitOn(def, seed, day) {
  if (!def) return null;
  const roll = hash(def.id, seed, day);
  if (roll > (def.visitChance != null ? def.visitChance : 0.4)) return null;
  const night = def.when === 'night';
  const spread = hash(def.id, seed, day + 7777);
  const from = night ? 19 + spread * 3.5 : 11 + spread * 6;
  return { from, to: from + STAY_HOURS };
}

/**
 * Is this regular in the room right now? `waiting` says somebody has business
 * with them — an errand of theirs is sat on a step that only they can move —
 * in which case they turn up that evening rather than whenever the dice say.
 * Waiting days for a visitor to finish a job you have already done is not
 * suspense, it is a bug with a calendar.
 */
export function dueNow(def, seed, clock, waiting = false) {
  if (!def) return false;
  const h = clock.hourFloat;
  const window = visitOn(def, seed, clock.day);
  if (window && h >= window.from && h < window.to) return true;
  if (!waiting) return false;
  // The standing invitation: whatever the dice said, they come at their usual
  // sort of hour on a day when you have something for them.
  const night = def.when === 'night';
  return night ? (h >= 20 && h < 23.5) : (h >= 12 && h < 16);
}

/** Everyone who might walk in today, for the cafe screen to mention. */
export function dueToday(seed, day) {
  return REGULARS.filter((r) => visitOn(r, seed, day)).map((r) => r.id);
}
