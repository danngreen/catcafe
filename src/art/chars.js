// Characters.
//
// Everyone in the valley is drawn from one chibi template — a big round head on
// a small body, two heads tall. Species differ in ears, muzzle and a few extras
// (antlers, wool, spikes, a beak), which is how twenty species and a fistful of
// fur palettes turn into sixty distinct villagers.
//
// The cats you keep in the cafe are ordinary four-legged cats, drawn separately.

import { PixBuf, SpriteCache, shade, mixHex } from '../engine/pixel.js';
import { P } from './palette.js';
import { hash2 } from '../engine/util.js';
import { iconSprite } from './icons.js';

export const CHAR_W = 16;
export const CHAR_H = 24;
export const CAT_W = 18;
export const CAT_H = 14;

const rgb = (hex, a = 255) => PixBuf.rgba(hex, a);
const OUTLINE = '#2b2333';

/** Wrap the opaque silhouette in a 1px dark outline. */
function outline(buf, color = OUTLINE) {
  const c = rgb(color);
  const src = new Uint32Array(buf.data);
  const at = (x, y) => (x < 0 || y < 0 || x >= buf.w || y >= buf.h ? 0 : src[y * buf.w + x]);
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (at(x, y) >>> 24) continue;
      if ((at(x - 1, y) >>> 24) || (at(x + 1, y) >>> 24) || (at(x, y - 1) >>> 24) || (at(x, y + 1) >>> 24)) {
        buf.set(x, y, c);
      }
    }
  }
}

/** Mirror a buffer horizontally — right-facing sprites reuse the left art. */
function mirror(buf) {
  const out = new PixBuf(buf.w, buf.h);
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) out.data[y * buf.w + (buf.w - 1 - x)] = buf.data[y * buf.w + x];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

export const SPECIES = {
  cat:      { ears: 'point',    muzzle: 'cat',   whiskers: true,  tail: 'cat' },
  dog:      { ears: 'floppy',   muzzle: 'dog',   tail: 'dog' },
  shiba:    { ears: 'perk',     muzzle: 'dog',   tail: 'curl' },
  corgi:    { ears: 'perk',     muzzle: 'dog',   stubby: true, tail: 'stub' },
  poodle:   { ears: 'floppy',   muzzle: 'dog',   fluff: true, tail: 'puff' },
  rabbit:   { ears: 'long',     muzzle: 'small', whiskers: true, tail: 'puff' },
  fox:      { ears: 'bigpoint', muzzle: 'fox',   tail: 'bushy' },
  songbird: { ears: 'none',     muzzle: 'beak',  crest: true, tail: 'feather' },
  raven:    { ears: 'none',     muzzle: 'beak',  tail: 'feather' },
  owl:      { ears: 'tuft',     muzzle: 'beak',  bigEyes: true, tail: 'feather' },
  seal:     { ears: 'none',     muzzle: 'blunt', whiskers: true, tail: 'none' },
  bear:     { ears: 'round',    muzzle: 'bear',  broad: true, tail: 'stub' },
  mouse:    { ears: 'biground', muzzle: 'small', whiskers: true, small: true, tail: 'thin' },
  squirrel: { ears: 'tuft',     muzzle: 'small', tail: 'bushy' },
  hedgehog: { ears: 'small',    muzzle: 'small', spikes: true, tail: 'stub' },
  goat:     { ears: 'droop',    muzzle: 'long',  horns: true, tail: 'stub' },
  sheep:    { ears: 'droop',    muzzle: 'small', wool: true, tail: 'puff' },
  frog:     { ears: 'none',     muzzle: 'wide',  eyesTop: true, tail: 'none' },
  otter:    { ears: 'small',    muzzle: 'blunt', whiskers: true, tail: 'thick' },
  deer:     { ears: 'leaf',     muzzle: 'long',  antlers: true, tail: 'stub' },
};

export const SPECIES_LIST = Object.keys(SPECIES);

/** Fur palettes NPCs and the player draw from. */
export const COATS = {
  cream:    { fur: P.furCream,   inner: '#e8a9a0' },
  ginger:   { fur: P.furGinger,  inner: '#e8a9a0' },
  grey:     { fur: P.furGrey,    inner: '#d9a3a8' },
  brown:    { fur: P.furBrown,   inner: '#d99b8f' },
  black:    { fur: P.furBlack,   inner: '#a1707e' },
  white:    { fur: P.furWhite,   inner: '#f0b0ae' },
  russet:   { fur: P.furRusset,  inner: '#e8a9a0' },
  silver:   { fur: P.furSilver,  inner: '#dba7ac' },
  blue:     { fur: P.furBlue,    inner: '#cfa1ad' },
  fox:      { fur: P.furFox,     inner: '#f0b8a8' },
  rabbit:   { fur: P.furRabbit,  inner: '#eeb5b0' },
  seal:     { fur: P.furSeal,    inner: '#9aa4b0' },
  bear:     { fur: P.furBear,    inner: '#c98f78' },
  raven:    { fur: P.featherRaven, inner: '#5a5570' },
  robin:    { fur: P.featherRobin, inner: '#f2c48a' },
  bluebird: { fur: P.featherBlue,  inner: '#a8c6ee' },
  owl:      { fur: P.featherOwl,   inner: '#d6c0a2' },
  siam:     { fur: P.furSiam,    inner: '#e0b6a2' },
  calico:   { fur: P.furCalico,  inner: '#eeaea4' },
  tabby:    { fur: P.furTabby,   inner: '#dba79a' },
  green:    { fur: '#7fb85e',    inner: '#b8d99a' },
};

export const COAT_LIST = Object.keys(COATS);

/** Clothing colours. NPCs mix and match these. */
export const CLOTHES = [
  '#d95f5f', '#e08b3f', '#eec453', '#7fbe57', '#4fa8a0', '#5b8fd6',
  '#8a72d6', '#d472b0', '#c9c2b0', '#5a6472', '#a0714f', '#e6e0cf',
  '#6b9e8f', '#c05a7a', '#8fa8c9', '#d9a05a',
];

