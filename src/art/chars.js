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
export const BEAR_W = 36;
export const BEAR_H = 26;

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
        // Straight into the pixels rather than through set(): a costumed
        // villager is painted through a lowered view of its buffer (see
        // `lowered`), and this walks the real rows, not the view's.
        buf.data[y * buf.w + x] = c;
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
 * costume: a COSTUMES key, or nothing for everyday clothes
 */
function paintChar(buf, speciesKey, c, dir, frame, costume) {
  const sp = SPECIES[speciesKey] || SPECIES.cat;
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;   // which leg leads
  const bob = frame % 2 === 1 ? -1 : 0;                  // gentle up/down

  const headCy = 6 + bob;
  const headRx = sp.broad ? 6 : sp.small ? 4.6 : 5.4;
  const headRy = sp.broad ? 5.8 : sp.small ? 4.8 : 5.4;
  const bodyTop = 12 + bob;
  const legY = 19 + bob;
  const torsoW = dir === 'side' ? 7 : sp.broad ? 10 : 8;
  const torsoX = Math.round((CHAR_W - torsoW) / 2);
  const hx = CHAR_W / 2 - (dir === 'side' ? 1 : 0);

  // A costume is painted in layers around the villager: a cape behind them,
  // a suit over their clothes, a hat or mask on top. Some bring their own
  // clothes colour, which is simplest to swap in before anything is painted.
  const cos = costume && COSTUMES[costume] ? COSTUMES[costume] : null;
  if (cos && cos.cloth) c = dressedIn(c, cos.cloth);
  const g = cos && {
    key: costume, sp, c, dir, step, bob, frame, hx, cy: headCy, rx: headRx, ry: headRy,
    bodyTop, legY, torsoX, torsoW,
    eyeY: Math.round(headCy - (sp.eyesTop ? 2.4 : 0.4)),
  };
  if (g) wearCostume(buf, g, 'under');

  // ---- legs (drawn first so the body overlaps them) ----
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

  // A sheet ghost is a sheet with feet: nobody's arms, clothes or ears, which
  // is the whole joke, and far easier than hiding twenty species' worth.
  if (g && costume === 'ghost') {
    if (buf.lift) buf.top = -buf.lift;      // the ear bumps go up into the headroom
    paintSheet(buf, g);
    outline(buf);
    buf.ellipseBlend(CHAR_W / 2, CHAR_H - 1, 5, 1.6, rgb('#000000', 60));
    return;
  }

  // ---- torso ----
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

  if (g) wearCostume(buf, g, 'over');

  // ---- head ----
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

  if (g) wearCostume(buf, g, 'head');

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

  const drawEye = (ex) => paintEye(buf, sp, c, ex, eyeY);

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

/** One eye. Masks paint over the face and put the eyes back with this. */
function paintEye(buf, sp, c, ex, eyeY) {
  const E = rgb(c.eye), W = rgb(c.eyeLt);
  if (sp.bigEyes) {
    buf.ellipse(ex, eyeY, 2.4, 2.4, W);
    buf.ellipse(ex, eyeY, 1.4, 1.5, E);
    buf.set(Math.round(ex - 0.5), eyeY - 1, W);
  } else {
    buf.rect(Math.round(ex - 1), eyeY - 1, 2, 3, E);
    buf.set(Math.round(ex - 1), eyeY - 1, W);
  }
}

// ---------------------------------------------------------------------------
// Costumes
// ---------------------------------------------------------------------------
//
// Halloween dress-up, for the villagers. Each one is a few layers painted in
// and around the ordinary villager rather than a sprite of its own, so every
// species, coat and walk frame gets it for free: a cape or wings behind them,
// a suit over their clothes, a hat or a mask on top.
//
// Nothing here is meant to frighten anybody. A sheet ghost with its eyes cut
// out, a pumpkin with a grin, a bat that's mostly ears: the valley's idea of
// spooky is a small child in a bin bag.
//
// `top` is how many rows a costume reaches above the ordinary sprite. The
// head fills the frame to its top edge, so a witch's hat has nowhere to go;
// a costumed sprite is that much taller instead, feet in the same place, and
// whoever draws it anchors it by its feet (see Villager.draw).

export const COSTUMES = {
  // Masks: over the eyes, tied at the back.
  domino:  { kind: 'mask' },
  catmask: { kind: 'mask' },
  foxmask: { kind: 'mask' },
  owlmask: { kind: 'mask' },
  // The whole outfit.
  witch:   { kind: 'full', top: 6 },
  wizard:  { kind: 'full', top: 7, cloth: '#5b4bb0' },
  ghost:   { kind: 'full', top: 2 },               // room for the ears under the sheet
  pumpkin: { kind: 'full', top: 3 },
  bat:     { kind: 'full', top: 3, cloth: '#6a4a9e' },
  bee:     { kind: 'full', top: 4, cloth: '#f0c13c' },
  pirate:  { kind: 'full', top: 3, cloth: '#efe6d2' },
  royal:   { kind: 'full', top: 3 },
};

export const COSTUME_LIST = Object.keys(COSTUMES);

/** How much taller than CHAR_H a sprite in this costume is. */
export function costumeTop(key) {
  return (key && COSTUMES[key] && COSTUMES[key].top) || 0;
}

// The dressing-up box. Brown, orange, purple and black, mostly, plus whatever
// a bee or a king can't do without.
const K = {
  ink: '#3d3549', inkLt: '#5a4f6c',
  purple: '#7d52b3', purpleDk: '#5b3a8a', purpleLt: '#a37ad6',
  orange: '#ee8a2c', orangeDk: '#c2641c', orangeLt: '#f8b25a',
  brown: '#8f5d35', brownDk: '#6a4322',
  gold: '#f4ca4a', goldDk: '#c4952a',
  sheet: '#f7f4ee', sheetDk: '#d9d3cb',
  cream: '#f5e8cc', leaf: '#6f9a3c', leafLt: '#93bd57',
  plum: '#96386c',
  wing: '#e4f1fa', blush: '#f4a3b0',
};

/** The villager's palette with a costume's clothes swapped in. */
function dressedIn(c, cloth) {
  const out = Object.assign({}, c);
  out.cloth = cloth;
  out.clothLt = shade(cloth, 0.18);
  out.clothDk = shade(cloth, -0.26);
  return out;
}

/**
 * `buf`, seen `dy` rows lower down: painting at row y lands on row y + dy.
 * paintChar works in the ordinary 16x24 frame's numbers, and this is how a
 * taller costumed sprite reuses every one of them. Rows above `top` are
 * refused, so ears that the top of an ordinary sprite cuts off are cut off in
 * the same place here; only the hat, which raises `top`, reaches higher.
 */
function lowered(buf, dy) {
  const v = Object.create(buf);
  v.top = 0;
  v.lift = dy;
  v.set = (x, y, p) => { if (Math.floor(y) >= v.top) buf.set(x, Math.floor(y) + dy, p); };
  v.blend = (x, y, p) => { if (Math.floor(y) >= v.top) buf.blend(x, Math.floor(y) + dy, p); };
  v.get = (x, y) => buf.get(x, Math.floor(y) + dy);
  return v;
}

/**
 * One layer of a costume. `layer` is 'under' (before the legs: behind them
 * when they face you), 'over' (after the arms, before the head: their clothes,
 * and anything on their back when they face away) or 'head' (after the face).
 */
function wearCostume(buf, g, layer) {
  if (layer === 'head' && buf.lift) buf.top = -buf.lift;
  switch (g.key) {
    case 'domino': if (layer === 'head') mask(buf, g, K.purple, K.purpleDk, 'domino'); break;
    case 'catmask': if (layer === 'head') mask(buf, g, K.ink, K.inkLt, 'cat'); break;
    case 'foxmask': if (layer === 'head') mask(buf, g, K.orange, K.orangeDk, 'fox'); break;
    case 'owlmask': if (layer === 'head') mask(buf, g, K.brown, K.brownDk, 'owl'); break;
    case 'witch':
      cape(buf, g, layer, K.purple, false);
      if (layer === 'head') pointyHat(buf, g, K.ink, K.inkLt, K.orange, [7, 7, 5, 5, 3, 2, 1], 13);
      break;
    case 'wizard':
      if (layer === 'over') robe(buf, g);
      if (layer === 'head') pointyHat(buf, g, K.purple, K.purpleLt, K.gold, [7, 5, 5, 3, 3, 3, 1, 1], 11);
      break;
    case 'pumpkin':
      if (layer === 'over') pumpkinSuit(buf, g);
      if (layer === 'head') stemCap(buf, g);
      break;
    case 'bat':
      batWings(buf, g, layer);
      if (layer === 'head') batEars(buf, g);
      break;
    case 'bee':
      if (layer === 'over') {
        stripes(buf, g, K.ink, [2, 3, 5, 6]);
        // And a sting. A small, friendly one.
        if (g.dir === 'side') buf.set(g.torsoX + g.torsoW, g.legY - 1, rgb(K.ink));
      }
      beeWings(buf, g, layer);
      if (layer === 'head') antennae(buf, g);
      break;
    case 'pirate':
      if (layer === 'over') stripes(buf, g, '#b4503c', [2, 4, 6]);
      if (layer === 'head') { eyepatch(buf, g); pirateHat(buf, g); }
      break;
    case 'royal':
      cape(buf, g, layer, K.plum, true);
      if (layer === 'head') crown(buf, g);
      break;
    default: break;
  }
}

/** Where the eyes are, as paintFace puts them. */
function eyeXs(g) {
  return g.dir === 'side' ? [g.hx - g.rx + 2.6] : [g.hx - 2.6, g.hx + 2.6];
}

/** The top of the head, in whole rows. Hats sit on this. */
const crownOf = (g) => Math.round(g.cy - g.ry);

/**
 * A mask over the eyes. From behind, all there is to see is the ribbon it's
 * tied on with. `style` adds the bits that say which animal it is.
 */
function mask(buf, g, col, dk, style) {
  const M = rgb(col), D = rgb(dk);
  const { hx, rx, eyeY, dir } = g;
  const tall = style === 'owl' ? 1 : 0;           // the owl's goes down over the cheeks

  if (dir === 'up') {
    // The ribbon round the back of the head, and the bow.
    buf.hline(Math.round(hx - rx + 0.6), eyeY - 1, Math.round(rx * 2 - 1), D);
    buf.rect(hx - 1, eyeY - 2, 2, 2, M);
    buf.set(hx - 2, eyeY, D);
    buf.set(hx + 1, eyeY, D);
    return;
  }

  const side = dir === 'side';
  // The band itself: across the whole face from the front, the front half of
  // it in profile with the ribbon going back to a knot.
  const x0 = Math.round(hx - rx + (side ? 0.4 : 0.6));
  const x1 = side ? hx + 1 : Math.round(hx + rx - 0.6);
  const topRow = eyeY - (style === 'domino' ? 1 : 2);
  const lowRow = eyeY + 1 + tall;
  for (let y = topRow; y <= lowRow; y++) {
    if (y === lowRow && !side) {
      // A notch over the nose, so it sits on a face rather than across it.
      buf.hline(x0, y, hx - 1 - x0, M);
      buf.hline(hx + 1, y, x1 - hx, M);
    } else buf.hline(x0, y, x1 - x0 + 1, M);
  }
  if (side) {
    buf.hline(x1 + 1, eyeY - 1, Math.round(hx + rx - 1) - x1, D);
    buf.rect(Math.round(hx + rx - 1.4), eyeY - 1, 2, 2, M);
    buf.set(Math.round(hx + rx - 0.4), eyeY + 1, D);
  }

  // The two outer top corners, or the front one in profile.
  const corners = side ? [[x0, 1]] : [[x0, 1], [x1, -1]];
  for (const [cx, s] of corners) {
    if (style === 'domino') buf.set(cx, topRow - 1, M);                  // swept up at the tips
    if (style === 'cat' || style === 'fox') {                           // pointed ears
      buf.hline(s > 0 ? cx : cx - 1, topRow - 1, 2, M);
      buf.set(cx, topRow - 2, style === 'fox' ? rgb(K.ink) : M);         // a fox's are black-tipped
    }
    if (style === 'owl') {                                              // feather tufts
      buf.set(cx, topRow - 1, M);
      buf.set(cx - s, topRow - 1, D);
      buf.set(cx, topRow - 2, D);
    }
  }
  // A proper fox is white under the eyes.
  if (style === 'fox') {
    const cream = rgb(K.cream);
    if (side) buf.hline(x0, eyeY + 1, 2, cream);
    else { buf.hline(x0, eyeY + 1, 2, cream); buf.hline(x1 - 1, eyeY + 1, 2, cream); }
  }

  // Eyes back on top, through the holes. Rims in a lighter colour on the dark
  // masks, or the eyes vanish into them.
  for (const ex of eyeXs(g)) {
    if (style === 'owl') buf.ellipse(ex, eyeY, 2.2, 2.2, rgb(K.cream));
    else if (style === 'cat') buf.rect(Math.round(ex - 2), eyeY - 1, 4, 3, rgb(K.gold));
    paintEye(buf, g.sp, g.c, ex, eyeY);
  }
  if (style === 'owl') {
    // And a little beak, between the eyes and pointing down: two pixels wide
    // from the front, where the eyes are an even number of columns apart.
    const bx = side ? Math.round(hx - rx + 0.4) : hx - 1;
    buf.hline(bx, eyeY + 1, side ? 1 : 2, rgb(K.orange));
    buf.set(bx, eyeY + 2, rgb(K.orangeDk));
  }
}

/**
 * A pointed hat: a brim, a band and a cone, drawn row by row from `widths`
 * (bottom up). The last two rows lean back, which is what makes it a witch's
 * hat and not a traffic cone.
 */
function pointyHat(buf, g, col, lt, band, widths, brim) {
  const C = rgb(col), L = rgb(lt), B = rgb(band);
  const cx = Math.round(g.hx);
  const by = crownOf(g) + 2;
  // Away from the face in profile, which is to the right; so to the left seen
  // from behind, and the right again from the front, for the look of the thing.
  const lean = g.dir === 'up' ? -1 : 1;
  buf.hline(cx - (brim >> 1), by, brim, C);
  buf.hline(cx - (brim >> 1) + 1, by + 1, brim - 2, rgb(shade(col, -0.3)));
  widths.forEach((w, i) => {
    const y = by - 1 - i;
    const off = i >= widths.length - 2 ? lean * (i - widths.length + 3) : 0;
    const x = cx - (w >> 1) + off;
    buf.hline(x, y, w, i === 0 ? B : C);
    if (i > 0 && w > 2) buf.set(x, y, L);                  // lit on the left
  });
  if (band === K.gold) {
    // The wizard's stars.
    buf.set(cx + 1, by - 3, B);
    buf.set(cx - 1, by - 5, B);
  }
}

/**
 * A cape: a sliver either side and round the ankles from the front, all of it
 * from behind. A royal one has an ermine collar.
 */
function cape(buf, g, layer, col, royal) {
  const C = rgb(col), D = rgb(shade(col, -0.25)), L = rgb(shade(col, 0.2)), In = rgb(K.cream);
  const { dir, bodyTop, legY, torsoX, torsoW, frame } = g;
  const hem = legY + 2;
  if (dir === 'down') {
    if (layer === 'under') {
      // In the shade of the villager in front of it, so a touch darker.
      for (let y = bodyTop + 1; y <= hem; y++) {
        const wide = 3 + (y - bodyTop >= 6 ? 1 : 0);
        buf.hline(torsoX - wide, y, torsoW + wide * 2, y - bodyTop < 3 ? C : D);
      }
    } else if (layer === 'over') {
      // Over the shoulders, and the clasp at the throat.
      buf.hline(torsoX - 2, bodyTop, torsoW + 4, royal ? In : C);
      buf.set(torsoX - 2, bodyTop + 1, royal ? In : C);
      buf.set(torsoX + torsoW + 1, bodyTop + 1, royal ? In : C);
      if (royal) for (let x = torsoX - 1; x < torsoX + torsoW + 1; x += 3) buf.set(x, bodyTop, rgb(K.ink));
      buf.rect(CHAR_W / 2 - 1, bodyTop, 2, 1, rgb(K.gold));
    }
  } else if (dir === 'up' && layer === 'over') {
    // From behind, the whole back of it.
    for (let y = bodyTop; y <= hem; y++) {
      const wide = 1 + (y - bodyTop >= 6 ? 1 : 0);
      buf.hline(torsoX - wide, y, torsoW + wide * 2, y === bodyTop ? L : C);
    }
    // Two folds, and a hem that swings with the walk.
    buf.vline(torsoX + 2, bodyTop + 3, hem - bodyTop - 3, D);
    buf.vline(torsoX + torsoW - 3, bodyTop + 3, hem - bodyTop - 3, D);
    if (frame % 2) buf.hline(torsoX - 2, hem, torsoW + 4, D);
    if (royal) buf.hline(torsoX - 1, bodyTop, torsoW + 2, In);
  } else if (dir === 'side' && layer === 'over') {
    // In profile it hangs off the back and trails behind as they walk.
    const back = torsoX + torsoW - 1;
    const trail = frame % 2 ? 1 : 0;
    for (let y = bodyTop; y <= hem; y++) {
      const w = 2 + Math.min(3, Math.floor((y - bodyTop) / 2)) + (y > bodyTop + 4 ? trail : 0);
      buf.hline(back - 1, y, w, C);
      buf.set(back - 1, y, y - bodyTop < 2 ? L : D);
    }
    buf.hline(torsoX + 1, bodyTop, torsoW - 1, royal ? In : C);
  }
}

/** A long robe over the legs, stars and all. The feet still peep out. */
function robe(buf, g) {
  const { c, dir, legY, torsoX, torsoW } = g;
  const C = rgb(c.cloth), D = rgb(c.clothDk);
  const bottom = CHAR_H - 3;
  for (let y = legY - 1; y <= bottom; y++) {
    const f = y - legY > 1 ? 1 : 0;
    const x = dir === 'side' ? torsoX : torsoX - f;
    buf.hline(x, y, torsoW + (dir === 'side' ? f + 1 : f * 2), y === bottom ? D : C);
  }
  const star = rgb(K.gold);
  if (dir !== 'up') { buf.set(torsoX + 1, legY, star); buf.set(torsoX + torsoW - 2, legY + 2, star); }
  else buf.set(torsoX + 3, legY + 1, star);
  buf.set(torsoX + 2, g.bodyTop + 3, star);
}

/** Stripes across the clothes, sleeves and all. `rows` count down from the collar. */
function stripes(buf, g, col, rows) {
  const S = rgb(col);
  const { dir, bodyTop, legY, torsoX, torsoW, step } = g;
  for (const r of rows) {
    const y = bodyTop + r;
    if (y >= legY) continue;
    buf.hline(torsoX, y, torsoW, S);
    // Sleeves too, riding up and down with the arm swing. Past row 6 of the
    // arm it's paw, which stays paw.
    if (r > 6) continue;
    if (dir === 'side') buf.hline(7, y + Math.max(0, -step), 3, S);
    else {
      buf.hline(torsoX - 2, y - step, 2, S);
      buf.hline(torsoX + torsoW, y + step, 2, S);
    }
  }
}

/** A round pumpkin suit, with a grin on the front and paws out of the sides. */
function pumpkinSuit(buf, g) {
  const { c, dir, bodyTop, torsoX, torsoW, step } = g;
  const O = rgb(K.orange), D = rgb(K.orangeDk), F = rgb(c.fur);
  const side = dir === 'side';
  const cx = side ? torsoX + torsoW / 2 - 0.5 : (CHAR_W - 1) / 2;
  const cy = bodyTop + 4.5;
  const rx = side ? 4.6 : torsoW / 2 + 1.6;
  buf.ellipse(cx, cy, rx, 4.4, O);
  buf.ellipseBlend(cx - 1.5, cy - 2, rx - 2.4, 1.6, rgb(K.orangeLt, 200));
  // Ridges.
  const ridges = side ? [Math.round(cx)] : [Math.round(cx - 2.5), Math.round(cx + 2.5)];
  for (const x of ridges) buf.vline(x, Math.round(cy - 3), 7, D);
  if (dir === 'down') {
    // A jack-o'-lantern grin: the friendly kind.
    const face = rgb(K.brownDk);
    buf.set(Math.round(cx - 1.5), bodyTop + 2, face);
    buf.set(Math.round(cx + 1.5), bodyTop + 2, face);
    buf.hline(Math.round(cx - 1.5), bodyTop + 5, 4, face);
    buf.set(Math.round(cx - 2.5), bodyTop + 4, face);
    buf.set(Math.round(cx + 2.5), bodyTop + 4, face);
  } else if (side) {
    buf.set(Math.round(cx - 3), bodyTop + 2, rgb(K.brownDk));
    buf.hline(Math.round(cx - 4), bodyTop + 5, 2, rgb(K.brownDk));
  }
  // Paws out of the armholes.
  const armY = bodyTop + 1, armH = 6;
  if (side) buf.rect(6, armY + armH + Math.max(0, -step) - 1, 2, 2, F);
  else {
    buf.rect(torsoX - 2, armY + armH - step - 1, 2, 2, F);
    buf.rect(torsoX + torsoW, armY + armH + step - 1, 2, 2, F);
  }
}

/** The pumpkin's lid: a green cap with a stalk on top. */
function stemCap(buf, g) {
  const cx = Math.round(g.hx);
  const top = crownOf(g);
  buf.ellipse(cx, top + 1.5, 3.4, 1.8, rgb(K.leaf));
  buf.hline(cx - 2, top, 3, rgb(K.leafLt));
  buf.rect(cx, top - 2, 1, 2, rgb(K.brown));
  buf.set(cx + 1, top - 2, rgb(K.leafLt));
  buf.set(cx + 2, top - 3, rgb(K.leaf));
}

/**
 * Bat wings, scalloped, flapping a pixel with each step. Behind the villager
 * when they face you, on their back when they don't.
 */
function batWings(buf, g, layer) {
  const { dir, bodyTop, torsoX, torsoW, frame } = g;
  const W = rgb(K.ink), R = rgb(K.inkLt);
  const flap = frame % 2 ? -1 : 0;
  if (dir === 'side') {
    if (layer !== 'over') return;
    // Folded, with the tip up past the shoulder.
    const x0 = torsoX + torsoW - 2;
    for (let i = 0; i < 7; i++) {
      const y = bodyTop - 2 + i + flap;
      const w = i < 2 ? i + 2 : i === 6 ? 2 : 4;
      buf.hline(x0 + (i < 2 ? 2 - i : 0), y, w, W);
    }
    buf.line(x0, bodyTop + flap, x0 + 3, bodyTop - 2 + flap, R);
    return;
  }
  if ((dir === 'down') !== (layer === 'under')) return;
  for (const s of [-1, 1]) {
    // Rows outward from the shoulder: rising to a point, then the scallops.
    const inner = s < 0 ? torsoX + 1 : torsoX + torsoW - 2;
    const outer = s < 0 ? 0 : CHAR_W - 1;
    const span = Math.abs(outer - inner);
    for (let k = 0; k <= span; k++) {
      const x = inner + s * k;
      const t = k / span;
      const yTop = Math.round(bodyTop + 1 - t * 5) + flap;
      // Scallops along the bottom edge: two dips across the wing.
      const dip = Math.round(Math.abs(Math.sin(t * Math.PI * 2)) * 2);
      const yBot = bodyTop + 7 - dip - Math.round(t * 3) + flap;
      buf.vline(x, yTop, yBot - yTop + 1, W);
    }
    // A rib from the shoulder to the tip.
    buf.line(inner, bodyTop + 1 + flap, outer, bodyTop - 4 + flap, R);
  }
}

/** Bat ears on a headband. */
function batEars(buf, g) {
  const cx = Math.round(g.hx);
  const top = crownOf(g);
  const W = rgb(K.ink), P = rgb(K.blush);
  const ears = g.dir === 'side' ? [cx + 1] : [cx - 3, cx + 3];
  buf.hline(cx - 4, top + 1, 9, W);
  for (const ex of ears) {
    buf.hline(ex - 1, top, 3, W);
    buf.hline(ex - 1, top - 1, 2, W);
    buf.set(ex - 1, top - 2, W);
    if (g.dir !== 'up') buf.set(ex, top, P);
  }
}

/** Little see-through wings, too small to fly on, which is fine. */
function beeWings(buf, g, layer) {
  const { dir, bodyTop, torsoX, torsoW, frame } = g;
  const Wn = rgb(K.wing), Wd = rgb('#b9d3e6');
  const flap = frame % 2 ? -1 : 0;
  if (dir === 'side') {
    if (layer !== 'over') return;
    buf.ellipse(torsoX + torsoW, bodyTop + flap, 1.8, 2.6, Wn);
    buf.set(torsoX + torsoW, bodyTop + 1 + flap, Wd);
    return;
  }
  if ((dir === 'down') !== (layer === 'under')) return;
  for (const s of [-1, 1]) {
    const x = s < 0 ? torsoX - 3 : torsoX + torsoW + 2;
    buf.ellipse(x, bodyTop + flap, 1.8, 2.4, Wn);
    buf.set(x, bodyTop + 1 + flap, Wd);
  }
}

/** Two bobbly antennae on a band. */
function antennae(buf, g) {
  const cx = Math.round(g.hx);
  const top = crownOf(g);
  const A = rgb(K.ink);
  const tips = g.dir === 'side' ? [[cx - 1, -2], [cx + 2, 1]] : [[cx - 2, -2], [cx + 2, 2]];
  for (const [x, dx] of tips) {
    buf.line(x, top + 1, x + (dx > 0 ? 1 : -1), top - 1, A);
    buf.rect(x + dx - (dx > 0 ? 0 : 1), top - 3, 2, 2, A);
  }
}

/** A patch over one eye, on a string. */
function eyepatch(buf, g) {
  const { hx, rx, eyeY, dir } = g;
  const P = rgb(K.ink);
  const top = crownOf(g) + 3;
  if (dir === 'up') {
    buf.line(Math.round(hx - rx + 1), eyeY, Math.round(hx + rx - 1), top, P);
    return;
  }
  const ex = eyeXs(g)[dir === 'side' ? 0 : 1];
  buf.rect(Math.round(ex - 1.5), eyeY - 1, 3, 3, P);
  if (dir === 'side') buf.hline(Math.round(ex + 1.5), eyeY - 1, Math.round(hx + rx - ex - 2), P);
  else buf.line(Math.round(ex - 1.5), eyeY - 1, Math.round(hx - rx + 1), top, P);
}

/** A pirate's hat, turned up at both ends, with a white badge. */
function pirateHat(buf, g) {
  const cx = Math.round(g.hx);
  const by = crownOf(g) + 2;
  const H = rgb(K.ink), T = rgb(K.gold);
  buf.hline(cx - 6, by, 13, H);
  buf.set(cx - 6, by - 1, H);
  buf.set(cx + 6, by - 1, H);
  buf.hline(cx - 4, by - 1, 9, H);
  buf.hline(cx - 3, by - 2, 7, H);
  buf.hline(cx - 2, by - 3, 5, H);
  buf.hline(cx - 5, by, 11, T);
  if (g.dir !== 'up') {
    buf.set(cx, by - 2, rgb('#ffffff'));
    buf.set(cx - 1, by - 1, rgb('#ffffff'));
    buf.set(cx + 1, by - 1, rgb('#ffffff'));
  }
}

/** A gold crown with a purple jewel in it. */
function crown(buf, g) {
  const cx = Math.round(g.hx);
  const top = crownOf(g);
  const G = rgb(K.gold), D = rgb(K.goldDk);
  buf.hline(cx - 3, top + 1, 7, G);
  buf.hline(cx - 3, top + 2, 7, D);
  for (const x of [cx - 3, cx, cx + 3]) buf.set(x, top, G);
  buf.set(cx, top - 1, G);
  buf.set(cx - 3, top - 1, G);
  buf.set(cx + 3, top - 1, G);
  buf.set(cx, top - 2, rgb(K.purpleLt));
  if (g.dir !== 'up') buf.set(cx, top + 1, rgb(K.purple));
}

/**
 * The sheet ghost: a dome with two holes cut in it and a hem that ripples as
 * they walk, feet showing underneath. Whoever's inside pushes up little bumps
 * where their ears are, so you can still tell the rabbit from the frog.
 */
function paintSheet(buf, g) {
  const { hx, cy, rx, ry, dir, frame, legY, sp, eyeY } = g;
  const S = rgb(K.sheet), D = rgb(K.sheetDk);
  const side = dir === 'side';
  const r = Math.max(rx, 5) + 0.4;
  const pokes = ['point', 'bigpoint', 'perk', 'long', 'tuft'].includes(sp.ears) || sp.horns || sp.antlers;
  if (pokes) {
    const tall = sp.ears === 'long' ? 1 : 0;       // a rabbit makes a proper tent of it
    const at = side ? [hx + 1.5] : [hx - 3, hx + 3];
    for (const x of at) buf.ellipse(x, cy - ry - 0.4 - tall, 1.4, 1.8 + tall, S);
  }
  buf.ellipse(hx, cy, r, ry + 0.2, S);
  const hem = legY + 2;
  const back = side ? 1 : 0;                        // in profile it trails behind
  for (let y = Math.round(cy); y <= hem; y++) {
    const t = (y - cy) / (hem - cy);
    const half = r + t * 1.4;
    const x0 = Math.round(hx - half + t * back), x1 = Math.round(hx + half + t * back * 2);
    buf.hline(x0, y, x1 - x0 + 1, S);
    buf.set(x1, y, D);                              // shade down the right-hand side
  }
  // A ripple along the hem, moving as they go.
  const x0 = Math.round(hx - r - 1.4), x1 = Math.round(hx + r + 1.4 + back * 2);
  for (let x = x0; x <= x1; x++) {
    const k = (x + frame) % 4;
    if (k === 0 || k === 1) buf.set(x, hem + 1, k ? D : S);
  }
  // A fold or two, so it reads as cloth.
  buf.vline(Math.round(hx - 2 + back), g.bodyTop + 2, hem - g.bodyTop - 3, D);
  if (!side) buf.vline(Math.round(hx + 3), g.bodyTop + 3, hem - g.bodyTop - 4, D);

  if (dir === 'up') return;
  // Eye holes, and a touch of blush, because it's a nice ghost.
  const hole = rgb(K.ink);
  for (const ex of eyeXs(g)) buf.rect(Math.round(ex - 1), eyeY - 1, 2, 2, hole);
  const pink = rgb(K.blush, 170);
  if (side) buf.ellipseBlend(hx - r + 2, eyeY + 2, 1.2, 0.8, pink);
  else {
    buf.ellipseBlend(hx - 3.8, eyeY + 2, 1.2, 0.8, pink);
    buf.ellipseBlend(hx + 3.8, eyeY + 2, 1.2, 0.8, pink);
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
export function charBuf(speciesKey, coatKey, clothHex, dir, frame, costume) {
  const c = makePalette(coatKey, clothHex);
  const base = dir === 'right' || dir === 'left' ? 'side' : dir;
  // A hat needs rows above the head, so a sprite in one is taller than
  // CHAR_H by `top`; the villager is painted that far down it, as usual.
  const top = costumeTop(costume);
  const buf = new PixBuf(CHAR_W, CHAR_H + top);
  paintChar(top ? lowered(buf, top) : buf, speciesKey, c, base, frame, costume);
  return dir === 'right' ? mirror(buf) : buf;
}

/**
 * Villager sprite. `costume` is optional, a COSTUMES key; a costumed sprite
 * may be taller than CHAR_H (costumeTop), so draw it by its feet.
 */
export function charSprite(speciesKey, coatKey, clothHex, dir, frame, costume) {
  // Everyday clothes keep the key they always had.
  const key = `c|${speciesKey}|${coatKey}|${clothHex}|${dir}|${frame}${costume ? '|' + costume : ''}`;
  return cache.get(key, () => charBuf(speciesKey, coatKey, clothHex, dir, frame, costume).toCanvas());
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


// ---------------------------------------------------------------------------
// The riding bear
// ---------------------------------------------------------------------------
//
// Four-legged like the cats, and drawn the same way, but three times the volume
// and with none of the delicacy: a heavy wedge of shoulder, a low head, and
// feet like dinner plates. She has to read as *large* at a glance from across a
// field, because the whole point of her is that she is bigger than the valley's
// problems.

const BEAR_COAT = '#8a6242';

function paintBear(buf, dir, frame, pose) {
  const F = rgb(BEAR_COAT);
  const D = rgb(shade(BEAR_COAT, -0.28));
  const L = rgb(shade(BEAR_COAT, 0.16));
  const E = rgb('#2f2a3d');
  const snout = rgb(shade(BEAR_COAT, -0.4));
  const cx = BEAR_W / 2;
  const bob = frame % 2 === 1 ? -1 : 0;
  const ground = BEAR_H - 2;

  const ears = (hx, hy, r) => {
    for (const s of [-1, 1]) {
      buf.ellipse(hx + s * (r - 0.6), hy - r + 0.8, 2.0, 1.8, F);
      buf.ellipse(hx + s * (r - 0.6), hy - r + 1.0, 1.0, 0.9, D);
    }
  };
  const shadow = (rx) => buf.ellipseBlend(cx, ground + 1, rx, 2.0, rgb('#000000', 60));

  if (pose === 'sleep') {
    // A hill with a nose. Everything tucked in, nothing moving but breathing.
    buf.ellipse(cx + 1, ground - 5, 12.5, 6.6, F);
    buf.ellipseBlend(cx + 1, ground - 8, 8.0, 3.4, L);
    buf.ellipse(cx - 8, ground - 4, 5.0, 4.4, F);    // head down on her paws
    ears(cx - 8, ground - 5, 4.6);
    buf.ellipse(cx - 11, ground - 2.5, 2.4, 1.8, snout);
    buf.hline(cx - 11, ground - 4, 3, E);            // one shut eye, a line
    buf.ellipse(cx - 4, ground - 1, 3.0, 1.6, D);    // front paws, tucked
    buf.ellipse(cx + 9, ground - 2, 3.4, 2.4, D);    // rump
    outline(buf);
    shadow(11);
    return;
  }

  if (pose === 'sit') {
    buf.ellipse(cx + 2, ground - 4, 7.0, 5.6, F);     // haunches
    buf.ellipse(cx - 1, ground - 8, 6.2, 6.4, F);     // chest, upright
    buf.ellipseBlend(cx - 1.5, ground - 9, 4.2, 4.4, L);
    buf.rect(cx - 5, ground - 4, 3, 4, F);            // front legs
    buf.rect(cx + 1, ground - 4, 3, 4, F);
    buf.ellipse(cx - 5, ground - 1, 2.4, 1.4, D);     // paws
    buf.ellipse(cx + 2, ground - 1, 2.4, 1.4, D);
    const hy = ground - 15 + bob;
    buf.ellipse(cx - 1, hy, 5.2, 4.6, F);
    ears(cx - 1, hy, 5.0);
    buf.rect(cx - 4, hy - 1, 2, 2, E);
    buf.rect(cx + 1, hy - 1, 2, 2, E);
    buf.ellipse(cx - 1, hy + 3, 2.8, 2.0, snout);
    buf.rect(cx - 1, hy + 2, 2, 1, E);
    outline(buf);
    shadow(9);
    return;
  }

  if (pose === 'sniff') {
    // Standing, rump up, nose in the grass. She spends most of a quiet
    // afternoon like this, working along the ground after something.
    buf.rect(cx + 5, ground - 8, 3, 7, F);            // back legs, straight
    buf.rect(cx + 9, ground - 8, 3, 7, F);
    buf.ellipse(cx + 6, ground - 1, 2.2, 1.4, D);
    buf.ellipse(cx + 10, ground - 1, 2.2, 1.4, D);
    buf.ellipse(cx + 4, ground - 11, 8.0, 4.8, F);    // high shoulder at the back
    buf.ellipse(cx - 4, ground - 9, 8.5, 4.6, F);     // body sloping down
    buf.ellipseBlend(cx - 1, ground - 11, 6.0, 2.6, L);
    buf.rect(cx - 7, ground - 7, 3, 6, F);            // front legs, shorter drop
    buf.rect(cx - 3, ground - 7, 3, 6, F);
    buf.ellipse(cx - 6, ground - 1, 2.2, 1.4, D);
    buf.ellipse(cx - 2, ground - 1, 2.2, 1.4, D);
    const hy = ground - 5 + bob;                       // head down at the front
    buf.ellipse(cx - 9, hy, 4.6, 4.0, F);
    ears(cx - 9, hy, 4.4);
    buf.rect(cx - 10, hy - 1, 2, 2, E);
    buf.ellipse(cx - 12, hy + 2.5, 2.6, 1.8, snout);
    outline(buf);
    shadow(10);
    return;
  }

  // ---- standing and walking ----
  const lift = frame % 4;
  const bodyY = ground - 10 + bob;

  // The long body and the rump belong to the side view alone. Drawn for every
  // direction, as they were, a bear coming towards you is as wide as she is
  // long and wears her own backside on her right hip.
  if (dir === 'side') {
    buf.ellipse(cx + 1, bodyY, 13.5, 7.0, F);
    buf.ellipseBlend(cx + 1, bodyY - 3, 10.0, 4.0, L);
    buf.ellipse(cx + 11, bodyY + 1, 4.2, 3.6, D);       // rump
  }

  // Four legs from the side, where you can see all four.
  if (dir === 'side') {
    const legs = [[cx - 10, 0], [cx - 4, 1], [cx + 3, 1], [cx + 9, 0]];
    legs.forEach(([lx, phase], i) => {
      const up = pose === 'walk' && (lift === (phase ? 1 : 3) || lift === (phase ? 2 : 0)) ? 1 : 0;
      buf.rect(lx, bodyY + 4, 3, 6 - up, F);
      buf.ellipse(lx + 1, bodyY + 10 - up, 2.2, 1.4, D);
      if (i === 1) buf.ellipseBlend(lx + 1, bodyY + 6, 1.4, 2.0, D);
    });
  }

  const hy = bodyY - 4;
  if (dir === 'down' || dir === 'up') {
    // Facing the camera she is a wall of shoulder with the head *in front of*
    // it, low and near the viewer — not on top, where a rider would sit on it
    // and she would read as a footstool with ears.
    // About the width of a person, not of a bear seen side-on. She is deep
    // rather than wide from this angle, and drawing her at her own length made
    // her read as a rug with ears.
    buf.ellipse(cx, bodyY - 2, 7.6, 7.4, F);
    buf.ellipseBlend(cx, bodyY - 4, 5.2, 4.2, L);

    // One pair of legs, not four. Coming towards you the front pair is what
    // you can see and the back pair is behind her; going away, the other way
    // round. Drawing all four put a beetle under the rider.
    //
    // The stance differs because the halves of a bear do: she is narrow at the
    // shoulder and wide at the hip, so from behind the legs sit further apart.
    const stance = dir === 'down' ? 4 : 5;
    for (const side of [-1, 1]) {
      const lx = Math.round(cx + side * stance) - 1;
      // The two swing against each other, which is what walking looks like
      // from the front. In step they read as hopping.
      const up = pose === 'walk' && ((lift < 2) === (side < 0)) ? 1 : 0;
      buf.rect(lx, bodyY + 3, 4, 8 - up, F);
      buf.ellipse(lx + 1.5, bodyY + 11 - up, 2.6, 1.5, D);
    }

    if (dir === 'down') {
      // Ears on top of the shoulders rather than on the head. The head is low
      // and near the viewer from here, so its own ears would be behind her
      // back — true, and unreadable at this size, which is worse than true.
      ears(cx, bodyY - 6.5, 4.6);
      const fy = bodyY + 4;   // whole pixels: the face is eyes and a mouth, and half a row of either is a smudge
      buf.ellipse(cx, fy, 5.0, 4.2, F);
      buf.ellipseBlend(cx, fy - 1, 3.4, 2.4, L);
      buf.rect(cx - 3, fy - 1, 2, 2, E);
      buf.rect(cx + 1, fy - 1, 2, 2, E);
      buf.ellipse(cx, fy + 2.4, 3.0, 2.0, snout);
      buf.rect(cx - 1, fy + 2, 2, 1, E);
    } else {
      // Going away: the back of a head and two ears above the shoulders, and
      // the tail where a tail is — in the middle, low down. From the front
      // there is no tail to see, so none is drawn.
      buf.ellipse(cx, bodyY + 3.5, 1.9, 1.6, D);
      buf.ellipse(cx, bodyY - 7, 4.6, 3.4, F);
      ears(cx, bodyY - 7.5, 4.6);
    }
    outline(buf);
    shadow(7);
    return;
  }

  buf.ellipse(cx - 11, hy + 3, 5.4, 4.6, F);
  ears(cx - 11, hy + 3, 5.2);
  buf.rect(cx - 13, hy + 2, 2, 2, E);
  buf.ellipse(cx - 15, hy + 5, 2.8, 2.2, snout);
  buf.rect(cx - 15, hy + 4, 2, 1, E);
  outline(buf);
  shadow(10);
}

/**
 * The bear, memoised like everything else. `pose` is walk | sit | sleep |
 * sniff; `dir` is the four cardinals, with left drawn and right mirrored.
 */
export function bearSprite(dir, frame, pose = 'walk') {
  const key = `b|${dir}|${frame}|${pose}`;
  return cache.get(key, () => {
    const base = dir === 'right' || dir === 'left' ? 'side' : dir;
    const buf = new PixBuf(BEAR_W, BEAR_H);
    paintBear(buf, base, frame, pose);
    return (dir === 'right' ? mirror(buf) : buf).toCanvas();
  });
}

/** Where a rider's feet sit on her back, per direction. */
export function bearSaddle(dir) {
  if (dir === 'left') return { x: 2, y: -13 };
  if (dir === 'right') return { x: -2, y: -13 };
  return { x: 0, y: -14 };
}

/** Small emote bubble shown above a head. */
/** Bubbles that are thought rather than said. */
const THOUGHTS = new Set(['wonder']);

export function emoteSprite(kind) {
  return cache.get(`e|${kind}`, () => {
    const buf = new PixBuf(16, 14);
    const bg = rgb('#fdf6e6'), ed = rgb('#5b5170');
    buf.ellipse(8, 6, 6.4, 5.2, bg);
    outline(buf, '#5b5170');
    // Said out loud gets a pointed tail; thought gets two round ones trailing
    // off, which is how you tell somebody talking from somebody wondering.
    if (THOUGHTS.has(kind)) {
      buf.ellipse(6, 11, 1.6, 1.3, bg);
      buf.ellipse(4, 13, 1.1, 0.9, bg);
      outline(buf, '#5b5170');
    } else {
      buf.set(7, 11, ed); buf.set(8, 11, bg); buf.set(9, 11, ed);
      buf.set(8, 12, ed);
    }
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
      case 'wonder': {
        // A question mark, in a thought bubble: this one has something to ask
        // you and is waiting to be spoken to.
        const q = rgb('#4a4258');
        buf.hline(6, 3, 4, q); buf.set(10, 4, q); buf.set(10, 5, q);
        buf.set(9, 6, q); buf.set(8, 7, q);
        buf.set(8, 9, q);
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
