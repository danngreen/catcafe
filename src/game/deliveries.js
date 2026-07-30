// Orders that come in over the telephone, and have to be carried somewhere.
//
// A delivery is not a sale. Nothing moves when the order is taken — the pantry
// and the money only change at the far end, when somebody actually takes the
// bag off you. Which means an order is a promise you can fail to keep, and
// failing costs you the fee rather than anything worse.
//
// The whole thing is one plain object in the shared books, so a co-op valley
// sees the same orders on the same map, and either player can run them.

import { ITEMS, isMenuItem } from './items.js';
import { HOUR_SECONDS } from './time.js';

const MENU_IDS = Object.keys(ITEMS).filter((id) => isMenuItem(id));

/** How long they will wait, in game hours. */
export const MIN_HOURS = 3;
export const MAX_HOURS = 8;

/** A pound of fee for every five blocks, as the crow flies. */
export const BLOCKS_PER_FEE = 5;

let serial = 1;

// --- when the phone rings ---------------------------------------------------
//
// Derived from the seed and the date, the same trick the weather and the
// regulars use, so every player in a valley hears it ring at the same moment
// without a byte crossing the network. Whether a given ring has been dealt
// with is a flag, so answering it on one machine silences it on all of them.

/** How long it rings before whoever it was gives up, in seconds. */
export const RING_SECONDS = 22;

function hash(a, b, c) {
  let h = 0x811c9dc5 ^ Math.imul(a | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= Math.imul(b | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= Math.imul(c | 0, 0x165667b1);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/**
 * The times of day the phone will ring. Two to four calls, spread across the
 * hours anybody would ring a cafe — nobody orders a delivery at four in the
 * morning, and a phone that rings while you are asleep is a phone you resent.
 */
export function ringsOn(seed, day) {
  const count = 2 + Math.floor(hash(seed, day, 0) * 3);
  const out = [];
  for (let i = 0; i < count; i++) {
    const hour = 9 + hash(seed, day, i + 1) * 10;          // 9am to 7pm
    out.push({ id: `${day}-${i}`, at: hour * HOUR_SECONDS });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * The call ringing right now, if any and if nobody has dealt with it. `handled`
 * is asked about a ring's id — answered or refused, either way it stops.
 */
export function ringingNow(seed, clock, handled) {
  for (const r of ringsOn(seed, clock.day)) {
    if (clock.t < r.at || clock.t >= r.at + RING_SECONDS) continue;
    if (handled(r.id)) continue;
    return r;
  }
  return null;
}

/** Straight-line distance in tiles. */
export function blocksTo(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** What the trip pays on top of the food. */
export function feeFor(from, to) {
  return Math.max(1, Math.round(blocksTo(from, to) / BLOCKS_PER_FEE));
}

/**
 * Somebody on the phone, wanting between one and five things. Weighted by
 * appeal like a walk-in order, because the same people are ringing up.
 */
export function rollOrder(rng = Math.random) {
  const pool = MENU_IDS.slice();
  const want = 1 + Math.floor(rng() * 5);
  const picks = [];
  for (let n = 0; n < want && pool.length; n++) {
    const weights = pool.map((id) => 0.35 + ITEMS[id].appeal);
    const total = weights.reduce((s, v) => s + v, 0);
    let r = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= weights[i]; if (r <= 0) break; }
    picks.push(pool[i]);
    pool.splice(i, 1);
  }
  return picks;
}

/**
 * Build the order, ready to go in the books. `at` is where it has to go and
 * `from` is the cafe door, which is what the fee is measured from.
 */
export function makeDelivery(place, from, now, rng = Math.random) {
  const items = rollOrder(rng);
  const hours = MIN_HOURS + rng() * (MAX_HOURS - MIN_HOURS);
  return {
    id: `d${serial++}-${Math.floor(now)}`,
    items,
    x: place.x,
    y: place.y,
    name: place.name,
    town: place.town || null,
    house: place.house || null,          // set if it is inside somebody's house
    taken: now,
    due: now + hours * HOUR_SECONDS,
    fee: feeFor(from, place),
  };
}

/** What the food alone is worth at the counter price. */
export function goodsValue(items) {
  return items.reduce((s, id) => s + (ITEMS[id]?.price || 0), 0);
}

/** The most this run could pay, if you turn up with everything. */
export function fullValue(d) {
  return goodsValue(d.items) + d.fee;
}

/** Seconds left, or zero. */
export function timeLeft(d, now) {
  return Math.max(0, d.due - now);
}

/** How much of the wait is left, 0..1 — what the ring on the map draws. */
export function timeFraction(d, now) {
  const span = d.due - d.taken;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (d.due - now) / span));
}

export function expired(d, now) { return now >= d.due; }

/** Only the ones still worth walking to. */
export function live(list, now) {
  return (list || []).filter((d) => !expired(d, now));
}

/**
 * Settle up at the door. You are paid for whatever you actually brought, and
 * the fee in full for having come at all — a short delivery is still a
 * delivery. Turn up with none of it and there is nothing to pay for.
 */
export function settle(d, stockCount) {
  const brought = [];
  const missing = [];
  for (const id of d.items) {
    // Count what we have left as we go, so two of the same thing needs two.
    const already = brought.filter((b) => b === id).length;
    if (stockCount(id) > already) brought.push(id);
    else missing.push(id);
  }
  const goods = goodsValue(brought);
  return {
    brought,
    missing,
    goods,
    fee: brought.length ? d.fee : 0,
    total: brought.length ? goods + d.fee : 0,
  };
}

/** "2 x Latte, Sponge Cake" — for the map and the phone call. */
export function orderText(items) {
  const counts = {};
  for (const id of items) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts)
    .map(([id, n]) => (n > 1 ? `${n} x ${ITEMS[id]?.name || id}` : ITEMS[id]?.name || id))
    .join(', ');
}
