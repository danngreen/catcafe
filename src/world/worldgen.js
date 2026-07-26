// Builds the valley: a coastline in the south-west, chalk plateaus in the
// north, two rivers running down to the sea, woods and meadows between, five
// settlements, and the roads that join them up.
//
// Everything is driven by one seed, so the same world rebuilds identically.

import { GameMap } from './tilemap.js';
import { T, TILE, isWater } from '../art/tiles.js';
import { makeRng, fbm, clamp, hash2 } from '../engine/util.js';
import { TOWNS, SHOPS } from './places.js';
import { buildingSprite } from '../art/objects.js';

export const WORLD_W = 352;
export const WORLD_H = 320;

/** How "inland" a point is: 0 at the far south-west sea, 1 at the north-east. */
function inlandness(x, y, seed) {
  const base = (x / WORLD_W) * 0.6 + (1 - y / WORLD_H) * 0.8;
  const wobble = (fbm(x / 46, y / 46, seed + 11, 3) - 0.5) * 0.16;
  return base + wobble;
}

export function generateWorld(seed = 20240724) {
  const rng = makeRng(seed);
  const map = new GameMap('overworld', WORLD_W, WORLD_H, {
    kind: 'outdoor', name: 'Bramble Valley', music: 'field', fill: T.GRASS,
    ambience: { wind: 0.35 },
  });

  const elev = new Uint8Array(WORLD_W * WORLD_H);
  const moist = new Float32Array(WORLD_W * WORLD_H);
  const inland = new Float32Array(WORLD_W * WORLD_H);
  const reserved = new Uint8Array(WORLD_W * WORLD_H); // towns/roads: keep clear

  // ---------------------------------------------------------------- terrain
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const i = y * WORLD_W + x;
      const v = inlandness(x, y, seed);
      inland[i] = v;
      const m = fbm(x / 38, y / 38, seed + 77, 4);
      moist[i] = m;

      // Depth in four bands rather than two, so the sea fades out to the horizon.
      if (v < 0.12) { map.ground[i] = T.WATER_DEEP; continue; }
      if (v < 0.155) { map.ground[i] = T.WATER_MID; continue; }
      if (v < 0.19) { map.ground[i] = T.WATER; continue; }
      if (v < 0.215) { map.ground[i] = T.WATER_SHOAL; continue; }
      if (v < 0.275) { map.ground[i] = T.SAND; continue; }   // a proper beach

      // Elevation only bites well inland, so the coast stays low and open.
      const e = fbm(x / 54, y / 54, seed + 303, 4);
      const gate = clamp((v - 0.34) * 3.4, 0, 1);
      const eh = e * gate;
      let level = 0;
      if (eh > 0.50) level = 1;
      if (eh > 0.615) level = 2;
      elev[i] = level;

      if (m > 0.62) map.ground[i] = T.FOREST_FLOOR;
      else if (m > 0.5) map.ground[i] = T.GRASS;
      else if (m > 0.4) map.ground[i] = T.MEADOW;
      else map.ground[i] = T.GRASS;

      if (level === 2 && fbm(x / 9, y / 9, seed + 5, 2) > 0.62) map.ground[i] = T.STONE;
    }
  }

  // ------------------------------------------------------------------ rivers
  const rivers = [];
  const sources = [
    { x: 214, y: 26 },
    { x: 300, y: 52 },
    { x: 150, y: 60 },
  ];
  for (const src of sources) rivers.push(carveRiver(map, inland, src, rng, seed));

  // ------------------------------------------------------- cliffs from elevation
  // A tile sitting at the foot of a rise becomes a wall. That single rule gives
  // the stepped, terraced look without needing a real height axis.
  const cliffs = new Uint8Array(WORLD_W * WORLD_H);
  for (let y = 1; y < WORLD_H - 1; y++) {
    for (let x = 1; x < WORLD_W - 1; x++) {
      const i = y * WORLD_W + x;
      if (isWater(map.ground[i])) continue;
      const e = elev[i];
      if (e >= 2) continue;
      const up = Math.max(
        elev[i - WORLD_W], elev[i + WORLD_W], elev[i - 1], elev[i + 1],
      );
      if (up > e) cliffs[i] = 1;
    }
  }
  for (let i = 0; i < cliffs.length; i++) if (cliffs[i]) map.ground[i] = T.CLIFF;

  // Chalky ground on top of the high ground so plateaus read as chalk downs.
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const i = y * WORLD_W + x;
      if (elev[i] === 2 && map.ground[i] === T.GRASS && fbm(x / 12, y / 12, seed + 9, 2) > 0.58) {
        map.ground[i] = T.CLIFF_TOP;
      }
    }
  }

  // ------------------------------------------------------------------- towns
  const towns = {};
  const doors = [];
  for (const spec of TOWNS) {
    towns[spec.id] = stampTown(map, spec, elev, reserved, rng, doors, seed);
  }

  // ------------------------------------------------------------------- roads
  const link = (a, b) => carveRoad(map, elev, reserved, towns[a].hub, towns[b].hub, seed);
  link('brambleford', 'saltmere');
  link('brambleford', 'thistlewick');
  link('brambleford', 'hollowdown');
  link('hollowdown', 'oakhollow');
  link('thistlewick', 'oakhollow');
  link('thistlewick', 'hollowdown');

  // The eastern pass: a second, shorter road from Hollowdown down to
  // Thistlewick, forced across the river at a narrow point so that there is
  // one tile of it worth blocking. Carving it in two halves through a fixed
  // waypoint is what puts the bridge where we want it — left to itself the
  // road would go round the water rather than over it, since crossing costs a
  // great deal more than walking.
  const pass = findRiverCrossing(map, 256, 109);
  if (pass) {
    carveRoad(map, elev, reserved, towns.hollowdown.hub, pass, seed);
    carveRoad(map, elev, reserved, pass, towns.thistlewick.hub, seed);
  }
  tidyBridges(map);

  // Where a road notches through a terrace, drop steps in so it reads as a climb.
  for (let y = 1; y < WORLD_H - 1; y++) {
    for (let x = 1; x < WORLD_W - 1; x++) {
      const i = y * WORLD_W + x;
      if (map.ground[i] !== T.DIRT || reserved[i] !== 2) continue;
      if (map.ground[i - WORLD_W] === T.CLIFF || map.ground[i + WORLD_W] === T.CLIFF) {
        map.ground[i] = T.GRAVEL;
        map.addObject('stairs', x, y, { flat: true, variant: x % 3 });
      }
    }
  }

  // -------------------------------------------------------------- landmarks
  const landmarks = placeLandmarks(map, elev, reserved, inland, rng);

  // ------------------------------------------------------- scatter the wild
  scatterNature(map, elev, moist, inland, reserved, rng, seed);

  // ------------------------------------------------------ blocked shortcuts
  const barriers = placeBarriers(map, reserved, rng, pass);

  map.indexObjects();

  return { map, towns, doors, landmarks, barriers, elev, inland };
}

