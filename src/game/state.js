// The single blob of mutable game state, plus save/load. Systems reach into
// this rather than passing a dozen arguments around.

import { Clock } from './time.js';
import { Cafe } from './cafe.js';
import { Cat } from './entities.js';
import { item, baseId } from './items.js';
import { CAT_BREEDS } from '../art/chars.js';
import { startingCafe, buildCafeMap } from '../world/interiors.js';
import { weatherNow } from './weather.js';
import { live, expired } from './deliveries.js';
import { shiftHours } from './cafe.js';
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
    this.deliveries = [];       // orders taken over the phone, not yet run
    this.deliveriesRun = 0;     // how many have actually been carried somewhere
    // The riding bear, once she has been bought: where she was last left, and
    // which day she was last fed. Shared, because there is one of her and a
    // valley can have two players — whoever rides her last is where she is.
    this.bear = null;
    this.bestDayProfit = 0;
    this.bestDayGross = 0;      // best day's takings before costs
    this.totalCustomers = 0;
    this.daysPlayed = 0;
    this.worldW = 352;
    this.worldH = 320;
    // Set once the valley is built. The weather is derived from it rather than
    // stored, so it never needs saving or sending.
    this.worldSeed = 0;
    // Everywhere the valley has, whether or not you have been. Only readable
    // with a map in the bag, and never saved — it is a fact about the world,
    // not about you.
    this.atlas = [];
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

  /**
   * Take a job on. Returns false if it was already taken — possibly by
   * somebody else a second ago, in which case we must not hand out a second
   * parcel or reset how far along everyone is.
   */
  startQuest(id) {
    if (this.quests[id]) return false;
    this.quests[id] = 'active';
    this.questStep[id] = this.questStep[id] || 0;
    this.pub({ op: 'quest', id, state: 'active' });
    return true;
  }

  finishQuest(id) {
    this.quests[id] = 'done';
    this.pub({ op: 'quest', id, state: 'done' });
  }

  /** Move a job on. Never backwards, whoever asks. */
  setQuestStep(id, n) {
    if ((this.questStep[id] || 0) >= n) return;
    this.questStep[id] = n;
    this.pub({ op: 'step', id, n });
  }

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
      // A valley that has not been opened since wages went hourly will send
      // the old daily figure, so convert it wherever it arrives from.
      if (k === 'employee' || k === 'shopHours') this.migrateEmployee();
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
      deliveries: this.deliveries,
      deliveriesRun: this.deliveriesRun,
      bear: this.bear,
      mail: this.mail, pendingLetters: this.pendingLetters,
      bestDayProfit: this.bestDayProfit, bestDayGross: this.bestDayGross,
      totalCustomers: this.totalCustomers,
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
      this.migrateEmployee();
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
    if ((this.inventory[id] || 0) >= qty) {
      this.inventory[id] -= qty;
      if (this.inventory[id] <= 0) delete this.inventory[id];
      this.pub({ op: 'inv', key: id, d: -qty });
      return true;
    }
    // Menu goods go into the pantry, not the bag — buying a bottle of milk
    // stocks it. An errand that asks you to fetch one should be satisfied by
    // the milk you own, wherever you are keeping it.
    if (this.cafeSim && this.cafeSim.stockCount(id) >= qty) {
      this.cafeSim.takeStock(id, qty);
      return true;
    }
    return false;
  }

  has(id, qty = 1) {
    if ((this.inventory[id] || 0) >= qty) return true;
    return !!this.cafeSim && this.cafeSim.stockCount(id) >= qty;
  }

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

  /**
   * Rebuild the interior after a change to the layout, the furniture or the
   * floor. Customers are carried across rather than swept out: putting down a
   * plant pot should not empty the room.
   */
  /**
   * The most seats this cafe has ever had at once. Kept as a high-water mark
   * rather than a live count: pulling a chair out for an afternoon should not
   * undo having built the place up to forty.
   */
  noteSeatCount() {
    const n = this.cafeMap?.meta?.seats?.length || 0;
    if (n > (this.flags.most_seats || 0)) {
      this.flags.most_seats = n;
      this.touch('flags');
    }
  }

  rebuildCafe() {
    this.cafeMap = buildCafeMap(this.cafe);
    this.refreshCatActors();
    this.cafeSim.reseatCustomers(this.cafeMap);
    this.noteSeatCount();
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

  /**
   * Wages used to be per day and are now per hour. An old save has a daily
   * figure in the same field, so it is divided by the hours that were posted
   * at the time — the person keeps costing what they cost, and the marker
   * stops it happening twice.
   */
  migrateEmployee() {
    const e = this.employee;
    if (!e || e.hourly) return;
    const hours = shiftHours(this.shopHours) || 10;
    e.wage = Math.max(1, Math.round(e.wage / hours));
    e.fairWage = Math.max(1, Math.round(e.fairWage / hours));
    e.hourly = true;
  }

  /** What the sky is doing. Cheap enough to ask for per frame. */
  get sky() { return weatherNow(this.worldSeed, this.clock); }

  /**
   * Everywhere you could pick on the map screen. Places you have walked to,
   * plus — if you are carrying the Valley Map — every village and taxi perch
   * in the valley, which is what the thing has always said it shows and until
   * now did not. Marked so the map can say which is which; you still pay the
   * fare either way.
   */
  knownPlaces() {
    const out = Object.entries(this.visited).map(([id, v]) => ({ id, ...v }));
    if (!this.has('valley_map')) return out;
    const seen = new Set(out.map((p) => p.id));
    for (const p of this.atlas) {
      if (!seen.has(p.id)) out.push({ ...p, fromMap: true });
    }
    return out;
  }

  // ------------------------------------------------------------ deliveries

  /** Take an order. Published one at a time so two phones cannot collide. */
  addDelivery(d) {
    this.deliveries = [...this.deliveries, d];
    this.pub({ op: 'deliveryAdd', d });
    this.touch('deliveries');
  }

  /** Run, refused, or run out of time — all the same to the books. */
  clearDelivery(id) {
    const before = this.deliveries.length;
    this.deliveries = this.deliveries.filter((d) => d.id !== id);
    if (this.deliveries.length === before) return false;
    this.pub({ op: 'deliveryDone', id });
    this.touch('deliveries');
    return true;
  }

  /** The ones still worth walking to. */
  liveDeliveries() { return live(this.deliveries, this.clock.absolute); }

  /**
   * Drop the ones nobody is waiting for any more. Called on the clock rather
   * than filtered at every read, so the map and the books agree about what
   * exists — and so the toast telling you it lapsed happens exactly once.
   */
  expireDeliveries() {
    const now = this.clock.absolute;
    const gone = this.deliveries.filter((d) => expired(d, now));
    for (const d of gone) {
      this.clearDelivery(d.id);
      this.toast(`Nobody waited for the order to ${d.name}.`, 'warn');
    }
    return gone.length;
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
    if (summary.revenue > this.bestDayGross) this.bestDayGross = summary.revenue;

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


  // ---------------------------------------------------------------- the bear

  /**
   * She has been bought and walked over. One bear per valley, ever — the
   * drover only has the one, and 5000 is a lot of money to spend twice.
   */
  buyBear(x, y, mapId = 'overworld') {
    if (this.bear) return false;

    this.bear = { x, y, map: mapId, fedDay: -1 };
    this.flags.bought_the_bear = true;
    this.touch('bear');
    this.touch('flags');
    return true;
  }

  /** Where she was left standing, so she is there tomorrow and for everyone. */
  parkBear(x, y, mapId = 'overworld') {
    if (!this.bear) return;
    this.bear = { ...this.bear, x: Math.round(x), y: Math.round(y), map: mapId };
    this.touch('bear');
  }

  /** One fish, one day, and she will carry you until morning. */
  feedBear(day) {
    if (!this.bear) return;
    this.bear = { ...this.bear, fedDay: day };
    this.touch('bear');
  }

  /** A delivery actually carried somewhere, which is what the drover counts. */
  countDelivery() {
    this.deliveriesRun++;
    this.touch('deliveriesRun');
  }

  // ------------------------------------------------------------ save/load

  save() {
    const data = {
      v: 1,
      // Which valley this is a save of. A browser has one slot and a server can
      // have half a dozen valleys, so without this the slot means no more than
      // "whatever was played last on this machine" — and Continue means "paste
      // that into whichever valley you are standing in", which is how a brand
      // new valley used to open with an old cafe's money, cats and quests in it.
      seed: this.worldSeed,
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
      deliveriesRun: this.deliveriesRun,
      bear: this.bear,
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

  /**
   * Is there a save worth offering to continue?
   *
   * Called with a seed, the answer is only yes if the save is of *that* valley.
   * Called without one — solo play, where there is only ever the one world —
   * any save will do, including saves written before they carried a seed.
   */
  static hasSave(seed) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      if (seed === undefined) return true;
      return JSON.parse(raw).seed === seed;
    } catch { return false; }
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
    this.deliveries = data.deliveries || [];
    this.deliveriesRun = data.deliveriesRun || 0;
    this.bear = data.bear || null;
    this.bestDayProfit = data.bestDayProfit || 0;
    this.bestDayGross = data.bestDayGross || 0;
    this.totalCustomers = data.totalCustomers || 0;
    this.daysPlayed = data.daysPlayed || 0;
    this.migrateEmployee();
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
