// Menu screens. Everything the player interacts with outside of walking around:
// shops, the cafe management book, the journal, the bag, the map and the
// morning summary. Screens are pushed onto a stack the game loop draws.

import { panel, panelTitle, bar, cursor, dim, drawText, drawTextCentered, drawTextRight, textWidth, LINE_H } from './core.js';
import { VIEW_W, VIEW_H } from '../engine/display.js';
import { P } from '../art/palette.js';
import { ITEMS, CAT as ICAT } from '../game/items.js';
import { CAT_BREEDS } from '../art/chars.js';
import { iconSprite } from '../art/icons.js';
import { catSprite } from '../art/chars.js';
import { audio } from '../engine/audio.js';
import { clamp, money, wrapText } from '../engine/util.js';
import { QUESTS, objectiveText } from '../game/quests.js';
import { HIRE_POOL } from '../game/cafe.js';

export class Screen {
  constructor() { this.t = 0; this.done = false; }
  update() {}
  draw() {}
  close() { this.done = true; audio.sfx('ui_back'); }
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
    this.msg = '';
    this.msgT = 0;
  }

  price(id) { return Math.max(1, Math.round((ITEMS[id]?.cost || 0) * this.priceMult)); }

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
      if (input.repeat('right', dt)) { this.qty = clamp(this.qty + 5, 1, maxQ); audio.sfx('ui_move', { gain: 0.5 }); }
      if (input.repeat('left', dt)) { this.qty = clamp(this.qty - 5, 1, maxQ); audio.sfx('ui_move', { gain: 0.5 }); }
      if (input.hit('use')) { this.buy(id, this.qty); this.qtyMode = false; }
      if (input.hit('cancel') || input.hit('menu')) { this.qtyMode = false; audio.sfx('ui_back'); }
      return;
    }

    this.navigate(dt, input);
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
    st.money -= cost;
    st.give(id, qty);
    audio.sfx('buy', { gain: 0.8 });
    this.flash(`Bought ${qty} x ${ITEMS[id].name}.`);
    st.onPurchase?.(id, qty);
  }

  draw(ctx) {
    dim(ctx, 0.6);
    const x = 10, y = 22, w = VIEW_W - 20, h = VIEW_H - 44;
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
      drawTextCentered(ctx, this.qtyMode ? 'Up/Down qty   Space buy   X back' : 'Space to buy    X to leave', VIEW_W / 2, y + h - 16, { color: P.uiTextDim, shadow: P.uiShadow });
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
      st.money -= b.price;
      const cat = st.adoptCat(key);
      audio.sfx('meow_happy', { gain: 0.8 });
      this.msg = `${cat.name} the ${b.name} is coming home with you!`;
      this.msgT = 3.4;
    }
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  draw(ctx) {
    dim(ctx, 0.6);
    const x = 10, y = 22, w = VIEW_W - 20, h = VIEW_H - 44;
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
      st.money -= c;
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
      this.msgT = 3;
      this.refresh();
    }
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  draw(ctx) {
    dim(ctx, 0.6);
    const x = 30, y = 26, w = VIEW_W - 60, h = VIEW_H - 52;
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
        st.money -= it.cost;
        st.workers++;
        audio.sfx('hammer', { gain: 0.9 });
        this.flash(`Hired. You have ${st.workers} builder${st.workers > 1 ? 's' : ''}.`);
        this.refresh();
      } else if (it.kind === 'materials') {
        if (st.money < it.cost) { this.flash("Not enough."); return; }
        st.money -= it.cost;
        st.materials++;
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
    const x = 36, y = 34, w = VIEW_W - 72, h = VIEW_H - 68;
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
    this.msg = '';
    this.msgT = 0;
  }

  update(dt, input) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    const st = this.game.state;

    if (input.hit('shift')) { this.tab = (this.tab + 1) % TABS.length; this.index = 0; this.scroll = 0; audio.sfx('ui_move'); }
    if (this.tab !== 4) {
      if (input.repeat('left', dt)) { this.tab = (this.tab - 1 + TABS.length) % TABS.length; this.index = 0; this.scroll = 0; audio.sfx('ui_move'); }
      if (input.repeat('right', dt)) { this.tab = (this.tab + 1) % TABS.length; this.index = 0; this.scroll = 0; audio.sfx('ui_move'); }
    }

    const list = this.currentList();
    if (list.length) {
      if (input.repeat('up', dt)) { this.index = (this.index - 1 + list.length) % list.length; audio.sfx('ui_move', { gain: 0.5 }); }
      if (input.repeat('down', dt)) { this.index = (this.index + 1) % list.length; audio.sfx('ui_move', { gain: 0.5 }); }
      const vis = 7;
      if (this.index < this.scroll) this.scroll = this.index;
      if (this.index >= this.scroll + vis) this.scroll = this.index - vis + 1;
    }

    if (this.tab === 4) {
      // Hours: left/right adjusts the selected end of the day.
      const which = this.index % 2;
      if (input.repeat('left', dt)) {
        st.shopHours[which] = clamp(st.shopHours[which] - 1, which === 0 ? 0 : st.shopHours[0] + 1, which === 0 ? st.shopHours[1] - 1 : 24);
        audio.sfx('ui_move', { gain: 0.5 });
      }
      if (input.repeat('right', dt)) {
        st.shopHours[which] = clamp(st.shopHours[which] + 1, which === 0 ? 0 : st.shopHours[0] + 1, which === 0 ? st.shopHours[1] - 1 : 24);
        audio.sfx('ui_move', { gain: 0.5 });
      }
      if (input.hit('use')) {
        st.shopOpen = !st.shopOpen;
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
        if (st.inventory.brush > 0 && cat.groomed <= 0) {
          cat.groomed = 3;
          cat.happiness = clamp(cat.happiness + 0.08, 0, 1);
          audio.sfx('brush', { gain: 0.8 });
          this.flash(`You brush ${cat.name}. Not a professional job, but nice.`);
        } else if (st.cafeSim.stockCount('treats') > 0) {
          st.cafeSim.takeStock('treats', 1);
          cat.happiness = clamp(cat.happiness + 0.2, 0, 1);
          audio.sfx('eat', { gain: 0.8 });
          this.flash(`${cat.name} accepts the treat as their due.`);
        } else {
          audio.sfx('meow', { gain: 0.7 });
          this.flash(`${cat.name} looks at you expectantly.`);
        }
      }
    }

    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  staffAction() {
    const st = this.game.state;
    if (st.employee) {
      const list = this.currentList();
      const row = list[this.index];
      if (row?.kind === 'wage_up') { st.employee.wage += 10; this.flash(`Wage raised to ${st.employee.wage}.`); audio.sfx('ui_ok'); }
      else if (row?.kind === 'wage_down') { st.employee.wage = Math.max(10, st.employee.wage - 10); this.flash(`Wage cut to ${st.employee.wage}.`); audio.sfx('ui_back'); }
      else if (row?.kind === 'duty') { st.employee.onDuty = !st.employee.onDuty; this.flash(st.employee.onDuty ? 'On duty.' : 'Off duty.'); audio.sfx('ui_ok'); }
      else if (row?.kind === 'fire') { this.flash(`${st.employee.name} packs up and goes.`); st.employee = null; audio.sfx('ui_back'); }
    } else {
      const cand = HIRE_POOL[this.index];
      if (!cand) return;
      if (st.reputation < 0.2) { this.flash('Nobody will work somewhere this quiet yet.'); audio.sfx('error'); return; }
      st.employee = { name: cand.name, id: cand.id, wage: cand.fairWage, fairWage: cand.fairWage, quality: 0.6, onDuty: true };
      this.flash(`${cand.name} starts tomorrow. Wage set to ${cand.fairWage} a day.`);
      audio.sfx('levelup', { gain: 0.6 });
    }
  }

  flash(m) { this.msg = m; this.msgT = 3; }

  currentList() {
    const st = this.game.state;
    switch (this.tab) {
      case 1: return Object.keys(st.stock).filter((id) => st.cafeSim.stockCount(id) > 0);
      case 2: return st.cats;
      case 3: return st.employee
        ? [{ kind: 'duty' }, { kind: 'wage_up' }, { kind: 'wage_down' }, { kind: 'fire' }]
        : HIRE_POOL;
      case 4: return [0, 1];
      default: return [];
    }
  }

  draw(ctx) {
    dim(ctx, 0.62);
    const x = 8, y = 20, w = VIEW_W - 16, h = VIEW_H - 40;
    panel(ctx, x, y, w, h);

    // Tabs.
    let tx = x + 8;
    TABS.forEach((name, i) => {
      const tw = textWidth(name) + 14;
      const sel = i === this.tab;
      ctx.fillStyle = sel ? P.uiGoldDk : '#241f38';
      ctx.fillRect(tx, y - 6, tw, 14);
      if (sel) { ctx.fillStyle = P.uiGold; ctx.fillRect(tx, y - 6, tw, 1); }
      drawText(ctx, name, tx + 7, y - 3, { color: sel ? P.uiText : P.uiTextDim, shadow: P.uiShadow });
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
    drawText(ctx, `Today: ${sim.todayCustomers} customers, ${money(sim.todayRevenue)} taken`, x + 12, ly, { color: P.uiText, shadow: P.uiShadow });
    ly += 12;
    drawText(ctx, `Best day so far: ${money(st.bestDayProfit)} profit`, x + 12, ly, { color: P.uiTextDim, shadow: P.uiShadow });
    ly += 12;
    const menu = sim.availableMenu();
    drawText(ctx, `On the menu: ${menu.length ? menu.slice(0, 4).map((id) => ITEMS[id].name).join(', ') + (menu.length > 4 ? '...' : '') : 'nothing at all'}`,
      x + 12, ly, { color: menu.length ? P.uiTextDim : P.uiRed, shadow: P.uiShadow });
    ly += 18;

    // The way into build mode.
    const waiting = Object.keys(st.inventory).filter((id) => ITEMS[id]?.place && st.inventory[id] > 0)
      .reduce((s, id) => s + st.inventory[id], 0);
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
    const unplaced = Object.keys(st.inventory).some((id) => ITEMS[id]?.place && st.inventory[id] > 0);
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
    drawText(ctx, 'Space: brush or offer a treat', x + 12, y + 16, { color: P.uiTextDim, shadow: P.uiShadow });
  }

  drawStaff(ctx, x, y, w, h) {
    const st = this.game.state;
    const listY = y + 34;
    if (st.employee) {
      const e = st.employee;
      drawText(ctx, `${e.name} — your one and only employee`, x + 12, y + 20, { color: P.uiGold, shadow: P.uiShadow });
      const rows = [
        [`On duty: ${e.onDuty ? 'yes' : 'no'}`, 'They mind the shop while you are out.'],
        [`Raise wage (now ${e.wage}/day)`, `A fair rate here is about ${e.fairWage}.`],
        ['Cut wage', 'Cheaper, but service suffers and they may leave.'],
        ['Let them go', 'No hard feelings.'],
      ];
      rows.forEach(([label, note], i) => {
        const ry = listY + i * 22;
        const sel = i === this.index;
        if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 8, ry - 3, w - 20, 20); cursor(ctx, x + 8, ry + 3, this.t); }
        drawText(ctx, label, x + 22, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
        if (sel) drawText(ctx, note, x + 22, ry + 13, { color: P.uiTextDim, shadow: P.uiShadow });
      });
      drawText(ctx, 'Service quality', x + w - 180, y + 20, { color: P.uiTextDim, shadow: P.uiShadow });
      bar(ctx, x + w - 180, y + 32, 160, 8, e.quality, e.quality > 0.6 ? P.uiGreen : e.quality > 0.35 ? P.uiGold : P.uiRed);
    } else {
      drawText(ctx, 'Looking for help', x + 12, y + 20, { color: P.uiGold, shadow: P.uiShadow });
      HIRE_POOL.forEach((c, i) => {
        const ry = listY + i * 22;
        const sel = i === this.index;
        if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 8, ry - 3, w - 20, 20); cursor(ctx, x + 8, ry + 3, this.t); }
        drawText(ctx, c.name, x + 22, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
        drawText(ctx, `${c.fairWage}/day`, x + 90, ry + 3, { color: P.uiTextDim, shadow: P.uiShadow });
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
    const x = 16, y = 22, w = VIEW_W - 32, h = VIEW_H - 44;
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
        drawText(ctx, objectiveText(q, st), dx + 8, ly, { color: P.uiBlue, shadow: P.uiShadow });
        ly += LINE_H + 4;
        for (const line of wrapText(q.progress || '', Math.floor((dw - 16) / 6))) {
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
    const x = 40, y = 26, w = VIEW_W - 80, h = VIEW_H - 52;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Bag');
    if (!this.items.length) {
      drawTextCentered(ctx, 'Empty. You are travelling light.', VIEW_W / 2, y + h / 2 - 6, { color: P.uiTextDim, shadow: P.uiShadow });
    }
    const listY = y + 26;
    for (let i = 0; i < Math.min(this.visible, this.items.length); i++) {
      const idx = this.scroll + i;
      const id = this.items[idx];
      const it = ITEMS[id] || { name: id, icon: 'bag', desc: '' };
      const ry = listY + i * 18;
      const sel = idx === this.index;
      if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.12)'; ctx.fillRect(x + 8, ry - 2, w - 20, 17); }
      ctx.drawImage(iconSprite(it.icon), x + 14, ry - 2);
      drawText(ctx, it.name, x + 34, ry + 3, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      drawText(ctx, `x${this.game.state.inventory[id]}`, x + 190, ry + 3, { color: P.uiText, shadow: P.uiShadow });
    }
    const id = this.items[this.index];
    if (id) {
      const it = ITEMS[id];
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
    this.places = game.state.knownPlaces();
  }

  update(dt, input) {
    this.t += dt;
    if (this.pickMode && this.places.length) {
      if (input.repeat('up', dt) || input.repeat('left', dt)) { this.index = (this.index - 1 + this.places.length) % this.places.length; audio.sfx('ui_move'); }
      if (input.repeat('down', dt) || input.repeat('right', dt)) { this.index = (this.index + 1) % this.places.length; audio.sfx('ui_move'); }
      if (input.hit('use')) {
        const p = this.places[this.index];
        this.done = true;
        if (this.onPick) this.onPick(p);
        return;
      }
    }
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }

  draw(ctx) {
    dim(ctx, 0.72);
    const x = 12, y = 18, w = VIEW_W - 24, h = VIEW_H - 36;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, this.pickMode ? 'Where to?' : 'Bramble Valley');

    const mini = this.game.minimap;
    if (mini) {
      const mw = mini.width, mh = mini.height;
      const scale = Math.min((w - 130) / mw, (h - 34) / mh);
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
        const sel = this.pickMode && i === this.index;
        const bob = sel ? (Math.sin(this.t * 7) > 0 ? -1 : 0) : 0;
        ctx.fillStyle = '#000000';
        ctx.fillRect(p.x - 2, p.y - 5 + bob, 5, 7);
        ctx.fillStyle = sel ? P.uiGold : P.uiRed;
        ctx.fillRect(p.x - 2, p.y - 4 + bob, 4, 4);
        ctx.fillRect(p.x - 1, p.y + bob, 2, 2);
      }

      const taken = [];
      const clashes = (r) => taken.some((q) =>
        r.x < q.x + q.w + 2 && r.x + r.w + 2 > q.x && r.y < q.y + q.h + 1 && r.y + r.h + 1 > q.y);

      // Selected pin first so it always wins a slot.
      const order = this.places.map((_, i) => i)
        .sort((a, b) => (b === this.index && this.pickMode ? 1 : 0) - (a === this.index && this.pickMode ? 1 : 0));

      for (const i of order) {
        const sel = this.pickMode && i === this.index;
        if (this.pickMode && !sel) continue;
        const place = this.places[i];
        const p = at(place);
        const lw = textWidth(place.name), lh = 8;
        const slots = [
          { x: p.x + 5, y: p.y - 5 },
          { x: p.x - lw - 5, y: p.y - 5 },
          { x: p.x - Math.round(lw / 2), y: p.y - 15 },
          { x: p.x - Math.round(lw / 2), y: p.y + 4 },
          { x: p.x + 5, y: p.y + 4 },
          { x: p.x - lw - 5, y: p.y + 4 },
        ];
        const spot = slots.find((s) => s.x > mx - 2 && s.x + lw < mx + mw * scale + 60
          && s.y > my && s.y + lh < my + mh * scale && !clashes({ ...s, w: lw, h: lh }));
        if (!spot) continue;
        taken.push({ ...spot, w: lw, h: lh });
        ctx.fillStyle = 'rgba(12,10,20,0.72)';
        ctx.fillRect(spot.x - 2, spot.y - 1, lw + 3, lh + 2);
        drawText(ctx, place.name, spot.x, spot.y, { color: sel ? P.uiGold : P.uiText, shadow: '#000000' });
      }

      // Where you are now.
      if (this.game.state.mapId === 'overworld') {
        const pl = this.game.player;
        const px = mx + Math.round((pl.x / 16) * scale * (mw / st.worldW));
        const py = my + Math.round((pl.y / 16) * scale * (mh / st.worldH));
        const blink = Math.sin(this.t * 8) > 0;
        ctx.fillStyle = blink ? '#ffffff' : P.uiBlue;
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
    }

    // Side list.
    const lx = x + w - 116;
    drawText(ctx, this.pickMode ? 'Destinations' : 'Places found', lx, y + 22, { color: P.uiGold, shadow: P.uiShadow });
    this.places.slice(0, 12).forEach((p, i) => {
      const ry = y + 36 + i * 12;
      const sel = this.pickMode && i === this.index;
      if (sel) cursor(ctx, lx - 8, ry, this.t);
      drawText(ctx, p.name, lx, ry, { color: sel ? P.uiGold : P.uiTextDim, shadow: P.uiShadow });
    });

    if (this.pickMode) {
      const p = this.places[this.index];
      const fare = this.game.state.taxiFare(p);
      drawTextCentered(ctx, `Fare: ${fare}    Space to fly    X to stay`, VIEW_W / 2, y + h - 14,
        { color: this.game.state.money >= fare ? P.uiGold : P.uiRed, shadow: P.uiShadow });
    } else {
      drawTextCentered(ctx, 'X to close', VIEW_W / 2, y + h - 14, { color: P.uiTextDim, shadow: P.uiShadow });
    }
  }
}

// ---------------------------------------------------------------------------
// Morning summary
// ---------------------------------------------------------------------------

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
      if (this.reveal < this.s.lines.length + 3) this.reveal = 99;
      else { this.done = true; audio.sfx('ui_ok'); }
    }
  }
  draw(ctx) {
    dim(ctx, 0.75);
    const w = 250, h = 176;
    const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
    panel(ctx, x, y, w, h);
    const st = this.game.state;
    panelTitle(ctx, x, y, w, `${st.clock.dayFull} morning`);

    let ly = y + 16;
    drawTextCentered(ctx, `Day ${this.s.day + 1} is done`, x + w / 2, ly, { color: P.uiTextDim, shadow: P.uiShadow });
    ly += 18;

    const rows = [
      ['Customers', String(this.s.customers), P.uiText],
      ['Taken', money(this.s.revenue), P.uiGreen],
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

    this.s.lines.slice(0, 6).forEach((l, i) => {
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

export class PauseScreen extends ListScreen {
  constructor(game) {
    super(['Cafe book', 'Journal', 'Map', 'Bag', 'Save game', 'Sound', 'Back'], 8);
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
    const x = VIEW_W - w - 14, y = 34;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Menu');
    this.items.forEach((label, i) => {
      const ry = y + 14 + i * 16;
      const sel = i === this.index;
      if (sel) cursor(ctx, x + 8, ry, this.t);
      drawText(ctx, label, x + 22, ry, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
    });
    const st = this.game.state;
    panel(ctx, 14, VIEW_H - 62, 190, 48, { fill: 'rgba(30,25,45,0.9)' });
    drawText(ctx, st.cafe.name, 22, VIEW_H - 56, { color: P.uiGold, shadow: P.uiShadow });
    drawText(ctx, `${st.cats.length} cats   ${st.cafeSim.seats().length} seats`, 22, VIEW_H - 44, { color: P.uiTextDim, shadow: P.uiShadow });
    drawText(ctx, `Day ${st.clock.day + 1} — ${st.clock.dayFull}`, 22, VIEW_H - 32, { color: P.uiTextDim, shadow: P.uiShadow });
  }
}

export class SoundScreen extends ListScreen {
  constructor(game) {
    super(['Master', 'Music', 'Effects', 'Back'], 6);
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
    if (input.hit('use') && this.index === 3) this.close();
    if (input.hit('cancel') || input.hit('menu')) this.close();
  }
  draw(ctx) {
    dim(ctx, 0.6);
    const w = 190, h = 96;
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