// ---------------------------------------------------------------------------
// Rivers
// ---------------------------------------------------------------------------

/** Shallow to deep, for keeping the deepest write when discs overlap. */
const DEPTH_RANK = { [T.WATER_SHOAL]: 1, [T.WATER]: 2, [T.WATER_MID]: 3, [T.WATER_DEEP]: 4 };
const depthRank = (id) => DEPTH_RANK[id] || 0;

function carveRiver(map, inland, src, rng, seed) {
  const pts = [];
  let x = src.x, y = src.y;
  let width = 1.4;
  for (let step = 0; step < 900; step++) {
    pts.push({ x: Math.round(x), y: Math.round(y) });
    const i = Math.round(y) * WORLD_W + Math.round(x);
    if (i >= 0 && i < inland.length && inland[i] < 0.2) break;
    if (x < 2 || y < 2 || x > WORLD_W - 3 || y > WORLD_H - 3) break;

    // Head for the sea (down and to the left) with a meander on top.
    const wobbleA = (fbm(x / 24, y / 24, seed + 991, 3) - 0.5) * 2.6;
    let dx = -0.55 + wobbleA * 0.9;
    let dy = 0.85 + (fbm(x / 31, y / 31, seed + 55, 2) - 0.5) * 0.7;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    x += dx * 1.5;
    y += dy * 1.5;
    width = clamp(width + 0.012, 1.4, 3.6);

    const w = Math.round(width);
    for (let j = -w; j <= w; j++) {
      for (let k = -w; k <= w; k++) {
        if (j * j + k * k > w * w + 1) continue;
        const tx = Math.round(x) + k, ty = Math.round(y) + j;
        if (!map.inBounds(tx, ty)) continue;
        const idx = ty * WORLD_W + tx;
        const d2 = j * j + k * k;
        const want = d2 <= (w - 1) * (w - 1) ? T.WATER_MID
          : d2 <= w * w ? T.WATER : T.WATER_SHOAL;
        // Successive discs overlap, so only ever deepen a tile — otherwise a
        // later disc's shallow rim punches holes in the earlier deep channel.
        map.ground[idx] = isWater(map.ground[idx])
          ? (depthRank(want) > depthRank(map.ground[idx]) ? want : map.ground[idx])
          : want;
      }
    }
    // Wet sandy banks either side.
    const bw = w + 1;
    for (let j = -bw; j <= bw; j++) {
      for (let k = -bw; k <= bw; k++) {
        const tx = Math.round(x) + k, ty = Math.round(y) + j;
        if (!map.inBounds(tx, ty)) continue;
        const idx = ty * WORLD_W + tx;
        if (!isWater(map.ground[idx]) && rng.chance(0.7)) {
          map.ground[idx] = T.SAND;
        }
      }
    }
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Roads (A* over a cost grid, then painted as a worn path with bridges)
// ---------------------------------------------------------------------------

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, f) {
    this.a.push({ node, f });
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p].f <= this.a[i].f) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      i = p;
    }
  }
  pop() {
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < this.a.length && this.a[l].f < this.a[s].f) s = l;
        if (r < this.a.length && this.a[r].f < this.a[s].f) s = r;
        if (s === i) break;
        [this.a[s], this.a[i]] = [this.a[i], this.a[s]];
        i = s;
      }
    }
    return top.node;
  }
}

