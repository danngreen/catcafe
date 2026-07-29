// Menu screens. Everything the player interacts with outside of walking around:
// shops, the cafe management book, the journal, the bag, the map and the
// morning summary. Screens are pushed onto a stack the game loop draws.

import { panel, panelTitle, bar, cursor, dim, drawText, drawTextCentered, drawTextRight, textWidth, LINE_H } from './core.js';
import { SAFE, fitRect } from '../engine/safe.js';
import { VIEW_W, VIEW_H } from '../engine/display.js';
import { P } from '../art/palette.js';
import { ITEMS, CAT as ICAT, baseId, variantOf, invKey } from '../game/items.js';
import { CAT_BREEDS } from '../art/chars.js';
import { TOWNS, SHOPS, VILLAGERS } from '../world/places.js';
import { iconSprite } from '../art/icons.js';
import { objSprite, VARIANT_SWATCHES, VARIANT_NAMES } from '../art/objects.js';
import { catSprite, playerCatSprite } from '../art/chars.js';
import { audio } from '../engine/audio.js';
import { clamp, money, wrapText } from '../engine/util.js';
import { QUESTS, objectiveText, progressText } from '../game/quests.js';
import { HIRE_POOL, shiftHours, fmtHour } from '../game/cafe.js';
import { shopOpen, hoursText } from '../game/time.js';
import { lookOf } from '../game/entities.js';
import { charSprite } from '../art/chars.js';

/** Above this, buying asks first. */
export const BIG_SPEND = 500;

export class Screen {
  constructor() { this.t = 0; this.done = false; }
  update() {}
  draw() {}
  close() { this.done = true; audio.sfx('ui_back'); }
}

/**
 * A yes/no in front of something you cannot take back. Defaults to No, because
 * the whole point is that the reflexive press does nothing.
 */
export class ConfirmScreen extends Screen {
  constructor(opts) {
    super();
    this.title = opts.title || 'Are you sure?';
    this.lines = opts.lines || [];
    this.yes = opts.yes || 'Yes';
    this.no = opts.no || 'No';
    this.onYes = opts.onYes || (() => {});
    this.onNo = opts.onNo || null;
    this.choice = 0;                  // 0 = No
  }

  update(dt, input) {
    this.t += dt;
    if (input.repeat('left', dt) || input.repeat('right', dt)
      || input.repeat('up', dt) || input.repeat('down', dt)) {
      this.choice = this.choice ? 0 : 1;
      audio.sfx('ui_move', { gain: 0.6 });
    }
    if (input.hit('use')) {
      this.done = true;
      if (this.choice) { audio.sfx('ui_ok'); this.onYes(); }
      else { audio.sfx('ui_back'); this.onNo?.(); }
      return;
    }
    if (input.hit('cancel') || input.hit('menu')) {
      this.done = true;
      audio.sfx('ui_back');
      this.onNo?.();
    }
  }

  draw(ctx) {
    dim(ctx, 0.7);
    const w = 250;
    const h = 54 + this.lines.length * 12;
    const x = Math.round((VIEW_W - w) / 2), y = Math.round((VIEW_H - h) / 2);
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, this.title);
    this.lines.forEach((line, i) => {
      drawTextCentered(ctx, line, x + w / 2, y + 24 + i * 12,
        { color: i === 0 ? P.uiText : P.uiTextDim, shadow: P.uiShadow });
    });
    const by = y + h - 20;
    const labels = [this.no, this.yes];
    labels.forEach((label, i) => {
      const bx = x + w / 2 + (i ? 18 : -18 - textWidth(label));
      const on = i === this.choice;
      if (on) {
        ctx.fillStyle = 'rgba(255,207,107,0.16)';
        ctx.fillRect(bx - 8, by - 4, textWidth(label) + 16, 15);
      }
      drawText(ctx, label, bx, by, { color: on ? P.uiGold : P.uiTextDim, shadow: P.uiShadow });
    });
    drawTextCentered(ctx, 'Left/Right to choose    Space to confirm', x + w / 2, y + h - 6,
      { color: P.uiTextDim, shadow: P.uiShadow });
  }
}

