// The build mode. A top-down plan of your cafe that you can draw rooms onto and
// furnish, rendered with the same tiles and sprites as the real interior so what
// you see is exactly what you'll walk around in afterwards.

import { Screen } from './menus.js';
import { panel, panelTitle, drawText, drawTextCentered, drawTextRight, textWidth } from './core.js';
import { VIEW_W, VIEW_H } from '../engine/display.js';
import { P } from '../art/palette.js';
import { TILE, T } from '../art/tiles.js';
import { ITEMS } from '../game/items.js';
import { buildCafeMap } from '../world/interiors.js';
import { Renderer, Camera } from '../world/render.js';
import { audio } from '../engine/audio.js';
import { clamp, money } from '../engine/util.js';
import { objSprite, buildingSprite } from '../art/objects.js';

// Laying out rooms needs a hired crew; moving your own furniture about does
// not, so the Rooms tab simply isn't offered until you have builders.
const ALL_MODES = ['Rooms', 'Furnish', 'Style'];

const FLOORS = [
  { id: T.FLOOR_WOOD, name: 'Boards' },
  { id: T.FLOOR_TILE, name: 'Chequer tile' },
  { id: T.FLOOR_STONE, name: 'Flagstones' },
  { id: T.RUG, name: 'Red carpet' },
  { id: T.CARPET_GREEN, name: 'Green carpet' },
];

const WALLS = ['#efe2c8', '#e6dcc2', '#dfe6e8', '#f0e4cc', '#e8d9c0', '#d9e2d2', '#f2e0e0'];
const ROOFS = ['#c86a4a', '#5a6472', '#d0a659', '#b2624b', '#7d8794', '#6b7d54'];
const AWNINGS = ['#c05a7a', '#5b8fd6', '#7fbe57', '#eec453', '#8a72d6', '#e0894a', '#6b9e8f', '#d95f5f'];

let draftSerial = 0;

export class BuildScreen extends Screen {
  constructor(game) {
    super();
    this.game = game;
    const st = game.state;
    // Work on a copy so backing out changes nothing.
    this.draft = JSON.parse(JSON.stringify(st.cafe));
    this.spentMoney = 0;
    this.spentMaterials = 0;
    this.modes = st.workers > 0 ? ALL_MODES : ALL_MODES.slice(1);
    this.mode = 0;
    this.cur = { x: 0, y: 0 };
    this.dragStart = null;
    this.palette = 0;
    this.styleRow = 0;
    this.msg = '';
    this.msgT = 0;
    this.renderer = new Renderer(game.tileset);
    this.cam = new Camera();
    this.map = null;
    this.rebuild();
    const r0 = this.draft.rooms[0];
    // In Rooms mode, start flush against the east wall so the first rectangle
    // you draw is guaranteed to join on; otherwise start inside the room.
    this.cur = this.modeName === 'Rooms'
      ? { x: r0.x + r0.w, y: r0.y }
      : { x: r0.x + Math.floor(r0.w / 2), y: r0.y + Math.floor(r0.h / 2) };
    audio.setTrack('build');
  }

  get modeName() { return this.modes[this.mode]; }

  rebuild() {
    draftSerial++;
    this.map = buildCafeMap(this.draft);
    this.map.id = `cafe-draft-${draftSerial}`;
    this.renderer.invalidateAll();
    this.renderer.currentMapId = null;
    this.offX = this.map.meta.offX;
    this.offY = this.map.meta.offY;
  }

  // -------------------------------------------------------------- helpers

  get furnitureStock() {
    const st = this.game.state;
    return Object.keys(st.inventory)
      .filter((id) => st.inventory[id] > 0 && ITEMS[id] && ITEMS[id].place)
      .sort();
  }

  areaOf(rooms) { return rooms.reduce((s, r) => s + r.w * r.h, 0); }

  roomAt(x, y) {
    return this.draft.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  }