/** Build the full colour set a painter needs from a coat + clothing choice. */
export function makePalette(coatKey, clothHex, accentHex) {
  const coat = COATS[coatKey] || COATS.cream;
  const fur = coat.fur;
  return {
    fur,
    furLt: shade(fur, 0.2),
    furDk: shade(fur, -0.26),
    furDeep: shade(fur, -0.45),
    inner: coat.inner,
    eye: '#2f2a3d',
    eyeLt: '#ffffff',
    cloth: clothHex,
    clothLt: shade(clothHex, 0.18),
    clothDk: shade(clothHex, -0.26),
    accent: accentHex || shade(clothHex, -0.5),
    beak: '#e8b455',
    beakDk: '#c08c30',
  };
}

// ---------------------------------------------------------------------------
// Humanoid painter
// ---------------------------------------------------------------------------

/**
 * Paint one frame of a villager.
 * dir: 'down' | 'up' | 'side'   (right is drawn by mirroring 'side')
 * frame: 0..3 walk cycle (0 and 2 are the neutral pose)
 */
function paintChar(buf, speciesKey, c, dir, frame) {
  const sp = SPECIES[speciesKey] || SPECIES.cat;
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;   // which leg leads
  const bob = frame % 2 === 1 ? -1 : 0;                  // gentle up/down

  const headCy = 6 + bob;
  const headRx = sp.broad ? 6 : sp.small ? 4.6 : 5.4;
  const headRy = sp.broad ? 5.8 : sp.small ? 4.8 : 5.4;
  const bodyTop = 12 + bob;

  // ---- legs (drawn first so the body overlaps them) ----
  const legY = 19 + bob;
  const legH = CHAR_H - legY - 1;
  const footC = rgb(c.accent);
  if (dir === 'side') {
    const front = step;
    buf.rect(5 + front, legY, 3, legH, rgb(c.furDk));
    buf.rect(8 - front, legY, 3, legH, rgb(c.fur));
    buf.rect(4 + front, CHAR_H - 2, 5, 2, footC);
    buf.rect(7 - front, CHAR_H - 2, 5, 2, footC);
  } else {
    buf.rect(4, legY + (step > 0 ? 0 : 0), 3, legH - (step > 0 ? 1 : 0), rgb(c.fur));
    buf.rect(9, legY, 3, legH - (step < 0 ? 1 : 0), rgb(c.fur));
    buf.rect(4, CHAR_H - 2 - (step > 0 ? 1 : 0), 3, 2, footC);
    buf.rect(9, CHAR_H - 2 - (step < 0 ? 1 : 0), 3, 2, footC);
  }

  // ---- torso ----
  const torsoW = dir === 'side' ? 7 : sp.broad ? 10 : 8;
  const torsoX = Math.round((CHAR_W - torsoW) / 2);
  buf.rect(torsoX, bodyTop, torsoW, legY - bodyTop + 1, rgb(c.cloth));
  buf.rect(torsoX, bodyTop, torsoW, 2, rgb(c.clothLt));
  buf.rect(torsoX, legY - 1, torsoW, 2, rgb(c.clothDk));
  if (dir === 'down') {
    // Little apron/placket detail so fronts read differently from backs.
    buf.vline(CHAR_W / 2, bodyTop + 2, legY - bodyTop - 2, rgb(c.clothDk));
    buf.rect(6, bodyTop + 3, 4, 2, rgb(c.clothLt));
  } else if (dir === 'up') {
    buf.rect(torsoX + 1, bodyTop + 2, torsoW - 2, 1, rgb(c.clothDk));
  }

  // ---- arms ----
  const armY = bodyTop + 1;
  const armH = 6;
  if (dir === 'side') {
    const swing = -step;
    buf.rect(7, armY + Math.max(0, swing), 3, armH, rgb(c.clothDk));
    buf.rect(7, armY + armH + Math.max(0, swing), 3, 2, rgb(c.fur)); // paw
  } else {
    buf.rect(torsoX - 2, armY - step, 2, armH, rgb(c.cloth));
    buf.rect(torsoX + torsoW, armY + step, 2, armH, rgb(c.cloth));
    buf.rect(torsoX - 2, armY + armH - step, 2, 2, rgb(c.fur));
    buf.rect(torsoX + torsoW, armY + armH + step, 2, 2, rgb(c.fur));
  }

  // ---- tail (side view only, it would be hidden otherwise) ----
  if (dir === 'side' && sp.tail && sp.tail !== 'none') {
    const ty = bodyTop + 4;
    if (sp.tail === 'bushy') {
      buf.ellipse(13, ty + 1, 3.4, 4.2, rgb(c.furDk));
      buf.ellipse(13, ty, 2.4, 3.2, rgb(c.fur));
      buf.ellipse(13, ty - 2, 1.6, 1.6, rgb(c.furLt));
    } else if (sp.tail === 'puff') {
      buf.ellipse(13, ty + 1, 2.4, 2.4, rgb(c.furLt));
    } else if (sp.tail === 'stub') {
      buf.ellipse(13, ty + 1, 1.6, 1.6, rgb(c.fur));
    } else if (sp.tail === 'curl') {
      buf.ellipse(13, ty - 1, 2.8, 2.4, rgb(c.fur));
      buf.ellipse(13, ty - 1, 1.4, 1.2, rgb(c.furLt));
    } else if (sp.tail === 'thin') {
      buf.line(12, ty + 2, 15, ty - 2, rgb(c.furDk));
    } else if (sp.tail === 'feather') {
      buf.ellipse(13, ty + 2, 2.6, 3.4, rgb(c.furDk));
    } else if (sp.tail === 'thick') {
      buf.ellipse(13, ty + 2, 2.8, 2.2, rgb(c.furDk));
    } else {
      // default cat/dog tail: an upright curve
      buf.line(12, ty + 2, 14, ty - 3, rgb(c.fur));
      buf.line(13, ty + 2, 15, ty - 3, rgb(c.furDk));
      buf.set(14, ty - 4, rgb(c.furLt));
    }
  }

  // ---- head ----
  const hx = CHAR_W / 2 - (dir === 'side' ? 1 : 0);
  paintEars(buf, sp, c, dir, hx, headCy, headRx, headRy, 'back');
  buf.ellipse(hx, headCy, headRx, headRy, rgb(c.fur));
  // Top-lit shading.
  buf.ellipseBlend(hx, headCy - 1.6, headRx - 0.6, headRy - 1.4, rgb(c.furLt, 110));
  buf.ellipseBlend(hx, headCy + 2.6, headRx - 1.2, headRy - 2.6, rgb(c.furDk, 90));

  if (sp.wool) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      buf.ellipse(hx + Math.cos(a) * headRx * 0.85, headCy + Math.sin(a) * headRy * 0.85 - 1, 2.1, 2.0, rgb(c.furLt));
    }
    buf.ellipse(hx, headCy, headRx - 1, headRy - 1, rgb(c.fur));
  }
  if (sp.spikes) {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const px = Math.round(hx + Math.cos(a) * (headRx + 0.5));
      const py = Math.round(headCy + Math.sin(a) * (headRy + 0.5));
      buf.set(px, py, rgb(c.furDeep));
      buf.set(px + Math.round(Math.cos(a)), py + Math.round(Math.sin(a)), rgb(c.furDk));
    }
  }

  paintEars(buf, sp, c, dir, hx, headCy, headRx, headRy, 'front');

  if (sp.horns) {
    buf.line(hx - 3, headCy - 5, hx - 4, headCy - 8, rgb(P.chalk));
    buf.line(hx + 3, headCy - 5, hx + 4, headCy - 8, rgb(P.chalk));
  }
  if (sp.antlers) {
    for (const s of [-1, 1]) {
      buf.line(hx + 3 * s, headCy - 5, hx + 4 * s, headCy - 9, rgb(P.wood));
      buf.set(hx + 5 * s, headCy - 7, rgb(P.wood));
      buf.set(hx + 3 * s, headCy - 8, rgb(P.woodLt));
    }
  }
  if (sp.crest) {
    buf.set(hx, headCy - 6, rgb(c.furLt));
    buf.set(hx - 1, headCy - 7, rgb(c.furLt));
    buf.set(hx, headCy - 8, rgb(c.furLt));
  }

  // ---- face (skipped when facing away) ----
  if (dir !== 'up') paintFace(buf, sp, c, dir, hx, headCy, headRx, headRy);
  else if (sp.fluff) buf.ellipse(hx, headCy - 3, headRx - 1, 2, rgb(c.furLt));

  outline(buf);

  // Contact shadow, drawn after the outline so it stays soft.
  buf.ellipseBlend(CHAR_W / 2, CHAR_H - 1, 5, 1.6, rgb('#000000', 60));
}

