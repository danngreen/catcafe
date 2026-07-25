// Actors. Positions are in pixels with the origin at the character's feet, so
// the y coordinate doubles as the sort key for overlapping.

import { TILE, T } from '../art/tiles.js';
import { charSprite, catSprite, emoteSprite, orderBubble, CHAR_W, CHAR_H, CAT_W, CAT_H, villagerLook, CAT_BREEDS } from '../art/chars.js';
import { makeRng, clamp } from '../engine/util.js';
import { audio } from '../engine/audio.js';
import { drawTextCentered } from '../engine/font.js';

const rng = makeRng(0x51a7);

// ---------------------------------------------------------------------------
// Movement helpers
// ---------------------------------------------------------------------------

const HALF_W = 5;
const FOOT_H = 6;

function tileFree(map, px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return !map.solid(tx, ty);
}

/** Can a body with our footprint stand centred on these pixel coords? */
export function canStand(map, x, y) {
  return tileFree(map, x - HALF_W, y - FOOT_H)
    && tileFree(map, x + HALF_W, y - FOOT_H)
    && tileFree(map, x - HALF_W, y - 1)
    && tileFree(map, x + HALF_W, y - 1);
}

/** Move with axis separation so you slide along walls instead of sticking. */
export function moveActor(map, a, dx, dy) {
  let moved = false;
  if (dx !== 0) {
    const nx = a.x + dx;
    if (canStand(map, nx, a.y)) { a.x = nx; moved = true; }
    else {
      // Nudge round shallow corners — makes doorways feel forgiving.
      for (const slip of [-3, 3]) {
        if (canStand(map, nx, a.y + slip) && canStand(map, a.x, a.y + slip)) {
          a.x = nx; a.y += slip * 0.35; moved = true; break;
        }
      }
    }
  }
  if (dy !== 0) {
    const ny = a.y + dy;
    if (canStand(map, a.x, ny)) { a.y = ny; moved = true; }
    else {
      for (const slip of [-3, 3]) {
        if (canStand(map, a.x + slip, ny) && canStand(map, a.x + slip, a.y)) {
          a.y = ny; a.x += slip * 0.35; moved = true; break;
        }
      }
    }
  }
  a.x = clamp(a.x, 4, map.w * TILE - 4);
  a.y = clamp(a.y, 8, map.h * TILE - 2);
  return moved;
}

/** Breadth-first path over walkable tiles. Interiors are small; this is plenty. */
export function findPath(map, from, to, limit = 2400) {
  if (from.x === to.x && from.y === to.y) return [];
  const W = map.w;
  const prev = new Int32Array(W * map.h).fill(-2);
  const q = [from.y * W + from.x];
  prev[from.y * W + from.x] = -1;
  const goal = to.y * W + to.x;
  let head = 0, seen = 0;
  while (head < q.length && seen++ < limit) {
    const cur = q[head++];
    if (cur === goal) break;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.h) continue;
      const ni = ny * W + nx;
      if (prev[ni] !== -2) continue;
      if (map.solid(nx, ny) && ni !== goal) continue;
      prev[ni] = cur;
      q.push(ni);
    }
  }
  if (prev[goal] === -2) return null;
  const out = [];
  for (let i = goal; i !== -1; i = prev[i]) {
    out.push({ x: i % W, y: (i / W) | 0 });
    if (out.length > 4000) break;
  }
  out.reverse();
  out.shift();
  return out;
}

// ---------------------------------------------------------------------------
// Base actor
// ---------------------------------------------------------------------------

