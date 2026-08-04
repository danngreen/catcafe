// World objects: trees, rocks, fences, buildings and every stick of cafe
// furniture. Each entry declares a tile footprint (what you bump into) and a
// painter that draws a sprite which may stand much taller than that footprint,
// so tree canopies and roofs rise above the player.

import { PixBuf, SpriteCache, shade } from '../engine/pixel.js';
import { P } from './palette.js';
import { hash2, clamp } from '../engine/util.js';
import { TILE } from './tiles.js';

const rgb = (hex, a = 255) => PixBuf.rgba(hex, a);
const n = (x, y, s) => hash2(x * 37 + s * 101, y * 53 - s * 17, 0x0b7e);

function outline(buf, color = '#2b2333') {
  const c = rgb(color);
  const src = new Uint32Array(buf.data);
  const at = (x, y) => (x < 0 || y < 0 || x >= buf.w || y >= buf.h ? 0 : src[y * buf.w + x]);
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (at(x, y) >>> 24) continue;
      if ((at(x - 1, y) >>> 24) || (at(x + 1, y) >>> 24) || (at(x, y - 1) >>> 24) || (at(x, y + 1) >>> 24)) buf.set(x, y, c);
    }
  }
}

function groundShadow(buf, cx, cy, rx, ry) {
  buf.ellipseBlend(cx, cy, rx, ry, rgb('#000000', 62));
}

// ---------------------------------------------------------------------------
// Foliage
// ---------------------------------------------------------------------------

/** Layered blob canopy with a lit top-left and a dark underside. */
function canopy(buf, cx, cy, rx, ry, base, v, opts = {}) {
  const dk = shade(base, -0.3), lt = shade(base, 0.16), hi = shade(base, 0.33);
  const lobes = opts.lobes ?? 5;
  buf.ellipse(cx, cy, rx, ry, rgb(dk));
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + n(i, v, 3) * 0.7;
    const d = 0.45 + n(i, v, 5) * 0.3;
    buf.ellipse(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, rx * 0.55, ry * 0.55, rgb(base));
  }
  buf.ellipse(cx, cy - ry * 0.18, rx * 0.78, ry * 0.7, rgb(base));
  buf.ellipse(cx - rx * 0.28, cy - ry * 0.4, rx * 0.5, ry * 0.42, rgb(lt));
  buf.ellipse(cx - rx * 0.36, cy - ry * 0.52, rx * 0.26, ry * 0.22, rgb(hi));
  // Speckle so the mass doesn't look like flat vector shapes.
  for (let i = 0; i < 26; i++) {
    const a = n(i, v, 11) * Math.PI * 2, d = Math.sqrt(n(i, v, 13));
    const px = Math.round(cx + Math.cos(a) * rx * d), py = Math.round(cy + Math.sin(a) * ry * d);
    if (buf.get(px, py) >>> 24) buf.set(px, py, rgb(n(i, v, 17) > 0.5 ? lt : dk));
  }
}

function trunk(buf, cx, top, bottom, w, col) {
  const dk = shade(col, -0.3), lt = shade(col, 0.18);
  buf.rect(Math.round(cx - w / 2), top, w, bottom - top, rgb(col));
  buf.vline(Math.round(cx - w / 2), top, bottom - top, rgb(dk));
  buf.vline(Math.round(cx + w / 2 - 1), top, bottom - top, rgb(dk));
  buf.vline(Math.round(cx - w / 2 + 1), top, bottom - top, rgb(lt));
  // Roots flaring at the base.
  buf.hline(Math.round(cx - w / 2 - 1), bottom - 2, w + 2, rgb(dk));
  buf.hline(Math.round(cx - w / 2 - 2), bottom - 1, w + 4, rgb(dk));
}

function paintOak(buf, v) {
  const green = [P.forest, '#3f8a3c', '#4a9440', '#2f6f31'][v % 4];
  groundShadow(buf, buf.w / 2, buf.h - 3, 11, 4);
  trunk(buf, buf.w / 2, 24, buf.h - 2, 7, P.wood);
  canopy(buf, buf.w / 2, 20, 17, 15, green, v, { lobes: 6 });
  outline(buf);
}

function paintPine(buf, v) {
  const green = ['#2f6b3a', '#28603a', '#356f3e'][v % 3];
  groundShadow(buf, buf.w / 2, buf.h - 3, 9, 3.4);
  trunk(buf, buf.w / 2, 34, buf.h - 2, 6, P.woodDk);
  // Stacked triangular tiers.
  const cx = buf.w / 2;
  for (let t = 0; t < 4; t++) {
    const yTop = 4 + t * 10;
    const wBase = 8 + t * 5;
    for (let i = 0; i < 13; i++) {
      const w = Math.round((wBase * i) / 12) + 2;
      const y = yTop + i;
      const c = i < 3 ? shade(green, 0.2) : i > 9 ? shade(green, -0.25) : green;
      buf.hline(Math.round(cx - w), y, w * 2, rgb(c));
    }
  }
  for (let i = 0; i < 30; i++) {
    const px = Math.round(cx + (n(i, v, 3) - 0.5) * 22), py = Math.round(6 + n(i, v, 7) * 44);
    if (buf.get(px, py) >>> 24) buf.set(px, py, rgb(n(i, v, 9) > 0.5 ? shade(green, 0.25) : shade(green, -0.3)));
  }
  outline(buf);
}

function paintBirch(buf, v) {
  const green = ['#6aad4a', '#79b954', '#5fa244'][v % 3];
  groundShadow(buf, buf.w / 2, buf.h - 3, 8, 3);
  const cx = buf.w / 2;
  buf.rect(cx - 2, 22, 5, buf.h - 24, rgb('#e8e4d6'));
  buf.vline(cx - 2, 22, buf.h - 24, rgb('#c4bfad'));
  for (let i = 0; i < 6; i++) {
    const y = 25 + i * 5 + Math.floor(n(i, v, 3) * 3);
    buf.hline(cx - 2, y, 2 + Math.floor(n(i, v, 5) * 3), rgb('#4a4a48'));
  }
  canopy(buf, cx, 17, 13, 13, green, v, { lobes: 5 });
  outline(buf);
}

function paintApple(buf, v) {
  const green = '#4e9c40';
  groundShadow(buf, buf.w / 2, buf.h - 3, 10, 3.6);
  trunk(buf, buf.w / 2, 24, buf.h - 2, 6, P.wood);
  canopy(buf, buf.w / 2, 19, 15, 14, green, v, { lobes: 6 });
  // Fruit peeking out of the leaves.
  for (let i = 0; i < 5; i++) {
    const a = n(i, v, 21) * Math.PI * 2, d = 0.4 + n(i, v, 23) * 0.5;
    const px = Math.round(buf.w / 2 + Math.cos(a) * 15 * d), py = Math.round(19 + Math.sin(a) * 14 * d);
    buf.ellipse(px, py, 2, 2, rgb(P.flowerR));
    buf.set(px - 1, py - 1, rgb('#ff9a8f'));
  }
  outline(buf);
}

function paintWillow(buf, v) {
  const green = '#8fbe58';
  groundShadow(buf, buf.w / 2, buf.h - 3, 12, 4);
  trunk(buf, buf.w / 2, 26, buf.h - 2, 8, P.woodDk);
  canopy(buf, buf.w / 2, 18, 18, 12, green, v, { lobes: 6 });
  // Drooping fronds.
  for (let i = 0; i < 14; i++) {
    const x = Math.round(buf.w / 2 + (n(i, v, 5) - 0.5) * 34);
    const len = 6 + Math.floor(n(i, v, 9) * 14);
    for (let k = 0; k < len; k++) {
      buf.set(x + (k > len * 0.6 ? 1 : 0), 26 + k, rgb(k % 3 === 0 ? shade(green, -0.2) : green));
    }
  }
  outline(buf);
}

function paintBush(buf, v, berries) {
  const green = ['#3f8a3c', '#478f42', '#37793a'][v % 3];
  groundShadow(buf, buf.w / 2, buf.h - 2, 8, 3);
  canopy(buf, buf.w / 2, buf.h - 9, 9, 7.5, green, v, { lobes: 4 });
  if (berries) {
    for (let i = 0; i < 6; i++) {
      const px = Math.round(buf.w / 2 + (n(i, v, 3) - 0.5) * 14);
      const py = Math.round(buf.h - 12 + n(i, v, 7) * 9);
      if (buf.get(px, py) >>> 24) { buf.set(px, py, rgb(P.berry)); buf.set(px, py - 1, rgb('#f07a8f')); }
    }
  }
  outline(buf);
}

function paintStump(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 7, 2.6);
  buf.ellipse(buf.w / 2, buf.h - 8, 7, 5, rgb(P.woodDk));
  buf.rect(buf.w / 2 - 7, buf.h - 8, 14, 6, rgb(P.woodDk));
  buf.ellipse(buf.w / 2, buf.h - 9, 7, 4.4, rgb(P.wood));
  buf.ellipse(buf.w / 2, buf.h - 9, 4.4, 2.8, rgb(P.woodLt));
  buf.ellipse(buf.w / 2, buf.h - 9, 1.8, 1.2, rgb(P.wood));
  outline(buf);
}

function paintReeds(buf, v) {
  const green = '#5c9c4a';
  for (let i = 0; i < 7; i++) {
    const x = 3 + i * 2 + Math.floor(n(i, v, 3) * 2);
    const h = 8 + Math.floor(n(i, v, 5) * 9);
    buf.vline(x, buf.h - 2 - h, h, rgb(i % 2 ? green : shade(green, -0.2)));
    if (n(i, v, 7) > 0.55) {
      buf.rect(x - 1, buf.h - 4 - h, 3, 4, rgb(P.woodDk)); // cattail head
    }
  }
  outline(buf);
}

function paintMushroom(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 4, 1.8);
  const cap = [P.flowerR, '#e0894a', '#cf7fbd'][v % 3];
  buf.rect(buf.w / 2 - 1, buf.h - 6, 3, 5, rgb(P.cream));
  buf.ellipse(buf.w / 2, buf.h - 7, 5, 3.4, rgb(cap));
  buf.ellipse(buf.w / 2 - 1, buf.h - 8, 2, 1.2, rgb(shade(cap, 0.3)));
  buf.set(buf.w / 2 + 2, buf.h - 7, rgb('#ffffff'));
  buf.set(buf.w / 2 - 2, buf.h - 6, rgb('#ffffff'));
  outline(buf);
}

// ---------------------------------------------------------------------------
// Rock & landscape furniture
// ---------------------------------------------------------------------------

function paintRock(buf, v, big) {
  groundShadow(buf, buf.w / 2, buf.h - 2, big ? 11 : 6, big ? 4 : 2.4);
  const cx = buf.w / 2, cy = buf.h - (big ? 12 : 7);
  const rx = big ? 12 : 6.5, ry = big ? 9 : 5;
  buf.ellipse(cx, cy, rx, ry, rgb(P.stoneDk));
  buf.ellipse(cx, cy - 1, rx * 0.9, ry * 0.85, rgb(P.stone));
  buf.ellipse(cx - rx * 0.25, cy - ry * 0.4, rx * 0.5, ry * 0.42, rgb(P.stoneLt));
  buf.ellipse(cx - rx * 0.3, cy - ry * 0.5, rx * 0.22, ry * 0.2, rgb(P.stoneHi));
  for (let i = 0; i < 10; i++) {
    const px = Math.round(cx + (n(i, v, 3) - 0.5) * rx * 1.6);
    const py = Math.round(cy + (n(i, v, 5) - 0.5) * ry * 1.6);
    if (buf.get(px, py) >>> 24) buf.set(px, py, rgb(n(i, v, 7) > 0.5 ? P.stoneLt : P.stoneDeep));
  }
  if (big) for (let i = 0; i < 4; i++) {
    const px = Math.round(cx + (n(i, v, 9) - 0.5) * rx);
    buf.ellipse(px, cy - ry + 1, 2.4, 1.4, rgb(P.moss));
  }
  outline(buf);
}

function paintFence(buf, v, vertical) {
  const w = P.wood, d = P.woodDk;
  if (vertical) {
    buf.rect(buf.w / 2 - 1, 0, 3, buf.h - 2, rgb(w));
    buf.vline(buf.w / 2 - 1, 0, buf.h - 2, rgb(d));
    for (let y = 3; y < buf.h - 4; y += 7) {
      buf.rect(buf.w / 2 - 4, y, 9, 2, rgb(shade(w, 0.1)));
      buf.hline(buf.w / 2 - 4, y + 2, 9, rgb(d));
    }
  } else {
    for (let x = 1; x < buf.w; x += 8) {
      buf.rect(x, 2, 3, buf.h - 4, rgb(w));
      buf.vline(x, 2, buf.h - 4, rgb(d));
      buf.rect(x, 1, 3, 1, rgb(shade(w, 0.25)));
    }
    buf.rect(0, 5, buf.w, 2, rgb(shade(w, 0.12)));
    buf.hline(0, 7, buf.w, rgb(d));
    buf.rect(0, 11, buf.w, 2, rgb(shade(w, 0.12)));
    buf.hline(0, 13, buf.w, rgb(d));
  }
  outline(buf);
}

