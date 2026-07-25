// The renderer. Ground is baked into 16x16-tile chunk canvases (rebuilt only
// when something changes), animated water is redrawn on top per frame, and
// everything with a footprint — objects, buildings, villagers, cats, the player
// — goes into one list sorted by the y of its base so things overlap correctly.

import { TILE, T, TERRAIN, prio, EDGE_DIRS } from '../art/tiles.js';
import { CHUNK } from './tilemap.js';
import { objSprite } from '../art/objects.js';
import { makeCanvas } from '../engine/pixel.js';
import { VIEW_W, VIEW_H } from '../engine/display.js';
import { clamp } from '../engine/util.js';
import { P } from '../art/palette.js';

const CHUNK_PX = CHUNK * TILE;

export class Camera {
  constructor() { this.x = 0; this.y = 0; this.shake = 0; }

  follow(map, tx, ty, instant = false) {
    const mapW = map.w * TILE, mapH = map.h * TILE;
    let cx = tx - VIEW_W / 2, cy = ty - VIEW_H / 2;
    if (mapW <= VIEW_W) cx = (mapW - VIEW_W) / 2; else cx = clamp(cx, 0, mapW - VIEW_W);
    if (mapH <= VIEW_H) cy = (mapH - VIEW_H) / 2; else cy = clamp(cy, 0, mapH - VIEW_H);
    if (instant) { this.x = cx; this.y = cy; }
    else {
      // A touch of lag keeps motion from feeling rigid without smearing pixels.
      this.x += (cx - this.x) * 0.22;
      this.y += (cy - this.y) * 0.22;
      if (Math.abs(cx - this.x) < 0.4) this.x = cx;
      if (Math.abs(cy - this.y) < 0.4) this.y = cy;
    }
  }

  get ox() { return Math.round(this.x + (this.shake ? (Math.random() - 0.5) * this.shake : 0)); }
  get oy() { return Math.round(this.y + (this.shake ? (Math.random() - 0.5) * this.shake : 0)); }
}

export class Renderer {
  constructor(tileset) {
    this.ts = tileset;
    this.chunks = new Map();      // key -> { canvas, anim: [{x,y,id}] }
    this.chunkOrder = [];
    this.maxChunks = 96;
    this.currentMapId = null;
    this.lightLayer = makeCanvas(VIEW_W, VIEW_H);
    this.waterFrame = 0;
    this._waterT = 0;
  }

  invalidateAll() {
    this.chunks.clear();
    this.chunkOrder.length = 0;
  }

