// Static description of the valley: five settlements, the shops in them, the
// villagers who live there, and what everyone has to say.

export const TOWNS = [
  {
    id: 'brambleford',
    name: 'Brambleford',
    blurb: 'A muddle of thatch and crooked lanes around a duck-pond.',
    x: 96, y: 168, w: 44, h: 34,
    style: { wall: '#efe2c8', roofs: ['#c86a4a', '#d0a659', '#5a6472'], timbered: true },
    music: 'town',
  },
  {
    id: 'hollowdown',
    name: 'Hollowdown',
    blurb: 'Terraced into the chalk hills; everything is up or down some steps.',
    x: 208, y: 68, w: 40, h: 32,
    style: { wall: '#e6dcc2', roofs: ['#5a6472', '#7d8794', '#c86a4a'], timbered: false },
    music: 'town',
  },
  {
    id: 'saltmere',
    name: 'Saltmere',
    blurb: 'Fishing cottages, tarred boats, and gulls with opinions.',
    x: 62, y: 234, w: 38, h: 26,
    style: { wall: '#dfe6e8', roofs: ['#4f6a72', '#7d8794', '#b2624b'], timbered: false },
    music: 'town',
  },
  {
    id: 'thistlewick',
    name: 'Thistlewick',
    blurb: 'Market town. If it exists, somebody here is selling it at a markup.',
    x: 266, y: 196, w: 46, h: 34,
    style: { wall: '#f0e4cc', roofs: ['#b2624b', '#c86a4a', '#d0a659'], timbered: true },
    music: 'town',
  },
  {
    id: 'oakhollow',
    name: 'Oakhollow',
    blurb: 'Six houses and a very large tree, deep in the woods.',
    x: 292, y: 84, w: 26, h: 22,
    style: { wall: '#e8dcc2', roofs: ['#7d8794', '#d0a659', '#6b7d54'], timbered: true },
    music: 'field',
  },
];

/**
 * Shops. `sign` picks the pictogram over the door, `stock` names the goods
 * catalogue in items.js, and `hours` is [openHour, closeHour] on a 24h clock.
 * `days` lists weekdays the place opens (0 = Sunday).
 */
