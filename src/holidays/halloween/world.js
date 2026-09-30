// Halloween out in the valley: fall trees, pumpkins, decorations and the corn maze.
//
// The trees turn by themselves (their painters ask whether it's Halloween; see
// src/art/objects.js). Everything else is put down here, after the valley has
// been generated, and from random numbers of its own: the world's generator is
// never asked for another number, so the valley underneath — every road, hedge,
// tree and barrier — is exactly the one you get on any other day. Every player
// in a shared valley runs this separately and has to end up with the same
// thing, so nothing here may depend on the clock, the date or Math.random.
//
// What goes where, and why it's safe:
//   - Jack-o'-lanterns by the doors, and lights and cobwebs on the buildings,
//     stand on the building's own footprint and are only drawn over the
//     doorstep, so they can't get in anybody's way.
//   - Pumpkin piles, corn shocks, hay bales and bare trees are solid, and only
//     go on open ground well clear of roads, doors, signs, landmarks and town
//     squares, and only where they can't pinch a way through shut (see
//     `wouldPinch`).
//   - The corn maze is a cat's face — ears, purple-corn eyes and nose, and
//     whiskers — by the farm south-east of Brambleford. It goes on the best open patch it can find near
//     the farmhouse, never over water, roads, buildings or anything you can
//     read or open, and only if the rest of the valley can still be walked.

import { T, TILE, isWater, isSolidTerrain } from '../../art/tiles.js';
import { dressingSprite, whiskerSprite } from '../../art/objects.js';
import { makeRng, hash2 } from '../../engine/util.js';
import { audio } from '../../engine/audio.js';

// The halves of "HALL", so the stream is Halloween's own and nobody else's.
const SALT = 0x48414c4c;

/** Ground that's a road or a path. Nothing solid ever goes on it. */
const PATHS = new Set([T.DIRT, T.COBBLE, T.GRAVEL, T.BRIDGE, T.DECK, T.STRAW]);
/** Open country, which is the only ground a decoration may stand on. */
const OPEN = new Set([T.GRASS, T.MEADOW, T.SAND, T.FOREST_FLOOR, T.CLIFF_TOP, T.STONE]);
/** What the maze may clear out of its way: the wild things scattered by worldgen. */
const SCATTER = new Set(['oak', 'pine', 'birch', 'apple', 'willow', 'bush', 'berrybush',
  'stump', 'reeds', 'mushroom', 'rock', 'boulder']);

const LANTERN_GLOW = '#ff9a3c';
const STRING_GLOW = '#ffb070';

/** Tag every object we put down, so tests (and anybody curious) can tell ours apart. */
const tag = (what) => ({ holiday: 'halloween', what });

// ---------------------------------------------------------------------------
// Looking the valley over
// ---------------------------------------------------------------------------

/**
 * What decorations have to keep off, worked out once. `clear` marks tiles
 * where nothing solid may go: every interact and warp with a tile round it,
 * two tiles in front of every door, the middle of each town square, the ground
 * round each landmark (quest folk stand beside those), and anything that is a
 * road, water, a cliff or already occupied.
 */
function survey(world) {
  const map = world.map;
  const W = map.w, H = map.h;
  const clear = new Uint8Array(W * H);
  const mark = (x, y) => { if (map.inBounds(x, y)) clear[y * W + x] = 1; };
  const around = (x, y, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) mark(x + i, y + j); };

  for (const [k, it] of map.interacts) {
    const [x, y] = k.split(',').map(Number);
    around(x, y, 1);
    if (it.kind === 'door' || it.kind === 'sign') {
      for (let j = 0; j <= 2; j++) for (let i = -1; i <= 1; i++) mark(x + i, y + j);
    }
  }
  for (const wp of map.warps) around(wp.x, wp.y, 1);
  for (const d of map.decals) around(d.tx, d.ty, 0);
  for (const t of Object.values(world.towns)) around(t.hub.x, t.hub.y, 5);
  for (const l of world.landmarks) around(l.x, l.y, 7);
  for (const b of world.barriers) if (b.x != null) around(b.x, b.y, 2);
  // Behind a building its roof hides whatever is there, or worse, a hay bale
  // pokes up over the ridge as if it had been thrown on top.
  for (const o of map.objects) {
    if (o.type !== '_building') continue;
    const top = o.ty - (o.th || 2) + 1;
    for (let y = top - 3; y < top; y++) for (let x = o.tx - 1; x <= o.tx + o.tw; x++) mark(x, y);
  }
  for (let i = 0; i < W * H; i++) {
    const g = map.ground[i];
    if (PATHS.has(g) || isWater(g) || !OPEN.has(g) || map.blocked[i]) clear[i] = 1;
  }

  // The farmhouses have no door of their own, only a sign where it would be.
  const farms = [];
  for (const [k, it] of map.interacts) {
    if (it.kind !== 'sign' || !/farmhouse/i.test(it.text || '')) continue;
    const [x, y] = k.split(',').map(Number);
    farms.push({ x, y: y - 1, door: { x, y } });
  }
  return { map, W, H, clear, farms };
}

