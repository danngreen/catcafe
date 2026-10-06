// Halloween, Oct 4 – Nov 4. See ../content.js for what each hook is for.

import { decorateWorld, interact } from './world.js';
import { costumeFor } from './costumes.js';
import { COSTUME_LIST } from '../../art/chars.js';
import { fillHouse, visitResident } from './houses.js';

// Every costume the villagers wear, the player may wear too (Change costume).
const playerCostumes = COSTUME_LIST;

export default { decorateWorld, interact, costumeFor, fillHouse, visitResident, playerCostumes };
