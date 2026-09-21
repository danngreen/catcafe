// The shared half of a save file, and the rules for changing it.
//
// Phase 2 moves the cafe's books onto the server: money, the pantry, the bag,
// the cats, quest flags and the clock all live here, and every client is a view
// onto them. Clients send small operations rather than whole fields, so two
// people buying at the same moment both get what they paid for; the server
// applies each one in arrival order and echoes back the field it changed.

export const DAY_SECONDS = 20 * 60;
export const HOUR_SECONDS = DAY_SECONDS / 24;

/**
 * Everything a client may set wholesale. Anything else is ignored.
 *
 * Silently ignored, which is the trap: add a field to the books, publish it
 * with touch(), forget this list, and the value lives happily in the client
 * that changed it and exists nowhere else. It is not in the other player's
 * game and it is not in the save, so it survives exactly as long as the tab
 * does. That is how ten deliveries could be run and counted and still leave
 * the tally at zero, and how a bear could be bought for five thousand and not
 * be there in the morning.
 *
 * The `books` scenario checks this list against GameState.snapshot(), because
 * the failure has no symptom until somebody reloads.
 */
export const FIELDS = new Set([
  'money', 'reputation', 'inventory', 'stock', 'cats', 'cafe', 'flags', 'quests', 'questStep',
  'friends', 'workers', 'materials', 'employee', 'shopOpen', 'shopHours',
  'visited', 'mail', 'pendingLetters', 'bestDayProfit', 'bestDayGross',
  'totalCustomers', 'daysPlayed',
  'deliveries', 'deliveriesRun', 'bear',
]);

function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

/** A key a client may name. Not one that would reach into the object itself. */
function safeKey(key) {
  if (typeof key !== 'string' || !key || key.length > 200) return null;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return null;
  return key;
}

/**
 * Apply one operation. Returns the names of the fields it changed, so the room
 * knows what to echo; an unknown or malformed op changes nothing.
 */
