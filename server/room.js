// The shared session. The server owns the world seed, the roster, the clock and
// the cafe's books; it relays where everybody is standing, and it nominates one
// client to run the customer simulation so the takings are counted once.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { applyOp, WorldClock } from './world.js';

const TICK_HZ = 15;
// We ping each socket ourselves and the browser answers without involving the
// page, so a silent socket really is a dead one. Generous all the same: this
// costs us nothing and a wrongly dropped player is a wrecked game.
const PING_EVERY_MS = 10_000;
const IDLE_TIMEOUT_MS = 60_000;
// The roster goes out as arrival/departure events, which is fine until one of
// them goes missing — after that two clients disagree about who is in the
// valley for as long as they both stay connected, and the one who missed an
// arrival never draws that player, never sends them customers, never anything.
// So re-state the whole thing regularly; it is a few hundred bytes.
const ROSTER_EVERY_MS = 5_000;
const CLOCK_BROADCAST_MS = 1000;
const SAVE_EVERY_MS = 20_000;

export class Room {
  constructor(seed, savePath = null) {
    this.seed = seed;
    this.players = new Map();     // socket id -> player
    this.nextNumber = 1;
    this.savePath = savePath;
    this.world = null;            // seeded by whoever starts playing first
    this.clock = new WorldClock();
    this.owner = null;            // id of the client running the cafe sim
    this.dirty = false;
    this.lastTick = Date.now();
    this.sinceClock = 0;
    this.sinceSave = 0;
    this.sinceRoster = 0;
    this.restore();
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
    this.timer.unref?.();
  }

  /** Public view of a player, as sent to clients. */
  static describe(p) {
    return { id: p.id, n: p.name, look: p.look, x: p.x, y: p.y, dir: p.dir, map: p.map };
  }

  attach(ws) {
    const player = {
      id: ws.id,
      number: this.nextNumber++,
      name: null,                 // set by the join message
      look: null,
      x: 0, y: 0, dir: 'down', frame: 0, map: 'overworld',
      joined: false,
      lastSeen: Date.now(),
      ws,
    };
    this.players.set(ws.id, player);

    ws.on('message', (text) => {
      player.lastSeen = Date.now();
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      this.handle(player, msg);
    });

    ws.on('close', () => {
      this.players.delete(ws.id);
      if (player.joined) {
        this.broadcast({ t: 'left', id: player.id });
        console.log(`[room] ${player.name || player.id} left (${this.count} playing)`);
      }
      this.chooseOwner();
      this.announcePresence();
      if (!this.count) this.persist();     // the last one out saves the valley
    });

    // Everything the client needs before it can build the world.
    ws.sendJSON({
      t: 'welcome',
      id: player.id,
      seed: this.seed,
      players: this.roster(),
      here: this.players.size,
      world: this.world,
      clock: this.clock.save(),
      owner: this.owner,
    });
    this.announcePresence();
  }

  /**
   * How many browsers are attached, whether or not they've started playing.
   * The title screen needs this: someone sitting on their title screen is
   * connected but not yet in the roster, and reporting "nobody here" then is
   * indistinguishable from being on the wrong server entirely.
   */
  announcePresence() {
    this.broadcast({ t: 'presence', here: this.players.size, playing: this.count });
  }

