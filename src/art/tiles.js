// Terrain. Every tile is painted procedurally into a 16x16 pixel buffer, with a
// handful of variants per terrain so large fields don't look stamped. Borders
// between terrains are handled by "edge overlays": the higher-priority terrain
// grows an irregular fringe into its neighbour, which reads as organic grass
// creeping over a dirt path.

import { PixBuf, shade, mixHex } from '../engine/pixel.js';
import { hash2 } from '../engine/util.js';
import { P } from './palette.js';

export const TILE = 16;

// Terrain ids. Keep these stable — saved games store tile arrays.
export const T = {
  VOID: 0,
  GRASS: 1,
  MEADOW: 2,
  FOREST_FLOOR: 3,
  DIRT: 4,
  SAND: 5,
  COBBLE: 6,
  WATER: 7,
  WATER_DEEP: 8,
  STONE: 9,
  CLIFF: 10,
  GRAVEL: 11,
  FARM: 12,
  FLOOR_WOOD: 13,
  FLOOR_TILE: 14,
  RUG: 15,
  DECK: 16,
  WALL_IN: 17,
  HEDGE: 18,
  FLOWERBED: 19,
  MUD: 20,
  CLIFF_TOP: 21,
  FLOOR_STONE: 22,
  CARPET_GREEN: 23,
  BRIDGE: 24,
  COUNTER: 25,
  WALL_TOP: 26,
};

const rgb = (hex, a = 255) => PixBuf.rgba(hex, a);

/** Deterministic 0..1 noise for a pixel within a tile variant. */
const n = (x, y, salt) => hash2(x + salt * 131, y - salt * 57, 0x5eed + salt);

/** Scatter `count` pixels of `color` using variant-stable positions. */
function scatter(buf, salt, count, color, xr = [0, 16], yr = [0, 16]) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(xr[0] + n(i, 0, salt * 7 + 3) * (xr[1] - xr[0]));
    const y = Math.floor(yr[0] + n(0, i, salt * 11 + 5) * (yr[1] - yr[0]));
    buf.set(x, y, color);
  }
}

/** Fill with a two-tone checker-ish dither, the base texture for most ground. */
function dither(buf, salt, a, b, density = 0.3) {
  buf.fill(a);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (n(x, y, salt) < density) buf.set(x, y, b);
    }
  }
}

// ---------------------------------------------------------------------------
// Painters. Each receives a fresh 16x16 buffer, a variant index and a frame.
// ---------------------------------------------------------------------------

function paintGrass(buf, v) {
  // Each variant sits at a slightly different point on the green ramp, so a
  // wide field mottles gently instead of tiling as one flat colour.
  const tone = (v % 4) - 1.5;                       // -1.5 .. 1.5
  const base = mixHex(P.grass, tone < 0 ? P.grassDk : P.grassLt, Math.abs(tone) * 0.22);
  const dk = shade(base, -0.16), lt = shade(base, 0.14), hi = shade(base, 0.3);
  dither(buf, v, rgb(base), rgb(dk), 0.24);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) if (n(x, y, v + 40) < 0.15) buf.set(x, y, rgb(lt));
  }
  // Upright blades catching the light.
  const tufts = 3 + Math.floor(n(v, v, 9) * 4);
  for (let i = 0; i < tufts; i++) {
    const x = 1 + Math.floor(n(i, 3, v + 17) * 14);
    const y = 2 + Math.floor(n(3, i, v + 23) * 12);
    buf.set(x, y, rgb(hi));
    buf.set(x, y + 1, rgb(lt));
    if (n(i, i, v) > 0.55) { buf.set(x + 1, y + 1, rgb(lt)); buf.set(x + 1, y, rgb(hi)); }
    if (n(i, i, v + 3) > 0.75) buf.set(x - 1, y + 1, rgb(dk));
  }
}

function paintMeadow(buf, v) {
  paintGrass(buf, v);
  const cols = [P.flowerW, P.flowerY, P.flowerP, P.flowerB, P.flowerV];
  const count = 2 + Math.floor(n(v, 1, 5) * 3);
  for (let i = 0; i < count; i++) {
    const x = 2 + Math.floor(n(i, 7, v + 61) * 12);
    const y = 2 + Math.floor(n(7, i, v + 67) * 12);
    const c = rgb(cols[Math.floor(n(i, i, v + 71) * cols.length) % cols.length]);
    // Tiny four-petal flower.
    buf.set(x, y, c); buf.set(x - 1, y, c); buf.set(x + 1, y, c);
    buf.set(x, y - 1, c); buf.set(x, y + 1, c);
    buf.set(x, y, rgb(P.flowerY));
    buf.set(x, y + 2, rgb(P.grassDk));
  }
}