export class Actor {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.dir = 'down';
    this.frame = 0;
    this.animT = 0;
    this.moving = false;
    this.speed = 52;
    this.emote = null;
    this.emoteT = 0;
    this.bobT = rng() * 6;
  }

  get tx() { return Math.floor(this.x / TILE); }
  get ty() { return Math.floor(this.y / TILE); }
  get sortY() { return this.y; }

  faceTowards(x, y) {
    const dx = x - this.x, dy = y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else this.dir = dy > 0 ? 'down' : 'up';
  }

  showEmote(kind, seconds = 1.8) { this.emote = kind; this.emoteIcon = null; this.emoteT = seconds; }

  /** Show an item in a speech bubble instead of a symbol. */
  showItemEmote(icon, seconds = 1.8) { this.emoteIcon = icon; this.emote = null; this.emoteT = seconds; }

  clearEmote() { this.emote = null; this.emoteIcon = null; this.emoteT = 0; }

  /** Where a bubble should sit: just above the head. */
  emoteTop() { return this.y - CHAR_H; }

  animate(dt) {
    if (this.moving) {
      this.animT += dt * (this.speed / 46);
      this.frame = Math.floor(this.animT * 5) % 4;
    } else {
      this.animT = 0;
      this.frame = 0;
    }
    if (this.emoteT > 0) {
      this.emoteT -= dt;
      if (this.emoteT <= 0) this.clearEmote();
    }
    this.bobT += dt;
  }

  drawEmote(ctx, ox, oy, topY) {
    if (!this.emote && !this.emoteIcon) return;
    const spr = this.emoteIcon ? orderBubble(this.emoteIcon) : emoteSprite(this.emote);
    const bob = Math.sin(this.bobT * 4) * 1.2;
    ctx.drawImage(spr,
      Math.round(this.x - spr.width / 2 - ox),
      Math.round(topY - spr.height - 2 + bob - oy));
  }
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export class Player extends Actor {
  constructor(x, y, look) {
    super(x, y);
    this.look = look || { species: 'cat', coat: 'ginger', cloth: '#5b8fd6' };
    this.speed = 62;
    this.runSpeed = 104;
    this.stepTimer = 0;
    this.carrying = null;
  }

  update(dt, input, map, allowMove = true) {
    const ax = input.axis();
    this.moving = false;
    if (allowMove && (ax.x || ax.y)) {
      const run = input.down('run');
      const spd = (run ? this.runSpeed : this.speed) * dt;
      let dx = ax.x, dy = ax.y;
      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
      const before = { x: this.x, y: this.y };
      moveActor(map, this, dx * spd, dy * spd);
      const dist = Math.hypot(this.x - before.x, this.y - before.y);
      this.moving = dist > 0.05;
      if (Math.abs(ax.x) > Math.abs(ax.y)) this.dir = ax.x > 0 ? 'right' : 'left';
      else if (ax.y) this.dir = ax.y > 0 ? 'down' : 'up';
      this.speedNow = run ? this.runSpeed : this.speed;

      // Footsteps, paced to the stride.
      this.stepTimer -= dist;
      if (this.moving && this.stepTimer <= 0) {
        this.stepTimer = run ? 17 : 21;
        const g = map.get(this.tx, this.ty);
        audio.sfx(g === T.FLOOR_WOOD || g === T.DECK || g === T.BRIDGE ? 'step_wood'
          : g === T.SAND ? 'step' : 'step', { gain: 0.6 });
      }
    }
    this.animate(dt);
  }

  /** The tile the player is looking at — what "use" acts on. */
  facingTile() {
    const t = { x: this.tx, y: this.ty };
    if (this.dir === 'up') t.y -= 1;
    else if (this.dir === 'down') t.y += 1;
    else if (this.dir === 'left') t.x -= 1;
    else t.x += 1;
    return t;
  }

  /** The frame we'd draw right now — the taxi cutscene borrows it. */
  sprite() {
    return charSprite(this.look.species, this.look.coat, this.look.cloth, this.dir, this.frame);
  }

  draw(ctx, ox, oy) {
    const spr = this.sprite();
    const dx = Math.round(this.x - CHAR_W / 2 - ox);
    const dy = Math.round(this.y - CHAR_H - oy);
    const a = this.alpha ?? 1;
    if (a < 1) ctx.globalAlpha = a;
    ctx.drawImage(spr, dx, dy);
    if (a < 1) ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Villagers
// ---------------------------------------------------------------------------

export class Villager extends Actor {
  constructor(def, x, y) {
    super(x, y);
    this.def = def;
    const look = villagerLook(hashId(def.id));
    this.look = {
      species: def.species || look.species,
      coat: def.coat || look.coat,
      cloth: def.cloth || look.cloth,
    };
    this.home = { x, y };
    this.speed = 26 + rng() * 10;
    this.wanderT = rng() * 3;
    this.target = null;
    this.talking = false;
    this.lineIndex = 0;
    this.range = def.role === 'wanderer' ? 90 : 52;
    this.hasQuestMark = false;
  }

  update(dt, map) {
    if (this.talking) { this.moving = false; this.animate(dt); return; }
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 1.6 + rng() * 4.5;
      if (rng() < 0.42) this.target = null;
      else {
        const a = rng() * Math.PI * 2;
        const d = 16 + rng() * this.range;
        this.target = { x: this.home.x + Math.cos(a) * d, y: this.home.y + Math.sin(a) * d };
      }
    }
    this.moving = false;
    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 3) this.target = null;
      else {
        const step = this.speed * dt;
        const before = { x: this.x, y: this.y };
        moveActor(map, this, (dx / dist) * step, (dy / dist) * step);
        this.moving = Math.hypot(this.x - before.x, this.y - before.y) > 0.05;
        if (!this.moving) this.target = null;
        if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
        else this.dir = dy > 0 ? 'down' : 'up';
      }
    }
    this.animate(dt);
  }

  draw(ctx, ox, oy) {
    const spr = charSprite(this.look.species, this.look.coat, this.look.cloth, this.dir, this.frame);
    ctx.drawImage(spr, Math.round(this.x - CHAR_W / 2 - ox), Math.round(this.y - CHAR_H - oy));
  }

  drawEmote(ctx, ox, oy, topY) {
    if (this.hasQuestMark && !this.emote && !this.emoteIcon) {
      const q = emoteSprite('quest');
      const bob = Math.sin(this.bobT * 3) * 1.5;
      ctx.drawImage(q, Math.round(this.x - 8 - ox), Math.round(topY - 16 + bob - oy));
      return;
    }
    super.drawEmote(ctx, ox, oy, topY);
  }
}

