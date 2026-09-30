// The people who live in the cottages. Not part of the cast in villagerdata.js:
// they're made up from the house's id, so the same door always opens on the same
// face, and nobody has to write them down.

import { makeRng, hashStr } from '../engine/util.js';
import { SPECIES_LIST, COAT_LIST } from '../art/chars.js';

export const RESIDENT_NAMES = [
  'Amble', 'Perch', 'Wick', 'Fettle', 'Cobble', 'Tansy', 'Dabble', 'Rook',
  'Nettle', 'Havers', 'Muddle', 'Quince', 'Sorrel', 'Pippin', 'Larch',
];

/**
 * Whoever answers the door at a cottage: the one who takes the deliveries, and
 * during a holiday the first of the family you meet there. Always the same
 * name and look for the same house.
 */
export function householder(houseId) {
  const rng = makeRng(hashStr(houseId));
  return {
    name: RESIDENT_NAMES[rng.int(RESIDENT_NAMES.length)],
    species: SPECIES_LIST[rng.int(SPECIES_LIST.length)],
    coat: COAT_LIST[rng.int(COAT_LIST.length)],
  };
}