/**
 * Would a solid thing here shut a way through? It's fine exactly when every
 * open side of the tile can still reach every other open side by going round
 * it, through the eight tiles surrounding it. Anything that passes can only
 * ever make a walk a step longer, never impossible.
 */
function wouldPinch(map, x, y) {
  const ring = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const open = ring.map(([dx, dy]) => !map.solid(x + dx, y + dy));
  // The four sides are ring positions 1, 3, 5, 7.
  const sides = [1, 3, 5, 7].filter((i) => open[i]);
  if (sides.length <= 1) return false;
  // Walk the ring from the first open side; round a corner only if it's open.
  const seen = new Set([sides[0]]);
  const q = [sides[0]];
  while (q.length) {
    const i = q.pop();
    for (const j of [(i + 1) % 8, (i + 7) % 8]) {
      if (!open[j] || seen.has(j)) continue;
      seen.add(j);
      q.push(j);
    }
  }
  return sides.some((i) => !seen.has(i));
}

/** Can something solid go here? */
function canPlace(S, x, y) {
  const { map, W } = S;
  if (x < 2 || y < 2 || x >= S.W - 2 || y >= S.H - 2) return false;
  if (S.clear[y * W + x]) return false;
  if (map.solid(x, y)) return false;
  return !wouldPinch(map, x, y);
}

/** Put down something solid, and keep other things from crowding in on it. */
function placeSolid(S, type, x, y, variant, what) {
  const o = S.map.addObject(type, x, y, { variant, data: tag(what) });
  // Room to walk round every piece, and no two piles in each other's pockets.
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    if (S.map.inBounds(x + i, y + j)) S.clear[(y + j) * S.W + (x + i)] = 1;
  }
  return o;
}

// ---------------------------------------------------------------------------
// The corn maze
// ---------------------------------------------------------------------------

// The cat, in tiles: a round head with two pointed ears, 27 wide and 26 tall.
// Odd sizes, and a middle on odd coordinates, because the maze's rooms sit on
// odd tiles and its walls on even ones.
const MAZE_W = 27;
const MAZE_H = 26;
const HEAD = { x: 13, y: 15.5, rx: 13.4, ry: 10.2 };
const EARS = [
  [[1, 0], [0.8, 12], [11, 6.5]],
  [[26, 0], [26.2, 12], [16, 6.5]],
];
// The clearing in the middle of the face, where the scarecrow stands.
const ROOM = { x0: 11, y0: 13, x1: 15, y1: 17 };
const MIDDLE = { x: 13, y: 15 };
// Purple corn for the eyes and the nose, so it's a face and not just a head.
// Maze-local tiles; the right eye is the left one mirrored.
const LEFT_EYE = [[6, 8], [7, 8], [8, 8], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [6, 10], [7, 10], [8, 10]];
const NOSE = [[12, 11], [13, 11], [14, 11], [13, 12]];
const FACE = new Set([...LEFT_EYE, ...LEFT_EYE.map(([x, y]) => [MAZE_W - 1 - x, y]), ...NOSE]
  .map(([x, y]) => `${x},${y}`));
// Three whiskers a side, laid in straw on the grass: straight lines in
// pixels from the maze's top-left corner, starting just inside the cheek.
const WHISKERS = [
  [3, 14 * 16 + 4, -78, 12 * 16 + 2],
  [3, 15 * 16 + 8, -84, 15 * 16 + 10],
  [3, 17 * 16 + 12, -78, 19 * 16 + 14],
];
// How far the whole thing reaches, whiskers and a margin of open grass
// included, relative to the maze's top-left tile. Two rows under the chin,
// where the way in is.
const REACH = { x0: -6, y0: -1, x1: MAZE_W + 5, y1: MAZE_H + 2 };