function paintEars(buf, sp, c, dir, hx, cy, rx, ry, pass) {
  const F = rgb(c.fur), D = rgb(c.furDk), I = rgb(c.inner);
  const back = pass === 'back';
  const side = dir === 'side';

  const pair = (fn) => {
    if (side) { if (back) fn(1, D); else fn(-0.4, F); }
    else { fn(-1, F); fn(1, F); }
  };

  switch (sp.ears) {
    case 'point':
      pair((s, col) => {
        const ex = hx + s * (rx - 1.2);
        for (let i = 0; i < 5; i++) {
          buf.hline(Math.round(ex - 2 + i * 0.4 * (s > 0 ? 1 : 1)), Math.round(cy - ry - 3 + i), Math.max(1, 4 - i), col);
        }
        if (!back && dir !== 'up') {
          for (let i = 0; i < 3; i++) buf.hline(Math.round(ex - 1), Math.round(cy - ry - 2 + i), Math.max(1, 2 - i), I);
        }
      });
      break;
    case 'bigpoint':
      pair((s, col) => {
        const ex = hx + s * (rx - 0.6);
        for (let i = 0; i < 7; i++) {
          buf.hline(Math.round(ex - 2.5), Math.round(cy - ry - 5 + i), Math.max(1, 5 - Math.floor(i * 0.7)), col);
        }
        if (!back && dir !== 'up') {
          for (let i = 0; i < 4; i++) buf.hline(Math.round(ex - 1), Math.round(cy - ry - 4 + i), Math.max(1, 3 - i), I);
        }
        buf.hline(Math.round(ex - 2.5), Math.round(cy - ry - 5), 4, rgb(c.furDeep));
      });
      break;
    case 'perk':
      pair((s, col) => {
        const ex = hx + s * (rx - 1.4);
        buf.ellipse(ex, cy - ry - 1, 2.2, 3, col);
        if (!back && dir !== 'up') buf.ellipse(ex, cy - ry - 1, 1.1, 1.8, I);
      });
      break;
    case 'floppy':
      pair((s, col) => {
        const ex = hx + s * (rx + 0.2);
        buf.ellipse(ex, cy + 0.5, 2.2, 4.2, col);
        if (!back && dir !== 'up') buf.ellipse(ex, cy + 0.5, 1.1, 2.6, rgb(c.furDk));
      });
      break;
    case 'droop':
      pair((s, col) => {
        const ex = hx + s * (rx + 0.6);
        buf.ellipse(ex, cy - 1, 2.6, 1.8, col);
      });
      break;
    case 'long':
      pair((s, col) => {
        const ex = hx + s * (rx - 2.4);
        buf.ellipse(ex, cy - ry - 4, 1.7, 5.4, col);
        if (!back && dir !== 'up') buf.ellipse(ex, cy - ry - 4, 0.8, 3.8, I);
      });
      break;
    case 'biground':
      pair((s, col) => {
        const ex = hx + s * (rx - 0.2);
        buf.ellipse(ex, cy - 2.4, 3.2, 3.2, col);
        if (!back && dir !== 'up') buf.ellipse(ex, cy - 2.4, 1.8, 1.8, I);
      });
      break;
    case 'round':
      pair((s, col) => {
        const ex = hx + s * (rx - 1.6);
        buf.ellipse(ex, cy - ry + 0.4, 2.2, 2.2, col);
        if (!back && dir !== 'up') buf.ellipse(ex, cy - ry + 0.4, 1.1, 1.1, I);
      });
      break;
    case 'small':
      pair((s, col) => {
        const ex = hx + s * (rx - 1.6);
        buf.ellipse(ex, cy - ry + 0.6, 1.5, 1.5, col);
      });
      break;
    case 'leaf':
      pair((s, col) => {
        const ex = hx + s * (rx + 0.2);
        buf.ellipse(ex, cy - 2.6, 1.6, 3.2, col);
        if (!back && dir !== 'up') buf.ellipse(ex, cy - 2.6, 0.7, 1.9, I);
      });
      break;
    case 'tuft': {
      // `s` doubles as a fractional inset for the near ear in profile, so take
      // its sign for anything that has to step by whole pixels.
      pair((s, col) => {
        const d = s < 0 ? -1 : 1;
        const ex = Math.round(hx + s * (rx - 1.6));
        const top = Math.round(cy - ry);
        buf.line(ex, top + 1, ex + d, top - 3, col);
        buf.line(ex + d, top + 1, ex + d * 2, top - 2, col);
      });
      break;
    }
    default:
      break;
  }
}