function roadCost(map, elev, reserved, x, y) {
  const i = y * WORLD_W + x;
  const g = map.ground[i];
  if (g === T.CLIFF) return 200;          // a notch through chalk is a last resort
  if (g === T.WATER_DEEP || g === T.WATER_MID) return 900;   // never route a road out to sea
  if (isWater(g)) return 220;                                // narrow river crossings only
  if (reserved[i] === 2) return 1;        // reuse an existing road
  if (reserved[i] === 1) return 2;        // through a town: follow its streets
  if (g === T.FOREST_FLOOR) return 7;
  if (g === T.STONE) return 9;
  if (g === T.SAND) return 5;
  return 4 + elev[i] * 3;
}

function carveRoad(map, elev, reserved, a, b, seed) {
  const W = WORLD_W, H = WORLD_H;
  const open = new Heap();
  const gScore = new Float32Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const start = a.y * W + a.x, goal = b.y * W + b.x;
  gScore[start] = 0;
  open.push(start, 0);
  const hEst = (i) => {
    const x = i % W, y = (i / W) | 0;
    return (Math.abs(x - b.x) + Math.abs(y - b.y)) * 4;
  };

  let found = false;
  let guard = 0;
  while (open.size && guard++ < 400000) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) { found = true; break; }
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const step = roadCost(map, elev, reserved, nx, ny);
      const ng = gScore[cur] + step;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        came[ni] = cur;
        open.push(ni, ng + hEst(ni));
      }
    }
  }
  if (!found) return [];

  // Walk the path back and paint it: a tidy two tiles wide, and no wider.
  const path = [];
  for (let i = goal; i !== -1; i = came[i]) path.push(i);
  path.reverse();

  const isWaterId = isWater;
  const paint = (tx, ty) => {
    if (!map.inBounds(tx, ty)) return;
    const ti = ty * W + tx;
    if (reserved[ti] === 1) return;                  // leave town ground alone
    const g = map.ground[ti];
    if (g === T.COBBLE) return;                      // a paved street is already a road
    if (isWaterId(g)) { map.ground[ti] = T.BRIDGE; reserved[ti] = 2; return; }
    if (g === T.BRIDGE) return;
    map.ground[ti] = T.DIRT;                         // cliffs get notched through
    reserved[ti] = 2;
  };

  for (let n = 0; n < path.length; n++) {
    const i = path[n];
    const x = i % W, y = (i / W) | 0;
    const wasWater = isWaterId(map.ground[i]);
    paint(x, y);
    paint(x + 1, y);
    paint(x, y + 1);
    paint(x + 1, y + 1);

    // Bridge decks must run *across* the water, following the road's heading.
    // Extending in every direction lets a deck creep along the river instead.
    if (!wasWater) continue;
    const prev = path[Math.max(0, n - 1)];
    const dx = Math.sign((i % W) - (prev % W));
    const dy = Math.sign(((i / W) | 0) - ((prev / W) | 0));
    if (!dx && !dy) continue;
    // The deck is two tiles wide, matching the road: sideways from the heading.
    const sx = dy ? 1 : 0, sy = dx ? 1 : 0;
    for (const sign of [1, -1]) {
      for (let step = 1; step < 10; step++) {
        const nx = x + dx * step * sign, ny = y + dy * step * sign;
        if (!map.inBounds(nx, ny)) break;
        if (!isWaterId(map.ground[ny * W + nx])) break;
        for (const [ox, oy] of [[0, 0], [sx, sy]]) {
          const bx = nx + ox, by = ny + oy;
          if (!map.inBounds(bx, by)) continue;
          const bi = by * W + bx;
          if (!isWaterId(map.ground[bi])) continue;
          map.ground[bi] = T.BRIDGE;
          reserved[bi] = 2;
        }
      }
    }
  }

  return path;
}

/** Sweep up bridge tiles that ended up stranded in open water. */
function tidyBridges(map) {
  const W = WORLD_W;
  for (let y = 1; y < WORLD_H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (map.ground[i] !== T.BRIDGE) continue;
      let walkable = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const g = map.ground[(y + dy) * W + (x + dx)];
        if (!isWater(g)) walkable++;
      }
      if (walkable === 0) map.ground[i] = T.WATER;
    }
  }
}

// ---------------------------------------------------------------------------
// Towns
// ---------------------------------------------------------------------------

const HOUSE_WALLS = ['#efe2c8', '#e8dcc2', '#f0e4cc', '#dfe6e8', '#e6d9bd'];

