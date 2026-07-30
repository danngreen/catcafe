// The shared half of a save file, and the rules for changing it.
//
// Phase 2 moves the cafe's books onto the server: money, the pantry, the bag,
// the cats, quest flags and the clock all live here, and every client is a view
// onto them. Clients send small operations rather than whole fields, so two
// people buying at the same moment both get what they paid for; the server
// applies each one in arrival order and echoes back the field it changed.

export const DAY_SECONDS = 20 * 60;
export const HOUR_SECONDS = DAY_SECONDS / 24;

/** Everything a client may set wholesale. Anything else is ignored. */
export const FIELDS = new Set([
  'money', 'reputation', 'inventory', 'stock', 'cats', 'cafe', 'flags', 'quests', 'questStep',
  'friends', 'workers', 'materials', 'employee', 'shopOpen', 'shopHours',
  'visited', 'mail', 'pendingLetters', 'bestDayProfit', 'totalCustomers', 'daysPlayed',
  'deliveries',
]);

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