function inTriangle(px, py, [a, b, c]) {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const p = [px, py];
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** 1 where the cat is, in maze-local tiles. */
function catMask() {
  const m = new Uint8Array(MAZE_W * MAZE_H);
  for (let y = 0; y < MAZE_H; y++) {
    for (let x = 0; x < MAZE_W; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const e = ((cx - HEAD.x - 0.5) / HEAD.rx) ** 2 + ((cy - HEAD.y) / HEAD.ry) ** 2;
      if (e <= 1 || EARS.some((t) => inTriangle(cx, cy, t))) m[y * MAZE_W + x] = 1;
    }
  }
  return m;
}

/**
 * Carve a perfect maze into the cat: rooms on odd tiles, walls between them,
 * a randomised depth-first walk from the clearing in the middle. Every room it
 * reaches is joined to the middle by exactly one way. Returns the local grid
 * (0 not the maze, 1 corn, 2 path, 3 purple corn), the way in, and the dead
 * ends.
 */
function carveMaze(rng) {
  const mask = catMask();
  const inMask = (x, y) => x >= 0 && y >= 0 && x < MAZE_W && y < MAZE_H && mask[y * MAZE_W + x] === 1;
  // A room needs corn all round it, or it would open onto the grass. The eyes
  // and nose are corn too, just purple: a room may sit beside them, but no
  // room or doorway is ever cut through them.
  const face = (x, y) => FACE.has(`${x},${y}`);
  const isRoom = (x, y) => {
    if (x % 2 !== 1 || y % 2 !== 1 || face(x, y)) return false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!inMask(x + i, y + j)) return false;
    return true;
  };
  // 0 not the maze, 1 corn, 2 path, 3 purple corn.
  const grid = new Uint8Array(MAZE_W * MAZE_H);
  for (let y = 0; y < MAZE_H; y++) {
    for (let x = 0; x < MAZE_W; x++) {
      const i = y * MAZE_W + x;
      grid[i] = !mask[i] ? 0 : FACE.has(`${x},${y}`) ? 3 : 1;
    }
  }
  const open = (x, y) => { grid[y * MAZE_W + x] = 2; };

  // The clearing counts as one room with several doors, all opened by the walk.
  const seen = new Set();
  const stack = [];
  for (let y = ROOM.y0; y <= ROOM.y1; y++) for (let x = ROOM.x0; x <= ROOM.x1; x++) open(x, y);
  for (let y = ROOM.y0; y <= ROOM.y1; y += 2) {
    for (let x = ROOM.x0; x <= ROOM.x1; x += 2) { seen.add(`${x},${y}`); stack.push([x, y]); }
  }
  rng.shuffle(stack);
  const links = new Map();                      // room -> how many ways out of it
  const link = (a, b) => {
    for (const k of [a, b]) links.set(k, (links.get(k) || 0) + 1);
  };
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const next = [[2, 0], [-2, 0], [0, 2], [0, -2]]
      .map(([dx, dy]) => [x + dx, y + dy, dx, dy])
      .filter(([nx, ny, dx, dy]) => isRoom(nx, ny) && !seen.has(`${nx},${ny}`) && !face(x + dx / 2, y + dy / 2));
    if (!next.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = next[rng.int(next.length)];
    open(x + dx / 2, y + dy / 2);
    open(nx, ny);
    seen.add(`${nx},${ny}`);
    link(`${x},${y}`, `${nx},${ny}`);
    stack.push([nx, ny]);
  }

  // The way in is under the chin: the lowest room straight down from the
  // middle, cut through to the grass below.
  let ex = MIDDLE.x, ey = -1;
  const lowest = (MAZE_H - 2) % 2 ? MAZE_H - 2 : MAZE_H - 3;
  for (let y = lowest; y > ROOM.y1; y -= 2) if (seen.has(`${ex},${y}`)) { ey = y; break; }
  if (ey < 0) return null;
  let y = ey + 1;
  while (inMask(ex, y)) { open(ex, y); y++; }
  const entrance = { x: ex, y };                // the first tile outside the corn
  const inRoom = (x2, y2) => x2 >= ROOM.x0 && x2 <= ROOM.x1 && y2 >= ROOM.y0 && y2 <= ROOM.y1;
  const deadEnds = [...seen].map((k) => k.split(',').map(Number))
    .filter(([x2, y2]) => links.get(`${x2},${y2}`) === 1 && !inRoom(x2, y2) && !(x2 === ex && y2 === ey));
  return { grid, entrance, deadEnds };
}

/**
 * A summed-area table, so "is anything in this rectangle bad?" costs four
 * lookups however big the rectangle is. The maze tries a few hundred places.
 */
function sat(W, H, at) {
  const s = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += at(x, y);
      s[(y + 1) * (W + 1) + (x + 1)] = s[y * (W + 1) + (x + 1)] + row;
    }
  }
  return (x0, y0, x1, y1) => {                   // inclusive
    const w = W + 1;
    return s[(y1 + 1) * w + (x1 + 1)] - s[y0 * w + (x1 + 1)] - s[(y1 + 1) * w + x0] + s[y0 * w + x0];
  };
}

/** Everything walkable from `from`, as a mask, with `solidAt` saying what's in the way. */
function flood(W, H, from, solidAt) {
  const seen = new Uint8Array(W * H);
  const q = [from.y * W + from.x];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (seen[ni] || solidAt(nx, ny)) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  let n = 0;
  for (let i = 0; i < seen.length; i++) n += seen[i];
  return { seen, n };
}

/**
 * Find the maze a home near the farmhouse and build it. Every candidate spot
 * is scored — close to the farm, few trees to clear, not on the beach — and
 * the best few are tried in turn until one keeps the valley in one piece.
 * Returns what the tests need to find it, or null if nowhere would do.
 */
