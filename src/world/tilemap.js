// Map data. One structure serves both the open countryside and every interior:
// a ground layer, a solidity mask, a list of y-sorted objects, warps, and a few
// tables for interaction points.

import { TILE, T, TERRAIN, isSolidTerrain } from '../art/tiles.js';
import { OBJECTS } from '../art/objects.js';

export const CHUNK = 16; // tiles per chunk edge

export class GameMap {
  constructor(id, w, h, opts = {}) {
    this.id = id;
    this.name = opts.name || id;
    this.w = w;
    this.h = h;
    this.kind = opts.kind || 'outdoor';
    this.ground = new Uint16Array(w * h).fill(opts.fill ?? T.GRASS);
    this.blocked = new Uint8Array(w * h);   // extra solidity from objects/scripts
    this.objects = [];                       // y-sorted sprites
    this.decals = [];                        // drawn flat, baked into chunks
    this.warps = [];                         // { x, y, to, tx, ty, sound }
    this.npcs = [];
    this.interacts = new Map();              // "x,y" -> { kind, ... }
    this.lights = [];                        // { x, y, r, color }
    this.music = opts.music || 'field';
    this.ambience = opts.ambience || {};
    this.outdoor = this.kind === 'outdoor';
    this.spawn = opts.spawn || { x: 2, y: 2 };
    this.chunksX = Math.ceil(w / CHUNK);
    this.chunksY = Math.ceil(h / CHUNK);
    this.objectChunks = new Map();           // chunk index -> object list
    this.dirtyChunks = new Set();
    this.meta = opts.meta || {};
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  get(x, y) { return this.inBounds(x, y) ? this.ground[y * this.w + x] : T.VOID; }
  set(x, y, id) { if (this.inBounds(x, y)) this.ground[y * this.w + x] = id; }

  fillRect(x, y, w, h, id) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, id);
  }

  /** Is this tile impassable for walkers? */
  solid(x, y) {
    if (!this.inBounds(x, y)) return true;
    const i = y * this.w + x;
    return this.blocked[i] === 1 || isSolidTerrain(this.ground[i]);
  }

  block(x, y, on = true) {
    if (this.inBounds(x, y)) this.blocked[y * this.w + x] = on ? 1 : 0;
  }

  /**
   * Add a y-sorted object. (tx, ty) is the bottom-left tile of its footprint.
   * Sprites are drawn centred on the footprint with their base on its bottom edge.
   */
  addObject(type, tx, ty, opts = {}) {
    const def = OBJECTS[type];
    if (!def) return null;
    const o = {
      type, tx, ty,
      variant: opts.variant ?? 0,
      tw: def.tw, th: def.th,
      w: def.w, h: def.h,
      solid: opts.solid ?? def.solid,
      flat: opts.flat ?? false,
      light: def.light || opts.light,
      offX: opts.offX || 0,
      offY: opts.offY || 0,
      data: opts.data || null,
      id: opts.id,
    };
    if (o.flat) { this.decals.push(o); }
    else this.objects.push(o);
    if (o.solid) {
      for (let j = 0; j < def.th; j++) for (let i = 0; i < def.tw; i++) this.block(tx + i, ty - j);
    }
    if (o.light) this.lights.push({ x: (tx + def.tw / 2) * TILE, y: (ty + 1) * TILE - def.h / 2, r: opts.lightR || 52, color: opts.lightColor || '#ffd18a' });
    return o;
  }

  /** Buildings are objects with a prebuilt sprite rather than a registry entry. */
  addBuilding(sprite, tx, ty, tw, th, opts = {}) {
    const o = {
      type: '_building', sprite, tx, ty, tw, th,
      w: sprite.width, h: sprite.height,
      solid: opts.solid !== false, flat: false,
      offX: opts.offX || 0, offY: opts.offY || 0, data: opts.data || null,
    };
    this.objects.push(o);
    if (o.solid) {
      for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) this.block(tx + i, ty - j);
    }
    return o;
  }

  addWarp(x, y, to, tx, ty, opts = {}) {
    this.warps.push({ x, y, to, tx, ty, sound: opts.sound || 'door', facing: opts.facing || 'down', locked: opts.locked || null, label: opts.label });
    return this.warps[this.warps.length - 1];
  }

  warpAt(x, y) {
    for (const wp of this.warps) if (wp.x === x && wp.y === y) return wp;
    return null;
  }

  setInteract(x, y, data) { this.interacts.set(`${x},${y}`, data); }
  interactAt(x, y) { return this.interacts.get(`${x},${y}`) || null; }

  /** Bucket objects by chunk so the renderer only walks what's on screen. */
  indexObjects() {
    this.objectChunks.clear();
    for (const o of this.objects) {
      const cx = Math.floor(o.tx / CHUNK), cy = Math.floor(o.ty / CHUNK);
      const k = cy * this.chunksX + cx;
      let list = this.objectChunks.get(k);
      if (!list) this.objectChunks.set(k, (list = []));
      list.push(o);
    }
  }

  removeObject(o) {
    const i = this.objects.indexOf(o);
    if (i >= 0) this.objects.splice(i, 1);
    const def = OBJECTS[o.type];
    if (o.solid && def) {
      for (let j = 0; j < def.th; j++) for (let i2 = 0; i2 < def.tw; i2++) this.block(o.tx + i2, o.ty - j, false);
    }
    this.indexObjects();
    this.markDirtyAround(o.tx, o.ty);
  }

  markDirtyAround(tx, ty) {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      this.dirtyChunks.add((cy + j) * this.chunksX + (cx + i));
    }
  }

  /** Tiles adjacent to water sound different underfoot and matter for ambience. */
  countNear(x, y, pred, r = 6) {
    let c = 0;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const tx = x + i, ty = y + j;
        if (!this.inBounds(tx, ty)) continue;
        if (pred(this.ground[ty * this.w + tx])) c++;
      }
    }
    return c;
  }
}

/** Terrain lookup helper used by movement code for footstep sounds. */
export function stepSoundFor(id) {
  switch (id) {
    case T.FLOOR_WOOD: case T.DECK: case T.BRIDGE: return 'step_wood';
    case T.WATER: case T.WATER_SHOAL: case T.WATER_MID: case T.WATER_DEEP: return 'step_water';
    case T.COBBLE: case T.FLOOR_STONE: case T.STONE: return 'step';
    default: return 'step';
  }
}

export { TILE, T, TERRAIN };