function paintSignpost(buf, v, label) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 5, 2);
  buf.rect(buf.w / 2 - 1, 10, 3, buf.h - 12, rgb(P.woodDk));
  buf.rect(2, 2, buf.w - 4, 10, rgb(P.wood));
  buf.frame(2, 2, buf.w - 4, 10, rgb(P.woodDeep));
  buf.rect(3, 3, buf.w - 6, 3, rgb(P.woodLt));
  // Illegible little "writing" — real text is drawn by the UI when you read it.
  for (let i = 0; i < 3; i++) buf.hline(5, 6 + i * 2, buf.w - 12 - i * 2, rgb(P.woodDeep));
  outline(buf);
}

function paintLamppost(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 4, 1.8);
  const cx = buf.w / 2;
  buf.rect(cx - 1, 10, 3, buf.h - 12, rgb(P.slateDk));
  buf.vline(cx - 1, 10, buf.h - 12, rgb(P.slate));
  buf.rect(cx - 3, buf.h - 3, 7, 2, rgb(P.slateDk));
  // Lantern box.
  buf.rect(cx - 4, 2, 9, 9, rgb(P.slateDk));
  buf.rect(cx - 3, 3, 7, 7, rgb(P.glass));
  buf.rect(cx - 3, 3, 7, 3, rgb(P.glassLt));
  buf.rect(cx - 5, 0, 11, 3, rgb(P.slate));
  outline(buf);
}

function paintWell(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 3, 14, 5);
  const cx = buf.w / 2, base = buf.h - 6;
  buf.ellipse(cx, base, 13, 6, rgb(P.stoneDk));
  buf.rect(cx - 13, base - 8, 26, 9, rgb(P.stone));
  for (let y = 0; y < 9; y += 3) for (let x = -12; x < 12; x += 5) {
    buf.rect(cx + x + (y % 6 ? 2 : 0), base - 8 + y, 4, 2, rgb(n(x, y, v) > 0.5 ? P.stoneLt : P.stone));
  }
  buf.ellipse(cx, base - 8, 12, 5, rgb(P.stoneLt));
  buf.ellipse(cx, base - 8, 9, 3.4, rgb('#1d3550'));
  buf.ellipse(cx, base - 7, 8, 2.6, rgb(P.waterDk));
  // Posts and roof.
  buf.rect(cx - 12, base - 30, 3, 23, rgb(P.woodDk));
  buf.rect(cx + 9, base - 30, 3, 23, rgb(P.woodDk));
  for (let i = 0; i < 9; i++) {
    buf.hline(cx - 16 + i, base - 32 + i, (16 - i) * 2, rgb(i < 3 ? P.terracottaLt : P.terracotta));
  }
  outline(buf);
}

function paintBench(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 13, 3);
  buf.rect(2, 6, buf.w - 4, 4, rgb(P.wood));
  buf.hline(2, 6, buf.w - 4, rgb(P.woodLt));
  buf.hline(2, 9, buf.w - 4, rgb(P.woodDk));
  buf.rect(2, 0, buf.w - 4, 3, rgb(P.wood));
  buf.rect(3, 10, 3, buf.h - 11, rgb(P.woodDk));
  buf.rect(buf.w - 6, 10, 3, buf.h - 11, rgb(P.woodDk));
  outline(buf);
}

function paintBarrel(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 6, 2.4);
  buf.rect(2, 3, buf.w - 4, buf.h - 5, rgb(P.wood));
  buf.ellipse(buf.w / 2, 3, buf.w / 2 - 2, 2.6, rgb(P.woodLt));
  buf.hline(1, 6, buf.w - 2, rgb(P.metalDk));
  buf.hline(1, buf.h - 6, buf.w - 2, rgb(P.metalDk));
  buf.vline(4, 3, buf.h - 5, rgb(P.woodDk));
  buf.vline(buf.w - 5, 3, buf.h - 5, rgb(P.woodDk));
  outline(buf);
}

function paintCrate(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 7, 2.4);
  buf.rect(1, 2, buf.w - 2, buf.h - 4, rgb(P.wood));
  buf.frame(1, 2, buf.w - 2, buf.h - 4, rgb(P.woodDeep));
  buf.line(2, 3, buf.w - 3, buf.h - 4, rgb(P.woodDk));
  buf.line(buf.w - 3, 3, 2, buf.h - 4, rgb(P.woodDk));
  outline(buf);
}

function paintHaystack(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 12, 4);
  buf.ellipse(buf.w / 2, buf.h - 9, 13, 9, rgb(P.thatch));
  buf.ellipse(buf.w / 2 - 2, buf.h - 12, 8, 5, rgb(P.thatchLt));
  for (let i = 0; i < 40; i++) {
    const px = Math.round(buf.w / 2 + (n(i, v, 3) - 0.5) * 26);
    const py = Math.round(buf.h - 9 + (n(i, v, 5) - 0.5) * 17);
    if (buf.get(px, py) >>> 24) buf.set(px, py, rgb(n(i, v, 9) > 0.5 ? P.thatchLt : P.thatchDk));
  }
  outline(buf);
}

function paintMailbox(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 4, 1.8);
  const cx = buf.w / 2;
  buf.rect(cx - 1, 12, 3, buf.h - 13, rgb(P.woodDk));
  buf.rect(cx - 6, 3, 13, 9, rgb('#5b8fd6'));
  buf.ellipse(cx, 3, 6.5, 3.4, rgb('#5b8fd6'));
  buf.rect(cx - 6, 3, 13, 2, rgb('#7fadea'));
  buf.rect(cx + 4, 5, 2, 5, rgb(P.flowerR));  // little flag
  buf.rect(cx - 4, 7, 7, 3, rgb('#3f6ba8'));
  outline(buf);
}

function paintPlanter(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 7, 2.4);
  buf.rect(2, buf.h - 8, buf.w - 4, 7, rgb(P.terracotta));
  buf.rect(1, buf.h - 9, buf.w - 2, 2, rgb(P.terracottaLt));
  buf.rect(2, buf.h - 3, buf.w - 4, 2, rgb(P.terracottaDk));
  canopy(buf, buf.w / 2, buf.h - 13, 7, 5.5, '#4e9c40', v, { lobes: 4 });
  const cols = [P.flowerR, P.flowerY, P.flowerP, P.flowerW];
  for (let i = 0; i < 4; i++) {
    const px = Math.round(buf.w / 2 + (n(i, v, 3) - 0.5) * 12);
    const py = Math.round(buf.h - 15 + n(i, v, 5) * 5);
    buf.ellipse(px, py, 1.6, 1.4, rgb(cols[i % 4]));
  }
  outline(buf);
}

/** Flat stone steps, drawn as a ground decal where a path climbs a terrace. */
function paintStairs(buf, v) {
  const steps = 4;
  const sh = Math.floor(buf.h / steps);
  for (let s = 0; s < steps; s++) {
    const y = s * sh;
    const inset = s;
    buf.rect(inset, y, buf.w - inset * 2, sh, rgb(s % 2 ? P.stoneLt : P.stone));
    buf.hline(inset, y, buf.w - inset * 2, rgb(P.stoneHi));
    buf.hline(inset, y + sh - 1, buf.w - inset * 2, rgb(P.stoneDeep));
    for (let x = inset; x < buf.w - inset; x++) {
      if (n(x, y, v + s) < 0.16) buf.set(x, y + 1 + (s % 2), rgb(P.stoneDk));
    }
  }
  buf.vline(0, 0, buf.h, rgb(P.stoneDk));
  buf.vline(buf.w - 1, 0, buf.h, rgb(P.stoneDk));
}

function paintDock(buf, v) {
  buf.rect(0, 0, buf.w, buf.h - 4, rgb(P.wood));
  for (let x = 0; x < buf.w; x += 5) buf.vline(x, 0, buf.h - 4, rgb(P.woodDk));
  buf.hline(0, 0, buf.w, rgb(P.woodLt));
  buf.rect(1, buf.h - 4, 3, 4, rgb(P.woodDeep));
  buf.rect(buf.w - 4, buf.h - 4, 3, 4, rgb(P.woodDeep));
  outline(buf);
}