/** Shared list navigation: index, scrolling window, wrap-around. */
class ListScreen extends Screen {
  constructor(items, visible = 8) {
    super();
    this.items = items;
    this.index = 0;
    this.scroll = 0;
    this.visible = visible;
  }
  navigate(dt, input) {
    const n = this.items.length;
    if (!n) return;
    if (input.repeat('up', dt)) { this.index = (this.index - 1 + n) % n; audio.sfx('ui_move', { gain: 0.6 }); }
    if (input.repeat('down', dt)) { this.index = (this.index + 1) % n; audio.sfx('ui_move', { gain: 0.6 }); }
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + this.visible) this.scroll = this.index - this.visible + 1;
    this.scroll = clamp(this.scroll, 0, Math.max(0, n - this.visible));
  }
  drawScrollbar(ctx, x, y, h) {
    if (this.items.length <= this.visible) return;
    ctx.fillStyle = '#1d1830';
    ctx.fillRect(x, y, 3, h);
    const th = Math.max(8, (h * this.visible) / this.items.length);
    const ty = y + (h - th) * (this.scroll / Math.max(1, this.items.length - this.visible));
    ctx.fillStyle = P.uiGoldDk;
    ctx.fillRect(x, ty, 3, th);
  }
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export class ShopScreen extends ListScreen {
  constructor(game, shop, stockIds, opts = {}) {
    super(stockIds, 7);
    this.game = game;
    this.shop = shop;
    this.priceMult = opts.priceMult ?? 1;
    this.title = opts.title || shop.name;
    this.qtyMode = false;
    this.qty = 1;
    this.variant = 0;
    this.msg = '';
    this.msgT = 0;
  }

  price(id) { return Math.max(1, Math.round((ITEMS[id]?.cost || 0) * this.priceMult)); }

  /** The placeable type of the highlighted row, if it is furniture. */
  colours(id) {
    const place = ITEMS[id] && ITEMS[id].place;
    return place ? (VARIANT_SWATCHES[place] || null) : null;
  }

  update(dt, input) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    const st = this.game.state;

    if (this.qtyMode) {
      const id = this.items[this.index];
      const unit = this.price(id);
      const maxQ = Math.max(1, Math.min(99, Math.floor(st.money / Math.max(1, unit))));
      if (input.repeat('up', dt)) { this.qty = clamp(this.qty + 1, 1, maxQ); audio.sfx('ui_move', { gain: 0.5 }); }
      if (input.repeat('down', dt)) { this.qty = clamp(this.qty - 1, 1, maxQ); audio.sfx('ui_move', { gain: 0.5 }); }
      const cols = this.colours(id);
      if (cols) {
        if (input.repeat('right', dt)) { this.variant = (this.variant + 1) % cols.length; audio.sfx('ui_move', { gain: 0.5 }); }
        if (input.repeat('left', dt)) { this.variant = (this.variant - 1 + cols.length) % cols.length; audio.sfx('ui_move', { gain: 0.5 }); }
      } else {
        if (input.repeat('right', dt)) { this.qty = clamp(this.qty + 5, 1, maxQ); audio.sfx('ui_move', { gain: 0.5 }); }
        if (input.repeat('left', dt)) { this.qty = clamp(this.qty - 5, 1, maxQ); audio.sfx('ui_move', { gain: 0.5 }); }
      }
      if (input.hit('use')) { this.buy(id, this.qty); this.qtyMode = false; }
      if (input.hit('cancel') || input.hit('menu')) { this.qtyMode = false; audio.sfx('ui_back'); }
      return;
    }

    const before = this.index;
    this.navigate(dt, input);
    if (this.index !== before) this.variant = 0;      // each row starts on its first colour

    // Furniture that comes in colourways: browse them with left/right.
    const cols = this.colours(this.items[this.index]);
    if (cols) {
      if (input.repeat('right', dt)) { this.variant = (this.variant + 1) % cols.length; audio.sfx('ui_move', { gain: 0.5 }); }
      if (input.repeat('left', dt)) { this.variant = (this.variant - 1 + cols.length) % cols.length; audio.sfx('ui_move', { gain: 0.5 }); }
    }

    if (input.hit('use') && this.items.length) {
      const id = this.items[this.index];
      if (st.money < this.price(id)) { this.flash("You can't afford that."); audio.sfx('error'); }
      else { this.qtyMode = true; this.qty = 1; audio.sfx('ui_ok', { gain: 0.5 }); }
    }
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  flash(m) { this.msg = m; this.msgT = 2.2; }

  buy(id, qty) {
    const st = this.game.state;
    const cost = this.price(id) * qty;
    if (st.money < cost) { this.flash("You can't afford that."); audio.sfx('error'); return; }
    // Anything this size is a decision, not a keypress. A fountain is fourteen
    // hundred and the buy button is the same button as everything else.
    if (cost > BIG_SPEND) {
      this.game.push(new ConfirmScreen({
        title: 'That is a lot of money',
        lines: [`${qty} x ${ITEMS[id].name}`, `${money(cost)} — you have ${money(st.money)}`],
        yes: 'Buy it',
        no: 'Not yet',
        onYes: () => this.completeBuy(id, qty, cost),
      }));
      return;
    }
    this.completeBuy(id, qty, cost);
  }

  completeBuy(id, qty, cost) {
    const st = this.game.state;
    if (st.money < cost) { this.flash("You can't afford that."); audio.sfx('error'); return; }
    st.spend(cost);
    const cols = this.colours(id);
    st.give(cols ? invKey(id, this.variant) : id, qty);
    audio.sfx('buy', { gain: 0.8 });
    const shade = cols ? ` (${(VARIANT_NAMES[ITEMS[id].place] || [])[this.variant] || ''})` : '';
    this.flash(`Bought ${qty} x ${ITEMS[id].name}${shade}.`);
    st.onPurchase?.(id, qty);
  }

  draw(ctx) {
    dim(ctx, 0.6);
    const { x, w } = fitRect(10, VIEW_W - 20, 260);
    const y = 22, h = VIEW_H - 44;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, this.title);

    // Money and, if relevant, the stock we already hold.
    drawTextRight(ctx, `${money(this.game.state.money)}`, x + w - 10, y + 8, { color: P.uiGold, shadow: P.uiShadow });
    ctx.drawImage(iconSprite('coin'), x + w - 12 - textWidth(money(this.game.state.money)) - 18, y + 5);

    const listX = x + 8, listY = y + 24;
    const rowH = 18;
    for (let i = 0; i < Math.min(this.visible, this.items.length); i++) {
      const idx = this.scroll + i;
      const id = this.items[idx];
      const it = ITEMS[id];
      if (!it) continue;
      const ry = listY + i * rowH;
      const sel = idx === this.index;
      if (sel) {
        ctx.fillStyle = 'rgba(255,207,107,0.14)';
        ctx.fillRect(listX - 2, ry - 2, 196, rowH - 2);
        cursor(ctx, listX - 2, ry + 4, this.t);
      }
      ctx.drawImage(iconSprite(it.icon), listX + 8, ry - 1);
      drawText(ctx, it.name, listX + 28, ry + 4, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      const pr = this.price(id);
      drawTextRight(ctx, String(pr), listX + 192, ry + 4, { color: this.game.state.money >= pr ? P.uiText : P.uiRed, shadow: P.uiShadow });
    }
    this.drawScrollbar(ctx, listX + 196, listY, this.visible * rowH - 4);

    // --- detail pane ---
    const dx = x + 214, dw = w - 224;
    const id = this.items[this.index];
    if (id) {
      const it = ITEMS[id];
      panel(ctx, dx, listY - 4, dw, h - 40, { fill: P.uiBg2 });
      drawText(ctx, it.name, dx + 8, listY + 4, { color: P.uiGold, shadow: P.uiShadow });
      let ly = listY + 18;
      for (const line of wrapText(it.desc || '', Math.floor((dw - 16) / 6))) {
        drawText(ctx, line, dx + 8, ly, { color: P.uiTextDim, shadow: P.uiShadow });
        ly += LINE_H;
      }
      ly += 4;
      const st = this.game.state;
      if (it.cat === ICAT.DRINK || it.cat === ICAT.FOOD) {
        drawText(ctx, `Sells for ${it.price}   keeps ${it.shelf}d`, dx + 8, ly, { color: P.uiText, shadow: P.uiShadow }); ly += LINE_H;
        drawText(ctx, `Profit ${it.price - it.cost} each`, dx + 8, ly, { color: P.uiGreen, shadow: P.uiShadow }); ly += LINE_H;
        drawText(ctx, `In your pantry: ${st.cafeSim.stockCount(id)}`, dx + 8, ly, { color: P.uiTextDim, shadow: P.uiShadow }); ly += LINE_H;
      } else if (it.cat === ICAT.CATFOOD) {
        drawText(ctx, `Quality ${'★'.repeat(it.quality)}   ${it.portions} meals`, dx + 8, ly, { color: P.uiText, shadow: P.uiShadow }); ly += LINE_H;
        drawText(ctx, `You have: ${st.cafeSim.stockCount(id)}`, dx + 8, ly, { color: P.uiTextDim, shadow: P.uiShadow }); ly += LINE_H;
      } else if (it.cat === ICAT.FURNITURE) {
        if (it.appeal) { drawText(ctx, `Charm +${it.appeal.toFixed(1)}`, dx + 8, ly, { color: P.uiPink, shadow: P.uiShadow }); ly += LINE_H; }
        if (it.seats) { drawText(ctx, `Seats ${it.seats}`, dx + 8, ly, { color: P.uiBlue, shadow: P.uiShadow }); ly += LINE_H; }
        const cols = this.colours(id);
        // Show the actual piece, in the colour you're about to buy.
        const spr = objSprite(it.place, cols ? this.variant : 0);
        if (spr) {
          const Z = spr.width * 2 <= dw - 20 && spr.height * 2 < 56 ? 2 : 1;
          ctx.drawImage(spr, 0, 0, spr.width, spr.height,
            Math.round(dx + dw / 2 - (spr.width * Z) / 2), ly + 4, spr.width * Z, spr.height * Z);
          ly += Math.min(60, spr.height * Z) + 8;
        }
        if (cols) {
          const name = (VARIANT_NAMES[it.place] || [])[this.variant] || `Colour ${this.variant + 1}`;
          drawText(ctx, `< ${name} >`, dx + 8, ly, { color: P.uiGold, shadow: P.uiShadow });
          cols.forEach((c, i) => {
            const sx = dx + dw - 16 - (cols.length - i) * 14;
            ctx.fillStyle = c;
            ctx.fillRect(sx, ly - 1, 11, 9);
            ctx.strokeStyle = i === this.variant ? P.uiGold : P.uiEdgeDk;
            ctx.strokeRect(sx - 0.5, ly - 1.5, 12, 10);
          });
          ly += LINE_H + 2;
        }
        drawText(ctx, 'Place it from the Build menu.', dx + 8, ly, { color: P.uiTextDim, shadow: P.uiShadow }); ly += LINE_H;
      } else {
        drawText(ctx, `You have: ${st.inventory[id] || 0}`, dx + 8, ly, { color: P.uiTextDim, shadow: P.uiShadow }); ly += LINE_H;
      }
    }

    // --- quantity prompt ---
    if (this.qtyMode) {
      const qw = 150, qh = 56;
      const qx = (VIEW_W - qw) / 2, qy = (VIEW_H - qh) / 2;
      panel(ctx, qx, qy, qw, qh);
      const it = ITEMS[this.items[this.index]];
      drawTextCentered(ctx, it.name, qx + qw / 2, qy + 8, { color: P.uiGold, shadow: P.uiShadow });
      drawTextCentered(ctx, `- ${this.qty} +`, qx + qw / 2, qy + 24, { color: P.uiText, scale: 2, shadow: P.uiShadow });
      drawTextCentered(ctx, `Total ${money(this.price(this.items[this.index]) * this.qty)}`, qx + qw / 2, qy + 44, { color: P.uiGold, shadow: P.uiShadow });
    }

    if (this.msgT > 0) {
      drawTextCentered(ctx, this.msg, VIEW_W / 2, y + h - 16, { color: P.uiGold, shadow: P.uiShadow });
    } else {
      drawTextCentered(ctx, this.qtyMode ? 'Up/Down qty   Space buy   X back'
        : (this.colours(this.items[this.index]) ? 'Left/Right colour   Space to buy   X to leave' : 'Space to buy    X to leave'),
        VIEW_W / 2, y + h - 16, { color: P.uiTextDim, shadow: P.uiShadow });
    }
  }
}

// ---------------------------------------------------------------------------
// Cattery
// ---------------------------------------------------------------------------

export class CatShopScreen extends ListScreen {
  constructor(game, shop, breeds) {
    super(breeds, 6);
    this.game = game;
    this.shop = shop;
    this.msg = '';
    this.msgT = 0;
  }

  update(dt, input) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    this.navigate(dt, input);
    if (input.hit('use') && this.items.length) {
      const key = this.items[this.index];
      const b = CAT_BREEDS[key];
      const st = this.game.state;
      if (st.money < b.price) { this.msg = "Not enough."; this.msgT = 2; audio.sfx('error'); return; }
      if (st.cats.length >= st.catCapacity()) {
        this.msg = 'No room — build more space first.'; this.msgT = 2.6; audio.sfx('error'); return;
      }
      st.spend(b.price);
      const cat = st.adoptCat(key);
      cat.speak(0, { gain: 1.4 });
      this.msg = `${cat.name} the ${b.name} is coming home with you!`;
      this.msgT = 3.4;
    }
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  draw(ctx) {
    dim(ctx, 0.6);
    const { x, w } = fitRect(10, VIEW_W - 20, 260);
    const y = 22, h = VIEW_H - 44;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, this.shop.name);
    drawTextRight(ctx, money(this.game.state.money), x + w - 10, y + 8, { color: P.uiGold, shadow: P.uiShadow });

    const listX = x + 8, listY = y + 24, rowH = 22;
    for (let i = 0; i < Math.min(this.visible, this.items.length); i++) {
      const idx = this.scroll + i;
      const key = this.items[idx];
      const b = CAT_BREEDS[key];
      const ry = listY + i * rowH;
      const sel = idx === this.index;
      if (sel) {
        ctx.fillStyle = 'rgba(255,207,107,0.14)';
        ctx.fillRect(listX - 2, ry - 2, 200, rowH - 2);
        cursor(ctx, listX - 2, ry + 6, this.t);
      }
      ctx.drawImage(catSprite(key, 'right', 0, 'sit'), listX + 6, ry - 2);
      drawText(ctx, b.name, listX + 30, ry + 6, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      drawTextRight(ctx, String(b.price), listX + 196, ry + 6, { color: this.game.state.money >= b.price ? P.uiText : P.uiRed, shadow: P.uiShadow });
    }
    this.drawScrollbar(ctx, listX + 200, listY, this.visible * rowH - 4);

    const dx = x + 218, dw = w - 228;
    const key = this.items[this.index];
    if (key) {
      const b = CAT_BREEDS[key];
      panel(ctx, dx, listY - 4, dw, h - 40, { fill: P.uiBg2 });
      // A big look at the cat.
      const spr = catSprite(key, 'right', 0, 'sit');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, 0, 0, spr.width, spr.height, dx + dw / 2 - spr.width, listY + 6, spr.width * 2, spr.height * 2);
      drawTextCentered(ctx, b.name, dx + dw / 2, listY + 40, { color: P.uiGold, shadow: P.uiShadow });
      drawTextCentered(ctx, b.rare ? 'RARE BREED' : 'Common', dx + dw / 2, listY + 54, { color: b.rare ? P.uiPink : P.uiTextDim, shadow: P.uiShadow });
      drawText(ctx, 'Draw', dx + 10, listY + 72, { color: P.uiTextDim, shadow: P.uiShadow });
      bar(ctx, dx + 44, listY + 73, dw - 60, 7, b.appeal / 2.5, P.uiPink);
      const st = this.game.state;
      drawText(ctx, `Cats: ${st.cats.length} / ${st.catCapacity()}`, dx + 10, listY + 88, { color: P.uiTextDim, shadow: P.uiShadow });
      drawText(ctx, `Upkeep 4 a day, each`, dx + 10, listY + 100, { color: P.uiTextDim, shadow: P.uiShadow });
    }