// ---------------------------------------------------------------------------
// Cats
// ---------------------------------------------------------------------------

let catSerial = 1;

export class Cat extends Actor {
  constructor(breed, x, y, data = {}) {
    super(x, y);
    this.breed = breed;
    this.id = data.id || catSerial++;
    this.name = data.name || randomCatName();
    this.speed = 34;
    this.state = 'idle';
    this.stateT = 1 + rng() * 2;
    this.pose = 'sit';
    this.target = null;
    this.groomed = data.groomed || 0;   // days of grooming left
    this.coatQuality = data.coatQuality ?? 1;
    this.happiness = data.happiness ?? 0.7;
    this.hunger = data.hunger ?? 0;
    this.sick = data.sick || false;
    this.sickDays = data.sickDays || 0;
    this.accessory = data.accessory || null;
    this.age = data.age || 0;
    this.meowT = 4 + rng() * 20;
    this.sneezeT = 6 + rng() * 10;
  }

  /** How much this cat contributes to the cafe's draw. */
  get appeal() {
    const b = CAT_BREEDS[this.breed] || CAT_BREEDS.tabby;
    let a = b.appeal;
    a *= 0.75 + this.coatQuality * 0.25;      // fed well = glossy
    if (this.groomed > 0) a *= 1.22;
    if (this.accessory) a *= 1 + (this.accessory.appeal || 0.08);
    a *= 0.6 + this.happiness * 0.55;
    if (this.sick) a *= 0.35;
    return a;
  }

  get breedName() { return (CAT_BREEDS[this.breed] || CAT_BREEDS.tabby).name; }

  update(dt, map, ctx = {}) {
    this.stateT -= dt;
    this.moving = false;

    if (this.sick) {
      // Sick cats mostly curl up and feel sorry for themselves.
      if (this.state !== 'sleep' && this.state !== 'loaf') { this.state = 'loaf'; this.pose = 'loaf'; this.stateT = 6; }
      this.sneezeT -= dt;
      if (this.sneezeT <= 0) {
        this.sneezeT = 5 + rng() * 9;
        audio.sfx('sneeze', { gain: 0.7, pan: ctx.pan || 0 });
        this.showEmote('sick', 2.2);
      }
      this.animate(dt);
      return;
    }

    if (this.stateT <= 0) this.pickState(map, ctx);

    if (this.state === 'walk' && this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 3) { this.state = 'idle'; this.pose = 'sit'; this.stateT = 1 + rng() * 3; }
      else {
        const step = this.speed * dt;
        const before = { x: this.x, y: this.y };
        moveActor(map, this, (dx / dist) * step, (dy / dist) * step);
        this.moving = Math.hypot(this.x - before.x, this.y - before.y) > 0.05;
        if (!this.moving) { this.state = 'idle'; this.pose = 'sit'; this.stateT = 0.8; }
        if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
        else this.dir = dy > 0 ? 'down' : 'up';
      }
    }

