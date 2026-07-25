// Shared UI furniture: framed panels, dialogue boxes with a typewriter, the
// HUD, toasts and floating numbers.

import { drawText, drawTextCentered, drawTextRight, textWidth, LINE_H } from '../engine/font.js';
import { VIEW_W, VIEW_H } from '../engine/display.js';
import { P } from '../art/palette.js';
import { wrapText, clamp, money } from '../engine/util.js';
import { iconSprite } from '../art/icons.js';
import { audio } from '../engine/audio.js';
import { SAFE, fitRect, safeCenterX } from '../engine/safe.js';

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

/** The standard framed box: shadow, dark fill, cream double border. */
export function panel(ctx, x, y, w, h, opts = {}) {
  const { fill = P.uiBg, edge = P.uiEdge, shadow = true } = opts;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 3, y + 4, w, h);
  }
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  // Outer light border.
  ctx.fillStyle = edge;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  // Inner shadow line for depth.
  ctx.fillStyle = opts.inner || P.uiBg2;
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
  ctx.fillRect(x + 2, y + 2, 1, h - 4);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
  ctx.fillRect(x + w - 3, y + 2, 1, h - 4);
  // Corner pips, a small nod to SNES menu chrome.
  ctx.fillStyle = edge;
  for (const [cx, cy] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]]) {
    ctx.fillRect(cx, cy, 1, 1);
  }
}

/** A title strip that sits on top of a panel. */
export function panelTitle(ctx, x, y, w, title, opts = {}) {
  const tw = textWidth(title, 1) + 14;
  const tx = Math.round(x + (opts.align === 'left' ? 8 : (w - tw) / 2));
  ctx.fillStyle = opts.bg || P.uiGoldDk;
  ctx.fillRect(tx, y - 5, tw, 12);
  ctx.fillStyle = opts.fg || P.uiGold;
  ctx.fillRect(tx, y - 5, tw, 1);
  ctx.fillRect(tx, y + 6, tw, 1);
  drawText(ctx, title, tx + 7, y - 2, { color: '#241d15', scale: 1 });
  drawText(ctx, title, tx + 7, y - 3, { color: P.uiText, scale: 1 });
}

export function bar(ctx, x, y, w, h, frac, color, bg = '#1d1830') {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * clamp(frac, 0, 1))), h - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * clamp(frac, 0, 1))), 1);
}

/** The blinking ► cursor used in every list. */
export function cursor(ctx, x, y, t) {
  const bob = Math.sin(t * 6) > 0 ? 0 : 1;
  drawText(ctx, '►', x + bob, y, { color: P.uiGold, shadow: P.uiShadow });
}

// ---------------------------------------------------------------------------
// Dialogue
// ---------------------------------------------------------------------------

const DLG_H = 74;
const CHARS_PER_LINE = 52;

export class Dialogue {
  constructor() {
    this.active = false;
    this.pages = [];
    this.page = 0;
    this.shown = 0;
    this.speed = 46;      // characters per second
    this.speaker = null;
    this.portrait = null;
    this.onDone = null;
    this.choices = null;
    this.choiceIndex = 0;
    this.blipT = 0;
  }

  /**
   * Show text. `text` may contain \n and is paged to fit.
   * opts: { speaker, portrait (canvas), choices: [{label, value}], onDone(value) }
   */
  say(text, opts = {}) {
    const lines = wrapText(text, CHARS_PER_LINE);
    this.pages = [];
    for (let i = 0; i < lines.length; i += 3) this.pages.push(lines.slice(i, i + 3));
    if (!this.pages.length) this.pages = [['...']];
    this.page = 0;
    this.shown = 0;
    this.active = true;
    this.speaker = opts.speaker || null;
    this.portrait = opts.portrait || null;
    this.onDone = opts.onDone || null;
    this.choices = opts.choices || null;
    this.choiceIndex = 0;
    this.item = opts.item || null;
  }

  get atLastPage() { return this.page >= this.pages.length - 1; }
  get pageComplete() { return this.shown >= this.pages[this.page].join('\n').length; }