  /** A new room has to touch an existing one, or you couldn't walk into it. */
  touchesExisting(rect) {
    return this.draft.rooms.some((r) => {
      const gapX = rect.x > r.x + r.w || rect.x + rect.w < r.x;
      const gapY = rect.y > r.y + r.h || rect.y + rect.h < r.y;
      return !gapX && !gapY;
    });
  }

  overlapsExisting(rect) {
    return this.draft.rooms.some((r) =>
      rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y);
  }

  costOf(rect) { return rect.w * rect.h * 6; }

  flash(m, bad = false) {
    this.msg = m; this.msgT = 2.8;
    audio.sfx(bad ? 'error' : 'ui_ok', { gain: 0.7 });
  }

  // --------------------------------------------------------------- update

  update(dt, input) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    const st = this.game.state;

    if (input.hit('shift')) {
      this.mode = (this.mode + 1) % this.modes.length;
      this.dragStart = null;
      audio.sfx('ui_move');
    }

    if (this.modeName === 'Style') {
      this.updateStyle(dt, input);
    } else {
      // Cursor movement is shared by room and furnish modes.
      if (input.repeat('left', dt)) { this.cur.x--; audio.sfx('ui_move', { gain: 0.35 }); }
      if (input.repeat('right', dt)) { this.cur.x++; audio.sfx('ui_move', { gain: 0.35 }); }
      if (input.repeat('up', dt)) { this.cur.y--; audio.sfx('ui_move', { gain: 0.35 }); }
      if (input.repeat('down', dt)) { this.cur.y++; audio.sfx('ui_move', { gain: 0.35 }); }
      this.cur.x = clamp(this.cur.x, -22, 32);
      this.cur.y = clamp(this.cur.y, -18, 26);

      if (this.modeName === 'Rooms') this.updateRooms(input);
      else this.updateFurnish(dt, input);
    }

    if (input.hit('menu')) this.finish();