    drawTextCentered(ctx, this.msgT > 0 ? this.msg : 'Space to adopt    X to leave',
      VIEW_W / 2, y + h - 16, { color: this.msgT > 0 ? P.uiGreen : P.uiTextDim, shadow: P.uiShadow });
  }
}

// ---------------------------------------------------------------------------
// Services: groomer & vet
// ---------------------------------------------------------------------------

export class ServiceScreen extends ListScreen {
  constructor(game, kind, shop) {
    super([], 7);
    this.game = game;
    this.kind = kind;             // 'groom' | 'vet'
    this.shop = shop;
    this.msg = '';
    this.msgT = 0;
    this.refresh();
  }

  refresh() {
    const st = this.game.state;
    this.items = this.kind === 'vet' ? st.cats.filter((c) => c.sick) : st.cats.slice();
    if (this.index >= this.items.length) this.index = Math.max(0, this.items.length - 1);
  }

  cost(cat) {
    if (this.kind === 'vet') return 120 + cat.sickDays * 30;
    const b = CAT_BREEDS[cat.breed];
    return Math.round(45 + (b?.appeal || 1) * 30);
  }

  update(dt, input) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    this.navigate(dt, input);
    const st = this.game.state;
    if (input.hit('use') && this.items.length) {
      const cat = this.items[this.index];
      const c = this.cost(cat);
      if (st.money < c) { this.msg = 'Not enough money.'; this.msgT = 2; audio.sfx('error'); return; }
      st.spend(c);
      if (this.kind === 'vet') {
        cat.sick = false; cat.sickDays = 0; cat.happiness = clamp(cat.happiness + 0.35, 0, 1);
        this.msg = `${cat.name} is right as rain.`;
        audio.sfx('levelup', { gain: 0.6 });
      } else {
        cat.groomed = 7;
        cat.happiness = clamp(cat.happiness + 0.15, 0, 1);
        this.msg = `${cat.name} looks magnificent.`;
        audio.sfx('brush', { gain: 0.9 });
        setTimeout(() => audio.sfx('purr', { gain: 0.5 }), 260);
      }
      st.touchCats();
      this.msgT = 3;
      this.refresh();
    }
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  draw(ctx) {
    dim(ctx, 0.6);
    const { x, w } = fitRect(30, VIEW_W - 60, 240);
    const y = 26, h = VIEW_H - 52;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, this.kind === 'vet' ? 'Surgery' : 'Grooming Parlour');
    drawTextRight(ctx, money(this.game.state.money), x + w - 10, y + 8, { color: P.uiGold, shadow: P.uiShadow });

    if (!this.items.length) {
      drawTextCentered(ctx, this.kind === 'vet' ? 'None of your cats are unwell. Good.' : 'You have no cats yet.',
        VIEW_W / 2, y + h / 2 - 8, { color: P.uiTextDim, shadow: P.uiShadow });
    }

    const listY = y + 26, rowH = 20;
    for (let i = 0; i < Math.min(this.visible, this.items.length); i++) {
      const idx = this.scroll + i;
      const cat = this.items[idx];
      const ry = listY + i * rowH;
      const sel = idx === this.index;
      if (sel) {
        ctx.fillStyle = 'rgba(255,207,107,0.14)';
        ctx.fillRect(x + 8, ry - 2, w - 20, rowH - 2);
        cursor(ctx, x + 8, ry + 5, this.t);
      }
      ctx.drawImage(catSprite(cat.breed, 'right', 0, 'sit', cat.groomed > 0), x + 18, ry - 4);
      drawText(ctx, cat.name, x + 44, ry + 5, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      drawText(ctx, cat.breedName, x + 118, ry + 5, { color: P.uiTextDim, shadow: P.uiShadow });
      if (this.kind === 'groom') {
        drawText(ctx, cat.groomed > 0 ? `groomed ${cat.groomed}d` : 'scruffy',
          x + 220, ry + 5, { color: cat.groomed > 0 ? P.uiGreen : P.uiTextDim, shadow: P.uiShadow });
      } else {
        drawText(ctx, `ill ${cat.sickDays}d`, x + 220, ry + 5, { color: P.uiRed, shadow: P.uiShadow });
      }
      drawTextRight(ctx, String(this.cost(cat)), x + w - 14, ry + 5, { color: P.uiGold, shadow: P.uiShadow });
    }

    drawTextCentered(ctx, this.msgT > 0 ? this.msg : 'Space to book in    X to leave',
      VIEW_W / 2, y + h - 16, { color: this.msgT > 0 ? P.uiGreen : P.uiTextDim, shadow: P.uiShadow });
  }
}

// ---------------------------------------------------------------------------
// Builder's yard
// ---------------------------------------------------------------------------

export class BuilderScreen extends ListScreen {
  constructor(game) {
    super([], 6);
    this.game = game;
    this.msg = '';
    this.msgT = 0;
    this.refresh();
  }

  refresh() {
    const st = this.game.state;
    this.items = [
      { kind: 'worker', label: `Hire a builder  (crew: ${st.workers})`, cost: 180 + st.workers * 140,
        note: 'Each builder lets you add more floor space.' },
      { kind: 'build', label: 'Start building', cost: 0,
        note: st.workers < 1 ? 'Hire a crew first if you want to lay out new rooms.'
          : 'Lay out new rooms and arrange your furniture.' },
      { kind: 'materials', label: 'Buy timber & tile', cost: 120,
        note: 'Materials for one more room. You need these before you can build.' },
    ];
  }

  update(dt, input) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    this.navigate(dt, input);
    const st = this.game.state;
    if (input.hit('use')) {
      const it = this.items[this.index];
      if (it.kind === 'worker') {
        if (st.money < it.cost) { this.flash("You can't afford a crew that size."); return; }
        st.spend(it.cost);
        st.workers++;
        st.touch('workers');
        audio.sfx('hammer', { gain: 0.9 });
        this.flash(`Hired. You have ${st.workers} builder${st.workers > 1 ? 's' : ''}.`);
        this.refresh();
      } else if (it.kind === 'materials') {
        if (st.money < it.cost) { this.flash("Not enough."); return; }
        st.spend(it.cost);
        st.materials++;
        st.touch('materials');
        audio.sfx('saw', { gain: 0.8 });
        this.flash(`Materials delivered. You have ${st.materials} lot${st.materials > 1 ? 's' : ''}.`);
      } else {
        this.done = true;
        this.game.openBuildMode();
        return;
      }
    }
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  flash(m) { this.msg = m; this.msgT = 2.6; audio.sfx(m.startsWith('Hired') || m.startsWith('Materials') ? 'ui_ok' : 'error'); }

  draw(ctx) {
    dim(ctx, 0.6);
    const { x, w } = fitRect(36, VIEW_W - 72, 240);
    const y = 34, h = VIEW_H - 68;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, "Trowel & Sons");
    drawTextRight(ctx, money(this.game.state.money), x + w - 10, y + 8, { color: P.uiGold, shadow: P.uiShadow });

    const st = this.game.state;
    drawText(ctx, `Crew: ${st.workers}    Materials: ${st.materials}    Rooms: ${st.cafe.rooms.length}`,
      x + 10, y + 24, { color: P.uiTextDim, shadow: P.uiShadow });
    drawText(ctx, `Floor allowance: ${st.maxFloorArea()} tiles (using ${st.usedFloorArea()})`,
      x + 10, y + 36, { color: P.uiBlue, shadow: P.uiShadow });

    const listY = y + 54;
    this.items.forEach((it, i) => {
      const ry = listY + i * 22;
      const sel = i === this.index;
      if (sel) {
        ctx.fillStyle = 'rgba(255,207,107,0.14)';
        ctx.fillRect(x + 8, ry - 3, w - 16, 20);
        cursor(ctx, x + 8, ry + 3, this.t);
      }
      drawText(ctx, it.label, x + 22, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      if (it.cost) drawTextRight(ctx, String(it.cost), x + w - 14, ry + 3, { color: st.money >= it.cost ? P.uiText : P.uiRed, shadow: P.uiShadow });
      if (sel) drawText(ctx, it.note, x + 22, ry + 13, { color: P.uiTextDim, shadow: P.uiShadow });
    });

    drawTextCentered(ctx, this.msgT > 0 ? this.msg : 'Space to choose    X to leave',
      VIEW_W / 2, y + h - 16, { color: this.msgT > 0 ? P.uiGold : P.uiTextDim, shadow: P.uiShadow });
  }
}

// ---------------------------------------------------------------------------
// The cafe book — the main management screen
// ---------------------------------------------------------------------------

const TABS = ['Cafe', 'Pantry', 'Cats', 'Staff', 'Hours'];

export class CafeScreen extends Screen {
  constructor(game) {
    super();
    this.game = game;
    this.tab = 0;
    this.index = 0;
    this.scroll = 0;
    this.tabRects = [];
    this.msg = '';
    this.msgT = 0;
  }

  update(dt, input) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    const st = this.game.state;

    if (input.hit('shift')) { this.tab = (this.tab + 1) % TABS.length; this.index = 0; this.scroll = 0; audio.sfx('ui_move'); }
    for (const r of this.tabRects || []) {
      if (input.tapIn(r.x, r.y, r.w, r.h) && r.tab !== this.tab) {
        this.tab = r.tab; this.index = 0; this.scroll = 0; audio.sfx('ui_move');
        break;
      }
    }
    // Some rows use left and right for themselves — the hours, and the wage.
    // Everywhere else they page between tabs.
    if (!this.ownsLeftRight()) {
      const step = input.repeat('left', dt) ? -1 : input.repeat('right', dt) ? 1 : 0;
      if (step) {
        this.tab = (this.tab + step + TABS.length) % TABS.length;
        this.index = 0;
        this.scroll = 0;
        audio.sfx('ui_move');
        // Arriving somewhere is not also an instruction to change what is
        // there. Without this the same press lands twice: once to page onto
        // the Hours tab, and again to move your opening time an hour.
        return;
      }
    }

    const list = this.currentList();
    if (list.length) {
      if (input.repeat('up', dt)) { this.index = (this.index - 1 + list.length) % list.length; audio.sfx('ui_move', { gain: 0.5 }); }
      if (input.repeat('down', dt)) { this.index = (this.index + 1) % list.length; audio.sfx('ui_move', { gain: 0.5 }); }
      const vis = 7;
      if (this.index < this.scroll) this.scroll = this.index;
      if (this.index >= this.scroll + vis) this.scroll = this.index - vis + 1;
    }

