// Several valleys at once.
//
// A Room was already self-contained — players, books, clock, sim owner and save
// path all live on the instance, and it never holds a map, only a seed and the
// cafe's books. So hosting more than one is a registry and a routing decision
// rather than a rewrite: rooms are a few kilobytes each, and the 9,000-odd
// objects of an actual valley are built in each browser from the seed.
//
// Rooms are made on demand. On the LAN they're kept once made, because a room
// that nobody is in is still the thing the clock stops for and the thing the
// next player joins. On the public server (`codes`), a room nobody has been in
// for a few minutes is written out and put away, since there may be thousands.
//
// The public server also knows who may come in: each valley has an invite code
// and a set of device keys (see access.js), and nothing lists every valley.

import { readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Room } from './room.js';
import { newCode, newKey, hashKey, newValleyId } from './access.js';

// LAN valleys are numbered 001, 002...; public ones have random ids.
const FILE = /^valley-([a-z0-9]{3,16})\.json$/;
const idOf = (n) => String(n).padStart(3, '0');

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
// Put away a public valley nobody has been connected to for this long.
export const UNLOAD_AFTER_MS = 5 * MINUTE;
// A valley somebody made and never started playing goes after a week.
export const NEVER_STARTED_MS = 7 * DAY;
// One nobody has played for a year is archived, and the archive kept a year.
export const UNPLAYED_MS = 365 * DAY;
export const ARCHIVE_KEEP_MS = 365 * DAY;
// More device keys than this and the oldest (never the creator's) give way.
const MAX_KEYS = 200;

export class Games {
  /** `dir` null means play without saving anything — rooms live in memory. */
  constructor(dir, { codes = false } = {}) {
    this.dir = dir;
    this.rooms = new Map();
    this.codes = codes;
    this.byCode = new Map();     // invite code -> valley id, public server only
    if (dir) mkdirSync(dir, { recursive: true });
    if (codes) this.indexCodes();
  }

  pathFor(id) { return this.dir ? join(this.dir, `valley-${id}.json`) : null; }

  /** Every game on disk, plus any that only exist in memory. */
  ids() {
    const out = new Set(this.rooms.keys());
    if (this.dir) {
      for (const f of readdirSync(this.dir)) {
        const m = FILE.exec(f);
        if (m) out.add(m[1]);
      }
    }
    return [...out].sort();
  }

  /** What a save file says, without starting a room for it. */
  readFileFor(id) {
    const p = this.pathFor(id);
    if (!p || !existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
  }

  /**
   * The live room for a game, started if it isn't already. Returns null for an
   * id that names no game — a client asking for one we've never heard of gets
   * nothing rather than a surprise empty valley.
   */
  get(id) {
    if (!/^[a-z0-9]{3,16}$/.test(String(id))) return null;
    let room = this.rooms.get(id);
    if (room) return room;
    const data = this.readFileFor(id);
    if (!data && this.dir) return null;
    const room2 = new Room(data ? data.seed : freshSeed(), this.pathFor(id));
    room2.gameId = id;
    this.rooms.set(id, room2);
    return room2;
  }

  /** Start a new valley. Written out at once, so it is listed immediately. */
  create() {
    const used = new Set(this.ids());
    let n = 1;
    while (used.has(idOf(n)) && n < 999) n++;
    const id = idOf(n);
    const seed = freshSeed();
    const room = new Room(seed, this.pathFor(id));
    room.gameId = id;
    this.rooms.set(id, room);
    // An empty file, so the game appears in the lobby the moment it is made
    // rather than staying invisible until somebody presses Space.
    if (this.dir) {
      const p = this.pathFor(id);
      const tmp = `${p}.tmp`;
      writeFileSync(tmp, JSON.stringify({ seed, world: null, clock: room.clock.save() }));
      renameSync(tmp, p);
    }
    return this.summary(id);
  }

  /**
   * Everything the lobby shows about one game. A live room's own state wins
   * over its file, which may be up to twenty seconds behind it.
   */
  summary(id) {
    const room = this.rooms.get(id);
    const data = room ? { seed: room.seed, world: room.world, clock: room.clock.save() }
      : this.readFileFor(id);
    if (!data) return null;
    const w = data.world || {};
    let lastPlayed = null;
    const p = this.pathFor(id);
    if (p && existsSync(p)) {
      try { lastPlayed = statSync(p).mtimeMs; } catch { /* ignore */ }
    }
    if (room && room.count) lastPlayed = Date.now();
    return {
      id,
      seed: data.seed,
      started: !!data.world,
      cafe: (w.cafe && w.cafe.name) || null,
      money: w.money ?? null,
      cats: Array.isArray(w.cats) ? w.cats.length : 0,
      daysPlayed: w.daysPlayed ?? 0,
      day: data.clock ? data.clock.day : 1,
      t: data.clock ? data.clock.t : 0,
      playing: room ? room.count : 0,
      here: room ? room.players.size : 0,
      lastPlayed,
    };
  }

  list() { return this.ids().map((id) => this.summary(id)).filter(Boolean); }

  /**
   * Throw a valley away. Refused while anybody is connected to it — deleting
   * the ground from under someone mid-afternoon is not a thing to make easy,
   * and the lobby's own check can always be a few seconds out of date.
   */
  remove(id) {
    if (!this.ids().includes(id)) return { ok: false, why: 'no such valley' };
    const room = this.rooms.get(id);
    if (room && room.players.size) {
      return { ok: false, why: room.count ? 'somebody is playing in there' : 'somebody is in the lobby for it' };
    }
    if (room) { room.close(); this.rooms.delete(id); }
    const p = this.pathFor(id);
    if (p && existsSync(p)) {
      try { unlinkSync(p); } catch (err) { return { ok: false, why: err.message }; }
    }
    return { ok: true, id };
  }

  persistAll() { for (const room of this.rooms.values()) room.persist(!!room.access); }

  // ---------------------------------------------------------------------
  // The public server: codes, keys, and putting valleys away
  // ---------------------------------------------------------------------

  /**
   * Learn every valley's code. A valley from before codes existed (the
   * family's, made on the LAN or behind the old password) is given one here
   * and pinned, so it never expires.
   */
  indexCodes() {
    for (const id of this.ids()) {
      const data = this.readFileFor(id);
      if (!data) continue;
      if (data.access && data.access.code) { this.byCode.set(data.access.code, id); continue; }
      data.access = { code: this.uniqueCode(), keys: {}, createdAt: Date.now(), pinned: true };
      this.byCode.set(data.access.code, id);
      this.writeFileFor(id, data);
      console.log(`[valleys] valley ${id} had no code; it's ${data.access.code} now, and pinned`);
    }
  }

  writeFileFor(id, data) {
    const p = this.pathFor(id);
    if (!p) return;
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, p);
  }