  handle(player, msg) {
    switch (msg.t) {
      case 'join': {
        player.name = this.uniqueName(String(msg.name || `Player ${player.number}`).slice(0, 16));
        player.look = msg.look || null;
        player.x = Number(msg.x) || 0;
        player.y = Number(msg.y) || 0;
        player.map = String(msg.map || 'overworld');
        player.joined = true;
        this.broadcast({ t: 'joined', p: Room.describe(player) }, player.id);
        // They may not have got the name they asked for.
        player.ws.sendJSON({ t: 'youare', name: player.name });
        // Late joiners need the roster and the books as they stand *now*, not as
        // they were at connect: somebody who left the title screen open while
        // the rest of you played a morning would otherwise undo it.
        player.ws.sendJSON({ t: 'roster', players: this.roster(player.id) });
        if (this.world) {
          player.ws.sendJSON({ t: 'world', world: this.world, clock: this.clock.save() });
        }
        this.chooseOwner();
        this.announcePresence();
        console.log(`[room] ${player.name} joined (${this.count} playing)`);
        break;
      }
      case 'move': {
        player.x = Number(msg.x) || 0;
        player.y = Number(msg.y) || 0;
        player.dir = msg.dir || 'down';
        player.frame = msg.frame | 0;
        player.map = String(msg.map || 'overworld');
        break;
      }
      // The first player to start play hands us the world they built. Later
      // arrivals get it in their welcome, so only the first one is ever taken.
      case 'seedworld': {
        if (this.world || !msg.world) {
          if (this.world) player.ws.sendJSON({ t: 'world', world: this.world, clock: this.clock.save() });
          break;
        }
        this.world = msg.world;
        this.clock = WorldClock.from(msg.clock);
        this.dirty = true;
        console.log(`[room] ${player.name || player.id} opened the cafe`);
        // Not back to the seeder: it's their own world, and adopting it would
        // rebuild the cafe under their feet for no reason.
        this.broadcast({ t: 'world', world: this.world, clock: this.clock.save() }, player.id);
        break;
      }
      case 'op': {
        if (!this.world) break;
        const changed = applyOp(this.world, msg);
        if (!changed.length) break;
        this.dirty = true;
        for (const k of changed) this.broadcast({ t: 'sync', k, v: this.world[k] });
        break;
      }
      case 'skip': {                       // somebody slept
        const hour = Number(msg.hour);
        if (!Number.isFinite(hour)) break;
        const rolled = this.clock.skipTo(hour);
        this.dirty = true;
        this.broadcast({ t: 'clock', c: this.clock.save() });
        if (rolled) this.broadcast({ t: 'newday', day: this.clock.day, by: player.name });
        break;
      }
      // Only the sim owner's customers are real; everyone else draws copies.
      case 'cust':
        if (player.id === this.owner) this.broadcast({ t: 'cust', c: msg.c }, player.id);
        break;
      case 'summary':
        if (player.id === this.owner) this.broadcast({ t: 'summary', s: msg.s }, player.id);
        break;
      // Serving is the one thing a non-owner does to the simulation, so it goes
      // to whoever is running it.
      case 'serve': {
        const owner = this.players.get(this.owner);
        if (owner && owner.id !== player.id) owner.ws.sendJSON({ t: 'serve', x: msg.x, y: msg.y });
        break;
      }
      case 'ping':
        player.ws.sendJSON({ t: 'pong', at: msg.at });
        break;
      default:
        break;
    }
  }

  /**
   * Nobody gets a name somebody else in the valley is already using. Only the
   * server can decide this — a client picking from the list has no idea who
   * else is here, and two Wrens are indistinguishable in every message we send,
   * which are keyed by socket id but read by name.
   */
  uniqueName(wanted) {
    const taken = new Set([...this.players.values()].filter((p) => p.joined).map((p) => p.name));
    if (!taken.has(wanted)) return wanted;
    for (let n = 2; n < 40; n++) {
      const tryName = `${wanted} ${n}`.slice(0, 16);
      if (!taken.has(tryName)) return tryName;
    }
    return `${wanted}${Math.floor(Math.random() * 900 + 100)}`.slice(0, 16);
  }

  get count() { return [...this.players.values()].filter((p) => p.joined).length; }

