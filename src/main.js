// Cat Cafe — entry point. Boots the engine, builds the world, and runs the loop.

import {
  Display, VIEW_W, VIEW_H,
  isTouchDevice, fullscreenSupported, isStandalone, toggleFullscreen,
} from './engine/display.js';
import { Input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { drawText, drawTextCentered, drawTextRight, textWidth, LINE_H } from './engine/font.js';
import { makeCanvas } from './engine/pixel.js';
import { clamp, money, makeRng } from './engine/util.js';

import { Tileset, TILE, T } from './art/tiles.js';
import { P } from './art/palette.js';
import { charSprite, catSprite, CAT_BREED_LIST, CAT_BREEDS, COAT_LIST, CLOTHES, COATS } from './art/chars.js';
import { buildingSprite } from './art/objects.js';

import { generateWorld, WORLD_W, WORLD_H } from './world/worldgen.js';
import { Renderer, Camera } from './world/render.js';
import { buildShopInterior, buildSpecialInterior } from './world/interiors.js';
import { SHOPS, VILLAGERS, TOWNS, GOSSIP } from './world/places.js';

import { GameState, seedStartingInventory } from './game/state.js';
import { Player, Villager, canStand } from './game/entities.js';
import { ITEMS, STOCK, FLEA_POOL, baseId } from './game/items.js';
import { shopOpen, hoursText } from './game/time.js';
import { QUESTS, QUESTS_BY_GIVER, objectiveMet } from './game/quests.js';

import { Dialogue, Hud, Fader, panel, panelTitle, dim, cursor } from './ui/core.js';
import { SAFE, safeCenterX } from './engine/safe.js';
import {
  Screen, ShopScreen, CatShopScreen, ServiceScreen, BuilderScreen,
  CafeScreen, JournalScreen, BagScreen, MapScreen, SummaryScreen, PauseScreen,
} from './ui/menus.js';
import { BuildScreen } from './ui/build.js';
import { TaxiFlight, StairWalk } from './ui/cutscene.js';

const WORLD_SEED = 20260724;

class Game {
  constructor() {
    this.display = new Display('screen');
    this.ctx = this.display.ctx;
    this.input = new Input();
    // Input reveals the touch controls, and their height decides how much room
    // the game gets — so measure again now that they exist.
    this.display.resize();
    this.dialogue = new Dialogue();
    this.hud = new Hud();
    this.fader = new Fader();
    this.screens = [];
    this.t = 0;
    this.mode = 'title';
    this.rng = makeRng(WORLD_SEED ^ 0x5a5a);

    this.state = new GameState({
      toast: (text, tone) => this.hud.toast(text, tone),
      float: (text, x, y, color) => this.hud.float(text, x, y, color),
      playerPos: () => (this.player ? { x: this.player.x, y: this.player.y, map: this.state.mapId } : null),
      onCafeRebuilt: (map) => {
        this.maps.set('cafe', map);
        this.refreshCafeExterior();
        // If we're standing in it, swap the live map too — otherwise we keep
        // walking around the version from before the rebuild and everything
        // just built appears to vanish.
        if (this.state.mapId === 'cafe') {
          this.currentMap = map;
          if (this.player) this.placeOn(map, this.player.tx, this.player.ty);
        }
        this.renderer.invalidateAll();
      },
    });

    this.safe = SAFE;   // measured control insets, handy when debugging layout
    this.boot();
  }

  // ------------------------------------------------------------------ boot

  boot() {
    this.tileset = new Tileset();
    this.renderer = new Renderer(this.tileset);
    this.cam = new Camera();

    const world = generateWorld(WORLD_SEED);
    this.overworld = world.map;
    this.towns = world.towns;
    this.doors = world.doors;
    this.landmarks = world.landmarks;

    this.maps = new Map();
    this.maps.set('overworld', this.overworld);

    // Doors on the overworld point at interiors we build on demand.
    this.doorByShop = new Map();
    for (const d of this.doors) this.doorByShop.set(d.shop, d);
    for (const l of this.landmarks) this.doorByShop.set(l.id, { shop: l.id, x: l.x, y: l.y, name: l.name });

    // The one building whose look the player controls.
    this.cafeBuilding = this.overworld.objects.find((o) => o.data && o.data.shop === 'cafe');

    this.placeVillagers();
    this.buildMinimap();

    this.state.worldW = WORLD_W;
    this.state.worldH = WORLD_H;

    // The player starts on the doorstep of their own cafe.
    const cafeDoor = this.doorByShop.get('cafe');
    this.homeDoor = cafeDoor || { x: this.towns.brambleford.hub.x, y: this.towns.brambleford.hub.y };
    this.player = new Player(this.homeDoor.x * TILE + TILE / 2, (this.homeDoor.y + 1) * TILE - 2, this.state.playerLook);

    this.titleScreen = new TitleScreen(this);
    this.screens.push(this.titleScreen);

    this.last = performance.now();
    requestAnimationFrame((ts) => this.frame(ts));

    // Audio can only start from a gesture.
    const bootEl = document.getElementById('boot');
    const start = () => {
      audio.init();
      audio.resume();
      audio.setTrack('cafe', true);
      bootEl?.classList.add('hidden');
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);

    this.setupFullscreenButton();
  }

  /**
   * A fullscreen button, but only where it can do something. iPhone Safari has
   * no Fullscreen API at all — there the answer is Add to Home Screen, so we
   * say so rather than offering a button that does nothing.
   */
  setupFullscreenButton() {
    const btn = document.getElementById('fsbtn');
    if (!btn) return;
    if (!isTouchDevice() || isStandalone()) return;      // desktop / already installed
    btn.hidden = false;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      this.requestFullscreen();
    });
  }

  requestFullscreen() {
    if (fullscreenSupported()) {
      toggleFullscreen();
      return true;
    }
    this.hud.toast('Add to Home Screen for fullscreen (Share menu).', 'info', 6);
    return false;
  }

  /** Scatter the cast: shopkeepers behind counters, villagers around their town. */
  placeVillagers() {
    this.villagers = [];
    const rng = this.rng;
    for (const def of VILLAGERS) {
      const isKeeper = SHOPS.some((s) => s.keeper === def.id);
      if (isKeeper) continue;                        // placed inside their shop
      let x, y;
      if (def.town && this.towns[def.town]) {
        const tw = this.towns[def.town];
        for (let tries = 0; tries < 200; tries++) {
          const tx = tw.rect.x + 2 + rng.int(tw.rect.w - 4);
          const ty = tw.rect.y + 2 + rng.int(tw.rect.h - 4);
          if (!this.overworld.solid(tx, ty)) { x = tx; y = ty; break; }
        }
      }
      if (x === undefined) {
        // Wanderers stand somewhere passable out in the country.
        for (let tries = 0; tries < 600; tries++) {
          const tx = 20 + rng.int(WORLD_W - 40);
          const ty = 20 + rng.int(WORLD_H - 40);
          const g = this.overworld.get(tx, ty);
          if (!this.overworld.solid(tx, ty) && (g === T.DIRT || g === T.GRASS || g === T.MEADOW || g === T.COBBLE)) {
            x = tx; y = ty; break;
          }
        }
      }
      if (x === undefined) continue;
      const v = new Villager(def, x * TILE + TILE / 2, (y + 1) * TILE - 2);
      v.mapId = 'overworld';
      this.villagers.push(v);
    }
  }

  /** A 1px-per-tile picture of the valley for the map screen. */
  buildMinimap() {
    const { canvas, g } = makeCanvas(WORLD_W, WORLD_H);
    const img = g.createImageData(WORLD_W, WORLD_H);
    const colorFor = (id) => {
      switch (id) {
        case T.WATER_DEEP: return [31, 77, 128];
        case T.WATER: return [74, 159, 212];
        case T.BRIDGE: return [140, 100, 60];
        case T.SAND: return [227, 207, 155];
        case T.DIRT: return [173, 127, 82];
        case T.COBBLE: return [156, 154, 163];
        case T.FOREST_FLOOR: return [45, 99, 41];
        case T.MEADOW: return [122, 196, 87];
        case T.STONE: return [143, 135, 122];
        case T.CLIFF: return [107, 100, 90];
        case T.CLIFF_TOP: return [216, 207, 187];
        case T.HEDGE: return [47, 107, 49];
        case T.FARM: return [111, 74, 44];
        default: return [93, 168, 69];
      }
    };
    for (let i = 0; i < WORLD_W * WORLD_H; i++) {
      const [r, gg, b] = colorFor(this.overworld.ground[i]);
      img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Mark the buildings so towns read as towns.
    g.fillStyle = '#3a2f42';
    for (const o of this.overworld.objects) {
      if (o.type === '_building') g.fillRect(o.tx, o.ty - 1, o.tw, 2);
    }
    this.minimap = canvas;
  }

  // ----------------------------------------------------------- new / load

  startNewGame(look, cafeStyle) {
    const st = this.state;
    st.playerLook = look;
    st.cafe.wall = cafeStyle.wall;
    st.cafe.roof = cafeStyle.roof;
    st.cafe.awning = cafeStyle.awning;
    st.cafe.floor = cafeStyle.floor;
    st.cafe.name = cafeStyle.name;
    st.rebuildCafe();
    this.maps.set('cafe', st.cafeMap);
    seedStartingInventory(st);
    this.player.look = look;
    this.enterOverworld();
    this.mode = 'play';
    st.visit('cafe', 'Your Cat Cafe', this.homeDoor.x, this.homeDoor.y, 'brambleford');
    st.visit('brambleford', 'Brambleford', this.towns.brambleford.hub.x, this.towns.brambleford.hub.y);
    this.hud.showLocation('Brambleford');
    this.dialogue.say(
      "So this is it. Your grandmother's old tea room, three cats, and whatever you can carry.\n\n" +
      "The valley's out there. Somewhere in it is everything you need to make this place work.\n\n" +
      "Best get started.",
      { speaker: 'Brambleford' },
    );
  }

  continueGame() {
    const st = this.state;
    if (!st.load()) {
      return this.startNewGame(st.playerLook, {
        wall: WALL_CHOICES[0], roof: ROOF_CHOICES[0], awning: AWNING_CHOICES[0],
        floor: T.FLOOR_WOOD, name: CAFE_NAMES[0],
      });
    }
    st.rebuildCafe();
    this.maps.set('cafe', st.cafeMap);
    this.player.look = st.playerLook;
    const p = st.savedPlayer;
    if (p && p.map === 'cafe') {
      this.state.mapId = 'cafe';
      this.state.inCafe = true;
      this.player.x = p.x; this.player.y = p.y;
      this.currentMap = st.cafeMap;
    } else {
      this.enterOverworld();
      if (p) { this.player.x = p.x; this.player.y = p.y; }
    }
    this.mode = 'play';
    this.cam.follow(this.currentMap, this.player.x, this.player.y, true);
    this.hud.toast('Welcome back.', 'good');
  }

  enterOverworld() {
    this.state.mapId = 'overworld';
    this.state.inCafe = false;
    this.currentMap = this.overworld;
    this.cam.follow(this.overworld, this.player.x, this.player.y, true);
  }

  // ------------------------------------------------------------- screens

  push(s) { this.screens.push(s); }
  get topScreen() { return this.screens[this.screens.length - 1]; }

  openBuildMode() {
    this.push(new BuildScreen(this));
  }

  save() {
    if (this.state.save()) this.hud.toast('Saved.', 'good');
    else this.hud.toast('Could not save.', 'bad');
    audio.sfx('ui_ok');
  }

  // ---------------------------------------------------------------- loop

  frame(ts) {
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    this.t += dt;
    try {
      this.update(dt);
      this.draw();
    } catch (err) {
      console.error(err);
      this.crash = err;
      this.drawCrash(err);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    const st = this.state;
    this.fader.update(dt);
    this.renderer.update(dt);

    // Screens sit on top of everything.
    if (this.screens.length) {
      const s = this.topScreen;
      s.update(dt, this.input, this);
      // Remove *this* screen, not whatever is on top: a screen may push another
      // one during its own update (the builder's yard opens build mode), and
      // popping blindly would throw away the screen it just opened.
      if (s.done) {
        const i = this.screens.indexOf(s);
        if (i >= 0) this.screens.splice(i, 1);
      }
      this.hud.update(dt, st);
      this.input.endFrame();
      audio.update(dt, { night: st.clock.lighting().night });
      return;
    }

    if (this.mode !== 'play') { this.input.endFrame(); return; }

    // Dialogue pauses the world but not the clock.
    const talking = this.dialogue.active;
    if (talking) this.dialogue.update(dt, this.input);

    // A cutscene takes the controls but leaves the world running.
    if (this.cutscene) {
      this.cutscene.update(dt);
      if (this.cutscene.done) this.cutscene = null;
    }

    st.clock.update(dt);
    if (st.clock.newDay) this.onNewDay();

    const map = this.currentMap;

    if (!talking && !this.cutscene) {
      this.player.update(dt, this.input, map, !this.fader.busy);
      this.checkWarp();
      if (this.input.hit('use')) this.interact();
      if (this.input.hit('menu')) { this.push(new PauseScreen(this)); audio.sfx('ui_ok', { gain: 0.5 }); }
      if (this.input.hit('cafe')) { this.push(new CafeScreen(this)); audio.sfx('ui_ok', { gain: 0.5 }); }
      if (this.input.hit('map')) { this.push(new MapScreen(this)); audio.sfx('ui_ok', { gain: 0.5 }); }
      if (this.input.hit('inventory')) { this.push(new BagScreen(this)); audio.sfx('ui_ok', { gain: 0.5 }); }
    }

    this.updateActors(dt);
    st.cafeSim.update(dt, this.ambienceCtx || (this.ambienceCtx = {}));
    this.updateAudio(dt);
    this.hud.update(dt, st);
    this.cam.follow(map, this.player.x, this.player.y - 6);
    this.input.endFrame();
  }

  updateActors(dt) {
    const st = this.state;
    const map = this.currentMap;

    if (st.mapId === 'overworld') {
      // Only bother with villagers near the camera.
      const cx = this.player.x, cy = this.player.y;
      for (const v of this.villagers) {
        if (Math.abs(v.x - cx) > 400 || Math.abs(v.y - cy) > 320) continue;
        v.update(dt, map);
      }
    } else if (map.villagers) {
      for (const v of map.villagers) v.update(dt, map);
    }

    if (st.inCafe) {
      const joy = st.cafe.furniture.filter((f) => ['catTower', 'catBed', 'scratchPost', 'toyBall', 'toyYarn', 'toyWand'].includes(f.type)).length;
      for (const cat of st.catActors) {
        const pan = clamp((cat.x - this.cam.x - VIEW_W / 2) / (VIEW_W / 2), -1, 1);
        cat.update(dt, map, { joy, pan });
      }
    }
  }

  updateAudio(dt) {
    const st = this.state;
    const map = this.currentMap;
    const light = st.clock.lighting();

    const track = st.clock.trackFor(map.music);
    audio.setTrack(track);

    // Ambience follows the terrain right around you.
    if (st.mapId === 'overworld') {
      this._ambT = (this._ambT || 0) - dt;
      if (this._ambT <= 0) {
        this._ambT = 0.8;
        const tx = this.player.tx, ty = this.player.ty;
        const total = 13 * 13;
        const water = map.countNear(tx, ty, (id) => id === T.WATER || id === T.WATER_DEEP, 6) / total;
        const forest = map.countNear(tx, ty, (id) => id === T.FOREST_FLOOR, 6) / total;
        const sand = map.countNear(tx, ty, (id) => id === T.SAND, 6) / total;
        const nearOcean = tx < 90 && ty > 180;
        audio.setAmbience({
          water: nearOcean ? 0 : clamp(water * 2.6, 0, 1),
          waves: nearOcean ? clamp((water + sand) * 2.2, 0, 1) : 0,
          forest: clamp(forest * 2.2, 0, 1),
          wind: clamp(0.3 + (1 - forest) * 0.25, 0, 1),
        });
      }
    } else {
      const chatter = st.inCafe ? clamp(st.cafeSim.customers.length / 6, 0, 1) : 0;
      audio.setAmbience({ indoor: 0.45, chatter });
    }
    audio.update(dt, { night: light.night });
  }

  // ------------------------------------------------------------ day roll

  onNewDay(opts = {}) {
    const st = this.state;
    const summary = st.endOfDay();
    summary.slept = !!opts.slept;
    this.push(new SummaryScreen(this, summary));
    // The flea market gets a fresh pile of junk each weekend.
    if (st.clock.isWeekend) this.fleaStock = null;
    audio.sfx('mail', { gain: 0.5 });
  }

  // ---------------------------------------------------------- interaction

  checkWarp() {
    if (this.fader.busy) return;
    const map = this.currentMap;
    const wp = map.warpAt(this.player.tx, this.player.ty);
    if (!wp) return;
    if (wp.to === 'overworld') this.leaveInterior();
  }

  leaveInterior() {
    const back = this.returnPoint || { x: this.homeDoor.x, y: this.homeDoor.y };
    audio.sfx('door', { gain: 0.6 });
    this.fader.out(() => {
      this.state.mapId = 'overworld';
      this.state.inCafe = false;
      this.currentMap = this.overworld;
      this.placeOn(this.overworld, back.x, back.y);
      this.player.dir = 'down';
      this.cam.follow(this.overworld, this.player.x, this.player.y, true);
      this.renderer.invalidateAll();
    });
  }

  /**
   * Stand the player on a tile, stepping to the nearest clear one if that tile
   * turns out to be blocked. Nothing should ever strand you inside a wall.
   */
  placeOn(map, tx, ty) {
    const set = (x, y) => {
      this.player.x = x * TILE + TILE / 2;
      this.player.y = (y + 1) * TILE - 2;
    };
    set(tx, ty);
    if (canStand(map, this.player.x, this.player.y)) return;
    // Search outward, preferring straight down — you've just come out of a door.
    for (let r = 1; r <= 4; r++) {
      for (const [dx, dy] of [[0, r], [0, -r], [r, 0], [-r, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
        const nx = tx + dx, ny = ty + dy;
        if (!map.inBounds(nx, ny)) continue;
        set(nx, ny);
        if (canStand(map, this.player.x, this.player.y)) return;
      }
    }
    set(tx, ty);
  }

  enterInterior(mapId, map, fromX, fromY) {
    this.returnPoint = { x: fromX, y: fromY };
    audio.sfx('door', { gain: 0.7 });
    this.fader.out(() => {
      this.state.mapId = mapId;
      this.state.inCafe = mapId === 'cafe';
      this.currentMap = map;
      this.placeOn(map, map.spawn.x, map.spawn.y);
      this.player.dir = 'up';
      this.cam.follow(map, this.player.x, this.player.y, true);
      this.renderer.invalidateAll();
      this.hud.showLocation(map.name);
      if (mapId === 'cafe') this.nudgeFurniture();
    });
  }

  /**
   * Re-skin the cafe on the overworld with the colours the player chose.
   * Buildings are y-sorted sprites rather than baked into the ground chunks,
   * so swapping the image is all it takes.
   */
  /**
   * The taxi bird: it comes down for you, carries you off, and the fade only
   * happens once you're airborne. On the far side it lowers you back down.
   */
  flyTaxi(place) {
    const st = this.state;
    this.cutscene = new TaxiFlight('pickup', this.player, {
      onDone: () => {
        this.fader.out(() => {
          if (st.mapId !== 'overworld') this.enterOverworld();
          this.placeOn(this.overworld, place.x, place.y + 1);
          this.cam.follow(this.overworld, this.player.x, this.player.y, true);
          this.hud.showLocation(place.name);
          st.clock.t += 60 * 6;                       // the flight takes a while
          this.cutscene = new TaxiFlight('dropoff', this.player, {});
        });
      },
    });
  }

  refreshCafeExterior() {
    const o = this.cafeBuilding;
    if (!o || !o.cfg) return;
    const c = this.state.cafe;
    o.cfg = {
      ...o.cfg,
      wall: c.wall || o.cfg.wall,
      roof: c.roof || o.cfg.roof,
      awning: c.awning || o.cfg.awning,
    };
    o.sprite = buildingSprite(o.cfg);
    o.w = o.sprite.width;
    o.h = o.sprite.height;
  }

  /** Point out, once, that unplaced furniture is arranged from the cafe book. */
  nudgeFurniture() {
    const st = this.state;
    if (st.flags.nudged_furniture) return;
    const any = Object.keys(st.inventory).some((k) => ITEMS[baseId(k)]?.place && st.inventory[k] > 0);
    if (!any) return;
    st.flags.nudged_furniture = true;
    this.hud.toast('Furniture in your bag — press C, then Space, to place it.', 'good', 7);
  }

  interact() {
    const st = this.state;
    const map = this.currentMap;
    const f = this.player.facingTile();

    // Serving a waiting customer takes priority — it's time-sensitive.
    if (st.inCafe && st.cafeSim.serveNearest(this.player.x, this.player.y)) {
      audio.sfx('ui_ok', { gain: 0.5 });
      return;
    }

    // Someone to talk to?
    const list = st.mapId === 'overworld' ? this.villagers : (map.villagers || []);
    let best = null, bestD = 26;
    for (const v of list) {
      const d = Math.hypot(v.x - this.player.x, v.y - this.player.y);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (best) { this.talkTo(best); return; }

    // Then whatever tile we're facing, or the one we're standing on. Pass the
    // tile the trigger was actually found on — doors record it as the spot to
    // put you back on when you come out, and the facing tile is the wall.
    let tile = f;
    let it = map.interactAt(f.x, f.y);
    if (!it) {
      tile = { x: this.player.tx, y: this.player.ty };
      it = map.interactAt(tile.x, tile.y);
    }
    if (it) { this.handleInteract(it, tile); return; }

    // Cats respond to being greeted.
    if (st.inCafe) {
      let near = null, nearD = 24;
      for (const cat of st.catActors) {
        const d = Math.hypot(cat.x - this.player.x, cat.y - this.player.y);
        if (d < nearD) { nearD = d; near = cat; }
      }
      if (near) { this.greetCat(near); return; }
    }
  }

  /** Walk up to a cat and you get offered whatever you're carrying for them. */
  greetCat(cat) {
    const st = this.state;
    const choices = [];
    if (st.has('treats')) choices.push({ label: `Give a treat (${st.inventory.treats})`, value: 'treat' });
    if (cat.sick && st.has('medicine')) choices.push({ label: 'Give medicine', value: 'medicine' });
    if (st.has('brush') && cat.groomed <= 0) choices.push({ label: 'Brush them', value: 'brush' });
    if (st.has('catnip')) choices.push({ label: 'Sprinkle catnip', value: 'catnip' });
    choices.push({ label: 'Just say hello', value: 'hello' });

    const opener = `${cat.name} the ${cat.breedName} winds around your ankles.\n\n${catMood(cat)}`;
    // One option isn't a choice; skip the menu and just say hello.
    if (choices.length === 1) {
      this.useOnCat(cat, 'hello');
      this.dialogue.say(opener, { speaker: cat.name });
      return;
    }
    this.dialogue.say(opener, {
      speaker: cat.name,
      choices,
      onDone: (what) => this.useOnCat(cat, what),
    });
  }

  useOnCat(cat, what) {
    const st = this.state;
    switch (what) {
      case 'treat': {
        if (!st.take('treats')) return;
        cat.happiness = clamp(cat.happiness + 0.2, 0, 1);
        cat.showEmote('heart', 2.2);
        audio.sfx('eat', { gain: 0.9 });
        setTimeout(() => audio.sfx('purr', { gain: 0.6 }), 420);
        this.hud.toast(`${cat.name} accepts the treat as their due.`, 'good');
        break;
      }
      case 'medicine': {
        // The label on the jar is honest: it only helps if you catch it early.
        if (cat.sickDays > 2) {
          audio.sfx('error');
          this.hud.toast(`${cat.name} is too far gone for that. See Dr. Bramble.`, 'bad');
          break;
        }
        if (!st.take('medicine')) return;
        cat.sick = false;
        cat.sickDays = 0;
        cat.happiness = clamp(cat.happiness + 0.25, 0, 1);
        cat.showEmote('happy', 2.2);
        audio.sfx('levelup', { gain: 0.6 });
        this.hud.toast(`${cat.name} is on the mend.`, 'good');
        break;
      }
      case 'brush': {
        cat.groomed = Math.max(cat.groomed, 3);
        cat.happiness = clamp(cat.happiness + 0.1, 0, 1);
        cat.showEmote('happy', 2);
        audio.sfx('brush', { gain: 0.9 });
        this.hud.toast(`You brush ${cat.name}. Not a professional job, but nice.`, 'good');
        break;
      }
      case 'catnip': {
        if (!st.take('catnip')) return;
        for (const c of st.cats) c.happiness = clamp(c.happiness + 0.15, 0, 1);
        for (const c of st.catActors) {
          c.showEmote('music', 3.5);
          c.state = 'idle';
          c.pose = 'play';
          c.stateT = 8 + Math.random() * 8;
        }
        audio.sfx('meow_happy', { gain: 0.85 });
        this.hud.toast('Chaos. Delightful, unproductive chaos.', 'good');
        break;
      }
      default: {
        cat.happiness = clamp(cat.happiness + 0.03, 0, 1);
        cat.showEmote(cat.happiness > 0.6 ? 'heart' : 'talk', 1.6);
        audio.sfx(cat.happiness > 0.7 ? 'purr' : 'meow_happy', { gain: 0.7 });
        break;
      }
    }
  }

  handleInteract(it, tile) {
    const st = this.state;
    switch (it.kind) {
      case 'sign':
        audio.sfx('ui_ok', { gain: 0.4 });
        this.dialogue.say(it.text);
        break;

      case 'door':
        this.openDoor(it, tile);
        break;

      case 'shopkeeper':
        this.openShopCounter(it.shop);
        break;

      case 'barrier':
        this.tryBarrier(it);
        break;

      case 'postbox':
        this.openPostbox();
        break;

      case 'taxi':
        this.openTaxi(it.town);
        break;

      default:
        break;
    }
  }

  openDoor(it, tile) {
    const st = this.state;
    const shopId = it.shop;
    if (shopId === 'cafe') {
      this.enterInterior('cafe', st.cafeMap, tile.x, tile.y);
      st.visit('cafe', 'Your Cat Cafe', tile.x, tile.y, 'brambleford');
      return;
    }
    const shop = SHOPS.find((s) => s.id === shopId);
    if (shop && !shopOpen(shop, st.clock)) {
      audio.sfx('blocked', { gain: 0.6 });
      this.dialogue.say(`${shop.name} is shut.\n\nOpening hours: ${hoursText(shop)}`, { speaker: 'A sign on the door' });
      return;
    }
    let map = this.maps.get(`shop:${shopId}`);
    if (!map) {
      map = shop ? buildShopInterior(shopId) : buildSpecialInterior(shopId);
      if (!map) { this.dialogue.say('The door is locked.'); return; }
      // Put the shopkeeper behind the counter.
      const keeperId = shop?.keeper;
      const def = VILLAGERS.find((v) => v.id === keeperId);
      map.villagers = [];
      if (def && map.meta.keeperSpot) {
        const v = new Villager(def, map.meta.keeperSpot.x * TILE + TILE / 2, (map.meta.keeperSpot.y + 1) * TILE - 2);
        v.range = 10;
        v.speed = 12;
        map.villagers.push(v);
      }
      this.maps.set(`shop:${shopId}`, map);
    }
    this.enterInterior(`shop:${shopId}`, map, tile.x, tile.y);
    const place = shop || this.landmarks.find((l) => l.id === shopId);
    if (place) st.visit(shopId, place.name, tile.x, tile.y, shop ? shop.town : null);
    if (shop) {
      const town = TOWNS.find((t) => t.id === shop.town);
      if (town) st.visit(town.id, town.name, this.towns[town.id].hub.x, this.towns[town.id].hub.y);
    }
  }

  openShopCounter(shopId) {
    const st = this.state;
    const shop = SHOPS.find((s) => s.id === shopId);
    if (!shop) return;
    const greet = shop.greet || 'Have a look round.';

    const openScreen = () => {
      switch (shop.kind) {
        case 'cats': {
          const breeds = shopId === 'exotic'
            ? CAT_BREED_LIST.filter((b) => CAT_BREEDS[b].rare)
            : CAT_BREED_LIST.filter((b) => !CAT_BREEDS[b].rare);
          this.push(new CatShopScreen(this, shop, breeds));
          break;
        }
        case 'groomer': this.push(new ServiceScreen(this, 'groom', shop)); break;
        case 'vet': this.push(new ServiceScreen(this, 'vet', shop)); break;
        case 'builder': this.push(new BuilderScreen(this)); break;
        case 'inn': this.restAtInn(); break;
        case 'flea': {
          if (!this.fleaStock) {
            const rng = makeRng(WORLD_SEED + st.clock.day * 977);
            this.fleaStock = rng.shuffle(FLEA_POOL.slice()).slice(0, 6);
          }
          this.push(new ShopScreen(this, shop, this.fleaStock, { priceMult: 0.55, title: `${shop.name} (half price!)` }));
          break;
        }
        default: {
          const ids = STOCK[shop.stock] || [];
          this.push(new ShopScreen(this, shop, ids));
          break;
        }
      }
    };

    this.dialogue.say(greet, { speaker: shopKeeperName(shop), onDone: openScreen });
  }

  restAtInn() {
    const st = this.state;
    this.dialogue.say('Sleep until morning?', {
      speaker: 'Hollis',
      choices: [{ label: 'Yes please', value: true }, { label: 'Not yet', value: false }],
      onDone: (yes) => {
        if (!yes) return;
        // Walk to the foot of the stairs and climb out of sight before the
        // screen fades — the trip upstairs is half the charm of an inn.
        const map = this.currentMap;
        const stairs = map.meta && map.meta.stairs
          ? map.meta.stairs
          : { x: this.player.tx, y: this.player.ty - 2 };
        this.cutscene = new StairWalk(this.player, stairs, () => {
          this.fader.out(() => {
            st.clock.skipTo(7);
            this.player.alpha = 1;
            this.onNewDay({ slept: true });
            this.hud.toast('You slept like a log.', 'good');
          });
        });
      },
    });
  }

  tryBarrier(it) {
    const st = this.state;
    if (st.flags[`barrier_${it.barrier}`]) return;
    const toolName = { pickaxe: 'pickaxe', shears: 'shears', rope: 'rope' }[it.need];
    const toolItem = { pickaxe: 'pickaxe', shears: 'shears', rope: 'rope' }[it.need];
    if (!st.has(toolItem)) {
      audio.sfx('blocked', { gain: 0.7 });
      this.dialogue.say(it.text);
      return;
    }
    audio.sfx(it.need === 'shears' ? 'bush' : 'hammer', { gain: 0.9 });
    setTimeout(() => audio.sfx(it.need === 'shears' ? 'bush' : 'hammer', { gain: 0.8 }), 220);
    st.flags[`barrier_${it.barrier}`] = true;
    // Clear the obstacles nearby.
    const doomed = this.overworld.objects.filter((o) => o.id === it.barrier);
    for (const o of doomed) this.overworld.removeObject(o);
    this.renderer.invalidateAll();
    this.dialogue.say(`You clear the way with the ${toolName}.\n\nThe path is open.`);
    this.checkQuestProgress();
  }

  openPostbox() {
    const st = this.state;
    const unread = st.mail.length;
    if (unread) {
      const letter = st.mail.shift();
      audio.sfx('mail', { gain: 0.8 });
      this.dialogue.say(letter.text, { speaker: `Letter from ${letter.from}`, item: 'letter' });
      if (letter.gift) { st.give(letter.gift[0], letter.gift[1]); this.hud.toast(`Enclosed: ${ITEMS[letter.gift[0]].name} x${letter.gift[1]}`, 'good'); }
      return;
    }
    const friends = Object.keys(st.friends).filter((f) => st.friends[f] > 0);
    if (!friends.length) {
      this.dialogue.say('A red postbox with a little perch on top.\n\nNo letters for you today. You have nobody to write to yet, either — make some friends first.');
      return;
    }
    this.dialogue.say('Send a note to one of your friends?', {
      choices: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
      onDone: (yes) => {
        if (!yes) return;
        const to = friends[Math.floor(Math.random() * friends.length)];
        const name = st.villagerName(to);
        st.friends[to] = clamp((st.friends[to] || 0) + 0.15, 0, 1);
        audio.sfx('wing', { gain: 0.7 });
        // They'll write back in a day or two, sometimes with something in the envelope.
        st.pendingLetters.push({
          from: name,
          day: st.clock.day + 1 + Math.floor(Math.random() * 2),
          text: replyText(name),
          gift: Math.random() < 0.55 ? [['treats', 2], ['honey', 1], ['wildflowers', 1], ['toy_yarn', 1]][Math.floor(Math.random() * 4)] : null,
        });
        this.dialogue.say(`A mail bird takes the note, gives you a look that says "this had better be worth the trip", and flaps off towards ${name}.`);
      },
    });
  }

  openTaxi(town) {
    const st = this.state;
    const h = st.clock.hourFloat;
    if (h < 7 || h >= 19) {
      this.dialogue.say('The perch is empty.\n\nA hand-painted board reads: TAXI BIRDS FLY 7am - 7pm. WE ARE BIRDS. WE SLEEP.');
      return;
    }
    const places = st.knownPlaces();
    if (places.length < 2) {
      this.dialogue.say('A taxi bird preens on the perch.\n\n"Not much point flying you somewhere you already are. Go and find a few places first."', { speaker: 'Taxi bird' });
      return;
    }
    this.dialogue.say('"Where to? Anywhere you\'ve been before. Cash up front."', {
      speaker: 'Taxi bird',
      onDone: () => {
        this.push(new MapScreen(this, {
          pick: true,
          onPick: (p) => {
            const fare = st.taxiFare(p);
            if (st.money < fare) { this.hud.toast("You can't afford the fare.", 'bad'); audio.sfx('error'); return; }
            st.money -= fare;
            this.flyTaxi(p);
          },
        }));
      },
    });
  }

  // ------------------------------------------------------------- dialogue

  talkTo(v) {
    const st = this.state;
    const def = v.def;
    v.talking = true;
    v.faceTowards(this.player.x, this.player.y);
    const finish = () => { v.talking = false; };

    // 1. Delivering something to this person?
    for (const q of QUESTS) {
      if (st.quests[q.id] !== 'active') continue;
      if (q.objective.type === 'deliver' && q.objective.to === def.id && st.has(q.objective.item)) {
        st.take(q.objective.item);
        this.completeQuest(q, v, finish);
        return;
      }
    }

    // 2. Turning in a finished job to whoever set it.
    const mine = QUESTS_BY_GIVER[def.id] || [];
    for (const q of mine) {
      if (st.quests[q.id] === 'active' && q.objective.type !== 'deliver' && objectiveMet(q, st)) {
        this.completeQuest(q, v, finish);
        return;
      }
    }

    // 3. Offering a new job.
    for (const q of mine) {
      if (st.quests[q.id]) continue;
      if (!this.questAvailable(q)) continue;
      this.dialogue.say(q.offer, {
        speaker: def.name,
        onDone: () => {
          finish();
          st.quests[q.id] = 'active';
          // Deliver-type errands hand you the parcel there and then.
          if (q.objective.type === 'deliver') st.give(q.objective.item, 1);
          audio.sfx('quest', { gain: 0.7 });
          this.hud.toast(`New in your journal: ${q.title}`, 'good');
          this.refreshQuestMarks();
        },
      });
      v.hasQuestMark = false;
      return;
    }

    // 4. Nudge on a job in progress.
    for (const q of mine) {
      if (st.quests[q.id] === 'active') {
        this.dialogue.say(q.progress, { speaker: def.name, onDone: finish });
        return;
      }
    }

    // 5. Ordinary chatter, with the odd hint or piece of gossip.
    let line;
    const roll = Math.random();
    const heardHint = st.flags[`heard_hint_${def.id}`];
    if (def.hint && !heardHint && v.lineIndex >= 1) {
      // Anyone with something genuinely useful to say gets it out by the second
      // conversation, rather than hiding it behind an invisible friendship roll.
      line = def.hint;
      st.flags[`heard_hint_${def.id}`] = true;
    } else if (def.hint && roll < 0.2) line = def.hint;
    else if (roll < 0.16) line = GOSSIP[Math.floor(Math.random() * GOSSIP.length)];
    else {
      line = def.lines[v.lineIndex % def.lines.length];
      v.lineIndex++;
    }
    st.friends[def.id] = clamp((st.friends[def.id] || 0) + 0.02, 0, 1);
    v.showEmote('talk', 1.2);
    this.dialogue.say(line, { speaker: def.name, onDone: finish });
  }

  questAvailable(q) {
    const st = this.state;
    // Gate a couple of the bigger jobs behind a little progress.
    if (q.id === 'busy_day' && st.reputation < 0.3) return false;
    if (q.id === 'first_extension' && st.workers < 1 && st.money < 400) return false;
    if (q.id === 'rare_cat' && st.cats.length < 2) return false;
    if (q.id === 'music_night' && st.reputation < 0.25) return false;
    return true;
  }

  completeQuest(q, v, finish) {
    const st = this.state;
    st.quests[q.id] = 'done';
    const r = q.reward || {};
    if (r.money) st.money += r.money;
    if (r.items) for (const [id, n] of r.items) st.give(id, n);
    if (r.flags) for (const f of r.flags) st.flags[f] = true;
    if (r.rep) st.reputation = clamp(st.reputation + r.rep, 0, 1);
    if (r.friendship) for (const f of r.friendship) st.friends[f] = clamp((st.friends[f] || 0) + 0.4, 0, 1);
    if (r.hint) st.flags[`hint_${r.hint}`] = true;
    audio.sfx('fanfare', { gain: 0.7 });
    const rewardLine = r.money ? `\n\n(+${money(r.money)})` : '';
    this.dialogue.say(q.complete + rewardLine, {
      speaker: v.def.name,
      onDone: () => { finish(); this.refreshQuestMarks(); },
    });
    this.hud.toast(`Finished: ${q.title}`, 'good');
    if (q.reward?.hint === 'taxi') this.hud.toast('Taxi birds unlocked — look for the perches.', 'good');
  }

  /** Put a ! over anyone who has something for you. */
  refreshQuestMarks() {
    const st = this.state;
    for (const v of this.villagers) {
      const mine = QUESTS_BY_GIVER[v.def.id] || [];
      v.hasQuestMark = mine.some((q) => (!st.quests[q.id] && this.questAvailable(q))
        || (st.quests[q.id] === 'active' && q.objective.type !== 'deliver' && objectiveMet(q, st)));
    }
    for (const [, map] of this.maps) {
      if (!map.villagers) continue;
      for (const v of map.villagers) {
        const mine = QUESTS_BY_GIVER[v.def.id] || [];
        v.hasQuestMark = mine.some((q) => (!st.quests[q.id] && this.questAvailable(q))
          || (st.quests[q.id] === 'active' && q.objective.type !== 'deliver' && objectiveMet(q, st)));
      }
    }
  }

  checkQuestProgress() { this.refreshQuestMarks(); }

  // ------------------------------------------------------------------ draw

  draw() {
    const ctx = this.ctx;
    const st = this.state;

    if (this.mode === 'title' || !this.currentMap) {
      if (this.screens.length) {
        for (const s of this.screens) s.draw(ctx, this, this.t);
      }
      this.fader.draw(ctx);
      return;
    }

    const map = this.currentMap;
    const light = st.clock.lighting();
    const lights = map.outdoor && !st.clock.isDark ? [] : map.lights;

    // Everything that needs y-sorting into one list.
    const cut = this.cutscene;
    const actors = cut && cut.playerHidden ? [] : [this.player];
    if (cut && cut.playerAlpha !== undefined) this.player.alpha = cut.playerAlpha;
    else this.player.alpha = 1;
    if (st.mapId === 'overworld') {
      const cx = this.player.x, cy = this.player.y;
      for (const v of this.villagers) {
        if (Math.abs(v.x - cx) > 340 || Math.abs(v.y - cy) > 260) continue;
        actors.push(v);
      }
    } else if (map.villagers) {
      for (const v of map.villagers) actors.push(v);
    }
    if (st.inCafe) {
      for (const c of st.catActors) actors.push(c);
      for (const c of st.cafeSim.customers) actors.push(c);
    }

    this.renderer.draw(ctx, map, this.cam, actors, { night: light.night, tint: light.tint, lights });
    if (this.cutscene) this.cutscene.draw(ctx, this.cam.ox, this.cam.oy);

    this.hud.drawFloats(ctx, this.cam.ox, this.cam.oy);
    this.drawInteractPrompt(ctx);
    this.hud.draw(ctx, st, this.t);
    this.dialogue.draw(ctx, this.t);

    for (const s of this.screens) s.draw(ctx, this, this.t);
    this.fader.draw(ctx);
  }

  /** A small floating prompt when something is within reach. */
  drawInteractPrompt(ctx) {
    if (this.dialogue.active || this.screens.length) return;
    const st = this.state;
    const map = this.currentMap;
    const f = this.player.facingTile();
    let label = null;

    if (st.inCafe) {
      for (const c of st.cafeSim.customers) {
        if (c.state === 'waiting' && !c.served && Math.hypot(c.x - this.player.x, c.y - this.player.y) < 34) {
          label = `Serve ${ITEMS[c.order]?.name || 'them'}`;
          break;
        }
      }
    }
    if (!label) {
      const list = st.mapId === 'overworld' ? this.villagers : (map.villagers || []);
      for (const v of list) {
        if (Math.hypot(v.x - this.player.x, v.y - this.player.y) < 26) { label = `Talk to ${v.def.name}`; break; }
      }
    }
    if (!label) {
      const it = map.interactAt(f.x, f.y) || map.interactAt(this.player.tx, this.player.ty);
      if (it) {
        label = it.kind === 'door' ? `Enter ${it.name || 'building'}`
          : it.kind === 'sign' ? 'Read'
            : it.kind === 'shopkeeper' ? 'Talk to the shopkeeper'
              : it.kind === 'postbox' ? 'Postbox'
                : it.kind === 'taxi' ? 'Call a taxi bird'
                  : it.kind === 'barrier' ? 'Examine' : null;
      }
    }
    if (!label) return;
    // Name the key the player actually presses. A lettered gamepad-style badge
    // would collide with WASD, where A already means "walk left".
    const KEY = 'SPACE';
    const kw = textWidth(KEY) + 8;
    const w = kw + textWidth(label) + 20;
    // Centre it between the thumb pads, not in the middle of the screen.
    const x = Math.round(safeCenterX(VIEW_W) - w / 2);
    const y = VIEW_H - 42;
    ctx.fillStyle = 'rgba(20,17,32,0.86)';
    ctx.fillRect(x, y, w, 17);
    ctx.fillStyle = P.uiGoldDk;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + 16, w, 1);
    // Little keycap.
    ctx.fillStyle = P.uiBg2;
    ctx.fillRect(x + 5, y + 3, kw, 11);
    ctx.fillStyle = P.uiGoldDk;
    ctx.fillRect(x + 5, y + 3, kw, 1);
    ctx.fillRect(x + 5, y + 13, kw, 1);
    ctx.fillRect(x + 5, y + 3, 1, 11);
    ctx.fillRect(x + 4 + kw, y + 3, 1, 11);
    drawText(ctx, KEY, x + 9, y + 5, { color: P.uiGold, shadow: P.uiShadow });
    drawText(ctx, label, x + kw + 12, y + 5, { color: P.uiText, shadow: P.uiShadow });
  }

  drawCrash(err) {
    const ctx = this.ctx;
    ctx.fillStyle = '#1a0f14';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawText(ctx, 'Something went wrong:', 10, 10, { color: '#e8615c' });
    const msg = String(err && err.message ? err.message : err);
    drawText(ctx, msg.slice(0, 66), 10, 26, { color: '#fdf6e6' });
    drawText(ctx, 'Check the browser console for details.', 10, 46, { color: '#b3a894' });
  }
}

function shopKeeperName(shop) {
  const v = VILLAGERS.find((x) => x.id === shop.keeper);
  return v ? v.name : 'Shopkeeper';
}

function catMood(cat) {
  if (cat.sick) return 'They feel warm, and they sneeze. Small and miserable. The vet, then.';
  if (cat.happiness > 0.85) return 'Purring like a kettle.';
  if (cat.happiness > 0.6) return 'Content. Mildly.';
  if (cat.happiness > 0.35) return 'They want something. You are not sure what. Neither are they.';
  return 'Unimpressed. Possibly hungry. Definitely judging you.';
}

function replyText(name) {
  const lines = [
    `Lovely to hear from you. The weather has been doing that thing again.\n\nCome by when you can. Bring a cat.\n\n— ${name}`,
    `Your handwriting is terrible and I mean that fondly.\n\nEverything is much the same here. Enclosed: a small something.\n\n— ${name}`,
    `I read your note twice. Once for content, once for the pleasure of it.\n\nThe cafe sounds like it's coming along.\n\n— ${name}`,
    `Thank you for writing. Nobody writes.\n\nDo it again soon.\n\n— ${name}`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

// ---------------------------------------------------------------------------
// Title & character creation
// ---------------------------------------------------------------------------

const ROOF_CHOICES = ['#c86a4a', '#5a6472', '#d0a659', '#b2624b', '#6b7d54'];
const WALL_CHOICES = ['#efe2c8', '#e6dcc2', '#dfe6e8', '#f0e4cc', '#f2e0e0'];
// The awning is the boldest thing on the shopfront, so it's the choice that
// actually shows from across the lane.
const AWNING_CHOICES = ['#c05a7a', '#5b8fd6', '#7fbe57', '#eec453', '#8a72d6', '#e0894a', '#6b9e8f', '#d95f5f'];
const CAFE_NAMES = ['The Contented Cat', 'Paws & Provisions', 'The Warm Windowsill', 'Bramble & Whisker', 'The Sleepy Saucer'];

class TitleScreen extends Screen {
  constructor(game) {
    super();
    this.game = game;
    this.stage = 'title';
    this.index = 0;
    this.options = GameState.hasSave() ? ['Continue', 'New game'] : ['New game'];
    this.look = { species: 'cat', coat: 'ginger', cloth: CLOTHES[5] };
    this.style = {
      wall: WALL_CHOICES[0], roof: ROOF_CHOICES[0], awning: AWNING_CHOICES[0],
      floor: T.FLOOR_WOOD, name: CAFE_NAMES[0],
    };
    this.row = 0;
  }

  update(dt, input) {
    this.t += dt;
    if (this.stage === 'title') {
      if (input.repeat('up', dt)) { this.index = (this.index - 1 + this.options.length) % this.options.length; audio.sfx('ui_move'); }
      if (input.repeat('down', dt)) { this.index = (this.index + 1) % this.options.length; audio.sfx('ui_move'); }
      if (input.hit('use')) {
        audio.sfx('ui_ok');
        if (this.options[this.index] === 'Continue') { this.done = true; this.game.continueGame(); }
        else this.stage = 'create';
      }
      return;
    }

    // Character & cafe creation.
    const rows = 5;
    if (input.repeat('up', dt)) { this.row = (this.row - 1 + rows) % rows; audio.sfx('ui_move'); }
    if (input.repeat('down', dt)) { this.row = (this.row + 1) % rows; audio.sfx('ui_move'); }
    const dir = input.repeat('right', dt) ? 1 : input.repeat('left', dt) ? -1 : 0;
    if (dir) {
      audio.sfx('ui_move');
      const step = (arr, cur) => arr[(arr.indexOf(cur) + dir + arr.length) % arr.length];
      if (this.row === 0) this.look.coat = step(COAT_LIST, this.look.coat);
      else if (this.row === 1) this.look.cloth = step(CLOTHES, this.look.cloth);
      else if (this.row === 2) this.style.roof = step(ROOF_CHOICES, this.style.roof);
      else if (this.row === 3) this.style.awning = step(AWNING_CHOICES, this.style.awning);
      else this.style.name = step(CAFE_NAMES, this.style.name);
    }
    if (input.hit('use')) {
      audio.sfx('levelup', { gain: 0.6 });
      this.done = true;
      this.game.startNewGame({ ...this.look }, { ...this.style });
    }
    if (input.hit('cancel')) { this.stage = 'title'; audio.sfx('ui_back'); }
  }

  draw(ctx) {
    // A soft sky-to-meadow backdrop with drifting clouds.
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#8fd3f0');
    grad.addColorStop(0.55, '#c9e9f2');
    grad.addColorStop(0.56, '#7ac457');
    grad.addColorStop(1, '#3f8236');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 5; i++) {
      const cx = ((this.t * (6 + i * 3) + i * 137) % (VIEW_W + 90)) - 45;
      const cy = 18 + i * 16;
      ctx.beginPath();
      ctx.arc(cx, cy, 9 + i, 0, Math.PI * 2);
      ctx.arc(cx + 12, cy + 2, 7 + i, 0, Math.PI * 2);
      ctx.arc(cx - 12, cy + 3, 6 + i, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.stage === 'title') {
      drawTextCentered(ctx, 'CAT CAFE', VIEW_W / 2, 52, { color: '#3d2a1c', scale: 6 });
      drawTextCentered(ctx, 'CAT CAFE', VIEW_W / 2, 49, { color: '#ffd9a0', scale: 6 });
      drawTextCentered(ctx, 'a small business in a large valley', VIEW_W / 2, 96, { color: '#3d4a2a' });

      // The player character and a cat, waiting on the grass.
      const bob = Math.sin(this.t * 3) > 0 ? 0 : 1;
      const spr = charSprite(this.look.species, this.look.coat, this.look.cloth, 'down', Math.floor(this.t * 4) % 4);
      ctx.drawImage(spr, 0, 0, spr.width, spr.height, VIEW_W / 2 - 40, 168 + bob, spr.width * 2, spr.height * 2);
      const cs = catSprite('tabby', 'right', Math.floor(this.t * 3) % 4, 'sit');
      ctx.drawImage(cs, 0, 0, cs.width, cs.height, VIEW_W / 2 + 8, 192, cs.width * 2, cs.height * 2);

      const w = 130;
      const h = this.options.length * 18 + 16;
      const x = VIEW_W / 2 - w / 2, y = 118;
      panel(ctx, x, y, w, h);
      this.options.forEach((o, i) => {
        const ry = y + 8 + i * 18;
        if (i === this.index) cursor(ctx, x + 10, ry, this.t);
        drawTextCentered(ctx, o, x + w / 2 + 6, ry, { color: i === this.index ? P.uiGold : P.uiText, shadow: P.uiShadow });
      });
      drawTextCentered(ctx, 'Arrows / WASD to move   Space to act   Esc for the menu',
        VIEW_W / 2, VIEW_H - 18, { color: '#2f3d22' });
      return;
    }

    // --- creation ---
    dim(ctx, 0.28);
    const w = 340, h = 196;
    const x = Math.round((VIEW_W - w) / 2), y = 26;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Before you open');

    // Live preview: the cafe you're choosing, with you standing at its door.
    // Building and character are drawn at the same zoom so the proportions
    // match what you'll actually see in the valley.
    const Z = 2;
    const shop = buildingSprite({
      tw: 3, wall: this.style.wall, roof: this.style.roof, roofStyle: 'tile',
      timbered: false, wallH: 24, roofH: 20, windows: 1,
      signKey: 'cafe', signBg: '#f3e3c6', awning: this.style.awning, v: 0,
    });
    const sw = shop.width * Z, sh = shop.height * Z;
    const bx = x + 14, by = y + 22;
    const ground = by + sh - 10 * Z;
    // A patch of grass for it to stand on.
    ctx.fillStyle = '#5da845';
    ctx.fillRect(bx - 6, ground, sw + 12, 12 * Z);
    ctx.fillStyle = '#4b8f39';
    ctx.fillRect(bx - 6, ground + 11 * Z, sw + 12, 2);
    ctx.drawImage(shop, 0, 0, shop.width, shop.height, bx, by, sw, sh);

    const spr = charSprite(this.look.species, this.look.coat, this.look.cloth, 'down', Math.floor(this.t * 4) % 4);
    const cw = spr.width * Z, ch = spr.height * Z;
    ctx.drawImage(spr, 0, 0, spr.width, spr.height,
      Math.round(bx + sw / 2 - cw / 2 + 9 * Z), Math.round(ground + 9 * Z - ch), cw, ch);

    const colX = x + 14 + sw + 18;
    // Four colour swatches in the right-hand column...
    const swatchRows = [
      ['Your coat', COATS[this.look.coat]?.fur],
      ['Your clothes', this.look.cloth],
      ['Cafe roof', this.style.roof],
      ['Cafe awning', this.style.awning],
    ];
    swatchRows.forEach(([label, swatch], i) => {
      const ry = y + 32 + i * 26;
      const sel = i === this.row;
      if (sel) {
        ctx.fillStyle = 'rgba(255,207,107,0.14)';
        ctx.fillRect(colX - 12, ry - 5, (x + w - 10) - (colX - 12), 22);
        cursor(ctx, colX - 10, ry + 1, this.t);
      }
      drawText(ctx, label, colX + 4, ry + 1, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      ctx.fillStyle = swatch;
      ctx.fillRect(x + w - 76, ry, 54, 12);
      ctx.strokeStyle = P.uiEdgeDk;
      ctx.strokeRect(x + w - 76.5, ry - 0.5, 55, 13);
      if (sel) {
        drawText(ctx, '<', x + w - 88, ry + 1, { color: P.uiGold, shadow: P.uiShadow });
        drawText(ctx, '>', x + w - 18, ry + 1, { color: P.uiGold, shadow: P.uiShadow });
      }
    });

    // ...and the name on its own line under the preview, where it has room.
    {
      const ry = y + h - 46;
      const sel = this.row === 4;
      if (sel) {
        ctx.fillStyle = 'rgba(255,207,107,0.14)';
        ctx.fillRect(x + 10, ry - 5, w - 20, 22);
      }
      drawText(ctx, 'Cafe name', x + 18, ry + 1, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      drawTextRight(ctx, `< ${this.style.name} >`, x + w - 16, ry + 1,
        { color: sel ? P.uiGold : P.uiTextDim, shadow: P.uiShadow });
    }

    drawTextCentered(ctx, 'Left / Right to change    Space to begin', x + w / 2, y + h - 16, { color: P.uiTextDim, shadow: P.uiShadow });
    drawTextCentered(ctx, "(You can skip all this — it's only paint)", VIEW_W / 2, y + h + 10, { color: '#2f3d22' });
  }
}

// ---------------------------------------------------------------------------

window.game = new Game();

// `?autostart` jumps straight into a new game, skipping the title. Used by the
// headless smoke test in tools/ and handy when iterating on the world.
if (location.search.includes('autostart')) {
  const g = window.game;
  g.screens.length = 0;
  g.startNewGame({ species: 'cat', coat: 'ginger', cloth: CLOTHES[5] },
    { wall: WALL_CHOICES[0], roof: ROOF_CHOICES[0], awning: AWNING_CHOICES[0],
      floor: T.FLOOR_WOOD, name: CAFE_NAMES[0] });
  g.dialogue.active = false;
}