function stampTown(map, spec, elev, reserved, rng, doors, seed) {
  const { x: ox, y: oy, w, h } = spec;
  const terraced = spec.id === 'hollowdown';

  // Level the ground and clear anything the terrain generator put here.
  // Any sea or river inside the town footprint is reclaimed as beach, so a
  // coastal village sits *beside* the water rather than half-drowned in it.
  for (let y = oy - 1; y < oy + h + 1; y++) {
    for (let x = ox - 1; x < ox + w + 1; x++) {
      if (!map.inBounds(x, y)) continue;
      const i = y * WORLD_W + x;
      const g = map.ground[i];
      if (isWater(g)) {
        // Feather the reclaimed edge so the new shoreline isn't a square.
        const edge = Math.min(x - (ox - 1), (ox + w) - x, y - (oy - 1), (oy + h) - y);
        if (edge <= 0 && rng.chance(0.5)) continue;
        map.ground[i] = T.SAND;
      }
    }
  }

  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + w; x++) {
      if (!map.inBounds(x, y)) continue;
      const i = y * WORLD_W + x;
      reserved[i] = 1;
      const wasSand = map.ground[i] === T.SAND;
      if (terraced) {
        // Three shelves stepping down to the south, joined by stairs.
        const band = y < oy + 11 ? 2 : y < oy + 21 ? 1 : 0;
        elev[i] = band;
        map.ground[i] = T.GRASS;
      } else {
        elev[i] = 0;
        // Keep the sandy ground near the shore; it suits a fishing village.
        map.ground[i] = wasSand ? T.SAND : T.GRASS;
      }
    }
  }

  if (terraced) {
    // Rebuild the retaining walls between shelves, leaving gaps for steps.
    const stairXs = [ox + 8, ox + 24];
    for (const rowY of [oy + 11, oy + 21]) {
      for (let x = ox; x < ox + w; x++) {
        if (!map.inBounds(x, rowY)) continue;
        const isStair = stairXs.some((sx) => x >= sx && x < sx + 3);
        const i = rowY * WORLD_W + x;
        map.ground[i] = isStair ? T.GRAVEL : T.CLIFF;
      }
      for (const sx of stairXs) {
        for (let k = 0; k < 3; k++) {
          map.set(sx + k, rowY - 1, T.GRAVEL);
          map.set(sx + k, rowY + 1, T.GRAVEL);
          // A flight of steps drawn flat on the ground.
          map.addObject('stairs', sx + k, rowY, { flat: true, variant: k % 3 });
        }
      }
    }
  }

  // --- streets ---
  const streets = [];
  const midY = oy + Math.floor(h / 2);
  if (terraced) {
    // One lane along each shelf.
    for (const ly of [oy + 5, oy + 16, oy + 26]) streets.push({ kind: 'h', y: ly, x0: ox + 2, x1: ox + w - 3 });
  } else {
    streets.push({ kind: 'h', y: midY, x0: ox + 1, x1: ox + w - 2 });
    streets.push({ kind: 'v', x: ox + Math.floor(w * 0.34), y0: oy + 2, y1: oy + h - 3 });
    streets.push({ kind: 'v', x: ox + Math.floor(w * 0.72), y0: oy + 2, y1: oy + h - 3 });
  }
  for (const s of streets) {
    if (s.kind === 'h') {
      for (let x = s.x0; x <= s.x1; x++) for (let j = 0; j < 3; j++) paveTile(map, reserved, x, s.y + j);
    } else {
      for (let y = s.y0; y <= s.y1; y++) for (let k = 0; k < 3; k++) paveTile(map, reserved, s.x + k, y);
    }
  }

  const hub = { x: ox + Math.floor(w / 2), y: (terraced ? oy + 17 : midY + 1) };

  // --- building plots: alternate above and below each horizontal street ---
  const shops = SHOPS.filter((s) => s.town === spec.id);
  const plots = [];
  for (const s of streets) {
    if (s.kind !== 'h') continue;
    for (let x = s.x0 + 1; x < s.x1 - 4; x += 7) {
      plots.push({ x, y: s.y - 1, side: 'north' });   // door faces down onto the street
      plots.push({ x, y: s.y + 6, side: 'south' });
    }
  }
  rng.shuffle(plots);

  const placed = [];
  const used = [];
  const fits = (px, py, tw) => {
    if (px < ox || px + tw > ox + w - 1 || py < oy + 1 || py > oy + h - 2) return false;
    for (const u of used) {
      if (px < u.x + u.tw + 1 && px + tw + 1 > u.x && Math.abs(py - u.y) < 5) return false;
    }
    // Don't drop a house into the sea or onto a retaining wall.
    for (let i = 0; i < tw; i++) {
      for (let j = 0; j < 3; j++) {
        const g = map.get(px + i, py - j);
        if (isWater(g) || g === T.CLIFF) return false;
      }
    }
    return true;
  };

  // Shops first — they must all get a home.
  for (const shop of shops) {
    const tw = shop.tw || 4;
    let spot = null;
    for (const pl of plots) {
      if (pl.taken) continue;
      const py = pl.side === 'north' ? pl.y : pl.y + 2;
      if (!fits(pl.x, py, tw)) continue;
      spot = { pl, x: pl.x, y: py };
      break;
    }
    if (!spot) {
      // Fall back to any clear strip inside the town.
      outer:
      for (let y = oy + 3; y < oy + h - 3; y++) {
        for (let x = ox + 1; x < ox + w - tw - 1; x++) {
          if (fits(x, y, tw)) { spot = { pl: null, x, y }; break outer; }
        }
      }
    }
    if (!spot) continue;
    if (spot.pl) spot.pl.taken = true;
    used.push({ x: spot.x, y: spot.y, tw });
    placed.push(placeShop(map, shop, spot.x, spot.y, spec, doors, rng));
  }

  // Then ordinary cottages to fill the town out.
  let houses = 0;
  for (const pl of plots) {
    if (pl.taken || houses >= (terraced ? 7 : 9)) continue;
    const tw = rng.irange(3, 4);
    const py = pl.side === 'north' ? pl.y : pl.y + 2;
    if (!fits(pl.x, py, tw)) continue;
    pl.taken = true;
    used.push({ x: pl.x, y: py, tw });
    houses++;
    const v = rng.int(4);
    const roof = spec.style.roofs[rng.int(spec.style.roofs.length)];
    const wall = HOUSE_WALLS[rng.int(HOUSE_WALLS.length)];
    const spr = buildingSprite({
      tw, wall, roof, roofStyle: rng.chance(0.22) ? 'thatch' : rng.chance(0.2) ? 'gable' : 'tile',
      timbered: spec.style.timbered && rng.chance(0.55),
      wallH: 26, roofH: 22, windows: 2, v,
    });
    map.addBuilding(spr, pl.x, py, tw, 2, {});
    map.setInteract(pl.x + Math.floor(tw / 2), py + 1, { kind: 'sign', text: 'A cottage. Someone is definitely home, but they are definitely not answering.' });
  }

  // --- street furniture ---
  const propAt = (x, y, type, opts) => {
    if (!map.inBounds(x, y)) return;
    if (map.solid(x, y)) return;
    const g = map.get(x, y);
    if (isWater(g) || g === T.CLIFF) return;
    map.addObject(type, x, y, opts);
  };
  for (const s of streets) {
    if (s.kind === 'h') {
      for (let x = s.x0 + 2; x < s.x1; x += 9) {
        propAt(x, s.y - 1, 'lamppost', { lightR: 56 });
        if (rng.chance(0.5)) propAt(x + 4, s.y + 3, 'planter', { variant: rng.int(3) });
        if (rng.chance(0.35)) propAt(x + 2, s.y + 3, 'bench');
      }
    }
  }
  // A well or a market cross in the middle of town.
  if (!terraced) propAt(hub.x - 1, hub.y - 3, 'well');
  propAt(hub.x + 3, hub.y - 3, 'signpost', {});
  map.setInteract(hub.x + 3, hub.y - 3, { kind: 'sign', text: `${spec.name}\n${spec.blurb}` });
  // Every town has a postbox and a bird perch for the taxi service.
  propAt(hub.x - 4, hub.y + 2, 'mailbox');
  map.setInteract(hub.x - 4, hub.y + 2, { kind: 'postbox', town: spec.id });
  propAt(hub.x + 6, hub.y + 2, 'perch');
  map.setInteract(hub.x + 6, hub.y + 2, { kind: 'taxi', town: spec.id });

  return { id: spec.id, name: spec.name, hub, rect: { x: ox, y: oy, w, h }, shops: placed };
}

