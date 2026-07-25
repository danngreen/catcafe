// Everything that can be bought, sold, eaten, placed or carried.
//
// Menu items have two prices: `cost` is what you pay a supplier per portion,
// `price` is what a customer pays you. `appeal` feeds into how long people stay
// and how likely they are to order again. `shelf` is how many days a portion
// keeps before it spoils.

export const CAT = {
  DRINK: 'drink',
  FOOD: 'food',
  CATFOOD: 'catfood',
  SUPPLY: 'supply',
  FURNITURE: 'furniture',
  KEY: 'key',
  SERVICE: 'service',
};

export const ITEMS = {
  // ---------------------------------------------------------------- drinks
  house_coffee: { name: 'House Coffee', cat: CAT.DRINK, icon: 'coffee', cost: 4, price: 12, appeal: 1.0, shelf: 8, desc: 'Dependable. Nobody has ever complained about it, which is its own kind of praise.' },
  espresso: { name: 'Espresso', cat: CAT.DRINK, icon: 'espresso', cost: 5, price: 16, appeal: 1.15, shelf: 8, desc: 'Small, dark, and extremely serious.' },
  latte: { name: 'Latte', cat: CAT.DRINK, icon: 'latte', cost: 7, price: 21, appeal: 1.3, shelf: 4, desc: 'The foam has a cat face on it. It takes you nine tries each time.' },
  black_tea: { name: 'Black Tea', cat: CAT.DRINK, icon: 'tea', cost: 3, price: 11, appeal: 1.0, shelf: 24, desc: 'Strong enough to stand a spoon in, if that is your preference.' },
  herbal_tea: { name: 'Herbal Tea', cat: CAT.DRINK, icon: 'herbal', cost: 5, price: 17, appeal: 1.2, shelf: 24, desc: 'Chamomile, mostly. People fall asleep in the window seat.' },
  matcha: { name: 'Matcha', cat: CAT.DRINK, icon: 'matcha', cost: 9, price: 27, appeal: 1.5, shelf: 14, desc: 'Bright green and quietly expensive.' },
  cocoa: { name: 'Hot Cocoa', cat: CAT.DRINK, icon: 'cocoa', cost: 6, price: 19, appeal: 1.3, shelf: 12, desc: 'Two marshmallows. Three if you like them.' },
  lemonade: { name: 'Lemonade', cat: CAT.DRINK, icon: 'lemonade', cost: 4, price: 14, appeal: 1.1, shelf: 4, desc: 'Made fresh, which is why it never lasts.' },
  milk: { name: 'Warm Milk', cat: CAT.DRINK, icon: 'milk', cost: 3, price: 9, appeal: 0.95, shelf: 3, desc: 'The cats become extremely interested whenever you pour it.' },
  cider: { name: 'Cloudy Cider', cat: CAT.DRINK, icon: 'cider', cost: 8, price: 24, appeal: 1.4, shelf: 20, desc: 'Pressed from the orchard up the valley. Very cloudy. Very good.' },
  smoked_tea: { name: 'Smoked Lapsang', cat: CAT.DRINK, icon: 'tea', cost: 14, price: 42, appeal: 1.95, shelf: 24, rare: true, desc: 'Tastes like a bonfire in the best possible way. Divisive. Profitable.' },

  // ------------------------------------------------------------------ food
  cookie: { name: 'Butter Cookie', cat: CAT.FOOD, icon: 'cookie', cost: 3, price: 10, appeal: 1.0, shelf: 10, desc: 'Shaped like a paw. Badly, but sincerely.' },
  scone: { name: 'Scone', cat: CAT.FOOD, icon: 'scone', cost: 5, price: 16, appeal: 1.2, shelf: 3, desc: 'Jam first. This is not negotiable in this valley.' },
  croissant: { name: 'Croissant', cat: CAT.FOOD, icon: 'croissant', cost: 6, price: 18, appeal: 1.3, shelf: 2, desc: 'Leaves flakes everywhere. The cats consider this a feature.' },
  muffin: { name: 'Berry Muffin', cat: CAT.FOOD, icon: 'muffin', cost: 5, price: 15, appeal: 1.15, shelf: 3, desc: 'Berries from the hedgerow, mostly picked by you.' },
  sandwich: { name: 'Sandwich', cat: CAT.FOOD, icon: 'sandwich', cost: 7, price: 20, appeal: 1.2, shelf: 2, desc: 'Cut into triangles, because squares are for weekdays.' },
  toast: { name: 'Honey Toast', cat: CAT.FOOD, icon: 'toast', cost: 6, price: 19, appeal: 1.3, shelf: 2, desc: 'Thick cut, dripping. Deeply unserious food.' },
  cake: { name: 'Sponge Cake', cat: CAT.FOOD, icon: 'cake', cost: 9, price: 28, appeal: 1.55, shelf: 3, desc: 'A slice big enough to justify a second visit.' },
  pancakes: { name: 'Pancake Stack', cat: CAT.FOOD, icon: 'pancakes', cost: 8, price: 25, appeal: 1.45, shelf: 1, desc: 'Weekend food. People come specifically.' },
  parfait: { name: 'Berry Parfait', cat: CAT.FOOD, icon: 'parfait', cost: 11, price: 32, appeal: 1.65, shelf: 2, desc: 'Layered in a tall glass so it looks like it took effort.' },
  pie: { name: 'Fruit Pie', cat: CAT.FOOD, icon: 'pie', cost: 12, price: 36, appeal: 1.75, shelf: 4, desc: 'Whole pie, sold by the slice, gone by three.' },
  honey_scone: { name: 'Honey Scone', cat: CAT.FOOD, icon: 'scone', cost: 8, price: 26, appeal: 1.6, shelf: 3, rare: true, desc: "Clover's honey, warm from the oven. People have written letters about this." },
  fishcake: { name: 'Fishcake', cat: CAT.FOOD, icon: 'fishcake', cost: 10, price: 30, appeal: 1.5, shelf: 2, desc: 'Every cat in the building will supervise you making these.' },

  // -------------------------------------------------------------- cat food
  kibble: { name: 'Everyday Kibble', cat: CAT.CATFOOD, icon: 'catfood', cost: 8, quality: 1, portions: 6, shelf: 30, desc: 'Keeps a cat alive and mildly disappointed.' },
  good_food: { name: 'Good Cat Food', cat: CAT.CATFOOD, icon: 'catfoodPremium', cost: 18, quality: 2, portions: 6, shelf: 22, desc: 'Coats get glossier within the week. Customers notice.' },
  fresh_fish: { name: 'Fresh Fish', cat: CAT.CATFOOD, icon: 'fish', cost: 30, quality: 3, portions: 6, shelf: 3, desc: 'Landed this morning. Silky coats, delighted cats, very short shelf life.' },
  gourmet: { name: 'Gourmet Tins', cat: CAT.CATFOOD, icon: 'catfoodGourmet', cost: 44, quality: 4, portions: 6, shelf: 40, rare: true, desc: 'Absurd. Effective. The cats become visibly smug.' },

  // -------------------------------------------------------------- supplies
  catnip: { name: 'Catnip', cat: CAT.SUPPLY, icon: 'catnip', cost: 22, shelf: 30, desc: 'One pinch and the whole room becomes entertainment for an hour.' },
  treats: { name: 'Cat Treats', cat: CAT.SUPPLY, icon: 'treats', cost: 14, shelf: 30, desc: 'The universal apology.' },
  medicine: { name: 'Cat Medicine', cat: CAT.SUPPLY, icon: 'medicine', cost: 46, shelf: 99, desc: 'Treats one sick cat at home, if you catch it early.' },
  vitamins: { name: 'Vitamins', cat: CAT.SUPPLY, icon: 'vitamins', cost: 34, shelf: 60, desc: 'Makes illness less likely for a while. Tastes revolting, apparently.' },
  brush: { name: 'Grooming Brush', cat: CAT.SUPPLY, icon: 'brush', cost: 60, tool: true, desc: 'Do a rough job yourself between proper groomings.' },
  ribbon: { name: 'Ribbon Collar', cat: CAT.SUPPLY, icon: 'ribbon', cost: 40, wearable: true, appeal: 0.08, desc: 'Purely decorative. Extremely effective.' },
  bell: { name: 'Little Bell', cat: CAT.SUPPLY, icon: 'bell', cost: 55, wearable: true, appeal: 0.12, desc: 'You always know where they are. So does everyone else.' },
  toy_ball: { name: 'Bouncy Ball', cat: CAT.SUPPLY, icon: 'toyBall', cost: 28, placeable: 'toyBall', desc: 'Ends up under the furniture within the hour.' },
  toy_yarn: { name: 'Ball of Yarn', cat: CAT.SUPPLY, icon: 'toyYarn', cost: 24, placeable: 'toyYarn', desc: 'Classic. Undefeated.' },
  toy_wand: { name: 'Feather Wand', cat: CAT.SUPPLY, icon: 'toyWand', cost: 46, placeable: 'toyWand', desc: 'Customers cannot resist picking this up.' },

  // ------------------------------------------------------------- furniture
  f_chair: { name: 'Wooden Chair', cat: CAT.FURNITURE, icon: 'chair', cost: 55, place: 'chair', seats: 1, appeal: 0.4, desc: 'A place to sit. The foundation of hospitality.' },
  f_stool: { name: 'Padded Stool', cat: CAT.FURNITURE, icon: 'stool', cost: 70, place: 'stool', seats: 1, appeal: 0.5, desc: 'No back, but cheerful.' },
  f_table: { name: 'Round Table', cat: CAT.FURNITURE, icon: 'table', cost: 110, place: 'tableRound', appeal: 0.6, desc: 'Fits two comfortably, three if they like each other.' },
  f_table_cloth: { name: 'Dressed Table', cat: CAT.FURNITURE, icon: 'tableCloth', cost: 175, place: 'tableCloth', appeal: 1.1, desc: 'The cloth suggests you have standards.' },
  f_table_long: { name: 'Long Table', cat: CAT.FURNITURE, icon: 'tableLong', cost: 210, place: 'tableSq', appeal: 0.9, desc: 'For groups. Groups order more.' },
  f_sofa: { name: 'Velvet Sofa', cat: CAT.FURNITURE, icon: 'sofa', cost: 420, place: 'sofa', seats: 3, appeal: 2.4, desc: 'People stay far too long on this. That is the point.' },
  f_plant: { name: 'Potted Fern', cat: CAT.FURNITURE, icon: 'plant', cost: 90, place: 'plantPot', appeal: 0.9, desc: 'Instantly makes a room look cared for.' },
  f_lamp: { name: 'Floor Lamp', cat: CAT.FURNITURE, icon: 'floorlamp', cost: 130, place: 'lampIn', appeal: 1.1, light: true, desc: 'Warm pool of light. Essential after dark.' },
  f_painting: { name: 'Landscape Painting', cat: CAT.FURNITURE, icon: 'painting', cost: 160, place: 'painting', appeal: 1.2, wall: true, desc: 'The valley, badly painted, beloved.' },
  f_bookshelf: { name: 'Bookshelf', cat: CAT.FURNITURE, icon: 'bookshelf', cost: 240, place: 'bookshelf', appeal: 1.6, desc: 'People browse. Browsing people order tea.' },
  f_fireplace: { name: 'Stone Fireplace', cat: CAT.FURNITURE, icon: 'fireplace', cost: 680, place: 'fireplace', appeal: 3.2, light: true, desc: 'On a wet afternoon this pays for itself.' },
  f_piano: { name: 'Upright Piano', cat: CAT.FURNITURE, icon: 'piano', cost: 900, place: 'piano', appeal: 3.6, rare: true, desc: 'Somebody always knows three songs.' },
  f_cattower: { name: 'Cat Tower', cat: CAT.FURNITURE, icon: 'cattower', cost: 180, place: 'catTower', appeal: 1.0, catJoy: 2, desc: 'The high shelf is the best seat in the house, and everyone knows it.' },
  f_catbed: { name: 'Cat Bed', cat: CAT.FURNITURE, icon: 'catbed', cost: 85, place: 'catBed', appeal: 0.6, catJoy: 1.4, desc: 'They will sleep in the box it came in. Then, eventually, in this.' },
  f_scratch: { name: 'Scratching Post', cat: CAT.FURNITURE, icon: 'scratchpost', cost: 95, place: 'scratchPost', appeal: 0.3, catJoy: 1.6, desc: 'Saves the sofa. Worth every fish.' },
  f_bowl: { name: 'Feeding Bowl', cat: CAT.FURNITURE, icon: 'catbowl', cost: 35, place: 'catBowl', appeal: 0.1, catJoy: 0.6, desc: 'More bowls, fewer arguments.' },
  f_counter: { name: 'Service Counter', cat: CAT.FURNITURE, icon: 'counterUnit', cost: 260, place: 'counter', appeal: 0.5, desc: 'Where the money happens.' },
  f_case: { name: 'Pastry Case', cat: CAT.FURNITURE, icon: 'cake', cost: 320, place: 'pastryCase', appeal: 1.4, desc: 'Cake at eye level sells itself.' },
  f_machine: { name: 'Coffee Machine', cat: CAT.FURNITURE, icon: 'grinder', cost: 380, place: 'coffeeMachine', appeal: 1.2, desc: 'Hisses impressively. Customers trust a machine that hisses.' },
  f_bar: { name: 'Bar Counter', cat: CAT.FURNITURE, icon: 'bar', cost: 480, place: 'bar', appeal: 2.4, desc: 'Three yards of polished oak. People perch at a bar who would never take a table.' },
  f_barstool: { name: 'Bar Stool', cat: CAT.FURNITURE, icon: 'barstool', cost: 95, place: 'barStool', seats: 1, appeal: 0.7, desc: 'Tall, swivelly, and always taken by whoever got here first.' },
  f_rug: { name: 'Woven Rug', cat: CAT.FURNITURE, icon: 'rug', cost: 140, place: 'rug', appeal: 1.0, floor: true, desc: 'Softens the whole room, and the acoustics with it.' },

  // ------------------------------------------------------------- key items
  pickaxe: { name: 'Chalk Pick', cat: CAT.KEY, icon: 'hammer', cost: 320, desc: 'Heavy. Splits chalk like cheese.' },
  shears: { name: 'Hedge Shears', cat: CAT.KEY, icon: 'hammer', cost: 180, desc: 'For brambles that have got ideas above their station.' },
  rope: { name: 'Coil of Rope', cat: CAT.KEY, icon: 'bag', cost: 150, desc: 'Twenty fathoms of good hemp.' },
  valley_map: { name: 'Valley Map', cat: CAT.KEY, icon: 'map', cost: 240, desc: 'Hand-drawn, slightly wrong about the north, but it shows the taxi perches.' },
  honey: { name: 'Jar of Honey', cat: CAT.KEY, icon: 'honey', cost: 55, desc: 'Sunlight in a jar. Unlocks honey bakes if the baker sees it.' },
  seashell: { name: 'Spiral Shell', cat: CAT.KEY, icon: 'shell', desc: 'Holds the sound of the sea, or of your own blood, depending who you ask.' },
  wildflowers: { name: 'Wildflowers', cat: CAT.KEY, icon: 'bouquet', desc: 'Picked from the meadow. Wilting slightly, still lovely.' },
  lost_bell: { name: "A Lost Bell", cat: CAT.KEY, icon: 'bell', desc: 'Someone is missing this. It has a name scratched on the inside.' },
  logbook: { name: "Keeper's Logbook", cat: CAT.KEY, icon: 'book', desc: 'Eleven years of weather, tides, and one line about a cat.' },
  letter: { name: 'A Letter', cat: CAT.KEY, icon: 'letter', desc: 'Sealed, addressed, and waiting for a bird.' },
};

