// Sprite baking. Art in this game is authored two ways:
//
//   1. String art  - arrays of strings where each character indexes a palette.
//                    Used where exact pixel placement matters (characters, items).
//   2. Painters    - functions that draw into a tiny pixel buffer.
//                    Used where variety matters more than exact placement
//                    (terrain tiles, trees, buildings, furniture).
//
// Both end up as canvases we can blit. Nothing is loaded from disk, so the game
// has no binary assets and starts instantly.

/** Create an offscreen canvas + 2d context with smoothing off. */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { canvas: c, g, w: c.width, h: c.height };
}

/**
 * A tiny indexed pixel buffer. Painters poke at `.px` then `.toCanvas()`.
 * Colors are '#rrggbb' strings; null / '.' means transparent.
 */
export class PixBuf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h); // 0xAABBGGRR (little-endian RGBA)
  }

  static rgba(hex, alpha = 255) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return ((alpha & 255) << 24) | (b << 16) | (g << 8) | r;
  }

  set(x, y, packed) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = packed;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }

  /** Alpha-blend `packed` over the existing pixel. */
  blend(x, y, packed) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const a = (packed >>> 24) & 255;
    if (a === 0) return;
    if (a === 255) { this.data[y * this.w + x] = packed; return; }
    const i = y * this.w + x;
    const dst = this.data[i];
    const da = (dst >>> 24) & 255;
    const t = a / 255;
    const mix = (sh) => Math.round((((packed >>> sh) & 255) * t) + (((dst >>> sh) & 255) * (1 - t)));
    this.data[i] = (Math.max(a, da) << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0);
  }

  fill(packed) { this.data.fill(packed); }

  rect(x, y, w, h, packed) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, packed);
  }

  rectBlend(x, y, w, h, packed) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.blend(x + i, y + j, packed);
  }

  /** Outlined rectangle (1px). */
  frame(x, y, w, h, packed) {
    for (let i = 0; i < w; i++) { this.set(x + i, y, packed); this.set(x + i, y + h - 1, packed); }
    for (let j = 0; j < h; j++) { this.set(x, y + j, packed); this.set(x + w - 1, y + j, packed); }
  }

  hline(x, y, w, packed) { for (let i = 0; i < w; i++) this.set(x + i, y, packed); }
  vline(x, y, h, packed) { for (let j = 0; j < h; j++) this.set(x, y + j, packed); }

  /** Filled ellipse — the workhorse for foliage blobs and rounded furniture. */
  ellipse(cx, cy, rx, ry, packed) {
    if (rx <= 0 || ry <= 0) return;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) this.set(x, y, packed);
      }
    }
  }

  ellipseBlend(cx, cy, rx, ry, packed) {
    if (rx <= 0 || ry <= 0) return;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) this.blend(x, y, packed);
      }
    }
  }

  /**
   * Line via Bresenham, for fence rails and roof ridges.
   * Endpoints are rounded on the way in: the walk steps by whole pixels, so
   * fractional endpoints would never compare equal and the loop would never end.
   */
  line(x0, y0, x1, y1, packed) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const limit = dx - dy + 2;
    for (let guard = 0; guard <= limit; guard++) {
      this.set(x0, y0, packed);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Replace every non-transparent pixel's color (used for silhouettes/flashes). */
  recolorAll(packed) {
    for (let i = 0; i < this.data.length; i++) if (this.data[i] >>> 24) this.data[i] = packed;
  }

  toCanvas() {
    const { canvas, g } = makeCanvas(this.w, this.h);
    const img = new ImageData(new Uint8ClampedArray(this.data.buffer.slice(0)), this.w, this.h);
    g.putImageData(img, 0, 0);
    return canvas;
  }
}

/**
 * Bake string art into a canvas.
 * `rows` is an array of equal-length strings; `pal` maps char -> '#rrggbb'.
 * '.' and ' ' are always transparent.
 */
export function bakeArt(rows, pal) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const buf = new PixBuf(w, h);
  const cache = new Map();
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const hex = pal[ch];
      if (!hex) continue;
      let packed = cache.get(hex);
      if (packed === undefined) { packed = PixBuf.rgba(hex); cache.set(hex, packed); }
      buf.set(x, y, packed);
    }
  }
  return buf.toCanvas();
}

/** Bake string art but return the PixBuf so callers can composite further. */
export function artBuf(rows, pal) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const buf = new PixBuf(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const hex = pal[ch];
      if (hex) buf.set(x, y, PixBuf.rgba(hex));
    }
  }
  return buf;
}

/** Draw one PixBuf onto another at an offset, alpha-blended. */
export function stamp(dst, src, ox, oy) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const p = src.data[y * src.w + x];
      if (p >>> 24) dst.blend(ox + x, oy + y, p);
    }
  }
}

/**
 * Memoised sprite factory. Art is generated once on first request and reused;
 * keys let us bake e.g. the same cat body in twelve different coat palettes.
 */
export class SpriteCache {
  constructor() { this.map = new Map(); }
  get(key, build) {
    let v = this.map.get(key);
    if (v === undefined) { v = build(); this.map.set(key, v); }
    return v;
  }
  has(key) { return this.map.has(key); }
  clear() { this.map.clear(); }
}

export const sprites = new SpriteCache();

/** Darken/lighten a hex color by `amt` (-1..1). Used to derive shades. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  } else {
    const k = 1 + amt;
    r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
  }
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** Blend two hex colors. */
export function mixHex(a, b, t) {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const r = Math.round(((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t);
  const g = Math.round(((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t);
  const bl = Math.round((na & 255) * (1 - t) + (nb & 255) * t);
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}