function buildMaze(world, S, rng) {
  const { map, W, H } = S;
  const carved = carveMaze(rng);
  if (!carved) return null;
  const { grid, entrance, deadEnds } = carved;

  // Which of the objects in the way the maze may clear, tile by tile.
  const movable = new Uint8Array(W * H);
  const blockers = new Map();
  for (const o of map.objects) {
    if (o.type === '_building') continue;
    const ok = SCATTER.has(o.type) && !o.id && !o.data;
    for (let j = 0; j < (o.th || 1); j++) {
      for (let i = 0; i < (o.tw || 1); i++) {
        const x = o.tx + i, y = o.ty - j;
        if (!map.inBounds(x, y)) continue;
        const k = y * W + x;
        movable[k] = ok && movable[k] !== 2 ? 1 : 2;
        if (!blockers.has(k)) blockers.set(k, []);
        blockers.get(k).push(o);
      }
    }
  }
  // The farm south-east of Brambleford, which worldgen puts at 150,220: the
  // nearest farmhouse to there, in case that ever moves a little.
  const farmAt = S.farms.length ? S.farms.reduce((a, b) => (
    Math.hypot(a.x - 150, a.y - 220) <= Math.hypot(b.x - 150, b.y - 220) ? a : b)) : { x: 150, y: 220, door: { x: 150, y: 221 } };
  const towns = Object.values(world.towns);
  const decalAt = new Set(map.decals.map((d) => d.ty * W + d.tx));
  const readable = new Set([...map.interacts.keys()].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return y * W + x;
  }));

  /**
   * Every spot the maze could go whose top-left is within `SEARCH` of the
   * farm, best first. Only the ground the search can reach is looked at: the
   * valley is a hundred thousand tiles, and usually the farm has room nearby.
   */
  const findSpots = (SEARCH) => {
    const R = {
      x0: Math.max(0, farmAt.x + SEARCH.x0 + REACH.x0), y0: Math.max(0, farmAt.y + SEARCH.y0 + REACH.y0),
      x1: Math.min(W - 1, farmAt.x + SEARCH.x1 + REACH.x1), y1: Math.min(H - 1, farmAt.y + SEARCH.y1 + REACH.y1),
    };
    const RW = R.x1 - R.x0 + 1, RH = R.y1 - R.y0 + 1;
    // Tiles the maze must not touch at all.
    const bad = new Uint8Array(RW * RH);
    const near = (x, y, px, py, r) => Math.abs(x - px) <= r && Math.abs(y - py) <= r;
    for (let y = R.y0; y <= R.y1; y++) {
      for (let x = R.x0; x <= R.x1; x++) {
        const i = y * W + x;
        const g = map.ground[i];
        // A hedgerow may be planted over with corn (it's field boundary, not
        // anything you'd miss); anything else that isn't open country may not.
        let b = (!OPEN.has(g) && g !== T.HEDGE) || (map.blocked[i] && movable[i] !== 1) || decalAt.has(i) || movable[i] === 2;
        if (!b && readable.has(i)) b = true;
        if (!b) for (const t of towns) if (x >= t.rect.x - 4 && x < t.rect.x + t.rect.w + 4 && y >= t.rect.y - 4 && y < t.rect.y + t.rect.h + 4) { b = true; break; }
        if (!b) for (const l of world.landmarks) if (near(x, y, l.x, l.y, 8)) { b = true; break; }
        if (!b) for (const f of S.farms) if (near(x, y, f.x, f.y, 7)) { b = true; break; }
        if (!b) for (const wp of map.warps) if (near(x, y, wp.x, wp.y, 2)) { b = true; break; }
        bad[(y - R.y0) * RW + (x - R.x0)] = b ? 1 : 0;
      }
    }
    const elev = world.elev;
    // Tables over the search region, asked in world coordinates.
    const table = (at) => {
      const q = sat(RW, RH, (x, y) => at(x + R.x0, y + R.y0));
      return (x0, y0, x1, y1) => q(x0 - R.x0, y0 - R.y0, x1 - R.x0, y1 - R.y0);
    };
    const badIn = table((x, y) => bad[(y - R.y0) * RW + (x - R.x0)]);
    const highIn = table((x, y) => (elev ? (elev[y * W + x] > 0 ? 1 : 0) : 0));
    const topIn = table((x, y) => (elev ? (elev[y * W + x] > 1 ? 1 : 0) : 0));
    const costIn = table((x, y) => {
      const i = y * W + x;
      // Open meadow is what the cat reads best on; a wood it has to be cut out of
      // is a last resort.
      const g = map.ground[i];
      return (movable[i] === 1 ? 0.35 : 0) + (g === T.SAND ? 0.6 : 0) + (g === T.FOREST_FLOOR ? 0.25 : 0) + (g === T.HEDGE ? 0.3 : 0);
    });

    const cands = [];
    for (let oy = farmAt.y + SEARCH.y0; oy <= farmAt.y + SEARCH.y1; oy += 2) {
      for (let ox = farmAt.x + SEARCH.x0; ox <= farmAt.x + SEARCH.x1; ox += 2) {
        const x0 = ox + REACH.x0, y0 = oy + REACH.y0, x1 = ox + REACH.x1, y1 = oy + REACH.y1;
        if (x0 < Math.max(2, R.x0) || y0 < Math.max(2, R.y0) || x1 > Math.min(W - 3, R.x1) || y1 > Math.min(H - 3, R.y1)) continue;
        if (badIn(x0, y0, x1, y1) > 0) continue;
        // All on one level: a maze half up a terrace would have a cliff in it.
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const hi = highIn(x0, y0, x1, y1), top = topIn(x0, y0, x1, y1);
        if ((hi !== 0 && hi !== area) || (top !== 0 && top !== area)) continue;
        const door = { x: ox + entrance.x, y: oy + entrance.y };
        // The way in has to be open ground, not a hedge, with room for its
        // lanterns and sign either side.
        let gate = true;
        for (let j = 0; j <= 1 && gate; j++) for (let i = -3; i <= 3; i++) {
          if (isSolidTerrain(map.get(door.x + i, door.y + j))) { gate = false; break; }
        }
        if (!gate) continue;
        const walk = Math.hypot(door.x - farmAt.door.x, door.y - farmAt.door.y);
        cands.push({ ox, oy, score: walk + costIn(x0, y0, x1, y1) });
      }
    }
    cands.sort((a, b) => a.score - b.score || a.oy - b.oy || a.ox - b.ox);
    return cands;
  };

  // Where everybody starts from, and how much of the valley they can walk.
  const home = world.towns.brambleford ? world.towns.brambleford.hub : towns[0].hub;
  const before = flood(W, H, home, (x, y) => map.solid(x, y));

  // Near the farm on clean ground first. Failing that, near the farm with any
  // stub of hedgerow planted over with corn too; failing that, anywhere in the
  // valley — a quest waits on this maze, so every valley has to have one.
  const passes = [
    { area: { x0: -62, y0: -48, x1: 34, y1: 26 }, stubs: false },
    { area: { x0: -62, y0: -48, x1: 34, y1: 26 }, stubs: true },
    { area: { x0: -farmAt.x, y0: -farmAt.y, x1: W - farmAt.x, y1: H - farmAt.y }, stubs: true },
  ];
  for (const pass of passes) {
    let tried = 0;
    for (const c of findSpots(pass.area)) {
      if (tried >= 16) break;
      const { ox, oy } = c;
      const inReach = (x, y) => x >= ox + REACH.x0 && x <= ox + REACH.x1 && y >= oy + REACH.y0 && y <= oy + REACH.y1;
      const corn = (x, y) => {
        const lx = x - ox, ly = y - oy;
        return lx >= 0 && ly >= 0 && lx < MAZE_W && ly < MAZE_H && grid[ly * MAZE_W + lx] !== 0;
      };
      // A hedgerow the corn is planted over is gone; a stub of one left in the
      // notch between the ears, or across a whisker, just looks like a mistake.
      let stub = false;
      for (let y = oy + REACH.y0; y <= oy + REACH.y1 && !stub; y++) {
        for (let x = ox + REACH.x0; x <= ox + REACH.x1; x++) {
          if (map.get(x, y) === T.HEDGE && !corn(x, y)) { stub = true; break; }
        }
      }
      if (stub && !pass.stubs) continue;
      tried++;
      // The valley as it will be: the maze a solid lump (its paths lead nowhere
      // but back out), the scatter round it cleared away.
      const after = flood(W, H, home, (x, y) => (corn(x, y) ? true
        : inReach(x, y) ? isSolidTerrain(map.get(x, y)) : map.solid(x, y)));
      const door = { x: ox + entrance.x, y: oy + entrance.y };
      if (!after.seen[door.y * W + door.x]) continue;
      // What the maze itself covers is bound to go; anything more is somewhere
      // it's cut off, and that's not allowed.
      let covered = 0;
      for (let ly = 0; ly < MAZE_H; ly++) for (let lx = 0; lx < MAZE_W; lx++) {
        if (grid[ly * MAZE_W + lx] && before.seen[(oy + ly) * W + (ox + lx)]) covered++;
      }
      if (before.n - after.n > covered) continue;
      return raiseMaze(world, S, rng, { ox, oy, grid, entrance, deadEnds, blockers, inReach });
    }
  }
  return null;
}

