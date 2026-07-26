// 16x16 item icons for menus, shop lists and the inventory.

import { PixBuf, SpriteCache, shade } from '../engine/pixel.js';
import { P } from './palette.js';

const rgb = (hex, a = 255) => PixBuf.rgba(hex, a);

function outline(buf, color = '#2b2333') {
  const c = rgb(color);
  const src = new Uint32Array(buf.data);
  const at = (x, y) => (x < 0 || y < 0 || x >= buf.w || y >= buf.h ? 0 : src[y * buf.w + x]);
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) {
    if (at(x, y) >>> 24) continue;
    if ((at(x - 1, y) >>> 24) || (at(x + 1, y) >>> 24) || (at(x, y - 1) >>> 24) || (at(x, y + 1) >>> 24)) buf.set(x, y, c);
  }
}

/** Mug with an optional liquid colour and steam. */
function mug(b, liquid, mugCol = P.cream, steam = true) {
  b.rect(3, 6, 8, 8, rgb(mugCol));
  b.rect(3, 6, 8, 2, rgb(shade(mugCol, 0.2)));
  b.rect(11, 8, 2, 4, rgb(mugCol));
  b.set(12, 9, rgb(shade(mugCol, -0.2)));
  b.rect(4, 7, 6, 3, rgb(liquid));
  b.rect(4, 7, 6, 1, rgb(shade(liquid, 0.25)));
  b.rect(3, 13, 8, 1, rgb(shade(mugCol, -0.25)));
  if (steam) { b.set(5, 3, rgb('#ffffff')); b.set(6, 2, rgb('#ffffff')); b.set(8, 3, rgb('#ffffff')); b.set(9, 1, rgb('#ffffff')); }
}

function glass(b, liquid) {
  b.rect(4, 4, 8, 10, rgb(P.glass, 190));
  b.rect(5, 6, 6, 7, rgb(liquid));
  b.rect(5, 6, 6, 1, rgb(shade(liquid, 0.3)));
  b.rect(4, 3, 8, 1, rgb(P.glassLt));
  b.set(5, 5, rgb('#ffffff'));
}

function plateWith(b, fn) {
  b.ellipse(8, 12, 6.4, 2.4, rgb('#f0ece0'));
  b.ellipse(8, 11.4, 5, 1.7, rgb('#ffffff'));
  fn();
}