export function applyOp(world, op) {
  switch (op.op) {
    case 'money': {
      const d = Number(op.d);
      if (!Number.isFinite(d)) return [];
      world.money = Math.round(world.money + d);
      return ['money'];
    }
    case 'inv': {
      const key = String(op.key || '');
      const d = Math.round(Number(op.d) || 0);
      if (!key || !d) return [];
      const n = (world.inventory[key] || 0) + d;
      if (n > 0) world.inventory[key] = n;
      else delete world.inventory[key];
      return ['inventory'];
    }
    case 'stockAdd': {
      const id = String(op.id || '');
      const qty = Math.round(Number(op.qty) || 0);
      if (!id || qty <= 0) return [];
      (world.stock[id] ||= []).push({ qty, day: Math.round(Number(op.day) || 0) });
      return ['stock'];
    }
    case 'stockTake': {
      // Oldest batch first, so the pantry rotates the way the client's does.
      const id = String(op.id || '');
      let need = Math.round(Number(op.qty) || 0);
      const batches = world.stock[id];
      if (!batches || need <= 0) return [];
      for (const b of batches) {
        const take = Math.min(b.qty, need);
        b.qty -= take;
        need -= take;
        if (need <= 0) break;
      }
      world.stock[id] = batches.filter((b) => b.qty > 0);
      if (!world.stock[id].length) delete world.stock[id];
      return ['stock'];
    }
    // Taking a job on, idempotently. Two people can be stood in front of the
    // same villager reading the same offer; whoever finishes reading second
    // must not start it again, because starting again hands out a second
    // parcel and puts the step count back to the beginning.
    case 'quest': {
      const id = String(op.id || '');
      if (!id || !op.state) return [];
      if (op.state === 'active' && world.quests[id]) return [];
      world.quests[id] = op.state;
      return ['quests'];
    }
    // Orders taken over the phone, added and cleared one at a time. Sending
    // the whole list would let two players who each answered a call overwrite
    // one another's order, which is the same mistake whole-map quest writes
    // were making.
    case 'deliveryAdd': {
      const d = op.d;
      if (!d || !d.id) return [];
      world.deliveries ||= [];
      if (world.deliveries.some((x) => x.id === d.id)) return [];
      world.deliveries.push(d);
      return ['deliveries'];
    }
    case 'deliveryDone': {
      const id = String(op.id || '');
      if (!id || !world.deliveries) return [];
      const before = world.deliveries.length;
      world.deliveries = world.deliveries.filter((x) => x.id !== id);
      return world.deliveries.length === before ? [] : ['deliveries'];
    }
    // Steps only ever go forward. A client that is a moment behind must not be
    // able to drag everybody back to where it thinks they are.
    case 'step': {
      const id = String(op.id || '');
      const n = Math.round(Number(op.n));
      if (!id || !Number.isFinite(n)) return [];
      if ((world.questStep[id] || 0) >= n) return [];
      world.questStep[id] = n;
      return ['questStep'];
    }
    // Parts of a field, so that two people changing different parts of it both
    // get what they did. Clients work these out by comparing a field they have
    // touched with what we last told them it was — see src/net/diff.js.
    case 'add': {                          // so much more of a tally
      const k = String(op.k || '');
      const d = Number(op.d);
      if (!FIELDS.has(k) || !Number.isFinite(d) || !d) return [];
      if (typeof world[k] !== 'number' && world[k] != null) return [];
      world[k] = (world[k] || 0) + d;
      return [k];
    }
    case 'put': {                          // one key of a map
      const k = String(op.k || '');
      const key = safeKey(op.key);
      if (!FIELDS.has(k) || key === null || op.v === undefined) return [];
      if (world[k] == null) world[k] = {};
      if (!isPlain(world[k])) return [];
      world[k][key] = op.v;
      return [k];
    }
    case 'del': {
      const k = String(op.k || '');
      const key = safeKey(op.key);
      if (!FIELDS.has(k) || key === null || !isPlain(world[k]) || !(key in world[k])) return [];
      delete world[k][key];
      return [k];
    }
    case 'item': {                         // one member of a list, by its id
      const k = String(op.k || '');
      const v = op.v;
      if (!FIELDS.has(k) || !isPlain(v) || v.id == null) return [];
      if (world[k] == null) world[k] = [];
      if (!Array.isArray(world[k])) return [];
      const i = world[k].findIndex((x) => x && x.id === v.id);
      if (i >= 0) world[k][i] = v; else world[k].push(v);
      return [k];
    }
    case 'patch': {                        // some parts of one member
      const k = String(op.k || '');
      if (!FIELDS.has(k) || !Array.isArray(world[k]) || !isPlain(op.f)) return [];
      // Gone in the meantime — sold, or lapsed. A change to it is moot, and
      // must not bring it back.
      const it = world[k].find((x) => x && x.id === op.id);
      if (!it) return [];
      for (const [key, val] of Object.entries(op.f)) {
        if (key !== 'id' && safeKey(key) !== null) it[key] = val;
      }
      return [k];
    }
    case 'itemDel': {
      const k = String(op.k || '');
      if (!FIELDS.has(k) || !Array.isArray(world[k])) return [];
      const before = world[k].length;
      world[k] = world[k].filter((x) => !(x && x.id === op.id));
      return world[k].length === before ? [] : [k];
    }
    case 'set': {
      const k = String(op.k || '');
      if (!FIELDS.has(k) || op.v === undefined) return [];
      world[k] = op.v;
      return [k];
    }
    default:
      return [];
  }
}

/**
 * Things only the host can do, from the admin port — never reachable from a
 * client message. Same contract as applyOp: returns the fields it changed.
 */
export function applyRescue(world, op) {
  switch (op.op) {
    // Everyone better at once, as if the vet had seen them and they had been
    // fed. A cat that was fine already is left exactly as it was.
    case 'heal': {
      if (!Array.isArray(world.cats)) return [];
      let changed = 0;
      for (const c of world.cats) {
        if (!c.sick && !(c.hunger > 0) && !(c.happiness < 0.7)) continue;
        c.sick = false;
        c.sickDays = 0;
        c.hunger = 0;
        c.happiness = Math.max(c.happiness || 0, 0.7);
        changed++;
      }
      return changed ? ['cats'] : [];
    }
    default:
      return applyOp(world, op);
  }
}

/** The server's clock. Only advances while somebody is actually playing. */
export class WorldClock {
  constructor(day = 1, t = 8 * HOUR_SECONDS) {
    this.day = day;
    this.t = t;
  }

  /** Returns true if the date rolled. */
  advance(dt) {
    this.t += dt;
    if (this.t < DAY_SECONDS) return false;
    this.t -= DAY_SECONDS;
    this.day++;
    return true;
  }

  /** Sleeping. Same rule as the client's clock: going back in time is tomorrow. */
  skipTo(hour) {
    const target = hour * HOUR_SECONDS;
    const rolled = target <= this.t;
    if (rolled) this.day++;
    this.t = target;
    return rolled;
  }

  save() { return { day: this.day, t: this.t }; }
  static from(s) { return s ? new WorldClock(s.day | 0, s.t || 0) : new WorldClock(); }
}