/** Actually lay the maze down at a spot that's been checked. */
function raiseMaze(world, S, rng, m) {
  const { map, W } = S;
  const { ox, oy, grid, entrance, deadEnds, blockers } = m;
  // Clear the scatter off the whole patch, whiskers and margin included, so
  // the cat stands out on open grass.
  const doomed = new Set();
  for (let y = oy + REACH.y0; y <= oy + REACH.y1; y++) {
    for (let x = ox + REACH.x0; x <= ox + REACH.x1; x++) {
      for (const o of blockers.get(y * W + x) || []) doomed.add(o);
    }
  }
  // All at once rather than through removeObject(), which re-indexes every
  // object in the valley each time: a few hundred of those was most of the
  // time decorating took.
  const keep = map.objects.filter((o) => !doomed.has(o));
  map.objects.length = 0;
  for (const o of keep) map.objects.push(o);
  for (const o of doomed) {
    if (!o.solid) continue;
    for (let j = 0; j < (o.th || 1); j++) for (let i = 0; i < (o.tw || 1); i++) map.block(o.tx + i, o.ty - j, false);
  }
  map.indexObjects();

  for (let ly = 0; ly < MAZE_H; ly++) {
    for (let lx = 0; lx < MAZE_W; lx++) {
      const v = grid[ly * MAZE_W + lx];
      if (v) map.set(ox + lx, oy + ly, v === 1 ? T.CORN : v === 2 ? T.STRAW : T.CORN_PURPLE);
    }
  }
  // Any bit of hedgerow left sticking out (only ever on the fallback passes)
  // becomes a clump of corn: a field's straggler rather than a stray hedge.
  for (let y = oy + REACH.y0; y <= oy + REACH.y1; y++) {
    for (let x = ox + REACH.x0; x <= ox + REACH.x1; x++) if (map.get(x, y) === T.HEDGE) map.set(x, y, T.CORN);
  }
  // The whiskers, a slice per tile they cross, left side and the right
  // mirrored. Flat on the ground: you can walk over them.
  for (const [ax, ay, bx, by] of WHISKERS) {
    for (const [x0, x1] of [[ax, bx], [MAZE_W * TILE - ax, MAZE_W * TILE - bx]]) {
      const wx0 = ox * TILE + x0, wy0 = oy * TILE + ay, wx1 = ox * TILE + x1, wy1 = oy * TILE + by;
      const tiles = new Set();
      const len = Math.max(Math.abs(wx1 - wx0), Math.abs(wy1 - wy0));
      for (let i = 0; i <= len; i++) {
        const px = Math.round(wx0 + ((wx1 - wx0) * i) / len), py = Math.round(wy0 + ((wy1 - wy0) * i) / len);
        for (const dy of [-1, 0, 2]) tiles.add(`${Math.floor(px / TILE)},${Math.floor((py + dy) / TILE)}`);
      }
      for (const k of tiles) {
        const [tx, ty] = k.split(',').map(Number);
        if (!OPEN.has(map.get(tx, ty)) || map.solid(tx, ty)) continue;
        const o = map.addObject('whisker', tx, ty, { flat: true, data: tag('whisker') });
        o.sprite = whiskerSprite(wx0 - tx * TILE, wy0 - ty * TILE, wx1 - tx * TILE, wy1 - ty * TILE);
      }
    }
  }

  // The middle: the scarecrow, a lantern either side of its head, and the
  // basket of treats in front of it, which is what you've come for.
  const mx = ox + MIDDLE.x, my = oy + MIDDLE.y;
  map.addObject('scarecrowCat', mx, my, { data: tag('scarecrow') });
  map.addObject('jackOLantern', mx - 1, my - 1, { variant: 1, data: tag('lantern') });
  map.addObject('jackOLantern', mx + 1, my - 1, { variant: 3, data: tag('lantern') });
  map.addObject('treatBasket', mx, my + 1, { data: tag('prize') });
  const prize = { x: mx, y: my + 1 };
  map.setInteract(prize.x, prize.y, { kind: 'maze_prize', prompt: 'Look in the basket' });
  map.lights.push({ x: mx * TILE + 8, y: my * TILE, r: 46, color: LANTERN_GLOW, phase: 1.3 });

  // A few dead ends get a pumpkin, so a wrong turn has something in it.
  rng.shuffle(deadEnds);
  for (const [lx, ly] of deadEnds.slice(0, 3)) {
    map.addObject('pumpkinPile', ox + lx, oy + ly, { variant: rng.int(3), data: tag('pumpkins') });
  }

  // The way in: a lantern each side of the gap, and the sign.
  const ex = ox + entrance.x, ey = oy + entrance.y;
  map.addObject('jackOLantern', ex - 1, ey, { variant: 0, data: tag('lantern') });
  map.addObject('jackOLantern', ex + 1, ey, { variant: 2, data: tag('lantern') });
  map.lights.push({ x: ex * TILE + 8, y: ey * TILE + 8, r: 40, color: LANTERN_GLOW, phase: 4.1 });
  map.addObject('mazeSign', ex - 3, ey, { data: tag('sign') });
  map.setInteract(ex - 3, ey, {
    kind: 'sign',
    text: "THE CORN MAZE\n\nSomebody's planted a whole field of corn in the shape of a cat! "
      + "Find your way to the middle, where there's a treat waiting for you.",
  });
  map.addObject('hayBale', ex + 3, ey, { variant: 1, data: tag('hay') });

  // Keep the rest of the decorating off it.
  for (let y = oy + REACH.y0; y <= oy + REACH.y1; y++) {
    for (let x = ox + REACH.x0; x <= ox + REACH.x1; x++) if (map.inBounds(x, y)) S.clear[y * W + x] = 1;
  }
  for (let y = ey; y <= ey + 3; y++) for (let x = ex - 4; x <= ex + 4; x++) if (map.inBounds(x, y)) S.clear[y * W + x] = 1;

  return {
    x: ox, y: oy, w: MAZE_W, h: MAZE_H,
    reach: { x: ox + REACH.x0, y: oy + REACH.y0, w: REACH.x1 - REACH.x0 + 1, h: REACH.y1 - REACH.y0 + 1 },
    entrance: { x: ex, y: ey }, prize, middle: { x: mx, y: my }, cleared: doomed.size,
  };
}