function paveTile(map, reserved, x, y) {
  if (!map.inBounds(x, y)) return;
  const i = y * WORLD_W + x;
  if (isWater(map.ground[i])) return;
  if (map.ground[i] === T.CLIFF) return;
  map.ground[i] = T.COBBLE;
  reserved[i] = 2;
}

function placeShop(map, shop, x, y, townSpec, doors, rng) {
  const tw = shop.tw || 4;
  const roofStyle = shop.roofStyle || 'tile';
  // Keep the config on the object: the player's own cafe gets re-skinned when
  // they pick colours, and rebuilding needs everything but the colours held fixed.
  const cfg = {
    tw,
    wall: shop.wall || townSpec.style.wall,
    roof: shop.roof || townSpec.style.roofs[0],
    roofStyle,
    timbered: shop.timbered ?? (townSpec.style.timbered && rng.chance(0.5)),
    wallH: shop.wallH || 28, roofH: shop.roofH || 24, windows: 2,
    storeys: shop.storeys || 1,
    signKey: shop.sign, signBg: '#f3e3c6',
    awning: shop.awning || null,
    v: rng.int(4),
  };
  const building = map.addBuilding(buildingSprite(cfg), x, y, tw, 2, { data: { shop: shop.id } });
  if (building) building.cfg = cfg;
  // The door sits on the middle column, on the tile in front of the wall.
  const dx = x + Math.floor(tw / 2);
  const dy = y + 1;
  map.setInteract(dx, dy, { kind: 'door', shop: shop.id, name: shop.name });
  doors.push({ shop: shop.id, x: dx, y: dy, name: shop.name, town: townSpec.id });
  // Doormat so the entrance reads clearly.
  map.addObject('doormat', dx, dy, { flat: true });
  return { id: shop.id, x: dx, y: dy, name: shop.name };
}

// ---------------------------------------------------------------------------
// Landmarks & wilderness
// ---------------------------------------------------------------------------

