// Generates the PWA / home-screen icons.
//
//   node tools/make-icons.js
//
// Writes icons/icon-192.png, icons/icon-512.png and icons/apple-touch-icon.png.
//
// The cat is not drawn here: it is the game's own sprite, pulled straight out of
// the art module and blown up with square pixels, so the face on the home screen
// is the face you play as rather than a second cat drawn to look like it. The
// art code is plain JS until the moment it touches a canvas, which is why this
// can run in node. Only the PNG encoder below is icon-specific — a manifest
// can't point at a canvas.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { charBuf } from '../src/art/chars.js';
import { iconBuf } from '../src/art/icons.js';

const ROOT = new URL('..', import.meta.url).pathname;

// ---- minimal PNG encoder ---------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of w*h*4 */
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                       // filter: none
    rgba.copy
      ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
      : Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 6;     // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- the icon --------------------------------------------------------------

// The design is laid out on a coarse grid and every square is a whole block of
// pixels, so the result reads as pixel art at any size instead of as a smooth
// drawing that happens to be small.
const GRID = 24;
const HEAD_ROWS = 12;          // rows 0..11 of the character sprite: ears to chin
const SKY = '#8fd3f0';
const SKY_LO = '#a8dff3';
const GRASS = '#5da845';
const GRASS_LO = '#4b8f39';

/** The player cat's face and a cup of coffee, both taken from the game. */
function drawIcon(S) {
  const px = Buffer.alloc(S * S * 4);
  const edge = (i) => Math.round((i * S) / GRID);

  /** Fill one grid square. Edges are shared, so blocks tile with no seams. */
  const block = (gx, gy, r, g, b) => {
    const x0 = edge(gx), x1 = edge(gx + 1);
    const y0 = edge(gy), y1 = edge(gy + 1);
    for (let y = Math.max(0, y0); y < Math.min(S, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(S, x1); x++) {
        const i = (y * S + x) * 4;
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
      }
    }
  };
  const hexBlock = (gx, gy, hex) => {
    const n = parseInt(hex.slice(1), 16);
    block(gx, gy, (n >> 16) & 255, (n >> 8) & 255, n & 255);
  };

  /** Stamp a PixBuf onto the grid, skipping transparent pixels. */
  const stamp = (buf, ox, oy, rows = buf.h) => {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < buf.w; x++) {
        const p = buf.get(x, y);
        if (!((p >>> 24) & 255)) continue;
        block(ox + x, oy + y, p & 255, (p >>> 8) & 255, (p >>> 16) & 255);
      }
    }
  };

  // Sky over meadow, with one lighter band in each so it isn't flat. Full
  // bleed: iOS rounds the corners itself, and a maskable icon wants no gaps.
  const HORIZON = 17;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const below = gy >= HORIZON;
      hexBlock(gx, gy, below ? (gy === HORIZON ? GRASS : GRASS_LO) : (gy < 3 ? SKY_LO : SKY));
    }
  }

  // The cat: the game's own sprite, ears to chin, standing on the horizon.
  const head = charBuf('cat', 'ginger', '#5b8fd6', 'down', 0);
  stamp(head, Math.round((GRID - head.w) / 2), HORIZON - HEAD_ROWS + 1, HEAD_ROWS);

  // And a coffee, because it is a cafe. Drawn here rather than borrowed: the
  // game's mug icon is sized to fill an item slot and at this scale it would
  // sit in front of the cat like a wardrobe.
  // No steam: at this size two white blocks above the rim read as a second
  // pair of ears rather than as anything rising.
  const CUP = [
    'RRRRR.',
    'CCCCCh',
    'MMMMMh',
    'DDDDD.',
  ];
  const CUP_COLS = {
    R: '#fdf6e6', C: '#6b432a', M: '#f3e3c6', D: '#b9a888', h: '#f3e3c6',
  };
  CUP.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = CUP_COLS[row[x]];
      if (col) hexBlock(GRID - row.length - 1 + x, GRID - CUP.length - 1 + y, col);
    }
  });

  return px;
}

const sizes = [
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/apple-touch-icon.png', 180],
];

mkdirSync(`${ROOT}icons`, { recursive: true });
for (const [name, size] of sizes) {
  const png = encodePng(size, size, drawIcon(size));
  writeFileSync(`${ROOT}${name}`, png);
  console.log(`${name}  ${size}x${size}  ${png.length} bytes`);
}