/** Shop catalogues. Each entry is an item id, optionally with a stock limit. */
export const STOCK = {
  grocer: ['house_coffee', 'black_tea', 'milk', 'cookie', 'muffin', 'sandwich', 'lemonade', 'kibble', 'treats'],
  bakery: ['scone', 'croissant', 'cake', 'muffin', 'pancakes', 'toast', 'cookie', 'pie'],
  petshop: ['kibble', 'good_food', 'treats', 'toy_ball', 'toy_yarn', 'toy_wand', 'ribbon', 'bell', 'f_catbed', 'f_bowl', 'f_scratch'],
  hardware: ['pickaxe', 'shears', 'rope', 'f_counter', 'f_chair', 'f_table'],
  fish: ['fresh_fish', 'fishcake', 'good_food'],
  harbour: ['black_tea', 'house_coffee', 'cookie', 'kibble', 'rope', 'valley_map'],
  furniture: ['f_chair', 'f_stool', 'f_barstool', 'f_table', 'f_table_cloth', 'f_table_long', 'f_bar', 'f_sofa', 'f_plant', 'f_lamp', 'f_painting', 'f_bookshelf', 'f_rug', 'f_case', 'f_machine', 'f_fireplace'],
  tea: ['black_tea', 'herbal_tea', 'matcha', 'cocoa', 'smoked_tea', 'cider'],
  herbalist: ['herbal_tea', 'catnip', 'medicine', 'vitamins', 'kibble'],
  beekeeper: ['honey', 'toast', 'cider'],
};