function paintFace(buf, sp, c, dir, hx, cy, rx, ry) {
  const E = rgb(c.eye), W = rgb(c.eyeLt);
  const side = dir === 'side';
  const eyeY = Math.round(cy - (sp.eyesTop ? 2.4 : 0.4));

  if (sp.muzzle === 'beak') {
    // Beak first so eyes sit above it.
    if (side) {
      buf.rect(hx - rx - 2, cy + 0.5, 4, 2, rgb(c.beak));
      buf.hline(hx - rx - 2, cy + 2, 4, rgb(c.beakDk));
    } else {
      buf.rect(hx - 1, cy + 1, 3, 2, rgb(c.beak));
      buf.hline(hx - 1, cy + 3, 3, rgb(c.beakDk));
      buf.set(hx, cy + 3, rgb(c.beakDk));
    }
  } else if (sp.muzzle !== 'none') {
    const mw = sp.muzzle === 'dog' || sp.muzzle === 'long' ? 3.4 : sp.muzzle === 'bear' ? 3.6 : sp.muzzle === 'wide' ? 4.4 : 2.8;
    const mh = sp.muzzle === 'long' ? 2.6 : 2.1;
    const mx = side ? hx - rx + 0.6 : hx;
    const my = cy + (sp.muzzle === 'wide' ? 2.6 : 2.2);
    buf.ellipse(mx, my, mw, mh, rgb(mixHex(c.fur, '#ffffff', 0.42)));
    // Nose.
    const nx = side ? mx - mw + 1 : mx;
    buf.rect(Math.round(nx - 1), Math.round(my - 1.6), 2, 2, rgb(shade(c.inner, -0.35)));
    if (!side) {
      buf.vline(hx, Math.round(my), 2, rgb(shade(c.inner, -0.5)));
      buf.set(hx - 1, Math.round(my + 1), rgb(shade(c.inner, -0.5)));
      buf.set(hx + 1, Math.round(my + 1), rgb(shade(c.inner, -0.5)));
    }
  }

  const drawEye = (ex) => {
    if (sp.bigEyes) {
      buf.ellipse(ex, eyeY, 2.4, 2.4, W);
      buf.ellipse(ex, eyeY, 1.4, 1.5, E);
      buf.set(Math.round(ex - 0.5), eyeY - 1, W);
    } else {
      buf.rect(Math.round(ex - 1), eyeY - 1, 2, 3, E);
      buf.set(Math.round(ex - 1), eyeY - 1, W);
    }
  };

  if (side) drawEye(hx - rx + 2.6);
  else { drawEye(hx - 2.6); drawEye(hx + 2.6); }

  // A small blush and a smile make everyone read as friendly.
  const blush = rgb(mixHex(c.inner, '#ff9aa8', 0.5), 150);
  if (side) buf.ellipseBlend(hx - rx + 1.2, cy + 1.6, 1.4, 0.9, blush);
  else {
    buf.ellipseBlend(hx - 4.2, cy + 1.4, 1.5, 1.0, blush);
    buf.ellipseBlend(hx + 4.2, cy + 1.4, 1.5, 1.0, blush);
  }

  if (sp.whiskers) {
    const wc = rgb(mixHex(c.fur, '#ffffff', 0.7), 190);
    if (side) { buf.hline(hx - rx - 2, cy + 2, 3, wc); buf.hline(hx - rx - 2, cy + 4, 3, wc); }
    else {
      buf.hline(hx - 7, cy + 3, 3, wc);
      buf.hline(hx + 5, cy + 3, 3, wc);
    }
  }
}

// ---------------------------------------------------------------------------
// Cats (four-legged)
// ---------------------------------------------------------------------------

