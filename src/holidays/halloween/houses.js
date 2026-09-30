// Halloween at home: families in the cottages, and a strawberry at every door.
//
// On an ordinary day a cottage is empty unless somebody is waiting on an order.
// For Halloween the whole family is in, and the first of them you talk to has a
// strawberry for you. Strawberries come from nowhere else (the family decided
// that), so going door to door is the whole point: one per house, per year.
//
// Nobody here is written down. A family is made up from the house's id, the
// same way householder() makes up whoever answers the door, so the same cottage
// always has the same people in it, in every browser in a shared valley, and
// without anything being saved or sent.

import { makeRng, hashStr } from '../../engine/util.js';
import { audio } from '../../engine/audio.js';
import { TILE } from '../../art/tiles.js';
import { SPECIES_LIST, COAT_LIST } from '../../art/chars.js';
import { Villager } from '../../game/entities.js';
import { VILLAGERS } from '../../world/villagerdata.js';
import { RESIDENT_NAMES, householder } from '../../world/residents.js';

/** What every house gives out. The quest checks read it from here. */
export const TREAT_ITEM = 'strawberry';

/**
 * The flag that says this house has already given you its strawberry. The
 * prefix is shared with other code (and `halloween_` means it's wiped when next
 * year's Halloween starts, so every door has a strawberry again).
 */
export const treatFlag = (houseId) => `halloween_treat_${houseId}`;

// ---------------------------------------------------------------------------
// Who lives here
// ---------------------------------------------------------------------------

// A resident called Nettle in a cottage in Hollowdown, with Nettle the hedgehog
// down the road in Brambleford, is two people you can't tell apart by name. The
// householder's name is already fixed by residents.js, but the rest of the
// family can do without the cast's names.
const CAST_NAMES = new Set(VILLAGERS.map((v) => v.name));

/**
 * The family at a cottage, first member first: 1 to 4 of them, the same every
 * time for the same house. The first is always householder(houseId), the one
 * who answers the door and takes the deliveries. After them there may be a
 * second grown-up, and the rest are kids.
 */
export function family(houseId) {
  const head = householder(houseId);
  const rng = makeRng(hashStr(houseId));
  // householder() drew three numbers from this same stream for the name,
  // species and coat. Step past them, so the size of the family isn't just the
  // householder's name wearing a different hat.
  rng(); rng(); rng();
  const size = 1 + rng.int(4);
  const used = new Set([head.name]);
  const out = [{ name: head.name, species: head.species, coat: head.coat, grown: true }];
  for (let n = 1; n < size; n++) {
    const pool = RESIDENT_NAMES.filter((x) => !used.has(x) && !CAST_NAMES.has(x));
    const name = pool[rng.int(pool.length)];
    used.add(name);
    // Families mostly look like each other, but not always.
    const species = rng.chance(0.75) ? head.species : SPECIES_LIST[rng.int(SPECIES_LIST.length)];
    const coat = rng.chance(0.5) ? head.coat : COAT_LIST[rng.int(COAT_LIST.length)];
    out.push({ name, species, coat, grown: n === 1 && rng.chance(0.5) });
  }
  return out;
}

/** The id a family member goes by: `resident:<house>:<n>`. */
const memberId = (houseId, n) => `resident:${houseId}:${n}`;

/**
 * Tiles somebody can stand on and potter about from. Not a wall, not under
 * furniture, and well away from the door: the doormat is the tile you leave
 * by, the one above it is the tile you arrive on, and somebody wandering onto
 * either would be standing in your way in or out. A cottage door isn't an
 * interact door, so the villagers' own step-off-the-doorstep rule doesn't
 * cover it; keeping their home three rows back, with a wander of about a tile,
 * does.
 */
