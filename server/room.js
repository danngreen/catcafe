// The shared session. The server owns the world seed, the roster, the clock and
// the cafe's books; it relays where everybody is standing, and it nominates one
// client to run the customer simulation so the takings are counted once.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { applyOp, applyRescue, WorldClock } from './world.js';

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
// Every playing client says once a second that its frame loop is turning. The
// socket's own ping can't tell us that: a browser answers those from a tab
// that has been in the background for an hour, and a tab in the background
// simulates nothing — so the cafe stood still for everybody while the server
// was quite sure its owner was alive and well.
const FRAME_STALE_MS = 5_000;
// When the owner's connection goes, wait this long for the same browser to
// come back before giving the cafe to somebody else. A wifi blip is two or
// three seconds, and a handover is the more disruptive of the two.
const OWNER_GRACE_MS = 10_000;
// Somebody rearranging the cafe who drops off the network is holding a plan
// with half the furniture picked up. Keep their place for this long; after
// that somebody else may have it.
const BUILD_HOLD_MS = 30_000;
// How long to wait for the morning's books before asking for them again.
const CASHUP_RETRY_MS = 4_000;

export class Room {
  constructor(seed, savePath = null) {
    this.seed = seed;
    this.players = new Map();     // socket id -> player
    this.nextNumber = 1;
    this.savePath = savePath;
    this.world = null;            // seeded by whoever starts playing first
    this.clock = new WorldClock();
    this.owner = null;            // id of the client running the cafe sim
    this.ownerSince = 0;
    this.ownerGrace = null;       // { who, until } while waiting for a dropped owner
    // The last day somebody cashed up. The day rolls here but the books are
    // done on a client, and a client can be away at midnight; this is how we
    // know to ask again rather than letting the day go unpaid.
    this.cashedDay = this.clock.day;
    this.cashAskedAt = 0;
    // Who is rearranging the cafe, if anybody: { id, who, name, goneAt }. One
    // at a time. A plan is drawn up on a copy and laid over the cafe whole when
    // it is finished, so two drawn up at once means the second flattens the
    // first — and there is no honest way to combine them: two sofas on one
    // tile, a chair in a room the other plan knocked down.
    this.builder = null;
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
    return { id: p.id, n: p.name, look: p.look, x: p.x, y: p.y, dir: p.dir, map: p.map, up: !!p.up };
  }