  /** Bake one chunk's ground layer, including autotile fringes and decals. */
  buildChunk(map, cx, cy) {
    const { canvas, g } = makeCanvas(CHUNK_PX, CHUNK_PX);
    const anim = [];
    const x0 = cx * CHUNK, y0 = cy * CHUNK;

    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const tx = x0 + i, ty = y0 + j;
        if (!map.inBounds(tx, ty)) continue;
        const id = map.ground[ty * map.w + tx];
        const def = TERRAIN[id];
        const px = i * TILE, py = j * TILE;

        g.drawImage(this.ts.tile(id, tx, ty, 0), px, py);
        if (def && def.anim) anim.push({ i, j, tx, ty, id });

        // Fringes: any neighbour whose terrain outranks ours creeps in.
        const myPrio = prio(id);
        for (const dir of EDGE_DIRS) {
          const dx = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0;
          const dy = dir.includes('n') ? -1 : dir.includes('s') ? 1 : 0;
          const nid = map.get(tx + dx, ty + dy);
          if (nid === id || prio(nid) <= myPrio) continue;
          if (!this.ts.hasEdge(nid)) continue;
          // Diagonals only fill the gap the cardinals leave behind.
          if (dir.length === 2) {
            const nsId = map.get(tx, ty + dy), ewId = map.get(tx + dx, ty);
            if (prio(nsId) > myPrio || prio(ewId) > myPrio) continue;
          }
          // Draw the *opposite* side of the neighbour's fringe: a terrain to our
          // north spills onto our northern edge.
          const opp = { n: 'n', s: 's', e: 'e', w: 'w', ne: 'ne', nw: 'nw', se: 'se', sw: 'sw' }[dir];
          const img = this.ts.edge(nid, opp);
          if (img) g.drawImage(img, px, py);
        }
      }
    }

    // Height cues around cliffs. The shadow a wall throws onto the ground below
    // it is what actually makes the terrace read as a terrace, so it matters
    // more than the face texture does.
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const tx = x0 + i, ty = y0 + j;
        const px = i * TILE, py = j * TILE;
        const here = map.get(tx, ty);

        if (here !== T.CLIFF && map.get(tx, ty - 1) === T.CLIFF) {
          // Ground at the foot of a wall: a soft cast shadow.
          const grad = g.createLinearGradient(0, py, 0, py + 7);
          grad.addColorStop(0, 'rgba(20,16,30,0.42)');
          grad.addColorStop(1, 'rgba(20,16,30,0)');
          g.fillStyle = grad;
          g.fillRect(px, py, TILE, 7);
        }

        if (here === T.CLIFF && map.get(tx, ty - 1) !== T.CLIFF) {
          // Grass overhanging the lip of the plateau.
          g.fillStyle = 'rgba(93,168,69,0.85)';
          for (let k = 0; k < TILE; k += 2) {
            const d = 1 + ((tx * 7 + k) % 3);
            g.fillRect(px + k, py, 2, d);
          }
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(px, py + 2, TILE, 1);
        }

        // Cliff sides get a vertical edge line so corners don't look mushy.
        if (here === T.CLIFF) {
          if (map.get(tx - 1, ty) !== T.CLIFF) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px, py + 3, 1, TILE - 3); }
          if (map.get(tx + 1, ty) !== T.CLIFF) { g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(px + TILE - 1, py + 3, 1, TILE - 3); }
        }
      }
    }

    // Flat decals (doormats, stairs, jetties) bake in with the ground.
    for (const d of map.decals) {
      if (d.tx < x0 - 2 || d.tx >= x0 + CHUNK + 2 || d.ty < y0 - 2 || d.ty >= y0 + CHUNK + 2) continue;
      const spr = d.sprite || objSprite(d.type, d.variant);
      if (!spr) continue;
      const dx = (d.tx - x0) * TILE + Math.round((d.tw * TILE - spr.width) / 2) + d.offX;
      const dy = (d.ty - y0 + 1) * TILE - spr.height + d.offY;
      g.drawImage(spr, dx, dy);
    }

    return { canvas, anim };
  }

  getChunk(map, cx, cy) {
    const key = cy * map.chunksX + cx;
    if (map.dirtyChunks.has(key)) { this.chunks.delete(key); map.dirtyChunks.delete(key); }
    let c = this.chunks.get(key);
    if (!c) {
      c = this.buildChunk(map, cx, cy);
      this.chunks.set(key, c);
      this.chunkOrder.push(key);
      // Cheap LRU: drop the oldest chunks once we're well past the screen's worth.
      while (this.chunkOrder.length > this.maxChunks) {
        const old = this.chunkOrder.shift();
        if (old !== key) this.chunks.delete(old);
      }
    }
    return c;
  }

  update(dt) {
    this._waterT += dt;
    if (this._waterT > 0.16) { this._waterT = 0; this.waterFrame = (this.waterFrame + 1) % 6; }
  }

  /**
   * Draw a whole frame.
   * `actors` is a list of { x, y, draw(ctx, ox, oy) } sorted by y.
   * `light` is { night: 0..1, tint: hex, lights: [{x,y,r,color}] }.
   */
  draw(ctx, map, cam, actors, light) {
    if (this.currentMapId !== map.id) { this.invalidateAll(); this.currentMapId = map.id; }
    const ox = cam.ox, oy = cam.oy;

    // --- ground ---
    const c0x = Math.max(0, Math.floor(ox / CHUNK_PX));
    const c0y = Math.max(0, Math.floor(oy / CHUNK_PX));
    const c1x = Math.min(map.chunksX - 1, Math.floor((ox + VIEW_W) / CHUNK_PX));
    const c1y = Math.min(map.chunksY - 1, Math.floor((oy + VIEW_H) / CHUNK_PX));

    ctx.fillStyle = map.outdoor ? '#2f4f6a' : '#171325';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const c = this.getChunk(map, cx, cy);
        const px = cx * CHUNK_PX - ox, py = cy * CHUNK_PX - oy;
        ctx.drawImage(c.canvas, px, py);
        // Animated tiles ride on top of the baked chunk.
        for (const a of c.anim) {
          const sx = px + a.i * TILE, sy = py + a.j * TILE;
          if (sx < -TILE || sy < -TILE || sx > VIEW_W || sy > VIEW_H) continue;
          ctx.drawImage(this.ts.tile(a.id, a.tx, a.ty, this.waterFrame), sx, sy);
        }
      }
    }

    // --- y-sorted pass ---
    const drawables = [];
    for (let cy = c0y - 1; cy <= c1y + 1; cy++) {
      for (let cx = c0x - 1; cx <= c1x + 1; cx++) {
        if (cx < 0 || cy < 0 || cx >= map.chunksX || cy >= map.chunksY) continue;
        const list = map.objectChunks.get(cy * map.chunksX + cx);
        if (!list) continue;
        for (const o of list) drawables.push(o);
      }
    }
    for (const a of actors) drawables.push(a);

    drawables.sort((a, b) => sortY(a) - sortY(b));

    for (const d of drawables) {
      if (d.draw) { d.draw(ctx, ox, oy); continue; }
      const spr = d.sprite || objSprite(d.type, d.variant);
      if (!spr) continue;
      const dx = d.tx * TILE + Math.round((d.tw * TILE - spr.width) / 2) + d.offX - ox;
      const dy = (d.ty + 1) * TILE - spr.height + d.offY - oy;
      if (dx > VIEW_W || dy > VIEW_H || dx + spr.width < 0 || dy + spr.height < 0) continue;
      ctx.drawImage(spr, dx, dy);
    }

    // Speech bubbles and emotes go on last. Drawn inline with their owner they
    // get covered by whoever is standing in front — which in a queue is always.
    for (const d of drawables) {
      if (d.drawEmote) d.drawEmote(ctx, ox, oy, d.emoteTop());
    }

    // --- lighting ---
    if (light && light.night > 0.02) this.drawLight(ctx, map, cam, light);
  }

  drawLight(ctx, map, cam, light) {
    const lg = this.lightLayer.g;
    const a = light.night;
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, VIEW_W, VIEW_H);
    lg.fillStyle = light.tint || P.nightTint;
    lg.globalAlpha = a;
    lg.fillRect(0, 0, VIEW_W, VIEW_H);
    lg.globalAlpha = 1;

    // Punch warm holes where lamps and windows are.
    lg.globalCompositeOperation = 'destination-out';
    const ox = cam.ox, oy = cam.oy;
    const all = light.lights || [];
    for (const L of all) {
      const x = L.x - ox, y = L.y - oy;
      if (x < -140 || y < -140 || x > VIEW_W + 140 || y > VIEW_H + 140) continue;
      const r = L.r * (0.92 + Math.sin((L.phase || 0) + performance.now() / 700) * 0.06);
      const grad = lg.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(0,0,0,0.95)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = grad;
      lg.beginPath();
      lg.arc(x, y, r, 0, Math.PI * 2);
      lg.fill();
    }
    lg.globalCompositeOperation = 'source-over';

    ctx.drawImage(this.lightLayer.canvas, 0, 0);

    // A soft warm bloom on top sells the lamplight.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.5;
    for (const L of all) {
      const x = L.x - ox, y = L.y - oy;
      if (x < -140 || y < -140 || x > VIEW_W + 140 || y > VIEW_H + 140) continue;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, L.r * 0.85);
      grad.addColorStop(0, hexToRgba(L.color || P.lampGlow, 0.5));
      grad.addColorStop(1, hexToRgba(L.color || P.lampGlow, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, L.r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function sortY(d) {
  if (d.sortY !== undefined) return d.sortY;
  return (d.ty + 1) * TILE + (d.sortBias || 0);
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