export const CAT_BREEDS = {
  tabby:      { base: '#b08b5a', mark: 'stripes', markCol: '#7a5a35', name: 'Tabby', price: 0, appeal: 1.0, voice: { pitch: 1.0,  gain: 1.0,  calls: ['meow', 'meow', 'mrrp'] }, rare: false },
  tuxedo:     { base: '#3a3644', mark: 'tuxedo',  markCol: '#f7f2e6', name: 'Tuxedo', price: 320, appeal: 1.15, voice: { pitch: 0.95, gain: 1.05, calls: ['meow', 'mrrp', 'meow'] }, rare: false },
  ginger:     { base: '#e08a4a', mark: 'stripes', markCol: '#b3652f', name: 'Ginger', price: 280, appeal: 1.1, voice: { pitch: 1.05, gain: 1.15, calls: ['meow', 'meow', 'yowl', 'mrrp'] }, rare: false },
  calico:     { base: '#f2ead8', mark: 'patches', markCol: '#e08a4a', name: 'Calico', price: 460, appeal: 1.3, voice: { pitch: 1.12, gain: 1.0,  calls: ['meow', 'chirrup', 'mrrp'] }, rare: false },
  grey:       { base: '#9aa0ab', mark: 'none',    markCol: '#6d737e', name: 'Grey', price: 240, appeal: 1.05, voice: { pitch: 0.92, gain: 0.8,  calls: ['mrrp', 'meow', 'squeak'] }, rare: false },
  siamese:    { base: '#e5d6bd', mark: 'points',  markCol: '#6b5240', name: 'Siamese', price: 720, appeal: 1.5, voice: { pitch: 1.18, gain: 1.3,  calls: ['yowl', 'yowl', 'meow'] }, rare: true },
  russianblue:{ base: '#8f9fb8', mark: 'none',    markCol: '#6d7d96', name: 'Russian Blue', price: 900, appeal: 1.6, voice: { pitch: 1.0,  gain: 0.68, calls: ['mrrp', 'squeak', 'chirrup'] }, rare: true },
  maine:      { base: '#a37045', mark: 'fluff',   markCol: '#7a4f2c', name: 'Maine Coon', price: 1150, appeal: 1.75, voice: { pitch: 0.78, gain: 1.0,  calls: ['chirrup', 'mrrp', 'chirrup', 'meow'] }, rare: true },
  persian:    { base: '#f0e2c8', mark: 'fluff',   markCol: '#d6c19c', name: 'Persian', price: 1400, appeal: 1.9, voice: { pitch: 0.85, gain: 0.72, calls: ['squeak', 'mrrp', 'meow'] }, rare: true },
  bengal:     { base: '#dfa958', mark: 'spots',   markCol: '#5c4326', name: 'Bengal', price: 1900, appeal: 2.2, voice: { pitch: 1.08, gain: 1.25, calls: ['rasp', 'chirrup', 'yowl'] }, rare: true },
  tortie:     { base: '#5a4636', mark: 'patches', markCol: '#d98a3f', name: 'Tortoiseshell', price: 620, appeal: 1.4, voice: { pitch: 1.06, gain: 1.12, calls: ['meow', 'yowl', 'mrrp'] }, rare: false },
  white:      { base: '#f7f2e6', mark: 'none',    markCol: '#d9d0be', name: 'Snowcap', price: 380, appeal: 1.2, voice: { pitch: 1.02, gain: 0.95, calls: ['meow', 'mrrp', 'chirrup'] }, rare: false },
  black:      { base: '#3a3644', mark: 'none',    markCol: '#524d5f', name: 'Midnight', price: 300, appeal: 1.1, voice: { pitch: 0.9,  gain: 0.95, calls: ['meow', 'mrrp', 'rasp'] }, rare: false },
  sphynx:     { base: '#e8bfae', mark: 'none',    markCol: '#c99783', name: 'Sphynx', price: 2400, appeal: 2.4, voice: { pitch: 1.14, gain: 1.2,  calls: ['rasp', 'rasp', 'yowl', 'squeak'] }, rare: true },
  ragdoll:    { base: '#f2e6d8', mark: 'points',  markCol: '#8a7060', name: 'Ragdoll', price: 1700, appeal: 2.05, voice: { pitch: 1.2,  gain: 0.62, calls: ['squeak', 'squeak', 'mrrp'] }, rare: true },
};

export const CAT_BREED_LIST = Object.keys(CAT_BREEDS);

/**
 * Paint a four-legged cat.
 * pose: 'walk' | 'sit' | 'sleep' | 'play' | 'loaf'
 */