    if (this.tab === 3 && st.employee && this.currentList()[this.index]?.kind === 'wage') {
      // Wages go up and down by the hour, which is what they are now paid in.
      // They used to step by ten with a floor of ten, sized for a daily rate —
      // against an hourly one that made cutting a nine an hour into a rise.
      const d = input.repeat('right', dt) ? 1 : input.repeat('left', dt) ? -1 : 0;
      if (d) {
        st.employee.wage = clamp(st.employee.wage + d, 1, 999);
        st.touch('employee');
        audio.sfx(d > 0 ? 'ui_ok' : 'ui_back', { gain: 0.5 });
        this.flash(`Wage ${d > 0 ? 'raised' : 'cut'} to ${st.employee.wage} an hour.`);
      }
    }

    if (this.tab === 4) {
      // Hours: left/right adjusts the selected end of the day.
      const which = this.index % 2;
      if (input.repeat('left', dt)) {
        st.shopHours[which] = clamp(st.shopHours[which] - 1, which === 0 ? 0 : st.shopHours[0] + 1, which === 0 ? st.shopHours[1] - 1 : 24);
        st.touch('shopHours');
        audio.sfx('ui_move', { gain: 0.5 });
      }
      if (input.repeat('right', dt)) {
        st.shopHours[which] = clamp(st.shopHours[which] + 1, which === 0 ? 0 : st.shopHours[0] + 1, which === 0 ? st.shopHours[1] - 1 : 24);
        st.touch('shopHours');
        audio.sfx('ui_move', { gain: 0.5 });
      }
      if (input.hit('use')) {
        st.shopOpen = !st.shopOpen;
        st.touch('shopOpen');
        audio.sfx(st.shopOpen ? 'ui_ok' : 'ui_back');
        this.flash(st.shopOpen ? 'Sign turned to OPEN.' : 'Sign turned to CLOSED.');
      }
    } else if (this.tab === 0 && input.hit('use')) {
      // The cafe page is where people look for "change my cafe", so this is the
      // primary way into build mode — no trek to the builder's yard required
      // just to put down a chair you already own.
      this.done = true;
      this.game.openBuildMode();
      return;
    } else if (this.tab === 3 && input.hit('use')) {
      this.staffAction();
    } else if (this.tab === 2 && input.hit('use')) {
      const cat = st.cats[this.index];
      if (cat) {
        const act = this.catAction(cat);
        // Supplies live in the bag, not the pantry — this used to look in the
        // wrong place, so treats silently did nothing.
        if (act === 'medicine' && st.take('medicine')) {
          cat.sick = false; cat.sickDays = 0;
          cat.happiness = clamp(cat.happiness + 0.25, 0, 1);
          audio.sfx('levelup', { gain: 0.6 });
          this.flash(`${cat.name} is on the mend.`);
        } else if (act === 'brush') {
          cat.groomed = Math.max(cat.groomed, 3);
          cat.happiness = clamp(cat.happiness + 0.08, 0, 1);
          audio.sfx('brush', { gain: 0.8 });
          this.flash(`You brush ${cat.name}. Not a professional job, but nice.`);
        } else if (act === 'treat' && st.take('treats')) {
          cat.happiness = clamp(cat.happiness + 0.2, 0, 1);
          audio.sfx('eat', { gain: 0.8 });
          this.flash(`${cat.name} accepts the treat as their due.`);
        } else {
          cat.speak(0, { gain: 1.25 });
          this.flash(`${cat.name} looks at you expectantly. Buy treats at the pet shop.`);
        }
        st.touchCats();
      }
    }

    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  staffAction() {
    const st = this.game.state;
    if (st.employee) {
      const list = this.currentList();
      const row = list[this.index];
      if (row?.kind === 'wage') { this.flash('Left and right to change the wage.'); audio.sfx('ui_move', { gain: 0.4 }); }
      else if (row?.kind === 'duty') { st.employee.onDuty = !st.employee.onDuty; this.flash(st.employee.onDuty ? 'On the rota.' : 'Off the rota — no hours, no wages.'); audio.sfx('ui_ok'); }
      else if (row?.kind === 'fire') { this.flash(`${st.employee.name} packs up and goes.`); st.employee = null; audio.sfx('ui_back'); }
      st.touch('employee');
    } else {
      const cand = HIRE_POOL[this.index];
      if (!cand) return;
      if (st.reputation < 0.2) { this.flash('Nobody will work somewhere this quiet yet.'); audio.sfx('error'); return; }
      st.employee = { name: cand.name, id: cand.id, wage: cand.fairWage, fairWage: cand.fairWage, quality: 0.6, onDuty: true, hourly: true };
      st.touch('employee');
      this.flash(`${cand.name} starts tomorrow, at ${cand.fairWage} an hour.`);
      audio.sfx('levelup', { gain: 0.6 });
    }
  }

  flash(m) { this.msg = m; this.msgT = 3; }

  /** What Space will do to this cat, given what's in the bag. */
  catAction(cat) {
    const st = this.game.state;
    if (cat.sick && st.has('medicine') && cat.sickDays <= 2) return 'medicine';
    if (st.has('brush') && cat.groomed <= 0) return 'brush';
    if (st.has('treats')) return 'treat';
    return 'none';
  }

  /** Does the row under the cursor want left and right for itself? */
  ownsLeftRight() {
    if (this.tab === 4) return true;
    if (this.tab !== 3 || !this.game.state.employee) return false;
    return this.currentList()[this.index]?.kind === 'wage';
  }

  currentList() {
    const st = this.game.state;
    switch (this.tab) {
      case 1: return Object.keys(st.stock).filter((id) => st.cafeSim.stockCount(id) > 0);
      case 2: return st.cats;
      case 3: return st.employee
        ? [{ kind: 'duty' }, { kind: 'wage' }, { kind: 'fire' }]
        : HIRE_POOL;
      case 4: return [0, 1];
      default: return [];
    }
  }

  draw(ctx) {
    dim(ctx, 0.62);
    const { x, w } = fitRect(8, VIEW_W - 16, 300);
    const y = 20, h = VIEW_H - 40;
    panel(ctx, x, y, w, h);

    // Tabs.
    let tx = x + 8;
    this.tabRects = [];
    TABS.forEach((name, i) => {
      const tw = textWidth(name) + 14;
      const sel = i === this.tab;
      ctx.fillStyle = sel ? P.uiGoldDk : '#241f38';
      ctx.fillRect(tx, y - 6, tw, 14);
      if (sel) { ctx.fillStyle = P.uiGold; ctx.fillRect(tx, y - 6, tw, 1); }
      drawText(ctx, name, tx + 7, y - 3, { color: sel ? P.uiText : P.uiTextDim, shadow: P.uiShadow });
      this.tabRects.push({ x: tx, y: y - 8, w: tw, h: 18, tab: i });
      tx += tw + 3;
    });
    drawTextRight(ctx, money(this.game.state.money), x + w - 10, y + 8, { color: P.uiGold, shadow: P.uiShadow });

    switch (this.tab) {
      case 0: this.drawOverview(ctx, x, y, w, h); break;
      case 1: this.drawPantry(ctx, x, y, w, h); break;
      case 2: this.drawCats(ctx, x, y, w, h); break;
      case 3: this.drawStaff(ctx, x, y, w, h); break;
      case 4: this.drawHours(ctx, x, y, w, h); break;
      default: break;
    }

    drawTextCentered(ctx, this.msgT > 0 ? this.msg : 'Left/Right tabs    X to close',
      VIEW_W / 2, y + h - 14, { color: this.msgT > 0 ? P.uiGold : P.uiTextDim, shadow: P.uiShadow });
  }

  drawOverview(ctx, x, y, w, h) {
    const st = this.game.state;
    const sim = st.cafeSim;
    let ly = y + 24;
    drawText(ctx, st.cafe.name, x + 12, ly, { color: P.uiGold, scale: 2, shadow: P.uiShadow });
    ly += 22;
    const status = sim.isOpen ? 'Open for business' : (sim.closedReason() || 'Closed');
    drawText(ctx, status, x + 12, ly, { color: sim.isOpen ? P.uiGreen : P.uiRed, shadow: P.uiShadow });
    ly += 16;

    const stats = [
      ['Charm', sim.charm(), 12, P.uiPink],
      ['Reputation', st.reputation * 10, 10, P.uiGold],
      ['Seats', sim.seats().length, 24, P.uiBlue],
      ['Cats', st.cats.length, 12, P.uiGreen],
    ];
    for (const [label, val, max, col] of stats) {
      drawText(ctx, label, x + 12, ly, { color: P.uiTextDim, shadow: P.uiShadow });
      bar(ctx, x + 80, ly + 1, 120, 7, val / max, col);
      drawText(ctx, typeof val === 'number' && val % 1 !== 0 ? val.toFixed(1) : String(val), x + 208, ly, { color: P.uiText, shadow: P.uiShadow });
      ly += 14;
    }

    ly += 6;
    drawText(ctx, `Today: ${sim.todayCustomers} customers, ${money(sim.todayRevenue)} earned`, x + 12, ly, { color: P.uiText, shadow: P.uiShadow });
    ly += 12;
    drawText(ctx, `Best day so far: ${money(st.bestDayProfit)} profit`, x + 12, ly, { color: P.uiTextDim, shadow: P.uiShadow });
    ly += 12;
    const menu = sim.availableMenu();
    drawText(ctx, `On the menu: ${menu.length ? menu.slice(0, 4).map((id) => ITEMS[id].name).join(', ') + (menu.length > 4 ? '...' : '') : 'nothing at all'}`,
      x + 12, ly, { color: menu.length ? P.uiTextDim : P.uiRed, shadow: P.uiShadow });
    ly += 18;

    // The way into build mode.
    const waiting = Object.keys(st.inventory).filter((k) => ITEMS[baseId(k)]?.place && st.inventory[k] > 0)
      .reduce((n, k) => n + st.inventory[k], 0);
    const bw = 208;
    ctx.fillStyle = 'rgba(255,207,107,0.16)';
    ctx.fillRect(x + 10, ly - 3, bw, 16);
    ctx.fillStyle = P.uiGold;
    ctx.fillRect(x + 10, ly - 3, 2, 16);
    cursor(ctx, x + 12, ly + 1, this.t);
    drawText(ctx, 'Space: arrange & build', x + 26, ly + 1, { color: P.uiGold, shadow: P.uiShadow });
    if (waiting) {
      drawText(ctx, `${waiting} piece${waiting > 1 ? 's' : ''} of furniture waiting in your bag`,
        x + 12, ly + 17, { color: P.uiGreen, shadow: P.uiShadow });
    }

    // A hint panel that nudges you toward whatever is currently weakest.
    const advice = this.advice();
    if (advice) {
      panel(ctx, x + w - 176, y + 30, 166, 84, { fill: P.uiBg2 });
      drawText(ctx, 'Something to try', x + w - 168, y + 38, { color: P.uiGold, shadow: P.uiShadow });
      let ay = y + 52;
      for (const line of wrapText(advice, 26)) {
        drawText(ctx, line, x + w - 168, ay, { color: P.uiTextDim, shadow: P.uiShadow });
        ay += LINE_H;
      }
    }
  }