function paintForestFloor(buf, v) {
  dither(buf, v, rgb(P.forest), rgb(P.forestDk), 0.3);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) if (n(x, y, v + 88) < 0.1) buf.set(x, y, rgb(P.moss));
  }
  scatter(buf, v + 3, 3, rgb(P.dirtDk));
  scatter(buf, v + 9, 2, rgb(P.forestHi));
}

function paintDirt(buf, v) {
  dither(buf, v, rgb(P.dirt), rgb(P.dirtDk), 0.26);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) if (n(x, y, v + 55) < 0.13) buf.set(x, y, rgb(P.dirtLt));
  }
  scatter(buf, v + 5, 4, rgb(P.soil));
  scatter(buf, v + 12, 2, rgb(P.gravel));
}

function paintMud(buf, v) {
  dither(buf, v, rgb(P.soil), rgb(P.dirtDk), 0.4);
  scatter(buf, v + 2, 5, rgb('#5c3d24'));
}

function paintSand(buf, v) {
  dither(buf, v, rgb(P.sand), rgb(P.sandDk), 0.18);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) if (n(x, y, v + 31) < 0.12) buf.set(x, y, rgb(P.sandLt));
  }
  // Faint ripple lines.
  for (let x = 0; x < TILE; x++) {
    const y = 4 + Math.floor(Math.sin((x + v * 3) * 0.5) * 2 + 2);
    if (n(x, y, v + 44) > 0.55) buf.set(x, y, rgb(P.sandDk));
  }
}

function paintGravel(buf, v) {
  dither(buf, v, rgb(P.gravel), rgb(P.stone), 0.34);
  scatter(buf, v + 6, 6, rgb(P.stoneLt));
  scatter(buf, v + 13, 4, rgb(P.stoneDk));
}

function paintCobble(buf, v) {
  buf.fill(rgb(P.cobbleDk));
  // Offset brick rows of rounded stones.
  const rows = 4, cols = 4;
  for (let ry = 0; ry < rows; ry++) {
    const off = ry % 2 ? 2 : 0;
    for (let rx = -1; rx < cols; rx++) {
      const cx = rx * 4 + off + 2, cy = ry * 4 + 2;
      const s = n(rx + 3, ry + 3, v) ;
      const c = s < 0.3 ? P.cobbleDk : s < 0.72 ? P.cobble : P.cobbleLt;
      buf.ellipse(cx, cy, 1.9, 1.7, rgb(c));
      buf.set(cx, cy - 1, rgb(s > 0.7 ? P.stoneHi : P.cobbleLt));
    }
  }
  scatter(buf, v + 21, 3, rgb(P.grassDk));
}

function paintStone(buf, v) {
  dither(buf, v, rgb(P.stone), rgb(P.stoneDk), 0.28);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) if (n(x, y, v + 77) < 0.12) buf.set(x, y, rgb(P.stoneLt));
  }
  // Cracks.
  const x0 = 2 + Math.floor(n(v, 2, 3) * 12);
  buf.line(x0, 0, x0 + (n(v, 5, 7) > 0.5 ? 3 : -3), 15, rgb(P.stoneDeep));
}

function paintFloorStone(buf, v) {
  buf.fill(rgb(P.stoneLt));
  buf.frame(0, 0, 16, 16, rgb(P.stoneDk));
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
    if (n(x, y, v + 4) < 0.12) buf.set(x, y, rgb(P.stone));
    else if (n(x, y, v + 14) < 0.08) buf.set(x, y, rgb(P.stoneHi));
  }
}