// ---------------------------------------------------------------------------
// Doors, roofs and corners
// ---------------------------------------------------------------------------

/**
 * Every building with a way in: jack-o'-lanterns on the step, and for some,
 * lights round the roofline and a cobweb or two. The lanterns and the dressing
 * share the building's own footprint, so they stand where nobody walks.
 */
function dressBuildings(S, rng) {
  const { map } = S;
  const buildings = map.objects.filter((o) => o.type === '_building');
  for (const b of buildings) {
    const doorX = b.tx + Math.floor(b.tw / 2), doorY = b.ty + 1;
    const door = map.interactAt(doorX, doorY);
    if (!door || (door.kind !== 'door' && door.kind !== 'sign')) continue;
    const cafe = !!(b.data && b.data.shop === 'cafe');
    const house = !!(b.data && b.data.house);
    const shop = !!(b.data && b.data.shop) && !cafe;

    // Lanterns: most doors get one, some get a pair, and the cafe always does.
    const roll = rng();
    const pair = cafe || roll < 0.3;
    const cx = b.tx * TILE + b.tw * 8;
    let glow = null;
    if (cafe || roll < 0.78) {
      const sides = pair ? [-1, 1] : [rng.chance(0.5) ? -1 : 1];
      for (const s of sides) lantern(map, b, s, rng.int(4));
      glow = { x: pair ? cx : cx + sides[0] * 14, y: (b.ty + 1) * TILE - 4, r: pair ? 34 : 26, color: LANTERN_GLOW, phase: rng() * 6.28 };
      map.lights.push(glow);
    }

    // Lights and cobwebs. They need the building's own shape to hang from.
    if (!b.cfg) continue;
    let lights = 0, webs = 0;
    if (cafe) { lights = 2; webs = 1; }
    else if (house) {
      if (rng.chance(0.45)) lights = rng.chance(0.5) ? 1 : 2;
      if (rng.chance(0.35)) webs = 1 + rng.int(3);
    } else if (shop) {
      if (rng.chance(0.35)) lights = 1 + rng.int(2);
      if (rng.chance(0.2)) webs = 1 + rng.int(2);
    }
    if (!lights && !webs) continue;
    const o = map.addObject('dressing', b.tx, b.ty, { data: tag('dressing') });
    o.sprite = dressingSprite(b.cfg, { lights, webs });
    o.tw = b.tw;
    o.w = o.sprite.width;
    o.h = o.sprite.height;
    o.sortBias = 1;                               // over its own building
    if (lights) {
      // The renderer draws every light every frame after dark, so a building
      // with lanterns and a string of bulbs gets one light that covers both —
      // halfway up the wall, and big enough to reach the eaves and the step.
      const wallH = b.cfg.wallH || 26, roofH = b.cfg.roofH || 22;
      const roof = (b.ty + 1) * TILE - 4 - wallH - Math.round(roofH / 2);
      if (glow) { glow.x = cx; glow.y = Math.round((roof + glow.y) / 2); glow.r = 14 + Math.round((wallH + roofH) / 2) + b.tw * 4; }
      else map.lights.push({ x: cx, y: roof, r: 18 + b.tw * 7, color: STRING_GLOW, phase: rng() * 6.28 });
    }
  }
}

