// What each holiday adds to the valley, by id. The dates live in index.js,
// which the server also imports; this file pulls in art and game code, so it's
// the browser's side only.
//
// Every hook is optional. The game calls them through holidayHook(), which does
// nothing when no holiday is on or the holiday has no such hook. (Not `?.()`:
// the old iPads' Safari 12 refuses the whole module over it; see tools/oldjs.cjs.)
//
//   decorateWorld(world, seed)       after the valley is generated. Decorations,
//                                    a corn maze... Must use its own RNG, never
//                                    the world's, so the ordinary valley is
//                                    exactly the same with or without it.
//   costumeFor(villagerId, st)       what a villager wears, or null. Asked again
//                                    whenever quests change, so one can depend
//                                    on them (Pebble's, once it's found).
//   fillHouse(game, map, houseId)    who's home when you walk into a cottage.
//   visitResident(game, v, finish)   talking to somebody at home; return true
//                                    if it handled the conversation.
//   playerCostumes                   (a list, not a hook) the costumes players may
//                                    put on from the pause menu. A costume is
//                                    only drawn while its holiday is on.
//   interact(game, it, tile)         an interact tile the game doesn't know
//                                    (its `kind` is the holiday's own); give it
//                                    a `prompt` for the label on screen.

import { holiday } from './index.js';
import halloween from './halloween/index.js';

const CONTENT = { halloween };

export function holidayContent() {
  const h = holiday();
  return (h && CONTENT[h.id]) || {};
}

/** Call a hook of the holiday that's on, if it has one. Undefined otherwise. */
export function holidayHook(name, ...args) {
  const fn = holidayContent()[name];
  return typeof fn === 'function' ? fn(...args) : undefined;
}