/** The flea market restocks with a random subset each weekend, at a discount. */
export const FLEA_POOL = [
  'f_sofa', 'f_bookshelf', 'f_painting', 'f_lamp', 'f_plant', 'f_rug', 'f_table_cloth',
  'f_piano', 'f_fireplace', 'f_cattower', 'valley_map', 'rope', 'toy_wand', 'bell',
];

// Furniture is carried in the bag as "id#variant" so a green chair and an oak
// one can sit side by side. Anything without a '#' is variant 0.
export const baseId = (key) => {
  const i = String(key).indexOf('#');
  return i < 0 ? key : key.slice(0, i);
};
export const variantOf = (key) => {
  const i = String(key).indexOf('#');
  return i < 0 ? 0 : Number(key.slice(i + 1)) || 0;
};
export const invKey = (id, variant = 0) => (variant ? `${id}#${variant}` : id);

export const item = (key) => ITEMS[baseId(key)];
export const itemName = (key) => (item(key) ? item(key).name : key);
export const isMenuItem = (id) => ITEMS[id] && (ITEMS[id].cat === CAT.DRINK || ITEMS[id].cat === CAT.FOOD);

/** Buy price at a given shop, with weekend flea discounts folded in. */
export function buyPrice(id, mult = 1) {
  const it = ITEMS[id];
  if (!it) return 0;
  return Math.max(1, Math.round((it.cost || 0) * mult));
}