/**
 * A jack-o'-lantern on a building's step, `side` -1 or 1 of the door. Its
 * tile is the building's own; it's only drawn a few pixels forward, onto the
 * doorstep, and after the building so it sits in front of the wall.
 */
function lantern(map, b, side, variant) {
  const px = b.tx * TILE + b.tw * 8 + side * 14;
  const tx = Math.max(b.tx, Math.min(b.tx + b.tw - 1, Math.floor(px / TILE)));
  const o = map.addObject('jackOLantern', tx, b.ty, {
    variant, solid: false, offX: px - (tx * TILE + 8), offY: 3, data: tag('lantern'),
  });
  o.sortBias = 2;
  return o;
}

// ---------------------------------------------------------------------------
// The harvest: piles of pumpkins, corn shocks and hay round the towns and farms
// ---------------------------------------------------------------------------

// Type and how many looks it has, listed as often as it should turn up.
const HARVEST = [['pumpkinPile', 3], ['pumpkinPile', 3], ['cornShock', 2], ['cornShock', 2], ['hayBale', 2]];
const pickHarvest = (rng) => HARVEST[rng.int(HARVEST.length)];

/**
 * Up to `count` harvest pieces in a band round a place. Tiles next to a road
 * are preferred, so they read as put out for passers-by rather than dropped
 * in a field.
 */
function scatterHarvest(S, rng, area, count, what) {
  const { map } = S;
  const spots = [];
  for (let y = area.y0; y <= area.y1; y++) {
    for (let x = area.x0; x <= area.x1; x++) {
      if (area.inner && x >= area.inner.x0 && x <= area.inner.x1 && y >= area.inner.y0 && y <= area.inner.y1) continue;
      if (!canPlace(S, x, y)) continue;
      let roadside = false;
      for (let j = -2; j <= 2 && !roadside; j++) for (let i = -2; i <= 2; i++) {
        if (PATHS.has(map.get(x + i, y + j))) { roadside = true; break; }
      }
      spots.push({ x, y, w: (roadside ? 0 : 1) + hash2(x, y, S.seed) });
    }
  }
  spots.sort((a, b) => a.w - b.w);
  let placed = 0;
  for (const s of spots) {
    if (placed >= count) break;
    if (!canPlace(S, s.x, s.y)) continue;           // a neighbour may have taken it
    const [type, variants] = pickHarvest(rng);
    placeSolid(S, type, s.x, s.y, rng.int(variants), what);
    placed++;
  }
  return placed;
}

