// Short scripted moments that play over the world: the taxi bird collecting
// you, and the walk upstairs to bed at the inn. They run inside the normal game
// loop — the world keeps ticking, the player just stops taking orders.

import { taxiBirdSprite, TAXI_SEAT_Y, CHAR_W, CHAR_H } from '../art/chars.js';
import { TILE } from '../art/tiles.js';
import { audio } from '../engine/audio.js';
import { clamp } from '../engine/util.js';

const ease = (t) => t * t * (3 - 2 * t);

/**
 * The taxi bird. Runs in two halves around the map change: `pickup` at the
 * departure end, then `dropoff` once the player has been moved.
 */
export class TaxiFlight {
  /** onBoarded fires when the player is off the ground; onDone when it's over. */
  constructor(phase, player, { onBoarded, onDone }) {
    this.phase = phase;              // 'pickup' | 'dropoff'
    this.player = player;
    this.onBoarded = onBoarded;
    this.onDone = onDone;
    this.t = 0;
    this.flapT = 0;
    this.flap = 0;
    this.done = false;
    this.hidePlayer = phase === 'dropoff';
    this.groundY = player.y;
    this.x = player.x;
    // Start high above, or at ground level for the moment of arrival.
    this.y = phase === 'pickup' ? player.y - 220 : player.y - 220;
    this.stage = 'descend';
    this.stageT = 0;
    audio.sfx('wing', { gain: 0.8 });
  }

  update(dt) {
    this.t += dt;
    this.stageT += dt;
    // Wings beat faster while hovering than while gliding away.
    this.flapT += dt * (this.stage === 'hover' ? 14 : 9);
    this.flap = Math.floor(this.flapT) % 4;

    const HOVER_Y = this.groundY - 34;

    if (this.stage === 'descend') {
      const k = clamp(this.stageT / 1.0, 0, 1);
      this.y = (this.groundY - 220) + (HOVER_Y - (this.groundY - 220)) * ease(k);
      if (this.phase === 'dropoff') this.hidePlayer = true;
      if (k >= 1) {
        this.stage = 'hover';
        this.stageT = 0;
        audio.sfx('wing', { gain: 0.5 });
        if (this.phase === 'dropoff') this.hidePlayer = false;   // they hop out
      }
    } else if (this.stage === 'hover') {
      this.y = HOVER_Y + Math.sin(this.t * 5) * 2;
      if (this.stageT > 0.55) {
        this.stage = 'leave';
        this.stageT = 0;
        if (this.phase === 'pickup') {
          this.hidePlayer = true;            // now they climb into the basket
          if (this.onBoarded) this.onBoarded();
        }
        audio.sfx('wing', { gain: 0.75 });
      }
    } else {
      const k = clamp(this.stageT / 1.1, 0, 1);
      this.y = HOVER_Y - 240 * ease(k);
      // Drift off to one side as it climbs, so it doesn't just go straight up.
      this.x = this.player.x + 90 * ease(k) * (this.phase === 'pickup' ? 1 : -1);
      if (k >= 1) {
        this.done = true;
        if (this.onDone) this.onDone();
      }
    }
  }

  /** Does the player sprite get drawn this frame, or are they in the basket? */
  get playerHidden() { return this.hidePlayer; }

  draw(ctx, ox, oy) {
    const carrying = (this.phase === 'pickup' && this.stage === 'leave')
      || (this.phase === 'dropoff' && this.stage === 'descend');
    const spr = taxiBirdSprite(this.flap, carrying);
    const bx = Math.round(this.x - spr.width / 2 - ox);
    const by = Math.round(this.y - spr.height - oy);
    // Shadow on the ground, shrinking as it rises.
    const h = clamp((this.groundY - this.y) / 200, 0, 1);
    ctx.globalAlpha = 0.35 * (1 - h * 0.8);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x - ox), Math.round(this.groundY - 2 - oy),
      14 * (1 - h * 0.5), 5 * (1 - h * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.drawImage(spr, bx, by);

    if (carrying) {
      // The passenger, riding in the basket.
      const p = this.player;
      const pspr = p.sprite ? p.sprite() : null;
      if (pspr) {
        // Feet on the basket floor, which the sprite exports the offset for.
        const feet = this.y - spr.height + TAXI_SEAT_Y + 5;
        ctx.drawImage(pspr,
          Math.round(this.x - CHAR_W / 2 - ox),
          Math.round(feet - CHAR_H - oy));
      }
    }
  }
}

/**
 * Bed at the inn: the player walks to the stairs and up out of sight.
 * Purely visual — it hands control back when the walk finishes.
 */
export class StairWalk {
  constructor(player, target, onDone) {
    this.player = player;
    this.target = target;              // tile to walk to
    this.onDone = onDone;
    this.done = false;
    this.fade = 0;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    const p = this.player;
    const tx = this.target.x * TILE + TILE / 2;
    const ty = (this.target.y + 1) * TILE - 2;
    const dx = tx - p.x, dy = ty - p.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 2 && this.t < 3) {
      const step = 40 * dt;
      p.x += (dx / dist) * Math.min(step, dist);
      p.y += (dy / dist) * Math.min(step, dist);
      p.moving = true;
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      p.animate(dt);
      if (!this.stepT || this.t - this.stepT > 0.3) {
        this.stepT = this.t;
        audio.sfx('step_wood', { gain: 0.5 });
      }
      return;
    }
    // At the foot of the stairs: climb, fading out as they go up.
    p.dir = 'up';
    p.moving = true;
    p.animate(dt);
    this.fade += dt * 1.4;
    p.y -= dt * 14;
    if (this.fade >= 1) {
      this.done = true;
      if (this.onDone) this.onDone();
    }
  }

  get playerAlpha() { return clamp(1 - this.fade, 0, 1); }
  get playerHidden() { return false; }

  draw() { /* the player is drawn by the normal pass, just faded */ }
}

export { CHAR_H };
