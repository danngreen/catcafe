// Who may come into a valley on the public server.
//
// There are no accounts. A valley has an invite code (plum-otter-4271) that
// anybody may be given; whoever brings it gets a device key of their own, and
// that key is what lets their phone back in from then on. The device that made
// the valley holds the creator key, the only one that can change the code or
// send everybody else away.
//
// Keys are kept hashed in the valley's file, so a copied save lets nobody in.
// On the LAN none of this runs: everyone in the house is welcome.

import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { ADJECTIVES, NOUNS } from './words.js';

const CODE = /^[a-z]+-[a-z]+-\d{4}$/;

/** A fresh code. Not checked for clashes: the caller does that. */
export function newCode() {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]}-${NOUNS[randomInt(NOUNS.length)]}-${randomInt(1000, 10000)}`;
}

/**
 * A code as somebody might type it — "Plum Otter 4271", "plum_otter-4271 ",
 * a phone's autocapitalized "Plum-otter-4271" — in the one form it's stored
 * in, or null if it can't be one.
 */
export function normalizeCode(input) {
  const parts = String(input || '').toLowerCase().match(/[a-z]+|\d+/g);
  if (!parts || parts.length !== 3) return null;
  const code = parts.join('-');
  return CODE.test(code) ? code : null;
}

/** A device key: long, random, and safe in a URL. */
export const newKey = () => randomBytes(18).toString('base64url');

/** What a key is kept as. */
export const hashKey = (key) => createHash('sha256').update(String(key)).digest('base64url');

/** Compare two hashes without telling a timing attacker how close they got. */
export function sameHash(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A random valley id, never shown to players. */
export const newValleyId = () => randomBytes(8).toString('hex').slice(0, 10);

/**
 * Counts things per key in a sliding window and says when a key has had its
 * share. In memory only: a restart forgets, which is fine for keeping a
 * guessing script or a runaway tab in check.
 */
export class Limiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();          // key -> [times]
  }

  recent(key, now) {
    const list = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list); else this.hits.delete(key);
    return list;
  }

  /** Would one more be allowed? */
  ok(key, now = Date.now()) { return this.recent(key, now).length < this.limit; }

  /** Count one. */
  hit(key, now = Date.now()) {
    const list = this.recent(key, now);
    list.push(now);
    this.hits.set(key, list);
    // Somebody spraying addresses shouldn't cost us memory forever.
    if (this.hits.size > 50_000) this.prune(now);
  }

  /** Allowed? If so, count it. */
  take(key, now = Date.now()) {
    if (!this.ok(key, now)) return false;
    this.hit(key, now);
    return true;
  }

  prune(now = Date.now()) {
    for (const key of [...this.hits.keys()]) this.recent(key, now);
  }
}