function placeLandmarks(map, elev, reserved, inland, rng) {
  const out = [];
  const clear = (x, y, r, terrain) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (i * i + j * j > r * r) continue;
      const tx = x + i, ty = y + j;
      if (!map.inBounds(tx, ty)) continue;
      const k = ty * WORLD_W + tx;
      if (isWater(map.ground[k])) continue;
      if (terrain) map.ground[k] = terrain;
      reserved[k] = 1;
    }
  };

  // The old mill, on a river bank.
  {
    const x = 178, y = 128;
    clear(x, y, 6, T.DIRT);
    const spr = buildingSprite({ tw: 5, wall: '#d8cbb0', roof: '#6b5540', roofStyle: 'gable', timbered: true, wallH: 30, roofH: 26, windows: 1, v: 2 });
    map.addBuilding(spr, x - 2, y, 5, 2, {});
    map.setInteract(x, y + 1, { kind: 'door', shop: 'oldmill', name: 'The Old Mill' });
    map.addObject('barrel', x + 4, y + 1);
    map.addObject('crate', x + 5, y + 2);
    out.push({ id: 'oldmill', x, y: y + 1, name: 'The Old Mill' });
  }

  // Standing stones on the high downs.
  {
    const x = 262, y = 44;
    clear(x, y, 7, T.CLIFF_TOP);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const sx = Math.round(x + Math.cos(a) * 5), sy = Math.round(y + Math.sin(a) * 4);
      map.addObject('boulder', sx, sy, { variant: i % 3 });
    }
    // The middle of the circle is somewhere you stand, not a plaque you read —
    // and what happens when you stand there depends on the hour.
    for (const [ax, ay] of [[x, y], [x, y + 1], [x - 1, y], [x + 1, y]]) {
      map.setInteract(ax, ay, { kind: 'search', spot: 'stones' });
    }
    out.push({ id: 'stones', x, y, name: 'The Standing Stones' });
  }

  // Lighthouse out on the western rocks.
  {
    let x = 30, y = 214;
    for (let tries = 0; tries < 400; tries++) {
      const tx = rng.irange(16, 44), ty = rng.irange(190, 240);
      const i = ty * WORLD_W + tx;
      if (inland[i] > 0.25 && inland[i] < 0.34) { x = tx; y = ty; break; }
    }
    clear(x, y, 5, T.STONE);
    const spr = buildingSprite({ tw: 3, wall: '#f4f1e6', roof: '#d95f5f', roofStyle: 'gable', wallH: 54, roofH: 20, windows: 1, v: 1 });
    map.addBuilding(spr, x - 1, y, 3, 2, {});
    map.setInteract(x, y + 1, { kind: 'door', shop: 'lighthouse', name: 'Gullrock Light' });
    map.lights.push({ x: x * TILE + 8, y: (y - 2) * TILE, r: 90, color: '#ffe6a8' });
    out.push({ id: 'lighthouse', x, y: y + 1, name: 'Gullrock Light' });
  }

  // The Great Oak beside Oakhollow.
  {
    const x = 288, y = 104;
    clear(x, y, 4, T.FOREST_FLOOR);
    map.addObject('oak', x, y, { variant: 0 });
    map.addObject('oak', x + 1, y - 1, { variant: 1 });
    map.addObject('oak', x - 1, y - 1, { variant: 2 });
    map.setInteract(x, y + 1, { kind: 'sign', text: 'THE GREAT OAK\n\nIt is enormous. Three of the village houses lean on it slightly, and it does not appear to mind.' });
    out.push({ id: 'bigoak', x, y: y + 1, name: 'The Great Oak' });
  }

  // Saltmere pier. Opened in 1800 under the name Saltsouth, which is what the
  // town history still calls it and the reason anyone reading that has to work
  // out where to go. A pier has to actually stand over water, and which way the
  // sea lies from Saltmere depends on how the coastline came out of the noise —
  // so find the shore first, then walk seaward from it.
  {
    const wet = (tx, ty) => map.inBounds(tx, ty) && isWater(map.ground[ty * WORLD_W + tx]);
    const DIRS = [[0, 1], [-1, 0], [1, 0], [0, -1]];
    let best = null;
    for (let ty = 248; ty < 282 && !best; ty++) {
      for (let tx = 64; tx < 102 && !best; tx++) {
        if (wet(tx, ty) || map.blocked[ty * WORLD_W + tx]) continue;
        for (const [dx, dy] of DIRS) {
          // Open water, straight out: ten clear tiles with room either side, so
          // the deck never clips a headland on its way past.
          let run = 0;
          while (run < 13
            && wet(tx + dx * (run + 1), ty + dy * (run + 1))
            && wet(tx + dx * (run + 1) - dy, ty + dy * (run + 1) + dx)
            && wet(tx + dx * (run + 1) + dy, ty + dy * (run + 1) - dx)) run++;
          if (run >= 10) { best = { x: tx, y: ty, dx, dy }; break; }
        }
      }
    }
    if (best) {
      const { x, y, dx, dy } = best;
      const px = -dy, py = dx;                    // across the pier
      const len = 10;
      for (let i = 0; i <= len; i++) {
        const tx = x + dx * i, ty = y + dy * i;
        for (let k = -1; k <= 1; k++) {
          const cx = tx + px * k, cy = ty + py * k;
          if (!map.inBounds(cx, cy)) continue;
          const idx = cy * WORLD_W + cx;
          map.ground[idx] = T.DECK;
          map.blocked[idx] = 0;
          reserved[idx] = 1;
        }
        if (i > 0 && i % 4 === 0) map.addObject('lamppost', tx + px * 2, ty + py * 2, {});
      }
      const ex = x + dx * len, ey = y + dy * len;
      map.setInteract(x - dx, y - dy, { kind: 'sign', text: 'SALTMERE PIER\n\nA board at the landward '
        + 'end, repainted many times. Under the newest coat you can just make out an older name, '
        + 'and the year 1800.' });
      // The far end, where you can lie flat and put an arm into the mud.
      for (const [ax, ay] of [[ex, ey], [ex + px, ey + py], [ex - px, ey - py], [ex - dx, ey - dy]]) {
        map.setInteract(ax, ay, { kind: 'search', spot: 'pier_mud' });
      }
      map.lights.push({ x: ex * TILE + 8, y: ey * TILE, r: 80, color: '#ffe0b0' });
      out.push({ id: 'pier', x: ex, y: ey, name: 'Saltmere Pier' });
    }
  }

  // The hedge at the end of the lane in Brambleford. Nothing much, by day.
  {
    const x = 108, y = 186;
    clear(x, y, 3, T.GRASS);
    for (let i = -3; i <= 3; i++) map.addObject('bush', x + i, y, { variant: (i + 3) % 3 });
    for (const ax of [x - 1, x, x + 1]) map.setInteract(ax, y + 1, { kind: 'search', spot: 'bushes' });
    out.push({ id: 'bushes', x, y: y + 1, name: 'The Hedge at Lane End' });
  }

  // A couple of farms out in the fields.
  for (const [fx, fy] of [[150, 220], [232, 152]]) {
    clear(fx, fy, 5, T.DIRT);
    const spr = buildingSprite({ tw: 4, wall: '#e8dcc2', roof: '#d0a659', roofStyle: 'thatch', timbered: true, wallH: 26, roofH: 22, v: 3 });
    map.addBuilding(spr, fx - 2, fy, 4, 2, {});
    map.setInteract(fx, fy + 1, { kind: 'sign', text: 'A farmhouse. Boots by the door, and something excellent cooking inside.' });
    map.addObject('haystack', fx + 4, fy + 2, { variant: 0 });
    map.addObject('fence', fx + 3, fy + 4);
    map.addObject('fence', fx + 4, fy + 4);
    map.addObject('fence', fx + 5, fy + 4);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) map.set(fx + 3 + i, fy + 6 + j, T.FARM);
  }

  return out;
}