function paintCat(buf, breedKey, dir, frame, pose, groomed) {
  // Either a catalogue breed or an ad-hoc one built from a coat colour.
  const b = (typeof breedKey === 'object' && breedKey) ? breedKey : (CAT_BREEDS[breedKey] || CAT_BREEDS.tabby);
  const base = b.base;
  const F = rgb(base), D = rgb(shade(base, -0.25)), L = rgb(shade(base, groomed ? 0.3 : 0.16));
  const M = rgb(b.markCol);
  const E = rgb('#2f2a3d');
  const pink = rgb('#e79aa0');
  const cx = CAT_W / 2;
  const fluffy = b.mark === 'fluff';

  const bob = frame % 2 === 1 ? -1 : 0;

  if (pose === 'sleep') {
    // Curled up into a croissant.
    buf.ellipse(cx, 9, 6.4, 3.8, F);
    buf.ellipseBlend(cx, 8, 5.4, 2.6, L);
    buf.ellipse(cx - 4, 8.5, 2.8, 2.6, F);   // head tucked in
    buf.ellipse(cx + 4.5, 10, 3.2, 1.6, D);  // tail wrapped round
    buf.set(cx - 5, 8, E); buf.set(cx - 4, 8, E);
    if (b.mark === 'stripes') for (let i = -2; i <= 3; i++) buf.vline(cx + i * 2, 6, 3, M);
    outline(buf);
    buf.ellipseBlend(cx, CAT_H - 1, 6, 1.6, rgb('#000000', 55));
    return;
  }

  if (pose === 'loaf') {
    buf.ellipse(cx, 9.5, 5.4, 3.4, F);
    buf.ellipseBlend(cx, 8.4, 4.4, 2.2, L);
    buf.ellipse(cx, 6, 3.6, 3.2, F);
    paintCatEars(buf, cx, 6, 3.6, F, pink);
    buf.rect(cx - 3, 5, 2, 2, E); buf.rect(cx + 2, 5, 2, 2, E);
    buf.set(cx, 7, pink);
    if (b.mark === 'stripes') for (let i = -2; i <= 2; i++) buf.vline(cx + i * 2, 7, 3, M);
    outline(buf);
    buf.ellipseBlend(cx, CAT_H - 1, 5.5, 1.5, rgb('#000000', 55));
    return;
  }

  if (pose === 'sit') {
    // Body: haunches at the back, chest upright.
    buf.ellipse(cx + 1, 10, 4.2, 3.6, F);
    buf.ellipse(cx - 1, 8.5, 3.2, 4.2, F);
    buf.ellipseBlend(cx - 1.4, 7.6, 2.2, 3.0, L);
    // Tail curled forward round the feet.
    buf.ellipse(cx + 5, 12, 3.2, 1.4, D);
    buf.ellipse(cx + 6.5, 11.4, 1.4, 1.2, F);
    // Front legs.
    buf.rect(cx - 3, 10, 2, 3, F);
    buf.rect(cx, 10, 2, 3, F);
    // Head.
    const hy = 4 + bob * 0;
    buf.ellipse(cx - 1, hy, 3.7, 3.4, F);
    paintCatEars(buf, cx - 1, hy, 3.7, F, pink);
    buf.rect(cx - 4, hy - 1, 2, 2, E);
    buf.rect(cx + 1, hy - 1, 2, 2, E);
    buf.set(cx - 1, hy + 1, pink);
    buf.hline(cx - 2, hy + 2, 3, D);
    if (b.mark === 'stripes') { buf.vline(cx - 1, hy - 3, 2, M); buf.vline(cx + 1, 6, 4, M); buf.vline(cx + 3, 7, 4, M); }
    if (b.mark === 'tuxedo') { buf.ellipse(cx - 1, 9, 1.8, 2.6, rgb(b.markCol)); buf.rect(cx - 3, 12, 2, 1, rgb(b.markCol)); buf.rect(cx, 12, 2, 1, rgb(b.markCol)); }
    if (b.mark === 'points') { buf.ellipse(cx - 1, hy + 1, 2.2, 1.6, M); buf.rect(cx - 3, 12, 2, 1, M); }
    outline(buf);
    buf.ellipseBlend(cx, CAT_H - 1, 5, 1.5, rgb('#000000', 55));
    return;
  }

  if (pose === 'play') {
    // Belly-up wriggle, paws in the air.
    buf.ellipse(cx, 10, 5.6, 3.2, F);
    buf.ellipseBlend(cx, 10, 4.4, 2.2, rgb(shade(base, 0.3)));
    buf.ellipse(cx - 5, 8.5, 3.0, 2.8, F);
    paintCatEars(buf, cx - 5, 8.5, 3.0, F, pink);
    buf.set(cx - 6, 8, E); buf.set(cx - 4, 8, E);
    for (const [px, py] of [[cx - 1, 6], [cx + 2, 6], [cx - 1, 13], [cx + 2, 13]]) {
      buf.ellipse(px, py, 1.4, 1.2, F);
    }
    buf.ellipse(cx + 6, 11, 2.6, 1.3, D);
    outline(buf);
    buf.ellipseBlend(cx, CAT_H - 1, 6, 1.5, rgb('#000000', 55));
    return;
  }

  // ---- walking ----
  const legLift = frame % 4;
  if (dir === 'side') {
    const bodyY = 8 + bob;
    // Tail up and curved.
    buf.line(cx + 5, bodyY, cx + 7, bodyY - 4, D);
    buf.line(cx + 6, bodyY, cx + 8, bodyY - 4, F);
    if (fluffy) buf.ellipse(cx + 7, bodyY - 4, 2.2, 2.6, L);
    // Legs.
    const l1 = legLift === 1 ? 1 : 0, l2 = legLift === 3 ? 1 : 0;
    buf.rect(cx - 3, bodyY + 2 - l1, 2, 4 - (1 - l1), D);
    buf.rect(cx + 2, bodyY + 2 - l2, 2, 4 - (1 - l2), D);
    buf.rect(cx - 1, bodyY + 2 - l2, 2, 4, F);
    buf.rect(cx + 4, bodyY + 2 - l1, 2, 4, F);
    // Body.
    buf.ellipse(cx + 1, bodyY, 5.2, 3.0, F);
    buf.ellipseBlend(cx + 1, bodyY - 1, 4.2, 1.8, L);
    // Head.
    const hx = cx - 5, hy = bodyY - 2;
    buf.ellipse(hx, hy, 3.4, 3.0, F);
    paintCatEars(buf, hx, hy, 3.4, F, pink);
    buf.rect(hx - 1, hy - 1, 2, 2, E);
    buf.ellipse(hx - 2.6, hy + 1.4, 1.6, 1.2, rgb(shade(base, 0.35)));
    buf.set(hx - 3, hy + 1, pink);
    if (b.mark === 'stripes') for (let i = -1; i <= 3; i++) buf.vline(cx + i * 2, bodyY - 3, 3, M);
    if (b.mark === 'spots') for (let i = -1; i <= 3; i++) buf.ellipse(cx + i * 2, bodyY - 1 + (i % 2), 1, 0.9, M);
    if (b.mark === 'patches') { buf.ellipse(cx + 2, bodyY - 1, 2.4, 1.8, M); buf.ellipse(hx + 1, hy - 1, 1.6, 1.4, M); }
    if (b.mark === 'tuxedo') { buf.ellipse(cx - 2, bodyY + 1.6, 2.2, 1.6, M); buf.rect(cx - 3, bodyY + 5, 2, 1, M); buf.rect(cx + 4, bodyY + 5, 2, 1, M); }
    if (b.mark === 'points') { buf.ellipse(hx - 1.6, hy + 1, 2.2, 1.8, M); buf.rect(cx - 3, bodyY + 4, 2, 2, M); buf.rect(cx + 4, bodyY + 4, 2, 2, M); }
  } else {
    // Front / back view.
    const bodyY = 9 + bob;
    const facing = dir === 'down';
    buf.ellipse(cx, bodyY, 4.0, 3.4, F);
    buf.ellipseBlend(cx, bodyY - 1, 3.0, 2.2, L);
    const l1 = legLift === 1 ? 1 : 0, l2 = legLift === 3 ? 1 : 0;
    buf.rect(cx - 3, bodyY + 2 - l1, 2, 3, D);
    buf.rect(cx + 1, bodyY + 2 - l2, 2, 3, D);
    const hy = bodyY - 4;
    buf.ellipse(cx, hy, 3.6, 3.2, F);
    paintCatEars(buf, cx, hy, 3.6, F, pink);
    if (facing) {
      buf.rect(cx - 3, hy - 1, 2, 2, E);
      buf.rect(cx + 1, hy - 1, 2, 2, E);
      buf.set(cx, hy + 1, pink);
      buf.hline(cx - 1, hy + 2, 3, D);
    } else {
      buf.ellipse(cx + 4, bodyY, 1.6, 2.6, D); // tail behind
    }
    if (b.mark === 'stripes') { buf.vline(cx, hy - 3, 2, M); buf.vline(cx - 2, bodyY - 2, 4, M); buf.vline(cx + 2, bodyY - 2, 4, M); }
    if (b.mark === 'patches') buf.ellipse(cx - 2, bodyY - 1, 2, 1.8, M);
    if (b.mark === 'tuxedo') buf.ellipse(cx, bodyY + 1, 2.0, 2.2, M);
    if (b.mark === 'points') buf.ellipse(cx, hy + 1.4, 2.4, 1.6, M);
    if (b.mark === 'spots') { buf.ellipse(cx - 2, bodyY, 1, 0.9, M); buf.ellipse(cx + 2, bodyY - 1, 1, 0.9, M); }
  }

  if (fluffy) {
    // Long-haired breeds get a ruff.
    buf.ellipseBlend(cx - (dir === 'side' ? 3 : 0), (dir === 'side' ? 8 : 7), 3.4, 2.2, rgb(shade(base, 0.25), 120));
  }

  outline(buf);
  buf.ellipseBlend(cx, CAT_H - 1, 5.5, 1.5, rgb('#000000', 55));

  if (groomed) {
    // A sparkle to show a fresh grooming.
    buf.set(cx + 6, 2, rgb('#ffffff'));
    buf.set(cx + 5, 3, rgb('#fff3c4')); buf.set(cx + 7, 3, rgb('#fff3c4'));
    buf.set(cx + 6, 4, rgb('#ffffff'));
  }
}