function paintPerch(buf, v) {
  // Taxi-bird landing post: a tall pole with a crossbar and a little flag.
  groundShadow(buf, buf.w / 2, buf.h - 2, 6, 2.4);
  const cx = buf.w / 2;
  buf.rect(cx - 2, 6, 4, buf.h - 8, rgb(P.woodDk));
  buf.rect(cx - 2, 6, 2, buf.h - 8, rgb(P.wood));
  buf.rect(cx - 9, 8, 19, 3, rgb(P.wood));
  buf.rect(cx - 9, 11, 19, 1, rgb(P.woodDeep));
  buf.rect(cx + 2, 0, 9, 7, rgb('#e0894a'));
  buf.rect(cx + 2, 0, 9, 2, rgb('#f0a468'));
  buf.rect(cx - 6, buf.h - 4, 13, 3, rgb(P.stone));
  outline(buf);
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/**
 * Draw a cottage/shopfront. Buildings are the largest sprites in the game, so
 * they get real attention: stone footing, plaster or timbered walls, an
 * overhanging tiled or thatched roof, a chimney, glazing bars in the windows.
 */
export function paintBuilding(buf, opts) {
  const {
    tw = 4, wallH = 26, roofH = 22, wall = P.plaster, roof = P.terracotta,
    roofStyle = 'tile', timbered = false, doorX = null, windows = 2, v = 0, lit = false,
    sign = null, awning = null, chimney = true, storeys = 1,
  } = opts;

  const W = tw * TILE;
  const ox = Math.round((buf.w - W) / 2);
  const wallTop = buf.h - 4 - wallH;
  const roofTop = wallTop - roofH;
  const wallDk = shade(wall, -0.18), wallLt = shade(wall, 0.14);
  const roofDk = shade(roof, -0.26), roofLt = shade(roof, 0.18);

  groundShadow(buf, buf.w / 2, buf.h - 3, W / 2 + 2, 5);

  // --- walls ---
  buf.rect(ox, wallTop, W, wallH, rgb(wall));
  buf.rect(ox, wallTop, W, 2, rgb(wallLt));
  for (let y = wallTop; y < wallTop + wallH; y++) {
    for (let x = ox; x < ox + W; x++) if (n(x, y, v) < 0.07) buf.set(x, y, rgb(wallDk));
  }
  // Stone footing.
  buf.rect(ox, buf.h - 8, W, 4, rgb(P.stone));
  for (let x = ox; x < ox + W; x += 5) buf.rect(x + (v % 2), buf.h - 8, 4, 2, rgb(P.stoneLt));
  buf.hline(ox, buf.h - 4, W, rgb(P.stoneDk));

  if (timbered) {
    const t = rgb(P.timber);
    buf.rect(ox, wallTop, 3, wallH, t);
    buf.rect(ox + W - 3, wallTop, 3, wallH, t);
    buf.rect(ox, wallTop, W, 3, t);
    buf.rect(ox, wallTop + Math.floor(wallH / 2), W, 2, t);
    for (let i = 1; i < tw; i++) buf.rect(ox + i * TILE, wallTop, 2, wallH, t);
    // Diagonal braces in the upper register.
    for (let i = 0; i < tw; i++) {
      const bx = ox + i * TILE + 2;
      buf.line(bx, wallTop + Math.floor(wallH / 2), bx + TILE - 5, wallTop + 3, t);
    }
  }

  // --- door ---
  const dW = 12, dH = 18;
  const dX = doorX === null ? Math.round(buf.w / 2 - dW / 2) : ox + doorX * TILE + 2;
  const dY = buf.h - 8 - dH + 2;
  buf.rect(dX - 1, dY - 1, dW + 2, dH + 1, rgb(P.woodDeep));
  buf.rect(dX, dY, dW, dH, rgb(P.wood));
  buf.rect(dX + 1, dY + 1, dW - 2, 2, rgb(P.woodLt));
  buf.vline(dX + dW / 2, dY, dH, rgb(P.woodDk));
  buf.rect(dX + dW - 4, dY + dH / 2, 2, 2, rgb(P.gold));
  // Arched top on the doorway.
  buf.ellipse(dX + dW / 2, dY, dW / 2 + 1, 3, rgb(P.woodDeep));
  buf.ellipse(dX + dW / 2, dY + 1, dW / 2 - 1, 2, rgb(P.wood));

  // --- windows ---
  // A two-storey building gets a row per floor, with a string course between.
  const upper = storeys > 1;
  const groundWinY = wallTop + wallH - 30;
  const winRows = upper ? [wallTop + 6, groundWinY] : [wallTop + 6];
  if (upper) {
    const band = wallTop + Math.round(wallH * 0.46);
    buf.rect(ox, band, W, 3, rgb(shade(wall, -0.22)));
    buf.hline(ox, band, W, rgb(shade(wall, 0.2)));
  }
  const slots = [];
  for (let i = 0; i < tw; i++) {
    const wx = ox + i * TILE + 3;
    slots.push(wx);
  }
  winRows.forEach((winY, row) => {
    // Upstairs windows can sit over the door; ground-floor ones cannot.
    const usable = row === 0 && upper ? slots : slots.filter((wx) => wx + 10 < dX - 3 || wx > dX + dW + 3);
    const count = Math.min(row === 0 && upper ? tw : windows, usable.length);
    for (let i = 0; i < count; i++) {
      const wx = usable[Math.floor((i * usable.length) / Math.max(1, count))];
      buf.rect(wx - 1, winY - 1, 12, 12, rgb(P.woodDk));
      if (lit) {
        // Somebody is in and waiting. Warm all the way through, with the light
        // spilling a little past the frame so it reads in daylight too.
        buf.rect(wx - 3, winY - 3, 16, 16, rgb('#ffe9a8', 44));
        buf.rect(wx - 2, winY - 2, 14, 14, rgb('#ffdf90', 70));
        buf.rect(wx, winY, 10, 10, rgb('#ffd97a'));
        buf.rect(wx, winY, 10, 4, rgb('#fff0b8'));
        buf.vline(wx + 5, winY, 10, rgb('#a8823c'));
        buf.hline(wx, winY + 5, 10, rgb('#a8823c'));
      } else {
        buf.rect(wx, winY, 10, 10, rgb(P.glass));
        buf.rect(wx, winY, 10, 4, rgb(P.glassLt));
        buf.vline(wx + 5, winY, 10, rgb(P.woodDk));
        buf.hline(wx, winY + 5, 10, rgb(P.woodDk));
      }
      // Window box with flowers.
      if (n(i + row * 5, v, 3) > 0.4) {
        buf.rect(wx - 2, winY + 10, 14, 3, rgb(P.woodDk));
        for (let k = 0; k < 4; k++) buf.set(wx + k * 3, winY + 9, rgb([P.flowerR, P.flowerY, P.flowerP, P.flowerW][k % 4]));
      }
    }
  });

  // --- roof ---
  const overhang = 4;
  const rx0 = ox - overhang, rW = W + overhang * 2;
  if (roofStyle === 'gable') {
    // Triangular front gable.
    for (let i = 0; i < roofH; i++) {
      const t = i / roofH;
      const w = Math.round(rW * t);
      const c = i < 3 ? roofLt : i > roofH - 5 ? roofDk : roof;
      buf.hline(Math.round(buf.w / 2 - w / 2), roofTop + i, w, rgb(c));
    }
    buf.rect(rx0, wallTop - 3, rW, 3, rgb(roofDk));
    for (let i = 0; i < roofH; i += 4) {
      const t = i / roofH, w = Math.round(rW * t);
      buf.hline(Math.round(buf.w / 2 - w / 2), roofTop + i, w, rgb(roofDk));
    }
  } else if (roofStyle === 'thatch') {
    for (let i = 0; i < roofH; i++) {
      const t = i / roofH;
      const w = Math.round(rW * (0.25 + 0.75 * t));
      const c = i < 4 ? P.thatchLt : i > roofH - 6 ? P.thatchDk : P.thatch;
      buf.hline(Math.round(buf.w / 2 - w / 2), roofTop + i, w, rgb(c));
    }
    // Straw strokes.
    for (let i = 0; i < rW * 1.4; i++) {
      const x = Math.round(rx0 + n(i, v, 3) * rW);
      const y = Math.round(roofTop + 3 + n(i, v, 5) * (roofH - 4));
      if (buf.get(x, y) >>> 24) buf.line(x, y, x, y + 2, rgb(n(i, v, 7) > 0.5 ? P.thatchLt : P.thatchDk));
    }
    buf.hline(rx0, wallTop - 1, rW, rgb(P.thatchDk));
  } else {
    // Hipped tile roof: rows of scalloped tiles, widening downwards.
    for (let i = 0; i < roofH; i++) {
      const t = i / roofH;
      const w = Math.round(rW * (0.42 + 0.58 * t));
      const c = i < 3 ? roofLt : roof;
      buf.hline(Math.round(buf.w / 2 - w / 2), roofTop + i, w, rgb(c));
    }
    for (let row = 3; row < roofH; row += 4) {
      const t = row / roofH, w = Math.round(rW * (0.42 + 0.58 * t));
      const x0 = Math.round(buf.w / 2 - w / 2);
      buf.hline(x0, roofTop + row, w, rgb(roofDk));
      for (let x = x0; x < x0 + w; x += 4) {
        buf.set(x, roofTop + row - 1, rgb(roofDk));
        buf.set(x + 1, roofTop + row - 2, rgb(roofLt));
      }
    }
    buf.rect(rx0, wallTop - 3, rW, 3, rgb(roofDk));
    buf.hline(rx0, wallTop - 4, rW, rgb(roofLt));
  }

  if (chimney) {
    // Anchor the stack to the roof surface. Placing it at a fixed offset left
    // it hanging in the sky beside a narrow roof, or floating above a gable.
    const halfAt = (yy) => {
      const t = clamp((yy - roofTop) / roofH, 0, 1);
      if (roofStyle === 'gable') return (rW * t) / 2;
      if (roofStyle === 'thatch') return (rW * (0.25 + 0.75 * t)) / 2;
      return (rW * (0.42 + 0.58 * t)) / 2;
    };
    const cw = 8;
    // Find a row where the roof is wide enough to carry the stack, then bed it
    // a few pixels in so the tiles meet its base.
    let emerge = roofTop + Math.round(roofH * (roofStyle === 'gable' ? 0.42 : 0.2));
    while (halfAt(emerge + 4) < cw + 4 && emerge < roofTop + roofH - 4) emerge += 2;
    const half = halfAt(emerge + 4);
    const side = v % 2 ? 1 : -1;
    const cx = Math.round(buf.w / 2 + side * Math.max(0, half - cw - 2) - cw / 2);
    const top = emerge - 13;
    buf.rect(cx, top, cw, emerge + 5 - top, rgb(P.brick));
    for (let y = top; y < emerge + 5; y += 3) buf.hline(cx, y, cw, rgb(P.brickDk));
    buf.vline(cx, top, emerge + 5 - top, rgb(P.brickDk));
    buf.rect(cx - 1, top - 3, cw + 2, 3, rgb(P.stoneLt));
    buf.hline(cx - 1, top - 3, cw + 2, rgb(P.stoneHi));
  }

  // --- shop sign / awning ---
  if (awning) {
    const aw = W - 6, ax = ox + 3, ay = wallTop + 1;
    for (let i = 0; i < 7; i++) buf.hline(ax - i, ay + i, aw + i * 2, rgb(i % 4 < 2 ? awning : shade(awning, 0.3)));
    buf.hline(ax - 6, ay + 7, aw + 12, rgb(shade(awning, -0.3)));
    for (let x = 0; x < aw + 12; x += 6) buf.ellipse(ax - 6 + x + 3, ay + 8, 3, 2, rgb(x % 12 ? awning : shade(awning, 0.3)));
  }
  if (sign) {
    // A proper hanging board: bracket, painted panel, a darker rim with a
    // highlight along the top so it reads as a board rather than a sticker,
    // and two pegs. Bigger than it was, because a pictogram this small has to
    // be legible from across a street at four hundred pixels wide.
    const sw = 30, sh = 18;
    const sx = Math.round(buf.w / 2 - sw / 2) + (sign.side || 0) * 30;
    const sy = wallTop - 4;
    const bg = sign.bg || P.plaster;
    buf.rect(sx + 3, sy - 3, sw - 6, 2, rgb(P.metalDk));          // bracket
    buf.set(sx + 3, sy - 2, rgb(P.metalDk));
    buf.set(sx + sw - 4, sy - 2, rgb(P.metalDk));
    buf.rect(sx, sy, sw, sh, rgb(bg));
    buf.hline(sx + 1, sy + 1, sw - 2, rgb(shade(bg, 0.22)));       // lit top edge
    buf.hline(sx + 1, sy + sh - 2, sw - 2, rgb(shade(bg, -0.16)));
    buf.frame(sx, sy, sw, sh, rgb(P.woodDeep));
    buf.set(sx + 2, sy + 2, rgb(P.woodDk));                        // pegs
    buf.set(sx + sw - 3, sy + 2, rgb(P.woodDk));
    if (sign.icon) sign.icon(buf, sx + Math.floor(sw / 2), sy + Math.floor(sh / 2) + 1);
  }

  outline(buf);
}

// ---------------------------------------------------------------------------
// Shop sign glyphs — tiny pictograms that tell you what a building sells.
// ---------------------------------------------------------------------------

/**
 * The board's paint. Every trade gets its own colour as well as its own
 * pictogram, so a street of shops reads as a street of different shops from
 * further away than the glyphs themselves survive.
 */
export const SIGN_BG = {
  cafe: '#f6e6c8', grocer: '#dfe9cf', bakery: '#f2dcb4', petshop: '#e6dcf0',
  inn: '#dfe4ee', book: '#dce6f2', groomer: '#f4dee8', builder: '#e8dfd0',
  hardware: '#dbe0e6', vet: '#eaf0ee', fish: '#d8e8f0', harbour: '#d6e2e8',
  furniture: '#e4dcf2', flea: '#f0e2d2', tea: '#dcece4', exotic: '#f0e2ee',
  herbalist: '#dfeadb', beekeeper: '#f6e8c0', town: '#e8e0cc',
};

// Every glyph is drawn about a centre, filling roughly 24x14 of the board.
// They are deliberately three or four colours each: a shape this small is read
// by its colour blocks long before its outline.

/** A tapered post-and-plank shape used by several of the wooden glyphs. */
function pawPad(b, x, y, rx, ry, col, hi) {
  b.ellipse(x, y, rx, ry, rgb(col));
  b.ellipse(x, y - ry * 0.3, rx * 0.62, ry * 0.5, rgb(hi));
}

export const SIGN_ICONS = {
  cafe: (b, x, y) => { // a cup on a saucer, with steam — the old one read as a dash
    b.set(x - 4, y - 7, rgb('#ffffff')); b.set(x - 3, y - 8, rgb('#e8f0f4'));
    b.set(x - 1, y - 9, rgb('#ffffff')); b.set(x, y - 7, rgb('#e8f0f4'));
    b.set(x + 2, y - 8, rgb('#ffffff'));
    // The china is nearly white, so it needs its own outline — on a cream
    // board an unoutlined white cup is just a pale rectangle, which is exactly
    // what the old sign looked like.
    b.rect(x - 8, y - 6, 13, 10, rgb('#6b5540'));
    b.rect(x - 7, y - 5, 11, 8, rgb('#fbf6ec'));            // cup body
    b.rect(x - 7, y - 5, 11, 1, rgb('#ffffff'));
    b.rect(x - 6, y - 4, 9, 3, rgb(P.coffee));              // the coffee in it
    b.hline(x - 6, y - 4, 9, rgb(shade(P.coffee, 0.3)));
    b.rect(x - 7, y + 2, 11, 1, rgb('#d8cdb8'));
    b.rect(x + 5, y - 3, 4, 2, rgb('#6b5540'));             // handle
    b.rect(x + 5, y - 2, 3, 1, rgb('#fbf6ec'));
    b.set(x + 8, y - 1, rgb('#6b5540')); b.rect(x + 5, y, 4, 1, rgb('#6b5540'));
    b.ellipse(x - 1, y + 5, 10, 2.4, rgb('#6b5540'));       // saucer
    b.ellipse(x - 1, y + 4.6, 8.6, 1.8, rgb('#e8dfcc'));
    b.ellipse(x - 1, y + 4, 7, 1.2, rgb('#ffffff'));
  },
  grocer: (b, x, y) => { // a basket with things in it
    b.ellipse(x - 4, y - 3, 3.6, 3.4, rgb(P.flowerR));      // apple
    b.ellipse(x - 5, y - 4, 1.6, 1.4, rgb('#f0899a'));
    b.vline(x - 4, y - 8, 3, rgb(P.forest));
    b.ellipse(x + 4, y - 4, 2.6, 4, rgb('#e08b3f'));        // carrot
    b.set(x + 4, y - 8, rgb(P.forest)); b.set(x + 5, y - 9, rgb(P.forest));
    b.set(x + 3, y - 9, rgb(P.forest));
    b.rect(x - 9, y + 1, 18, 6, rgb('#b98a52'));            // basket
    b.hline(x - 9, y + 1, 18, rgb('#d8a869'));
    for (let i = 0; i < 5; i++) b.vline(x - 7 + i * 4, y + 2, 4, rgb('#8f6a3d'));
  },
  bakery: (b, x, y) => { // a scored loaf and a roll
    b.ellipse(x - 3, y, 8, 5, rgb('#c9863f'));
    b.ellipse(x - 3, y - 1, 7, 4, rgb('#e0a45c'));
    b.ellipse(x - 3, y - 2, 5.4, 2.4, rgb('#f0c184'));
    for (let i = 0; i < 3; i++) b.line(x - 7 + i * 4, y - 2, x - 5 + i * 4, y + 1, rgb('#a9682c'));
    b.ellipse(x + 7, y + 2, 3.6, 2.6, rgb('#e0a45c'));      // roll
    b.ellipse(x + 7, y + 1.4, 2.6, 1.6, rgb('#f6d6a4'));
  },
  petshop: (b, x, y) => { // a paw. Outlined, or the pads and the toes merge
    const dk = '#5a4330', fur = '#9a7554', pad = '#e8949a';
    const toe = (tx, ty) => {
      b.ellipse(tx, ty, 3.2, 3.4, rgb(dk));
      b.ellipse(tx, ty, 2.2, 2.4, rgb(fur));
      b.ellipse(tx, ty + 0.4, 1.4, 1.4, rgb(pad));
    };
    b.ellipse(x, y + 4, 6.6, 5, rgb(dk));
    b.ellipse(x, y + 4, 5.4, 3.9, rgb(fur));
    b.ellipse(x, y + 4.4, 3.6, 2.6, rgb(pad));
    b.ellipse(x - 1, y + 3.6, 1.6, 1, rgb('#f4b8be'));
    toe(x - 7, y - 3); toe(x - 2.5, y - 5.5); toe(x + 2.5, y - 5.5); toe(x + 7, y - 3);
  },
  inn: (b, x, y) => { // a bed, made
    b.rect(x - 10, y + 1, 20, 5, rgb(P.wood));              // frame
    b.hline(x - 10, y + 1, 20, rgb(P.woodLt));
    b.rect(x - 11, y - 4, 3, 10, rgb(P.woodDk));            // headboard
    b.rect(x + 9, y - 1, 2, 7, rgb(P.woodDk));
    b.rect(x - 8, y - 2, 7, 4, rgb('#fbf6ec'));             // pillow
    b.rect(x - 1, y - 2, 10, 4, rgb('#7d94c4'));            // blanket
    b.hline(x - 1, y - 2, 10, rgb('#9db0d8'));
  },
  book: (b, x, y) => { // an open book — the library
    b.ellipse(x, y + 5, 11, 2, rgb('#00000022'));
    b.rect(x - 11, y - 5, 11, 10, rgb('#4a6fa8'));
    b.rect(x + 1, y - 5, 11, 10, rgb('#4a6fa8'));
    b.rect(x - 10, y - 4, 9, 9, rgb(P.paper));
    b.rect(x + 1, y - 4, 9, 9, rgb('#f2ecdc'));
    b.vline(x, y - 5, 10, rgb('#33528a'));
    for (let i = 0; i < 4; i++) {
      b.hline(x - 8, y - 2 + i * 2, 6, rgb('#b8b0a0'));
      b.hline(x + 3, y - 2 + i * 2, 6, rgb('#b8b0a0'));
    }
  },
  groomer: (b, x, y) => { // scissors and a comb — a brush read as a cake
    const st = '#8f9aa8', lt = '#d0d8e2', dk = '#5a6472';
    b.line(x - 7, y + 7, x + 4, y - 6, rgb(dk));            // blades
    b.line(x - 6, y + 7, x + 5, y - 6, rgb(lt));
    b.line(x + 7, y + 7, x - 4, y - 6, rgb(dk));
    b.line(x + 6, y + 7, x - 5, y - 6, rgb(lt));
    b.ellipse(x - 5, y - 7, 3.2, 3, rgb(P.uiPink));         // handles
    b.ellipse(x - 5, y - 7, 1.6, 1.5, rgb(P.plaster));
    b.ellipse(x + 5, y - 7, 3.2, 3, rgb(P.uiPink));
    b.ellipse(x + 5, y - 7, 1.6, 1.5, rgb(P.plaster));
    b.set(x, y + 1, rgb(st));
    b.rect(x - 11, y + 2, 5, 6, rgb(dk));                   // comb
    b.rect(x - 10, y + 2, 3, 3, rgb(lt));
    for (let i = 0; i < 3; i++) b.vline(x - 10 + i * 2, y + 5, 3, rgb(lt));
  },
  builder: (b, x, y) => { // a trowel over a course of brick, both solid
    const br = '#a85440', brl = '#c9765c', mort = '#e0d8c8';
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 3; i++) {
        const bx = x - 11 + i * 8 + (r % 2 ? 4 : 0);
        b.rect(bx, y + 2 + r * 5, 7, 4, rgb(br));
        b.hline(bx, y + 2 + r * 5, 7, rgb(brl));
      }
      b.hline(x - 12, y + 1 + r * 5, 24, rgb(mort));
    }
    b.rect(x + 3, y - 9, 8, 3, rgb(P.woodDk));              // handle
    b.hline(x + 3, y - 9, 8, rgb(P.wood));
    b.rect(x + 1, y - 8, 3, 3, rgb('#5a6472'));             // shank
    for (let i = 0; i < 7; i++) {                            // blade, tapering
      b.hline(x - 10 + i, y - 6 + i, 13 - i * 2, rgb(i < 2 ? '#e0e4ea' : '#aeb8c4'));
    }
    b.line(x - 10, y - 6, x + 2, y - 6, rgb('#5a6472'));
  },
  hardware: (b, x, y) => { // a claw hammer, big and solid, over a spanner
    const mt = '#aeb8c4', hi = '#e6ecf2', dk = '#5a6472';
    b.line(x - 8, y + 8, x - 8, y + 8, rgb(dk));
    b.rect(x - 9, y + 1, 20, 4, rgb(dk));                   // spanner shaft
    b.rect(x - 9, y + 2, 20, 2, rgb(mt));
    b.ellipse(x - 10, y + 3, 4, 4, rgb(dk));
    b.ellipse(x - 10, y + 3, 2.6, 2.6, rgb(mt));
    b.ellipse(x - 10, y + 3, 1.2, 1.4, rgb(P.plaster));
    b.ellipse(x + 11, y + 3, 4, 4, rgb(dk));
    b.ellipse(x + 11, y + 3, 2.6, 2.6, rgb(mt));
    b.ellipse(x + 12, y + 3, 1.6, 1.4, rgb(P.plaster));
    b.rect(x - 2, y - 4, 5, 12, rgb('#6b5028'));            // hammer shaft
    b.rect(x - 1, y - 4, 3, 12, rgb(P.wood));
    b.rect(x - 8, y - 9, 15, 6, rgb(dk));                   // head
    b.rect(x - 7, y - 8, 13, 4, rgb(mt));
    b.hline(x - 7, y - 8, 13, rgb(hi));
    b.rect(x - 8, y - 3, 4, 3, rgb(dk));                    // claw
    b.set(x - 7, y - 1, rgb(dk)); b.set(x - 9, y - 2, rgb(dk));
  },
  vet: (b, x, y) => { // a cross with a paw in it, so it is not just a chemist
    b.rect(x - 5, y - 10, 11, 21, rgb('#c8443f'));
    b.rect(x - 11, y - 4, 23, 9, rgb('#c8443f'));
    b.rect(x - 4, y - 9, 9, 19, rgb('#e05a52'));
    b.rect(x - 10, y - 3, 21, 7, rgb('#e05a52'));
    b.hline(x - 4, y - 9, 9, rgb('#f07a70'));
    const toe = (tx, ty) => b.ellipse(tx, ty, 1.5, 1.6, rgb('#ffffff'));
    b.ellipse(x, y + 2.4, 3.4, 2.6, rgb('#ffffff'));
    toe(x - 3.4, y - 1.6); toe(x - 1.2, y - 3.2); toe(x + 1.2, y - 3.2); toe(x + 3.4, y - 1.6);
  },
  fish: (b, x, y) => { // a fish, side on
    b.ellipse(x - 2, y, 8, 4.4, rgb('#5f9dc4'));
    b.ellipse(x - 2, y - 1, 7, 3, rgb('#8fc4dc'));
    b.ellipse(x - 3, y - 2, 4.4, 1.4, rgb('#c8e6f2'));
    b.line(x + 7, y - 4, x + 7, y + 4, rgb('#4a80a8'));     // tail
    b.line(x + 10, y - 4, x + 7, y, rgb('#4a80a8'));
    b.line(x + 10, y + 4, x + 7, y, rgb('#4a80a8'));
    b.rect(x + 8, y - 3, 2, 6, rgb('#5f9dc4'));
    b.line(x - 3, y - 4, x + 1, y - 5, rgb('#4a80a8'));     // dorsal
    b.set(x - 5, y - 1, rgb('#20304a')); b.set(x - 5, y - 2, rgb('#ffffff'));
  },
  harbour: (b, x, y) => { // an anchor, with a bottom that curves
    const mt = '#8f9aa8', hi = '#d0d8e2', dk = '#4a5462';
    b.ellipse(x, y - 8, 3.4, 3, rgb(dk));                   // ring
    b.ellipse(x, y - 8, 1.8, 1.6, rgb(P.plaster));
    b.rect(x - 2, y - 6, 5, 13, rgb(dk));                   // shank
    b.rect(x - 1, y - 6, 3, 13, rgb(mt));
    b.vline(x - 1, y - 6, 13, rgb(hi));
    b.rect(x - 8, y - 5, 17, 3, rgb(dk));                   // stock
    b.rect(x - 8, y - 5, 17, 1, rgb(hi));
    // Arms sweeping out and up, drawn row by row so they read as a curve.
    const arm = [[6, 2], [7, 3], [8, 3], [9, 2], [10, 0]];
    for (let i = 0; i < arm.length; i++) {
      const [dx, h] = arm[i];
      b.rect(x - dx - 1, y + 6 - i, 2, h, rgb(dk));
      b.rect(x + dx, y + 6 - i, 2, h, rgb(dk));
      b.set(x - dx, y + 6 - i, rgb(mt));
      b.set(x + dx, y + 6 - i, rgb(mt));
    }
    b.rect(x - 4, y + 6, 9, 2, rgb(dk));
    b.rect(x - 3, y + 6, 7, 1, rgb(mt));
    b.set(x - 11, y + 1, rgb(dk)); b.set(x + 11, y + 1, rgb(dk));   // fluke tips
  },
  furniture: (b, x, y) => { // a wing armchair — the good furniture shop
    b.ellipse(x, y + 7, 11, 2, rgb('#00000022'));
    b.rect(x - 6, y - 6, 12, 9, rgb('#7d63c8'));            // back
    b.rect(x - 6, y - 6, 12, 2, rgb('#9a82dc'));
    b.rect(x - 9, y - 4, 4, 9, rgb('#6a52ac'));             // arms
    b.rect(x + 5, y - 4, 4, 9, rgb('#6a52ac'));
    b.rect(x - 6, y + 1, 12, 4, rgb('#8a72d6'));            // seat
    b.hline(x - 6, y + 1, 12, rgb('#a894e4'));
    b.rect(x - 7, y + 5, 3, 3, rgb(P.woodDk));              // legs
    b.rect(x + 5, y + 5, 3, 3, rgb(P.woodDk));
  },
  flea: (b, x, y) => { // a stall: scalloped striped awning over a heap of junk
    for (let i = 0; i < 12; i++) {
      const c = i % 2 ? '#c94a4a' : '#f2ece0';
      b.rect(x - 12 + i * 2, y - 9, 2, 5, rgb(c));
      b.set(x - 12 + i * 2, y - 4, rgb(c));                 // scallop
      b.set(x - 11 + i * 2, y - 4, rgb(c));
      if (i % 2) { b.set(x - 12 + i * 2, y - 3, rgb(c)); b.set(x - 11 + i * 2, y - 3, rgb(c)); }
    }
    b.hline(x - 12, y - 10, 24, rgb('#8f4a38'));
    b.vline(x - 11, y - 2, 9, rgb(P.woodDk));               // legs
    b.vline(x + 10, y - 2, 9, rgb(P.woodDk));
    b.rect(x - 12, y + 4, 24, 3, rgb(P.wood));              // table
    b.hline(x - 12, y + 4, 24, rgb(P.woodLt));
    b.rect(x - 9, y - 1, 7, 5, rgb('#c9863f'));             // crate
    b.hline(x - 9, y - 1, 7, rgb('#e0a45c'));
    b.vline(x - 6, y - 1, 5, rgb('#8f6a3d'));
    b.ellipse(x + 1, y + 1, 3.4, 3.2, rgb('#4f7d70'));      // pot
    b.ellipse(x + 1, y + 0.2, 2, 1.4, rgb('#6b9e8f'));
    b.rect(x + 6, y - 2, 5, 6, rgb('#4a6fa8'));             // book
    b.rect(x + 7, y - 1, 3, 4, rgb(P.paper));
  },
  tea: (b, x, y) => { // a teapot, pouring
    b.ellipse(x - 1, y + 1, 7.4, 5.4, rgb('#4f7d70'));
    b.ellipse(x - 1, y, 6.4, 4, rgb('#6b9e8f'));
    b.ellipse(x - 2, y - 2, 4, 1.8, rgb('#8fbcae'));
    b.rect(x - 3, y - 6, 5, 2, rgb('#4f7d70'));             // lid
    b.set(x - 1, y - 7, rgb('#d0a659'));
    b.line(x + 6, y - 2, x + 10, y - 4, rgb('#4f7d70'));    // spout
    b.line(x + 6, y - 1, x + 10, y - 2, rgb('#6b9e8f'));
    b.rect(x - 9, y - 3, 2, 5, rgb('#4f7d70'));             // handle
    b.set(x - 8, y - 4, rgb('#4f7d70')); b.set(x - 8, y + 2, rgb('#4f7d70'));
    b.set(x + 10, y - 1, rgb('#c8e0d8')); b.set(x + 10, y + 1, rgb('#c8e0d8'));
  },
  exotic: (b, x, y) => { // a cat's face in a rosette — the fancy cattery
    for (let i = 0; i < 8; i++) {                            // rosette petals
      const a = (i / 8) * 6.2832;
      b.ellipse(x + Math.cos(a) * 8, y + Math.sin(a) * 6, 2.6, 2.4, rgb('#d0a659'));
    }
    b.ellipse(x, y, 7, 6, rgb('#f2e4c8'));
    b.line(x - 6, y - 5, x - 4, y - 9, rgb('#6b5540'));      // ears
    b.line(x - 4, y - 9, x - 1, y - 5, rgb('#6b5540'));
    b.line(x + 6, y - 5, x + 4, y - 9, rgb('#6b5540'));
    b.line(x + 4, y - 9, x + 1, y - 5, rgb('#6b5540'));
    b.set(x - 3, y - 1, rgb('#2f2a3d')); b.set(x + 3, y - 1, rgb('#2f2a3d'));
    b.set(x - 3, y - 2, rgb('#6bc47a')); b.set(x + 3, y - 2, rgb('#6bc47a'));
    b.ellipse(x, y + 2, 1.4, 1, rgb('#e0899a'));
    b.line(x - 8, y + 1, x - 4, y + 2, rgb('#c8b89a'));      // whiskers
    b.line(x + 8, y + 1, x + 4, y + 2, rgb('#c8b89a'));
  },
  herbalist: (b, x, y) => { // a mortar you can tell is a bowl, and a pestle
    const st = '#9a8f7a', lt = '#c2b6a0', dk = '#6b6152';
    b.line(x + 3, y - 10, x + 10, y - 3, rgb(dk));          // pestle
    b.line(x + 2, y - 9, x + 9, y - 2, rgb(P.wood));
    b.line(x + 1, y - 8, x + 8, y - 1, rgb(dk));
    b.ellipse(x + 10.5, y - 2.5, 2.6, 2.4, rgb(P.woodDk));
    b.vline(x - 7, y - 8, 7, rgb('#4a7a3d'));               // sprig in the bowl
    for (const [dx, dy] of [[-9, -8], [-5, -8], [-9, -5], [-5, -5], [-7, -10]]) {
      b.ellipse(x + dx, y + dy, 2.2, 1.6, rgb('#6b9e57'));
      b.ellipse(x + dx, y + dy - 0.4, 1.2, 0.8, rgb('#8fbc6b'));
    }
    b.ellipse(x - 1, y, 11, 3, rgb(dk));                    // rim
    b.ellipse(x - 1, y - 0.6, 9.4, 2.2, rgb(lt));
    for (let i = 0; i < 7; i++) {                            // bowl, narrowing
      b.hline(x - 10 + i, y + 1 + i, 19 - i * 2.4 | 0, rgb(st));
    }
    b.hline(x - 9, y + 2, 6, rgb(lt));                       // lit side
    b.hline(x - 8, y + 3, 5, rgb(lt));
    b.hline(x + 3, y + 3, 5, rgb(dk));                       // shaded side
    b.hline(x + 1, y + 5, 5, rgb(dk));
  },
  beekeeper: (b, x, y) => { // a skep hive, coiled straw, with a bee over it
    const dk = '#8f6a2c';
    for (let i = 0; i < 6; i++) {
      const w = 20 - i * 2.8;
      b.rect(x - w / 2, y + 6 - i * 2.6, w, 1, rgb(dk));
      b.rect(x - w / 2, y + 7 - i * 2.6, w, 2, rgb(i % 2 ? '#d0a659' : '#e6c67e'));
    }
    b.ellipse(x, y - 8, 4.4, 2.6, rgb(dk));
    b.ellipse(x, y - 8.4, 3.4, 1.8, rgb('#e6c67e'));
    b.rect(x - 3, y + 5, 6, 4, rgb('#5a4020'));              // the way in
    b.ellipse(x, y + 5.4, 2.2, 1.4, rgb('#3a2a14'));
    b.rect(x - 11, y + 9, 23, 2, rgb('#8f8a6a'));            // the board it sits on
    b.hline(x - 11, y + 9, 23, rgb('#b0aa86'));
    b.ellipse(x + 9, y - 5, 2.6, 2.2, rgb('#f2d05a'));       // bee
    b.vline(x + 9, y - 7, 5, rgb('#2f2a3d'));
    b.vline(x + 10, y - 6, 3, rgb('#2f2a3d'));
    b.ellipse(x + 7.5, y - 7.6, 2, 1.2, rgb('#e6f2fa'));
    b.ellipse(x + 11, y - 7.6, 2, 1.2, rgb('#e6f2fa'));
  },
  town: (b, x, y) => { // a cottage, for the signposts out in the valley
    for (let i = 0; i < 7; i++) b.hline(x - i, y - 6 + i, i * 2 + 1, rgb(P.terracotta));
    b.hline(x - 6, y, 13, rgb(shade(P.terracotta, -0.25)));
    b.rect(x - 6, y + 1, 13, 7, rgb(P.plaster));
    b.hline(x - 6, y + 1, 13, rgb('#ffffff'));
    b.rect(x - 2, y + 3, 4, 5, rgb(P.woodDk));
    b.rect(x - 5, y + 3, 2, 2, rgb('#8fc4dc'));
    b.rect(x + 4, y + 3, 2, 2, rgb('#8fc4dc'));
  },
};

