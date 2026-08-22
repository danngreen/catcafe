// Actors. Positions are in pixels with the origin at the character's feet, so
// the y coordinate doubles as the sort key for overlapping.

import { TILE, T, isLiquid } from '../art/tiles.js';
import { charSprite, catSprite, emoteSprite, orderBubble, bearSprite, bearSaddle, CHAR_W, CHAR_H, CAT_W, CAT_H, BEAR_W, BEAR_H, villagerLook, CAT_BREEDS } from '../art/chars.js';
import { makeRng, clamp } from '../engine/util.js';
import { audio } from '../engine/audio.js';
import { drawTextCentered } from '../engine/font.js';

const rng = makeRng(0x51a7);

// ---------------------------------------------------------------------------
// Movement helpers
// ---------------------------------------------------------------------------

const HALF_W = 5;
const FOOT_H = 6;

/** On your own two feet. Named because getting off a bear has to restore them. */
export const WALK_SPEED = 62;
export const RUN_SPEED = 104;

function tileFree(map, px, py, swims) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (!map.solid(tx, ty)) return true;
  // A bear treats the river as ground. Only the water, mind: the pier posts and
  // the rocks in it are blocked separately and stay blocked, or she would swim
  // through the harbour wall.
  return !!swims && !(map.blockedAt && map.blockedAt(tx, ty)) && isLiquid(map.get(tx, ty));
}

/**
 * Can a body with our footprint stand centred on these pixel coords?
 *
 * `swims` is carried on the actor rather than passed around, because the one
 * thing that swims is also the thing being ridden, and the rider's movement
 * code has no idea it is on a bear.
 */
export function canStand(map, x, y, swims = false) {
  return tileFree(map, x - HALF_W, y - FOOT_H, swims)
    && tileFree(map, x + HALF_W, y - FOOT_H, swims)
    && tileFree(map, x - HALF_W, y - 1, swims)
    && tileFree(map, x + HALF_W, y - 1, swims);
}