function paintCatEars(buf, cx, cy, rx, F, pink) {
  for (const s of [-1, 1]) {
    const ex = Math.round(cx + s * (rx - 1.1));
    for (let i = 0; i < 4; i++) buf.hline(ex - 1, Math.round(cy - rx - 1 + i), Math.max(1, 3 - i), F);
    buf.set(ex, Math.round(cy - rx + 1), pink);
  }
}

// ---------------------------------------------------------------------------
// Public sprite accessors (memoised)
// ---------------------------------------------------------------------------

const cache = new SpriteCache();

/** Villager sprite. dir: down|up|left|right. */
/**
 * The same art as `charSprite`, but left as raw pixels instead of baked onto a
 * canvas. The home-screen icon is built from this: it runs in node, where there
 * is no canvas, and drawing the cat twice would mean two cats to keep in step.
 */
export function charBuf(speciesKey, coatKey, clothHex, dir, frame) {
  const c = makePalette(coatKey, clothHex);
  const base = dir === 'right' || dir === 'left' ? 'side' : dir;
  const buf = new PixBuf(CHAR_W, CHAR_H);
  paintChar(buf, speciesKey, c, base, frame);
  return dir === 'right' ? mirror(buf) : buf;
}

export function charSprite(speciesKey, coatKey, clothHex, dir, frame) {
  const key = `c|${speciesKey}|${coatKey}|${clothHex}|${dir}|${frame}`;
  return cache.get(key, () => charBuf(speciesKey, coatKey, clothHex, dir, frame).toCanvas());
}

/** Cat sprite. pose defaults to 'walk'. */
export function catSprite(breedKey, dir, frame, pose = 'walk', groomed = false) {
  const key = `k|${breedKey}|${dir}|${frame}|${pose}|${groomed ? 1 : 0}`;
  return cache.get(key, () => {
    const base = dir === 'right' || dir === 'left' ? 'side' : dir;
    const buf = new PixBuf(CAT_W, CAT_H);
    paintCat(buf, breedKey, base, frame, pose, groomed);
    return (dir === 'right' ? mirror(buf) : buf).toCanvas();
  });
}

/** Small emote bubble shown above a head. */
export function emoteSprite(kind) {
  return cache.get(`e|${kind}`, () => {
    const buf = new PixBuf(16, 14);
    const bg = rgb('#fdf6e6'), ed = rgb('#5b5170');
    buf.ellipse(8, 6, 6.4, 5.2, bg);
    outline(buf, '#5b5170');
    // Little tail on the bubble.
    buf.set(7, 11, ed); buf.set(8, 11, bg); buf.set(9, 11, ed);
    buf.set(8, 12, ed);
    const ink = rgb('#4a4258');
    switch (kind) {
      case 'talk': buf.set(5, 6, ink); buf.set(8, 6, ink); buf.set(11, 6, ink); break;
      case 'happy': {
        const h = rgb('#e8546b');
        buf.set(6, 4, h); buf.set(10, 4, h);
        buf.rect(5, 5, 7, 2, h); buf.rect(6, 7, 5, 1, h); buf.rect(7, 8, 3, 1, h); buf.set(8, 9, h);
        break;
      }
      case 'music': {
        const m = rgb('#5b8fd6');
        buf.vline(10, 2, 6, m); buf.hline(10, 2, 3, m); buf.ellipse(8, 8, 2, 1.6, m);
        break;
      }
      case 'sleep': {
        const z = rgb('#6f7fb0');
        buf.hline(5, 3, 4, z); buf.line(8, 4, 5, 6, z); buf.hline(5, 7, 4, z);
        buf.hline(10, 6, 3, z); buf.line(12, 7, 10, 9, z); buf.hline(10, 9, 3, z);
        break;
      }
      case 'alert': buf.rect(7, 2, 2, 6, ink); buf.rect(7, 9, 2, 2, ink); break;
      case 'money': {
        const g = rgb('#f5c451');
        buf.ellipse(8, 6, 3.4, 3.4, g);
        buf.ellipse(8, 6, 2.2, 2.2, rgb('#c1902c'));
        break;
      }
      case 'sick': {
        const s = rgb('#8cbf5a');
        buf.ellipse(6, 5, 1.6, 1.6, s); buf.ellipse(10, 7, 1.4, 1.4, s); buf.ellipse(8, 8, 1.2, 1.2, s);
        break;
      }
      case 'heart': {
        const h = rgb('#f39ac0');
        buf.set(6, 4, h); buf.set(10, 4, h);
        buf.rect(5, 5, 7, 2, h); buf.rect(6, 7, 5, 1, h); buf.set(8, 8, h);
        break;
      }
      case 'quest': {
        const q = rgb('#f5c451');
        buf.hline(6, 2, 4, q); buf.set(10, 3, q); buf.set(10, 4, q);
        buf.set(9, 5, q); buf.set(8, 6, q); buf.set(8, 7, q);
        buf.rect(8, 9, 2, 2, q);
        break;
      }
      default: break;
    }
    return buf.toCanvas();
  });
}