  advice() {
    const st = this.game.state;
    const sim = st.cafeSim;
    const unplaced = Object.keys(st.inventory).some((k) => ITEMS[baseId(k)]?.place && st.inventory[k] > 0);
    if (unplaced) return 'You have furniture in your bag. Press Space here to arrange it.';
    if (!sim.availableMenu().length) return 'Your menu board is empty. Buy coffee or cake from a shop.';
    if (sim.seats().length < 3) return 'Only a seat or two. More chairs means more customers at once — buy them at Velvet & Oak in Thistlewick.';
    if (!st.cats.length) return 'A cat cafe with no cats is just a cafe. Whisker & Paw is down the lane.';
    if (sim.freeSeats().length === 0) {
      return st.workers < 1
        ? 'You are turning people away. To add a room you need builders: Trowel & Sons, up in Hollowdown.'
        : 'You are turning people away. Press Space here to build another room, then fill it with tables.';
    }
    if (st.cats.some((c) => c.sick)) return 'A cat is unwell. The vet is in Saltmere, and it spreads.';
    if (sim.furnitureAppeal() < 6) return 'The room is a bit bare. Plants, a rug, a painting — people stay longer. Velvet & Oak, in Thistlewick.';
    if (!st.employee && st.money > 900) return 'You could hire someone. Then the cafe earns while you explore.';
    if (st.cats.every((c) => c.groomed <= 0) && st.cats.length) return 'None of your cats have been groomed lately. Fluff & Tumble, up in Hollowdown.';
    return 'Try a fancier menu item — the margin on cake is better than coffee.';
  }

  drawPantry(ctx, x, y, w, h) {
    const st = this.game.state;
    const list = this.currentList();
    if (!list.length) {
      drawTextCentered(ctx, 'The pantry is empty.', VIEW_W / 2, y + h / 2 - 10, { color: P.uiTextDim, shadow: P.uiShadow });
      drawTextCentered(ctx, 'Buy stock from the grocer or the bakery.', VIEW_W / 2, y + h / 2 + 4, { color: P.uiTextDim, shadow: P.uiShadow });
      return;
    }
    const listY = y + 26;
    for (let i = 0; i < Math.min(7, list.length); i++) {
      const idx = this.scroll + i;
      const id = list[idx];
      if (!id) continue;
      const it = ITEMS[id];
      const ry = listY + i * 18;
      const sel = idx === this.index;
      if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 8, ry - 2, w - 20, 17); }
      ctx.drawImage(iconSprite(it.icon), x + 12, ry - 2);
      drawText(ctx, it.name, x + 32, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      drawText(ctx, `x${st.cafeSim.stockCount(id)}`, x + 168, ry + 3, { color: P.uiText, shadow: P.uiShadow });
      // Freshness: how close the oldest batch is to spoiling.
      const batches = st.stock[id] || [];
      const oldest = batches.reduce((m, b) => Math.min(m, b.day), st.clock.day);
      const left = (it.shelf || 99) - (st.clock.day - oldest);
      const col = left <= 1 ? P.uiRed : left <= 3 ? P.uiGold : P.uiGreen;
      drawText(ctx, it.shelf ? `${Math.max(0, left)}d` : '-', x + 210, ry + 3, { color: col, shadow: P.uiShadow });
      if (it.price) drawTextRight(ctx, `sells ${it.price}`, x + w - 14, ry + 3, { color: P.uiTextDim, shadow: P.uiShadow });
    }
    drawText(ctx, 'Name                      qty   fresh        price', x + 12, y + 16, { color: P.uiTextDim, shadow: P.uiShadow });
  }

  drawCats(ctx, x, y, w, h) {
    const st = this.game.state;
    if (!st.cats.length) {
      drawTextCentered(ctx, 'No cats yet.', VIEW_W / 2, y + h / 2 - 6, { color: P.uiTextDim, shadow: P.uiShadow });
      return;
    }
    const listY = y + 26;
    for (let i = 0; i < Math.min(7, st.cats.length); i++) {
      const idx = this.scroll + i;
      const cat = st.cats[idx];
      if (!cat) continue;
      const ry = listY + i * 22;
      const sel = idx === this.index;
      if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 8, ry - 4, w - 20, 21); }
      ctx.drawImage(catSprite(cat.breed, 'right', 0, cat.sick ? 'loaf' : 'sit', cat.groomed > 0), x + 12, ry - 5);
      drawText(ctx, cat.name, x + 38, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      drawText(ctx, cat.breedName, x + 104, ry + 3, { color: P.uiTextDim, shadow: P.uiShadow });
      if (cat.sick) drawText(ctx, 'UNWELL', x + 200, ry + 3, { color: P.uiRed, shadow: P.uiShadow });
      else if (cat.groomed > 0) drawText(ctx, `groomed ${cat.groomed}d`, x + 200, ry + 3, { color: P.uiGreen, shadow: P.uiShadow });
      drawText(ctx, 'coat', x + 282, ry + 3, { color: P.uiTextDim, shadow: P.uiShadow });
      bar(ctx, x + 308, ry + 4, 50, 6, cat.coatQuality / 1.5, P.uiPink);
      drawText(ctx, 'joy', x + 366, ry + 3, { color: P.uiTextDim, shadow: P.uiShadow });
      bar(ctx, x + 386, ry + 4, 50, 6, cat.happiness, P.uiGreen);
    }
    // Say exactly what Space will do to the selected cat, and with what.
    const sel = st.cats[this.index];
    const labels = {
      medicine: () => `Space: give ${sel.name} medicine (${st.inventory.medicine} left)`,
      brush: () => `Space: brush ${sel.name} (you have a brush)`,
      treat: () => `Space: give ${sel.name} a treat (${st.inventory.treats} left)`,
      none: () => 'Nothing to give — treats at the pet shop, medicine at the herbalist',
    };
    const act = sel ? this.catAction(sel) : 'none';
    drawText(ctx, sel ? labels[act]() : '', x + 12, y + 16,
      { color: act === 'none' ? P.uiTextDim : P.uiGold, shadow: P.uiShadow });
  }

  drawStaff(ctx, x, y, w, h) {
    const st = this.game.state;
    const listY = y + 34;
    if (st.employee) {
      const e = st.employee;
      drawText(ctx, `${e.name} — your one and only employee`, x + 12, y + 20, { color: P.uiGold, shadow: P.uiShadow });
      const hrs = shiftHours(st.shopHours);
      const day = Math.round(hrs * e.wage);
      const rows = [
        [`On the rota: ${e.onDuty ? 'yes' : 'no'}`,
          `They work your posted hours — ${fmtHour(st.shopHours[0])} to ${fmtHour(st.shopHours[1])}.`],
        [`Wage: < ${e.wage}/hour >`,
          `A fair rate here is about ${e.fairWage} an hour. Under it and service suffers.`],
        ['Let them go', 'No hard feelings.'],
      ];
      rows.forEach(([label, note], i) => {
        const ry = listY + i * 22;
        const sel = i === this.index;
        if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 8, ry - 3, w - 20, 20); cursor(ctx, x + 8, ry + 3, this.t); }
        drawText(ctx, label, x + 22, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
        if (sel) drawText(ctx, note, x + 22, ry + 13, { color: P.uiTextDim, shadow: P.uiShadow });
      });
      // The figure that actually leaves the till, since the wage is per hour
      // and the hours are set on a different screen.
      drawText(ctx, e.onDuty ? `${hrs}h a day — ${day} in wages` : 'Not on the rota — no wages',
        x + 12, y + 30, { color: P.uiTextDim, shadow: P.uiShadow });
      drawText(ctx, 'Service quality', x + w - 180, y + 20, { color: P.uiTextDim, shadow: P.uiShadow });
      bar(ctx, x + w - 180, y + 32, 160, 8, e.quality, e.quality > 0.6 ? P.uiGreen : e.quality > 0.35 ? P.uiGold : P.uiRed);
    } else {
      drawText(ctx, 'Looking for help', x + 12, y + 20, { color: P.uiGold, shadow: P.uiShadow });
      HIRE_POOL.forEach((c, i) => {
        const ry = listY + i * 22;
        const sel = i === this.index;
        if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 8, ry - 3, w - 20, 20); cursor(ctx, x + 8, ry + 3, this.t); }
        drawText(ctx, c.name, x + 22, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
        drawText(ctx, `${c.fairWage}/hour`, x + 90, ry + 3, { color: P.uiTextDim, shadow: P.uiShadow });
        if (sel) drawText(ctx, c.blurb, x + 22, ry + 13, { color: P.uiTextDim, shadow: P.uiShadow });
      });
      if (st.reputation < 0.2) {
        drawText(ctx, 'Build up a reputation first — nobody wants to work somewhere empty.',
          x + 12, y + h - 30, { color: P.uiRed, shadow: P.uiShadow });
      }
    }
  }

  drawHours(ctx, x, y, w, h) {
    const st = this.game.state;
    drawTextCentered(ctx, st.shopOpen ? 'OPEN' : 'CLOSED', VIEW_W / 2, y + 30,
      { color: st.shopOpen ? P.uiGreen : P.uiRed, scale: 3, shadow: P.uiShadow });
    drawTextCentered(ctx, 'Space to flip the sign', VIEW_W / 2, y + 58, { color: P.uiTextDim, shadow: P.uiShadow });

    const labels = ['Opens at', 'Closes at'];
    for (let i = 0; i < 2; i++) {
      const ry = y + 84 + i * 24;
      const sel = this.index % 2 === i;
      if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 60, ry - 4, w - 120, 22); }
      drawText(ctx, labels[i], x + 78, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      const hv = st.shopHours[i];
      const hh = hv % 12 === 0 ? 12 : hv % 12;
      drawTextCentered(ctx, `< ${hh}${hv < 12 || hv === 24 ? 'am' : 'pm'} >`, VIEW_W / 2 + 60, ry + 3,
        { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
    }
    drawTextCentered(ctx, 'While you are out, only an employee can keep it open.',
      VIEW_W / 2, y + h - 34, { color: P.uiTextDim, shadow: P.uiShadow });
  }
}

