// The cafe simulation.
//
// While you're standing in your own cafe this runs "live": customers walk in,
// queue at the counter, pick a seat, get distracted by a cat, order again, and
// eventually pay and leave. While you're out exploring, an employee (if you
// have one) keeps it running in the background at a coarser grain.

import { Customer } from './entities.js';
import { ITEMS, isMenuItem } from './items.js';
import { COAT_LIST, CLOTHES, SPECIES_LIST } from '../art/chars.js';
import { makeRng, clamp } from '../engine/util.js';
import { audio } from '../engine/audio.js';
import { TILE } from '../art/tiles.js';

const rng = makeRng(0x0cafe);

// Everything anyone might ask for, and the plain things most people will settle
// for. Built once: the menu doesn't change while the game is running.
const MENU_IDS = Object.keys(ITEMS).filter((id) => isMenuItem(id));
const STAPLE_IDS = MENU_IDS.filter((id) => ITEMS[id].appeal <= 1.05);
// How long somebody stands there mid-list waiting for you to answer the next
// thing they asked for, before giving up on you.
const ASK_PATIENCE = 16;

/** The nearest tile you could stand on, spiralling out. Null if boxed in. */
function nearestFree(map, tx, ty) {
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // ring only
        const x = tx + dx, y = ty + dy;
        if (map.inBounds(x, y) && !map.solid(x, y)) return { x, y };
      }
    }
  }
  return null;
}

/** How busy the valley is at a given hour — two humps, lunch and early evening. */
function hourDemand(h) {
  if (h < 7 || h >= 21) return 0.05;
  const morning = Math.exp(-((h - 10.0) ** 2) / 6.0);
  const evening = Math.exp(-((h - 17.5) ** 2) / 5.0);
  return clamp(0.18 + morning * 1.05 + evening * 0.85, 0, 2.2);
}

export class Cafe {
  constructor(state) {
    this.state = state;          // shared game state (money, stock, cats...)
    this.customers = [];
    this.spawnTimer = 6;
    this.awayTimer = 0;
    this.log = [];               // one-line events for the end-of-day summary
    this.todayCustomers = 0;
    this.todayRevenue = 0;
    this.todayCosts = 0;
    this.passedBy = 0;
    this.walkedOut = 0;       // came in, asked, and we had none of it
    this.missed = {};         // id -> times asked for and not in stock today
    this.servedStreak = 0;
    this.lastPassMessage = 0;
  }

  // ---------------------------------------------------------------- ratings

  /** Sum of the appeal of everything placed in the rooms. */
  furnitureAppeal() {
    let a = 0;
    for (const f of this.state.cafe.furniture) {
      const it = Object.values(ITEMS).find((v) => v.place === f.type);
      if (it && it.appeal) a += it.appeal;
      else a += 0.15;
    }
    return a;
  }

  /** How much the cats themselves draw a crowd. */
  catAppeal() {
    return this.state.cats.reduce((s, c) => s + c.appeal, 0);
  }

  /** Variety and quality of what's actually available to order right now. */
  menuAppeal() {
    const avail = this.availableMenu();
    if (!avail.length) return 0;
    const best = avail.map((id) => ITEMS[id].appeal).sort((a, b) => b - a);
    const top = best.slice(0, 6);
    return top.reduce((s, v) => s + v, 0) * 0.55 + Math.min(avail.length, 10) * 0.12;
  }

  /** Seats that exist, and seats currently free. */
  seats() { return this.state.cafeMap?.meta?.seats || []; }
  freeSeats() { return this.seats().filter((s) => !s.taken); }

  /** The headline number the player sees on the cafe screen. */
  charm() {
    const f = this.furnitureAppeal();
    const c = this.catAppeal();
    const m = this.menuAppeal();
    const clean = this.state.cats.some((k) => k.sick) ? 0.72 : 1;
    return (2 + f * 0.35 + c * 0.75 + m * 0.5) * clean * (0.6 + this.state.reputation * 0.8);
  }

  // ---------------------------------------------------------------- stock

  availableMenu() {
    const out = [];
    for (const [id, batches] of Object.entries(this.state.stock)) {
      if (!isMenuItem(id)) continue;
      const qty = batches.reduce((s, b) => s + b.qty, 0);
      if (qty > 0) out.push(id);
    }
    return out;
  }