export const ICONS = {
  // ---- drinks ----
  coffee: (b) => mug(b, P.coffee),
  latte: (b) => { mug(b, '#c99a68'); b.ellipse(7, 8, 2, 1.2, rgb('#f3e3c6')); },
  espresso: (b) => { b.rect(5, 8, 6, 5, rgb(P.cream)); b.rect(6, 9, 4, 2, rgb('#3f2416')); b.rect(11, 9, 2, 2, rgb(P.cream)); b.rect(4, 13, 8, 1, rgb('#d9cfba')); b.set(7, 5, rgb('#ffffff')); b.set(9, 4, rgb('#ffffff')); },
  tea: (b) => { mug(b, '#c08a3f'); b.rect(9, 4, 3, 3, rgb('#f6eed8')); b.line(9, 7, 8, 9, rgb('#c9c2b0')); },
  herbal: (b) => { mug(b, '#d4b45a'); b.ellipse(6, 4, 2, 1.4, rgb('#7fbe57')); },
  matcha: (b) => mug(b, P.matcha),
  cocoa: (b) => { mug(b, '#5c3a26'); b.ellipse(7, 7, 1.6, 1, rgb('#f6f0e0')); b.ellipse(9, 8, 1.2, 0.9, rgb('#f6f0e0')); },
  lemonade: (b) => { glass(b, '#f5d84a'); b.ellipse(11, 4, 2, 1.6, rgb('#ffe97a')); },
  milk: (b) => { b.rect(4, 3, 8, 11, rgb('#f8f4ea')); b.rect(4, 3, 8, 3, rgb('#5b8fd6')); b.rect(6, 7, 4, 4, rgb('#dfeaf6')); b.set(7, 8, rgb('#5b8fd6')); },
  water: (b) => glass(b, '#9fd6ee'),
  cider: (b) => glass(b, '#e0894a'),

  // ---- food ----
  cake: (b) => plateWith(b, () => {
    b.rect(4, 6, 8, 5, rgb(P.cake));
    b.rect(4, 8, 8, 1, rgb('#e0894a'));
    b.rect(4, 5, 8, 1, rgb('#fff0d0'));
    b.ellipse(8, 4, 1.8, 1.6, rgb(P.strawberry));
  }),
  cookie: (b) => { b.ellipse(8, 9, 5.4, 5, rgb('#dda661')); b.ellipse(8, 8, 4.6, 4, rgb('#e8b872')); for (const [x, y] of [[6, 7], [10, 8], [8, 11], [7, 10]]) b.ellipse(x, y, 1.1, 1.0, rgb('#5c3a26')); },
  croissant: (b) => { b.ellipse(8, 9, 5.6, 3.2, rgb('#e0a45c')); b.ellipse(8, 8, 4.4, 2.2, rgb('#f0c184')); b.ellipse(3.5, 10, 1.6, 1.4, rgb('#c9863f')); b.ellipse(12.5, 10, 1.6, 1.4, rgb('#c9863f')); },
  sandwich: (b) => { b.rect(3, 6, 10, 2, rgb('#e8c58a')); b.rect(3, 8, 10, 2, rgb('#7fbe57')); b.rect(3, 10, 10, 2, rgb('#e0894a')); b.rect(3, 12, 10, 2, rgb('#e8c58a')); },
  scone: (b) => plateWith(b, () => { b.ellipse(8, 8, 5, 3.4, rgb('#e6c48c')); b.ellipse(8, 7, 4.2, 2.4, rgb('#f2d9a8')); b.ellipse(6, 7, 1, 0.9, rgb('#a3703f')); b.ellipse(10, 8, 1, 0.9, rgb('#a3703f')); }),
  pie: (b) => plateWith(b, () => { b.ellipse(8, 8, 6, 3.6, rgb('#e0a45c')); b.ellipse(8, 7.4, 4.8, 2.6, rgb('#e8546b')); for (let i = 0; i < 3; i++) b.line(4 + i * 3, 5, 7 + i * 3, 10, rgb('#f0c184')); }),
  muffin: (b) => { b.rect(4, 8, 8, 6, rgb('#d9a05a')); for (let x = 4; x < 12; x += 2) b.vline(x, 8, 6, rgb('#c08a45')); b.ellipse(8, 7, 5, 3.4, rgb('#a3703f')); b.ellipse(7, 6, 1.2, 1, rgb('#5c3a26')); b.ellipse(10, 7, 1, 0.9, rgb('#5c3a26')); },
  parfait: (b) => { b.rect(5, 4, 6, 10, rgb(P.glass, 200)); b.rect(6, 6, 4, 2, rgb('#e8546b')); b.rect(6, 8, 4, 2, rgb('#f6f0e0')); b.rect(6, 10, 4, 3, rgb('#c9863f')); b.ellipse(8, 4, 2.4, 1.6, rgb('#ffffff')); b.ellipse(8, 2.6, 1.2, 1.1, rgb(P.strawberry)); },
  pancakes: (b) => plateWith(b, () => { for (let i = 0; i < 3; i++) b.ellipse(8, 9 - i * 2, 5.2 - i * 0.2, 1.6, rgb('#e0a45c')); b.ellipse(8, 4.5, 2, 1.2, rgb('#f5c451')); }),
  fishcake: (b) => { b.ellipse(8, 9, 5.4, 4, rgb('#f2e4c8')); b.ellipse(8, 9, 3.4, 2.4, rgb('#f4a8b0')); b.ellipse(8, 9, 1.6, 1.2, rgb('#f2e4c8')); },
  toast: (b) => { b.rect(4, 5, 8, 9, rgb('#e8c58a')); b.ellipse(8, 5, 4, 2, rgb('#e8c58a')); b.rect(5, 6, 6, 6, rgb('#d9a05a')); b.rect(6, 7, 3, 3, rgb('#f5c451')); },

  // ---- cat supplies ----
  catfood: (b) => { b.rect(4, 6, 8, 8, rgb('#b0552f')); b.rect(4, 6, 8, 2, rgb('#c96a3f')); b.rect(5, 9, 6, 4, rgb('#f2e4c8')); b.ellipse(8, 11, 2, 1.4, rgb('#a3703f')); },
  catfoodPremium: (b) => { b.rect(4, 6, 8, 8, rgb('#5b8fd6')); b.rect(4, 6, 8, 2, rgb('#7fadea')); b.rect(5, 9, 6, 4, rgb('#f2e4c8')); b.ellipse(8, 11, 2, 1.4, rgb('#e08a4a')); b.set(11, 5, rgb(P.gold)); b.set(12, 6, rgb(P.gold)); },
  catfoodGourmet: (b) => { b.rect(4, 6, 8, 8, rgb('#8a72d6')); b.rect(4, 6, 8, 2, rgb('#a894e8')); b.rect(5, 9, 6, 4, rgb('#f2e4c8')); b.ellipse(8, 11, 2, 1.4, rgb('#e8546b')); for (const [x, y] of [[11, 4], [13, 6], [10, 6]]) { b.set(x, y, rgb('#ffffff')); b.set(x, y + 1, rgb(P.gold)); } },
  catnip: (b) => { b.ellipse(8, 10, 4.4, 4, rgb('#7fbe57')); for (let i = 0; i < 5; i++) { const a = -1.6 + i * 0.6; b.line(8, 10, Math.round(8 + Math.cos(a) * 6), Math.round(10 + Math.sin(a) * 6), rgb('#5c9c4a')); } b.rect(6, 12, 5, 3, rgb('#c9a06a')); },
  treats: (b) => { b.rect(4, 5, 8, 9, rgb('#f0c184')); b.frame(4, 5, 8, 9, rgb('#c9863f')); for (const [x, y] of [[6, 8], [9, 7], [7, 11]]) b.ellipse(x, y, 1.4, 1.2, rgb('#a3703f')); },
  medicine: (b) => { b.rect(5, 4, 6, 10, rgb('#f6f0e0')); b.rect(5, 4, 6, 3, rgb('#e8546b')); b.rect(6, 8, 4, 4, rgb('#8fd3a0')); b.rect(7, 9, 2, 2, rgb('#ffffff')); },
  vitamins: (b) => { b.ellipse(8, 9, 5, 5, rgb('#f5c451')); b.ellipse(8, 8, 3.6, 3.4, rgb('#ffe08a')); b.rect(6, 8, 5, 2, rgb('#e08a4a')); },
  brush: (b) => { b.rect(3, 5, 10, 4, rgb(P.uiPink)); b.rect(3, 5, 10, 1, rgb('#ffc0dd')); b.rect(3, 9, 10, 2, rgb(P.wood)); for (let x = 4; x < 13; x += 2) b.vline(x, 11, 3, rgb(P.woodDk)); },
  ribbon: (b) => { b.ellipse(5, 8, 2.6, 2.2, rgb('#e8546b')); b.ellipse(11, 8, 2.6, 2.2, rgb('#e8546b')); b.rect(7, 7, 2, 3, rgb('#c03f56')); b.line(8, 10, 6, 14, rgb('#e8546b')); b.line(8, 10, 10, 14, rgb('#e8546b')); },
  bell: (b) => { b.ellipse(8, 8, 4.4, 4.2, rgb(P.gold)); b.rect(3, 8, 10, 3, rgb(P.gold)); b.hline(3, 11, 10, rgb(P.goldDk)); b.ellipse(8, 12, 1.4, 1.4, rgb(P.goldDk)); b.rect(7, 2, 2, 2, rgb(P.metalDk)); },
  toyBall: (b) => { b.ellipse(8, 9, 5, 5, rgb('#e8546b')); b.ellipse(6, 7, 1.8, 1.6, rgb('#ff9aa8')); b.hline(3, 9, 10, rgb('#c03f56')); },
  toyYarn: (b) => { b.ellipse(8, 9, 5, 4.6, rgb('#8a72d6')); for (let i = 0; i < 5; i++) b.line(3, 6 + i, 13, 9 + i, rgb('#a894e8')); b.line(13, 11, 15, 14, rgb('#8a72d6')); },
  toyWand: (b) => { b.line(3, 14, 10, 5, rgb(P.woodDk)); b.ellipse(11, 4, 2.4, 2, rgb('#eec453')); for (let i = 0; i < 4; i++) b.line(11, 4, 13 + i, 1 + i, rgb('#f0d98a')); },

  // ---- furniture ----
  // Every piece gets its own silhouette; a shelf of identical brown squares
  // tells you nothing about what you're buying.
  chair: (b) => {
    b.rect(4, 1, 8, 7, rgb(P.wood)); b.rect(4, 1, 8, 2, rgb(P.woodLt));
    b.vline(7, 3, 5, rgb(P.woodDk));
    b.rect(3, 8, 10, 3, rgb(P.wood)); b.hline(3, 8, 10, rgb(P.woodLt));
    b.rect(4, 11, 2, 4, rgb(P.woodDk)); b.rect(10, 11, 2, 4, rgb(P.woodDk));
  },
  table: (b) => {
    b.ellipse(8, 6, 6.6, 3, rgb(P.wood));
    b.ellipse(8, 5, 5.6, 2.2, rgb(P.woodLt));
    b.rect(7, 8, 2, 5, rgb(P.woodDk));
    b.ellipse(8, 13, 4, 1.6, rgb(P.woodDk));
  },
  tableCloth: (b) => {
    b.ellipse(8, 6, 6.6, 3, rgb('#d95f5f'));
    b.ellipse(8, 5, 5.6, 2.2, rgb('#ec8080'));
    for (let x = 3; x < 14; x += 3) b.vline(x, 6, 3, rgb('#b84a4a'));
    b.rect(7, 9, 2, 4, rgb(P.woodDk));
    b.ellipse(8, 13, 4, 1.6, rgb(P.woodDk));
  },
  tableLong: (b) => {
    b.rect(1, 4, 14, 4, rgb(P.wood)); b.hline(1, 4, 14, rgb(P.woodLt));
    b.rect(3, 8, 2, 6, rgb(P.woodDk)); b.rect(11, 8, 2, 6, rgb(P.woodDk));
  },
  sofa: (b) => {
    b.rect(1, 4, 14, 8, rgb('#8a72d6'));
    b.rect(3, 6, 10, 5, rgb('#a08ce8'));
    b.rect(0, 5, 3, 8, rgb('#6f5ab8')); b.rect(13, 5, 3, 8, rgb('#6f5ab8'));
    b.rect(1, 3, 14, 2, rgb('#6f5ab8'));
    b.rect(2, 12, 2, 3, rgb(P.woodDk)); b.rect(12, 12, 2, 3, rgb(P.woodDk));
  },
  stool: (b) => {
    b.ellipse(8, 6, 5.4, 2.8, rgb('#b6524f'));
    b.ellipse(8, 5, 4.6, 2.1, rgb('#d1706c'));
    b.line(5, 8, 4, 14, rgb(P.woodDk)); b.line(11, 8, 12, 14, rgb(P.woodDk));
    b.vline(8, 8, 6, rgb(P.woodDk));
  },
  barstool: (b) => {
    b.ellipse(8, 3, 4.6, 2.2, rgb('#c9863f'));
    b.ellipse(8, 2, 3.8, 1.6, rgb('#e0a45c'));
    b.line(5, 5, 4, 15, rgb(P.metalDk)); b.line(11, 5, 12, 15, rgb(P.metalDk));
    b.vline(8, 5, 10, rgb(P.metal));
    b.hline(4, 11, 9, rgb(P.metal));   // foot ring
  },
  bar: (b) => {
    b.rect(0, 6, 16, 8, rgb(P.wood));
    b.rect(0, 4, 16, 3, rgb(P.woodLt));
    b.hline(0, 7, 16, rgb(P.woodDeep));
    for (let x = 2; x < 16; x += 5) b.vline(x, 8, 6, rgb(P.woodDk));
    // A couple of glasses on the top.
    b.rect(3, 1, 2, 4, rgb(P.glass)); b.rect(9, 1, 2, 4, rgb(P.glass));
    b.set(3, 1, rgb('#ffffff')); b.set(9, 1, rgb('#ffffff'));
  },
  plant: (b) => {
    b.rect(4, 10, 8, 5, rgb(P.terracotta));
    b.rect(3, 9, 10, 2, rgb(P.terracottaLt));
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.5;
      const ex = 8 + Math.cos(a) * 6, ey = 9 + Math.sin(a) * 7;
      b.line(8, 9, Math.round(ex), Math.round(ey), rgb('#4e9c40'));
      b.ellipse(ex, ey, 2, 1.7, rgb(i % 2 ? '#5fb04d' : '#3f8a3c'));
    }
  },
  floorlamp: (b) => {
    for (let i = 0; i < 5; i++) b.hline(5 - i, 2 + i, 6 + i * 2, rgb(i < 2 ? '#ffe9b8' : '#f0d18a'));
    b.vline(8, 7, 6, rgb(P.metalDk));
    b.rect(5, 13, 7, 2, rgb(P.metalDk));
  },
  painting: (b) => {
    b.rect(1, 3, 14, 11, rgb(P.gold));
    b.rect(3, 5, 10, 7, rgb('#7fb8d6'));
    b.rect(3, 9, 10, 3, rgb('#6aad4a'));
    b.ellipse(10, 8, 3, 2, rgb('#4e9c40'));
    b.ellipse(5, 7, 1.6, 1.6, rgb('#ffe9a0'));
  },
  bookshelf: (b) => {
    b.rect(2, 1, 12, 14, rgb(P.woodDk));
    for (let s = 0; s < 3; s++) {
      const y = 2 + s * 4;
      for (let i = 0; i < 4; i++) {
        b.rect(3 + i * 3, y, 2, 3, rgb(['#d95f5f', '#5b8fd6', '#7fbe57', '#eec453'][(i + s) % 4]));
      }
      b.hline(2, y + 3, 12, rgb(P.woodDeep));
    }
  },
  fireplace: (b) => {
    b.rect(1, 2, 14, 13, rgb(P.stone));
    for (let y = 2; y < 15; y += 3) for (let x = 1; x < 15; x += 5) b.rect(x + ((y / 3) % 2 ? 2 : 0), y, 4, 2, rgb(P.stoneLt));
    b.rect(4, 6, 8, 9, rgb('#2a2020'));
    b.ellipse(8, 13, 3.4, 2.2, rgb('#ff8a3a'));
    b.ellipse(8, 11.5, 2.2, 2.2, rgb('#ffc04a'));
    b.ellipse(8, 11, 1.1, 1.2, rgb('#fff0b0'));
  },
  piano: (b) => {
    b.rect(1, 2, 14, 10, rgb('#3a2f28'));
    b.rect(1, 2, 14, 3, rgb('#5b4a3c'));
    b.rect(2, 8, 12, 4, rgb('#f6f0e0'));
    for (let x = 3; x < 14; x += 2) b.vline(x, 8, 4, rgb('#2a2420'));
    b.rect(2, 12, 2, 3, rgb('#2a2420')); b.rect(12, 12, 2, 3, rgb('#2a2420'));
  },
  cattower: (b) => {
    b.rect(2, 12, 12, 3, rgb('#b6524f'));
    b.rect(6, 6, 4, 6, rgb(P.thatch));
    for (let y = 6; y < 12; y += 2) b.hline(6, y, 4, rgb(P.thatchDk));
    b.rect(3, 3, 10, 3, rgb('#b6524f'));
    b.ellipse(12, 9, 1.8, 1.8, rgb(P.uiPink));
  },
  catbed: (b) => {
    b.ellipse(8, 10, 6.5, 4, rgb('#d472b0'));
    b.ellipse(8, 9, 5, 2.8, rgb('#f0a0cc'));
    b.ellipse(8, 9, 3.6, 1.9, rgb(P.cream));
  },
  scratchpost: (b) => {
    b.rect(2, 12, 12, 3, rgb(P.wood));
    b.rect(6, 2, 4, 10, rgb(P.thatch));
    for (let y = 2; y < 12; y += 2) b.hline(6, y, 4, rgb(P.thatchDk));
    b.ellipse(8, 1, 2, 1.4, rgb(P.thatchLt));
  },
  catbowl: (b) => {
    b.ellipse(8, 9, 6, 3.4, rgb('#6b9e8f'));
    b.ellipse(8, 8, 4.6, 2.4, rgb('#4f7d70'));
    b.ellipse(8, 8, 3.4, 1.6, rgb('#a3703f'));
  },
  counterUnit: (b) => {
    b.rect(0, 5, 16, 9, rgb(P.wood));
    b.rect(0, 3, 16, 3, rgb(P.woodLt));
    for (let x = 3; x < 16; x += 5) b.vline(x, 6, 8, rgb(P.woodDk));
    b.hline(0, 13, 16, rgb(P.woodDeep));
  },
  rug: (b) => {
    b.rect(1, 4, 14, 9, rgb(P.rug));
    b.frame(1, 4, 14, 9, rgb(P.rugDk));
    b.frame(3, 6, 10, 5, rgb(P.rugLt));
    b.hline(0, 4, 1, rgb(P.rugDk));
  },

  // ---- world / quest items ----
  letter: (b) => { b.rect(2, 5, 12, 8, rgb(P.paper)); b.frame(2, 5, 12, 8, rgb('#c9c2b0')); b.line(2, 5, 8, 9, rgb('#c9c2b0')); b.line(14, 5, 8, 9, rgb('#c9c2b0')); b.ellipse(11, 11, 1.8, 1.6, rgb('#e8546b')); },
  key: (b) => { b.ellipse(5, 6, 3, 3, rgb(P.gold)); b.ellipse(5, 6, 1.4, 1.4, rgb(0 ? P.gold : P.uiBg)); b.rect(6, 8, 2, 6, rgb(P.gold)); b.rect(8, 11, 3, 2, rgb(P.gold)); b.rect(8, 13, 2, 1, rgb(P.gold)); },
  map: (b) => { b.rect(2, 4, 12, 9, rgb(P.paper)); b.frame(2, 4, 12, 9, rgb('#c9a06a')); b.line(4, 11, 7, 7, rgb('#7fbe57')); b.line(7, 7, 11, 9, rgb('#7fbe57')); b.set(11, 6, rgb('#e8546b')); b.set(12, 7, rgb('#e8546b')); b.set(10, 7, rgb('#e8546b')); b.set(11, 8, rgb('#e8546b')); },
  bouquet: (b) => { for (const [x, y, c] of [[5, 5, P.flowerR], [9, 4, P.flowerY], [7, 7, P.flowerP], [11, 7, P.flowerW]]) b.ellipse(x, y, 2, 1.8, rgb(c)); b.line(7, 8, 8, 14, rgb('#5c9c4a')); b.line(9, 7, 8, 14, rgb('#5c9c4a')); b.rect(6, 11, 5, 3, rgb('#c9a06a')); },
  shell: (b) => { b.ellipse(8, 10, 6, 5, rgb('#f2ddc8')); for (let i = -2; i <= 2; i++) b.line(8, 14, 8 + i * 2.6, 5, rgb('#dcc0a4')); b.ellipse(8, 13.5, 2, 1, rgb('#c9a48a')); },
  honey: (b) => { b.rect(4, 5, 8, 9, rgb('#f0b03a')); b.rect(4, 5, 8, 2, rgb(P.wood)); b.rect(5, 8, 6, 5, rgb('#f5c451')); b.ellipse(8, 10, 1.6, 1.4, rgb('#c9863f')); },
  wool: (b) => { b.ellipse(8, 9, 5.4, 4.6, rgb('#f0ece0')); for (let i = 0; i < 8; i++) { const a = i * 0.79; b.ellipse(8 + Math.cos(a) * 4, 9 + Math.sin(a) * 3.4, 1.8, 1.6, rgb('#fdfbf0')); } },
  fish: (b) => { b.ellipse(7, 9, 5, 3, rgb('#7fb8d6')); b.ellipse(7, 8, 4, 1.8, rgb('#a8d6ee')); b.line(12, 5, 12, 13, rgb('#5b8fd6')); b.line(15, 5, 12, 9, rgb('#5b8fd6')); b.line(15, 13, 12, 9, rgb('#5b8fd6')); b.set(4, 8, rgb('#2f2a3d')); },
  berry: (b) => { for (const [x, y] of [[6, 9], [10, 9], [8, 12]]) { b.ellipse(x, y, 2.4, 2.4, rgb(P.berry)); b.set(x - 1, y - 1, rgb('#f07a8f')); } b.line(8, 7, 8, 4, rgb('#5c9c4a')); b.ellipse(6, 4, 2, 1.2, rgb('#5c9c4a')); },
  acorn: (b) => { b.ellipse(8, 10, 4, 4.4, rgb('#c9863f')); b.ellipse(8, 6, 4.6, 2.6, rgb('#7d5430')); b.rect(7, 2, 2, 3, rgb('#7d5430')); b.ellipse(6.5, 9, 1.2, 1.4, rgb('#e0a45c')); },
  feather: (b) => { b.line(4, 14, 12, 3, rgb('#c9c2b0')); for (let i = 0; i < 8; i++) { const t = i / 8; b.line(Math.round(5 + t * 6), Math.round(13 - t * 9), Math.round(5 + t * 6) + 3, Math.round(13 - t * 9) - 1, rgb(i % 2 ? '#e6e0cf' : '#c9c2b0')); } },
  mushroom: (b) => { b.rect(6, 9, 4, 5, rgb(P.cream)); b.ellipse(8, 8, 5.4, 3.6, rgb(P.flowerR)); b.ellipse(6, 7, 1.4, 1, rgb('#ffffff')); b.ellipse(10, 8, 1.1, 0.9, rgb('#ffffff')); },
  lantern: (b) => { b.rect(5, 4, 6, 8, rgb(P.metalDk)); b.rect(6, 5, 4, 6, rgb('#ffe9a0')); b.rect(4, 12, 8, 2, rgb(P.metalDk)); b.rect(4, 3, 8, 1, rgb(P.metalDk)); b.line(6, 3, 8, 1, rgb(P.metalDk)); b.line(10, 3, 8, 1, rgb(P.metalDk)); },
  teapot: (b) => { b.ellipse(7, 9, 5, 4, rgb('#6b9e8f')); b.ellipse(7, 8, 4, 2.6, rgb('#87b8a8')); b.rect(11, 7, 4, 2, rgb('#6b9e8f')); b.rect(2, 8, 2, 3, rgb('#6b9e8f')); b.rect(6, 4, 3, 2, rgb('#4f7d70')); },
  grinder: (b) => { b.rect(4, 7, 8, 7, rgb(P.wood)); b.rect(4, 5, 8, 2, rgb(P.metalDk)); b.rect(7, 2, 2, 3, rgb(P.metalDk)); b.rect(9, 2, 3, 1, rgb(P.metalDk)); b.rect(5, 9, 6, 3, rgb(P.woodDk)); },
  blueprint: (b) => { b.rect(2, 4, 12, 9, rgb('#5b8fd6')); b.frame(2, 4, 12, 9, rgb('#3f6ba8')); b.frame(4, 6, 8, 5, rgb('#cfe4f8')); b.vline(8, 6, 5, rgb('#cfe4f8')); },
  permit: (b) => { b.rect(3, 3, 10, 11, rgb(P.paper)); b.frame(3, 3, 10, 11, rgb('#c9c2b0')); for (let i = 0; i < 4; i++) b.hline(5, 5 + i * 2, 7 - (i % 2) * 2, rgb('#a8a294')); b.ellipse(11, 12, 2, 1.8, rgb('#e8546b')); },
  hammer: (b) => { b.rect(7, 6, 3, 8, rgb(P.wood)); b.rect(3, 3, 10, 4, rgb(P.metal)); b.rect(3, 3, 10, 1, rgb('#e0e4ea')); b.rect(3, 6, 10, 1, rgb(P.metalDk)); },
  coin: (b) => { b.ellipse(8, 8, 5.6, 5.6, rgb(P.goldDk)); b.ellipse(8, 8, 4.6, 4.6, rgb(P.gold)); b.ellipse(8, 8, 2.6, 2.6, rgb(P.goldDk)); b.set(6, 6, rgb('#fff0b0')); },
  seed: (b) => { b.rect(4, 5, 8, 9, rgb('#c9a06a')); b.rect(4, 5, 8, 3, rgb('#e0c090')); for (const [x, y] of [[6, 10], [9, 9], [7, 12]]) b.ellipse(x, y, 1.2, 1.6, rgb('#7d5430')); },
  watering: (b) => { b.ellipse(7, 10, 4.6, 3.6, rgb('#6b9e8f')); b.rect(10, 7, 5, 2, rgb('#6b9e8f')); b.rect(13, 5, 3, 3, rgb('#87b8a8')); b.rect(4, 5, 4, 2, rgb('#4f7d70')); },
  book: (b) => { b.rect(3, 3, 10, 11, rgb('#5b8fd6')); b.rect(4, 4, 8, 9, rgb(P.paper)); b.vline(8, 3, 11, rgb('#3f6ba8')); for (let i = 0; i < 3; i++) { b.hline(5, 6 + i * 2, 3, rgb('#a8a294')); b.hline(9, 6 + i * 2, 3, rgb('#a8a294')); } },
  ticket: (b) => { b.rect(2, 5, 12, 7, rgb('#f5c451')); b.frame(2, 5, 12, 7, rgb('#c9963f')); b.ellipse(2, 8.5, 1.4, 1.6, rgb(P.uiBg)); b.ellipse(14, 8.5, 1.4, 1.6, rgb(P.uiBg)); b.hline(6, 8, 5, rgb('#8a6a2a')); },
  paw: (b) => { b.ellipse(8, 11, 4, 3.2, rgb(P.furBrown)); b.ellipse(4, 6, 1.8, 2.1, rgb(P.furBrown)); b.ellipse(7, 4.5, 1.8, 2.1, rgb(P.furBrown)); b.ellipse(10.5, 5, 1.8, 2.1, rgb(P.furBrown)); b.ellipse(13, 8, 1.6, 1.9, rgb(P.furBrown)); },
  heart: (b) => { b.ellipse(5.5, 6, 3, 3, rgb('#e8546b')); b.ellipse(10.5, 6, 3, 3, rgb('#e8546b')); for (let i = 0; i < 6; i++) b.hline(3 + i, 8 + i, 10 - i * 2, rgb('#e8546b')); b.ellipse(5, 5, 1.2, 1, rgb('#ff9aa8')); },
  star: (b) => { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * (Math.PI * 2 / 5); b.line(8, 8, Math.round(8 + Math.cos(a) * 6), Math.round(8 + Math.sin(a) * 6), rgb(P.gold)); } b.ellipse(8, 8, 2.6, 2.6, rgb('#ffe08a')); },
  clock: (b) => { b.ellipse(8, 8, 6, 6, rgb(P.metal)); b.ellipse(8, 8, 4.8, 4.8, rgb(P.paper)); b.line(8, 8, 8, 4, rgb('#2f2a3d')); b.line(8, 8, 11, 9, rgb('#2f2a3d')); },
  bag: (b) => { b.rect(3, 6, 10, 8, rgb('#a3703f')); b.rect(3, 6, 10, 2, rgb('#c9863f')); b.line(5, 6, 6, 3, rgb('#7d5430')); b.line(11, 6, 10, 3, rgb('#7d5430')); b.rect(7, 9, 3, 3, rgb('#7d5430')); },
};

const cache = new SpriteCache();

/** Raw pixels rather than a baked canvas — see `charBuf` for why. */
export function iconBuf(name) {
  const buf = new PixBuf(16, 16);
  const fn = ICONS[name] || ICONS.coin;
  fn(buf);
  outline(buf);
  return buf;
}

export function iconSprite(name) {
  return cache.get(`i|${name}`, () => iconBuf(name).toCanvas());
}

export const ICON_NAMES = Object.keys(ICONS);
