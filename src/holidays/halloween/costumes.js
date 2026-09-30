// Who wears what for Halloween.
//
// Everyone's costume is rolled from their id, so it's the same one every day
// of the season, on every screen in a shared valley, and it comes back the
// same next year: the baker is a witch every October, and that's just how it
// is. The art for each one lives with the rest of the villager art in
// src/art/chars.js; this only decides who gets which.
//
// Roughly: one in seven doesn't bother, a third put on a mask, and the rest
// go all out.

import { makeRng, hashStr } from '../../engine/util.js';
import { COSTUMES, COSTUME_LIST } from '../../art/chars.js';

const MASKS = COSTUME_LIST.filter((k) => COSTUMES[k].kind === 'mask');
const OUTFITS = COSTUME_LIST.filter((k) => COSTUMES[k].kind === 'full');

const NONE = 0.15;
const MASK = 0.35;

// A few people it's decided for. Sir Woofers is already a ghost, and has been
// talked into going as a pumpkin, which he's very patient about. Pebble has lost
// his dragon costume (that's the quest "The Missing Costume"), so he's the one
// villager in ordinary clothes.
const CHOSEN = {
  woofers: 'pumpkin',
  pebble: null,
};

/** A costume key for this villager, or null. See ../content.js. */
export function costumeFor(villagerId) {
  if (villagerId == null || villagerId === '') return null;
  const id = String(villagerId);
  if (Object.prototype.hasOwnProperty.call(CHOSEN, id)) return CHOSEN[id];
  // Salted, so the roll has nothing to do with the one that picked their
  // species and coat from the same id.
  const rng = makeRng(hashStr('halloween-costume|' + id));
  const r = rng();
  if (r < NONE) return null;
  if (r < NONE + MASK) return rng.pick(MASKS);
  return rng.pick(OUTFITS);
}