// ---------------------------------------------------------------------------
// Journal, bag, map
// ---------------------------------------------------------------------------

export class JournalScreen extends ListScreen {
  constructor(game) {
    const st = game.state;
    const active = QUESTS.filter((q) => st.quests[q.id] === 'active');
    const done = QUESTS.filter((q) => st.quests[q.id] === 'done');
    super([...active, ...done], 7);
    this.game = game;
    this.activeCount = active.length;
  }

  update(dt, input) {
    this.t += dt;
    this.navigate(dt, input);
    if (input.hit('cancel') || input.hit('menu') || input.hit('use')) this.close();
  }

  draw(ctx) {
    dim(ctx, 0.62);
    const { x, w } = fitRect(16, VIEW_W - 32, 280);
    const y = 22, h = VIEW_H - 44;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Journal');

    if (!this.items.length) {
      drawTextCentered(ctx, 'Nothing on the go just now.', VIEW_W / 2, y + h / 2 - 10, { color: P.uiTextDim, shadow: P.uiShadow });
      drawTextCentered(ctx, 'Talk to people. Somebody always wants something.', VIEW_W / 2, y + h / 2 + 4, { color: P.uiTextDim, shadow: P.uiShadow });
    }

    const listY = y + 26;
    for (let i = 0; i < Math.min(this.visible, this.items.length); i++) {
      const idx = this.scroll + i;
      const q = this.items[idx];
      const ry = listY + i * 16;
      const sel = idx === this.index;
      const doneQ = idx >= this.activeCount;
      if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 8, ry - 2, 200, 15); cursor(ctx, x + 8, ry + 2, this.t); }
      drawText(ctx, q.title, x + 22, ry + 2, { color: doneQ ? P.uiTextDim : (sel ? P.uiGold : P.uiText), shadow: P.uiShadow });
      if (doneQ) drawText(ctx, '★', x + 200, ry + 2, { color: P.uiGold });
    }
    this.drawScrollbar(ctx, x + 212, listY, this.visible * 16);

    const q = this.items[this.index];
    if (q) {
      const dx = x + 226, dw = w - 238;
      panel(ctx, dx, listY - 4, dw, h - 42, { fill: P.uiBg2 });
      drawText(ctx, q.title, dx + 8, listY + 4, { color: P.uiGold, shadow: P.uiShadow });
      let ly = listY + 20;
      for (const line of wrapText(q.desc, Math.floor((dw - 16) / 6))) {
        drawText(ctx, line, dx + 8, ly, { color: P.uiText, shadow: P.uiShadow });
        ly += LINE_H;
      }
      ly += 6;
      const st = this.game.state;
      if (st.quests[q.id] === 'done') {
        drawText(ctx, 'Finished.', dx + 8, ly, { color: P.uiGreen, shadow: P.uiShadow });
      } else {
        // Wrapped, not clipped: a step of a longer job says where to go and
        // when, which is a sentence rather than "Clear the way".
        const cols = Math.floor((dw - 16) / 6);
        for (const line of wrapText(objectiveText(q, st), cols)) {
          drawText(ctx, line, dx + 8, ly, { color: P.uiBlue, shadow: P.uiShadow });
          ly += LINE_H;
        }
        ly += 4;
        // The giver's own nudge for the step in play, not the whole job's.
        for (const line of wrapText(progressText(q, st), cols)) {
          drawText(ctx, line, dx + 8, ly, { color: P.uiTextDim, shadow: P.uiShadow });
          ly += LINE_H;
        }
        ly += 4;
        drawText(ctx, `Asked by ${st.villagerName(q.giver)}`, dx + 8, ly, { color: P.uiTextDim, shadow: P.uiShadow });
      }
    }
    drawTextCentered(ctx, 'X to close', VIEW_W / 2, y + h - 14, { color: P.uiTextDim, shadow: P.uiShadow });
  }
}

export class BagScreen extends ListScreen {
  constructor(game) {
    const st = game.state;
    super(Object.keys(st.inventory).filter((k) => st.inventory[k] > 0), 8);
    this.game = game;
  }
  update(dt, input) {
    this.t += dt;
    this.navigate(dt, input);
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }
  draw(ctx) {
    dim(ctx, 0.62);
    const { x, w } = fitRect(40, VIEW_W - 80, 240);
    const y = 26, h = VIEW_H - 52;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Bag');
    if (!this.items.length) {
      drawTextCentered(ctx, 'Empty. You are travelling light.', VIEW_W / 2, y + h / 2 - 6, { color: P.uiTextDim, shadow: P.uiShadow });
    }
    const listY = y + 26;
    for (let i = 0; i < Math.min(this.visible, this.items.length); i++) {
      const idx = this.scroll + i;
      const id = this.items[idx];
      const base = baseId(id);
      const it = ITEMS[base] || { name: id, icon: 'bag', desc: '' };
      const shade = it.place && VARIANT_NAMES[it.place] ? (VARIANT_NAMES[it.place][variantOf(id)] || '') : '';
      const ry = listY + i * 18;
      const sel = idx === this.index;
      if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 8, ry - 2, w - 20, 17); }
      ctx.drawImage(iconSprite(it.icon), x + 14, ry - 2);
      drawText(ctx, shade ? `${it.name} (${shade})` : it.name, x + 34, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      drawText(ctx, `x${this.game.state.inventory[id]}`, x + 190, ry + 3, { color: P.uiText, shadow: P.uiShadow });
    }
    const id = this.items[this.index];
    if (id) {
      const it = ITEMS[baseId(id)];
      let ly = y + h - 44;
      for (const line of wrapText(it?.desc || '', 70)) {
        drawText(ctx, line, x + 12, ly, { color: P.uiTextDim, shadow: P.uiShadow });
        ly += LINE_H;
      }
    }
    drawTextCentered(ctx, 'X to close', VIEW_W / 2, y + h - 14, { color: P.uiTextDim, shadow: P.uiShadow });
  }
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

export class MapScreen extends Screen {
  constructor(game, opts = {}) {
    super();
    this.game = game;
    this.pickMode = opts.pick || false;   // taxi destination picker
    this.onPick = opts.onPick || null;
    this.index = 0;
    this.rows = this.buildRows();
    this.places = this.rows.filter((r) => r.place).map((r) => r.place);
  }

  /**
   * Group the list by settlement: each town is a heading, and the shops you've
   * been into inside it are listed underneath. Landmarks out in the country
   * gather under their own heading at the end.
   */
  buildRows() {
    const known = this.game.state.knownPlaces();
    const byId = new Map(known.map((p) => [p.id, p]));
    const rows = [];
    const used = new Set();
    for (const t of TOWNS) {
      const townPlace = byId.get(t.id);
      const shops = known.filter((p) => p.town === t.id && p.id !== t.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!townPlace && !shops.length) continue;
      if (townPlace) { rows.push({ place: townPlace, depth: 0, town: true }); used.add(t.id); }
      else rows.push({ header: t.name });
      for (const s of shops) { rows.push({ place: s, depth: 1 }); used.add(s.id); }
    }
    const rest = known.filter((p) => !used.has(p.id));
    if (rest.length) {
      rows.push({ header: 'Out in the valley' });
      for (const p of rest) rows.push({ place: p, depth: 1 });
    }
    return rows;
  }