export const SHOPS = [
  {
    id: 'cafe', town: 'brambleford', name: 'Your Cat Cafe', sign: 'cafe',
    kind: 'home', tw: 5, wall: '#f5e8cc', roof: '#c86a4a', roofStyle: 'tile', awning: '#c05a7a',
    hours: [0, 24], days: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: 'grocer', town: 'brambleford', name: "Pips' Provisions", sign: 'grocer',
    kind: 'shop', stock: 'grocer', keeper: 'pip', tw: 4, roof: '#5a6472',
    hours: [7, 19], days: [1, 2, 3, 4, 5, 6],
    greet: 'Morning! Fresh in today, and only slightly squashed.',
  },
  {
    id: 'bakery', town: 'brambleford', name: 'The Warm Loaf', sign: 'bakery',
    kind: 'shop', stock: 'bakery', keeper: 'dough', tw: 4, roof: '#d0a659', roofStyle: 'thatch', awning: '#e08b3f',
    hours: [6, 15], days: [0, 2, 3, 4, 5, 6],
    greet: 'Everything you can smell is for sale. Including the smell.',
  },
  {
    id: 'petshop', town: 'brambleford', name: 'Whisker & Paw', sign: 'petshop',
    kind: 'cats', stock: 'petshop', keeper: 'marigold', tw: 5, roof: '#c86a4a',
    hours: [9, 18], days: [1, 2, 3, 4, 5, 6],
    greet: 'Come to look, or come to take somebody home?',
  },
  {
    id: 'inn', town: 'brambleford', name: 'The Sleeping Hare', sign: 'inn',
    kind: 'inn', keeper: 'hollis', tw: 5, roof: '#b2624b', timbered: true,
    storeys: 2, wallH: 54, roofH: 26,
    hours: [0, 24], days: [0, 1, 2, 3, 4, 5, 6],
    greet: 'Bed upstairs whenever you like. Mind the third stair.',
  },
  {
    id: 'library', town: 'brambleford', name: 'The Reading Room', sign: 'book',
    kind: 'library', keeper: 'quire', tw: 5, roof: '#5a6472', roofStyle: 'gable', timbered: true,
    hours: [9, 21], days: [0, 1, 2, 3, 4, 5, 6],
    greet: 'Everything on the shelves, nothing out of the building. Those are the rules.',
  },
  {
    id: 'groomer', town: 'hollowdown', name: 'Fluff & Tumble', sign: 'groomer',
    kind: 'groomer', keeper: 'suds', tw: 4, roof: '#7d8794', awning: '#d472b0',
    hours: [9, 17], days: [2, 3, 4, 5, 6],
    greet: 'Bring them in scruffy, take them out magnificent.',
  },
  {
    id: 'builder', town: 'hollowdown', name: "Trowel & Sons", sign: 'builder',
    kind: 'builder', keeper: 'trowel', tw: 5, roof: '#5a6472',
    hours: [7, 16], days: [1, 2, 3, 4, 5],
    greet: 'You want it built, or you want it built *well*? Different prices.',
  },
  {
    id: 'hardware', town: 'hollowdown', name: 'The Chalk Pit Store', sign: 'hardware',
    kind: 'shop', stock: 'hardware', keeper: 'flint', tw: 4, roof: '#7d8794',
    hours: [8, 17], days: [1, 2, 3, 4, 5, 6],
    greet: 'Timber, tile, slate, nails. Not cats. People keep asking.',
  },
  {
    id: 'vet', town: 'saltmere', name: 'Dr. Bramble, Vet', sign: 'vet',
    kind: 'vet', keeper: 'bramble', tw: 4, roof: '#4f6a72',
    hours: [8, 18], days: [1, 2, 3, 4, 5, 6],
    greet: 'Sneezing? Sulking? Suspiciously quiet? Bring them here.',
  },
  {
    id: 'fishmonger', town: 'saltmere', name: 'Coldwater Fish', sign: 'fish',
    kind: 'shop', stock: 'fish', keeper: 'kelp', tw: 4, roof: '#7d8794',
    hours: [5, 13], days: [2, 3, 4, 5, 6],
    greet: 'Landed this morning. The cats can smell it from the hill.',
  },
  {
    id: 'harbour', town: 'saltmere', name: 'Harbour Supplies', sign: 'harbour',
    kind: 'shop', stock: 'harbour', keeper: 'anchor', tw: 4, roof: '#b2624b',
    hours: [7, 17], days: [0, 1, 2, 3, 4, 5, 6],
    greet: 'Rope, salt, tea, biscuits. In that order of importance.',
  },
  {
    id: 'furniture', town: 'thistlewick', name: 'Velvet & Oak', sign: 'furniture',
    kind: 'shop', stock: 'furniture', keeper: 'velvet', tw: 5, roof: '#b2624b', awning: '#8a72d6',
    hours: [10, 18], days: [1, 2, 3, 4, 5, 6],
    greet: 'Sit on anything you like. Except the chaise. That one bites.',
  },
  {
    id: 'flea', town: 'thistlewick', name: 'Thistlewick Flea Market', sign: 'flea',
    kind: 'flea', keeper: 'rummage', tw: 6, roof: '#d0a659', roofStyle: 'thatch',
    hours: [8, 15], days: [0, 6],
    greet: 'Different junk every week. Some of it is even good.',
  },
  {
    id: 'teahouse', town: 'thistlewick', name: 'Steeped', sign: 'tea',
    kind: 'shop', stock: 'tea', keeper: 'oolong', tw: 4, roof: '#6b7d54', awning: '#6b9e8f',
    hours: [9, 19], days: [1, 2, 3, 4, 5, 6],
    greet: 'Forty-one varieties. I will describe them all if you let me.',
  },
  {
    id: 'exotic', town: 'thistlewick', name: 'Far Fields Cattery', sign: 'exotic',
    kind: 'cats', stock: 'exotic', keeper: 'sable', tw: 5, roof: '#8a72d6',
    hours: [11, 17], days: [3, 5, 6],
    greet: 'These are not ordinary cats. The prices reflect that.',
  },
  {
    id: 'herbalist', town: 'oakhollow', name: 'Root & Remedy', sign: 'herbalist',
    kind: 'shop', stock: 'herbalist', keeper: 'yarrow', tw: 4, roof: '#6b7d54', roofStyle: 'thatch',
    hours: [8, 18], days: [0, 1, 2, 3, 4, 5, 6],
    greet: 'Everything here was a plant this morning.',
  },
  {
    id: 'beekeeper', town: 'oakhollow', name: 'Hum & Comb', sign: 'beekeeper',
    kind: 'shop', stock: 'beekeeper', keeper: 'clover', tw: 3, roof: '#d0a659', roofStyle: 'thatch',
    hours: [9, 16], days: [1, 3, 5, 6],
    greet: "Don't mind the bees. They're only curious.",
  },
];

/**
 * Villagers. Species and coat are picked deterministically when omitted.
 * `lines` cycle as you talk; `hint` lines only appear once the player has
 * asked around, and often point at a shop or an item.
 *
 * The list itself lives in villagerdata.js, which is content rather than code.
 */
export { VILLAGERS } from './villagerdata.js';