    // Keep the plan centred on whatever you're doing.
    const px = (this.cur.x + this.offX) * TILE + TILE / 2;
    const py = (this.cur.y + this.offY) * TILE + TILE / 2;
    this.cam.follow(this.map, px, py - 12);
  }

  updateRooms(input) {
    const st = this.game.state;
    if (input.hit('use')) {
      if (!this.dragStart) {
        this.dragStart = { x: this.cur.x, y: this.cur.y };
        audio.sfx('place', { gain: 0.6 });
      } else {
        const rect = this.pendingRect();
        this.dragStart = null;
        if (rect.w < 3 || rect.h < 3) { this.flash('Rooms need to be at least 3 by 3.', true); return; }
        if (this.overlapsExisting(rect)) { this.flash('That overlaps a room you already have.', true); return; }
        if (!this.touchesExisting(rect)) { this.flash('New rooms must join onto the cafe.', true); return; }
        const newArea = this.areaOf(this.draft.rooms) + rect.w * rect.h;
        if (newArea > st.maxFloorArea()) {
          this.flash(`Too big — your crew can manage ${st.maxFloorArea()} tiles.`, true);
          return;
        }
        const cost = this.costOf(rect);
        if (st.money - this.spentMoney < cost) { this.flash(`That would cost ${cost}. You cannot afford it.`, true); return; }
        if (st.materials - this.spentMaterials < 1) { this.flash('You need timber and tile. Buy materials from Trowel.', true); return; }
        this.spentMoney += cost;
        this.spentMaterials += 1;
        this.draft.rooms.push({ ...rect, name: `Room ${this.draft.rooms.length + 1}` });
        this.rebuild();
        audio.sfx('hammer', { gain: 0.9 });
        setTimeout(() => audio.sfx('saw', { gain: 0.6 }), 180);
        this.flash(`Room added. ${cost} for the work.`);
      }
    }
    if (input.hit('cancel')) {
      if (this.dragStart) { this.dragStart = null; audio.sfx('ui_back'); return; }
      // Remove the room under the cursor (never the first one).
      const r = this.roomAt(this.cur.x, this.cur.y);
      const i = this.draft.rooms.indexOf(r);
      if (i > 0) {
        // Anything standing in it goes back in the bag.
        this.draft.furniture = this.draft.furniture.filter((f) => {
          const inside = f.x >= r.x && f.x < r.x + r.w && f.y >= r.y && f.y < r.y + r.h;
          if (inside) this.returnFurniture(f);
          return !inside;
        });
        this.draft.rooms.splice(i, 1);
        this.spentMoney -= Math.floor(this.costOf(r) * 0.4);
        this.spentMaterials -= 1;
        this.rebuild();
        this.flash('Room taken down. You get some of it back.');
      } else if (i === 0) {
        this.flash('You cannot demolish the original room.', true);
      } else {
        this.finish();
      }
    }
  }

  returnFurniture(f) {
    const st = this.game.state;
    const id = Object.keys(ITEMS).find((k) => ITEMS[k].place === f.type);
    if (id) st.inventory[id] = (st.inventory[id] || 0) + 1;
  }

  takeFurniture(id) {
    const st = this.game.state;
    st.inventory[id]--;
    if (st.inventory[id] <= 0) delete st.inventory[id];
  }

  updateFurnish(dt, input) {
    const stock = this.furnitureStock;
    if (stock.length) {
      if (input.repeat('shift', dt)) { /* handled above */ }
      if (input.hit('run')) { this.palette = (this.palette + 1) % stock.length; audio.sfx('ui_move'); }
    }
    // Q/E style cycling via the run key is awkward; use up/down on the palette
    // strip when holding no direction is impractical, so bind to 'map'/'inventory'.
    if (input.hit('map')) { this.palette = (this.palette + 1) % Math.max(1, stock.length); audio.sfx('ui_move'); }
    if (input.hit('inventory')) { this.palette = (this.palette - 1 + Math.max(1, stock.length)) % Math.max(1, stock.length); audio.sfx('ui_move'); }

    if (input.hit('use')) {
      const existing = this.draft.furniture.find((f) => f.x === this.cur.x && f.y === this.cur.y);
      if (existing) { this.flash('Something is already there.', true); return; }
      if (!this.roomAt(this.cur.x, this.cur.y)) { this.flash('That is outside the building.', true); return; }
      const id = stock[this.palette];
      if (!id) { this.flash('Nothing left to place. Buy furniture from Velvet & Oak.', true); return; }
      const def = ITEMS[id];
      // Variant 0 is what the shop and the placement ghost both show. Rolling
      // a random one here meant a wooden chair could come out purple.
      this.draft.furniture.push({ type: def.place, x: this.cur.x, y: this.cur.y, variant: 0 });
      this.takeFurniture(id);
      if (this.palette >= this.furnitureStock.length) this.palette = Math.max(0, this.furnitureStock.length - 1);
      this.rebuild();
      audio.sfx('place', { gain: 0.9 });
      this.flash(`${def.name} placed.`);
    }

    if (input.hit('cancel')) {
      const i = this.draft.furniture.findIndex((f) => f.x === this.cur.x && f.y === this.cur.y);
      if (i >= 0) {
        const f = this.draft.furniture[i];
        // Fixtures that came with the shop stay put.
        if (['counter', 'register', 'coffeeMachine', 'menuBoard'].includes(f.type) && this.countType(f.type) <= 1) {
          this.flash('You need to keep at least one of those.', true);
          return;
        }
        this.returnFurniture(f);
        this.draft.furniture.splice(i, 1);
        this.rebuild();
        audio.sfx('ui_back');
        this.flash('Picked up.');
      } else {
        this.finish();
      }
    }
  }

  countType(type) { return this.draft.furniture.filter((f) => f.type === type).length; }

  updateStyle(dt, input) {
    const rows = 4;
    if (input.repeat('up', dt)) { this.styleRow = (this.styleRow + rows - 1) % rows; audio.sfx('ui_move'); }
    if (input.repeat('down', dt)) { this.styleRow = (this.styleRow + 1) % rows; audio.sfx('ui_move'); }
    const step = (n, len) => ((n % len) + len) % len;
    if (input.repeat('left', dt) || input.repeat('right', dt)) {
      const d = input.repeat('right', dt) ? 1 : -1;
      const cycle = (list, cur) => list[step(Math.max(0, list.indexOf(cur)) + d, list.length)];
      if (this.styleRow === 0) {
        const i = FLOORS.findIndex((f) => f.id === this.draft.floor);
        this.draft.floor = FLOORS[step(i + d, FLOORS.length)].id;
        this.rebuild();                                   // the floor is the only one you see from in here
      } else if (this.styleRow === 1) this.draft.roof = cycle(ROOFS, this.draft.roof);
      else if (this.styleRow === 2) this.draft.awning = cycle(AWNINGS, this.draft.awning);
      else this.draft.wall = cycle(WALLS, this.draft.wall);
      audio.sfx('ui_move');
    }
    if (input.hit('cancel')) this.finish();
  }

  pendingRect() {
    const a = this.dragStart || this.cur;
    const x0 = Math.min(a.x, this.cur.x), y0 = Math.min(a.y, this.cur.y);
    const x1 = Math.max(a.x, this.cur.x), y1 = Math.max(a.y, this.cur.y);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  finish() {
    const st = this.game.state;
    st.money -= this.spentMoney;
    st.materials -= this.spentMaterials;
    st.cafe = this.draft;
    st.rebuildCafe();
    this.done = true;
    audio.sfx('levelup', { gain: 0.7 });
    st.toast('The cafe has been rebuilt.', 'good');
  }

  // ----------------------------------------------------------------- draw

  draw(ctx) {
    ctx.fillStyle = '#141220';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // The plan itself, drawn exactly like the real interior.
    this.renderer.draw(ctx, this.map, this.cam, [], { night: 0 });

    const ox = this.cam.ox, oy = this.cam.oy;
    const sx = (tx) => (tx + this.offX) * TILE - ox;
    const sy = (ty) => (ty + this.offY) * TILE - oy;

    // Grid over the buildable area.
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';
    for (let y = -18; y <= 26; y++) {
      const py = sy(y);
      if (py < 0 || py > VIEW_H) continue;
      ctx.fillRect(0, py, VIEW_W, 1);
    }
    for (let x = -22; x <= 32; x++) {
      const px = sx(x);
      if (px < 0 || px > VIEW_W) continue;
      ctx.fillRect(px, 0, 1, VIEW_H);
    }
    ctx.globalAlpha = 1;

    // Pending room rectangle.
    if (this.modeName === 'Rooms' && this.dragStart) {
      const r = this.pendingRect();
      const ok = r.w >= 3 && r.h >= 3 && !this.overlapsExisting(r) && this.touchesExisting(r)
        && this.areaOf(this.draft.rooms) + r.w * r.h <= this.game.state.maxFloorArea();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = ok ? '#7fd46a' : '#e8615c';
      ctx.fillRect(sx(r.x), sy(r.y), r.w * TILE, r.h * TILE);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ok ? '#bdf5a8' : '#ff9a94';
      ctx.strokeRect(sx(r.x) + 0.5, sy(r.y) + 0.5, r.w * TILE - 1, r.h * TILE - 1);
      const label = `${r.w} x ${r.h} — ${money(this.costOf(r))}`;
      drawTextCentered(ctx, label, sx(r.x) + (r.w * TILE) / 2, sy(r.y) - 12, { color: ok ? P.uiGreen : P.uiRed, shadow: '#000000' });
    }

    // Ghost of the furniture about to be placed.
    if (this.modeName === 'Furnish') {
      const stock = this.furnitureStock;
      const id = stock[this.palette];
      if (id) {
        const spr = objSprite(ITEMS[id].place, 0);
        if (spr) {
          ctx.globalAlpha = 0.6;
          ctx.drawImage(spr, Math.round(sx(this.cur.x) + (TILE - spr.width) / 2), Math.round(sy(this.cur.y) + TILE - spr.height));
          ctx.globalAlpha = 1;
        }
      }
    }

    // Cursor.
    if (this.modeName !== 'Style') {
      const bob = Math.sin(this.t * 6) > 0 ? 0 : 1;
      ctx.strokeStyle = P.uiGold;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx(this.cur.x) + 0.5 - bob, sy(this.cur.y) + 0.5 - bob, TILE - 1 + bob * 2, TILE - 1 + bob * 2);
      ctx.fillStyle = 'rgba(255,207,107,0.18)';
      ctx.fillRect(sx(this.cur.x), sy(this.cur.y), TILE, TILE);
    }

    this.drawChrome(ctx);
  }

  drawChrome(ctx) {
    const st = this.game.state;
    // Top bar: mode tabs and the budget.
    ctx.fillStyle = 'rgba(20,17,32,0.92)';
    ctx.fillRect(0, 0, VIEW_W, 22);
    ctx.fillStyle = P.uiEdgeDk;
    ctx.fillRect(0, 22, VIEW_W, 1);

    let tx = 8;
    this.modes.forEach((m, i) => {
      const tw = textWidth(m) + 12;
      const sel = i === this.mode;
      ctx.fillStyle = sel ? P.uiGoldDk : '#2a2440';
      ctx.fillRect(tx, 4, tw, 14);
      drawText(ctx, m, tx + 6, 7, { color: sel ? P.uiText : P.uiTextDim, shadow: P.uiShadow });
      tx += tw + 4;
    });
    drawText(ctx, '[Tab] switch', tx + 6, 7, { color: P.uiTextDim, shadow: P.uiShadow });

    const area = this.areaOf(this.draft.rooms);
    const maxA = st.maxFloorArea();
    const cash = st.money - this.spentMoney;
    drawTextRight(ctx, `${area}/${maxA} tiles`, VIEW_W - 96, 7, { color: area > maxA ? P.uiRed : P.uiTextDim, shadow: P.uiShadow });
    drawTextRight(ctx, money(cash), VIEW_W - 10, 7, { color: cash < 0 ? P.uiRed : P.uiGold, shadow: P.uiShadow });

    // Bottom bar: contextual help and, in furnish mode, the palette.
    const barH = this.modeName === 'Furnish' ? 42 : 26;
    ctx.fillStyle = 'rgba(20,17,32,0.92)';
    ctx.fillRect(0, VIEW_H - barH, VIEW_W, barH);
    ctx.fillStyle = P.uiEdgeDk;
    ctx.fillRect(0, VIEW_H - barH, VIEW_W, 1);

    if (this.modeName === 'Furnish') {
      const stock = this.furnitureStock;
      if (!stock.length) {
        drawText(ctx, 'Nothing to place. Buy furniture at Velvet & Oak in Thistlewick.', 10, VIEW_H - 34, { color: P.uiTextDim, shadow: P.uiShadow });
      } else {
        for (let i = 0; i < Math.min(stock.length, 12); i++) {
          const id = stock[(this.palette + i) % stock.length];
          const px = 8 + i * 22;
          const sel = i === 0;
          ctx.fillStyle = sel ? 'rgba(255,207,107,0.25)' : 'rgba(255,255,255,0.06)';
          ctx.fillRect(px, VIEW_H - 38, 20, 20);
          const spr = objSprite(ITEMS[id].place, 0);
          if (spr) {
            const s = Math.min(18 / spr.width, 18 / spr.height, 1);
            ctx.drawImage(spr, px + 10 - (spr.width * s) / 2, VIEW_H - 20 - spr.height * s, spr.width * s, spr.height * s);
          }
          drawText(ctx, String(st.inventory[id] || 0), px + 12, VIEW_H - 37, { color: P.uiText, shadow: '#000000' });
        }
        const cur = stock[this.palette];
        drawText(ctx, `${ITEMS[cur].name}  [M]/[I] to cycle`, 8 + Math.min(stock.length, 12) * 22 + 8, VIEW_H - 34,
          { color: P.uiGold, shadow: P.uiShadow });
      }
      drawText(ctx, 'Space place   X pick up   Esc done', 10, VIEW_H - 14, { color: P.uiTextDim, shadow: P.uiShadow });
    } else if (this.modeName === 'Rooms') {
      drawText(ctx, this.dragStart ? 'Space again to set the far corner   X cancel'
        : 'Space start room   X demolish   Esc done',
        10, VIEW_H - 17, { color: P.uiTextDim, shadow: P.uiShadow });
      drawTextRight(ctx, `Timber ${st.materials - this.spentMaterials}   Crew ${st.workers}`,
        VIEW_W - 10, VIEW_H - 17, { color: P.uiTextDim, shadow: P.uiShadow });
    }

    if (this.modeName === 'Style') this.drawStylePanel(ctx);

    if (this.msgT > 0) {
      const w = textWidth(this.msg) + 18;
      panel(ctx, (VIEW_W - w) / 2, 32, w, 20, { fill: 'rgba(30,25,45,0.94)' });
      drawTextCentered(ctx, this.msg, VIEW_W / 2, 38, { color: P.uiGold, shadow: P.uiShadow });
    }
  }

  drawStylePanel(ctx) {
    const w = 244, h = 190;
    const x = Math.round((VIEW_W - w) / 2), y = Math.round((VIEW_H - h) / 2);
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Style');

    // Roof and awning are outside the building, so they'd be invisible from in
    // here without a shopfront preview.
    const shop = buildingSprite({
      tw: 5, wall: this.draft.wall, roof: this.draft.roof, roofStyle: 'tile',
      timbered: false, wallH: 28, roofH: 24, windows: 2,
      signKey: 'cafe', signBg: '#f3e3c6', awning: this.draft.awning, v: 0,
    });
    const px = Math.round(x + (w - shop.width) / 2), py = y + 14;
    ctx.fillStyle = '#5da845';
    ctx.fillRect(px - 8, py + shop.height - 14, shop.width + 16, 16);
    ctx.fillStyle = '#4b8f39';
    ctx.fillRect(px - 8, py + shop.height + 1, shop.width + 16, 2);
    ctx.drawImage(shop, px, py);

    const floorName = (FLOORS.find((f) => f.id === this.draft.floor) || FLOORS[0]).name;
    const rows = [
      ['Floor', floorName, null],
      ['Roof', '', this.draft.roof],
      ['Awning', '', this.draft.awning],
      ['Walls', '', this.draft.wall],
    ];
    const top = py + shop.height + 10;
    rows.forEach(([label, val, swatch], i) => {
      const ry = top + i * 18;
      const sel = i === this.styleRow;
      if (sel) { ctx.fillStyle = 'rgba(255,207,107,0.14)'; ctx.fillRect(x + 6, ry - 3, w - 12, 17); }
      drawText(ctx, label, x + 14, ry + 1, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      if (swatch) {
        ctx.fillStyle = swatch;
        ctx.fillRect(x + w - 74, ry, 50, 11);
        ctx.strokeStyle = P.uiEdgeDk;
        ctx.strokeRect(x + w - 74.5, ry - 0.5, 51, 12);
        if (sel) {
          drawText(ctx, '<', x + w - 86, ry + 1, { color: P.uiGold, shadow: P.uiShadow });
          drawText(ctx, '>', x + w - 18, ry + 1, { color: P.uiGold, shadow: P.uiShadow });
        }
      } else {
        drawTextRight(ctx, `< ${val} >`, x + w - 16, ry + 1, { color: sel ? P.uiGold : P.uiTextDim, shadow: P.uiShadow });
      }
    });
    drawTextCentered(ctx, 'Left/Right to change    Esc done', x + w / 2, y + h - 13, { color: P.uiTextDim, shadow: P.uiShadow });
  }
}