/** Move with axis separation so you slide along walls instead of sticking. */
export function moveActor(map, a, dx, dy) {
  let moved = false;
  const sw = !!a.swims;
  if (dx !== 0) {
    const nx = a.x + dx;
    if (canStand(map, nx, a.y, sw)) { a.x = nx; moved = true; }
    else {
      // Nudge round shallow corners — makes doorways feel forgiving.
      for (const slip of [-3, 3]) {
        if (canStand(map, nx, a.y + slip, sw) && canStand(map, a.x, a.y + slip, sw)) {
          a.x = nx; a.y += slip * 0.35; moved = true; break;
        }
      }
    }
  }
  if (dy !== 0) {
    const ny = a.y + dy;
    if (canStand(map, a.x, ny, sw)) { a.y = ny; moved = true; }
    else {
      for (const slip of [-3, 3]) {
        if (canStand(map, a.x + slip, ny, sw) && canStand(map, a.x + slip, a.y, sw)) {
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
    this.speed = WALK_SPEED;
    this.runSpeed = RUN_SPEED;
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
    let dx = Math.round(this.x - CHAR_W / 2 - ox);
    let dy = Math.round(this.y - CHAR_H - oy);
    const a = this.alpha != null ? this.alpha : 1;
    if (a < 1) ctx.globalAlpha = a;
    // Anyone on a mount is drawn as one animal: the bear first, at the rider's
    // feet, then the rider sitting on her back. Doing it here rather than as
    // two entries in the draw list is what stops the two of them sorting apart
    // and the rider appearing to walk in front of the bear she is sitting on.
    if (this.mount) {
      this.mount.dir = this.dir;
      this.mount.frame = this.frame;
      this.mount.moving = this.moving;
      this.mount.x = this.x;
      this.mount.y = this.y;
      this.mount.draw(ctx, ox, oy);
      const sit = riderOffset(this.dir);
      dx += sit.x;
      dy += sit.y;
    }
    ctx.drawImage(spr, dx, dy);
    if (a < 1) ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Villagers
// ---------------------------------------------------------------------------

/**
 * What somebody looks like. Most of the cast leave it to their id, so this has
 * to be one function rather than a line inside the constructor — the friends
 * list draws people who are nowhere in the world at the time.
 */
export function lookOf(def) {
  const look = villagerLook(hashId(def.id));
  return {
    species: def.species || look.species,
    coat: def.coat || look.coat,
    cloth: def.cloth || look.cloth,
  };
}

export class Villager extends Actor {
  constructor(def, x, y) {
    super(x, y);
    this.def = def;
    this.look = lookOf(def);
    this.home = { x, y };
    this.speed = 26 + rng() * 10;
    this.wanderT = rng() * 3;
    this.target = null;
    this.talking = false;
    this.lineIndex = 0;
    this.range = def.role === 'wanderer' ? 90 : 52;
    this.hasQuestMark = false;

    // Whether they're out at this hour, and the door or treeline they use to
    // come and go. Nobody blinks in and out: at dusk the day crowd walks home
    // and the night crowd walks out, and you can watch either happen.
    this.when = def.when || 'day';
    this.shift = 'here';           // here | leaving | away | arriving
    this.burrow = { x, y };
    this.alpha = 1;
    this.ghost = !!def.ghost;
    // A regular doesn't queue at the counter — they come and find you. Bigger
    // and paler than anyone else in the room, with a slow shine, so it is
    // obvious at a glance that this is not another customer.
    this.regular = !!def.regular;
    // Which seat they would rather have. A preference, not a requirement —
    // they will take any chair going, and stand if there is none.
    this.seatPrefers = def.seat || null;
    this.seat = null;
    this.mode = 'arriving';
    if (this.regular) { this.speed = 22; this.range = 0; }
  }

  /** Give up whatever they were sitting on. */
  standUp() {
    if (this.seat) { this.seat.taken = null; this.seat = null; }
    this.perch = null;
  }

  /**
   * Walk to a spot and stay on it. Regulars do not wander and do not follow —
   * they come in, find somewhere to be, and wait to be spoken to.
   */
  updateRegular(dt, map, target) {
    this.moving = false;
    if (this.talking) { this.animate(dt); return; }
    if (!target) { this.animate(dt); return; }
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 3) {
      const step = this.speed * dt;
      const before = { x: this.x, y: this.y };
      moveActor(map, this, (dx / dist) * step, (dy / dist) * step);
      this.moving = Math.hypot(this.x - before.x, this.y - before.y) > 0.05;
      if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
      else this.dir = dy > 0 ? 'down' : 'up';
      this.arrived = false;
    } else {
      this.x = target.x; this.y = target.y;
      this.dir = 'down';
      this.arrived = true;
    }
    this.animate(dt);
  }

  /** Send them home (or bring them back) through their own door. */
  setShift(active) {
    if (active && (this.shift === 'away' || this.shift === 'leaving')) {
      if (this.shift === 'away') { this.x = this.burrow.x; this.y = this.burrow.y; this.alpha = 0; }
      this.shift = 'arriving';
      this.target = { x: this.home.x, y: this.home.y };
    } else if (!active && (this.shift === 'here' || this.shift === 'arriving')) {
      this.shift = 'leaving';
      this.target = { x: this.burrow.x, y: this.burrow.y };
    }
  }

  get present() { return this.shift !== 'away'; }

  update(dt, map) {
    if (this.shift === 'away') return;
    if (this.shift === 'leaving' || this.shift === 'arriving') { this.updateShift(dt, map); return; }
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

  /** Walking out to the treeline, or in from it, fading as they go. */
  updateShift(dt, map) {
    const t = this.target || this.burrow;
    const dx = t.x - this.x, dy = t.y - this.y;
    const dist = Math.hypot(dx, dy);
    const arriving = this.shift === 'arriving';
    this.alpha = clamp(arriving ? this.alpha + dt * 1.6 : this.alpha - dt * 0.9, 0, 1);

    if (dist < 3 || (!arriving && this.alpha <= 0)) {
      if (arriving) { this.shift = 'here'; this.alpha = 1; this.target = null; }
      else { this.shift = 'away'; this.alpha = 0; this.target = null; }
      this.moving = false;
      return;
    }
    const step = this.speed * 1.25 * dt;
    const before = { x: this.x, y: this.y };
    moveActor(map, this, (dx / dist) * step, (dy / dist) * step);
    this.moving = Math.hypot(this.x - before.x, this.y - before.y) > 0.05;

    // Walls happen — this walk is a straight line, not a path. Rather than stand
    // against a hedge forever, take what we've got: on the way out, finish
    // fading where we are; on the way in, simply be here.
    //
    // The second half matters more than it looks. Somebody stuck mid-arrival is
    // drawn but can't be talked to, which from the outside is indistinguishable
    // from being stuck on the quest they're part of.
    if (!this.moving) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (arriving && this.stuckT > 1.2) {
        this.shift = 'here';
        this.alpha = 1;
        this.target = null;
        this.stuckT = 0;
        return;
      }
      if (!arriving) this.alpha = Math.max(0, this.alpha - dt * 1.4);
    } else {
      this.stuckT = 0;
    }
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else this.dir = dy > 0 ? 'down' : 'up';
    this.animate(dt);
  }

  draw(ctx, ox, oy) {
    if (this.shift === 'away') return;
    const spr = charSprite(this.look.species, this.look.coat, this.look.cloth, this.dir, this.frame);
    // Ghosts hover, and you can see the hedge through them.
    const a = this.alpha * (this.ghost ? 0.62 : 1);
    const lift = this.ghost ? Math.sin(this.bobT * 1.7) * 1.5 - 2 : 0;
    if (a < 1) ctx.globalAlpha = a;
    ctx.drawImage(spr, Math.round(this.x - CHAR_W / 2 - ox), Math.round(this.y - CHAR_H - oy + lift));
    if (a < 1) ctx.globalAlpha = 1;
  }

  /** Send them home (or bring them back) through their own door. */
  setShift(active) {
    if (active && (this.shift === 'away' || this.shift === 'leaving')) {
      if (this.shift === 'away') { this.x = this.burrow.x; this.y = this.burrow.y; this.alpha = 0; }
      this.shift = 'arriving';
      this.target = { x: this.home.x, y: this.home.y };
    } else if (!active && (this.shift === 'here' || this.shift === 'arriving')) {
      this.shift = 'leaving';
      this.target = { x: this.burrow.x, y: this.burrow.y };
    }
  }

  get present() { return this.shift !== 'away'; }

  update(dt, map) {
    if (this.shift === 'away') return;
    if (this.shift === 'leaving' || this.shift === 'arriving') { this.updateShift(dt, map); return; }
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

  /** Walking out to the treeline, or in from it, fading as they go. */
  updateShift(dt, map) {
    const t = this.target || this.burrow;
    const dx = t.x - this.x, dy = t.y - this.y;
    const dist = Math.hypot(dx, dy);
    const arriving = this.shift === 'arriving';
    this.alpha = clamp(arriving ? this.alpha + dt * 1.6 : this.alpha - dt * 0.9, 0, 1);

    if (dist < 3 || (!arriving && this.alpha <= 0)) {
      if (arriving) { this.shift = 'here'; this.alpha = 1; this.target = null; }
      else { this.shift = 'away'; this.alpha = 0; this.target = null; }
      this.moving = false;
      return;
    }
    const step = this.speed * 1.25 * dt;
    const before = { x: this.x, y: this.y };
    moveActor(map, this, (dx / dist) * step, (dy / dist) * step);
    this.moving = Math.hypot(this.x - before.x, this.y - before.y) > 0.05;

    // Walls happen — this walk is a straight line, not a path. Rather than stand
    // against a hedge forever, take what we've got: on the way out, finish
    // fading where we are; on the way in, simply be here.
    //
    // The second half matters more than it looks. Somebody stuck mid-arrival is
    // drawn but can't be talked to, which from the outside is indistinguishable
    // from being stuck on the quest they're part of.
    if (!this.moving) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (arriving && this.stuckT > 1.2) {
        this.shift = 'here';
        this.alpha = 1;
        this.target = null;
        this.stuckT = 0;
        return;
      }
      if (!arriving) this.alpha = Math.max(0, this.alpha - dt * 1.4);
    } else {
      this.stuckT = 0;
    }
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else this.dir = dy > 0 ? 'down' : 'up';
    this.animate(dt);
  }

  draw(ctx, ox, oy) {
    if (this.shift === 'away') return;
    const spr = charSprite(this.look.species, this.look.coat, this.look.cloth, this.dir, this.frame);
    // Ghosts hover, and you can see the hedge through them.
    const a = this.alpha * (this.ghost ? 0.62 : 1);
    const lift = this.ghost ? Math.sin(this.bobT * 1.7) * 1.5 - 2 : 0;
    if (a < 1) ctx.globalAlpha = a;
    ctx.drawImage(spr, Math.round(this.x - CHAR_W / 2 - ox), Math.round(this.y - CHAR_H - oy + lift));
    if (a < 1) ctx.globalAlpha = 1;
  }

  drawEmote(ctx, ox, oy, topY) {
    if (this.shift !== 'here') return;
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

// As with customers: two clients must never mint the same cat id, or adopting
// one in a shared valley would overwrite somebody else's.
let catSerial = Math.floor(Math.random() * 1e9);

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
    this.coatQuality = data.coatQuality != null ? data.coatQuality : 1;
    this.happiness = data.happiness != null ? data.happiness : 0.7;
    this.hunger = data.hunger != null ? data.hunger : 0;
    this.sick = data.sick || false;
    this.sickDays = data.sickDays || 0;
    this.accessory = data.accessory || null;
    this.age = data.age || 0;
    this.meowT = 4 + rng() * 20;
    // Sick cats say so promptly rather than on the next lull, so it is the
    // first thing you notice about them and not the last.
    this.sneezeT = this.sick ? 0.6 + rng() * 1.5 : 6 + rng() * 10;
    // A voice within the breed's voice: two tabbies are not the same tabby.
    this.pitchBias = 0.94 + rng() * 0.12;
  }

  /** How this breed sounds, and how loud. */
  get voice() {
    const b = CAT_BREEDS[this.breed] || CAT_BREEDS.tabby;
    return b.voice || { pitch: 1, gain: 1, calls: ['meow'] };
  }

  /**
   * Say something. Which noise depends on the breed — a Maine Coon chirrups
   * and a Siamese yowls — and a contented cat says it a little higher.
   */
  speak(pan = 0, opts = {}) {
    const v = this.voice;
    const calls = v.calls;
    const call = opts.call || calls[Math.floor(rng() * calls.length)];
    const mood = this.happiness > 0.6 ? 1.08 : this.happiness < 0.3 ? 0.88 : 1;
    audio.sfx(call, {
      gain: 0.55 * v.gain * (opts.gain != null ? opts.gain : 1),
      pitch: v.pitch * this.pitchBias * mood,
      pan,
    });
    return call;
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
        audio.sfx('sneeze', { gain: 0.75, pan: ctx.pan || 0 });
        // A small unhappy noise after it, in their own voice, so an unwell cat
        // is something you hear across the room rather than something you find
        // by opening the book and reading it.
        const voice = this.voice;
        setTimeout(() => audio.sfx('squeak', {
          gain: 0.4 * voice.gain, pitch: voice.pitch * 0.8, pan: ctx.pan || 0,
        }), 300);
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
      else this.speak(ctx.pan || 0);
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

// ---------------------------------------------------------------------------
// The riding bear
// ---------------------------------------------------------------------------

/**
 * A bear who lives outside the cafe.
 *
 * Off duty she behaves like an enormous cat: sits, sniffs about, sleeps a great
 * deal, wanders a few paces and thinks better of it. On duty she is furniture —
 * the rider does the moving and she is drawn under them — which is why `update`
 * does nothing at all while she is ridden.
 */
export class Bear extends Actor {
  constructor(x, y) {
    super(x, y);
    this.speed = 26;                  // ambling. She is in no hurry.
    this.swims = true;
    this.state = 'idle';
    this.pose = 'sniff';
    this.stateT = 1 + rng() * 3;
    this.target = null;
    this.ridden = false;
    this.home = { x, y };
    this.gruntT = 12 + rng() * 30;
  }

  update(dt, map, ctx = {}) {
    if (this.ridden) { this.moving = false; return; }
    this.stateT -= dt;
    this.moving = false;
    if (this.stateT <= 0) this.pickState();

    if (this.state === 'walk' && this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) { this.settle(); } else {
        const step = this.speed * dt;
        const before = { x: this.x, y: this.y };
        moveActor(map, this, (dx / dist) * step, (dy / dist) * step);
        this.moving = Math.hypot(this.x - before.x, this.y - before.y) > 0.05;
        if (!this.moving) this.settle();
        if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
        else this.dir = dy > 0 ? 'down' : 'up';
      }
    }

    // Every so often, a noise like a wardrobe being moved upstairs.
    this.gruntT -= dt;
    if (this.gruntT <= 0) {
      this.gruntT = 20 + rng() * 40;
      if (this.pose !== 'sleep') audio.sfx('rasp', { gain: 0.5, pitch: 0.45, pan: ctx.pan || 0 });
    }
    this.animate(dt);
  }

  settle() {
    this.state = 'idle';
    this.pose = 'sniff';
    this.stateT = 2 + rng() * 4;
  }

  pickState() {
    const r = rng();
    if (r < 0.34) { this.state = 'idle'; this.pose = 'sleep'; this.stateT = 12 + rng() * 20; }
    else if (r < 0.58) { this.state = 'idle'; this.pose = 'sniff'; this.stateT = 4 + rng() * 8; }
    else if (r < 0.78) { this.state = 'idle'; this.pose = 'sit'; this.stateT = 5 + rng() * 9; }
    else {
      // A few paces and no further: she stays where she was left, so you can
      // find her again without walking the whole valley.
      this.state = 'walk';
      this.pose = 'walk';
      this.stateT = 3 + rng() * 4;
      const a = rng() * Math.PI * 2;
      const d = 16 + rng() * 40;
      this.target = { x: this.home.x + Math.cos(a) * d, y: this.home.y + Math.sin(a) * d };
    }
  }

  /** Put her down here, and let this be the middle of her wandering. */
  moveTo(x, y) {
    this.x = x; this.y = y;
    this.home = { x, y };
    this.target = null;
    this.settle();
  }

  draw(ctx, ox, oy) {
    const pose = this.ridden ? (this.moving ? 'walk' : 'walk')
      : (this.moving ? 'walk' : this.pose);
    const spr = bearSprite(this.dir, this.frame, pose);
    ctx.drawImage(spr, Math.round(this.x - BEAR_W / 2 - ox), Math.round(this.y - BEAR_H - oy));
  }

  emoteTop() { return this.y - BEAR_H; }
}

/** Where to draw a rider so they sit on her back rather than in it. */
export function riderOffset(dir) { return bearSaddle(dir); }

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

// Ids have to be unique across every client in a session, so they start
// somewhere random rather than at 1.
let custSerial = Math.floor(Math.random() * 1e9);

export class Customer extends Actor {
  constructor(x, y, look, patience = 1) {
    super(x, y);
    this.id = custSerial++;
    this.puppet = false;      // a copy of somebody else's customer
    this.goalX = x;
    this.goalY = y;
    this.look = look;
    this.speed = 34 + rng() * 10;
    this.state = 'entering';   // entering -> toCounter -> ordering -> toSeat -> seated -> leaving
    this.stateT = 0;
    this.seat = null;
    this.path = null;
    this.pathIndex = 0;
    this.order = null;        // what they're asking for right this moment
    this.wish = null;         // the three or four things they came in wanting
    this.wishIndex = 0;
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

  /**
   * A copy of a customer somebody else's client is simulating. Positions arrive
   * ten times a second and we draw sixty, so ease rather than snap.
   */
  updatePuppet(dt) {
    const dx = this.goalX - this.x, dy = this.goalY - this.y;
    const d = Math.hypot(dx, dy);
    this.moving = d > 0.7;
    if (d > 96) { this.x = this.goalX; this.y = this.goalY; }
    else {
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
}

// ---------------------------------------------------------------------------
// Your employee
// ---------------------------------------------------------------------------

/**
 * The person you pay, standing behind your counter. They don't walk anywhere —
 * they turn to face whoever they are serving and hand things over — but seeing
 * them there is most of what you are buying: without it, an employee is a line
 * item on the morning card and a number in a menu.
 */
export class Employee extends Actor {
  constructor(def, x, y) {
    super(x, y);
    this.def = def;
    this.look = def.look || { species: 'cat', coat: 'cream', cloth: '#5b8fd6' };
    this.name = def.name;
    this.home = { x, y };
    this.busyT = 0;
  }

  /** `serving` is whoever is at the counter, or null. */
  update(dt, serving) {
    this.moving = false;
    if (serving) {
      this.faceTowards(serving.x, serving.y);
      this.busyT = Math.max(this.busyT, 0.6);
    } else {
      this.dir = 'down';
    }
    // A small shuffle on the spot while there is somebody to deal with, so the
    // counter doesn't look like a waxwork during a rush.
    if (this.busyT > 0) {
      this.busyT -= dt;
      this.moving = Math.sin(this.bobT * 9) > 0.4;
    }
    this.animate(dt);
  }

  draw(ctx, ox, oy) {
    const spr = charSprite(this.look.species, this.look.coat, this.look.cloth, this.dir, this.frame);
    ctx.drawImage(spr, Math.round(this.x - CHAR_W / 2 - ox), Math.round(this.y - CHAR_H - oy));
  }

  drawEmote(ctx, ox, oy, topY) {
    const x = Math.round(this.x - ox);
    const y = Math.round(topY - 11 - oy);
    const w = this.name.length * 6 + 6;
    ctx.fillStyle = 'rgba(20,17,32,0.66)';
    ctx.fillRect(x - w / 2, y - 1, w, 10);
    drawTextCentered(ctx, this.name, x, y, { color: '#ffe0a8', shadow: '#000000' });
    super.drawEmote(ctx, ox, oy, topY - 12);
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
    this.setMount(info.up);
  }

  /**
   * Somebody else is on the bear. They have their own, as far as we are
   * concerned: one bear drawn under them, which is what it looks like from
   * over here — and it saves passing her position separately when it is
   * exactly theirs anyway.
   */
  setMount(up) {
    if (up && !this.mount) this.mount = new Bear(this.x, this.y);
    else if (!up && this.mount) this.mount = null;
  }

  setFrom(info) {
    this.goalX = info.x;
    this.goalY = info.y;
    if (info.up !== undefined) this.setMount(info.up);
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