function paintCliff(buf, v) {
  // A chalk face seen straight on. The top four rows are the lit lip of the
  // plateau, the rest falls away into shadow — that vertical ramp is what
  // makes a flat tile read as a drop.
  for (let y = 0; y < TILE; y++) {
    const t = y / (TILE - 1);
    const band = Math.floor(y / 3);
    const jitter = n(band, v, 2);
    let base;
    if (y < 2) base = P.stoneHi;
    else if (y < 4) base = P.chalk;
    else base = mixHex(P.stoneLt, P.stoneDeep, Math.min(1, (t - 0.25) * 1.15 + jitter * 0.18));
    for (let x = 0; x < TILE; x++) {
      let c = base;
      if (y >= 4) {
        if (n(x, y, v + 6) < 0.18) c = shade(base, -0.18);
        else if (n(x, y, v + 16) < 0.12) c = shade(base, 0.16);
      }
      buf.set(x, y, rgb(c));
    }
    // Bedding planes.
    if (y >= 5 && y % 4 === 1) {
      for (let x = 0; x < TILE; x++) if (n(x, y, v + 21) > 0.25) buf.set(x, y, rgb(shade(base, -0.3)));
    }
  }
  // Vertical fissures.
  const fx = 2 + Math.floor(n(v, 3, 5) * 12);
  for (let y = 5; y < TILE; y++) buf.set(fx + (y % 3 === 0 ? 1 : 0), y, rgb(P.stoneDeep));
  // Deep shade where the face meets the ground.
  buf.rectBlend(0, TILE - 3, TILE, 3, rgb('#000000', 90));
  buf.hline(0, 0, TILE, rgb(P.stoneHi));
}

function paintCliffTop(buf, v) {
  // The lip of a plateau: chalky rim with grass sitting on it.
  buf.fill(rgb(P.chalk));
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (n(x, y, v + 8) < 0.2) buf.set(x, y, rgb(P.stoneLt));
    else if (n(x, y, v + 18) < 0.1) buf.set(x, y, rgb(P.stoneHi));
  }
}

// Water is a flat body colour with a few drifting horizontal wave dashes —
// the way 16-bit games did it. Full-tile sine shading reads as diagonal
// corduroy once the tiles repeat, which is exactly what we don't want.
function waveTile(buf, v, frame, body, crest, deep, density) {
  buf.fill(rgb(body));
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (n(x, y, v + 61) < 0.09) buf.set(x, y, rgb(deep));
    }
  }
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const baseY = Math.floor(n(r, v, 7) * TILE);
    const y = (baseY + Math.floor(frame * 0.5)) % TILE;
    const startX = (Math.floor(n(v, r, 11) * TILE) + frame * (r % 2 ? 1 : -1) + TILE * 4) % TILE;
    const len = 3 + Math.floor(n(r, v, 13) * 4);
    if (n(r, frame, v + 17) > density) continue;
    for (let k = 0; k < len; k++) {
      const px = (startX + k) % TILE;
      buf.set(px, y, rgb(crest));
      // A soft shadow under the crest gives the ripple some body.
      buf.set(px, (y + 1) % TILE, rgb(deep));
    }
  }
}

function paintWater(buf, v, frame) {
  waveTile(buf, v, frame, P.water, P.waterHi, P.waterDk, 0.72);
}

function paintWaterDeep(buf, v, frame) {
  waveTile(buf, v, frame, P.waterDk, P.waterLt, P.waterDeep, 0.45);
}

function paintFarm(buf, v) {
  dither(buf, v, rgb(P.soil), rgb('#5a3c22'), 0.3);
  // Furrows.
  for (let x = 2; x < TILE; x += 5) {
    buf.vline(x, 0, 16, rgb(P.dirtDk));
    buf.vline(x + 1, 0, 16, rgb(P.dirtLt));
  }
}

function paintFlowerbed(buf, v) {
  dither(buf, v, rgb(P.soil), rgb(P.dirtDk), 0.3);
  const cols = [P.flowerR, P.flowerY, P.flowerP, P.flowerV, P.flowerW];
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(n(i, 2, v + 3) * 14);
    const y = 1 + Math.floor(n(2, i, v + 9) * 14);
    const c = rgb(cols[Math.floor(n(i, i, v + 13) * cols.length) % cols.length]);
    buf.ellipse(x, y, 1.6, 1.4, c);
    buf.set(x, y + 2, rgb(P.grassDk));
  }
}

function paintHedge(buf, v) {
  dither(buf, v, rgb(P.hedge), rgb(P.forestDk), 0.35);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(n(i, 4, v + 2) * 16);
    const y = Math.floor(n(4, i, v + 6) * 16);
    buf.ellipse(x, y, 2, 1.6, rgb(P.forest));
    buf.set(x, y - 1, rgb(P.forestHi));
  }
  buf.rectBlend(0, 13, 16, 3, rgb('#000000', 45));
}