  uniqueCode() {
    for (;;) {
      const code = newCode();
      if (!this.byCode.has(code)) return code;
    }
  }

  /** A valley's access record, from its room if it's open, else its file. */
  accessOf(id) {
    const room = this.rooms.get(id);
    if (room) return room.access;
    const data = this.readFileFor(id);
    return (data && data.access) || null;
  }

  /** 'creator', 'member', or null: what this key may do in this valley. */
  roleOf(id, key) {
    if (!key || !/^[a-z0-9]{3,16}$/.test(String(id))) return null;
    const access = this.accessOf(id);
    const entry = access && access.keys[hashKey(key)];
    if (!entry) return null;
    return entry.creator ? 'creator' : 'member';
  }

  /** Make a valley; the device that asked holds its creator key. */
  createPublic() {
    const taken = new Set(this.ids());
    let id = newValleyId();
    while (taken.has(id)) id = newValleyId();
    const room = new Room(freshSeed(), this.pathFor(id));
    room.gameId = id;
    const key = newKey();
    room.access = {
      code: this.uniqueCode(),
      keys: { [hashKey(key)]: { creator: true, at: Date.now() } },
      createdAt: Date.now(),
      pinned: false,
    };
    this.rooms.set(id, room);
    this.byCode.set(room.access.code, id);
    room.persist(true);
    return { id, code: room.access.code, key, creator: true };
  }

  /** Swap an invite code for a device key, or null for a code we don't know. */
  join(code) {
    const id = this.byCode.get(code);
    const room = id && this.get(id);
    if (!room || !room.access) return null;
    const key = newKey();
    const keys = room.access.keys;
    keys[hashKey(key)] = { at: Date.now() };
    // A device that loses its storage joins again with the code and gets a new
    // key, so keys pile up over the years. Let the oldest go, never the creator's.
    const members = Object.entries(keys).filter(([, e]) => !e.creator).sort((a, b) => a[1].at - b[1].at);
    while (Object.keys(keys).length > MAX_KEYS && members.length) delete keys[members.shift()[0]];
    room.persist(true);
    return { id, key, code: room.access.code, creator: false };
  }

  /** The creator's new invite code; the old one stops working. */
  newInviteCode(id, key) {
    if (this.roleOf(id, key) !== 'creator') return null;
    const room = this.get(id);
    this.byCode.delete(room.access.code);
    room.access.code = this.uniqueCode();
    this.byCode.set(room.access.code, id);
    room.persist(true);
    return room.access.code;
  }