function scatterNature(map, elev, moist, inland, reserved, rng, seed) {
  const W = WORLD_W, H = WORLD_H;
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (reserved[i]) continue;
      if (map.blocked[i]) continue;
      const g = map.ground[i];
      if (isWater(g) || g === T.CLIFF || g === T.BRIDGE) continue;

      const r = hash2(x, y, seed + 4242);
      const m = moist[i];
      const nearWater = isWater(map.get(x + 1, y)) || isWater(map.get(x - 1, y))
        || isWater(map.get(x, y + 1)) || isWater(map.get(x, y - 1));

      if (g === T.SAND) {
        if (nearWater && r < 0.1) map.addObject('reeds', x, y, { variant: rng.int(3) });
        else if (r < 0.014) map.addObject('rock', x, y, { variant: rng.int(3) });
        continue;
      }

      if (g === T.FOREST_FLOOR) {
        // Dense woodland with a mix of species.
        if (r < 0.30) {
          const kind = m > 0.72 ? (r < 0.13 ? 'pine' : 'oak') : (r < 0.10 ? 'birch' : 'oak');
          map.addObject(kind, x, y, { variant: rng.int(3) });
        } else if (r < 0.36) map.addObject('bush', x, y, { variant: rng.int(3) });
        else if (r < 0.375) map.addObject('mushroom', x, y, { variant: rng.int(3) });
        else if (r < 0.382) map.addObject('stump', x, y, { variant: rng.int(2) });
        continue;
      }

      if (elev[i] === 2) {
        if (r < 0.02) map.addObject('rock', x, y, { variant: rng.int(3) });
        else if (r < 0.026) map.addObject('boulder', x, y, { variant: rng.int(3) });
        else if (r < 0.04) map.addObject('bush', x, y, { variant: rng.int(3) });
        continue;
      }

      // Open country: scattered trees, hedgerows and blossom.
      if (r < 0.028) map.addObject(r < 0.008 ? 'apple' : 'oak', x, y, { variant: rng.int(3) });
      else if (r < 0.045) map.addObject('bush', x, y, { variant: rng.int(3) });
      else if (r < 0.050) map.addObject('berrybush', x, y, { variant: rng.int(3) });
      else if (nearWater && r < 0.09) map.addObject(r < 0.07 ? 'reeds' : 'willow', x, y, { variant: rng.int(2) });
      else if (r < 0.055) map.addObject('rock', x, y, { variant: rng.int(3) });
    }
  }

  // Hedgerows along a few field boundaries, for that patchwork-country look.
  for (let k = 0; k < 60; k++) {
    const x0 = rng.irange(8, W - 20), y0 = rng.irange(8, H - 20);
    if (reserved[y0 * W + x0]) continue;
    if (map.get(x0, y0) !== T.MEADOW && map.get(x0, y0) !== T.GRASS) continue;
    const len = rng.irange(6, 22);
    const horiz = rng.chance(0.5);
    for (let i = 0; i < len; i++) {
      const x = x0 + (horiz ? i : 0), y = y0 + (horiz ? 0 : i);
      if (!map.inBounds(x, y)) break;
      const idx = y * W + x;
      if (reserved[idx] || map.blocked[idx]) continue;
      const g = map.ground[idx];
      if (isWater(g) || g === T.CLIFF) break;
      map.ground[idx] = T.HEDGE;
    }
  }
}