    this.meowT -= dt;
    if (this.meowT <= 0) {
      this.meowT = 9 + rng() * 26;
      if (this.happiness > 0.75 && rng() < 0.4) audio.sfx('purr', { gain: 0.45, pan: ctx.pan || 0 });
      else audio.sfx(this.happiness > 0.6 ? 'meow_happy' : 'meow', { gain: 0.55, pan: ctx.pan || 0 });
      if (rng() < 0.35) this.showEmote(this.happiness > 0.7 ? 'happy' : 'talk', 1.6);
    }

    this.animate(dt);
  }

  pickState(map, ctx) {
    const r = rng();
    const joy = ctx.joy || 0;
    if (r < 0.30) { this.state = 'idle'; this.pose = 'sit'; this.stateT = 2 + rng() * 4; }
    else if (r < 0.44) { this.state = 'idle'; this.pose = 'loaf'; this.stateT = 4 + rng() * 7; }
    else if (r < 0.54 - joy * 0.05) { this.state = 'idle'; this.pose = 'sleep'; this.stateT = 8 + rng() * 14; }
    else if (r < 0.64 + joy * 0.08) {
      this.state = 'idle'; this.pose = 'play'; this.stateT = 2 + rng() * 3;
      if (rng() < 0.5) this.showEmote('happy', 1.6);
    } else {
      this.state = 'walk'; this.pose = 'walk'; this.stateT = 4 + rng() * 5;
      const a = rng() * Math.PI * 2;
      const d = 20 + rng() * 60;
      this.target = { x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d };
    }
  }

  /** Nightly upkeep: hunger, coat, illness, grooming wearing off. */
  advanceDay(foodQuality, vet) {
    this.age++;
    if (this.groomed > 0) this.groomed--;
    if (foodQuality > 0) {
      this.hunger = 0;
      const target = clamp(0.5 + foodQuality * 0.22, 0.4, 1.5);
      this.coatQuality += (target - this.coatQuality) * 0.35;
      this.happiness = clamp(this.happiness + 0.06 + foodQuality * 0.02, 0, 1);
    } else {
      this.hunger++;
      this.coatQuality = Math.max(0.3, this.coatQuality - 0.12);
      this.happiness = clamp(this.happiness - 0.22, 0, 1);
    }
    if (this.sick) {
      this.sickDays++;
      if (vet) { this.sick = false; this.sickDays = 0; this.happiness = clamp(this.happiness + 0.3, 0, 1); }
      else this.happiness = clamp(this.happiness - 0.12, 0, 1);
    }
  }

  draw(ctx, ox, oy) {
    const spr = catSprite(this.breed, this.dir, this.frame, this.moving ? 'walk' : this.pose, this.groomed > 0);
    ctx.drawImage(spr, Math.round(this.x - CAT_W / 2 - ox), Math.round(this.y - CAT_H - oy));
  }

  emoteTop() { return this.y - CAT_H; }

  save() {
    return {
      id: this.id, breed: this.breed, name: this.name, groomed: this.groomed,
      coatQuality: this.coatQuality, happiness: this.happiness, hunger: this.hunger,
      sick: this.sick, sickDays: this.sickDays, accessory: this.accessory, age: this.age,
    };
  }
}