// ---------------------------------------------------------------------------
// Patio furniture. Metal rather than upholstery: slatted seats, thin painted
// frames, and everything a little lighter than its indoor cousin, because a
// patio set is meant to be dragged about.
// ---------------------------------------------------------------------------

function paintPatioChair(buf, v, col) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 6, 2.2);
  const c = col || '#6f8f7a';
  const dk = shade(c, -0.3), lt = shade(c, 0.24);
  const seatY = buf.h - 12;
  // Fan back: three slats rising out of the seat, which is what says "garden
  // chair" rather than "kitchen chair" at this size.
  for (let i = 0; i < 3; i++) {
    const bx = 4 + i * 4;
    buf.rect(bx, 3 + Math.abs(i - 1), 2, seatY - 3 - Math.abs(i - 1), rgb(i === 1 ? lt : c));
  }
  buf.rect(3, 2, buf.w - 6, 2, rgb(dk));
  buf.rect(3, seatY, buf.w - 6, 2, rgb(lt));
  buf.rect(3, seatY + 2, buf.w - 6, 3, rgb(c));
  buf.hline(3, seatY + 4, buf.w - 6, rgb(dk));
  buf.rect(3, buf.h - 7, 2, 5, rgb(dk));
  buf.rect(buf.w - 5, buf.h - 7, 2, 5, rgb(dk));
  outline(buf);
}

