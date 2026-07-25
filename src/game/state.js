// The single blob of mutable game state, plus save/load. Systems reach into
// this rather than passing a dozen arguments around.

import { Clock } from './time.js';
import { Cafe } from './cafe.js';
import { Cat } from './entities.js';
import { ITEMS } from './items.js';
import { CAT_BREEDS } from '../art/chars.js';
import { startingCafe, buildCafeMap } from '../world/interiors.js';
import { VILLAGERS } from '../world/places.js';
import { clamp } from '../engine/util.js';
import { TILE } from '../art/tiles.js';

const SAVE_KEY = 'catcafe.save.v1';

export class GameState {
  constructor(hooks = {}) {
    this.hooks = hooks;
    // Start on a Monday morning — a Sunday opening would find half the valley
    // shut, which is a poor first hour.
    this.clock = new Clock(1, 8);
    this.money = 480;
    this.reputation = 0.12;
    this.inventory = {};        // key items, supplies, furniture waiting to be placed
    this.stock = {};            // menu ingredients: id -> [{qty, day}]
    this.cats = [];
    this.cafe = startingCafe();
    this.cafeMap = null;
    this.catActors = [];        // live Cat instances inside the cafe map
    this.flags = {};
    this.quests = {};           // id -> 'active' | 'done'
    this.friends = {};          // villager id -> friendship 0..1
    this.workers = 0;
    this.materials = 0;
    this.employee = null;
    this.shopOpen = true;
    this.shopHours = [8, 18];
    this.inCafe = false;
    this.mapId = 'overworld';
    this.visited = {};          // place id -> true
    this.bestDayProfit = 0;
    this.totalCustomers = 0;
    this.daysPlayed = 0;
    this.worldW = 352;
    this.worldH = 320;
    this.playerLook = { species: 'cat', coat: 'ginger', cloth: '#5b8fd6' };
    this.mail = [];             // letters waiting to be read
    this.pendingLetters = [];   // letters in flight, delivered on a later day
    this.cafeSim = new Cafe(this);
    this.stockedToday = {};
  }

  // ------------------------------------------------------------ inventory

  give(id, qty = 1) {
    const it = ITEMS[id];
    if (!it) return;
    if (it.cat === 'drink' || it.cat === 'food' || it.cat === 'catfood') {
      this.cafeSim.addStock(id, qty, this.clock.day);
    } else {
      this.inventory[id] = (this.inventory[id] || 0) + qty;
    }
  }

  take(id, qty = 1) {
    if (this.inventory[id] === undefined) return false;
    if (this.inventory[id] < qty) return false;
    this.inventory[id] -= qty;
    if (this.inventory[id] <= 0) delete this.inventory[id];
    return true;
  }

  has(id, qty = 1) { return (this.inventory[id] || 0) >= qty; }

  itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }
  breedInfo(b) { return CAT_BREEDS[b]; }
  villagerName(id) { const v = VILLAGERS.find((x) => x.id === id); return v ? v.name : id; }

  // ----------------------------------------------------------------- cats

  catCapacity() {
    // Cats need room and things to climb on.
    const area = this.cafe.rooms.reduce((s, r) => s + r.w * r.h, 0);
    const enrich = this.cafe.furniture.filter((f) =>
      ['catTower', 'catBed', 'scratchPost', 'catBowl'].includes(f.type)).length;
    return Math.max(3, Math.floor(area / 22) + enrich);
  }

  adoptCat(breed) {
    const cat = new Cat(breed, 0, 0);
    this.cats.push(cat);
    this.spawnCatActor(cat);
    return cat;
  }

  spawnCatActor(cat) {
    if (!this.cafeMap) return;
    const rooms = this.cafeMap.meta.rooms || [];
    const r = rooms[Math.floor(Math.random() * rooms.length)] || rooms[0];
    if (!r) return;
    for (let tries = 0; tries < 40; tries++) {
      const tx = r.x + 1 + Math.floor(Math.random() * Math.max(1, r.w - 2));
      const ty = r.y + 1 + Math.floor(Math.random() * Math.max(1, r.h - 2));
      if (!this.cafeMap.solid(tx, ty)) {
        cat.x = tx * TILE + TILE / 2;
        cat.y = ty * TILE + TILE - 2;
        break;
      }
    }
    if (!this.catActors.includes(cat)) this.catActors.push(cat);
  }

  refreshCatActors() {
    this.catActors = [];
    for (const c of this.cats) this.spawnCatActor(c);
  }

  // ---------------------------------------------------------------- cafe

  rebuildCafe() {
    this.cafeMap = buildCafeMap(this.cafe);
    this.refreshCatActors();
    this.cafeSim.clearCustomers();
    this.hooks.onCafeRebuilt?.(this.cafeMap);
  }

  maxFloorArea() { return 88 + this.workers * 64; }
  usedFloorArea() { return this.cafe.rooms.reduce((s, r) => s + r.w * r.h, 0); }

  // -------------------------------------------------------------- places

  visit(id, name, x, y) {
    if (this.visited[id]) return false;
    this.visited[id] = { name, x, y };
    return true;
  }

  knownPlaces() {
    return Object.entries(this.visited).map(([id, v]) => ({ id, ...v }));
  }

  taxiFare(place) {
    const base = 60;
    return base + Math.round(Math.hypot(place.x - 96, place.y - 168) * 0.8);
  }

  // ---------------------------------------------------------------- hooks

  toast(text, tone) { this.hooks.toast?.(text, tone); }
  floatText(text, x, y, color) { this.hooks.float?.(text, x, y, color); }

  // ------------------------------------------------------------ day roll

  endOfDay() {
    const summary = this.cafeSim.endOfDay();
    this.daysPlayed++;
    this.totalCustomers += summary.customers;
    if (summary.profit > this.bestDayProfit) this.bestDayProfit = summary.profit;

    // Mail in flight arrives.
    const arriving = this.pendingLetters.filter((l) => l.day <= this.clock.day);
    this.pendingLetters = this.pendingLetters.filter((l) => l.day > this.clock.day);
    for (const l of arriving) {
      this.mail.push(l);
      summary.lines.push({ text: `A mail bird brought a letter from ${l.from}.`, tone: 'good' });
    }

    if (this.money < 0) {
      summary.lines.push({ text: 'You are in the red. Sell something, or open earlier.', tone: 'bad' });
    }
    return summary;
  }

  // ------------------------------------------------------------ save/load

  save() {
    const data = {
      v: 1,
      clock: this.clock.save(),
      money: this.money,
      reputation: this.reputation,
      inventory: this.inventory,
      stock: this.stock,
      cats: this.cats.map((c) => c.save()),
      cafe: this.cafe,
      flags: this.flags,
      quests: this.quests,
      friends: this.friends,
      workers: this.workers,
      materials: this.materials,
      employee: this.employee,
      shopOpen: this.shopOpen,
      shopHours: this.shopHours,
      visited: this.visited,
      bestDayProfit: this.bestDayProfit,
      totalCustomers: this.totalCustomers,
      daysPlayed: this.daysPlayed,
      playerLook: this.playerLook,
      mail: this.mail,
      pendingLetters: this.pendingLetters,
      player: this.hooks.playerPos?.() || null,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('save failed', e);
      return false;
    }
  }

  static hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  static clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  load() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return false; }
    if (!data) return false;
    this.clock.load(data.clock);
    this.money = data.money ?? 480;
    this.reputation = data.reputation ?? 0.12;
    this.inventory = data.inventory || {};
    this.stock = data.stock || {};
    this.cafe = data.cafe || startingCafe();
    // Saves made before awnings were choosable.
    if (!this.cafe.awning) this.cafe.awning = '#c05a7a';
    this.flags = data.flags || {};
    this.quests = data.quests || {};
    this.friends = data.friends || {};
    this.workers = data.workers || 0;
    this.materials = data.materials || 0;
    this.employee = data.employee || null;
    this.shopOpen = data.shopOpen ?? true;
    this.shopHours = data.shopHours || [8, 18];
    this.visited = data.visited || {};
    this.bestDayProfit = data.bestDayProfit || 0;
    this.totalCustomers = data.totalCustomers || 0;
    this.daysPlayed = data.daysPlayed || 0;
    this.playerLook = data.playerLook || this.playerLook;
    this.mail = data.mail || [];
    this.pendingLetters = data.pendingLetters || [];
    this.cats = (data.cats || []).map((c) => new Cat(c.breed, 0, 0, c));
    this.savedPlayer = data.player || null;
    return true;
  }
}

/** Start-of-game gift so the player has something to sell on day one. */
export function seedStartingInventory(st) {
  st.cafeSim.addStock('house_coffee', 8, st.clock.day);
  st.cafeSim.addStock('black_tea', 6, st.clock.day);
  st.cafeSim.addStock('cookie', 6, st.clock.day);
  st.cafeSim.addStock('kibble', 2, st.clock.day);
  st.inventory.f_chair = 2;
  st.inventory.f_table = 1;
  st.adoptCat('tabby');
  st.adoptCat('grey');
}