const CAT_NAMES = [
  'Biscuit', 'Marmalade', 'Pudding', 'Sock', 'Widget', 'Domino', 'Clementine', 'Bramble',
  'Custard', 'Waffle', 'Nutmeg', 'Pickle', 'Tuppence', 'Muffin', 'Hazel', 'Poppet',
  'Chutney', 'Bobbin', 'Crumpet', 'Ferret', 'Gravy', 'Halibut', 'Jellybean', 'Kipper',
  'Lentil', 'Mittens', 'Noodle', 'Olive', 'Parsnip', 'Quince', 'Rhubarb', 'Satsuma',
  'Toffee', 'Umbrella', 'Vinegar', 'Wobble', 'Bishop', 'Dumpling', 'Truffle', 'Barnaby',
];
let nameCursor = Math.floor(Math.random() * CAT_NAMES.length);
export function randomCatName() {
  nameCursor = (nameCursor + 1 + Math.floor(rng() * 5)) % CAT_NAMES.length;
  return CAT_NAMES[nameCursor];
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export class Customer extends Actor {
  constructor(x, y, look, patience = 1) {
    super(x, y);
    this.look = look;
    this.speed = 34 + rng() * 10;
    this.state = 'entering';   // entering -> toCounter -> ordering -> toSeat -> seated -> leaving
    this.stateT = 0;
    this.seat = null;
    this.path = null;
    this.pathIndex = 0;
    this.order = null;
    this.spend = 0;
    this.satisfaction = 0.5;
    this.stayT = 0;
    this.patience = patience;
    this.orders = 0;
    this.pettingT = 0;
    this.name = null;
  }

  followPath(dt, map) {
    if (!this.path || this.pathIndex >= this.path.length) { this.moving = false; return true; }
    const node = this.path[this.pathIndex];
    const tx = node.x * TILE + TILE / 2;
    const ty = node.y * TILE + TILE - 2;
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2.5) { this.pathIndex++; return this.pathIndex >= this.path.length; }
    const step = this.speed * dt;
    const before = { x: this.x, y: this.y };
    moveActor(map, this, (dx / dist) * step, (dy / dist) * step);
    this.moving = Math.hypot(this.x - before.x, this.y - before.y) > 0.05;
    if (!this.moving) {
      // Blocked by another customer — wait a beat and re-plan.
      this.stuck = (this.stuck || 0) + dt;
      if (this.stuck > 0.9) { this.stuck = 0; this.path = null; return false; }
    } else this.stuck = 0;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else this.dir = dy > 0 ? 'down' : 'up';
    return false;
  }

  goTo(map, tile) {
    const p = findPath(map, { x: this.tx, y: this.ty }, tile);
    this.path = p || [];
    this.pathIndex = 0;
    return !!p;
  }

  draw(ctx, ox, oy) {
    const spr = charSprite(this.look.species, this.look.coat, this.look.cloth, this.dir, this.frame);
    ctx.drawImage(spr, Math.round(this.x - CHAR_W / 2 - ox), Math.round(this.y - CHAR_H - oy));
  }
}

// ---------------------------------------------------------------------------
// Other players
// ---------------------------------------------------------------------------

/**
 * Somebody else, drawn from the positions the server relays. We ease toward
 * the last reported position rather than snapping to it: updates arrive 15
 * times a second and the screen redraws 60, so without this they'd stutter.
 */
export class RemotePlayer extends Actor {
  constructor(info) {
    super(info.x, info.y);
    this.id = info.id;
    this.name = info.n || info.name || 'Someone';
    this.look = info.look || { species: 'cat', coat: 'grey', cloth: '#8a72d6' };
    this.mapId = info.map || 'overworld';
    this.goalX = info.x;
    this.goalY = info.y;
  }

  setFrom(info) {
    this.goalX = info.x;
    this.goalY = info.y;
    this.dir = info.dir || this.dir;
    this.mapId = info.map || this.mapId;
    if (info.n) this.name = info.n;
    if (info.look) this.look = info.look;
  }

  update(dt) {
    const dx = this.goalX - this.x, dy = this.goalY - this.y;
    const d = Math.hypot(dx, dy);
    this.moving = d > 0.7;
    if (d > 96) {
      // Too far to be walking — they warped, so cut rather than slide.
      this.x = this.goalX; this.y = this.goalY;
    } else {
      const k = Math.min(1, dt * 14);
      this.x += dx * k;
      this.y += dy * k;
    }
    this.animate(dt);
  }

  draw(ctx, ox, oy) {
    const spr = charSprite(this.look.species, this.look.coat, this.look.cloth, this.dir, this.frame);
    ctx.drawImage(spr, Math.round(this.x - CHAR_W / 2 - ox), Math.round(this.y - CHAR_H - oy));
  }

  /** The name tag rides in the emote pass, above everything else. */
  drawEmote(ctx, ox, oy, topY) {
    const x = Math.round(this.x - ox);
    const y = Math.round(topY - 11 - oy);
    const w = this.name.length * 6 + 6;
    ctx.fillStyle = 'rgba(20,17,32,0.66)';
    ctx.fillRect(x - w / 2, y - 1, w, 10);
    drawTextCentered(ctx, this.name, x, y, { color: '#dfe6f2', shadow: '#000000' });
    super.drawEmote(ctx, ox, oy, topY - 12);
  }
}

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}
