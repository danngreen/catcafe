// The renderer. Ground is baked into 16x16-tile chunk canvases (rebuilt only
// when something changes), animated water is redrawn on top per frame, and
// everything with a footprint — objects, buildings, villagers, cats, the player
// — goes into one list sorted by the y of its base so things overlap correctly.

import { TILE, T, TERRAIN, prio, EDGE_DIRS } from '../art/tiles.js';
import { CHUNK } from './tilemap.js';
import { objSprite, objFrame } from '../art/objects.js';
import { emoteSprite } from '../art/chars.js';
import { makeCanvas } from '../engine/pixel.js';
import { setting } from '../engine/settings.js';
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
    this.bakeBudget = 3;              // chunks re-baked per frame; see composite()
    this.baked = 0;
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

        // Fringes: any neighbour whose terrain outranks ours creeps in.
        const edges = this.edgesFor(map, tx, ty, id);
        for (const img of edges) g.drawImage(img, px, py);

        // Animated tiles are redrawn over the chunk every frame, so they have
        // to carry their fringes with them — otherwise the redraw paints over
        // the blend and every shoreline comes out hard-edged.
        if (def && def.anim) anim.push({ i, j, tx, ty, id, edges });
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

    // Two canvases: this one, which never changes, and a copy with the current
    // frame of water painted onto it. Drawing is then one blit per chunk
    // instead of one per animated tile per frame — see composite().
    return { base: canvas, canvas, anim, frame: -1 };
  }

  /**
   * Paint the current frame of the animated tiles into a chunk's own canvas.
   *
   * The water animates six times a second and the screen draws sixty, so
   * redrawing every ripple on every frame did the same work ten times over. A
   * screenful of sea was six hundred drawImage calls a frame — nothing on a
   * fast machine, and the reason the coast road stutters on an old one.
   *
   * Done per chunk and only when the frame it holds is stale, so the cost
   * lands six times a second on the chunks you can actually see.
   */
  composite(c) {
    if (!c.anim.length) return;
    if (c.frame === this.waterFrame) return;
    // Every visible chunk goes stale on the same tick, so re-baking them all
    // at once turns a cheap frame into an expensive one six times a second —
    // which is the stutter, not the average. A budget spreads the work over
    // the frames that follow; a chunk waiting its turn shows the ripple it had
    // a frame or two ago, which nobody can see and everybody can feel the
    // absence of.
    if (this.baked >= this.bakeBudget) return;
    this.baked++;
    if (!c.own) {
      const made = makeCanvas(CHUNK_PX, CHUNK_PX);
      c.own = made.canvas;
      c.g = made.g;
      c.canvas = made.canvas;
    }
    c.g.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    c.g.drawImage(c.base, 0, 0);
    for (const a of c.anim) {
      const px = a.i * TILE, py = a.j * TILE;
      c.g.drawImage(this.ts.tile(a.id, a.tx, a.ty, this.waterFrame), px, py);
      // The fringes go back on top: the redraw would otherwise paint over the
      // blend and every shoreline would come out hard-edged.
      for (const img of a.edges) c.g.drawImage(img, px, py);
      if (this.perf) this.perf.count('waterBake', 1 + a.edges.length);
    }
    c.frame = this.waterFrame;
  }

  /** Overlays that blend this tile into any higher-priority neighbours. */
  edgesFor(map, tx, ty, id) {
    const out = [];
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
      // Take the *opposite* side of the neighbour's fringe: a terrain to our
      // north spills onto our northern edge.
      const img = this.ts.edge(nid, dir);
      if (img) out.push(img);
    }
    return out;
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
    this.t = (this.t || 0) + dt;
    // Still water costs nothing at all: the chunk is baked once and blitted
    // from then on, with no re-compositing ever.
    if (setting('lowFx')) return;
    this._waterT += dt;
    if (this._waterT > 0.16) { this._waterT = 0; this.waterFrame = (this.waterFrame + 1) % 6; }
  }

  /**
   * Draw a whole frame.
   * `actors` is a list of { x, y, draw(ctx, ox, oy) } sorted by y.
   * `light` is { night: 0..1, tint: hex, lights: [{x,y,r,color}] }.
   */
  draw(ctx, map, cam, actors, light) {
    if (this.perf) this.perf.resetCounts();
    this.baked = 0;
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
        this.composite(c);
        const px = cx * CHUNK_PX - ox, py = cy * CHUNK_PX - oy;
        ctx.drawImage(c.canvas, px, py);
        if (this.perf) this.perf.count('chunks', 1);
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
      // Objects are drawn every frame rather than baked into a chunk, so a
      // thing that moves — the fire in the hearth — only has to choose a
      // different picture of itself.
      const spr = d.sprite || objSprite(d.type, d.variant, objFrame(d.type, this.t));
      if (!spr) continue;
      const dx = d.tx * TILE + Math.round((d.tw * TILE - spr.width) / 2) + d.offX - ox;
      const dy = (d.ty + 1) * TILE - spr.height + d.offY - oy;
      if (dx > VIEW_W || dy > VIEW_H || dx + spr.width < 0 || dy + spr.height < 0) continue;
      ctx.drawImage(spr, dx, dy);
    }

    // A ringing telephone puts a mark over itself. Objects have no emotes, so
    // it is drawn here, with the bubbles, for the same reason they are: it has
    // to sit on top of whatever is standing in front of it.
    for (const d of drawables) {
      if (!d.ringMark) continue;
      const bx = Math.round(d.tx * TILE + (d.tw * TILE) / 2 - ox);
      const by = Math.round((d.ty + 1) * TILE - (d.h || TILE) - oy - 6);
      const bob = Math.round(Math.sin(this.t * 12) * 2);
      ctx.drawImage(emoteSprite('alert'), bx - 8, by - 14 + bob);
    }

    // Speech bubbles and emotes go on last. Drawn inline with their owner they
    // get covered by whoever is standing in front — which in a queue is always.
    for (const d of drawables) {
      if (d.drawEmote) d.drawEmote(ctx, ox, oy, d.emoteTop());
    }

    // --- lighting ---
    if (light && light.night > 0.02) this.drawLight(ctx, map, cam, light);
  }

  /**
   * Trace the part of the screen that has sky over it, as a clip path.
   *
   * Outdoors that is everything. Inside a building it is the patio floors and
   * their railings, so rain falls on the terrace and stops dead at the cafe
   * wall. Runs are merged along each row: a terrace is a handful of long
   * rectangles rather than three hundred little ones.
   *
   * Returns false if none of it is on screen, in which case no clip was set
   * and the caller should draw nothing.
   */
  skyPath(ctx, map, cam) {
    if (map.outdoor) {
      ctx.beginPath();
      ctx.rect(0, 0, VIEW_W, VIEW_H);
      return true;
    }
    if (!map.hasOpenSky) return false;
    const ox = cam.ox, oy = cam.oy;
    const x0 = Math.max(0, Math.floor(ox / TILE));
    const y0 = Math.max(0, Math.floor(oy / TILE));
    const x1 = Math.min(map.w - 1, Math.floor((ox + VIEW_W) / TILE));
    const y1 = Math.min(map.h - 1, Math.floor((oy + VIEW_H) / TILE));
    let any = false;
    ctx.beginPath();
    for (let y = y0; y <= y1; y++) {
      let runStart = -1;
      for (let x = x0; x <= x1 + 1; x++) {
        const open = x <= x1 && map.openSky(x, y);
        if (open && runStart < 0) runStart = x;
        else if (!open && runStart >= 0) {
          ctx.rect(runStart * TILE - ox, y * TILE - oy, (x - runStart) * TILE, TILE);
          any = true;
          runStart = -1;
        }
      }
    }
    return any;
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