  stockCount(id) {
    const b = this.state.stock[id];
    return b ? b.reduce((s, x) => s + x.qty, 0) : 0;
  }

  addStock(id, qty, day) {
    if (!this.state.stock[id]) this.state.stock[id] = [];
    this.state.stock[id].push({ qty, day });
    this.state.pub({ op: 'stockAdd', id, qty, day });
  }

  /** Consume one portion, oldest batch first. */
  takeStock(id, qty = 1) {
    const batches = this.state.stock[id];
    if (!batches) return false;
    let need = qty;
    for (const b of batches) {
      const take = Math.min(b.qty, need);
      b.qty -= take;
      need -= take;
      if (need <= 0) break;
    }
    this.state.stock[id] = batches.filter((b) => b.qty > 0);
    this.state.pub({ op: 'stockTake', id, qty });
    return need <= 0;
  }

  /** Throw out anything past its shelf life. Returns what was lost. */
  spoilCheck(day) {
    const lost = [];
    for (const [id, batches] of Object.entries(this.state.stock)) {
      const it = ITEMS[id];
      if (!it || !it.shelf) continue;
      let n = 0;
      const keep = [];
      for (const b of batches) {
        if (day - b.day >= it.shelf) n += b.qty;
        else keep.push(b);
      }
      if (n > 0) { lost.push({ id, qty: n }); this.state.stock[id] = keep; }
      else this.state.stock[id] = keep;
    }
    return lost;
  }

  // ---------------------------------------------------------------- opening

  /**
   * Anyone behind the counter will do. Playing alone that is only ever you; in
   * a shared valley one of you can mind the shop while the others go shopping.
   */
  get minded() { return this.state.cafeOccupied || this.state.inCafe; }

  get isOpen() {
    const st = this.state;
    if (!st.shopOpen) return false;
    const h = st.clock.hourFloat;
    const [o, c] = st.shopHours;
    if (h < o || h >= c) return false;
    // Somebody has to be minding the place.
    return this.minded || (st.employee && st.employee.onDuty);
  }

  /** Why we're closed — shown on the cafe screen. */
  closedReason() {
    const st = this.state;
    if (!st.shopOpen) return 'Closed (you set the sign to CLOSED)';
    const h = st.clock.hourFloat;
    const [o, c] = st.shopHours;
    if (h < o) return `Opens at ${fmtHour(o)}`;
    if (h >= c) return `Closed for the day at ${fmtHour(c)}`;
    if (!this.minded && !(st.employee && st.employee.onDuty)) return 'Nobody is minding the counter';
    return '';
  }

  // ------------------------------------------------------------- live sim

  update(dt, ctx) {
    if (this.minded) this.updateLive(dt, ctx);
    else this.updateAway(dt);
  }

  /**
   * What the clients who aren't running the simulation do instead: ease the
   * copies along towards wherever the owner last said they were.
   */
  updatePuppets(dt) {
    for (const c of this.customers) c.updatePuppet(dt);
  }

  /** Take the owner's word for who is in the room and where they're standing. */
  applyCustomers(list) {
    const byId = new Map(this.customers.map((c) => [c.id, c]));
    this.customers = list.map(([id, x, y, dir, frame, look, state, order]) => {
      let c = byId.get(id);
      if (!c) {
        c = new Customer(x, y, look || { species: 'mouse', coat: 'grey', cloth: CLOTHES[0] });
        c.id = id;
        c.puppet = true;
      }
      c.goalX = x; c.goalY = y;
      c.dir = dir; c.frame = frame; c.state = state;
      // The bubble is drawn from the emote, not from `order`, and only the
      // client running the room ever calls showAsk — so without this the other
      // players could see everybody queueing and nothing anybody wanted.
      if (order !== c.order || state !== c.shownFor) {
        c.order = order;
        c.shownFor = state;
        if (order && state === 'waiting' && ITEMS[order]) c.showItemEmote(ITEMS[order].icon, 999);
        else c.clearEmote();
      }
      return c;
    });
  }

