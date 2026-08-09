// Everything that can be bought, sold, eaten, placed or carried.
//
// Menu items have two prices: `cost` is what you pay a supplier per portion,
// `price` is what a customer pays you. `appeal` feeds into how long people stay
// and how likely they are to order again. `shelf` is how many days a portion
// keeps before it spoils.

import { ITEM_DATA } from './itemdata.js';

/** The tabs a bag and a shop are divided into. */
export const CAT = {
  DRINK: 'drink',
  FOOD: 'food',
  CATFOOD: 'catfood',
  SUPPLY: 'supply',
  FURNITURE: 'furniture',
  KEY: 'key',
  SERVICE: 'service',
};

/**
 * The catalogue itself. It lives in itemdata.js, which is content the editor
 * writes; everything below is the code that reads it.
 */
export const ITEMS = ITEM_DATA;

/** Shop catalogues. Each entry is an item id, optionally with a stock limit. */
export const STOCK = {
  grocer: ['house_coffee', 'black_tea', 'milk', 'cookie', 'muffin', 'sandwich', 'lemonade', 'iced_tea', 'kibble', 'treats'],
  bakery: ['scone', 'croissant', 'cake', 'muffin', 'pancakes', 'toast', 'cookie', 'pie', 'ice_cream'],
  petshop: ['kibble', 'good_food', 'treats', 'toy_ball', 'toy_yarn', 'toy_wand', 'ribbon', 'bell', 'f_catbed', 'f_bowl', 'f_scratch'],
  hardware: ['pickaxe', 'shears', 'rope', 'lantern', 'f_counter', 'f_chair', 'f_table'],
  fish: ['fresh_fish', 'fishcake', 'good_food'],
  harbour: ['black_tea', 'house_coffee', 'cookie', 'kibble', 'rope', 'valley_map'],
  furniture: ['f_chair', 'f_stool', 'f_barstool', 'f_table', 'f_table_cloth', 'f_table_long', 'f_bar', 'f_sofa', 'f_plant', 'f_lamp', 'f_painting', 'f_bookshelf', 'f_rug', 'f_case', 'f_machine', 'f_fireplace',
    'f_patio_chair', 'f_patio_stool', 'f_patio_table', 'f_patio_bench', 'f_umbrella', 'f_fountain'],
  tea: ['black_tea', 'herbal_tea', 'matcha', 'cocoa', 'smoked_tea', 'cider', 'iced_coffee', 'iced_tea'],
  herbalist: ['herbal_tea', 'catnip', 'medicine', 'vitamins', 'kibble', 'dandelion'],
  beekeeper: ['honey', 'toast', 'cider'],
};

/** The flea market restocks with a random subset each weekend, at a discount. */
export const FLEA_POOL = [
  'f_sofa', 'f_bookshelf', 'f_painting', 'f_lamp', 'f_plant', 'f_rug', 'f_table_cloth',
  'f_piano', 'f_fireplace', 'f_cattower', 'valley_map', 'rope', 'toy_wand', 'bell',
  'f_patio_chair', 'f_patio_stool', 'f_patio_table', 'f_patio_bench', 'f_umbrella',
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