/** A crooked bare tree or two just outside a place. */
function bareTrees(S, rng, area, count) {
  let placed = 0;
  for (let tries = 0; tries < 200 && placed < count; tries++) {
    const x = area.x0 + rng.int(area.x1 - area.x0 + 1), y = area.y0 + rng.int(area.y1 - area.y0 + 1);
    if (area.inner && x >= area.inner.x0 && x <= area.inner.x1 && y >= area.inner.y0 && y <= area.inner.y1) continue;
    // Room for its branches: nothing solid in the tiles above it.
    if (!canPlace(S, x, y) || S.map.solid(x, y - 1) || S.map.solid(x - 1, y - 1) || S.map.solid(x + 1, y - 1)) continue;
    placeSolid(S, 'bareTree', x, y, rng.int(3), 'bare tree');
    placed++;
  }
  return placed;
}

/** Around the player's own cafe: a little more than the neighbours get. */
function dressCafe(S) {
  const cafe = S.map.objects.find((o) => o.type === '_building' && o.data && o.data.shop === 'cafe');
  if (!cafe) return 0;
  const area = { x0: cafe.tx - 3, y0: cafe.ty - 3, x1: cafe.tx + cafe.tw + 2, y1: cafe.ty + 3 };
  let n = 0;
  // A pumpkin pile, a corn shock and a hay bale, as close to the cafe as fits.
  for (const [type, variant] of [['pumpkinPile', 0], ['cornShock', 1], ['hayBale', 1]]) {
    let best = null;
    for (let y = area.y0; y <= area.y1; y++) {
      for (let x = area.x0; x <= area.x1; x++) {
        if (!canPlace(S, x, y)) continue;
        const d = Math.abs(x - (cafe.tx + cafe.tw / 2)) + Math.abs(y - cafe.ty) * 1.5 + hash2(x, y, S.seed) * 0.1;
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    if (!best) continue;
    placeSolid(S, type, best.x, best.y, variant, 'cafe');
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// The hooks
// ---------------------------------------------------------------------------

/** Dress the valley after it's generated. See ../content.js. */
export function decorateWorld(world, seed) {
  const rng = makeRng((seed ^ SALT) >>> 0);
  const S = survey(world);
  S.seed = seed;

  // The maze first, since it needs the most room; everything else keeps off it.
  const maze = buildMaze(world, S, rng);
  dressBuildings(S, rng);
  dressCafe(S);
  for (const t of Object.values(world.towns)) {
    const r = t.rect;
    scatterHarvest(S, rng, { x0: r.x - 3, y0: r.y - 3, x1: r.x + r.w + 2, y1: r.y + r.h + 2 }, 7, 'town');
    bareTrees(S, rng, { x0: r.x - 7, y0: r.y - 7, x1: r.x + r.w + 6, y1: r.y + r.h + 6,
      inner: { x0: r.x - 1, y0: r.y - 1, x1: r.x + r.w, y1: r.y + r.h } }, 1);
  }
  for (const f of S.farms) {
    scatterHarvest(S, rng, { x0: f.x - 10, y0: f.y - 8, x1: f.x + 12, y1: f.y + 13,
      inner: { x0: f.x - 5, y0: f.y - 5, x1: f.x + 5, y1: f.y + 5 } }, 6, 'farm');
  }
  if (maze) {
    const r = maze.reach;
    bareTrees(S, rng, { x0: r.x - 5, y0: r.y - 5, x1: r.x + r.w + 4, y1: r.y + r.h + 4,
      inner: { x0: r.x, y0: r.y, x1: r.x + r.w - 1, y1: r.y + r.h - 1 } }, 2);
  }
  world.map.indexObjects();
  // Where the maze ended up, for the tests and anybody debugging a valley.
  world.map.meta.halloweenMaze = maze;
}

/** A holiday interact tile was pressed. See ../content.js. */
export function interact(game, it, tile) { // eslint-disable-line no-unused-vars
  if (it.kind !== 'maze_prize') return;
  const st = game.state;
  // The scarecrow is a cat, so naturally it talks.
  const speaker = 'Scarecrow Cat';
  if (st.flags.halloween_maze) {
    audio.sfx('ui_ok', { gain: 0.4 });
    game.dialogue.say("Hello again! You've already found your way to the middle this year. "
      + "I'm saving the rest of the treats for the next visitor, okay?", { speaker });
    return;
  }
  // Set before anything else, so a second press while the words are still
  // coming up can't pay out twice.
  st.flags.halloween_maze = true;
  st.touch('flags');
  st.give('catnip', 2);
  st.earn(60);
  audio.sfx('fanfare', { gain: 0.6 });
  game.dialogue.say("You found me! Hardly anybody makes it all the way to the middle. "
    + "Here, take a treat from my basket. You've earned it!", {
    speaker,
    onDone: () => {
      const nip = st.itemName ? st.itemName('catnip') : 'Catnip';
      if (game.hud) game.hud.toast(`Found: 2 ${nip} and 60 fish`, 'good', 5);
      if (game.checkQuestProgress) game.checkQuestProgress();
    },
  });
}