/** Names a player can pick when joining a shared valley. */
export const PLAYER_NAMES = [
  'Tuppence', 'Marlow', 'Wren', 'Fennel', 'Pippin', 'Bramble', 'Sorrel', 'Dill',
  'Juniper', 'Mabel', 'Rook', 'Clementine', 'Barnaby', 'Ivy', 'Otto', 'Plum',
  'Quill', 'Saffron', 'Tobias', 'Winnie', 'Hazel', 'Figgy', 'Nesbit', 'Olive',
];

/** Generic chatter mixed into conversations to keep repeat visits alive. */
export const GOSSIP = [
  "Did you hear? The postmaster's learning the fiddle. Badly.",
  "They say the flea market had a genuine antique last week. They say that every week.",
  "Rain on the way. My whiskers know these things.",
  "Somebody left the gate open again and the sheep got into the churchyard.",
  "The baker's started doing a thing with honey. Life-changing, apparently.",
  "There's a cat up at the old mill nobody can catch.",
  "Weekends the whole valley comes out. Best day for business, worst day for peace.",
  "The hill folk think we're soft down here. They're not wrong.",
  "I heard the cattery had a cat with no fur at all. Imagine.",
  "Somebody's been leaving flowers at the standing stones.",
  "Ferry's off again. It's always off.",
  "Best tea in the valley isn't at the tea shop. Don't tell them I said so.",
  "The vet says half her callouts are cats who were only sulking.",
  "Everyone's talking about that cafe with the cats. That's you, isn't it?",
  "Warm night. The kind where nobody wants to go home.",
];

/**
 * What is on the shelves in the Reading Room. Reading one sets `read_<id>`,
 * which is how a quest step knows you have found something out — the knowing
 * is the item, and you can't drop it or sell it.
 */
export const BOOKS = [
  {
    id: 'town_history',
    title: 'A History of Brambleford & the Salt Coast',
    text: 'A green book with gold letters, and a spine that has given up.\n\n'
      + 'You skim. Floods. A dispute about a hedge that ran for sixty years. Then:\n\n'
      + '"At the opening of Saltsouth Pier in 1800, the ribbon was cut by Sir Woofers, '
      + 'a dog of great age and greater self-regard, who wore for the occasion his new '
      + 'golden collar. He was not seen to leave the pier that evening, and neither was '
      + 'the collar."\n\n'
      + '(Somebody has pencilled in the margin: "Saltsouth = Saltmere. They renamed it '
      + 'after the flood. Nobody remembers why.")',
    flag: 'read_town_history',
  },
  {
    id: 'stones_book',
    title: 'On the Standing Stones, and What Is Done There',
    text: 'Thin, hand-bound, and slightly damp.\n\n'
      + '"Seven stones. They are not aligned to the sun, nor the moon, nor anything '
      + 'else we have thought to measure. On certain nights they are warm."\n\n'
      + 'The last page is a list of things people have left at the stones. Most of it '
      + 'is flowers. One entry says only: "a saucer of milk — returned empty".',
    flag: 'read_stones',
  },
  {
    id: 'cat_lore',
    title: 'The Domestic Cat: A Warning',
    text: 'Beautifully illustrated. Deeply unhelpful.\n\n'
      + '"The cat cannot be trained, only negotiated with. The keeper of cats will '
      + 'find that a well-fed animal is a glossy one, and a glossy one draws a crowd, '
      + 'and a crowd is a business."\n\n'
      + 'A later hand has written underneath: "Also they will sit on the till."',
    flag: 'read_cat_lore',
  },
  {
    id: 'tide_book',
    title: 'Tides, Muds and the Recovery of Lost Property',
    text: '"The mud beneath a pier is not a place where things are lost. It is a place '
      + 'where things are kept.\n\n'
      + 'It will give a thing back to anyone who knows what they are reaching for. To '
      + 'anyone who does not, it gives back mud."',
    flag: 'read_tides',
  },
];

export const BOOK_BY_ID = Object.fromEntries(BOOKS.map((b) => [b.id, b]));

export const LANDMARKS = [
  { id: 'oldmill', name: 'The Old Mill', hint: 'A wheel that hasn\'t turned in thirty years.' },
  { id: 'stones', name: 'The Standing Stones', hint: 'Older than the towns. Nobody argues with them.' },
  { id: 'lighthouse', name: 'Gullrock Light', hint: 'Still lit. Nobody is sure by whom.' },
  { id: 'bigoak', name: 'The Great Oak', hint: 'Oakhollow was built around it, not the other way round.' },
  { id: 'pier', name: 'Saltmere Pier', hint: 'Opened in 1800 under a name nobody uses now.' },
];