function paintFloorWood(buf, v) {
  buf.fill(rgb(P.floorWood));
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (n(x, y, v) < 0.14) buf.set(x, y, rgb(P.floorWoodLt));
    else if (n(x, y, v + 20) < 0.1) buf.set(x, y, rgb(P.floorWoodDk));
  }
  // Long boards. Only one seam per tile, staggered by variant, and kept close
  // in tone to the boards so the floor doesn't read as a grid.
  const seamCol = rgb(mixHex(P.floorWood, P.floorWoodDk, 0.55));
  buf.hline(0, (v % 2) * 8, TILE, seamCol);
  // Occasional butt joint between boards.
  if (v % 3 === 0) buf.vline(3 + (v % 4) * 3, (v % 2) * 8, 8, seamCol);
  // A little grain, kept sparse so the floor stays calm under the furniture.
  for (let y = 0; y < TILE; y++) {
    if (n(0, y, v + 12) > 0.86) {
      for (let x = 0; x < TILE; x++) if (n(x, y, v + 14) > 0.55) buf.set(x, y, rgb(mixHex(P.floorWood, P.floorWoodDk, 0.4)));
    }
  }
}

function paintDeck(buf, v) {
  buf.fill(rgb(P.wood));
  for (let x = 0; x < TILE; x += 4) {
    buf.vline(x, 0, 16, rgb(P.woodDk));
    buf.vline(x + 1, 0, 16, rgb(P.woodLt));
  }
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (n(x, y, v) < 0.08) buf.set(x, y, rgb(P.woodDk));
}

function paintBridge(buf, v) {
  paintDeck(buf, v);
  buf.hline(0, 0, 16, rgb(P.woodDeep));
  buf.hline(0, 15, 16, rgb(P.woodDeep));
}

function paintFloorTile(buf, v) {
  buf.fill(rgb(P.floorTile));
  // Chequered 8x8 with a soft grout line.
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const q = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
    let c = q ? P.floorTileDk : P.floorTile;
    if (n(x, y, v) < 0.07) c = q ? P.floorTile : P.floorTileDk;
    buf.set(x, y, rgb(c));
  }
  buf.hline(0, 0, 16, rgb('#a89f8e'));
  buf.vline(0, 0, 16, rgb('#a89f8e'));
  buf.hline(0, 8, 16, rgb('#b5ac9b'));
  buf.vline(8, 0, 16, rgb('#b5ac9b'));
}

function paintRug(buf, v, _f, colors) {
  const [base, lt, dk] = colors || [P.rug, P.rugLt, P.rugDk];
  buf.fill(rgb(base));
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (n(x, y, v) < 0.1) buf.set(x, y, rgb(lt));
  buf.frame(0, 0, 16, 16, rgb(dk));
  buf.frame(2, 2, 12, 12, rgb(lt));
}

function paintCarpetGreen(buf, v) { paintRug(buf, v, 0, ['#4f8a5c', '#6ea87a', '#356043']); }

function paintWallIn(buf, v) {
  // The wall you look at face-on: plaster above, panelling below, and a hard
  // dark line where it meets the floor so the room has a definite edge.
  buf.fill(rgb(P.wallIn));
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < TILE; x++) {
      if (n(x, y, v) < 0.1) buf.set(x, y, rgb(P.wallInDk));
      else if (n(x, y, v + 25) < 0.06) buf.set(x, y, rgb('#f6ecd8'));
    }
  }
  // Picture rail.
  buf.hline(0, 9, TILE, rgb(P.plasterSh));
  buf.hline(0, 10, TILE, rgb('#f2e6cc'));
  // Panelling.
  buf.rect(0, 11, TILE, 4, rgb(P.wainscot));
  for (let x = 1; x < TILE; x += 5) buf.vline(x, 11, 4, rgb(shade(P.wainscot, -0.22)));
  buf.hline(0, 11, TILE, rgb(shade(P.wainscot, 0.24)));
  // Skirting and floor contact shadow.
  buf.hline(0, 15, TILE, rgb('#3a2a1c'));
  buf.rectBlend(0, 13, TILE, 2, rgb('#000000', 55));
}

function paintWallTop(buf, v) {
  // The thickness of the wall, seen from above: a cooler, darker band that
  // clearly reads as "not floor".
  const base = '#8d8069';
  buf.fill(rgb(base));
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (n(x, y, v) < 0.12) buf.set(x, y, rgb(shade(base, -0.14)));
    else if (n(x, y, v + 30) < 0.08) buf.set(x, y, rgb(shade(base, 0.12)));
  }
  buf.rectBlend(0, 0, TILE, 4, rgb('#000000', 55));
  buf.hline(0, 0, TILE, rgb('#5d5344'));
}