  updateLive(dt, ctx) {
    const st = this.state;
    const map = st.cafeMap;
    if (!map) return;

    // --- arrivals ---
    if (this.isOpen) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const rate = this.arrivalRate();
        this.spawnTimer = rate > 0 ? clamp(60 / rate, 3.5, 90) * (0.7 + rng() * 0.6) : 20;
        this.trySpawn(map);
      }
    }

    // --- customers ---
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i];
      this.updateCustomer(c, dt, map, ctx);
      if (c.done) {
        if (c.seat) c.seat.taken = null;
        this.customers.splice(i, 1);
      }
    }

    // --- ambience scales with how full the room is ---
    const busy = clamp(this.customers.length / 6, 0, 1);
    ctx.chatter = busy;
  }

  arrivalRate() {
    const st = this.state;
    const h = st.clock.hourFloat;
    let rate = this.charm() * 0.45 * hourDemand(h);
    if (st.clock.isWeekend) rate *= 1.65;
    if (st.employee && !this.minded) rate *= 0.55 + st.employee.quality * 0.5;
    // A visibly full room turns people away before they even try the door.
    const free = this.freeSeats().length;
    const total = this.seats().length || 1;
    const fullness = 1 - free / total;
    if (fullness > 0.8) rate *= 0.25;
    return rate;
  }

  trySpawn(map) {
    const st = this.state;
    const free = this.freeSeats();
    const door = map.meta.door;
    if (!door) return;
    if (!free.length) {
      // They peer through the window and keep walking.
      this.passedBy++;
      if (performance.now() - this.lastPassMessage > 9000) {
        this.lastPassMessage = performance.now();
        st.toast('Somebody looked in, saw no free seat, and walked on.', 'warn');
      }
      return;
    }
    if (!this.availableMenu().length) {
      this.passedBy++;
      if (performance.now() - this.lastPassMessage > 9000) {
        this.lastPassMessage = performance.now();
        st.toast('A customer came in, saw the empty menu board, and left.', 'warn');
      }
      return;
    }

    const look = {
      species: SPECIES_LIST[Math.floor(rng() * SPECIES_LIST.length)],
      coat: COAT_LIST[Math.floor(rng() * COAT_LIST.length)],
      cloth: CLOTHES[Math.floor(rng() * CLOTHES.length)],
    };
    const c = new Customer(door.x * TILE + TILE / 2, door.y * TILE + TILE - 2, look, 0.7 + rng() * 0.8);
    c.state = 'toCounter';
    this.customers.push(c);
    audio.sfx('door', { gain: 0.5 });
  }

  counterTile(map) {
    // Stand in front of the service counter; fall back to the middle of the room.
    for (const o of map.objects) {
      if (o.type === 'counter' || o.type === 'register') {
        const t = { x: o.tx, y: o.ty + 2 };
        if (!map.solid(t.x, t.y)) return t;
        const t2 = { x: o.tx + 1, y: o.ty + 2 };
        if (!map.solid(t2.x, t2.y)) return t2;
      }
    }
    const r = map.meta.rooms[0];
    return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
  }

  /** Nth place in the queue: straight back from the counter, then sideways. */
  queueSpot(map, head, slot) {
    // Fill straight back from the counter first, then start a second column,
    // so a busy morning looks like a queue rather than a scrum.
    const candidates = [];
    for (const off of [0, 1, -1, 2, -2]) {
      for (let d = 0; d < 5; d++) candidates.push({ x: head.x + off, y: head.y + d });
    }
    const free = candidates.filter((p) => map.inBounds(p.x, p.y) && !map.solid(p.x, p.y));
    return free[Math.min(slot, free.length - 1)] || head;
  }

  updateCustomer(c, dt, map, ctx) {
    const st = this.state;
    c.animate(dt);

    switch (c.state) {
      case 'toCounter': {
        if (!c.path) {
          const t = this.counterTile(map);
          // Take the first free spot in the queue, which trails away from the
          // counter rather than heaping everyone onto one tile.
          if (c.queueSlot === undefined) {
            const taken = new Set(this.customers.filter((o) => o !== c && o.queueSlot !== undefined).map((o) => o.queueSlot));
            let slot = 0;
            while (taken.has(slot) && slot < 12) slot++;
            c.queueSlot = slot;
          }
          const target = this.queueSpot(map, t, c.queueSlot);
          if (!c.goTo(map, target)) { c.state = 'leaving'; break; }
        }
        if (c.followPath(dt, map)) {
          c.state = 'waiting';
          c.stateT = 0;
          c.dir = 'up';
          this.startWishlist(c);
          // Show what they're waiting for, so you can see the room's orders at a glance.
          this.showAsk(c);
        }
        break;
      }

      case 'waiting': {
        c.stateT += dt;
        c.moving = false;
        const onDuty = !!(st.employee && st.employee.onDuty);
        const staffed = this.minded || onDuty;
        // Serving them yourself is faster and they like you more for it.
        const autoDelay = onDuty ? 4.5 - st.employee.quality * 2 : 5;
        if (c.served) {
          this.answerAsk(c, c.servedByPlayer);
          break;
        }
        if (!staffed) {
          if (c.stateT > 8) { c.satisfaction = 0.1; c.state = 'leaving'; c.showEmote('alert', 2); st.toast('A customer waited, gave up, and left.', 'bad'); }
          break;
        }
        // An employee works the whole list on their own. You don't: once you've
        // had to tell somebody you're out of something, the next thing they ask
        // for is yours to answer. Rattling through the rest of their list by
        // itself takes away both the moment and the chance to note it down.
        if (onDuty || c.wishIndex === 0) {
          if (c.stateT > autoDelay) this.answerAsk(c, false);
        } else if (c.stateT > ASK_PATIENCE) {
          // Left standing at the counter mid-list.
          c.satisfaction = clamp(c.satisfaction * 0.4, 0, 1.6);
          c.state = 'leaving';
          c.path = null;
          c.showEmote('alert', 2);
          this.walkedOut++;
          st.toast('Somebody gave up waiting to be served.', 'warn');
        }
        break;
      }

      case 'toSeat': {
        if (!c.path) {
          if (!c.seat) { c.state = 'leaving'; break; }
          if (!c.goTo(map, { x: c.seat.x, y: c.seat.y })) { c.state = 'leaving'; break; }
        }
        // Snap onto the chair once we're on or beside it, so nobody hovers a
        // pixel short of sitting down.
        const seatX = c.seat.x * TILE + TILE / 2;
        const seatY = c.seat.y * TILE + TILE - 3;
        if (c.followPath(dt, map) || Math.hypot(seatX - c.x, seatY - c.y) < 5) {
          c.x = seatX;
          c.y = seatY;
          c.state = 'seated';
          c.moving = false;
          c.dir = 'up';
          c.stayT = this.stayDuration(c);
          c.showEmote('happy', 2);
        }
        break;
      }

      case 'seated': {
        c.moving = false;
        c.stayT -= dt;

        // A cat wandering past is the whole reason they came.
        for (const cat of st.catActors) {
          const d = Math.hypot(cat.x - c.x, cat.y - c.y);
          if (d < 26) {
            c.pettingT += dt;
            if (c.pettingT > 1.4) {
              c.pettingT = 0;
              c.satisfaction = clamp(c.satisfaction + 0.05 * cat.appeal * 0.6, 0, 1.6);
              c.stayT += 6;
              if (rng() < 0.5) c.showEmote('heart', 1.8);
              if (rng() < 0.25) audio.sfx('purr', { gain: 0.3 });
            }
            break;
          }
        }

        if (c.stayT <= 0) {
          // Order again, or settle up and go.
          const again = rng() < clamp(0.16 + c.satisfaction * 0.42, 0, 0.75) && c.orders < 4;
          if (again && this.availableMenu().length) {
            if (c.seat) { c.seat.taken = null; c.seat = null; }
            c.state = 'toCounter';
            c.path = null;
          } else {
            c.state = 'leaving';
            c.path = null;
          }
        }
        break;
      }

      case 'leaving': {
        if (!c.path) {
          c.queueSlot = undefined;
          if (c.seat) { c.seat.taken = null; c.seat = null; }
          const door = map.meta.door;
          if (!c.goTo(map, { x: door.x, y: door.y })) { c.done = true; break; }
        }
        if (c.followPath(dt, map)) {
          this.checkout(c);
          c.done = true;
        }
        break;
      }
      default: break;
    }
  }

  /** How long someone lingers, driven by comfort and how nice the place is. */
  stayDuration(c) {
    const base = 26;
    const comfort = c.seat && c.seat.table ? 1.35 : 1.0;
    const charm = 1 + this.furnitureAppeal() * 0.035;
    return base * comfort * charm * (0.75 + rng() * 0.6);
  }

  pickOrder() {
    const avail = this.availableMenu();
    if (!avail.length) return null;
    // Weight towards nicer things, but not exclusively.
    const weights = avail.map((id) => 0.4 + ITEMS[id].appeal);
    let total = weights.reduce((s, v) => s + v, 0);
    let r = rng() * total;
    for (let i = 0; i < avail.length; i++) {
      r -= weights[i];
      if (r <= 0) return avail[i];
    }
    return avail[0];
  }

  /**
   * What somebody walks in wanting — three or four things, in the order they'd
   * ask for them, drawn from the whole menu rather than from your shelves.
   *
   * That is the point of it: what people want is not what you happen to have,
   * and finding out is how you learn what to stock. The list runs fanciest
   * first, the way anybody orders ("a matcha? ...no? just a tea then"), so a
   * cafe with the basics in usually still makes a sale — a smaller one.
   */
  buildWishlist() {
    const pool = MENU_IDS.slice();
    const weights = pool.map((id) => 0.35 + ITEMS[id].appeal);
    const picks = [];
    const want = 2 + Math.floor(rng() * 2);                 // two or three fancies
    for (let n = 0; n < want && pool.length; n++) {
      let total = weights.reduce((s, v) => s + v, 0);
      let r = rng() * total;
      let i = 0;
      for (; i < pool.length - 1; i++) { r -= weights[i]; if (r <= 0) break; }
      picks.push(pool[i]);
      pool.splice(i, 1);
      weights.splice(i, 1);
    }
    // Most people have something plain they'd settle for. Some don't, and those
    // are the ones who walk out — which is what makes the rest worth stocking.
    if (rng() < 0.72) {
      const staples = STAPLE_IDS.filter((id) => !picks.includes(id));
      if (staples.length) picks.push(staples[Math.floor(rng() * staples.length)]);
    }
    picks.sort((a, b) => ITEMS[b].appeal - ITEMS[a].appeal);
    return picks;
  }

  /** Give somebody a fresh list and start them on the first thing. */
  startWishlist(c) {
    c.wish = this.buildWishlist();
    c.wishIndex = 0;
    c.order = c.wish[0] || null;
  }

  /** Show what they're asking for right now. */
  showAsk(c) {
    if (c.order) c.showItemEmote(ITEMS[c.order].icon, 999);
    else c.showEmote('alert', 999);
  }

  /**
   * Answer whatever they just asked for. In stock, they buy it and go and sit
   * down; out of stock, they shrug and name the next thing on their list. One
   * answer per press, so running out is something you hear and see happen.
   */
  answerAsk(c, byPlayer) {
    const st = this.state;
    c.served = false;
    c.servedByPlayer = false;

    const id = c.order;
    if (id && this.stockCount(id) > 0) {
      this.completeOrder(c, id, byPlayer);
      return;
    }

    // Out of it. Remember who asked for what — it's the shopping list.
    if (id) {
      this.missed[id] = (this.missed[id] || 0) + 1;
      st.floatText(`no ${ITEMS[id].name.toLowerCase()}`, c.x, c.y - 30, '#e8a0a0');
    }
    audio.sfx('outof', { gain: 0.6 });
    c.satisfaction = clamp(c.satisfaction - 0.12, 0, 1.6);
    c.wishIndex++;
    c.stateT = 0;                       // they'll wait again for the next answer

    if (c.wishIndex >= (c.wish ? c.wish.length : 0)) {
      // Nothing they wanted. They're not cross, but they're not staying.
      c.order = null;
      c.satisfaction = clamp(c.satisfaction * 0.5, 0, 1.6);
      c.state = 'leaving';
      c.path = null;
      c.showEmote('alert', 2.2);
      this.walkedOut++;
      return;
    }
    c.order = c.wish[c.wishIndex];
    this.showAsk(c);
  }

  /** Called by the player pressing Space at a waiting customer. */
  serveNearest(px, py) {
    const best = this.waitingNear(px, py);
    if (!best) return false;
    best.served = true;
    best.servedByPlayer = true;
    return true;
  }

  /** The nearest customer standing there waiting to be served, if any. */
  waitingNear(px, py) {
    let best = null, bestD = 34;
    for (const c of this.customers) {
      if (c.state !== 'waiting' || c.served) continue;
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /** They asked for `id`, we have it: ring it up and find them a seat. */
  completeOrder(c, id, byPlayer) {
    const st = this.state;
    if (!id || !this.takeStock(id, 1)) {
      // Somebody else took the last one between the ask and the answer.
      c.satisfaction = clamp(c.satisfaction - 0.2, 0, 1.6);
      c.state = 'leaving';
      c.path = null;
      c.showEmote('alert', 2);
      st.toast('You ran out of something a customer wanted.', 'warn');
      return;
    }
    const it = ITEMS[id];
    let pay = it.price;
    let sat = 0.45 + it.appeal * 0.16;
    if (byPlayer) { sat += 0.22; pay = Math.round(pay * 1.1); }        // a tip for good service
    if (st.employee && st.employee.onDuty && !this.minded) {
      sat *= 0.55 + st.employee.quality * 0.6;
    }
    c.satisfaction = clamp(c.satisfaction * 0.4 + sat, 0, 1.6);
    c.spend += pay;
    c.orders++;
    c.clearEmote();
    c.served = false;
    c.servedByPlayer = false;
    c.queueSlot = undefined;   // free our place in the queue

    audio.sfx(byPlayer ? 'cash' : 'coin', { gain: 0.6 });
    // Trading after sunset is its own small achievement, and one job asks for it.
    if (byPlayer && st.clock.isDark && !st.flags.served_after_dark) {
      st.flags.served_after_dark = true;
      st.touch('flags');
    }
    st.earn(pay);
    this.todayRevenue += pay;
    st.floatText(`+${pay}`, c.x, c.y - 26, '#ffcf6b');

    // Find a seat and go and enjoy it.
    const free = this.freeSeats();
    if (free.length) {
      // Prefer a seat at a table, and one that isn't right by the door.
      free.sort((a, b) => (b.table ? 1 : 0) - (a.table ? 1 : 0));
      const seat = free[Math.floor(rng() * Math.min(3, free.length))];
      seat.taken = c;
      c.seat = seat;
      c.state = 'toSeat';
      c.path = null;
    } else {
      // Takeaway.
      c.state = 'leaving';
      c.path = null;
    }
    if (c.orders === 1) this.todayCustomers++;
  }

  checkout(c) {
    const st = this.state;
    const s = clamp(c.satisfaction, 0, 1.6);
    st.reputation = clamp(st.reputation + (s - 0.62) * 0.012, 0, 1);
    st.touch('reputation');
    if (s > 0.9) this.servedStreak++;
    else this.servedStreak = 0;
    if (c.spend > 0) audio.sfx('coin', { gain: 0.35 });
  }

  // ------------------------------------------------------------- away sim

  /** Coarse simulation while the player is elsewhere and staff are on duty. */
  updateAway(dt) {
    const st = this.state;
    if (!this.isOpen) return;
    this.awayTimer -= dt;
    if (this.awayTimer > 0) return;
    const rate = this.arrivalRate();
    this.awayTimer = rate > 0 ? clamp(60 / rate, 5, 120) : 30;

    const avail = this.availableMenu();
    if (!avail.length) return;
    if (!this.freeSeats().length && this.seats().length) return;

    const id = this.pickOrder();
    if (!id || !this.takeStock(id, 1)) return;
    const it = ITEMS[id];
    const q = st.employee ? st.employee.quality : 0.4;
    const pay = Math.round(it.price * (0.7 + q * 0.35));
    st.earn(pay);
    this.todayRevenue += pay;
    this.todayCustomers++;
    const sat = (0.4 + it.appeal * 0.14) * (0.55 + q * 0.6);
    st.reputation = clamp(st.reputation + (sat - 0.62) * 0.008, 0, 1);
    st.touch('reputation');
  }

  // --------------------------------------------------------- daily rollover

  /** Everything that happens overnight. Returns a summary for the morning card. */
  endOfDay() {
    const st = this.state;
    const summary = {
      day: st.clock.day,
      customers: this.todayCustomers,
      revenue: this.todayRevenue,
      costs: 0,
      lines: [],
      passedBy: this.passedBy,
    };

    // --- feed the cats ---
    const catCount = st.cats.length;
    let quality = 0;
    if (catCount > 0) {
      const foods = ['gourmet', 'fresh_fish', 'good_food', 'kibble'];
      let fed = 0;
      for (const f of foods) {
        while (fed < catCount && this.stockCount(f) > 0) {
          this.takeStock(f, 1);
          const portions = ITEMS[f].portions || 6;
          const feeds = Math.min(portions, catCount - fed);
          fed += feeds;
          quality = Math.max(quality, ITEMS[f].quality);
        }
        if (fed >= catCount) break;
      }
      if (fed < catCount) {
        summary.lines.push({ text: `${catCount - fed} cat${catCount - fed > 1 ? 's' : ''} went hungry.`, tone: 'bad' });
        quality = 0;
      } else {
        const names = { 1: 'kibble', 2: 'good food', 3: 'fresh fish', 4: 'gourmet tins' };
        summary.lines.push({ text: `Cats fed on ${names[quality] || 'scraps'}.`, tone: 'good' });
      }
    }

    // --- illness ---
    const sickBefore = st.cats.filter((c) => c.sick).length;
    for (const cat of st.cats) {
      cat.advanceDay(quality, false);
    }
    for (const cat of st.cats) {
      if (cat.sick) continue;
      let risk = 0.012 + (1 - clamp(cat.coatQuality, 0, 1.4)) * 0.05;
      risk += sickBefore * 0.05;                                   // it spreads
      risk += Math.max(0, catCount - this.seats().length * 0.8) * 0.01; // crowding
      // Supplies live in the bag, not the pantry.
      if (st.has('vitamins')) risk *= 0.45;
      if (cat.hunger > 0) risk += 0.08 * cat.hunger;
      if (rng() < risk) {
        cat.sick = true;
        summary.lines.push({ text: `${cat.name} is sneezing. Take them to the vet.`, tone: 'bad' });
      }
    }
    if (catCount > 0 && st.take('vitamins')) {
      summary.lines.push({ text: 'Vitamins all round.', tone: 'good' });
    }

    // --- daily costs ---
    const upkeep = catCount * 4;
    summary.costs += upkeep;
    if (upkeep) summary.lines.push({ text: `Cat upkeep: ${upkeep}`, tone: 'cost' });

    if (st.employee) {
      const wage = st.employee.wage;
      summary.costs += wage;
      summary.lines.push({ text: `${st.employee.name}'s wage: ${wage}`, tone: 'cost' });
      // Underpaid staff get worse; well-paid staff get better, up to a point.
      const fair = st.employee.fairWage;
      const ratio = wage / fair;
      const target = clamp((ratio - 0.55) / 0.9, 0.05, 1);
      st.employee.quality += (target - st.employee.quality) * 0.4;
      if (ratio < 0.7 && rng() < 0.28) {
        summary.lines.push({ text: `${st.employee.name} is grumbling about the pay.`, tone: 'warn' });
        st.reputation = clamp(st.reputation - 0.03, 0, 1);
      }
      if (ratio < 0.5 && rng() < 0.35) {
        summary.lines.push({ text: `${st.employee.name} has quit.`, tone: 'bad' });
        st.employee = null;
      }
    }

    // --- spoilage ---
    const lost = this.spoilCheck(st.clock.day);
    for (const l of lost) {
      summary.lines.push({ text: `${l.qty} x ${ITEMS[l.id]?.name || l.id} went bad.`, tone: 'warn' });
    }

    st.spend(summary.costs);
    summary.profit = summary.revenue - summary.costs;

    // --- what people wanted and we didn't have ---
    // The whole point of the asking: you can only stock for tomorrow if you
    // know what was asked for today. Name the two most-wanted.
    const wanted = Object.entries(this.missed).sort((a, b) => b[1] - a[1]).slice(0, 2);
    for (const [id, n] of wanted) {
      summary.lines.push({
        text: `${n} asked for ${ITEMS[id]?.name || id}. You had none.`,
        tone: 'warn',
      });
    }
    if (this.walkedOut) {
      summary.lines.push({
        text: `${this.walkedOut} left without buying anything.`,
        tone: 'bad',
      });
    }

    if (this.passedBy > 3) {
      summary.lines.push({ text: `${this.passedBy} people looked in and kept walking.`, tone: 'warn' });
    }
    if (summary.customers === 0 && st.shopOpen) {
      summary.lines.push({ text: 'Nobody came in at all today.', tone: 'warn' });
    }

    this.todayCustomers = 0;
    this.todayRevenue = 0;
    this.todayCosts = 0;
    this.passedBy = 0;
    this.walkedOut = 0;
    this.missed = {};
    for (const c of this.customers) { if (c.seat) c.seat.taken = null; }
    this.customers.length = 0;

    return summary;
  }

  /** Drop every customer (used when the shop closes or you rebuild the room). */
  clearCustomers() {
    for (const c of this.customers) if (c.seat) c.seat.taken = null;
    this.customers.length = 0;
  }

  /**
   * Put the customers back after the room has been rebuilt, rather than
   * sweeping them all out — which is what putting down a single plant pot used
   * to do, and it emptied the cafe for the rest of the afternoon.
   *
   * The map is a new object, so every seat reference and every path is stale
   * even where nothing about that corner of the room actually changed.
   */
  reseatCustomers(map) {
    const seats = (map.meta && map.meta.seats) || [];
    for (const s of seats) s.taken = null;
    const seatAt = (x, y) => seats.find((s) => s.x === x && s.y === y);

    const keep = [];
    for (const c of this.customers) {
      // Tiles may have moved under them; any route they were following is void.
      c.path = null;
      c.pathIndex = 0;

      if (map.solid(c.tx, c.ty)) {
        // Something was built on top of them. Step them aside if there's room.
        const spot = nearestFree(map, c.tx, c.ty);
        if (!spot) continue;                    // nowhere to go: they slip out
        c.x = spot.x * TILE + TILE / 2;
        c.y = spot.y * TILE + TILE - 2;
      }

      if (c.seat) {
        const same = seatAt(c.seat.x, c.seat.y);
        if (same && !same.taken) {
          same.taken = c;
          c.seat = same;
        } else {
          // Their chair has gone. Stand up, take another if there is one, and
          // otherwise call it a day — no satisfaction hit, since being moved
          // along is the management's doing rather than anything they did.
          c.seat = null;
          const free = seats.filter((s) => !s.taken);
          if (free.length) {
            const s = free[Math.floor(rng() * Math.min(3, free.length))];
            s.taken = c;
            c.seat = s;
            c.state = 'toSeat';
            c.showEmote('alert', 1.6);
          } else {
            c.state = 'leaving';
            c.showEmote('alert', 2);
          }
        }
      }
      keep.push(c);
    }
    this.customers = keep;
  }
}

export function fmtHour(h) {
  const hh = Math.floor(h) % 12 === 0 ? 12 : Math.floor(h) % 12;
  const m = Math.round((h % 1) * 60);
  return `${hh}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 || h >= 24 ? 'am' : 'pm'}`;
}

/** Candidates you can hire, once you can afford to. */
export const HIRE_POOL = [
  { id: 'saffron', name: 'Saffron', fairWage: 90, blurb: 'Quick, chatty, remembers everyone\'s order.',
    look: { species: 'fox', coat: 'fox', cloth: '#e08b3f' } },
  { id: 'moss', name: 'Moss', fairWage: 70, blurb: 'Slow but unfailingly kind. Customers relax around him.',
    look: { species: 'bear', coat: 'bear', cloth: '#6b9e8f' } },
  { id: 'thimble', name: 'Thimble', fairWage: 60, blurb: 'Small, tireless, slightly frightened of the espresso machine.',
    look: { species: 'mouse', coat: 'grey', cloth: '#8fa8c9' } },
  { id: 'copper', name: 'Copper', fairWage: 120, blurb: 'Worked market stalls for years. Sells like breathing.',
    look: { species: 'squirrel', coat: 'ginger', cloth: '#c05a7a' } },
];

export const HIRE_BY_ID = Object.fromEntries(HIRE_POOL.map((h) => [h.id, h]));