function paintPatioStool(buf, v, col) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 5, 2);
  const c = col || '#6f8f7a';
  const dk = shade(c, -0.32), lt = shade(c, 0.26);
  buf.ellipse(buf.w / 2, buf.h - 9, 6, 3, rgb(c));
  buf.ellipse(buf.w / 2, buf.h - 10, 5.4, 2.4, rgb(lt));
  buf.hline(2, buf.h - 7, buf.w - 4, rgb(dk));
  buf.rect(3, buf.h - 7, 2, 6, rgb(dk));
  buf.rect(buf.w - 5, buf.h - 7, 2, 6, rgb(dk));
  buf.rect(buf.w / 2 - 1, buf.h - 6, 2, 5, rgb(dk));
  outline(buf);
}

function paintPatioTable(buf, v, col) {
  groundShadow(buf, buf.w / 2, buf.h - 3, 10, 3.2);
  const c = col || '#8f9a8a';
  const dk = shade(c, -0.32), lt = shade(c, 0.28);
  buf.rect(buf.w / 2 - 2, buf.h - 13, 5, 10, rgb(dk));
  buf.ellipse(buf.w / 2, buf.h - 4, 7, 2.6, rgb(dk));
  buf.ellipse(buf.w / 2, buf.h - 15, 12, 7, rgb(c));
  buf.ellipse(buf.w / 2, buf.h - 16, 11, 6, rgb(lt));
  // A mesh top, which is the one thing every patio table has in common.
  for (let i = -8; i <= 8; i += 3) {
    buf.line(buf.w / 2 + i, buf.h - 21, buf.w / 2 + i, buf.h - 11, rgb(shade(c, -0.1)));
  }
  buf.ellipse(buf.w / 2, buf.h - 16, 11.4, 6.4, rgb(dk));
  buf.ellipse(buf.w / 2, buf.h - 16, 10, 5, rgb(lt));
  for (let i = -7; i <= 7; i += 3) {
    for (let j = -3; j <= 3; j += 3) buf.set(buf.w / 2 + i, buf.h - 16 + j, rgb(shade(c, -0.16)));
  }
  outline(buf);
}

function paintUmbrellaTable(buf, v, col) {
  const cw = buf.w;
  groundShadow(buf, cw / 2, buf.h - 3, 13, 4);
  const c = '#8f9a8a', dk = shade(c, -0.32), lt = shade(c, 0.28);
  const cloth = col || '#d95f5f';
  // Table first, then the pole and canopy over it.
  buf.rect(cw / 2 - 2, buf.h - 14, 5, 11, rgb(dk));
  buf.ellipse(cw / 2, buf.h - 4, 9, 3, rgb(dk));
  buf.ellipse(cw / 2, buf.h - 17, 16, 8, rgb(dk));
  buf.ellipse(cw / 2, buf.h - 18, 15, 7, rgb(lt));
  buf.ellipse(cw / 2, buf.h - 18.5, 13, 5.6, rgb(c));
  buf.rect(cw / 2 - 1, buf.h - 46, 3, 30, rgb(P.woodDk));
  buf.vline(cw / 2 - 1, buf.h - 46, 30, rgb(P.wood));
  // Canopy: alternating panels, with a scalloped hem and a finial.
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const col2 = i % 2 ? cloth : shade(cloth, 0.3);
    for (let r = 0; r < 20; r++) {
      const x = cw / 2 + Math.cos(a0) * r * 1.05;
      const y = buf.h - 50 + Math.sin(a0) * r * 0.42 + r * 0.22;
      buf.ellipse(x, y, 2.4, 1.6, rgb(col2));
    }
  }
  buf.ellipse(cw / 2, buf.h - 50, 6, 3, rgb(shade(cloth, 0.42)));
  for (let i = -20; i <= 20; i += 5) {
    buf.ellipse(cw / 2 + i, buf.h - 41 + Math.abs(i) * 0.12, 2.6, 1.6, rgb(shade(cloth, -0.24)));
  }
  buf.rect(cw / 2 - 1, buf.h - 54, 3, 4, rgb(P.metalDk));
  outline(buf);
}

function paintFountain(buf, v) {
  const cw = buf.w;
  groundShadow(buf, cw / 2, buf.h - 3, 17, 5);
  const st = '#b0aa9a', dk = '#7d786c', lt = '#d0cabc';
  // Basin
  buf.ellipse(cw / 2, buf.h - 10, 20, 9, rgb(dk));
  buf.ellipse(cw / 2, buf.h - 11, 19, 8, rgb(st));
  buf.ellipse(cw / 2, buf.h - 12, 16.5, 6.4, rgb(lt));
  buf.ellipse(cw / 2, buf.h - 12, 15, 5.6, rgb('#5f9dc4'));
  buf.ellipse(cw / 2, buf.h - 12.6, 12, 4, rgb('#8fc4dc'));
  // Pedestal and upper bowl
  buf.rect(cw / 2 - 3, buf.h - 26, 7, 14, rgb(st));
  buf.rect(cw / 2 - 3, buf.h - 26, 2, 14, rgb(lt));
  buf.ellipse(cw / 2, buf.h - 27, 11, 4.4, rgb(dk));
  buf.ellipse(cw / 2, buf.h - 28, 10, 3.8, rgb(st));
  buf.ellipse(cw / 2, buf.h - 28.6, 8, 2.8, rgb('#5f9dc4'));
  // The spout, and water falling off the rim in two curtains
  buf.rect(cw / 2 - 1, buf.h - 36, 3, 8, rgb(st));
  buf.ellipse(cw / 2, buf.h - 37, 2.4, 2, rgb('#c8e6f2'));
  for (const dx of [-9, -5, 5, 9]) {
    buf.vline(cw / 2 + dx, buf.h - 27, 11 - Math.abs(dx) * 0.3, rgb('#a8d8ee', 200));
  }
  for (const [dx, dy] of [[-13, -14], [13, -15], [-6, -9], [7, -8], [0, -16]]) {
    buf.set(cw / 2 + dx, buf.h + dy, rgb('#ffffff'));
  }
  outline(buf);
}

function paintPatioBench(buf, v, col) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 13, 2.6);
  const c = col || '#6f8f7a';
  const dk = shade(c, -0.32), lt = shade(c, 0.26);
  for (let i = 0; i < 3; i++) {
    buf.rect(4, 3 + i * 3, buf.w - 8, 2, rgb(i % 2 ? lt : c));
  }
  buf.rect(3, 2, 2, buf.h - 6, rgb(dk));
  buf.rect(buf.w - 5, 2, 2, buf.h - 6, rgb(dk));
  buf.rect(3, buf.h - 12, buf.w - 6, 2, rgb(lt));
  buf.rect(3, buf.h - 10, buf.w - 6, 3, rgb(c));
  buf.hline(3, buf.h - 8, buf.w - 6, rgb(dk));
  buf.rect(5, buf.h - 7, 2, 5, rgb(dk));
  buf.rect(buf.w - 7, buf.h - 7, 2, 5, rgb(dk));
  outline(buf);
}