  /**
   * The creator sends everybody else away: every other key stops working, the
   * code changes, and anybody connected with one of those keys is disconnected.
   */
  revoke(id, key) {
    if (this.roleOf(id, key) !== 'creator') return null;
    const room = this.get(id);
    const mine = hashKey(key);
    room.access.keys = { [mine]: room.access.keys[mine] };
    this.byCode.delete(room.access.code);
    room.access.code = this.uniqueCode();
    this.byCode.set(room.access.code, id);
    room.persist(true);
    for (const p of [...room.players.values()]) {
      if (p.ws.keyHash !== mine) { try { p.ws.close(4001, 'revoked'); } catch { /* gone */ } }
    }
    return room.access.code;
  }

  /** What a device's title screen shows: each of its valleys, or that it's gone. */
  mine(list) {
    return list.slice(0, 50).map(({ id, key } = {}) => {
      const role = this.roleOf(id, key);
      if (!role) return { id, gone: true };
      return { ...this.summary(id), code: this.accessOf(id).code, creator: role === 'creator' };
    });
  }

  /** Put away valleys nobody has been connected to for a while. */
  sweep(now = Date.now()) {
    let n = 0;
    for (const [id, room] of [...this.rooms]) {
      if (room.players.size || !room.emptySince || now - room.emptySince < UNLOAD_AFTER_MS) continue;
      room.unload();
      this.rooms.delete(id);
      n++;
    }
    return n;
  }

  /**
   * Let go of valleys nobody wants: made and never started, after a week;
   * unplayed for a year, archived; archived for a year, deleted. Pinned
   * valleys, and any open right now, are never touched.
   */
  expire(now = Date.now()) {
    const out = { deleted: [], archived: [], purged: 0 };
    if (!this.dir || !this.codes) return out;
    for (const id of this.ids()) {
      if (this.rooms.has(id)) continue;
      const data = this.readFileFor(id);
      const a = data && data.access;
      if (!a || a.pinned) continue;
      if (!data.world && now - (a.createdAt || now) > NEVER_STARTED_MS) {
        unlinkSync(this.pathFor(id));
        this.byCode.delete(a.code);
        out.deleted.push(id);
      } else if (data.world && now - (data.lastPlayed || a.createdAt || now) > UNPLAYED_MS) {
        const dir = join(this.dir, 'archive');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `valley-${id}.json.gz`), gzipSync(JSON.stringify(data)));
        unlinkSync(this.pathFor(id));
        this.byCode.delete(a.code);
        out.archived.push(id);
      }
    }
    const dir = join(this.dir, 'archive');
    if (existsSync(dir)) {
      const justNow = new Set(out.archived.map((id) => `valley-${id}.json.gz`));
      for (const f of readdirSync(dir)) {
        if (justNow.has(f)) continue;            // archived this pass: its year starts now
        const p = join(dir, f);
        try { if (now - statSync(p).mtimeMs > ARCHIVE_KEEP_MS) { unlinkSync(p); out.purged++; } } catch { /* ignore */ }
      }
    }
    return out;
  }

  /** Never expire this one (or allow it to again). */
  pin(id, on = true) {
    const room = this.get(id);
    if (!room || !room.access) return false;
    room.access.pinned = !!on;
    room.persist(true);
    return true;
  }

  /** A new creator key, for a creator whose device lost its own. */
  addCreator(id) {
    const room = this.get(id);
    if (!room || !room.access) return null;
    const key = newKey();
    room.access.keys[hashKey(key)] = { creator: true, at: Date.now() };
    room.persist(true);
    return key;
  }

  /** Every valley and its code, for the admin port only. */
  links() {
    return this.ids().map((id) => {
      const s = this.summary(id);
      const a = this.accessOf(id) || {};
      return s && { id, code: a.code || null, pinned: !!a.pinned, cafe: s.cafe, day: s.day, playing: s.playing };
    }).filter(Boolean);
  }

  /** How busy the server is, for the admin port only. */
  stats(now = Date.now()) {
    let createdToday = 0, bytes = 0, playing = 0;
    const ids = this.ids();
    for (const id of ids) {
      const a = this.accessOf(id);
      if (a && now - (a.createdAt || 0) < DAY) createdToday++;
      const p = this.pathFor(id);
      try { if (p) bytes += statSync(p).size; } catch { /* ignore */ }
    }
    for (const room of this.rooms.values()) playing += room.count;
    const dir = this.dir && join(this.dir, 'archive');
    const archived = dir && existsSync(dir) ? readdirSync(dir).length : 0;
    return { valleys: ids.length, open: this.rooms.size, playing, createdToday, archived, savesBytes: bytes };
  }

  /**
   * An older single-valley save becomes game 001, so nobody loses an
   * afternoon to a version bump.
   */
  adoptLegacy(legacyPath) {
    if (!this.dir || !legacyPath || !existsSync(legacyPath)) return null;
    if (this.ids().length) return null;
    const target = this.pathFor('001');
    try {
      renameSync(legacyPath, target);
      return target;
    } catch { return null; }
  }
}

function freshSeed() { return Math.floor(Math.random() * 2 ** 31); }