  update(dt, input) {
    this.t += dt;
    // Both maps browse the same way; only the taxi one does anything on Space.
    const n = this.places.length;
    if (n) {
      if (input.repeat('up', dt) || input.repeat('left', dt)) { this.index = (this.index - 1 + n) % n; audio.sfx('ui_move', { gain: 0.6 }); }
      if (input.repeat('down', dt) || input.repeat('right', dt)) { this.index = (this.index + 1) % n; audio.sfx('ui_move', { gain: 0.6 }); }
    }
    if (input.hit('use')) {
      if (this.pickMode && n) {
        const p = this.places[this.index];
        this.done = true;
        if (this.onPick) this.onPick(p);
        return;
      }
      this.close();
    }
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  draw(ctx) {
    dim(ctx, 0.72);
    const { x, w } = fitRect(12, VIEW_W - 24, 300);
    const y = 18, h = VIEW_H - 36;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, this.pickMode ? 'Where to?' : 'Bramble Valley');

    const mini = this.game.minimap;
    if (mini) {
      const mw = mini.width, mh = mini.height;
      // Leave room under the map for the hint line.
      const scale = Math.min((w - 130) / mw, (h - 50) / mh);
      const mx = Math.round(x + 8), my = Math.round(y + 22);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mini, mx, my, Math.round(mw * scale), Math.round(mh * scale));
      ctx.strokeStyle = P.uiEdgeDk;
      ctx.strokeRect(mx + 0.5, my + 0.5, Math.round(mw * scale), Math.round(mh * scale));

      // Pins for everywhere you've been. Towns and shops pile up in the same
      // few streets, so labels are placed around their pin and any that can't
      // find a clear slot are left off — the side list still names them all.
      const st = this.game.state;
      const at = (p) => ({
        x: mx + Math.round(p.x * scale * (mw / st.worldW)),
        y: my + Math.round(p.y * scale * (mh / st.worldH)),
      });

      for (let i = 0; i < this.places.length; i++) {
        const p = at(this.places[i]);
        const sel = i === this.index;
        const bob = sel ? (Math.sin(this.t * 7) > 0 ? -1 : 0) : 0;
        ctx.fillStyle = '#000000';
        ctx.fillRect(p.x - 2, p.y - 5 + bob, 5, 7);
        ctx.fillStyle = sel ? P.uiGold : P.uiRed;
        ctx.fillRect(p.x - 2, p.y - 4 + bob, 4, 4);
        ctx.fillRect(p.x - 1, p.y + bob, 2, 2);
        // A ring around the one you're looking at, so it reads at a glance.
        if (sel) {
          ctx.strokeStyle = P.uiGold;
          ctx.lineWidth = 1;
          const r = 5 + (Math.sin(this.t * 4) > 0 ? 0 : 1);
          ctx.strokeRect(p.x - r + 0.5, p.y - r + 0.5, r * 2, r * 2);
        }
      }

      // Only the highlighted place is named. Labelling all of them turned any
      // town with shops in it into an unreadable stack; the list has the rest.
      const place = this.places[this.index];
      if (place) {
        const p = at(place);
        const lw = textWidth(place.name), lh = 8;
        const slots = [
          { x: p.x + 8, y: p.y - 5 },
          { x: p.x - lw - 8, y: p.y - 5 },
          { x: p.x - Math.round(lw / 2), y: p.y - 17 },
          { x: p.x - Math.round(lw / 2), y: p.y + 8 },
        ];
        const right = mx + mw * scale;
        const spot = slots.find((s) => s.x > mx + 1 && s.x + lw < right - 1
          && s.y > my + 1 && s.y + lh < my + mh * scale - 1) || slots[0];
        ctx.fillStyle = 'rgba(12,10,20,0.82)';
        ctx.fillRect(spot.x - 3, spot.y - 2, lw + 5, lh + 3);
        ctx.strokeStyle = P.uiGoldDk;
        ctx.strokeRect(spot.x - 3.5, spot.y - 2.5, lw + 6, lh + 4);
        drawText(ctx, place.name, spot.x, spot.y, { color: P.uiGold, shadow: '#000000' });
      }

      // Everyone else in the valley, then you on top. Drawn from the roster
      // rather than from the drawn actors, so somebody on the far side of the
      // world still shows up — which is the whole point of looking.
      const spot = (wx, wy) => ({
        x: mx + Math.round((wx / 16) * scale * (mw / st.worldW)),
        y: my + Math.round((wy / 16) * scale * (mh / st.worldH)),
      });
      // Kept so a test can ask where a given world position ended up on
      // screen; there is no other way to check a marker was actually drawn
      // somewhere in particular rather than merely drawn.
      this.project = spot;
      const net = this.game.net;
      const others = [];
      if (net && net.shared) {
        for (const r of net.remotes.values()) {
          const q = spot(r.x, r.y);
          others.push({ ...q, name: r.n || 'Someone', inside: r.map !== 'overworld' });
        }
      }

      // A marker has to read against whatever it lands on, and this map is
      // mostly green — so a light pip inside a dark ring rather than a colour,
      // and everybody is named. There are eight players at most.
      const pin = (p, fill, label, labelCol) => {
        ctx.fillStyle = '#101018';
        ctx.fillRect(p.x - 4, p.y - 4, 9, 9);
        ctx.fillStyle = fill;
        ctx.fillRect(p.x - 2, p.y - 2, 5, 5);
        if (!label) return;
        const lw2 = textWidth(label);
        // Keep it on the map, flipping to the other side near the edge.
        const right = mx + mw * scale;
        let lx2 = p.x + 7;
        if (lx2 + lw2 + 3 > right) lx2 = p.x - 7 - lw2;
        const ly2 = Math.max(my + 1, Math.min(p.y - 4, my + mh * scale - 11));
        ctx.fillStyle = 'rgba(12,10,20,0.85)';
        ctx.fillRect(lx2 - 2, ly2 - 1, lw2 + 4, 10);
        drawText(ctx, label, lx2, ly2, { color: labelCol, shadow: '#000000' });
      };

      for (const o of others.slice(0, 8)) {
        pin(o, o.inside ? '#c8c2b4' : '#8fe0ff', o.name, o.inside ? P.uiTextDim : '#8fe0ff');
      }

      // Where you are now, on top of everyone.
      if (this.game.state.mapId === 'overworld') {
        const pl = this.game.player;
        const p = spot(pl.x, pl.y);
        const blink = Math.sin(this.t * 8) > 0;
        pin(p, blink ? '#ffffff' : P.uiGold, null);
      }
    }

    // Side list: towns as headings, the shops inside them indented beneath.
    const lx = x + w - 128;
    drawText(ctx, this.pickMode ? 'Destinations' : 'Places found', lx, y + 22, { color: P.uiGold, shadow: P.uiShadow });
    if (this.rows.some((r) => r.place && r.place.fromMap)) {
      drawTextRight(ctx, '* from the map', x + w - 8, y + 22, { color: P.uiTextDim, shadow: P.uiShadow });
    }
    const VIS = 13;
    const selRow = this.rows.findIndex((r) => r.place === this.places[this.index]);
    const start = clamp(selRow - Math.floor(VIS / 2), 0, Math.max(0, this.rows.length - VIS));
    for (let i = start; i < Math.min(this.rows.length, start + VIS); i++) {
      const row = this.rows[i];
      const ry = y + 36 + (i - start) * 12;
      if (row.header) {
        drawText(ctx, row.header, lx, ry, { color: P.uiTextDim, shadow: P.uiShadow });
        ctx.fillStyle = P.uiEdgeDk;
        ctx.fillRect(lx, ry + 8, textWidth(row.header), 1);
        continue;
      }
      const sel = row.place === this.places[this.index];
      const ind = row.depth * 8;
      if (sel) cursor(ctx, lx + ind - 8, ry, this.t);
      // Somewhere the map told you about rather than somewhere you have been.
      // You can still fly there — that is what the map is for — but it should
      // not pretend you have walked it.
      const onlyOnMap = row.place.fromMap;
      const col = sel ? P.uiGold : onlyOnMap ? P.uiTextDim : row.town ? P.uiText : P.uiTextDim;
      const label = (row.name || row.place.name) + (onlyOnMap ? ' *' : '');
      drawText(ctx, label, lx + ind, ry, { color: col, shadow: P.uiShadow });
      if (row.town) {
        ctx.fillStyle = sel ? P.uiGoldDk : P.uiEdgeDk;
        ctx.fillRect(lx, ry + 8, textWidth(row.place.name), 1);
      }
    }
    if (this.rows.length > VIS) {
      drawText(ctx, `${this.index + 1}/${this.places.length}`, lx, y + 36 + VIS * 12 + 1,
        { color: P.uiTextDim, shadow: P.uiShadow });
    }

    // Opening hours for whatever is highlighted. You have been there, so you
    // know when it opens — which is exactly the thing you walk across the
    // valley and find out you did not.
    const here = this.places[this.index];
    const shop = here ? SHOPS.find((s2) => s2.id === here.id) : null;
    if (shop) {
      const open = shopOpen(shop, this.game.state.clock);
      const line = `${hoursText(shop)}  —  ${open ? 'open now' : 'shut now'}`;
      drawTextCentered(ctx, line, VIEW_W / 2, y + h - 26,
        { color: open ? P.uiGreen : P.uiTextDim, shadow: P.uiShadow });
    }

    if (this.pickMode) {
      const p = this.places[this.index];
      const fare = p ? this.game.state.taxiFare(p) : 0;
      drawTextCentered(ctx, `Fare: ${fare}    Space to fly    X to stay`, VIEW_W / 2, y + h - 14,
        { color: this.game.state.money >= fare ? P.uiGold : P.uiRed, shadow: P.uiShadow });
    } else {
      drawTextCentered(ctx, 'Arrows to look around    Space or X to close', VIEW_W / 2, y + h - 14,
        { color: P.uiTextDim, shadow: P.uiShadow });
    }
  }
}

// ---------------------------------------------------------------------------
// Morning summary
// ---------------------------------------------------------------------------

// As many overnight lines as the morning card will hold.
const MAX_SUMMARY_LINES = 7;

