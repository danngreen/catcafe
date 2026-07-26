// The single blob of mutable game state, plus save/load. Systems reach into
// this rather than passing a dozen arguments around.

import { Clock } from './time.js';
import { Cafe } from './cafe.js';
import { Cat } from './entities.js';
import { item, baseId } from './items.js';
import { CAT_BREEDS } from '../art/chars.js';
import { startingCafe, buildCafeMap } from '../world/interiors.js';
import { VILLAGERS } from '../world/places.js';
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
    this.questStep = {};        // id -> how far along a multi-step job you are
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
    this.playerName = null;   // chosen when joining a shared valley
    this.mail = [];             // letters waiting to be read
    this.pendingLetters = [];   // letters in flight, delivered on a later day
    this.cafeSim = new Cafe(this);
    this.stockedToday = {};

    // Shared session, set by the game once we've joined one. Everything below
    // works unchanged when it stays null.
    this.net = null;
    this.applying = false;      // true while taking the server's word for it
    this.cafeOccupied = false;  // is anyone at all standing in the cafe?
  }

  // --------------------------------------------------------- shared session

  get shared() { return !!(this.net && this.net.shared); }

  /**
   * Publish a change. Suppressed while we're applying one, or nobody would ever
   * stop echoing the same edit back and forth.
   */
  pub(op) { if (this.shared && !this.applying) this.net.op(op); }

  /** Money moves as a delta so two tills can ring up at once without a clash. */
  earn(n) { this.money += n; this.pub({ op: 'money', d: n }); }
  spend(n) { this.money -= n; this.pub({ op: 'money', d: -n }); }

  /** Re-publish a field we just edited in place (flags, quests, hours...). */
  touch(k) { this.pub({ op: 'set', k, v: this[k] }); }

  touchCats() { this.pub({ op: 'set', k: 'cats', v: this.cats.map((c) => c.save()) }); }

  /** Take the server's value for one field without echoing it back. */
  applySync(k, v) {
    this.applying = true;
    try {
      if (k === 'cats') this.mergeCats(v || []);
      else if (k === 'cafe') {
        // Rebuilding is expensive and moves the player, so ignore the echo of
        // our own change — which is what we get straight after building.
        if (JSON.stringify(this.cafe) !== JSON.stringify(v)) { this.cafe = v; this.rebuildCafe(); }
      } else this[k] = v;
    } finally {
      this.applying = false;
    }
  }

  /**
   * Reconcile our cats with the shared list. Existing cats keep their instance
   * so they carry on padding about the room rather than teleporting home.
   */
  mergeCats(list) {
    const byId = new Map(this.cats.map((c) => [c.id, c]));
    this.cats = list.map((s) => {
      const c = byId.get(s.id);
      if (!c) return new Cat(s.breed, 0, 0, s);
      Object.assign(c, {
        breed: s.breed, name: s.name, groomed: s.groomed, coatQuality: s.coatQuality,
        happiness: s.happiness, hunger: s.hunger, sick: s.sick, sickDays: s.sickDays,
        accessory: s.accessory, age: s.age,
      });
      return c;
    });
    this.catActors = this.catActors.filter((c) => this.cats.includes(c));
    for (const c of this.cats) if (!this.catActors.includes(c)) this.spawnCatActor(c);
  }

  /** The half of a save that everyone shares. */
  snapshot() {
    return {
      money: this.money, reputation: this.reputation,
      inventory: this.inventory, stock: this.stock,
      cats: this.cats.map((c) => c.save()), cafe: this.cafe,
      flags: this.flags, quests: this.quests, questStep: this.questStep, friends: this.friends,
      workers: this.workers, materials: this.materials, employee: this.employee,
      shopOpen: this.shopOpen, shopHours: this.shopHours, visited: this.visited,
      mail: this.mail, pendingLetters: this.pendingLetters,
      bestDayProfit: this.bestDayProfit, totalCustomers: this.totalCustomers,
      daysPlayed: this.daysPlayed,
    };
  }

  /** Join a valley somebody else already opened: their books replace ours. */
  adopt(world, clock) {
    if (!world) return;
    this.applying = true;
    try {
      for (const [k, v] of Object.entries(world)) {
        if (k === 'cats') this.cats = v.map((s) => new Cat(s.breed, 0, 0, s));
        else this[k] = v;
      }
      if (clock) this.clock.load(clock);
      this.rebuildCafe();     // their layout, their colours
    } finally {
      this.applying = false;
    }
  }

  // ------------------------------------------------------------ inventory

  /**
   * `key` may carry a furniture variant ("f_chair#2"); stock items never do.
   */
  give(key, qty = 1) {
    const it = item(key);
    if (!it) return;
    if (it.cat === 'drink' || it.cat === 'food' || it.cat === 'catfood') {
      this.cafeSim.addStock(baseId(key), qty, this.clock.day);
    } else {
      this.inventory[key] = (this.inventory[key] || 0) + qty;
      this.pub({ op: 'inv', key, d: qty });
    }
  }

  take(id, qty = 1) {
    if (this.inventory[id] === undefined) return false;
    if (this.inventory[id] < qty) return false;
    this.inventory[id] -= qty;
    if (this.inventory[id] <= 0) delete this.inventory[id];
    this.pub({ op: 'inv', key: id, d: -qty });
    return true;
  }

  has(id, qty = 1) { return (this.inventory[id] || 0) >= qty; }

  itemName(key) { return item(key) ? item(key).name : key; }
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
    this.touchCats();
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

  visit(id, name, x, y, town = null) {
    if (this.visited[id]) return false;
    this.visited[id] = { name, x, y, town };
    this.touch('visited');
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

    // Overnight touches most of the books at once, and only one client runs it.
    this.touchCats();
    for (const k of ['mail', 'pendingLetters', 'employee', 'reputation',
      'bestDayProfit', 'totalCustomers', 'daysPlayed']) this.touch(k);
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
      questStep: this.questStep,
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
      playerName: this.playerName,
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
    this.questStep = data.questStep || {};
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
    this.playerName = data.playerName || this.playerName;
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