function paintCounter(buf, v) {
  buf.fill(rgb(P.wood));
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (n(x, y, v) < 0.1) buf.set(x, y, rgb(P.woodDk));
  buf.rect(0, 0, 16, 4, rgb(P.woodLt));
  buf.hline(0, 4, 16, rgb(P.woodDeep));
  buf.rectBlend(0, 13, 16, 3, rgb('#000000', 60));
}

function paintVoid(buf) { buf.fill(rgb('#12141c')); }

// ---------------------------------------------------------------------------
// Terrain table
// ---------------------------------------------------------------------------

/**
 * prio  — higher terrains grow their fringe over lower ones.
 * solid — blocks movement.
 * edge  — participates in fringe blending.
 */
export const TERRAIN = {
  [T.VOID]:        { name: 'void', prio: -1, paint: paintVoid, solid: true, edge: false, variants: 1 },
  [T.WATER_DEEP]:  { name: 'deep water', prio: 0, paint: paintWaterDeep, solid: true, edge: false, variants: 2, anim: 6, liquid: true },
  [T.WATER]:       { name: 'water', prio: 1, paint: paintWater, solid: true, edge: true, variants: 2, anim: 6, liquid: true },
  [T.SAND]:        { name: 'sand', prio: 2, paint: paintSand, solid: false, edge: true, variants: 5 },
  [T.COBBLE]:      { name: 'cobbles', prio: 3, paint: paintCobble, solid: false, edge: true, variants: 4 },
  [T.GRAVEL]:      { name: 'gravel', prio: 3, paint: paintGravel, solid: false, edge: true, variants: 4 },
  [T.MUD]:         { name: 'mud', prio: 4, paint: paintMud, solid: false, edge: true, variants: 3 },
  [T.DIRT]:        { name: 'path', prio: 4, paint: paintDirt, solid: false, edge: true, variants: 5 },
  [T.FARM]:        { name: 'field', prio: 5, paint: paintFarm, solid: false, edge: true, variants: 3 },
  [T.STONE]:       { name: 'rock', prio: 5, paint: paintStone, solid: false, edge: true, variants: 4 },
  [T.GRASS]:       { name: 'grass', prio: 6, paint: paintGrass, solid: false, edge: true, variants: 6 },
  [T.MEADOW]:      { name: 'meadow', prio: 6, paint: paintMeadow, solid: false, edge: true, variants: 6 },
  [T.FOREST_FLOOR]:{ name: 'woods', prio: 7, paint: paintForestFloor, solid: false, edge: true, variants: 5 },
  [T.FLOWERBED]:   { name: 'flowerbed', prio: 8, paint: paintFlowerbed, solid: false, edge: true, variants: 4 },
  [T.CLIFF_TOP]:   { name: 'clifftop', prio: 8, paint: paintCliffTop, solid: false, edge: true, variants: 3 },
  [T.CLIFF]:       { name: 'cliff', prio: 9, paint: paintCliff, solid: true, edge: false, variants: 4 },
  [T.HEDGE]:       { name: 'hedge', prio: 9, paint: paintHedge, solid: true, edge: false, variants: 4 },
  [T.FLOOR_WOOD]:  { name: 'floor', prio: 10, paint: paintFloorWood, solid: false, edge: false, variants: 4 },
  [T.FLOOR_TILE]:  { name: 'tiles', prio: 10, paint: paintFloorTile, solid: false, edge: false, variants: 3 },
  [T.FLOOR_STONE]: { name: 'flagstones', prio: 10, paint: paintFloorStone, solid: false, edge: false, variants: 4 },
  [T.RUG]:         { name: 'rug', prio: 11, paint: paintRug, solid: false, edge: true, variants: 2 },
  [T.CARPET_GREEN]:{ name: 'carpet', prio: 11, paint: paintCarpetGreen, solid: false, edge: true, variants: 2 },
  [T.DECK]:        { name: 'decking', prio: 10, paint: paintDeck, solid: false, edge: true, variants: 3 },
  [T.BRIDGE]:      { name: 'bridge', prio: 10, paint: paintBridge, solid: false, edge: true, variants: 2 },
  [T.WALL_IN]:     { name: 'wall', prio: 12, paint: paintWallIn, solid: true, edge: false, variants: 3 },
  [T.WALL_TOP]:    { name: 'wall', prio: 12, paint: paintWallTop, solid: true, edge: false, variants: 3 },
  [T.COUNTER]:     { name: 'counter', prio: 12, paint: paintCounter, solid: true, edge: false, variants: 2 },
};