  /**
   * What the server thinks is going on, for /status. When two people disagree
   * about who can see whom, the useful question is which of them the server has
   * actually got in the game — and that isn't visible from either screen.
   */
  status() {
    const now = Date.now();
    return {
      seed: this.seed,
      day: this.clock.day,
      cafeOpened: !!this.world,
      money: this.world ? this.world.money : null,
      owner: this.owner,
      sockets: this.players.size,
      playing: this.count,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        joined: p.joined,
        map: p.map,
        at: `${Math.round(p.x)},${Math.round(p.y)}`,
        quietFor: `${Math.round((now - p.ws.lastActivity) / 1000)}s`,
      })),
    };
  }

  /**
   * The longest-standing player runs the cafe. Somebody has to: if every client
   * simulated its own customers, each would ring up the same sale.
   */
  chooseOwner() {
    // Sticky: hand over only when the current owner has actually gone. A player
    // who drops and comes back gets a new socket, and re-running the vote on
    // every reconnect would pass the cafe back and forth.
    const held = this.players.get(this.owner);
    if (held && held.joined) return;
    const joined = [...this.players.values()].filter((p) => p.joined);
    joined.sort((a, b) => a.number - b.number);
    const next = joined.length ? joined[0].id : null;
    if (next === this.owner) return;
    this.owner = next;
    this.broadcast({ t: 'owner', id: this.owner });
  }

  roster(exceptId) {
    return [...this.players.values()]
      .filter((p) => p.joined && p.id !== exceptId)
      .map(Room.describe);
  }

  broadcast(obj, exceptId) {
    const text = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.id === exceptId) continue;
      p.ws.send(text);
    }
  }

  /** Positions go out as compact tuples; at 15Hz for 8 players it's nothing. */
  tick() {
    const now = Date.now();
    const dt = Math.min(1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    for (const p of [...this.players.values()]) {
      // Anything arriving on the socket counts, including the automatic answer
      // to our own ping. Judging liveness by game messages alone meant a player
      // standing still — or one whose messages weren't getting through — looked
      // identical to one who had closed the lid.
      const quiet = now - p.ws.lastActivity;
      if (quiet > IDLE_TIMEOUT_MS) {
        console.warn(`[room] ${p.name || p.id} silent for ${Math.round(quiet / 1000)}s — hanging up`);
        p.ws.close(1001, 'idle');
        continue;
      }
      if (now - (p.pingedAt || 0) > PING_EVERY_MS) {
        p.pingedAt = now;
        p.ws.ping();
      }
    }

    const joined = [...this.players.values()].filter((p) => p.joined);

    // The valley only ages while somebody is in it — a server left running
    // overnight should not eat a fortnight of wages.
    if (joined.length && this.world) {
      if (this.clock.advance(dt)) {
        this.dirty = true;
        this.broadcast({ t: 'newday', day: this.clock.day });
      }
      this.sinceClock += dt * 1000;
      if (this.sinceClock >= CLOCK_BROADCAST_MS) {
        this.sinceClock = 0;
        // Nested, not spread: the clock's own `t` would otherwise overwrite the
        // message type and the whole thing would arrive as an unknown message.
        this.broadcast({ t: 'clock', c: this.clock.save() });
      }
      this.sinceSave += dt * 1000;
      if (this.sinceSave >= SAVE_EVERY_MS) { this.sinceSave = 0; this.persist(); }
    }

    if (joined.length < 2) return;        // nobody to tell

    // Who is actually here, restated. Cheap insurance against a lost `joined`.
    this.sinceRoster += dt * 1000;
    if (this.sinceRoster >= ROSTER_EVERY_MS) {
      this.sinceRoster = 0;
      for (const p of joined) {
        p.ws.sendJSON({ t: 'who', p: joined.filter((o) => o !== p).map(Room.describe) });
      }
    }

    // Only people who have actually moved. Standing about is the common case,
    // and it used to cost fifteen messages a second per player to say so.
    const moved = joined.filter((p) => {
      const key = `${Math.round(p.x)},${Math.round(p.y)},${p.dir},${p.frame},${p.map}`;
      if (p.lastPos === key) return false;
      p.lastPos = key;
      return true;
    });
    if (!moved.length) return;
    const pos = moved.map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.dir, p.frame, p.map]);
    const text = JSON.stringify({ t: 'pos', p: pos });
    for (const p of joined) p.ws.send(text);
  }

  // ------------------------------------------------------------- persistence

  restore() {
    if (!this.savePath) return;
    try {
      const data = JSON.parse(readFileSync(this.savePath, 'utf8'));
      if (data.seed !== this.seed) {
        console.log('[room] saved valley is from a different seed — starting fresh');
        return;
      }
      this.world = data.world || null;
      this.clock = WorldClock.from(data.clock);
      if (this.world) console.log(`[room] resumed day ${this.clock.day} from ${this.savePath}`);
    } catch { /* no save yet */ }
  }

  persist() {
    if (!this.savePath || !this.world || !this.dirty) return;
    this.dirty = false;
    // Write beside the target and rename, so a crash mid-write can't leave a
    // half-written valley where the real one was.
    const tmp = `${this.savePath}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify({ seed: this.seed, world: this.world, clock: this.clock.save() }));
      renameSync(tmp, this.savePath);
    } catch (err) {
      console.warn('[room] could not save the valley:', err.message);
    }
  }
}
