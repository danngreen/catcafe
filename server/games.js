// Several valleys at once.
//
// A Room was already self-contained — players, books, clock, sim owner and save
// path all live on the instance, and it never holds a map, only a seed and the
// cafe's books. So hosting more than one is a registry and a routing decision
// rather than a rewrite: rooms are a few kilobytes each, and the 9,000-odd
// objects of an actual valley are built in each browser from the seed.
//
// Rooms are made on demand and kept once made, because a room that nobody is
// in is still the thing the clock stops for and the thing the next player
// joins.

import { readdirSync, readFileSync, writeFileSync, renameSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Room } from './room.js';

const FILE = /^valley-(\d{3})\.json$/;
const idOf = (n) => String(n).padStart(3, '0');

export class Games {
  /** `dir` null means play without saving anything — rooms live in memory. */
  constructor(dir) {
    this.dir = dir;
    this.rooms = new Map();
    if (dir) mkdirSync(dir, { recursive: true });
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
    if (!/^\d{3}$/.test(String(id))) return null;
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

  persistAll() { for (const room of this.rooms.values()) room.persist(); }

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