// ---------------------------------------------------------------------------
// Interior furniture
// ---------------------------------------------------------------------------

function paintTableRound(buf, v, cloth) {
  groundShadow(buf, buf.w / 2, buf.h - 3, 11, 3.4);
  buf.rect(buf.w / 2 - 2, buf.h - 12, 5, 9, rgb(P.woodDk));
  buf.ellipse(buf.w / 2, buf.h - 4, 8, 3, rgb(P.woodDeep));
  buf.ellipse(buf.w / 2, buf.h - 14, 12, 7, rgb(P.wood));
  buf.ellipse(buf.w / 2, buf.h - 15, 11, 6, rgb(P.woodLt));
  if (cloth) {
    buf.ellipse(buf.w / 2, buf.h - 15, 10, 5.4, rgb(cloth));
    buf.ellipse(buf.w / 2, buf.h - 16, 8, 4, rgb(shade(cloth, 0.18)));
  }
  outline(buf);
}

function paintTableSquare(buf, v, cloth) {
  groundShadow(buf, buf.w / 2, buf.h - 3, 12, 3.4);
  buf.rect(4, buf.h - 11, 3, 8, rgb(P.woodDk));
  buf.rect(buf.w - 7, buf.h - 11, 3, 8, rgb(P.woodDk));
  buf.rect(2, buf.h - 18, buf.w - 4, 8, rgb(P.wood));
  buf.rect(2, buf.h - 18, buf.w - 4, 3, rgb(P.woodLt));
  if (cloth) {
    buf.rect(3, buf.h - 17, buf.w - 6, 6, rgb(cloth));
    for (let x = 3; x < buf.w - 3; x += 4) buf.vline(x, buf.h - 17, 6, rgb(shade(cloth, 0.2)));
  }
  outline(buf);
}

function paintChair(buf, v, col, dir) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 6, 2.2);
  const c = col || P.wood;
  const back = dir === 'up';
  const seatY = buf.h - 12;
  if (!back) {
    // Top rail plus the two uprights that carry it — without them the rail
    // floats above the seat with nothing holding it up.
    buf.rect(3, 2, buf.w - 6, 3, rgb(shade(c, -0.2)));
    buf.rect(3, 5, 2, seatY - 5, rgb(shade(c, -0.28)));
    buf.rect(buf.w - 5, 5, 2, seatY - 5, rgb(shade(c, -0.28)));
    buf.vline(3, 5, seatY - 5, rgb(shade(c, -0.12)));
  }
  buf.rect(3, seatY, buf.w - 6, 5, rgb(c));
  buf.rect(3, seatY, buf.w - 6, 2, rgb(shade(c, 0.2)));
  if (back) buf.rect(3, buf.h - 20, buf.w - 6, 9, rgb(shade(c, -0.1)));
  buf.rect(4, buf.h - 7, 2, 5, rgb(shade(c, -0.3)));
  buf.rect(buf.w - 6, buf.h - 7, 2, 5, rgb(shade(c, -0.3)));
  outline(buf);
}

function paintStool(buf, v, col) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 5, 2);
  const c = col || P.rug;
  buf.ellipse(buf.w / 2, buf.h - 10, 6, 3, rgb(c));
  buf.ellipse(buf.w / 2, buf.h - 11, 5.4, 2.6, rgb(shade(c, 0.2)));
  buf.rect(buf.w / 2 - 3, buf.h - 9, 2, 7, rgb(P.woodDk));
  buf.rect(buf.w / 2 + 1, buf.h - 9, 2, 7, rgb(P.woodDk));
  outline(buf);
}

function paintSofa(buf, v, col) {
  groundShadow(buf, buf.w / 2, buf.h - 3, buf.w / 2 - 2, 3.4);
  const c = col || '#8a72d6';
  buf.rect(1, buf.h - 20, buf.w - 2, 12, rgb(shade(c, -0.15)));
  buf.rect(3, buf.h - 14, buf.w - 6, 8, rgb(c));
  buf.rect(3, buf.h - 14, buf.w - 6, 3, rgb(shade(c, 0.18)));
  buf.rect(0, buf.h - 18, 5, 13, rgb(shade(c, -0.05)));
  buf.rect(buf.w - 5, buf.h - 18, 5, 13, rgb(shade(c, -0.05)));
  buf.rect(2, buf.h - 5, 3, 4, rgb(P.woodDk));
  buf.rect(buf.w - 5, buf.h - 5, 3, 4, rgb(P.woodDk));
  outline(buf);
}

/**
 * A land-line telephone: cradle, handset across the top, dial on the front.
 * `v` is the ring frame — it leans one way and then the other, because a
 * ringing phone that sits perfectly still is a phone you walk past.
 */
function paintPhone(buf, v) {
  const lean = v === 1 ? -1 : v === 2 ? 1 : 0;
  const body = '#3a3644', hi = '#565064', dk = '#221f2b';
  const x0 = 3 + lean;
  groundShadow(buf, buf.w / 2, buf.h - 2, 7, 2.4);
  // Base, wider at the bottom.
  buf.rect(x0, buf.h - 10, 12, 8, rgb(body));
  buf.rect(x0 - 1, buf.h - 4, 14, 3, rgb(dk));
  buf.hline(x0, buf.h - 10, 12, rgb(hi));
  // The dial.
  buf.ellipse(x0 + 6, buf.h - 6, 3.4, 2.8, rgb('#d8d2c4'));
  buf.ellipse(x0 + 6, buf.h - 6, 1.6, 1.4, rgb(body));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.2832;
    buf.set(Math.round(x0 + 6 + Math.cos(a) * 2.4), Math.round(buf.h - 6 + Math.sin(a) * 2), rgb('#6b6478'));
  }
  // Handset lying across the cradle, tilted with the lean.
  buf.rect(x0 - 1, buf.h - 14, 14, 3, rgb(hi));
  buf.rect(x0 - 2, buf.h - 15, 4, 4, rgb(body));
  buf.rect(x0 + 11, buf.h - 15, 4, 4, rgb(body));
  buf.hline(x0 - 1, buf.h - 14, 14, rgb('#7a7288'));
  outline(buf);
}

function paintCounterUnit(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 3, buf.w / 2 - 1, 3);
  buf.rect(0, buf.h - 18, buf.w, 15, rgb(P.wood));
  buf.rect(0, buf.h - 20, buf.w, 3, rgb(P.woodLt));
  for (let x = 2; x < buf.w; x += 8) buf.vline(x, buf.h - 17, 13, rgb(P.woodDk));
  buf.hline(0, buf.h - 4, buf.w, rgb(P.woodDeep));
  outline(buf);
}

/** A run of bar counter: heavy top, panelled front, brass foot rail. */
function paintBar(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 3, buf.w / 2 - 1, 3.4);
  const top = buf.h - 22;
  buf.rect(0, top + 4, buf.w, 18, rgb(P.wood));
  // Panelled front.
  for (let x = 2; x < buf.w - 2; x += 10) {
    buf.frame(x, top + 9, 8, 9, rgb(P.woodDk));
  }
  // Counter top, overhanging slightly.
  buf.rect(0, top, buf.w, 5, rgb(P.woodLt));
  buf.hline(0, top, buf.w, rgb('#e0b183'));
  buf.hline(0, top + 4, buf.w, rgb(P.woodDeep));
  // Brass foot rail.
  buf.hline(1, buf.h - 5, buf.w - 2, rgb(P.gold));
  buf.hline(1, buf.h - 4, buf.w - 2, rgb(P.goldDk));
  // A glass and a bottle left out on the top.
  buf.rect(5, top - 6, 3, 6, rgb(P.glass));
  buf.set(5, top - 6, rgb(P.glassLt));
  buf.rect(buf.w - 10, top - 9, 3, 9, rgb('#6b9e8f'));
  buf.rect(buf.w - 10, top - 11, 3, 2, rgb('#4f7d70'));
  outline(buf);
}

/** Tall stool to sit at the bar with. */
function paintBarStool(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 5, 2);
  const seat = ['#c9863f', '#b6524f', '#5b8fd6'][v % 3];
  const cx = buf.w / 2;
  buf.line(cx - 3, buf.h - 12, cx - 5, buf.h - 2, rgb(P.metalDk));
  buf.line(cx + 3, buf.h - 12, cx + 5, buf.h - 2, rgb(P.metalDk));
  buf.rect(cx - 1, buf.h - 13, 2, 11, rgb(P.metal));
  buf.hline(cx - 5, buf.h - 7, 11, rgb(P.metal));      // foot ring
  buf.ellipse(cx, buf.h - 14, 5.4, 2.8, rgb(shade(seat, -0.2)));
  buf.ellipse(cx, buf.h - 15, 4.8, 2.3, rgb(seat));
  buf.ellipse(cx - 1.4, buf.h - 16, 2.2, 1.1, rgb(shade(seat, 0.22)));
  outline(buf);
}

function paintPastryCase(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 3, buf.w / 2 - 1, 3);
  buf.rect(0, buf.h - 14, buf.w, 12, rgb(P.wood));
  buf.rect(1, buf.h - 26, buf.w - 2, 13, rgb(P.glass));
  buf.rect(1, buf.h - 26, buf.w - 2, 4, rgb(P.glassLt));
  buf.frame(1, buf.h - 26, buf.w - 2, 13, rgb(P.metalDk));
  buf.hline(1, buf.h - 20, buf.w - 2, rgb(P.metalDk));
  // Cakes on the shelves.
  for (let i = 0; i < 3; i++) {
    const x = 4 + i * 9;
    buf.rect(x, buf.h - 24, 6, 3, rgb(P.cake));
    buf.set(x + 2, buf.h - 25, rgb(P.strawberry));
    buf.rect(x, buf.h - 18, 6, 3, rgb(i % 2 ? P.matcha : P.coffeeLt));
  }
  outline(buf);
}

function paintRegister(buf, v) {
  buf.rect(2, buf.h - 12, buf.w - 4, 10, rgb(P.metal));
  buf.rect(2, buf.h - 12, buf.w - 4, 3, rgb('#dfe3ea'));
  buf.rect(4, buf.h - 18, buf.w - 8, 7, rgb(P.slateDk));
  buf.rect(5, buf.h - 17, buf.w - 10, 4, rgb('#8fd3a0'));
  for (let i = 0; i < 3; i++) buf.rect(4 + i * 4, buf.h - 8, 3, 2, rgb(P.slate));
  outline(buf);
}

function paintCoffeeMachine(buf, v) {
  buf.rect(1, buf.h - 22, buf.w - 2, 20, rgb(P.metal));
  buf.rect(1, buf.h - 22, buf.w - 2, 4, rgb('#dfe3ea'));
  buf.rect(3, buf.h - 16, buf.w - 6, 7, rgb(P.slateDk));
  buf.rect(4, buf.h - 15, 4, 4, rgb('#ff9a5a'));
  buf.rect(buf.w - 8, buf.h - 15, 4, 4, rgb('#8fd3a0'));
  buf.rect(buf.w / 2 - 2, buf.h - 9, 4, 4, rgb(P.metalDk));
  buf.rect(buf.w / 2 - 3, buf.h - 5, 6, 3, rgb(P.cream));
  outline(buf);
}

function paintShelf(buf, v, kind) {
  groundShadow(buf, buf.w / 2, buf.h - 2, buf.w / 2 - 1, 2.4);
  buf.rect(0, buf.h - 30, buf.w, 28, rgb(P.woodDk));
  buf.rect(1, buf.h - 29, buf.w - 2, 26, rgb(P.wood));
  for (let s = 0; s < 3; s++) {
    const y = buf.h - 26 + s * 8;
    buf.hline(1, y + 6, buf.w - 2, rgb(P.woodDeep));
    for (let i = 0; i < 4; i++) {
      const x = 3 + i * 6;
      const c = kind === 'books' ? ['#d95f5f', '#5b8fd6', '#7fbe57', '#eec453'][(i + s) % 4]
        : kind === 'food' ? ['#e0894a', '#8cbf5a', '#f0c184', '#d95f5f'][(i + s) % 4]
          : ['#c9c2b0', '#8a72d6', '#6b9e8f', '#e6e0cf'][(i + s) % 4];
      if (n(i, s, v) > 0.2) buf.rect(x, y, 4, 6, rgb(c));
    }
  }
  outline(buf);
}

function paintPlantPot(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 6, 2.2);
  buf.rect(3, buf.h - 9, buf.w - 6, 8, rgb(P.terracotta));
  buf.rect(2, buf.h - 10, buf.w - 4, 2, rgb(P.terracottaLt));
  buf.rect(3, buf.h - 3, buf.w - 6, 2, rgb(P.terracottaDk));
  const green = ['#4e9c40', '#3f8a3c', '#6aad4a'][v % 3];
  // Splayed fronds.
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.42;
    const len = 11 + n(i, v, 3) * 6;
    const ex = buf.w / 2 + Math.cos(a) * len, ey = buf.h - 10 + Math.sin(a) * len;
    buf.line(buf.w / 2, buf.h - 10, Math.round(ex), Math.round(ey), rgb(green));
    buf.ellipse(ex, ey, 2.6, 2.2, rgb(shade(green, i % 2 ? 0.15 : -0.1)));
  }
  outline(buf);
}