  attach(ws) {
    const player = {
      id: ws.id,
      number: this.nextNumber++,
      name: null,                 // set by the join message
      look: null,
      x: 0, y: 0, dir: 'down', frame: 0, map: 'overworld', up: false,
      joined: false,
      lastSeen: Date.now(),
      frameAt: 0,                 // last time their frame loop said it was turning
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
      // Already taken out by replaceSelf, which has said everything there is
      // to say about it. Saying it again re-ran the owner vote at the one
      // moment the returning player could not win it.
      if (this.players.get(ws.id) !== player) return;
      this.players.delete(ws.id);
      if (player.joined) {
        this.broadcast({ t: 'left', id: player.id });
        console.log(`[room] ${player.name || player.id} left (${this.count} playing)`);
      }
      // The owner dropping is not the owner leaving. Hold the cafe for them
      // for a few seconds unless they said goodbye on the way out.
      if (this.owner === player.id && player.who && !ws.leftOnPurpose && this.count) {
        this.ownerGrace = { who: player.who, until: Date.now() + OWNER_GRACE_MS };
      }
      if (this.builder && this.builder.id === player.id) {
        if (ws.leftOnPurpose || !player.who) this.builder = null;
        else this.builder.goneAt = Date.now();
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
        // The same browser coming back. A lost connection is only noticed when
        // it goes quiet, which takes a while and is a while spent standing next
        // to a copy of yourself that has your name and is not you. Being told
        // "this is me" is faster and surer than any timeout, so the old one
        // goes now — and the name it was holding is free again for its owner.
        player.who = typeof msg.who === 'string' ? msg.who.slice(0, 64) : null;
        const tookOver = player.who ? this.replaceSelf(player) : false;
        player.name = this.uniqueName(String(msg.name || `Player ${player.number}`).slice(0, 16));
        player.look = msg.look || null;
        player.x = Number(msg.x) || 0;
        player.y = Number(msg.y) || 0;
        player.map = String(msg.map || 'overworld');
        player.joined = true;
        player.frameAt = Date.now();
        // The same person on a new connection keeps the cafe they were running.
        if (tookOver) this.setOwner(player.id);
        // And the plan they were in the middle of.
        if (this.builder && player.who && this.builder.who === player.who) {
          this.builder.id = player.id;
          this.builder.goneAt = null;
        }
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
        player.up = !!msg.up;                 // riding the bear
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
        this.cashedDay = this.clock.day;
        this.dirty = true;
        console.log(`[room] ${player.name || player.id} opened the cafe`);
        // Not back to the seeder: it's their own world, and adopting it would
        // rebuild the cafe under their feet for no reason.
        this.broadcast({ t: 'world', world: this.world, clock: this.clock.save() }, player.id);
        break;
      }
      // Asking to rearrange the cafe, or saying they have finished.
      case 'build': {
        if (!player.joined) break;
        if (!msg.on) {
          if (this.builder && this.builder.id === player.id) this.builder = null;
          break;
        }
        const b = this.builder;
        const holder = b && this.players.get(b.id);
        const theirs = b && (b.id === player.id || (player.who && b.who === player.who));
        // Free, or ours already, or held by somebody who isn't there to use
        // it: gone past their time, or a tab nobody has looked at for a while.
        const lapsed = b && !theirs && (holder
          ? Date.now() - holder.frameAt > BUILD_HOLD_MS
          : Date.now() - (b.goneAt || 0) > BUILD_HOLD_MS);
        if (b && !theirs && !lapsed) {
          player.ws.sendJSON({ t: 'build', ok: false, by: b.name });
          break;
        }
        if (lapsed && holder) holder.ws.sendJSON({ t: 'build', ok: false, by: player.name });
        this.builder = { id: player.id, who: player.who, name: player.name, goneAt: null };
        player.ws.sendJSON({ t: 'build', ok: true });
        break;
      }
      case 'op': {
        if (!this.world) break;
        // The cafe's layout belongs to whoever is rearranging it. Anybody
        // else's write is turned away and they are told what the cafe really
        // looks like, so their screen and the books agree again.
        if (msg.k === 'cafe' && this.builder && this.builder.id !== player.id) {
          player.ws.sendJSON({ t: 'sync', k: 'cafe', v: this.world.cafe });
          break;
        }
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
        if (rolled) {
          this.cashAskedAt = Date.now();
          this.broadcast({ t: 'newday', day: this.clock.day, by: player.name });
        }
        break;
      }
      // Only the sim owner's customers are real; everyone else draws copies.
      case 'cust':
        if (player.id === this.owner) this.broadcast({ t: 'cust', c: msg.c }, player.id);
        break;
      case 'summary':
        // The morning card is also the receipt: the books for today are done.
        // Taken from whoever did them, once — the cafe may have changed hands
        // between the day turning and the card arriving, and turning the card
        // away would have the new owner pay everybody's wages a second time.
        if (!player.joined) break;
        if (this.cashedDay >= this.clock.day && player.id !== this.owner) break;
        this.cashedDay = this.clock.day;
        this.dirty = true;
        this.broadcast({ t: 'summary', s: msg.s }, player.id);
        break;
      // "My frame loop is turning" — or, with ok false, "my tab has just been
      // hidden and it is about to stop".
      case 'alive':
        player.frameAt = msg.ok === false ? 0 : Date.now();
        if (msg.ok === false && player.id === this.owner) this.chooseOwner();
        break;
      // Leaving on purpose, so nobody holds the cafe open for their return.
      case 'bye':
        player.ws.leftOnPurpose = true;
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
   * A change from the host rather than a player — see the admin port in
   * server.js. It goes out exactly like any player's op, as a plain sync, so
   * nobody's screen announces it: the till just has more in it.
   */
  rescue(op) {
    if (!this.world) return { ok: false, why: 'nobody has opened the cafe in this valley yet' };
    const changed = applyRescue(this.world, op);
    this.dirty = true;
    for (const k of changed) this.broadcast({ t: 'sync', k, v: this.world[k] });
    const cats = Array.isArray(this.world.cats) ? this.world.cats : [];
    return {
      ok: true,
      changed,
      money: this.world.money,
      cats: cats.length,
      sick: cats.filter((c) => c.sick).length,
      hungry: cats.filter((c) => c.hunger > 0).length,
      playing: this.count,
    };
  }

  /**
   * Take out whoever this browser was before. Called as they join, so the
   * valley never holds two of anybody: the old connection is dropped, everyone
   * is told they left, and the name goes back on the shelf.
   */
  replaceSelf(player) {
    let wasOwner = false;
    for (const old of [...this.players.values()]) {
      if (old === player || old.who !== player.who) continue;
      this.players.delete(old.id);
      if (old.joined) {
        this.broadcast({ t: 'left', id: old.id });
        console.log(`[room] ${old.name || old.id} came back on a new connection`);
      }
      // Seniority belongs to the person, not the connection.
      player.number = Math.min(player.number, old.number);
      if (this.owner === old.id) wasOwner = true;
      try { old.ws.close(1000, 'replaced'); } catch { /* already gone */ }
    }
    // Or the old connection had already been noticed and the cafe is being
    // held for them.
    if (this.ownerGrace && this.ownerGrace.who === player.who) {
      this.ownerGrace = null;
      wasOwner = true;
    }
    return wasOwner;
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
      cashedDay: this.cashedDay,
      builder: this.builder ? this.builder.name : null,
      sockets: this.players.size,
      playing: this.count,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        joined: p.joined,
        simulating: p.joined && now - p.frameAt < FRAME_STALE_MS,
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
    const now = Date.now();
    // Sticky: hand over only when the current owner has actually gone, or has
    // stopped simulating and somebody else could. A player who drops and comes
    // back gets a new socket, and re-running the vote on every reconnect would
    // pass the cafe back and forth.
    const live = (p) => now - p.frameAt < FRAME_STALE_MS;
    const joined = [...this.players.values()].filter((p) => p.joined);
    joined.sort((a, b) => a.number - b.number);
    const held = this.players.get(this.owner);
    if (held && held.joined) {
      if (live(held)) return;
      // A stalled owner is still better than nobody: with no one else awake
      // the cafe is theirs to come back to.
      const awake = joined.find(live);
      if (!awake) return;
      console.log(`[room] ${held.name || held.id} has stopped simulating — ${awake.name || awake.id} runs the cafe`);
      this.setOwner(awake.id);
      return;
    }
    // Holding the cafe for an owner who dropped a moment ago.
    if (this.ownerGrace) {
      if (now < this.ownerGrace.until && joined.length) { this.setOwner(null); return; }
      this.ownerGrace = null;
    }
    const next = joined.find(live) || joined[0] || null;
    this.setOwner(next ? next.id : null);
  }

  setOwner(id) {
    if (id === this.owner) return;
    this.owner = id;
    this.ownerSince = Date.now();
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
      if (quiet > (p.ws.idleMs || IDLE_TIMEOUT_MS)) {
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

    // Has the owner gone quiet, or has the wait for a dropped one run out?
    const owner = this.players.get(this.owner);
    if (this.ownerGrace ? now >= this.ownerGrace.until
      : (joined.length && (!owner || now - owner.frameAt >= FRAME_STALE_MS))) {
      this.chooseOwner();
    }

    if (this.builder && this.builder.goneAt && now - this.builder.goneAt > BUILD_HOLD_MS) {
      this.builder = null;
    }

    // A morning nobody has cashed up: the owner was away when it came, or
    // changed hands as it did. Ask whoever runs the cafe now.
    if (this.world && this.cashedDay < this.clock.day && now - this.cashAskedAt > CASHUP_RETRY_MS) {
      const o = this.players.get(this.owner);
      if (o && o.joined) {
        this.cashAskedAt = now;
        o.ws.sendJSON({ t: 'cashup', day: this.clock.day });
      }
    }

    // The valley only ages while somebody is in it — a server left running
    // overnight should not eat a fortnight of wages.
    if (joined.length && this.world) {
      if (this.clock.advance(dt)) {
        this.dirty = true;
        this.cashAskedAt = now;
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
      const key = `${Math.round(p.x)},${Math.round(p.y)},${p.dir},${p.frame},${p.map},${p.up ? 1 : 0}`;
      if (p.lastPos === key) return false;
      p.lastPos = key;
      return true;
    });
    if (!moved.length) return;
    const pos = moved.map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.dir, p.frame, p.map, p.up ? 1 : 0]);
    const text = JSON.stringify({ t: 'pos', p: pos });
    for (const p of joined) p.ws.send(text);
  }

  /**
   * Shut this room down for good. Stops the clock, turns off saving so the file
   * we are about to remove isn't written straight back out, and turns anybody
   * still attached loose — though the caller is expected to have refused while
   * the valley had people in it.
   */
  close() {
    clearInterval(this.timer);
    this.dirty = false;
    for (const p of [...this.players.values()]) {
      try { p.ws.close(1001, 'game removed'); } catch { /* already gone */ }
    }
    this.players.clear();
    this.closed = true;
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
      // A save from before this was kept is taken to be up to date.
      this.cashedDay = Number.isFinite(data.cashedDay) ? data.cashedDay : this.clock.day;
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
      writeFileSync(tmp, JSON.stringify({
        seed: this.seed, world: this.world, clock: this.clock.save(), cashedDay: this.cashedDay,
      }));
      renameSync(tmp, this.savePath);
    } catch (err) {
      console.warn('[room] could not save the valley:', err.message);
    }
  }
}