/** Boulders and thickets that seal off shortcuts until you have the right kit. */
/**
 * Somewhere to put a bridge: the narrowest run of water on a horizontal line
 * near (nearX, nearY). Returns the midpoint of that run, or null if there is
 * no river hereabouts — the coastline comes out of noise, so nothing about the
 * geography can be taken on trust.
 */
function findRiverCrossing(map, nearX, nearY) {
  let best = null;
  for (let y = nearY - 10; y <= nearY + 10; y++) {
    let x = nearX - 34;
    while (x < nearX + 34) {
      if (!map.inBounds(x, y) || !isWater(map.ground[y * WORLD_W + x])) { x++; continue; }
      const from = x;
      while (x < nearX + 44 && map.inBounds(x, y) && isWater(map.ground[y * WORLD_W + x])) x++;
      const width = x - from;
      // Wide enough to be a river worth bridging, narrow enough to bridge.
      if (width >= 3 && width <= 14) {
        const score = width * 3 + Math.abs(y - nearY);
        if (!best || score < best.score) {
          best = { x: Math.round((from + x - 1) / 2), y, score, width };
        }
      }
    }
  }
  return best;
}

/**
 * The line of deck to block, across the bridge rather than along it. A bridge
 * is the one place a boulder actually stops anyone: everywhere else you walk
 * round it, which is what the eastern pass used to be — three stones sitting
 * in open grass with clearance on every side.
 */
function bridgeBlockLine(map, near) {
  const tiles = [];
  for (let y = near.y - 7; y <= near.y + 7; y++) {
    for (let x = near.x - 12; x <= near.x + 12; x++) {
      if (map.inBounds(x, y) && map.ground[y * WORLD_W + x] === T.BRIDGE) tiles.push({ x, y });
    }
  }
  if (!tiles.length) return null;
  const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
  const loX = Math.min(...xs), hiX = Math.max(...xs);
  const loY = Math.min(...ys), hiY = Math.max(...ys);
  // The deck runs whichever way it is longer; block the short way across.
  const eastWest = hiX - loX >= hiY - loY;
  const mid = eastWest ? Math.round((loX + hiX) / 2) : Math.round((loY + hiY) / 2);
  const line = tiles.filter((t) => (eastWest ? t.x : t.y) === mid);
  if (!line.length) return null;
  // Stand to read the sign one step back along the deck, not on the stones.
  const approach = eastWest ? { x: mid - 1, y: line[0].y } : { x: line[0].x, y: mid - 1 };
  return { line, approach, eastWest, mid };
}

function placeBarriers(map, reserved, rng, pass) {
  const spots = [
    { id: 'millpath', x: 168, y: 136, need: 'shears',
      text: 'Brambles have swallowed the path to the mill entirely.\n\nYou would need something sharp.' },
    { id: 'cliffsteps', x: 84, y: 214, need: 'rope',
      text: 'The old steps down the cliff have crumbled away.\n\nA rope would make this climbable.' },
  ];
  const out = [];

  // The eastern pass sits on the bridge, right across the deck.
  const block = pass ? bridgeBlockLine(map, pass) : null;
  if (block) {
    const text = 'A slab of chalk the size of a cart has come down across the bridge.\n\n'
      + 'There is deep water either side of it. You would need proper tools to shift this.';
    for (const t of block.line) {
      const o = map.addObject('boulder', t.x, t.y, { variant: rng.int(3), id: 'eastpass' });
      if (o) out.push(o);
    }
    // Readable from either side, so you can find out what it wants whichever
    // way you arrived.
    const along = block.eastWest ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
    for (const t of block.line) {
      for (const [dx, dy] of along) {
        map.setInteract(t.x + dx, t.y + dy,
          { kind: 'barrier', barrier: 'eastpass', need: 'pickaxe', text });
      }
    }
    out.push({ id: 'eastpass', x: block.approach.x, y: block.approach.y, need: 'pickaxe', text });
  }

  for (const s of spots) {
    for (let k = -1; k <= 1; k++) {
      const x = s.x + k, y = s.y;
      if (!map.inBounds(x, y)) continue;
      const o = map.addObject(s.need === 'shears' ? 'berrybush' : 'boulder', x, y, { variant: rng.int(3), id: s.id });
      if (o) out.push(o);
    }
    map.setInteract(s.x, s.y + 1, { kind: 'barrier', barrier: s.id, need: s.need, text: s.text });
    out.push({ ...s });
  }
  return out;
}