export class SummaryScreen extends Screen {
  constructor(game, summary) {
    super();
    this.game = game;
    this.s = summary;
    this.reveal = 0;
  }
  update(dt, input) {
    this.t += dt;
    this.reveal += dt * 2.4;
    if (input.hit('use') || input.hit('cancel')) {
      if (this.reveal < Math.min(this.s.lines.length, MAX_SUMMARY_LINES) + 3) this.reveal = 99;
      else { this.done = true; audio.sfx('ui_ok'); }
    }
  }
  draw(ctx) {
    dim(ctx, 0.75);
    const slept = !!this.s.slept;
    // Grow with the night's news rather than clipping it. A day with spoilage,
    // a sick cat and three things people asked for that you hadn't got fills
    // this easily, and the last lines used to be drawn over the Space prompt.
    const shown = Math.min(this.s.lines.length, MAX_SUMMARY_LINES);
    const w = 250, h = (slept ? 144 : 106) + shown * 11 + 26;
    const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
    panel(ctx, x, y, w, h);
    const st = this.game.state;
    panelTitle(ctx, x, y, w, `${st.clock.dayFull} morning`);

    let ly = y + 16;

    if (slept) {
      // You, curled up in a cat bed like any sensible cat, purring.
      // Drawn at 2x: at native size the cat is smaller than the text beside it.
      const Z = 2;
      const bed = objSprite('catBed', 0);
      const cat = playerCatSprite(st.playerLook.coat, 'sleep');
      const cx = x + w / 2 - 16;
      const by = ly + 6;
      ctx.drawImage(bed, 0, 0, bed.width, bed.height,
        Math.round(cx - (bed.width * Z) / 2), by + 6, bed.width * Z, bed.height * Z);
      ctx.drawImage(cat, 0, 0, cat.width, cat.height,
        Math.round(cx - (cat.width * Z) / 2), by + 6 + (bed.height - cat.height - 2) * Z,
        cat.width * Z, cat.height * Z);
      // Purring, drifting up beside them.
      for (let i = 0; i < 3; i++) {
        const k = ((this.t * 0.45) + i / 3) % 1;
        ctx.globalAlpha = clamp(1 - k, 0, 1) * 0.9;
        drawText(ctx, 'P' + 'r'.repeat(2 + Math.floor(k * 4)),
          Math.round(cx + 26), Math.round(by + 16 - k * 26),
          { color: P.uiBlue, shadow: P.uiShadow });
        ctx.globalAlpha = 1;
      }
      ly = by + bed.height * Z + 12;
    }

    drawTextCentered(ctx, `Day ${this.s.day + 1} is done`, x + w / 2, ly, { color: P.uiTextDim, shadow: P.uiShadow });
    ly += 18;

    const rows = [
      ['Customers', String(this.s.customers), P.uiText],
      ['Earned', money(this.s.revenue), P.uiGreen],
      ['Costs', money(this.s.costs), P.uiRed],
      ['Profit', money(this.s.profit), this.s.profit >= 0 ? P.uiGold : P.uiRed],
    ];
    rows.forEach((r, i) => {
      if (this.reveal < i) return;
      drawText(ctx, r[0], x + 18, ly + i * 13, { color: P.uiTextDim, shadow: P.uiShadow });
      drawTextRight(ctx, r[1], x + w - 18, ly + i * 13, { color: r[2], shadow: P.uiShadow });
    });
    ly += rows.length * 13 + 8;

    ctx.fillStyle = P.uiEdgeDk;
    ctx.fillRect(x + 14, ly, w - 28, 1);
    ly += 8;

    this.s.lines.slice(0, MAX_SUMMARY_LINES).forEach((l, i) => {
      if (this.reveal < 4 + i) return;
      const col = l.tone === 'bad' ? P.uiRed : l.tone === 'warn' ? P.uiGold : l.tone === 'good' ? P.uiGreen : P.uiTextDim;
      drawText(ctx, l.text.slice(0, 44), x + 18, ly + i * 11, { color: col, shadow: P.uiShadow });
    });

    drawTextCentered(ctx, 'Space', x + w / 2, y + h - 14, { color: P.uiTextDim, shadow: P.uiShadow });
  }
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------

/**
 * Everybody you have got to know, and where to find them again — which is the
 * question you actually have about a villager three towns away whose name you
 * half remember.
 */
export class FriendsScreen extends Screen {
  constructor(game) {
    super();
    this.game = game;
    this.index = 0;
    this.scroll = 0;
    this.rows = this.buildRows();
  }

  /** Anyone you have spoken to, warmest first. */
  buildRows() {
    const st = this.game.state;
    return Object.entries(st.friends)
      .map(([id, level]) => ({ def: VILLAGERS.find((v) => v.id === id), id, level }))
      .filter((r) => r.def)
      .sort((a, b) => b.level - a.level || a.def.name.localeCompare(b.def.name));
  }

  /** Where to look for them, in the terms a player thinks in. */
  static whereabouts(def) {
    if (def.regular) return 'Comes to your cafe';
    const shop = SHOPS.find((s) => s.keeper === def.id);
    const town = TOWNS.find((t) => t.id === (shop ? shop.town : def.town));
    const when = def.when === 'night' ? ', after dark' : '';
    if (shop) return `${shop.name}${when}`;
    if (town) return `${town.name}${when}`;
    if (def.role === 'wanderer') return `Out in the valley${when || ', anywhere'}`;
    return def.spot ? `Near the ${def.spot}${when}` : `Somewhere in the valley${when}`;
  }

  static warmth(level) {
    if (level >= 0.75) return 'Firm friends';
    if (level >= 0.45) return 'Friendly';
    if (level >= 0.2) return 'On good terms';
    return 'Passing acquaintance';
  }

  update(dt, input) {
    this.t += dt;
    const n = this.rows.length;
    if (n) {
      if (input.repeat('up', dt)) { this.index = (this.index - 1 + n) % n; audio.sfx('ui_move', { gain: 0.6 }); }
      if (input.repeat('down', dt)) { this.index = (this.index + 1) % n; audio.sfx('ui_move', { gain: 0.6 }); }
      const vis = 6;
      if (this.index < this.scroll) this.scroll = this.index;
      if (this.index >= this.scroll + vis) this.scroll = this.index - vis + 1;
    }
    if (input.hit('use') || input.hit('cancel') || input.hit('menu')) this.close();
  }

  draw(ctx) {
    dim(ctx, 0.68);
    const { x, w } = fitRect(16, VIEW_W - 32, 300);
    const y = 22, h = VIEW_H - 44;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Friends');

    if (!this.rows.length) {
      drawTextCentered(ctx, 'You have not got to know anybody yet.', x + w / 2, y + 46,
        { color: P.uiTextDim, shadow: P.uiShadow });
      drawTextCentered(ctx, 'Talk to people. It is mostly that.', x + w / 2, y + 60,
        { color: P.uiTextDim, shadow: P.uiShadow });
      drawTextCentered(ctx, 'Space or X to close', x + w / 2, y + h - 14, { color: P.uiTextDim, shadow: P.uiShadow });
      return;
    }

    const vis = 6;
    for (let i = this.scroll; i < Math.min(this.rows.length, this.scroll + vis); i++) {
      const r = this.rows[i];
      const ry = y + 26 + (i - this.scroll) * 30;
      const sel = i === this.index;
      if (sel) {
        ctx.fillStyle = 'rgba(255,207,107,0.12)';
        ctx.fillRect(x + 6, ry - 4, w - 12, 28);
        cursor(ctx, x + 6, ry + 6, this.t);
      }
      const look = lookOf(r.def);
      ctx.drawImage(charSprite(look.species, look.coat, look.cloth, 'down', 0), x + 18, ry - 4);
      drawText(ctx, r.def.name, x + 42, ry, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      drawText(ctx, FriendsScreen.whereabouts(r.def), x + 42, ry + 12,
        { color: P.uiTextDim, shadow: P.uiShadow });
      // How well you know them, said in words as well as in a bar — a bar on
      // its own never says what it is a bar of.
      drawTextRight(ctx, FriendsScreen.warmth(r.level), x + w - 14, ry,
        { color: sel ? P.uiGold : P.uiTextDim, shadow: P.uiShadow });
      bar(ctx, x + w - 82, ry + 14, 68, 6, r.level, r.level > 0.6 ? P.uiGreen : P.uiPink);
    }

    if (this.rows.length > vis) {
      drawTextRight(ctx, `${this.index + 1}/${this.rows.length}`, x + w - 14, y + h - 26,
        { color: P.uiTextDim, shadow: P.uiShadow });
    }
    drawTextCentered(ctx, 'Up/Down to look through    Space or X to close', x + w / 2, y + h - 14,
      { color: P.uiTextDim, shadow: P.uiShadow });
  }
}

export class PauseScreen extends ListScreen {
  constructor(game) {
    super(['Cafe book', 'Journal', 'Map', 'Friends', 'Bag', 'Save game', 'Sound', 'Back'], 8);
    this.game = game;
  }
  update(dt, input) {
    this.t += dt;
    this.navigate(dt, input);
    if (input.hit('use')) {
      const pick = this.items[this.index];
      audio.sfx('ui_ok', { gain: 0.6 });
      switch (pick) {
        case 'Cafe book': this.game.push(new CafeScreen(this.game)); break;
        case 'Journal': this.game.push(new JournalScreen(this.game)); break;
        case 'Map': this.game.push(new MapScreen(this.game)); break;
        case 'Friends': this.game.push(new FriendsScreen(this.game)); break;
        case 'Bag': this.game.push(new BagScreen(this.game)); break;
        case 'Save game': this.game.save(); break;
        case 'Sound': this.game.push(new SoundScreen(this.game)); break;
        default: this.close(); break;
      }
    }
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }
  draw(ctx) {
    dim(ctx, 0.55);
    const w = 130, h = this.items.length * 16 + 22;
    const x = VIEW_W - w - 14 - SAFE.right, y = 34;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Menu');
    this.items.forEach((label, i) => {
      const ry = y + 14 + i * 16;
      const sel = i === this.index;
      if (sel) cursor(ctx, x + 8, ry, this.t);
      drawText(ctx, label, x + 22, ry, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
    });
    const st = this.game.state;
    // The d-pad lives in this corner on a phone, so start clear of it.
    const ix = 14 + SAFE.left;
    panel(ctx, ix, VIEW_H - 62, 190, 48, { fill: 'rgba(30,25,45,0.9)' });
    drawText(ctx, st.cafe.name, ix + 8, VIEW_H - 56, { color: P.uiGold, shadow: P.uiShadow });
    drawText(ctx, `${st.cats.length} cats   ${st.cafeSim.seats().length} seats`, ix + 8, VIEW_H - 44, { color: P.uiTextDim, shadow: P.uiShadow });
    drawText(ctx, `Day ${st.clock.day + 1} — ${st.clock.dayFull}`, ix + 8, VIEW_H - 32, { color: P.uiTextDim, shadow: P.uiShadow });
  }
}

export class SoundScreen extends ListScreen {
  constructor(game) {
    super(['Master', 'Music', 'Effects', 'Fullscreen', 'Back'], 6);
    this.game = game;
  }
  update(dt, input) {
    this.t += dt;
    this.navigate(dt, input);
    const keys = ['master', 'music', 'sfx'];
    if (this.index < 3) {
      if (input.repeat('left', dt)) { audio.setVolume(keys[this.index], audio.volumes[keys[this.index]] - 0.1); audio.sfx('ui_move'); }
      if (input.repeat('right', dt)) { audio.setVolume(keys[this.index], audio.volumes[keys[this.index]] + 0.1); audio.sfx('ui_move'); }
    }
    if (input.hit('use') && this.index === 3) { this.game.requestFullscreen(); audio.sfx('ui_ok'); }
    if (input.hit('use') && this.index === 4) this.close();
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }
  draw(ctx) {
    dim(ctx, 0.6);
    const w = 200, h = 116;
    const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Sound');
    const keys = ['master', 'music', 'sfx'];
    this.items.forEach((label, i) => {
      const ry = y + 16 + i * 18;
      const sel = i === this.index;
      if (sel) cursor(ctx, x + 8, ry, this.t);
      drawText(ctx, label, x + 22, ry, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      if (i < 3) bar(ctx, x + 90, ry + 1, 84, 7, audio.volumes[keys[i]], P.uiGold);
    });
  }
}