export const isSolidTerrain = (id) => !!(TERRAIN[id] && TERRAIN[id].solid);
export const isLiquid = (id) => !!(TERRAIN[id] && TERRAIN[id].liquid);
export const terrainName = (id) => (TERRAIN[id] ? TERRAIN[id].name : '?');

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

// Edge directions, in draw order. Diagonals only matter when both cardinals
// on that corner are absent, so they're drawn first and overpainted.
export const EDGE_DIRS = ['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w'];

/**
 * Carve an irregular fringe out of a full tile. Returns a canvas holding just
 * the band of pixels that should spill onto a neighbouring tile.
 */
function carveEdge(full, dir, salt) {
  const out = new PixBuf(TILE, TILE);
  const depthAt = (i) => 4 + Math.floor(n(i, dir.length, salt) * 3);

  const copy = (x, y) => {
    const p = full.data[y * TILE + x];
    if (p >>> 24) out.set(x, y, p);
  };

  if (dir === 'n' || dir === 's') {
    for (let x = 0; x < TILE; x++) {
      const d = depthAt(x);
      for (let k = 0; k < d; k++) copy(x, dir === 'n' ? k : TILE - 1 - k);
      // Soft dithered tail so the border doesn't read as a straight cut.
      for (let k = d; k < d + 3; k++) {
        if (n(x, k, salt + 3) < 0.45) copy(x, dir === 'n' ? k : TILE - 1 - k);
      }
    }
  } else if (dir === 'e' || dir === 'w') {
    for (let y = 0; y < TILE; y++) {
      const d = depthAt(y);
      for (let k = 0; k < d; k++) copy(dir === 'w' ? k : TILE - 1 - k, y);
      for (let k = d; k < d + 3; k++) {
        if (n(k, y, salt + 5) < 0.45) copy(dir === 'w' ? k : TILE - 1 - k, y);
      }
    }
  } else {
    // Diagonal: a rounded blob tucked into the corner.
    const ox = dir[1] === 'w' ? 0 : TILE - 1;
    const oy = dir[0] === 'n' ? 0 : TILE - 1;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const dx = Math.abs(x - ox), dy = Math.abs(y - oy);
        const r = 4.5 + n(x, y, salt + 7) * 1.6;
        if (dx * dx + dy * dy <= r * r) copy(x, y);
      }
    }
  }
  return out.toCanvas();
}

/**
 * The baked tile atlas. `base[id][variant][frame]` and `edges[id][dir]`.
 * Built once at startup; a few hundred tiny canvases is cheap.
 */
export class Tileset {
  constructor() {
    this.base = {};
    this.edges = {};
    this.build();
  }

  build() {
    for (const key of Object.keys(TERRAIN)) {
      const id = Number(key);
      const def = TERRAIN[id];
      const frames = def.anim || 1;
      const variants = def.variants || 1;
      const list = [];
      let firstBuf = null;
      for (let v = 0; v < variants; v++) {
        const fl = [];
        for (let f = 0; f < frames; f++) {
          const buf = new PixBuf(TILE, TILE);
          def.paint(buf, v, f);
          if (!firstBuf) firstBuf = buf;
          fl.push(buf.toCanvas());
        }
        list.push(fl);
      }
      this.base[id] = list;

      if (def.edge) {
        const e = {};
        // Rebuild a clean copy for carving (frame 0, variant 0).
        const src = new PixBuf(TILE, TILE);
        def.paint(src, 0, 0);
        for (const d of EDGE_DIRS) e[d] = carveEdge(src, d, id);
        this.edges[id] = e;
      }
    }
  }

  /** Pick a stable variant for a world position so neighbours differ. */
  variantAt(id, x, y) {
    const list = this.base[id];
    if (!list) return 0;
    return Math.floor(hash2(x, y, id * 7919) * list.length) % list.length;
  }

  tile(id, x, y, frame = 0) {
    const list = this.base[id] || this.base[T.VOID];
    const v = list[Math.floor(hash2(x, y, id * 7919) * list.length) % list.length];
    return v[frame % v.length];
  }

  edge(id, dir) {
    const e = this.edges[id];
    return e ? e[dir] : null;
  }

  hasEdge(id) { return !!this.edges[id]; }
}

export const prio = (id) => (TERRAIN[id] ? TERRAIN[id].prio : -1);