function standingRoom(map) {
  const { room, door } = map.meta;
  const out = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (map.solid(x, y)) continue;
      if (Math.abs(x - door.x) <= 2 && y >= door.y - 3) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/**
 * Who's home. Called every time you walk into a cottage, right after the
 * delivery recipient (if any) has been put in or taken out. The interior is
 * built once and kept, so this clears out the family from last time and puts
 * them back, rather than adding a second family on every visit.
 *
 * If somebody is waiting on an order, they *are* the householder, so the
 * family goes in without its first member. Once the order is handed over the
 * recipient leaves the room, and next time you come in the householder is back
 * with everyone else.
 */
export function fillHouse(game, map, houseId) {
  if (!map || !map.meta || !map.meta.room || !map.meta.door) return;
  const others = (map.villagers || []).filter((v) => !(v.def && v.def.resident && !v.recipient));
  const recipient = others.find((v) => v.recipient);
  map.villagers = others;

  // Placed from the house's own RNG, so the family stands in the same places
  // each visit (they wander a little once they're in).
  const rng = makeRng(hashStr(`${houseId}:rooms`));
  const free = rng.shuffle(standingRoom(map));
  const taken = recipient ? [{ x: recipient.tx, y: recipient.ty }] : [];
  const roomy = (s) => taken.every((t) => Math.abs(t.x - s.x) + Math.abs(t.y - s.y) >= 2);

  const members = family(houseId);
  members.forEach((m, n) => {
    if (n === 0 && recipient) {
      // The recipient's def comes from main.js. Say who they are, for anything
      // that asks, without changing how they behave: talking to them is still
      // the delivery, which wins over a family visit.
      recipient.def.resident = true;
      recipient.def.house = houseId;
      recipient.def.grown = true;
      return;
    }
    const spot = free.find(roomy) || free.find((s) => !taken.some((t) => t.x === s.x && t.y === s.y));
    if (!spot) return;
    taken.push(spot);
    const def = {
      id: memberId(houseId, n),
      name: m.name,
      species: m.species,
      coat: m.coat,
      resident: true,
      house: houseId,
      grown: m.grown,
      lines: ['*waves hello*'],
    };
    const v = new Villager(def, spot.x * TILE + TILE / 2, (spot.y + 1) * TILE - 2);
    // A front room, not a field. About a tile of pottering about, which also
    // keeps them clear of the door (see standingRoom).
    v.range = 6;
    map.villagers.push(v);
  });
}

// ---------------------------------------------------------------------------
// What they say
// ---------------------------------------------------------------------------

/** Gentle Halloween jokes, as [question, answer]. For little kids: nothing scary. */
export const PUNS = [
  ["What's a ghost's favorite fruit?", 'Boo-berries!'],
  ["What's a ghost's favorite drink at a cafe?", 'Boo-ble tea!'],
  ['Why did the cookie dress up as a ghost?', 'It wanted to be a sheet cake!'],
  ['Why are ghosts so bad at keeping secrets?', 'Because you can see right through them!'],
  ['What does a cat dress up as for Halloween?', 'A mew-mmy!'],
  ['Why did the cat dress up as a lemon?', "Because it's a sour puss!"],
  ['What do you call a pumpkin that works at the beach?', 'A life-gourd!'],
  ['What did the pumpkin say to the pumpkin carver?', 'Cut it out!'],
  ["What's a pumpkin's favorite sport?", 'Squash!'],
  ['How do you fix a broken jack-o\'-lantern?', 'With a pumpkin patch!'],
  ["Why was the jack-o'-lantern invited to every party?", 'It always lights up the room!'],
  ['Why did the pumpkin order a pumpkin latte?', "It wanted to feel gourd-geous!"],
  ['What do owls say on Halloween?', 'Happy Owl-o-ween!'],
  ['Why did the owl go to the Halloween party?', 'Because it was a hoot!'],
  ['What do bats do for fun?', 'They just hang out!'],
  ["What's a bat's favorite subject in school?", 'The alpha-bat!'],
  ["What's a witch's favorite subject in school?", 'Spelling!'],
  ['Why do witches wear name tags?', 'So they know which witch is which!'],
  ['What do you call a witch at the beach?', 'A sand-witch!'],
  ['What do you call a dog who does magic tricks?', 'A labracadabrador!'],
  ['What kind of music do mummies like?', 'Wrap music!'],
  ["Why don't mummies ever take a vacation?", "They're afraid they'll relax and unwind!"],
  ["Why didn't the skeleton go to the party?", 'He had no body to go with!'],
  ['Why did the scarecrow win a prize?', 'Because he was outstanding in his field!'],
  ['What did the baby corn say to the mama corn?', "Where's pop corn?"],
  ["What's a mouse's favorite Halloween game?", 'Hide and squeak!'],
  ['What candy do frogs love on Halloween?', 'Lolli-hops!'],
  ['Why was the strawberry so upset?', 'It got itself into a jam!'],
];

// Whoever opens the door, the first time you knock.
const TREAT_LINES = [
  "Happy Halloween! We saved the reddest strawberry in the basket for the first one to knock, and that's you.",
  "Trick or treat? There are no tricks in this house, just treats. Here's a strawberry, picked this morning.",
  "*peeks around the door* Oh, a trick-or-treater! Hold out your paws. There you go, one strawberry.",
  "You're our very first trick-or-treater this year! That calls for the biggest strawberry we've got.",
  "Come in, come in, it's chilly out there. Have a strawberry. They only grow this time of year, you know.",
  "Happy Halloween! Here, take a strawberry. Don't tell the neighbors, but ours are the sweetest in the valley.",
  "Oh, hello! We've got a whole bowl of strawberries by the door just for visitors. This one's yours.",
];

// The grown-ups, once you've had your strawberry.
const GROWN_CHATTER = [
  'We carved three pumpkins this year. One is supposed to be a cat, but it looks more like a potato with ears.',
  "The kids have been planning their costumes since summer. I've been told they're a secret, even from me.",
  "Have you tried a pumpkin latte yet? They taste exactly like October. I'd drink one every day if I could.",
  'We always put a lantern in the window for Halloween, so everybody out trick-or-treating can find their way home.',
  "Every year I say I'll start my costume early, and every year I'm sewing it the night before.",
  "Somebody grew a corn maze out by the farm near Brambleford, and it's shaped like a cat. I went in and came out an hour later, very confused.",
  "Strawberries only turn up at Halloween, so we eat as many as we can while they're here. It's for our health, you understand.",
  "They say a very old dog walks the lanes of Brambleford after dark. My grandmother says he's the politest ghost in the valley.",
  "It's so nice to see everyone out and about in their costumes. The whole valley feels like one big party.",
  "Take care walking home. It gets dark so early this time of year, but the pumpkins light the way.",
];

// The kids.
const KID_CHATTER = [
  "I'm going to be a pumpkin for Halloween! A pumpkin with whiskers, because I'm keeping my whiskers.",
  "I've been practicing my spooky face. *makes a face that's mostly cheeks* Was that spooky? Be honest.",
  'Do the cats at your cafe dress up for Halloween? A cat in a tiny witch hat would be the best thing ever.',
  "I already ate four strawberries today. Don't tell anybody. Well, you can tell the cats.",
  "When I grow up, I'm going to open a pumpkin shop. Everything will be orange, even the door.",
  "*whispers* We get to stay up late all week because it's Halloween. That's the best part.",
  "Knock, knock! ...Oh, you're supposed to say who's there. Never mind, I forgot the rest anyway.",
  "I'm not scared of ghosts at all. Ghosts are just people who are really good at hide-and-seek.",
  "We're going trick-or-treating together later! I'm in charge of carrying the bag, because I'm the best at it.",
  "Guess what? I know a joke. Want to hear it? Okay, hold on, I have to remember it first.",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** "Want to hear a Halloween joke? ...", with the answer as its own line. */
function punText() {
  const [q, a] = pick(PUNS);
  const lead = pick([
    'Oh, and here\'s a Halloween joke for you.',
    'Want to hear a Halloween joke?',
    'I have a joke for you, too.',
    'Before you go, here\'s a joke.',
  ]);
  return `${lead} ${q}\n\n${a}`;
}

/**
 * Talking to somebody at home. The first person you talk to in a house gives
 * you its strawberry, once a year; after that the family just chats, and now
 * and then somebody can't resist a joke.
 */
export function visitResident(game, v, finish) {
  const def = v.def;
  if (!def || !def.house) return false;
  const st = game.state;
  const flag = treatFlag(def.house);
  let text;
  let treat = false;
  if (!st.flags[flag]) {
    // Given before the words rather than after them, so the valley's books
    // are right however the conversation ends.
    st.flags[flag] = true;
    st.touch('flags');
    st.give(TREAT_ITEM, 1);
    treat = true;
    text = pick(TREAT_LINES);
    if (Math.random() < 0.5) text += `\n\n${punText()}`;
  } else {
    // Don't say the same thing twice running, if there's anything else to say.
    const lines = def.grown ? GROWN_CHATTER : KID_CHATTER;
    let line = pick(lines);
    for (let i = 0; i < 4 && line === v.lastChat; i++) line = pick(lines);
    v.lastChat = line;
    text = line;
    if (Math.random() < 0.3) text += `\n\n${punText()}`;
  }
  if (treat) audio.sfx('quest', { gain: 0.5 });
  game.dialogue.say(text, {
    speaker: def.name,
    onDone: () => {
      finish();
      // After the words, so it isn't hidden behind the dialogue box.
      if (treat) game.hud.toast(`You got a ${st.itemName(TREAT_ITEM).toLowerCase()}!`, 'good');
    },
  });
  return true;
}