  update(dt, input) {
    if (!this.active) return;
    const full = this.pages[this.page].join('\n').length;
    if (this.shown < full) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(full, this.shown + this.speed * dt);
      // A soft blip every few characters, like an old RPG.
      if (Math.floor(this.shown) > before) {
        this.blipT -= 1;
        if (this.blipT <= 0) { this.blipT = 3; audio.sfx('talk', { gain: 0.35 }); }
      }
      if (input.hit('use') || input.hit('cancel')) this.shown = full;
      return;
    }

    if (this.choices && this.atLastPage) {
      if (input.repeat('up', dt)) { this.choiceIndex = (this.choiceIndex - 1 + this.choices.length) % this.choices.length; audio.sfx('ui_move'); }
      if (input.repeat('down', dt)) { this.choiceIndex = (this.choiceIndex + 1) % this.choices.length; audio.sfx('ui_move'); }
      if (input.hit('use')) {
        audio.sfx('ui_ok');
        const choice = this.choices[this.choiceIndex];
        this.close();
        if (this.onDoneRef) this.onDoneRef(choice.value);
      }
      return;
    }

    if (input.hit('use')) {
      if (this.atLastPage) {
        audio.sfx('ui_ok', { gain: 0.5 });
        const cb = this.onDone;
        this.close();
        if (cb) cb(true);
      } else {
        this.page++;
        this.shown = 0;
      }
    }
  }

  close() {
    this.onDoneRef = this.onDone;
    this.active = false;
    this.pages = [];
    this.choices = null;
    this.onDone = null;
  }

  draw(ctx, t) {
    if (!this.active) return;
    const y = VIEW_H - DLG_H - 6;
    const { x, w } = fitRect(8, VIEW_W - 16, 200);
    panel(ctx, x, y, w, DLG_H);

    let tx = x + 10;
    if (this.portrait) {
      panel(ctx, x + 6, y + 6, 30, 34, { fill: P.uiBg2 });
      ctx.drawImage(this.portrait, x + 13, y + 9);
      tx = x + 44;
    }

    if (this.speaker) {
      const nw = textWidth(this.speaker) + 12;
      ctx.fillStyle = P.uiGoldDk;
      ctx.fillRect(tx - 4, y - 6, nw, 12);
      ctx.fillStyle = P.uiGold;
      ctx.fillRect(tx - 4, y - 6, nw, 1);
      drawText(ctx, this.speaker, tx + 2, y - 3, { color: P.uiText, shadow: '#3a2a12' });
    }

    const lines = this.pages[this.page];
    let remaining = Math.floor(this.shown);
    let ly = y + 12;
    for (const line of lines) {
      const take = Math.max(0, Math.min(line.length, remaining));
      drawText(ctx, line.slice(0, take), tx, ly, { color: P.uiText, shadow: P.uiShadow });
      remaining -= line.length + 1;
      ly += LINE_H;
      if (remaining < 0) break;
    }

    if (this.item) {
      const spr = iconSprite(this.item);
      ctx.drawImage(spr, x + w - 26, y + DLG_H - 26);
    }

    if (this.choices && this.pageComplete && this.atLastPage) {
      const ch = this.choices.length * LINE_H + 12;
      const cw = Math.max(...this.choices.map((c) => textWidth(c.label))) + 26;
      const cx = x + w - cw - 6;
      const cy = y - ch - 4;
      panel(ctx, cx, cy, cw, ch);
      this.choices.forEach((c, i) => {
        const iy = cy + 6 + i * LINE_H;
        if (i === this.choiceIndex) cursor(ctx, cx + 5, iy, t);
        drawText(ctx, c.label, cx + 16, iy, { color: i === this.choiceIndex ? P.uiGold : P.uiText, shadow: P.uiShadow });
      });
    } else if (this.pageComplete) {
      // Little bouncing "more" arrow.
      const bob = Math.sin(t * 5) > 0 ? 0 : 1;
      drawText(ctx, this.atLastPage ? '►' : '▼', x + w - 16, y + DLG_H - 14 + bob, { color: P.uiGold });
    }
  }
}