/**
 * The player, curled up as an ordinary cat — used for the night's-sleep card.
 * Built from their coat colour rather than a catalogue breed.
 */
export function playerCatSprite(coatKey, pose = 'sleep') {
  return cache.get(`pc|${coatKey}|${pose}`, () => {
    const fur = (COATS[coatKey] || COATS.ginger).fur;
    const buf = new PixBuf(CAT_W, CAT_H);
    paintCat(buf, { base: fur, mark: 'none', markCol: shade(fur, -0.24), appeal: 1 },
      'side', 0, pose, false);
    return buf.toCanvas();
  });
}

/**
 * The taxi bird, seen from behind/above as it hovers. `flap` 0..3 drives the
 * wings; `carrying` adds a harness with a passenger seat slung underneath.
 */
export const TAXI_W = 58;
export const TAXI_H = 46;
/** Local y of the basket floor, so the cutscene knows where to seat you. */
export const TAXI_SEAT_Y = 34;

export function taxiBirdSprite(flap, carrying) {
  return cache.get(`tb|${flap}|${carrying ? 1 : 0}`, () => {
    const buf = new PixBuf(TAXI_W, TAXI_H);
    const body = '#5f8fd0', bodyDk = shade(body, -0.28), bodyLt = shade(body, 0.22);
    const cx = TAXI_W / 2;
    const lift = [0, -6, -10, -6][flap % 4];     // wingtip height through the beat
    const bob = [0, -1, -2, -1][flap % 4];
    const by = 17 + bob;

    // Wings: filled tapering shapes, not hairlines, so they read at a glance.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const x = Math.round(cx + s * (6 + i * 3.1));
        const yTop = Math.round(by - 3 + t * lift);
        const h = Math.round(6 - t * 3);
        buf.rect(s < 0 ? x - 2 : x, yTop, 3, h, rgb(i % 2 ? body : bodyLt));
        buf.set(s < 0 ? x - 2 : x + 2, yTop + h - 1, rgb(bodyDk));
      }
      // Leading edge.
      buf.line(cx + s * 6, by - 3, cx + s * 26, by - 3 + lift, rgb(bodyDk));
    }

    // Body, head, beak.
    buf.ellipse(cx, by + 2, 7, 9, rgb(body));
    buf.ellipseBlend(cx - 1.5, by - 2, 4.4, 5, rgb(bodyLt, 160));
    buf.ellipse(cx, by - 9, 5, 4.6, rgb(body));
    buf.ellipse(cx - 1.5, by - 10.5, 2.6, 2, rgb(bodyLt));
    buf.rect(cx - 2, by - 7, 4, 3, rgb('#e8b455'));
    buf.hline(cx - 2, by - 5, 4, rgb('#c08c30'));
    buf.rect(cx - 4, by - 11, 2, 2, rgb('#2f2a3d'));
    buf.rect(cx + 2, by - 11, 2, 2, rgb('#2f2a3d'));
    // A little cap, because it is a taxi.
    buf.rect(cx - 5, by - 14, 10, 2, rgb('#e0894a'));
    buf.rect(cx - 4, by - 16, 8, 2, rgb('#e0894a'));
    // Tail.
    buf.ellipse(cx, by + 11, 3.6, 4.2, rgb(bodyDk));

    if (carrying) {
      // A wicker seat slung on two straps.
      buf.line(cx - 6, by + 8, cx - 8, TAXI_SEAT_Y, rgb('#7d5430'));
      buf.line(cx + 6, by + 8, cx + 8, TAXI_SEAT_Y, rgb('#7d5430'));
      buf.rect(cx - 9, TAXI_SEAT_Y, 18, 8, rgb(P.wood));
      buf.rect(cx - 9, TAXI_SEAT_Y, 18, 2, rgb(P.woodLt));
      for (let x = -8; x < 9; x += 3) buf.vline(cx + x, TAXI_SEAT_Y + 2, 6, rgb(P.woodDk));
      buf.hline(cx - 9, TAXI_SEAT_Y + 7, 18, rgb(P.woodDeep));
    }
    outline(buf);
    return buf.toCanvas();
  });
}

/**
 * A speech bubble holding an item icon — what a customer is waiting to order.
 * Wider and squarer than the emote bubbles so a full 16x16 icon fits inside.
 */
export function orderBubble(iconName) {
  return cache.get(`ob|${iconName}`, () => {
    const buf = new PixBuf(22, 21);
    const bg = rgb('#fdf6e6');
    // Rounded-rectangle body: two overlapping rects nip the corners off.
    buf.rect(1, 0, 20, 18, bg);
    buf.rect(0, 2, 22, 14, bg);
    outline(buf, '#5b5170');
    const ed = rgb('#5b5170');
    // Tail, pointing down at whoever is thinking it.
    buf.set(8, 18, ed); buf.set(9, 18, bg); buf.set(10, 18, bg); buf.set(11, 18, ed);
    buf.set(9, 19, ed); buf.set(10, 19, ed);

    const canvas = buf.toCanvas();
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(iconSprite(iconName), 3, 1);
    return canvas;
  });
}

/** Deterministic species/coat/clothes for a villager id — stable across saves. */
export function villagerLook(id) {
  const h = (s) => Math.floor(hash2(id * 31, s * 17, 0xbeef) * 1e6);
  const sp = SPECIES_LIST[h(1) % SPECIES_LIST.length];
  const coat = COAT_LIST[h(2) % COAT_LIST.length];
  const cloth = CLOTHES[h(3) % CLOTHES.length];
  return { species: sp, coat, cloth };
}