function paintCatTower(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 11, 3.4);
  const carpet = ['#b6524f', '#6b9e8f', '#8a72d6'][v % 3];
  const cx = buf.w / 2;
  const post = (x, top, bottom, w) => {
    buf.rect(x - w / 2, top, w, bottom - top, rgb(P.thatch));
    // Sisal wrapping.
    for (let y = top; y < bottom; y += 2) buf.hline(x - w / 2, y, w, rgb(P.thatchDk));
    buf.vline(x - w / 2, top, bottom - top, rgb(P.thatchDk));
    buf.vline(x + w / 2 - 1, top, bottom - top, rgb(shade(P.thatch, 0.2)));
  };
  const platform = (y, w) => {
    buf.rect(cx - w / 2, y, w, 5, rgb(shade(carpet, -0.2)));
    buf.rect(cx - w / 2, y, w, 3, rgb(carpet));
    buf.rect(cx - w / 2 + 1, y, w - 2, 1, rgb(shade(carpet, 0.24)));
    buf.hline(cx - w / 2, y + 4, w, rgb(shade(carpet, -0.4)));
  };

  // Base, trunk, mid shelf, a cubby, and a top perch.
  platform(buf.h - 7, buf.w - 2);
  post(cx + 3, buf.h - 20, buf.h - 6, 6);
  platform(buf.h - 24, buf.w - 6);

  // The cubby hole — every cat's preferred address.
  buf.rect(1, buf.h - 22, 12, 12, rgb(shade(carpet, -0.12)));
  buf.rect(1, buf.h - 22, 12, 2, rgb(carpet));
  buf.ellipse(7, buf.h - 15, 4, 4, rgb('#2a2230'));
  buf.ellipse(7, buf.h - 16, 3.4, 3.2, rgb('#1c1720'));

  post(cx - 1, buf.h - 33, buf.h - 23, 6);
  platform(buf.h - 36, buf.w - 8);

  // Dangling pompom on a string.
  buf.vline(buf.w - 4, buf.h - 34, 6, rgb(P.woodDk));
  buf.ellipse(buf.w - 4, buf.h - 27, 2.6, 2.6, rgb(P.uiPink));
  buf.set(buf.w - 5, buf.h - 28, rgb('#ffc0dd'));
  outline(buf);
}

function paintCatBed(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 9, 2.6);
  const c = ['#d472b0', '#5b8fd6', '#7fbe57'][v % 3];
  buf.ellipse(buf.w / 2, buf.h - 5, 10, 5, rgb(shade(c, -0.2)));
  buf.ellipse(buf.w / 2, buf.h - 6, 8, 3.6, rgb(c));
  buf.ellipse(buf.w / 2, buf.h - 6, 6, 2.4, rgb(P.cream));
  outline(buf);
}

function paintCatBowl(buf, v, food) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 5, 1.8);
  buf.ellipse(buf.w / 2, buf.h - 4, 6, 3, rgb('#6b9e8f'));
  buf.ellipse(buf.w / 2, buf.h - 5, 4.6, 2.2, rgb('#4f7d70'));
  if (food) buf.ellipse(buf.w / 2, buf.h - 5, 3.6, 1.6, rgb('#a3703f'));
  outline(buf);
}

function paintScratchPost(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 6, 2.2);
  buf.rect(2, buf.h - 5, buf.w - 4, 4, rgb(P.wood));
  buf.rect(buf.w / 2 - 3, buf.h - 22, 6, 17, rgb(P.thatch));
  for (let y = buf.h - 22; y < buf.h - 5; y += 2) buf.hline(buf.w / 2 - 3, y, 6, rgb(P.thatchDk));
  outline(buf);
}

function paintToy(buf, v, kind) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 4, 1.6);
  if (kind === 'ball') {
    buf.ellipse(buf.w / 2, buf.h - 5, 4, 4, rgb('#e8546b'));
    buf.ellipse(buf.w / 2 - 1, buf.h - 6, 1.6, 1.4, rgb('#ff9aa8'));
  } else if (kind === 'yarn') {
    buf.ellipse(buf.w / 2, buf.h - 5, 4.4, 4, rgb('#8a72d6'));
    for (let i = 0; i < 4; i++) buf.line(buf.w / 2 - 4, buf.h - 7 + i, buf.w / 2 + 4, buf.h - 4 + i, rgb('#a894e8'));
  } else {
    buf.vline(buf.w / 2, buf.h - 14, 9, rgb(P.woodDk));
    buf.ellipse(buf.w / 2, buf.h - 15, 3, 2.4, rgb('#eec453'));
    for (let i = 0; i < 5; i++) buf.line(buf.w / 2, buf.h - 15, buf.w / 2 - 4 + i * 2, buf.h - 19, rgb('#f0d98a'));
  }
  outline(buf);
}

function paintFireplace(buf, v) {
  buf.rect(0, buf.h - 30, buf.w, 28, rgb(P.stone));
  for (let y = buf.h - 30; y < buf.h - 2; y += 4) {
    for (let x = 0; x < buf.w; x += 7) buf.rect(x + ((y / 4) % 2 ? 3 : 0), y, 6, 3, rgb(n(x, y, v) > 0.5 ? P.stoneLt : P.stone));
  }
  buf.rect(4, buf.h - 20, buf.w - 8, 18, rgb('#2a2020'));
  buf.ellipse(buf.w / 2, buf.h - 5, 7, 4, rgb('#ff8a3a'));
  buf.ellipse(buf.w / 2, buf.h - 7, 4.4, 4, rgb('#ffc04a'));
  buf.ellipse(buf.w / 2, buf.h - 8, 2.2, 2.4, rgb('#fff0b0'));
  buf.rect(2, buf.h - 34, buf.w - 4, 5, rgb(P.wood));
  outline(buf);
}

function paintPainting(buf, v) {
  const frameC = P.gold;
  buf.rect(0, 0, buf.w, buf.h, rgb(frameC));
  buf.rect(2, 2, buf.w - 4, buf.h - 4, rgb('#7fb8d6'));
  // A tiny landscape inside the frame.
  buf.rect(2, buf.h - 8, buf.w - 4, 6, rgb('#6aad4a'));
  buf.ellipse(buf.w / 2 + 3, buf.h - 9, 4, 3, rgb('#4e9c40'));
  buf.ellipse(5, 6, 2.4, 2.4, rgb('#ffe9a0'));
  outline(buf, '#5b4a2e');
}

function paintWindowIn(buf, v) {
  buf.rect(0, 0, buf.w, buf.h, rgb(P.woodDk));
  buf.rect(2, 2, buf.w - 4, buf.h - 4, rgb(P.glass));
  buf.rect(2, 2, buf.w - 4, Math.floor((buf.h - 4) / 2), rgb(P.glassLt));
  buf.vline(buf.w / 2, 2, buf.h - 4, rgb(P.woodDk));
  buf.hline(2, buf.h / 2, buf.w - 4, rgb(P.woodDk));
  outline(buf, '#5b4a2e');
}

function paintBookshelf(buf, v) { paintShelf(buf, v, 'books'); }

function paintPiano(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 3, buf.w / 2 - 1, 3);
  buf.rect(0, buf.h - 26, buf.w, 24, rgb('#3a2f28'));
  buf.rect(0, buf.h - 26, buf.w, 4, rgb('#5b4a3c'));
  buf.rect(2, buf.h - 12, buf.w - 4, 5, rgb('#f6f0e0'));
  for (let x = 3; x < buf.w - 3; x += 3) buf.vline(x, buf.h - 12, 5, rgb('#2a2420'));
  for (let x = 4; x < buf.w - 4; x += 6) buf.rect(x, buf.h - 12, 2, 3, rgb('#2a2420'));
  outline(buf);
}

function paintLampIn(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 5, 2);
  buf.rect(buf.w / 2 - 1, buf.h - 18, 3, 16, rgb(P.metalDk));
  buf.rect(buf.w / 2 - 4, buf.h - 3, 9, 2, rgb(P.metalDk));
  for (let i = 0; i < 8; i++) buf.hline(Math.round(buf.w / 2 - 4 - i * 0.6), buf.h - 26 + i, Math.round(9 + i * 1.2), rgb(i < 3 ? '#ffe9b8' : '#f0d18a'));
  outline(buf);
}

function paintDoorMat(buf, v) {
  buf.rect(0, 0, buf.w, buf.h, rgb('#a3703f'));
  buf.frame(0, 0, buf.w, buf.h, rgb('#7d5430'));
  for (let x = 2; x < buf.w - 2; x += 3) buf.vline(x, 2, buf.h - 4, rgb('#b98a56'));
}


/**
 * A woven rug: two tiles of it, flat on the floor.
 *
 * Flat is the whole point. Drawn as an object it would sort against the cats
 * and a sleeping cat would end up *under* the rug she is lying on; baked into
 * the ground with the doormats and the jetties, everything walks over it.
 */
function paintRugMat(buf, v, col) {
  const sets = [
    [P.rug, P.rugLt, P.rugDk],
    ['#6a5a8f', '#8b7ab0', '#4b3e69'],
    ['#c8ba92', '#e0d5b4', '#9a8c68'],
  ];
  const [base, lt, dk] = col ? [col, shade(col, 0.2), shade(col, -0.25)] : sets[v % sets.length];
  const m = 2;
  const w = buf.w - m * 2, h = buf.h - m * 2 - 4;
  const y0 = m + 4;
  buf.rect(m, y0, w, h, rgb(base));
  buf.frame(m, y0, w, h, rgb(dk));
  buf.frame(m + 2, y0 + 2, w - 4, h - 4, rgb(lt));
  // A plain woven middle with two bands across it, which at this size reads as
  // "rug" where anything more detailed reads as "noise".
  buf.hline(m + 4, y0 + Math.round(h * 0.36), w - 8, rgb(lt));
  buf.hline(m + 4, y0 + Math.round(h * 0.64), w - 8, rgb(lt));
  buf.rect(m + 6, y0 + Math.round(h * 0.42), w - 12, Math.max(2, Math.round(h * 0.2)), rgb(dk));
  // Fringe, top and bottom, so it is a rug rather than a painted rectangle.
  for (let x = m + 1; x < m + w - 1; x += 2) {
    buf.vline(x, y0 - 2, 2, rgb(lt));
    buf.vline(x, y0 + h, 2, rgb(lt));
  }
}

function paintMenuBoard(buf, v) {
  groundShadow(buf, buf.w / 2, buf.h - 2, 7, 2.4);
  buf.rect(2, 0, buf.w - 4, buf.h - 6, rgb(P.woodDk));
  buf.rect(4, 2, buf.w - 8, buf.h - 12, rgb('#3a3f3a'));
  for (let i = 0; i < 4; i++) buf.hline(6, 5 + i * 4, buf.w - 12 - (i % 2) * 4, rgb('#e6e0cf'));
  buf.line(buf.w / 2 - 4, buf.h - 6, buf.w / 2 - 6, buf.h - 1, rgb(P.woodDk));
  buf.line(buf.w / 2 + 4, buf.h - 6, buf.w / 2 + 6, buf.h - 1, rgb(P.woodDk));
  outline(buf);
}

// ---------------------------------------------------------------------------
// Object registry
// ---------------------------------------------------------------------------

/**
 * tw/th  = tile footprint (what blocks movement)
 * w/h    = sprite size in pixels
 * solid  = does the footprint block movement
 * variants = how many random looks exist
 */