// A '▼' glyph isn't in the font; fall back to a drawn triangle.
export function drawMoreArrow(ctx, x, y, t) {
  const bob = Math.sin(t * 5) > 0 ? 0 : 1;
  ctx.fillStyle = P.uiGold;
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i, y + i + bob, 8 - i * 2, 1);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

export class Hud {
  constructor() {
    this.toasts = [];
    this.floats = [];
    this.locationT = 0;
    this.locationName = '';
    this.moneyPulse = 0;
    this.lastMoney = 0;
  }

  toast(text, tone = 'info', seconds = 4) {
    this.toasts.push({ text, tone, t: seconds, life: seconds });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  float(text, x, y, color) {
    this.floats.push({ text, x, y, color, t: 1.3 });
  }

  showLocation(name) {
    if (name === this.locationName) return;
    this.locationName = name;
    this.locationT = 3.2;
  }

  update(dt, st) {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].t -= dt;
      if (this.toasts[i].t <= 0) this.toasts.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t -= dt;
      f.y -= dt * 18;
      if (f.t <= 0) this.floats.splice(i, 1);
    }
    if (this.locationT > 0) this.locationT -= dt;
    if (st.money !== this.lastMoney) { this.moneyPulse = 0.5; this.lastMoney = st.money; }
    if (this.moneyPulse > 0) this.moneyPulse -= dt;
  }

  drawFloats(ctx, ox, oy) {
    for (const f of this.floats) {
      const a = clamp(f.t / 1.3, 0, 1);
      ctx.globalAlpha = a;
      drawTextCentered(ctx, f.text, Math.round(f.x - ox), Math.round(f.y - oy), { color: f.color, shadow: '#000000' });
      ctx.globalAlpha = 1;
    }
  }

  /** `?netdebug` — the numbers you'd want when the valley misbehaves. */
  drawNetDebug(ctx, net) {
    const age = (ms) => (ms ? `${Math.round((performance.now() - ms) / 100) / 10}s` : '-');
    const lines = [
      `link ${net.connected ? 'up' : 'DOWN'}  joined ${net.joined}  here ${net.here}`,
      `me ${net.id || '-'}  cafe run by ${net.owner === net.id ? 'me' : (net.owner || 'nobody')}`,
      `others ${net.remotes.size}  ping ${net.rttMs ? `${net.rttMs}ms` : '-'}`,
      `last pos ${age(net.lastPosAt)}  last cust ${age(net.lastCustAt)}`,
      `drops ${net.dropCount}  rejoins ${net.rejoinCount}  msgs ${net.msgCount}`,
    ];
    const w = Math.max(...lines.map((l) => textWidth(l))) + 12;
    ctx.fillStyle = 'rgba(10,8,18,0.82)';
    ctx.fillRect(4, VIEW_H - 12 - lines.length * 10, w, lines.length * 10 + 6);
    lines.forEach((l, i) => {
      drawText(ctx, l, 8, VIEW_H - 10 - (lines.length - i) * 10 + 4,
        { color: i === 0 && !net.connected ? P.uiRed : P.uiTextDim });
    });
  }

  draw(ctx, st, t) {
    // --- clock / date, top left ---
    const clock = st.clock;
    panel(ctx, 4, 4, 96, 26, { fill: 'rgba(30,25,45,0.86)' });
    drawText(ctx, clock.format(), 10, 8, { color: P.uiText, shadow: P.uiShadow });
    const dayCol = clock.isWeekend ? P.uiGold : P.uiTextDim;
    drawTextRight(ctx, clock.dayName, 96, 8, { color: dayCol, shadow: P.uiShadow });
    // A little day/night dial.
    const frac = clock.hourFloat / 24;
    bar(ctx, 10, 20, 84, 5, frac, clock.isDark ? '#5f74c4' : '#ffcf6b');

    // --- money, top right ---
    const mtxt = money(st.money);
    const w = textWidth(mtxt) + 34;
    panel(ctx, VIEW_W - w - 4, 4, w, 20, { fill: 'rgba(30,25,45,0.86)' });
    ctx.drawImage(iconSprite('coin'), VIEW_W - w + 1, 5);
    const pulse = this.moneyPulse > 0 ? P.uiGold : P.uiText;
    drawTextRight(ctx, mtxt, VIEW_W - 10, 8, { color: pulse, shadow: P.uiShadow });

    // --- cafe status strip, when it matters ---
    if (st.shopOpen) {
      const openNow = st.cafeSim.isOpen;
      const label = openNow ? 'CAFE OPEN' : 'CAFE SHUT';
      const cw = textWidth(label) + 12;
      ctx.fillStyle = openNow ? 'rgba(60,120,70,0.9)' : 'rgba(110,60,60,0.9)';
      ctx.fillRect(4, 34, cw, 12);
      ctx.fillStyle = openNow ? P.uiGreen : P.uiRed;
      ctx.fillRect(4, 34, cw, 1);
      drawText(ctx, label, 10, 36, { color: P.uiText, shadow: P.uiShadow });
    }

    // --- the link, when it isn't well ---
    // A toast fades; being cut off does not, and everything that follows from
    // it (nobody moving, the cafe going strange) is baffling without a light.
    const net = st.net;
    if (net && net.everConnected && !net.connected) {
      const label = 'OFFLINE';
      const ow = textWidth(label) + 12;
      ctx.fillStyle = 'rgba(120,50,50,0.92)';
      ctx.fillRect(VIEW_W - ow - 4, 28, ow, 12);
      drawText(ctx, label, VIEW_W - ow + 2, 30, { color: '#ffd8d8', shadow: P.uiShadow });
    }

    if (net && net.debug) this.drawNetDebug(ctx, net);

    // --- location banner ---
    if (this.locationT > 0) {
      const a = clamp(this.locationT > 2.6 ? (3.2 - this.locationT) / 0.6 : Math.min(1, this.locationT / 0.7), 0, 1);
      ctx.globalAlpha = a;
      const lw = textWidth(this.locationName, 2) + 28;
      panel(ctx, (VIEW_W - lw) / 2, 44, lw, 26, { fill: 'rgba(30,25,45,0.9)' });
      drawTextCentered(ctx, this.locationName, VIEW_W / 2, 51, { color: P.uiGold, scale: 2, shadow: P.uiShadow });
      ctx.globalAlpha = 1;
    }

    // --- toasts, bottom left ---
    let ty = VIEW_H - 22;
    const tx = 4 + SAFE.left;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const to = this.toasts[i];
      const a = clamp(to.t / 0.6, 0, 1);
      ctx.globalAlpha = a;
      const col = to.tone === 'bad' ? P.uiRed : to.tone === 'warn' ? P.uiGold : to.tone === 'good' ? P.uiGreen : P.uiText;
      const tw2 = textWidth(to.text) + 14;
      ctx.fillStyle = 'rgba(24,20,36,0.86)';
      ctx.fillRect(tx, ty - 3, tw2, 14);
      ctx.fillStyle = col;
      ctx.fillRect(tx, ty - 3, 2, 14);
      drawText(ctx, to.text, tx + 8, ty, { color: col, shadow: P.uiShadow });
      ctx.globalAlpha = 1;
      ty -= 16;
    }
  }
}

/** A soft full-screen wash, used behind menus. */
export function dim(ctx, alpha = 0.55) {
  ctx.fillStyle = `rgba(12,10,20,${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/** Fade helper for map transitions. */
export class Fader {
  constructor() { this.a = 0; this.dir = 0; this.cb = null; }
  out(cb) { this.dir = 1; this.cb = cb; }
  update(dt) {
    if (this.dir === 1) {
      this.a = Math.min(1, this.a + dt * 3.2);
      if (this.a >= 1) { this.dir = -1; if (this.cb) { this.cb(); this.cb = null; } }
    } else if (this.dir === -1) {
      this.a = Math.max(0, this.a - dt * 2.6);
      if (this.a <= 0) this.dir = 0;
    }
  }
  get busy() { return this.dir !== 0; }
  draw(ctx) {
    if (this.a <= 0) return;
    ctx.fillStyle = `rgba(8,6,14,${this.a})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

export { drawText, drawTextCentered, drawTextRight, textWidth, LINE_H };
export { SAFE, fitRect, safeCenterX };
