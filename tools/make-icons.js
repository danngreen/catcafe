// Generates the PWA / home-screen icons. Like everything else in this project
// the art is drawn in code — this just needs a PNG encoder, since a manifest
// can't point at a canvas.
//
//   node tools/make-icons.js
//
// Writes icons/icon-192.png, icons/icon-512.png and icons/apple-touch-icon.png.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

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

/** A ginger cat face on a warm background, drawn at any size. */
function drawIcon(S) {
  const px = Buffer.alloc(S * S * 4);
  const put = (x, y, hex, a = 255) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const n = parseInt(hex.slice(1), 16);
    const i = (y * S + x) * 4;
    const t = a / 255;
    px[i] = Math.round(((n >> 16) & 255) * t + px[i] * (1 - t));
    px[i + 1] = Math.round(((n >> 8) & 255) * t + px[i + 1] * (1 - t));
    px[i + 2] = Math.round((n & 255) * t + px[i + 2] * (1 - t));
    px[i + 3] = 255;
  };
  const disc = (cx, cy, rx, ry, hex) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) put(x, y, hex);
      }
    }
  };
  const rect = (x, y, w, h, hex) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, hex);
  };

  // Background: a soft vertical wash, sky into meadow.
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const hex = t < 0.62 ? '#8fd3f0' : '#5da845';
    rect(0, y, S, 1, hex);
  }
  // Rounded corners knocked out to transparent.
  const r = S * 0.22;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = x < r ? r : x > S - r ? S - r : x;
      const cy = y < r ? r : y > S - r ? S - r : y;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) px[(y * S + x) * 4 + 3] = 0;
    }
  }

  const u = S / 32;                                  // one "pixel" of the design
  const cx = S / 2, cy = S * 0.54;
  // Ears.
  for (const s of [-1, 1]) {
    const ex = cx + s * 8.2 * u;
    for (let i = 0; i < 6 * u; i++) {
      const wdt = Math.max(1, Math.round(5 * u - i * 0.8));
      rect(Math.round(ex - wdt / 2), Math.round(cy - 10 * u + i), wdt, 1, '#e08a4a');
    }
    disc(ex, cy - 7.6 * u, 1.5 * u, 1.9 * u, '#e8a9a0');
  }
  // Head.
  disc(cx, cy, 10 * u, 9.2 * u, '#e08a4a');
  disc(cx - 2.4 * u, cy - 2.6 * u, 5.4 * u, 4.4 * u, '#efa063');
  // Eyes.
  for (const s of [-1, 1]) {
    disc(cx + s * 4.2 * u, cy - 0.8 * u, 1.5 * u, 2.1 * u, '#2f2a3d');
    disc(cx + s * 4.2 * u - 0.5 * u, cy - 1.6 * u, 0.6 * u, 0.7 * u, '#ffffff');
  }
  // Muzzle, nose, mouth.
  disc(cx, cy + 4 * u, 5.4 * u, 3.4 * u, '#f7ecd8');
  disc(cx, cy + 2.6 * u, 1.3 * u, 1 * u, '#d9737e');
  rect(Math.round(cx - 0.5 * u), Math.round(cy + 3.2 * u), Math.max(1, Math.round(u)), Math.round(1.6 * u), '#b95c66');
  // Whiskers.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      rect(Math.round(cx + s * 6 * u - (s < 0 ? 4 * u : 0)),
        Math.round(cy + 3 * u + k * 2 * u), Math.round(4 * u), Math.max(1, Math.round(u * 0.6)), '#fdf6e6');
    }
  }
  // A steaming cup at the bottom corner, because it is a cafe.
  const bx = S * 0.72, by = S * 0.83;
  rect(Math.round(bx - 4 * u), Math.round(by - 3 * u), Math.round(8 * u), Math.round(6 * u), '#fdf6e6');
  rect(Math.round(bx - 3 * u), Math.round(by - 2 * u), Math.round(6 * u), Math.round(2 * u), '#6b432a');
  rect(Math.round(bx + 4 * u), Math.round(by - 2 * u), Math.round(1.6 * u), Math.round(2.4 * u), '#fdf6e6');
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