export const OBJECTS = {
  oak:        { w: 48, h: 56, tw: 1, th: 1, solid: true, variants: 4, paint: paintOak },
  pine:       { w: 40, h: 60, tw: 1, th: 1, solid: true, variants: 3, paint: paintPine },
  birch:      { w: 36, h: 52, tw: 1, th: 1, solid: true, variants: 3, paint: paintBirch },
  apple:      { w: 44, h: 52, tw: 1, th: 1, solid: true, variants: 3, paint: paintApple },
  willow:     { w: 52, h: 54, tw: 1, th: 1, solid: true, variants: 2, paint: paintWillow },
  bush:       { w: 24, h: 22, tw: 1, th: 1, solid: true, variants: 3, paint: (b, v) => paintBush(b, v, false) },
  berrybush:  { w: 24, h: 22, tw: 1, th: 1, solid: true, variants: 3, paint: (b, v) => paintBush(b, v, true) },
  stump:      { w: 22, h: 18, tw: 1, th: 1, solid: true, variants: 2, paint: paintStump },
  reeds:      { w: 20, h: 24, tw: 1, th: 1, solid: false, variants: 3, paint: paintReeds },
  mushroom:   { w: 14, h: 14, tw: 1, th: 1, solid: false, variants: 3, paint: paintMushroom },
  rock:       { w: 20, h: 18, tw: 1, th: 1, solid: true, variants: 3, paint: (b, v) => paintRock(b, v, false) },
  boulder:    { w: 34, h: 30, tw: 2, th: 1, solid: true, variants: 3, paint: (b, v) => paintRock(b, v, true) },
  fence:      { w: 16, h: 18, tw: 1, th: 1, solid: true, variants: 1, paint: (b, v) => paintFence(b, v, false) },
  fenceV:     { w: 16, h: 18, tw: 1, th: 1, solid: true, variants: 1, paint: (b, v) => paintFence(b, v, true) },
  signpost:   { w: 24, h: 26, tw: 1, th: 1, solid: true, variants: 1, paint: paintSignpost },
  lamppost:   { w: 16, h: 34, tw: 1, th: 1, solid: true, variants: 1, paint: paintLamppost, light: true },
  well:       { w: 40, h: 44, tw: 2, th: 1, solid: true, variants: 1, paint: paintWell },
  bench:      { w: 32, h: 20, tw: 2, th: 1, solid: true, variants: 1, paint: paintBench },
  barrel:     { w: 16, h: 20, tw: 1, th: 1, solid: true, variants: 1, paint: paintBarrel },
  crate:      { w: 18, h: 18, tw: 1, th: 1, solid: true, variants: 1, paint: paintCrate },
  haystack:   { w: 32, h: 26, tw: 2, th: 1, solid: true, variants: 2, paint: paintHaystack },
  mailbox:    { w: 18, h: 26, tw: 1, th: 1, solid: true, variants: 1, paint: paintMailbox },
  planter:    { w: 20, h: 26, tw: 1, th: 1, solid: true, variants: 3, paint: paintPlanter },
  dock:       { w: 32, h: 20, tw: 2, th: 1, solid: false, variants: 1, paint: paintDock },
  stairs:     { w: 16, h: 16, tw: 1, th: 1, solid: false, variants: 3, paint: paintStairs },
  perch:      { w: 26, h: 34, tw: 1, th: 1, solid: true, variants: 1, paint: paintPerch },

  // interiors
  tableRound: { w: 28, h: 26, tw: 1, th: 1, solid: true, variants: 1, paint: (b, v) => paintTableRound(b, v, null) },
  tableCloth: { w: 28, h: 26, tw: 1, th: 1, solid: true, variants: 3, paint: (b, v) => paintTableRound(b, v, ['#d95f5f', '#5b8fd6', '#7fbe57'][v % 3]) },
  tableSq:    { w: 32, h: 26, tw: 2, th: 1, solid: true, variants: 1, paint: (b, v) => paintTableSquare(b, v, null) },
  tableSqCl:  { w: 32, h: 26, tw: 2, th: 1, solid: true, variants: 3, paint: (b, v) => paintTableSquare(b, v, ['#e6e0cf', '#c05a7a', '#6b9e8f'][v % 3]) },
  // Seating is deliberately walkable: customers have to be able to path onto a
  // chair to sit on it, and it keeps a crowded cafe from becoming a maze.
  chair:      { w: 16, h: 22, tw: 1, th: 1, solid: false, variants: 3, paint: (b, v) => paintChair(b, v, [P.wood, '#8a72d6', '#6b9e8f'][v % 3], 'down') },
  chairUp:    { w: 16, h: 22, tw: 1, th: 1, solid: false, variants: 3, paint: (b, v) => paintChair(b, v, [P.wood, '#8a72d6', '#6b9e8f'][v % 3], 'up') },
  stool:      { w: 16, h: 16, tw: 1, th: 1, solid: false, variants: 3, paint: (b, v) => paintStool(b, v, ['#b6524f', '#5b8fd6', '#eec453'][v % 3]) },
  sofa:       { w: 48, h: 26, tw: 3, th: 1, solid: false, variants: 3, paint: (b, v) => paintSofa(b, v, ['#8a72d6', '#6b9e8f', '#c05a7a'][v % 3]) },
  // patio
  patioChair: { w: 16, h: 22, tw: 1, th: 1, solid: false, variants: 3, paint: (b, v) => paintPatioChair(b, v, ['#6f8f7a', '#c8c2b4', '#5b8fd6'][v % 3]) },
  patioStool: { w: 16, h: 16, tw: 1, th: 1, solid: false, variants: 3, paint: (b, v) => paintPatioStool(b, v, ['#6f8f7a', '#c8c2b4', '#d95f5f'][v % 3]) },
  patioTable: { w: 28, h: 28, tw: 1, th: 1, solid: true, variants: 3, paint: (b, v) => paintPatioTable(b, v, ['#8f9a8a', '#c8c2b4', '#7d8794'][v % 3]) },
  patioBench: { w: 48, h: 26, tw: 3, th: 1, solid: false, variants: 3, paint: (b, v) => paintPatioBench(b, v, ['#6f8f7a', '#c8c2b4', '#8a7258'][v % 3]) },
  umbrella:   { w: 48, h: 60, tw: 2, th: 2, solid: true, variants: 4, paint: (b, v) => paintUmbrellaTable(b, v, ['#d95f5f', '#5b8fd6', '#7fbe57', '#eec453'][v % 4]) },
  fountain:   { w: 48, h: 48, tw: 2, th: 2, solid: true, variants: 1, paint: paintFountain },

  // Three frames: upright, leaning left, leaning right. The ring picks one.
  phone:      { w: 18, h: 22, tw: 1, th: 1, solid: true, variants: 3, paint: paintPhone },

  counter:    { w: 32, h: 24, tw: 2, th: 1, solid: true, variants: 1, paint: paintCounterUnit },
  bar:        { w: 48, h: 34, tw: 3, th: 1, solid: true, variants: 1, paint: paintBar },
  barStool:   { w: 16, h: 22, tw: 1, th: 1, solid: false, variants: 3, paint: paintBarStool },
  pastryCase: { w: 32, h: 30, tw: 2, th: 1, solid: true, variants: 1, paint: paintPastryCase },
  register:   { w: 16, h: 20, tw: 1, th: 1, solid: true, variants: 1, paint: paintRegister },
  coffeeMachine: { w: 20, h: 24, tw: 1, th: 1, solid: true, variants: 1, paint: paintCoffeeMachine },
  shelf:      { w: 32, h: 32, tw: 2, th: 1, solid: true, variants: 2, paint: (b, v) => paintShelf(b, v, 'goods') },
  shelfFood:  { w: 32, h: 32, tw: 2, th: 1, solid: true, variants: 2, paint: (b, v) => paintShelf(b, v, 'food') },
  bookshelf:  { w: 32, h: 32, tw: 2, th: 1, solid: true, variants: 2, paint: paintBookshelf },
  plantPot:   { w: 20, h: 30, tw: 1, th: 1, solid: true, variants: 3, paint: paintPlantPot },
  catTower:   { w: 26, h: 42, tw: 1, th: 1, solid: true, variants: 3, paint: paintCatTower },
  catBed:     { w: 22, h: 14, tw: 1, th: 1, solid: false, variants: 3, paint: paintCatBed },
  catBowl:    { w: 14, h: 10, tw: 1, th: 1, solid: false, variants: 1, paint: (b, v) => paintCatBowl(b, v, true) },
  catBowlEmpty: { w: 14, h: 10, tw: 1, th: 1, solid: false, variants: 1, paint: (b, v) => paintCatBowl(b, v, false) },
  scratchPost:{ w: 18, h: 24, tw: 1, th: 1, solid: true, variants: 1, paint: paintScratchPost },
  toyBall:    { w: 12, h: 10, tw: 1, th: 1, solid: false, variants: 1, paint: (b, v) => paintToy(b, v, 'ball') },
  toyYarn:    { w: 12, h: 10, tw: 1, th: 1, solid: false, variants: 1, paint: (b, v) => paintToy(b, v, 'yarn') },
  toyWand:    { w: 14, h: 22, tw: 1, th: 1, solid: false, variants: 1, paint: (b, v) => paintToy(b, v, 'wand') },
  fireplace:  { w: 44, h: 38, tw: 3, th: 1, solid: true, variants: 1, paint: paintFireplace, light: true },
  painting:   { w: 24, h: 20, tw: 1, th: 1, solid: true, variants: 3, paint: paintPainting, wall: true },
  windowIn:   { w: 24, h: 22, tw: 1, th: 1, solid: true, variants: 1, paint: paintWindowIn, wall: true },
  piano:      { w: 48, h: 30, tw: 3, th: 1, solid: true, variants: 1, paint: paintPiano },
  lampIn:     { w: 18, h: 28, tw: 1, th: 1, solid: true, variants: 1, paint: paintLampIn, light: true },
  doormat:    { w: 24, h: 12, tw: 1, th: 1, solid: false, variants: 1, paint: paintDoorMat },
  // Flat by declaration rather than at every call site: a rug is put down by
  // the furniture loop, which has no idea which pieces belong on the floor.

  rug:        { w: 32, h: 32, tw: 2, th: 2, solid: false, flat: true, variants: 3, paint: paintRugMat },
  menuBoard:  { w: 22, h: 28, tw: 1, th: 1, solid: true, variants: 1, paint: paintMenuBoard },
};

/**
 * The colours each variant of a piece is painted in, so the shop can offer a
 * real choice and show a swatch. Keys are object types; anything missing here
 * has variants that differ in shape rather than colour, and isn't offered.
 */
export const VARIANT_SWATCHES = {
  chair: [P.wood, '#8a72d6', '#6b9e8f'],
  rug: [P.rug, '#6a5a8f', '#c8ba92'],
  patioChair: ['#6f8f7a', '#c8c2b4', '#5b8fd6'],
  patioStool: ['#6f8f7a', '#c8c2b4', '#d95f5f'],
  patioTable: ['#8f9a8a', '#c8c2b4', '#7d8794'],
  patioBench: ['#6f8f7a', '#c8c2b4', '#8a7258'],
  umbrella: ['#d95f5f', '#5b8fd6', '#7fbe57', '#eec453'],
  chairUp: [P.wood, '#8a72d6', '#6b9e8f'],
  stool: ['#b6524f', '#5b8fd6', '#eec453'],
  barStool: ['#c9863f', '#b6524f', '#5b8fd6'],
  sofa: ['#8a72d6', '#6b9e8f', '#c05a7a'],
  tableCloth: ['#d95f5f', '#5b8fd6', '#7fbe57'],
  tableSqCl: ['#e6e0cf', '#c05a7a', '#6b9e8f'],
  catTower: ['#b6524f', '#6b9e8f', '#8a72d6'],
  catBed: ['#d472b0', '#5b8fd6', '#7fbe57'],
};

export const VARIANT_NAMES = {
  chair: ['Oak', 'Violet', 'Sage'],
  patioChair: ['Sage', 'Chalk', 'Blue'],
  patioStool: ['Sage', 'Chalk', 'Rust'],
  patioTable: ['Slate', 'Chalk', 'Grey'],
  patioBench: ['Sage', 'Chalk', 'Teak'],
  umbrella: ['Rust', 'Blue', 'Leaf', 'Butter'],
  chairUp: ['Oak', 'Violet', 'Sage'],
  stool: ['Rust', 'Blue', 'Butter'],
  barStool: ['Tan', 'Rust', 'Blue'],
  sofa: ['Violet', 'Sage', 'Rose'],
  tableCloth: ['Red check', 'Blue check', 'Green check'],
  tableSqCl: ['Cream', 'Rose', 'Sage'],
  catTower: ['Rust', 'Sage', 'Violet'],
  catBed: ['Pink', 'Blue', 'Green'],
};

/** How many colourways a placeable type offers (1 = no choice). */
export function variantCount(type) {
  const sw = VARIANT_SWATCHES[type];
  return sw ? sw.length : 1;
}

const cache = new SpriteCache();

/** Get the baked sprite for an object type + variant. */
export function objSprite(type, variant = 0) {
  const def = OBJECTS[type];
  if (!def) return null;
  const v = variant % (def.variants || 1);
  return cache.get(`o|${type}|${v}`, () => {
    const buf = new PixBuf(def.w, def.h);
    def.paint(buf, v);
    return buf.toCanvas();
  });
}

/** Buildings are parameterised rather than enumerated, so they cache by config. */
export function buildingSprite(cfg) {
  // The board's colour is part of the picture, so it belongs in the key: two
  // shops sharing a glyph but not a paint pot must not share a sprite.
  const signBg = cfg.signBg || SIGN_BG[cfg.signKey] || P.plaster;
  const key = `b|${cfg.tw}|${cfg.wall}|${cfg.roof}|${cfg.roofStyle}|${cfg.timbered ? 1 : 0}|${cfg.wallH}|${cfg.roofH}|${cfg.signKey || ''}|${signBg}|${cfg.awning || ''}|${cfg.v || 0}|${cfg.windows ?? 2}|${cfg.storeys || 1}|${cfg.lit ? 1 : 0}`;
  return cache.get(key, () => {
    const w = cfg.tw * TILE + 16;
    const h = (cfg.wallH || 26) + (cfg.roofH || 22) + 16;
    const buf = new PixBuf(w, h);
    paintBuilding(buf, {
      ...cfg,
      sign: cfg.signKey ? { icon: SIGN_ICONS[cfg.signKey], bg: signBg, side: cfg.signSide || 0 } : null,
    });
    return buf.toCanvas();
  });
}

export function objectDef(type) { return OBJECTS[type]; }
