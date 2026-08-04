// Cat Cafe — entry point. Boots the engine, builds the world, and runs the loop.

import {
  Display, VIEW_W, VIEW_H,
  isTouchDevice, fullscreenSupported, isStandalone, toggleFullscreen,
} from './engine/display.js';
import { Input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { drawText, drawTextCentered, drawTextRight, textWidth, LINE_H } from './engine/font.js';
import { makeCanvas } from './engine/pixel.js';
import { clamp, money, makeRng, hashStr } from './engine/util.js';

import { Tileset, TILE, T, isWater } from './art/tiles.js';
import { P } from './art/palette.js';
import { charSprite, catSprite, CAT_BREED_LIST, CAT_BREEDS, COAT_LIST, CLOTHES, COATS, SPECIES_LIST } from './art/chars.js';
import { buildingSprite } from './art/objects.js';

import { generateWorld, WORLD_W, WORLD_H } from './world/worldgen.js';
import { Renderer, Camera } from './world/render.js';
import { buildShopInterior, buildSpecialInterior, buildHouseInterior } from './world/interiors.js';
import { SHOPS, VILLAGERS, TOWNS, GOSSIP, PLAYER_NAMES } from './world/places.js';

import { GameState, seedStartingInventory } from './game/state.js';
import { Player, Villager, RemotePlayer, Employee, canStand, Bear, riderOffset,
  WALK_SPEED, RUN_SPEED } from './game/entities.js';
import { HIRE_BY_ID } from './game/cafe.js';
import { ITEMS, STOCK, FLEA_POOL, baseId } from './game/items.js';
import { shopOpen, hoursText, HOUR_SECONDS, DAY_FULL } from './game/time.js';
import { BEAR_PRICE, BEAR_AFTER_DELIVERIES, BEAR_FOOD, BEAR_SPEED, BEAR_RUN,
  fedToday, rideable, deliverySpot, bearPrompt } from './game/bear.js';
import { weatherNow, weatherAmbience, weatherLight, weatherLine, WeatherFx } from './game/weather.js';
import { REGULARS, REGULAR_BY_ID, dueNow } from './game/regulars.js';
import {
  makeDelivery, ringingNow, RING_SECONDS, orderText, fullValue, settle,
  timeFraction, timeLeft, expired,
} from './game/deliveries.js';
import { BOOK_BY_ID } from './world/places.js';
import { QUESTS, QUESTS_BY_GIVER, objectiveMet, questSteps, currentStep, repairLostItems,
  stepIndex, isLastStep, progressText, objectiveText, repairAllSteps } from './game/quests.js';

import { Dialogue, Hud, Fader, panel, panelTitle, dim, cursor } from './ui/core.js';
import { SAFE, safeCenterX } from './engine/safe.js';
import {
  Screen, ShopScreen, CatShopScreen, ServiceScreen, BuilderScreen,
  CafeScreen, JournalScreen, BagScreen, MapScreen, SummaryScreen, PauseScreen, ConfirmScreen,
} from './ui/menus.js';
import { BuildScreen } from './ui/build.js';
import { TaxiFlight, StairWalk } from './ui/cutscene.js';
import { net, NetClient } from './net/client.js';

const WORLD_SEED = 20260724;

/**
 * What poking about somewhere gives you. Each returns what to say and, if
 * you've earned it, what you come away with. They are deliberately not
 * one-shot switches: a spot you searched too early should still be there when
 * you come back knowing what you're looking for.
 */
export // Whoever answers the door. Not part of the cast — they exist for half a minute
// and then go back to their evening.
const RESIDENT_NAMES = [
  'Amble', 'Perch', 'Wick', 'Fettle', 'Cobble', 'Tansy', 'Dabble', 'Rook',
  'Nettle', 'Havers', 'Muddle', 'Quince', 'Sorrel', 'Pippin', 'Larch',
];

/**
 * Does a job still want this thing, and is it not in the bag?
 *
 * Some things exist exactly once in the valley and come from exactly one place.
 * Gating that place on "you have found it before" turns any loss into a dead
 * end, because there is nowhere else to go. Gating it on whether the job still
 * needs it cannot.
 */
function stillNeeds(st, questId, item) {
  if (st.has(item)) return false;                       // one is enough
  return st.quests?.[questId] !== 'done';               // otherwise it is there
}

/**
 * Where to stand somebody who belongs at a landmark.
 *
 * Beside the thing, not on it — a hedge is solid, and standing somebody inside
 * one leaves them unable to reach their own spot ever again. And not on top of
 * anything you might want to press: somebody standing on an interact tile is a
 * lid on it, which is how the ghost at the hedge spent a release making the
 * first step of his own errand impossible to do.
 */
export function spotBeside(map, l) {
  for (const [ox, oy] of [[1, 1], [-1, 1], [2, 0], [-2, 0], [1, 0], [-1, 0], [0, 1], [0, 0]]) {
    const nx = l.x + ox, ny = l.y + oy;
    if (map.solid(nx, ny)) continue;
    if (map.interactAt(nx, ny)) continue;

    return { x: nx, y: ny };
  }
  return null;
}

export const SEARCH_SPOTS = {
  bushes: (st) => {
    if (st.clock.isDark) {
      return {
        text: 'The hedge is moving. Not in the wind — in one place, steadily, as though '
          + 'something is working its way along the bottom of it looking for something.\n\n'
          + 'Whatever it is, it is about the size of a large and elderly dog.',
        sfx: 'bush',
        flag: 'saw_the_hedge',
      };
    }
    return {
      text: 'An ordinary hedge in ordinary daylight. Hawthorn, mostly, and a crisp packet '
        + 'from some previous decade.\n\nNothing is moving at all.',
      sfx: 'bush',
    };
  },
  stones: (st) => {
    if (!st.clock.isDark) {
      return {
        text: 'Seven stones, leaning slightly inward, as if listening to something in the middle.\n\n'
          + 'Somebody has left a jam jar of wildflowers at the foot of the tallest. In the '
          + 'daylight they are just very large rocks, and you feel slightly silly.',
        sfx: 'ui_ok',
      };
    }
    // Leaving the milk is the last step of Vesper's job, so it only counts if
    // you were told to — otherwise it is a bottle of milk on a rock.
    if (st.flags.read_stones && st.has('milk') && !st.flags.left_milk) {
      st.take('milk');
      return {
        text: 'You put the saucer down in the middle of the circle and step back.\n\n'
          + 'Nothing comes. Nothing comes for long enough that you start to feel foolish '
          + 'again — and then the wind stops. All at once, everywhere, like a held breath.\n\n'
          + 'When it starts again the saucer is empty and dry, and there is a single set '
          + 'of small prints in the chalk dust that go in and do not come out.',
        sfx: 'spooky',
        flag: 'left_milk',
      };
    }
    return {
      text: 'You stand in the middle of the seven stones.\n\n'
        + 'They are warm. Not sun-warm — it has been dark for hours — but warm the way a '
        + 'sleeping animal is warm, all seven of them, at the same time.\n\n'
        + 'Somewhere above you something enormous and silent goes over.',
      sfx: 'spooky',
      flag: 'stood_in_stones',
    };
  },
  pier_mud: (st) => {
    if (!stillNeeds(st, 'lane_end_hedge', 'golden_collar')) {
      return { text: 'Mud, rope, and the ribs of a boat nobody has thought about in a long time.', sfx: 'splash' };
    }
    if (!st.flags.read_town_history) {
      return {
        text: 'You lean over the end of the pier. Below, the tide is out, and there is a '
          + 'great deal of mud.\n\nIt is exactly as interesting as mud. You have no idea '
          + 'what you would even be looking for.',
        sfx: 'splash',
      };
    }
    return {
      text: 'You lean over the end of the pier, thinking about 1800, and a ribbon, and a '
        + 'dog who did not go home.\n\nAnd there — under two hundred years of mud, catching '
        + 'the lamplight — something gold.\n\nYou have to lie flat and put your whole arm in.',
      sfx: 'splash',
      give: ['golden_collar', 1],
      flag: 'got_collar',
    };
  },
  // The lighthouse table. There was a sign here describing a logbook and
  // nothing that let you pick it up, so the errand that asks for one could
  // never be finished — the same dead end the shell used to be.
  keepers_table: (st) => {
    // Same rule as the pier: the logbook exists once and this is the only
    // place it comes from, so it is there for anybody who still needs it.
    // "You took it once" is not a reason to leave somebody with nowhere left
    // to look — which is exactly how the collar became unfinishable.
    if (!stillNeeds(st, 'lighthouse_log', 'logbook')) {
      return {
        text: 'The cold cup of tea is still there. Somebody should throw it away. '
          + 'Nobody is going to be the one who does.',
        sfx: 'bush',
      };
    }
    return {
      text: 'A logbook, a cold cup of tea, and a note reading "back in five minutes", '
        + 'dated eleven years ago.\n\nThe book falls open on its own. Eleven years of wind '
        + 'and tide in the same careful hand, and then, near the end, one line that is not '
        + 'about the weather at all.\n\nYou put it under your arm. Somebody should read it.',
      sfx: 'quest',
      give: ['logbook', 1],
      flag: 'took_logbook',
    };
  },
};


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
    this.net = net;
    this.bear = null;         // the actor, built from the books when she exists
    this.riding = false;
    this.remotes = new Map();
    // Boot is async now (it waits for the session's seed), so anything that
    // wants a built world has something to await.
    this.ready = new Promise((resolve) => { this.markReady = resolve; });
    this.start();
  }

  /**
   * Look for a session on the host that served the page before generating the
   * world, because the server owns the seed. No server, or no answer inside a
   * second and a half, and we simply play alone.
   */
  async start() {
    let seed = WORLD_SEED;
    // Ask what is on offer before opening any socket: the list is plain HTTP,
    // so reading it doesn't put anyone in a valley.
    let list = null;
    try { list = await NetClient.listGames(2000); } catch { /* solo */ }
    // `?game=002` skips the lobby: a direct link to one valley, which is also
    // how a test says which of several it means.
    const wanted = new URLSearchParams(location.search).get('game');
    if (wanted) net.gameId = wanted;
    // The lobby shows whenever there is a server, even for a single valley —
    // it is the only place you can start another one or throw one away, so
    // hiding it until there are two means there can never be two.
    if (wanted || !list) {
      try {
        const ok = await net.connect(1500);
        if (ok && Number.isFinite(net.seed)) seed = net.seed;
      } catch { /* solo */ }
    } else {
      this.lobbyGames = list;
      // Something to build a world from until they choose; if they pick a
      // different valley the world is rebuilt for its seed, which costs less
      // than a tenth of a second.
      seed = list.length ? list[0].seed : WORLD_SEED;
    }
    this.wireNet();
    this.boot(seed);
  }

  /**
   * Join the valley chosen in the lobby: connect to that game, rebuild the
   * world for its seed if it differs from the one we booted with, then hand
   * over to the usual title screen, which already knows how to tell a cafe
   * that is open from one that isn't.
   */
  async enterGame(id) {
    net.gameId = id;
    let ok = false;
    try { ok = await net.connect(2500); } catch { /* fall through */ }
    if (ok && Number.isFinite(net.seed) && net.seed !== this.worldSeed) {
      this.buildWorld(net.seed);
    }
    this.titleScreen = new TitleScreen(this);
    this.screens.length = 0;
    this.screens.push(this.titleScreen);
    return ok;
  }

  wireNet() {
    const st = this.state;
    st.net = net;
    net.on('joined', (p) => this.hud.toast(`${p.n} joined the valley.`, 'good'));
    // The server renames you if the name you picked is already in the valley.
    net.on('youare', (name) => {
      if (name === st.playerName) return;
      this.hud.toast(`${st.playerName} was taken — you're ${name}.`, 'info', 6);
      st.playerName = name;
    });
    net.on('left', (p) => this.hud.toast(`${p.n} left.`, 'info'));
    net.on('disconnected', () => this.hud.toast('Lost the cafe — trying to get back...', 'bad'));
    net.on('reconnected', () => {
      // We may have missed a whole afternoon of other people's changes, so take
      // the valley's books wholesale rather than trusting our stale copy.
      if (net.world && this.mode === 'play') st.adopt(net.world, net.clock);
      this.hud.toast('Back in the valley.', 'good');
    });

    // The shared books. Every one of these arrives because somebody — possibly
    // us — changed something, and the server's copy is the one that counts.
    net.on('sync', (k, v) => {
      st.applySync(k, v);
      // Somebody else may have just shifted the chalk. Open our copy too.
      if (k === 'flags' && this.overworld) this.applyClearedBarriers();
    });
    // The authoritative books, sent when we join and whenever a cafe is opened.
    // On the title screen we only file it away; `announce` adopts it on start.
    net.on('world', (world, clock) => {
      if (this.mode !== 'play') return;
      st.adopt(world, clock);
      this.applyClearedBarriers();
      this.repairQuests();
    });
    net.on('clock', (c) => { st.clock.day = c.day; st.clock.t = c.t; });
    net.on('newday', (m) => {
      if (m.by) this.hud.toast(`${m.by} slept until morning.`, 'info');
      this.onNewDay({ slept: !!m.by, shared: true });
    });
    net.on('summary', (s) => this.showSummary(s));
    // Whoever runs the sim owns the customers, so on a handover everybody's
    // current lot are stale: the new owner starts the room fresh.
    net.on('owner', () => st.cafeSim.clearCustomers());
    net.on('cust', (list) => { if (!net.simOwner) st.cafeSim.applyCustomers(list); });
    net.on('serve', (m) => { if (net.simOwner) st.cafeSim.serveNearest(m.x, m.y); });
  }

  /** Keep our RemotePlayer actors in step with the roster the server sends. */
  syncRemotes(dt) {
    if (!net.connected) return;
    for (const info of net.remotes.values()) {
      let r = this.remotes.get(info.id);
      if (!r) { r = new RemotePlayer(info); this.remotes.set(info.id, r); }
      else r.setFrom(info);
    }
    for (const id of [...this.remotes.keys()]) {
      if (!net.remotes.has(id)) this.remotes.delete(id);
    }
    for (const r of this.remotes.values()) r.update(dt);
  }

  // ------------------------------------------------------------------ boot

  /**
   * Build the valley for one seed. Split out of boot because choosing which
   * game to join happens after the game is running: a fresh world costs well
   * under a tenth of a second, so switching to the one you picked in the lobby
   * is cheaper than restructuring startup around it.
   */
  buildWorld(seed) {
    this.worldSeed = seed;
    if (this.state) this.state.worldSeed = seed;
    // Screen-space, so it survives a change of valley untouched.
    this.weatherFx ||= new WeatherFx(VIEW_W, VIEW_H);
    this.sky = weatherNow(seed, this.state?.clock || { day: 0, t: 999 });
    const world = generateWorld(seed);
    this.overworld = world.map;
    this.towns = world.towns;
    this.doors = world.doors;
    this.landmarks = world.landmarks;
    this.houses = world.houses || [];    // every cottage door in the valley
    this.barriers = world.barriers;      // handy when asking why a pass is open

    // Interiors are built on demand and belong to the world we just replaced.
    this.maps = new Map();
    this.maps.set('overworld', this.overworld);

    // Doors on the overworld point at interiors we build on demand.
    this.doorByShop = new Map();
    for (const d of this.doors) this.doorByShop.set(d.shop, d);
    for (const l of this.landmarks) this.doorByShop.set(l.id, { shop: l.id, x: l.x, y: l.y, name: l.name });

    // What the Valley Map knows. Rebuilt with the world rather than saved,
    // because it describes the valley and not the player.
    if (this.state) {
      this.state.atlas = [
        ...Object.values(this.towns).map((t) => ({ id: t.id, name: t.name, x: t.hub.x, y: t.hub.y, town: null })),
        ...this.landmarks.map((l) => ({ id: l.id, name: l.name, x: l.x, y: l.y, town: null })),
      ];
    }

    // The one building whose look the player controls.
    this.cafeBuilding = this.overworld.objects.find((o) => o.data && o.data.shop === 'cafe');

    this.placeVillagers();
    this.buildMinimap();

    this.state.worldW = WORLD_W;
    this.state.worldH = WORLD_H;

    // The player starts on the doorstep of their own cafe.
    const cafeDoor = this.doorByShop.get('cafe');
    this.homeDoor = cafeDoor || { x: this.towns.brambleford.hub.x, y: this.towns.brambleford.hub.y };
    const hx = this.homeDoor.x * TILE + TILE / 2;
    const hy = (this.homeDoor.y + 1) * TILE - 2;
    if (this.player) { this.player.x = hx; this.player.y = hy; }
    else this.player = new Player(hx, hy, this.state.playerLook);
    this.currentMap = this.overworld;
    if (this.renderer) this.renderer.invalidateAll();
  }

  boot(seed = WORLD_SEED) {
    this.tileset = new Tileset();
    this.renderer = new Renderer(this.tileset);
    this.cam = new Camera();
    this.buildWorld(seed);

    // Several valleys on one server means choosing which before anything else.
    // With no server, or only one game, there is nothing to choose and the
    // lobby would just be a door to open on the way to the door.
    if (this.lobbyGames && this.lobbyGames.length) {
      this.screens.push(new LobbyScreen(this, this.lobbyGames));
    } else {
      this.titleScreen = new TitleScreen(this);
      this.screens.push(this.titleScreen);
    }
    this.markReady(this);

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
      // Regulars are not out in the valley at all. They come to you.
      if (def.regular) continue;
      let x, y;
      // Some of the cast belong somewhere in particular — a ghost is only
      // interesting if it is haunting the hedge somebody complained about.
      if (def.spot) {
        const l = this.landmarks.find((k) => k.id === def.spot);
        const at = l && spotBeside(this.overworld, l);
        if (at) { x = at.x; y = at.y; }
      }
      if (x === undefined && def.town && this.towns[def.town]) {
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
      v.burrow = this.burrowFor(x, y);
      this.villagers.push(v);
    }
    this.secretVillagers = this.villagers.filter((v) => v.def.secret);
    // Start the right crowd out, without walking anybody anywhere.
    const dark = this.state.clock.isDark;
    for (const v of this.villagers) {
      const on = (v.when === 'always' || (v.when === 'night') === dark) && this.found(v);
      v.shift = on ? 'here' : 'away';
      v.alpha = on ? 1 : 0;
    }
    this.wasDark = dark;
  }

  /**
   * Is this one of the cast the player has actually found yet?
   *
   * Most people are simply in the valley. A few are not there at all until
   * something has happened — see the ghost in places.js. `away` is how the
   * shift machinery already says "not in the valley right now", so a villager
   * nobody has found is held in exactly that state: not drawn, not talked to,
   * not walking about in front of the quest that has you find them.
   */
  found(v) {
    return !v.def.secret || !!v.def.secret(this.state);
  }

  /**
   * Somebody may become findable at any moment — the ghost the instant you tell
   * Button what you saw. Shifts only turn over at dusk and dawn, which would
   * leave him missing from his own hedge for the rest of the night.
   */
  updateFound() {
    for (const v of this.secretVillagers || []) {
      const out = this.found(v);
      if (!out) {
        if (v.shift !== 'away') { v.shift = 'away'; v.alpha = 0; v.target = null; }
      } else if (v.shift === 'away' && (v.when === 'night') === this.state.clock.isDark) {
        v.setShift(true);                      // walks in from the treeline
      }
    }
  }

  /**
   * Somewhere near `tx,ty` a person could plausibly disappear into: a door,
   * failing that the woods, failing that a spot far enough off to be out of
   * mind. Nobody should pop out of existence in the middle of the square.
   */
  burrowFor(tx, ty) {
    const map = this.overworld;
    let woods = null;
    for (let r = 1; r <= 14; r++) {
      for (let a = 0; a < r * 8; a++) {
        const ang = (a / (r * 8)) * Math.PI * 2;
        const x = Math.round(tx + Math.cos(ang) * r);
        const y = Math.round(ty + Math.sin(ang) * r);
        if (!map.inBounds(x, y) || map.solid(x, y)) continue;
        const it = map.interactAt(x, y);
        if (it && it.kind === 'door') return { x: x * TILE + TILE / 2, y: (y + 1) * TILE - 2 };
        if (!woods && map.get(x, y) === T.FOREST_FLOOR) {
          woods = { x: x * TILE + TILE / 2, y: (y + 1) * TILE - 2 };
        }
      }
    }
    return woods || { x: tx * TILE + TILE / 2, y: (ty + 9) * TILE - 2 };
  }

  /**
   * Dusk and dawn: one crowd walks home, the other comes out. Checked against
   * the clock rather than run on a timer, so it still happens correctly after
   * sleeping through a night or having the day rolled by somebody else.
   */
  updateVillagerShift() {
    this.updateFound();
    const dark = this.state.clock.isDark;
    if (dark === this.wasDark) return;
    this.wasDark = dark;
    for (const v of this.villagers) {
      if (!this.found(v)) continue;
      if (v.when === 'always') continue;
      v.setShift((v.when === 'night') === dark);
    }
    this.hud.toast(dark ? 'The valley settles. Something else is about.' : 'Morning. The lane fills up again.',
      'info', 5);
  }

  /** A 1px-per-tile picture of the valley for the map screen. */
  buildMinimap() {
    const { canvas, g } = makeCanvas(WORLD_W, WORLD_H);
    const img = g.createImageData(WORLD_W, WORLD_H);
    const colorFor = (id) => {
      switch (id) {
        case T.WATER_DEEP: return [23, 60, 102];
        case T.WATER_MID: return [58, 131, 190];
        case T.WATER: return [74, 159, 212];
        case T.WATER_SHOAL: return [127, 208, 238];
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
    this.announce();
    st.visit('cafe', 'Your Cat Cafe', this.homeDoor.x, this.homeDoor.y, 'brambleford');
    st.visit('brambleford', 'Brambleford', this.towns.brambleford.hub.x, this.towns.brambleford.hub.y);
    this.hud.showLocation('Brambleford');
    this.dialogue.say(st.shared && this.joinedExisting
      ? `${st.cafe.name || 'The cafe'} is already open, and short-handed.\n\n`
        + 'The books, the pantry and the cats are shared — anything you buy, everyone has.\n\n'
        + 'Go and be useful.'
      : "So this is it. Your grandmother's old tea room, three cats, and whatever you can carry.\n\n"
        + "The valley's out there. Somewhere in it is everything you need to make this place work.\n\n"
        + 'Best get started.',
      { speaker: st.shared && this.joinedExisting ? st.cafe.name || 'The cafe' : 'Brambleford' },
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
    this.announce();
    this.hud.toast('Welcome back.', 'good');
    this.applyClearedBarriers();
    this.repairQuests();
  }

  /** Tell the session who we are and where we're standing. */
  announce() {
    const st = this.state;
    if (!net.connected || net.joined) return;
    if (!st.playerName) st.playerName = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
    net.join(st.playerName, st.playerLook, this.player.x, this.player.y, st.mapId);

    // Either the cafe is already open, in which case its books are the real
    // ones and ours were only ever a rehearsal, or we're the ones opening it.
    if (net.world) {
      st.adopt(net.world, net.clock);
      this.maps.set('cafe', st.cafeMap);
      this.joinedExisting = true;
      this.applyClearedBarriers();
      this.repairQuests();
    } else {
      net.seedWorld(st.snapshot(), st.clock.save());
    }

    const others = Math.max(net.remotes.size, net.here - 1);
    this.hud.toast(others
      ? `Joined the valley — ${others} other${others > 1 ? 's' : ''} connected.`
      : `Joined the valley on ${net.host}. Nobody else connected yet.`, 'good', 6);
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

  /** On its own so a test can watch us leave without the page going away. */
  reloadPage() { location.reload(); }

  /**
   * Save, hang up, and go back to the front of the game.
   *
   * The books are the server's and were already up to date; the local save is
   * what lets this browser offer to continue *this* valley later, so it is
   * written before the line goes down rather than after.
   *
   * Then a reload, which is not laziness: start() already works out whether
   * this machine gets the lobby or the title screen, and a play session leaves
   * a great deal behind it — a cafe simulation, a valley of villagers, other
   * players' sprites, sockets, timers. Dismantling all of that by hand to reach
   * a screen the boot path can produce in a second is a fine way to end up on
   * the title screen with yesterday's cats still walking about.
   */
  leaveValley() {
    this.state.save();
    // Say goodbye properly: the socket closing is how the server knows to take
    // us out of the valley, and how the people still in it hear that we left.


    try { net.leave(); } catch { /* going anyway */ }
    this.hud.toast('Saving and leaving…', 'info', 3);
    setTimeout(() => this.reloadPage(), 250);
  }



  /**
   * Drover Bell, and the only five-thousand-pound decision in the game.
   *
   * Sold once, ever: there is one bear, and buying her a second time would be
   * buying the one you are already standing next to. Afterwards he asks after
   * her instead, which is the only thing he actually cares about.
   */
  offerBear(def, v, finish) {
    const st = this.state;
    if (st.bear) {
      const lines = def.sold || ['She is yours now.'];
      this.dialogue.say(lines[v.lineIndex++ % lines.length], { speaker: def.name, onDone: finish });
      return;
    }
    const canPay = st.money >= BEAR_PRICE;
    const pitch = 'That is her. She is nine years old, she is entirely reliable, and she has '
      + 'never once been in a hurry.\n\n'
      + `${money(BEAR_PRICE)}. One fresh fish a day and she will carry you anywhere in this `
      + 'valley, water included.'
      + (canPay ? '' : `\n\nYou have ${money(st.money)}. Come back when you have the rest.`);
    this.dialogue.say(pitch, {
      speaker: def.name,
      onDone: () => {
        finish();
        if (!canPay) { audio.sfx('error'); return; }
        this.push(new ConfirmScreen({
          title: 'Buy the riding bear?',
          lines: [`${money(BEAR_PRICE)} — you have ${money(st.money)}`,
            'There is only one of her.'],
          yes: 'Buy her',
          no: 'Not today',
          onYes: () => this.completeBearSale(def),
        }));
      },
    });
  }

  /** Paid for. He walks her over while you walk home. */
  completeBearSale(def) {
    const st = this.state;
    if (st.bear || st.money < BEAR_PRICE) { audio.sfx('error'); return; }
    st.spend(BEAR_PRICE);
    const door = this.homeDoor || { x: 100, y: 180 };
    const at = deliverySpot(door);
    st.buyBear(at.x * TILE + TILE / 2, (at.y + 1) * TILE - 2, 'overworld');
    audio.sfx('levelup', { gain: 0.7 });
    this.dialogue.say('Right. I will walk her over myself — she does not like carts.\n\n'
      + 'She will be outside your place by the time you get back. Do not run home. '
      + 'She will be there.',
    { speaker: def.name });
    this.hud.toast('Drover Bell is walking the bear to your cafe.', 'good', 7);
  }

  // ------------------------------------------------------------- the bear
  //
  // One bear, one valley. She is kept in the shared books as a position and a
  // feeding day; the actor that ambles about is built from that whenever the
  // books say she exists, and put back into them whenever she is left
  // somewhere new. Riding is local — the rider is a player, and players are
  // already synchronised — so the only thing co-op has to agree about is where
  // she was last put down.

  updateBear(dt) {
    const st = this.state;
    if (!st.bear) { this.bear = null; return; }
    if (!this.bear) {
      this.bear = new Bear(st.bear.x, st.bear.y);
      this.bear.moveTo(st.bear.x, st.bear.y);
    }
    // Somebody else rode her across the valley: she is where their books say.
    if (!this.riding && !this.bear.ridden
      && (Math.abs(this.bear.home.x - st.bear.x) > 24 || Math.abs(this.bear.home.y - st.bear.y) > 24)) {
      this.bear.moveTo(st.bear.x, st.bear.y);
    }
    // While she is being ridden her position is the rider's, and Actor.draw
    // keeps the two in step — there is nothing to update here.
    if (this.riding) return;
    if (st.mapId !== (st.bear.map || 'overworld')) return;
    const pan = clamp((this.bear.x - this.cam.x - VIEW_W / 2) / (VIEW_W / 2), -1, 1);
    this.bear.update(dt, this.overworld, { pan });
  }

  /** Near enough to talk to her, and on the same map. */
  bearInReach() {
    const st = this.state;
    if (!this.bear || this.riding || !st.bear) return false;
    if (st.mapId !== (st.bear.map || 'overworld')) return false;
    return Math.hypot(this.bear.x - this.player.x, this.bear.y - this.player.y) < 30;
  }

  /** Fish about your person or on the pantry shelf — either will do. */
  fishToHand() {
    const st = this.state;
    return (st.inventory[BEAR_FOOD] || 0) + st.cafeSim.stockCount(BEAR_FOOD);
  }

  takeFish() {
    const st = this.state;
    if ((st.inventory[BEAR_FOOD] || 0) > 0) { st.take(BEAR_FOOD, 1); return true; }
    if (st.cafeSim.stockCount(BEAR_FOOD) > 0) { st.cafeSim.takeStock(BEAR_FOOD, 1); return true; }
    return false;
  }

  /**
   * Space, next to the bear. Feeds her if she has not eaten, gets on if she
   * has, and says so if there is no fish anywhere.
   */
  useBear() {
    const st = this.state;
    if (fedToday(st.bear, st.clock)) { this.mountBear(); return; }
    if (!this.takeFish()) {
      this.hud.toast('She looks at you, then at your empty hands. Fresh fish.', 'info', 5);
      audio.sfx('ui_back');
      return;
    }
    st.feedBear(st.clock.day);
    audio.sfx('rasp', { gain: 0.6, pitch: 0.5 });
    this.bear.pose = 'sniff';
    this.bear.stateT = 3;
    this.hud.toast('She takes the whole fish in one go. That will do until morning.', 'good', 5);
    this.mountBear();
  }

  mountBear() {
    const st = this.state;
    this.riding = true;
    this.bear.ridden = true;
    this.player.mounted = true;
    this.player.mount = this.bear;
    this.player.swims = true;               // she does; you are only cargo
    this.player.speed = BEAR_SPEED;
    this.player.runSpeed = BEAR_RUN;
    // Start from her feet rather than yours, so you do not mount from two
    // tiles away and appear to be riding the air beside her.
    this.player.x = this.bear.x;
    this.player.y = this.bear.y;
    audio.sfx('rasp', { gain: 0.5, pitch: 0.4 });
    this.hud.toast('Up you get. Space to get down again.', 'good', 5);
  }

  dismountBear() {
    const st = this.state;
    if (!this.riding) return;
    this.riding = false;
    this.player.mounted = false;
    this.player.mount = null;
    this.player.swims = false;
    this.player.speed = WALK_SPEED;
    this.player.runSpeed = RUN_SPEED;
    // Get off onto something you can stand on. In the middle of the river
    // there is nowhere, so she carries you to the nearest bank first.
    const spot = this.dryLandNear(this.player.x, this.player.y);
    this.player.x = spot.x;
    this.player.y = spot.y;
    this.bear.ridden = false;
    this.bear.moveTo(spot.x, spot.y);
    this.state.parkBear(spot.x, spot.y, this.state.mapId);
    audio.sfx('step', { gain: 0.6 });
    if (spot.swam) this.hud.toast('She wades out and lets you off on the bank.', 'info', 4);
  }

  /**
   * The nearest place a person could be left standing. Getting off in the
   * middle of deep water would strand you inside a tile you cannot walk out
   * of — the one way this bear could genuinely break a game.
   */
  dryLandNear(x, y) {
    if (canStand(this.currentMap, x, y, false)) return { x, y, swam: false };
    for (let r = TILE; r <= TILE * 12; r += TILE / 2) {
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        const nx = x + Math.cos(t) * r, ny = y + Math.sin(t) * r;
        if (canStand(this.currentMap, nx, ny, false)) return { x: nx, y: ny, swam: true };
      }
    }
    return { x, y, swam: false };
  }

  /** Draw her under the rider, and the rider on top, as one animal. */
  drawRiddenBear(ctx) {
    if (!this.riding || !this.bear) return;
    this.bear.draw(ctx, this.cam.ox, this.cam.oy);
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
      this.updateWeather(dt);
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

    // The clock keeps ticking locally between the server's updates so the HUD
    // reads smoothly, but in a shared valley the server decides when a day ends.
    st.clock.update(dt);
    if (st.clock.newDay && !st.shared) this.onNewDay();

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
    this.syncRemotes(dt);
    net.update(dt, this.player, st.mapId);
    this.updateCafeSim(dt);
    this.updateEmployee(dt);
    this.updateRegulars(dt);
    this.updateBear(dt);
    this.updatePhone(dt);
    this.updateDeliveries(dt);
    this.updateWeather(dt);
    this.updateAudio(dt);
    this.hud.update(dt, st);
    this.cam.follow(map, this.player.x, this.player.y - 6);
    this.input.endFrame();
  }

  /**
   * Serving is the one thing a player does *to* the simulation, so when we
   * aren't the one running it we ask whoever is. Waiting for their answer would
   * be a whole round trip, so we go by our own copy of who's queueing.
   */
  tryServe() {
    const st = this.state;
    if (net.simOwner) return st.cafeSim.serveNearest(this.player.x, this.player.y);
    const c = st.cafeSim.waitingNear(this.player.x, this.player.y);
    if (!c) return false;
    // The answer is worked out on whoever runs the room, so make the noise here
    // from our own copy of the pantry — which is the same pantry. Waiting for
    // the round trip would put the sound after the shrug.
    const have = c.order && st.cafeSim.stockCount(c.order) > 0;
    audio.sfx(have ? 'cash' : 'outof', { gain: 0.6 });
    net.askServe(this.player.x, this.player.y);
    return true;
  }

  /**
   * Exactly one client simulates the cafe, or the same cup of coffee would be
   * sold once per player. The rest draw copies of its customers.
   */
  /**
   * Keep the person you pay standing where you can see them. Built lazily and
   * dropped when they go off duty or leave, so nothing has to remember to tidy
   * up after a resignation.
   */
  updateEmployee(dt) {
    const st = this.state;
    const emp = st.employee;
    const spot = st.cafeMap && st.cafeMap.meta && st.cafeMap.meta.staffSpot;
    // Clocking on and off is worth saying out loud wherever you are: it is the
    // moment the counter starts and stops being covered, and you are usually
    // somewhere else when it happens.
    const on = st.cafeSim.staffOn;
    if (emp && this._staffWas !== undefined && this._staffWas !== on) {
      this.hud.toast(`${emp.name} is clocking ${on ? 'in' : 'out'}.`, on ? 'good' : 'info', 5);
      audio.sfx(on ? 'ui_ok' : 'ui_back', { gain: 0.4 });
    }
    this._staffWas = emp ? on : undefined;
    if (!emp || !on || !spot) { this.employeeActor = null; return; }
    if (!this.employeeActor || this.employeeActor.def.id !== emp.id) {
      const def = HIRE_BY_ID[emp.id] || { id: emp.id, name: emp.name };
      this.employeeActor = new Employee({ ...def, name: emp.name },
        spot.x * TILE + TILE / 2, (spot.y + 1) * TILE - 2);
    }
    // Whoever is at the counter waiting to be dealt with.
    const waiting = st.cafeSim.customers.find((c) => c.state === 'waiting') || null;
    this.employeeActor.update(dt, waiting);
  }

  updateCafeSim(dt) {
    const st = this.state;
    // "Is anyone minding the shop" is a question about everybody, not just us.
    const othersInCafe = st.shared ? net.onMap('cafe').length : 0;
    st.cafeOccupied = st.inCafe || othersInCafe > 0;
    if (net.simOwner) {
      st.cafeSim.update(dt, this.ambienceCtx || (this.ambienceCtx = {}));
      net.sendCustomers(dt, st.cafeSim.customers, othersInCafe);
    } else {
      st.cafeSim.updatePuppets(dt);
    }
  }

  updateActors(dt) {
    const st = this.state;
    const map = this.currentMap;

    if (st.mapId === 'overworld') {
      this.updateVillagerShift();
      // Only bother with villagers near the camera — except the ones walking
      // off shift, who have somewhere to be whether you're watching or not.
      const cx = this.player.x, cy = this.player.y;
      for (const v of this.villagers) {
        if (v.shift === 'away') continue;
        const near = Math.abs(v.x - cx) <= 400 && Math.abs(v.y - cy) <= 320;
        if (!near && v.shift === 'here') continue;
        v.update(dt, map);
      }
    } else if (map.villagers) {
      // Regulars are driven by updateRegulars, which knows where you are.
      // Letting the ordinary wander run as well had them drifting back to the
      // door as fast as they crossed the room.
      for (const v of map.villagers) if (!v.regular) v.update(dt, map);
    }

    if (st.inCafe) {
      const joy = st.cafe.furniture.filter((f) => ['catTower', 'catBed', 'scratchPost', 'toyBall', 'toyYarn', 'toyWand'].includes(f.type)).length;
      for (const cat of st.catActors) {
        const pan = clamp((cat.x - this.cam.x - VIEW_W / 2) / (VIEW_W / 2), -1, 1);
        cat.update(dt, map, { joy, pan });
      }
    }
  }

  /**
   * Who has let themselves into the cafe. Regulars are not out in the valley
   * to be found — they turn up, find somewhere to sit, and wait to be spoken
   * to. Due or not is derived from the seed and the date, so a shared valley
   * gets the same visitor on the same evening without a word over the wire.
   */
  updateRegulars(dt) {
    const st = this.state;
    const map = st.cafeMap;
    if (!map) return;
    map.villagers ||= [];
    for (const def of REGULARS) {
      const want = this.regularWelcome(def);
      const here = map.villagers.find((v) => v.def.id === def.id);
      if (want && !here) {
        const door = map.meta.door || map.spawn || { x: 2, y: 2 };
        const v = new Villager(def, door.x * TILE + TILE / 2, (door.y + 1) * TILE - 2);
        map.villagers.push(v);
        this.hud.toast(`${def.name} lets themselves in.`, 'good', 5);
        audio.sfx('door', { gain: 0.4 });
      } else if (!want && here && !here.talking) {
        here.standUp();
        map.villagers.splice(map.villagers.indexOf(here), 1);
      }
    }
    for (const v of map.villagers) {
      if (!v.regular) continue;
      if (st.inCafe) this.updateRegularVisit(dt, map, v);
    }
  }

  /**
   * Would this regular walk in right now? They are due, and you are in the
   * room. Where they end up once they are in is a separate question — they
   * will take a chair, and stand near the counter if there is not one.
   */
  regularWelcome(def) {
    const st = this.state;
    if (!st.inCafe) return false;
    // Somebody who comes with news comes when there is news, once, and stops
    // coming when they have delivered it — not on the visiting rota.
    if (def.arrives) return !!def.arrives(st);
    return dueNow(def, this.worldSeed, st.clock, this.waitingOn(def.id));
  }

  /** Seats of one kind, in the cafe as it is actually laid out. */
  seatsOfType(type) {
    return (this.state.cafeMap?.meta?.seats || []).filter((s) => s.type === type);
  }

  /**
   * Somewhere to be, in order of preference: their usual sort of seat, then
   * any seat at all, then a spot by the counter. Never the queue — a regular
   * is not here to order anything and standing in the line would only get in
   * the way of the people who are.
   */
  regularSpot(map, v) {
    const seats = map.meta.seats || [];
    const free = seats.filter((s) => !s.taken);
    const liked = v.seatPrefers ? free.find((s) => s.type === v.seatPrefers) : null;
    return liked || free[0] || null;
  }

  /**
   * A place to stand when every chair is taken: beside the counter, clear of
   * the queue that forms straight out in front of it.
   */
  counterPerch(map) {
    const spot = map.meta.staffSpot || map.meta.door;
    if (!spot) return null;
    // Rings outward from the counter, nearest first, skipping the column the
    // queue forms in. Somebody who cannot find a chair should end up beside
    // the counter, not standing in the way of the people ordering.
    for (let r = 2; r <= 6; r++) {
      const ring = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (Math.abs(dx) <= 1 && dy > 0) continue;         // that is the queue
          ring.push([dx, dy]);
        }
      }
      // Beside rather than behind: prefer spots level with or below the counter.
      ring.sort((a, b) => (b[1] - a[1]) || (Math.abs(a[0]) - Math.abs(b[0])));
      for (const [dx, dy] of ring) {
        const x = spot.x + dx, y = spot.y + dy;
        if (!map.inBounds(x, y) || map.solid(x, y)) continue;
        if (!map.meta.rooms || map.meta.rooms.some((rm) => (
          x >= rm.x && x < rm.x + rm.w && y >= rm.y && y < rm.y + rm.h
        ))) return { x, y };
      }
    }
    return null;
  }

  /**
   * One regular's evening: in through the door, over to a seat, and there
   * they stay. They do not follow you about — a visitor who trails you round
   * your own cafe is a visitor you are trying to get away from. The question
   * mark over their head is how they ask for a word.
   */
  updateRegularVisit(dt, map, v) {
    if (v.shift === 'away') return;
    // Claim a seat if there is one going, and keep it.
    if (!v.seat) {
      const seat = this.regularSpot(map, v);
      if (seat) {
        seat.taken = v;
        v.seat = seat;
        v.mode = 'toSeat';
      } else if (!v.perch) {
        v.perch = this.counterPerch(map);
        v.mode = 'toCounter';
      }
    }
    const target = v.seat
      ? { x: v.seat.x * TILE + TILE / 2, y: (v.seat.y + 1) * TILE - 3 }
      : v.perch && { x: v.perch.x * TILE + TILE / 2, y: (v.perch.y + 1) * TILE - 3 };
    v.updateRegular(dt, map, target);
    if (v.arrived) v.mode = v.seat ? 'seated' : 'standing';

    // A thought bubble with a question mark, for as long as they have
    // something to say. It is the only thing marking them out from the
    // customers now, so it stays up rather than blinking past.
    if (!this.heardOut(v.def.id) || this.waitingOn(v.def.id)) {
      if (v.emote !== 'wonder') v.showEmote('wonder', 999);
      v.emoteT = 999;
    } else if (v.emote === 'wonder') {
      v.clearEmote();
    }
  }

  // ------------------------------------------------------------ deliveries

  /**
   * Orders lapse on the clock, and a house with somebody waiting has its lights
   * on. Only the client running the sim clears expired orders, or every player
   * would announce the same lapse.
   */
  updateDeliveries() {
    const st = this.state;
    if (net.simOwner) st.expireDeliveries();
    const wanted = new Set(st.liveDeliveries().filter((d) => d.house).map((d) => d.house));
    if (this._litHouses === undefined) this._litHouses = new Set();
    // Only re-bake a building when its light actually changes.
    for (const o of this.overworld.objects) {
      if (o.type !== '_building') continue;
      const id = o.data && o.data.house;
      if (!id || !o.cfg) continue;
      const lit = wanted.has(id);
      if (lit === !!o.cfg.lit) continue;
      o.cfg = { ...o.cfg, lit };
      o.sprite = buildingSprite(o.cfg);
      o.w = o.sprite.width;
      o.h = o.sprite.height;
      this.renderer.invalidateAll();
    }
    this.updateOutdoorRecipients();
  }

  /**
   * Somebody standing at an open-air address, waiting for their order.
   *
   * Orders to a house put a resident in the front room when you open the door.
   * Orders to a green or a landmark used to put nobody anywhere at all: the map
   * showed a ring, you walked to it, and the only people there were the
   * villagers who live there — none of whom had ordered anything. Two thirds of
   * the addresses in the book were undeliverable.
   */
  updateOutdoorRecipients() {
    const st = this.state;
    if (!this.villagers) return;
    const open = st.liveDeliveries().filter((d) => !d.house);
    const wanted = new Set(open.map((d) => d.id));

    // Anyone whose order has been run, refused or run out of time goes home.
    for (let i = this.villagers.length - 1; i >= 0; i--) {
      const v = this.villagers[i];
      if (v.recipient && !wanted.has(v.recipient)) this.villagers.splice(i, 1);
    }
    if (this.secretVillagers) {
      this.secretVillagers = this.secretVillagers.filter((v) => !v.recipient || wanted.has(v.recipient));
    }

    for (const d of open) {
      if (this.villagers.some((v) => v.recipient === d.id)) continue;
      // Beside the spot rather than on it, and never inside a hedge: the ring
      // on the map is where the order is, not where a person can stand.
      const at = this.standableNear(d.x, d.y);
      if (!at) continue;
      const rng = makeRng(hashStr(d.id));
      const v = new Villager({
        id: `waiting:${d.id}`,
        name: RESIDENT_NAMES[rng.int(RESIDENT_NAMES.length)],
        species: SPECIES_LIST[rng.int(SPECIES_LIST.length)],
        coat: COAT_LIST[rng.int(COAT_LIST.length)],
        when: 'always',
        lines: ['*waiting, with the look of somebody expecting a parcel*'],
      }, at.x * TILE + TILE / 2, (at.y + 1) * TILE - 2);
      v.recipient = d.id;
      v.mapId = 'overworld';
      v.range = 8;
      v.burrow = { x: v.x, y: v.y };
      // The same mark a villager with something to say wears, so you can pick
      // them out of a market square full of people who have nothing for you.
      v.hasQuestMark = true;
      this.villagers.push(v);
    }
  }

  /** The nearest tile to (tx,ty) somebody could actually stand on. */
  standableNear(tx, ty) {
    for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1],
      [2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]]) {
      const nx = tx + ox, ny = ty + oy;
      if (!this.overworld.inBounds(nx, ny)) continue;
      if (this.overworld.solid(nx, ny)) continue;
      if (this.overworld.interactAt(nx, ny)) continue;
      return { x: nx, y: ny };
    }
    return null;
  }

  /** Everywhere an order could be sent. Houses, doorsteps, and open country. */
  deliverySpots() {
    const out = [];
    for (const h of this.houses) {
      out.push({ x: h.x, y: h.y, name: h.name, town: h.town, house: h.id });
    }
    // A few outdoor addresses: somebody waiting by a landmark, and somebody
    // stood in the middle of nowhere who will not explain why.
    for (const l of this.landmarks) {
      out.push({ x: l.x, y: l.y + 1, name: l.name, town: null, house: null });
    }
    for (const [id, t] of Object.entries(this.towns)) {
      out.push({ x: t.hub.x, y: t.hub.y + 1, name: `The green at ${t.name}`, town: id, house: null });
    }
    return out.filter((p) => this.overworld.inBounds(p.x, p.y));
  }

  /**
   * Put somebody in the front room if an order is due here, and take them away
   * again once the time is up. Interiors are built once and kept, so this runs
   * on the way in rather than at build time.
   */
  fitRecipient(map, houseId) {
    const st = this.state;
    const d = st.liveDeliveries().find((x) => x.house === houseId);
    map.villagers = (map.villagers || []).filter((v) => !v.recipient);
    if (!d) return;
    const room = map.meta.room;
    const spot = { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
    const rng = makeRng(hashStr(houseId));
    const def = {
      id: `resident:${houseId}`,
      name: RESIDENT_NAMES[rng.int(RESIDENT_NAMES.length)],
      species: SPECIES_LIST[rng.int(SPECIES_LIST.length)],
      coat: COAT_LIST[rng.int(COAT_LIST.length)],
      lines: ['*waiting, with the door on the latch*'],
    };
    const v = new Villager(def, spot.x * TILE + TILE / 2, (spot.y + 1) * TILE - 2);
    v.recipient = d.id;
    v.range = 8;
    map.villagers.push(v);
  }

  /**
   * Hand the bag over. Paid for what you actually brought and the fee in full
   * for having turned up — a short delivery is still a delivery. Nothing at all
   * if you brought none of it, and no penalty either way.
   */
  completeDelivery(v, finish) {
    const st = this.state;
    const d = st.deliveries.find((x) => x.id === v.recipient);
    if (!d) { this.dialogue.say('*they look at you blankly*', { onDone: finish }); return; }
    const s = settle(d, (id) => st.cafeSim.stockCount(id));
    for (const id of s.brought) st.cafeSim.takeStock(id, 1);
    if (s.total) st.earn(s.total);
    // Turning up empty-handed is not a delivery, whatever the journal says.
    if (s.brought.length) st.countDelivery();

    st.clearDelivery(d.id);
    // Take them away, so the front room is empty on the way back — and so
    // somebody stood on a green is not still stood there afterwards.
    const map = this.currentMap;
    if (map.villagers) map.villagers = map.villagers.filter((x) => x !== v);
    const i = this.villagers.indexOf(v);
    if (i >= 0) this.villagers.splice(i, 1);

    let text;
    if (!s.brought.length) {
      text = `"...you have not brought any of it, have you."\n\n`
        + `They close the door with more patience than you deserve. `
        + `You are not out of pocket, but you are not in it either.`;
      audio.sfx('ui_back');
    } else if (s.missing.length) {
      text = `"Some of it, then."\n\nYou hand over ${orderText(s.brought)}. `
        + `They had also asked for ${orderText(s.missing)}.\n\n`
        + `${money(s.goods)} for the goods and ${money(s.fee)} for the walk — `
        + `${money(s.total)}. The fee is the fee whatever is in the bag.`;
      audio.sfx('cash', { gain: 0.7 });
    } else {
      text = `"All of it. Marvellous."\n\nYou hand over ${orderText(s.brought)}.\n\n`
        + `${money(s.goods)} for the goods and ${money(s.fee)} for the walk — ${money(s.total)}.`;
      audio.sfx('cash', { gain: 0.8 });
      st.reputation = clamp(st.reputation + 0.02, 0, 1);
      st.touch('reputation');
    }
    this.hud.toast(s.total ? `Delivered — ${money(s.total)}` : 'Nothing to deliver', s.total ? 'good' : 'warn');
    this.dialogue.say(text, { speaker: v.def.name, onDone: finish });
  }

  /** Is this phone ringing, and has anybody dealt with the call? */
  phoneCall() {
    const st = this.state;
    if (!st.cafe.furniture.some((f) => f.type === 'phone')) return null;
    return ringingNow(this.worldSeed, st.clock, (id) => !!st.flags[`call_${id}`]);
  }

  /**
   * The phone. Rings a few times a day at times the seed decides, so everybody
   * in the valley hears it at once; shakes and puts a mark over itself so you
   * can find it; and stops for good once somebody has answered or refused,
   * which is a flag and therefore shared.
   */
  updatePhone(dt) {
    const st = this.state;
    const map = st.cafeMap;
    const call = this.phoneCall();
    this.ringing = call;
    if (!map) return;
    const phones = map.objects.filter((o) => o.type === 'phone');
    if (!call || !phones.length) {
      for (const o of phones) { o.variant = 0; o.ringMark = false; }
      this.ringT = 0;
      return;
    }
    // Shake, and re-ring every couple of seconds while it goes unanswered.
    this.ringT = (this.ringT || 0) + dt;
    const shake = Math.floor(this.ringT * 7) % 4;
    for (const o of phones) {
      o.variant = shake === 1 ? 1 : shake === 3 ? 2 : 0;
      o.ringMark = true;
    }
    if (st.inCafe && (this.ringSfxT || 0) <= 0) {
      this.ringSfxT = 2.2;
      audio.sfx('ring', { gain: 0.5 });
    }
    this.ringSfxT = (this.ringSfxT || 0) - dt;
  }

  /** Pick up. An order, and the choice of taking it on or not. */
  answerPhone() {
    const st = this.state;
    const call = this.phoneCall();
    if (!call) {
      this.dialogue.say('The telephone. Cream bakelite, heavier than it looks.\n\nNobody is on it.');
      return;
    }
    const spots = this.deliverySpots();
    if (!spots.length) { this.dialogue.say('The line crackles and goes dead.'); return; }
    const seed = hashStr(`${this.worldSeed}:${call.id}`);
    const rng = makeRng(seed);
    const spot = spots[rng.int(spots.length)];
    const from = this.homeDoor || { x: spot.x, y: spot.y };
    const d = makeDelivery(spot, from, st.clock.absolute, () => rng());
    d.call = call.id;

    // Muted chatter down the line for as long as the call lasts.
    audio.setAmbience({ ...audio.ambience, chatter: 0.5, indoor: 0.2 });
    const hours = Math.max(1, Math.round((d.due - d.taken) / HOUR_SECONDS));
    // Short on purpose: the choice should be the second thing you see, not the
    // fifth page of it.
    this.dialogue.say(
      `"${orderText(d.items)}, to ${d.name}."\n\n`
      + `${money(fullValue(d))} all in. They can wait ${hours}h.`,
      {
        speaker: 'On the telephone',
        choices: [
          { label: 'Take the order', value: 'yes' },
          { label: 'Not today', value: 'no' },
        ],
        onDone: (v) => {
          st.flags[`call_${call.id}`] = v === 'yes' ? 'taken' : 'no';
          st.touch('flags');
          if (v === 'yes') {
            st.addDelivery(d);
            audio.sfx('quest', { gain: 0.6 });
            this.hud.toast(`Order for ${d.name} — see the map.`, 'good', 6);
          } else {
            audio.sfx('ui_back');
            this.hud.toast('You put the phone down.', 'info');
          }
        },
      },
    );
  }

  /** Have they already said the thing they keep coming in to say? */
  heardOut(id) {
    const st = this.state;
    return QUESTS.some((q) => q.giver === id && st.quests[q.id]);
  }

  /** Is one of their errands sat on a step only they can move along? */
  waitingOn(id) {
    const st = this.state;
    for (const q of QUESTS) {
      if (st.quests[q.id] !== 'active') continue;
      const o = currentStep(q, st).objective;
      if ((o.type === 'talk' || o.type === 'deliver') && o.to === id) return true;
      if (q.giver === id && objectiveMet(q, st)) return true;
    }
    return false;
  }

  /**
   * The sky is worked out rather than stored: same seed, same day, same
   * weather on every machine in the valley, with nothing sent between them.
   */
  updateWeather(dt) {
    const st = this.state;
    st.worldSeed = this.worldSeed;
    this.sky = st.sky;
    const was = this.weatherName;
    this.weatherName = this.sky.now.id;
    if (was && was !== this.weatherName && this.sky.blend > 0.5) {
      this.hud.toast(weatherLine(this.sky.now, st.clock.isDark), 'info', 5);
    }
    // Particles live wherever there is sky to fall through, which includes a
    // patio inside a building.
    const map = this.currentMap;
    this.weatherFx.update(dt, this.sky, !(map.outdoor || map.hasOpenSky));
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
        const water = map.countNear(tx, ty, isWater, 6) / total;
        const forest = map.countNear(tx, ty, (id) => id === T.FOREST_FLOOR, 6) / total;
        const sand = map.countNear(tx, ty, (id) => id === T.SAND, 6) / total;
        const nearOcean = tx < 90 && ty > 180;
        const sky = weatherAmbience(this.sky, false);
        audio.setAmbience({
          water: nearOcean ? 0 : clamp(water * 2.6, 0, 1),
          waves: nearOcean ? clamp((water + sand) * 2.2, 0, 1) : 0,
          forest: clamp(forest * 2.2, 0, 1),
          wind: clamp(0.3 + (1 - forest) * 0.25, 0, 1),
          ...sky,
        });
      }
    } else {
      const chatter = st.inCafe ? clamp(st.cafeSim.customers.length / 6, 0, 1) : 0;
      // Rain on the roof is worth hearing from inside — it is the reason the
      // room is empty. Standing out on the patio you are in it, not under it,
      // so it comes through unmuffled.
      const underSky = map.openSky(this.player.tx, this.player.ty);
      audio.setAmbience({
        indoor: underSky ? 0.15 : 0.45,
        chatter,
        ...weatherAmbience(this.sky, !underSky),
      });
    }
    audio.update(dt, { night: light.night });
  }

  // ------------------------------------------------------------ day roll

  onNewDay(opts = {}) {
    const st = this.state;
    // Cashing up is a change to the shared books, so only one client does it;
    // the others are sent the finished card so everyone reads the same figures.
    if (!net.simOwner) return;
    const summary = st.endOfDay();
    summary.slept = !!opts.slept;
    net.sendSummary(summary);
    this.showSummary(summary);
  }

  showSummary(summary) {
    const st = this.state;
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

    // Getting off takes priority over everything: it is the same key that got
    // you on, and while you are up there nothing else is in reach anyway.
    if (this.riding) { this.dismountBear(); return; }
    // She is put down beside your own front door, so she must not swallow the
    // press meant for it: whatever you are pointed at wins, exactly as it does
    // for people standing in front of things.
    if (this.bearInReach() && !map.interactAt(f.x, f.y)) { this.useBear(); return; }

    // Serving a waiting customer takes priority — it's time-sensitive.
    // No confirmation blip here. Answering an ask has two outcomes and they
    // are supposed to sound different; a cheerful "click" on the way in made
    // both of them sound the same.
    if (st.inCafe && this.tryServe()) return;

    // Someone to talk to?
    const list = (st.mapId === 'overworld' ? this.villagers : (map.villagers || []))
      .filter((v) => v.shift === 'here');
    let best = null, bestD = 26;
    for (const v of list) {
      const d = Math.hypot(v.x - this.player.x, v.y - this.player.y);
      if (d < bestD) { bestD = d; best = v; }
    }
    // Whatever you are pointed at beats whoever happens to be standing nearby.
    // The ghost at the hedge stands close enough to the bushes to win every
    // press, which made the hedge — the first step of his own errand —
    // unreachable, so his quest could never start.
    const facing = map.interactAt(f.x, f.y);
    const onIt = best && best.tx === f.x && best.ty === f.y;
    if (best && (!facing || onIt)) { this.talkTo(best); return; }

    // Then whatever tile we're facing, or the one we're standing on. Pass the
    // tile the trigger was actually found on — doors record it as the spot to
    // put you back on when you come out, and the facing tile is the wall.
    let tile = f;
    let it = facing;
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
        // Every cat in the room, in its own voice, slightly staggered.
        st.catActors.forEach((c, i) => setTimeout(() => c.speak(0, { gain: 1.2 }), i * 130));
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
    st.touchCats();
  }

  /**
   * Reading is how you find things out. What you learn is kept as a flag
   * rather than an item: it can't be dropped, sold, or handed to anyone, and a
   * quest step can simply ask whether you know a thing yet.
   */
  readBook(id) {
    const st = this.state;
    const bk = BOOK_BY_ID[id];
    if (!bk) return;
    const known = !!st.flags[bk.flag];
    audio.sfx('ui_ok', { gain: 0.4 });
    this.dialogue.say(bk.text, {
      speaker: bk.title,
      onDone: () => {
        if (known) return;
        st.flags[bk.flag] = true;
        st.touch('flags');
        audio.sfx('quest', { gain: 0.6 });
        this.hud.toast(`You've read: ${bk.title}`, 'good', 5);
        this.checkQuestProgress();
      },
    });
  }

  /**
   * Poking about in a hedge, or in the mud under a pier. What you get out
   * depends on what you already know to look for — which is the whole shape of
   * the longer jobs: find out, then go back and look again.
   */
  searchSpot(spot) {
    const st = this.state;
    const found = SEARCH_SPOTS[spot];
    if (!found) return;
    const res = found(st, this);
    audio.sfx(res.sfx || 'bush', { gain: 0.7 });
    if (res.give) {
      st.give(res.give[0], res.give[1] || 1);
      st.flags[`found_${spot}`] = true;
      st.touch('flags');
    }
    if (res.flag) { st.flags[res.flag] = true; st.touch('flags'); }
    this.dialogue.say(res.text, {
      speaker: res.speaker,
      onDone: () => {
        if (res.give) this.hud.toast(`Found: ${st.itemName(res.give[0])}`, 'good', 5);
        this.checkQuestProgress();
      },
    });
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

      case 'book':
        this.readBook(it.book);
        break;

      case 'search':
        this.searchSpot(it.spot);
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

      case 'phone':
        this.answerPhone();
        break;

      case 'taxi':
        this.openTaxi(it.town);
        break;

      default:
        break;
    }
  }

  openDoor(it, tile) {
    // Nobody takes a bear indoors. She waits outside, which is also where you
    // will want her when you come back out.
    if (this.riding) this.dismountBear();

    const st = this.state;
    // Somebody's front door. Every cottage opens; the only ones with anything
    // in them are the ones expecting a delivery.
    if (it.house) {
      const key = `house:${it.house}`;
      let map = this.maps.get(key);
      if (!map) { map = buildHouseInterior(it.house); this.maps.set(key, map); }
      this.fitRecipient(map, it.house);
      this.enterInterior(key, map, tile.x, tile.y);
      return;
    }
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
            this.player.alpha = 1;
            this.hud.toast('You slept like a log.', 'good');
            // One valley, one morning: the server moves everybody's clock and
            // tells us all that the day rolled.
            if (st.shared) { net.skipTo(7); return; }
            st.clock.skipTo(7);
            this.onNewDay({ slept: true });
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
    st.touch('flags');
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
      st.touch('mail');
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
        st.touch('friends');
        audio.sfx('wing', { gain: 0.7 });
        // They'll write back in a day or two, sometimes with something in the envelope.
        st.pendingLetters.push({
          from: name,
          day: st.clock.day + 1 + Math.floor(Math.random() * 2),
          text: replyText(name),
          gift: Math.random() < 0.55 ? [['treats', 2], ['honey', 1], ['wildflowers', 1], ['toy_yarn', 1]][Math.floor(Math.random() * 4)] : null,
        });
        st.touch('pendingLetters');
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
            st.spend(fare);
            this.flyTaxi(p);
          },
        }));
      },
    });
  }

  // ------------------------------------------------------------- dialogue

  /**
   * Write down that somebody has told us their one useful thing.
   *
   * A hint is not just a line of dialogue: quests read these flags, and some
   * jobs will not be offered until the hint that explains them has been heard.
   * A player who hears it and then forgets is left with a journal that still
   * says "ask around" — so if the note changed, say so, because the journal is
   * where you look when you have forgotten what somebody said.
   */
  recordHint(id) {
    const st = this.state;
    const before = this.journalLines();
    st.flags[`heard_hint_${id}`] = true;
    st.touch('flags');
    if (this.journalLines() !== before) {
      this.hud.toast('Your journal is updated.', 'good', 5);
    }
  }

  /** Every active job's note, as one string — for telling whether one moved. */
  journalLines() {
    return QUESTS.filter((q) => this.state.quests[q.id] === 'active')
      .map((q) => progressText(q, this.state)).join('|');
  }

  talkTo(v) {
    const st = this.state;
    const def = v.def;
    v.talking = true;
    v.faceTowards(this.player.x, this.player.y);
    const finish = () => { v.talking = false; };

    // Somebody waiting on an order wants the order, not the weather.
    if (v.recipient) { this.completeDelivery(v, finish); return; }

    // 1. Handing over, or reporting in on, whatever step is in play.
    for (const q of QUESTS) {
      if (st.quests[q.id] !== 'active') continue;
      const step = currentStep(q, st);
      const o = step.objective;
      // Deliveries and errands that end in "go and find X" are both finished by
      // standing in front of the right person.
      const delivering = o.type === 'deliver' && o.to === def.id && st.has(o.item);
      const meeting = o.type === 'talk' && o.to === def.id;
      if (!delivering && !meeting) continue;
      if (delivering) st.take(o.item);
      this.advanceQuest(q, v, finish, step);
      return;
    }

    // 2. Turning a finished step back in to whoever set the job.
    const mine = QUESTS_BY_GIVER[def.id] || [];
    for (const q of mine) {
      if (st.quests[q.id] !== 'active') continue;
      const step = currentStep(q, st);
      if (step.objective.type === 'deliver' || step.objective.type === 'talk') continue;
      if (!objectiveMet(q, st)) continue;
      this.advanceQuest(q, v, finish, step);
      return;
    }

    // 3. Offering a new job.
    for (const q of mine) {
      if (st.quests[q.id]) continue;
      if (!this.questAvailable(q)) continue;
      this.dialogue.say(q.offer, {
        speaker: def.name,
        onDone: () => {
          finish();
          // Somebody else may have taken this on in the time it took to read
          // the offer. Accepting again would hand out a second parcel and put
          // the step count back to the start for both of you.
          if (!st.startQuest(q.id)) { this.refreshQuestMarks(); return; }
          // Deliver-type errands hand you the parcel there and then.
          const first = questSteps(q)[0].objective;
          if (first.type === 'deliver' && first.give !== false) st.give(first.item, 1);
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
        this.dialogue.say(progressText(q, st), { speaker: def.name, onDone: finish });
        return;
      }
    }

    // 4b. The one thing in the valley that is sold by a person rather than a
    // counter. Too big for a shop and too singular for a stock list.
    if (def.sells === 'bear') { this.offerBear(def, v, finish); return; }

    // 5. Ordinary chatter, with the odd hint or piece of gossip.
    let line;
    const roll = Math.random();
    const heardHint = st.flags[`heard_hint_${def.id}`];
    // Somebody whose hint is the only way on gets it out at once. Shrimp knows
    // where the shell went, and until he has said so Moth will not raise the
    // job that ends in it — so hearing his chatter first and his hint second
    // left the errand looking broken from both ends.
    const gating = QUESTS.some((q) => q.needsHint === def.id && !st.quests[q.id])
      || def.tellsFirst;
    if (def.hint && (!heardHint && (gating || v.lineIndex >= 1) || roll < 0.2)) {
      // Anyone with something genuinely useful to say gets it out by the second
      // conversation, rather than hiding it behind an invisible friendship roll.
      //
      // Every telling counts, including the ones that come up by chance. The
      // second branch used to speak the hint without recording it, so a player
      // could be told in as many words where the shell went and have the world
      // still hold that they had never asked.
      line = def.hint;
      if (!heardHint) this.recordHint(def.id);
    } else if (roll < 0.16) line = GOSSIP[Math.floor(Math.random() * GOSSIP.length)];
    else {
      line = def.lines[v.lineIndex % def.lines.length];
      v.lineIndex++;
    }
    st.friends[def.id] = clamp((st.friends[def.id] || 0) + 0.02, 0, 1);
    st.touch('friends');
    v.showEmote('talk', 1.2);
    this.dialogue.say(line, { speaker: def.name, onDone: finish });
  }

  questAvailable(q) {
    const st = this.state;
    // Some jobs are only handed out by people who are only out at night. This
    // is belt and braces — you can't talk to them by day anyway — but it also
    // stops a night job appearing in the journal from a daytime conversation.
    if (q.night && !st.clock.isDark) return false;
    // Gate a couple of the bigger jobs behind a little progress.
    if (q.id === 'busy_day' && st.reputation < 0.3) return false;
    if (q.id === 'first_extension' && st.workers < 1 && st.money < 400) return false;
    if (q.id === 'rare_cat' && st.cats.length < 2) return false;
    if (q.id === 'music_night' && st.reputation < 0.25) return false;
    // Moth has the shell somebody is after, but he is not going to bring it up
    // unaided — you have to have heard from Shrimp that it went to him. Without
    // this the shell errand sends you to a beach that has not had a shell on it
    // in years, which is where it used to end.
    if (q.needsHint && !st.flags[`heard_hint_${q.needsHint}`]) return false;
    return true;
  }

  /**
   * One step of a job is done. Either move on to the next — saying whatever
   * this step ends with, and handing over anything the next one needs — or, if
   * that was the last, finish the whole thing.
   */
  advanceQuest(q, v, finish, step) {
    const st = this.state;
    if (isLastStep(q, st)) { this.completeQuest(q, v, finish); return; }

    st.setQuestStep(q.id, stepIndex(q, st) + 1);
    if (step.gives) for (const [id, n] of step.gives) st.give(id, n);
    if (step.flags) { for (const f of step.flags) st.flags[f] = true; st.touch('flags'); }
    const next = currentStep(q, st);
    // A delivery step normally comes with the parcel; `give: false` is for the
    // ones where you're carrying something you found yourself.
    if (next.objective.type === 'deliver' && next.objective.give !== false) {
      st.give(next.objective.item, 1);
    }

    audio.sfx('quest', { gain: 0.55 });
    this.dialogue.say(step.done || 'Right. Next thing, then.', {
      speaker: v ? v.def.name : q.title,
      onDone: () => { finish?.(); this.refreshQuestMarks(); },
    });
    this.hud.toast(`${q.title}: ${objectiveText(q, st)}`, 'good', 6);
  }

  completeQuest(q, v, finish) {
    const st = this.state;
    st.finishQuest(q.id);
    const r = q.reward || {};
    if (r.money) st.earn(r.money);
    if (r.items) for (const [id, n] of r.items) st.give(id, n);
    if (r.flags) for (const f of r.flags) st.flags[f] = true;
    if (r.rep) st.reputation = clamp(st.reputation + r.rep, 0, 1);
    if (r.friendship) for (const f of r.friendship) st.friends[f] = clamp((st.friends[f] || 0) + 0.4, 0, 1);
    if (r.hint) st.flags[`hint_${r.hint}`] = true;
    for (const k of ['flags', 'reputation', 'friends']) st.touch(k);
    audio.sfx('fanfare', { gain: 0.7 });
    const rewardLine = r.money ? `\n\n(+${money(r.money)})` : '';
    this.dialogue.say(q.complete + rewardLine, {
      speaker: v.def.name,
      onDone: () => { finish(); this.refreshQuestMarks(); },
    });
    this.hud.toast(`Finished: ${q.title}`, 'good');
    if (q.reward?.hint === 'taxi') this.hud.toast('Taxi birds unlocked — look for the perches.', 'good');
  }

  /** Would this person have something to say about `q` right now? */
  wantsToTalk(q, st) {
    if (!st.quests[q.id]) return this.questAvailable(q);
    if (st.quests[q.id] !== 'active') return false;
    const o = currentStep(q, st).objective;
    return o.type !== 'deliver' && o.type !== 'talk' && objectiveMet(q, st);
  }

  /** Put a ! over anyone who has something for you. */
  refreshQuestMarks() {
    const st = this.state;
    for (const v of this.villagers) {
      // Somebody waiting for an order always has something for you, and is not
      // in the quest table at all — this pass would quietly unmark them.
      if (v.recipient) { v.hasQuestMark = true; continue; }
      const mine = QUESTS_BY_GIVER[v.def.id] || [];
      v.hasQuestMark = mine.some((q) => this.wantsToTalk(q, st));
    }
    for (const [, map] of this.maps) {
      if (!map.villagers) continue;
      for (const v of map.villagers) {
        const mine = QUESTS_BY_GIVER[v.def.id] || [];
        v.hasQuestMark = mine.some((q) => this.wantsToTalk(q, st));
      }
    }
  }

  /**
   * Bring every job in play back into line with what has actually been done,
   * and say so if anything moved. Cheap, and called at the points where the
   * world has just changed, so a job can't sit stuck behind a step you have
   * demonstrably finished.
   */
  /**
   * Take every barrier that has already been cleared back out of the world.
   *
   * Clearing one removes its boulders there and then, which is right for the
   * moment it happens and no use whatsoever afterwards: the valley is rebuilt
   * from the seed every time the game starts, so the stones come back while
   * the flag saying they are gone persists. The result is a pass permanently
   * shut by rubble the game believes it has already cleared — `tryBarrier`
   * sees the flag and returns without doing anything.
   *
   * The same gap shuts out anyone joining a shared valley after somebody else
   * cleared it, and anyone standing there when they do.
   */
  applyClearedBarriers() {
    const st = this.state;
    let removed = 0;
    for (const o of [...this.overworld.objects]) {
      if (!o.id || !st.flags[`barrier_${o.id}`]) continue;
      this.overworld.removeObject(o);
      removed++;
    }
    if (removed) this.renderer.invalidateAll();
    return removed;
  }

  /**
   * Reconcile a save with the world it describes. Only for loading and joining:
   * in play, a step moving is progress rather than a correction, and saying so
   * is alarming.
   */
  repairQuests() {
    const st = this.state;
    // Put back anything one-of-a-kind that has gone astray before working out
    // where the player has got to — a step that wants the collar cannot be
    // judged while the collar is missing.
    const found = repairLostItems(st, (id, n) => {
      st.give(id, n);
      this.hud.toast(`${st.itemName(id)} turned up again — check your bag.`, 'good', 7);
    });
    const moved = repairAllSteps(st);
    if (!moved && !found) return;
    if (moved) {
      this.hud.toast(moved === 1 ? 'Your journal was out of date. Fixed.'
        : `${moved} journal entries were out of date. Fixed.`, 'good', 6);
    }
    this.refreshQuestMarks();
  }

  /**
   * Something happened in the world that a job might care about. Only the marks
   * over people's heads change: the step itself moves when you go back and tell
   * whoever asked, which is where their reply to it lives.
   *
   * This used to run the repair, so standing in the stone circle on a brand new
   * game advanced the step *and* announced that the journal had been out of
   * date — on a save four minutes old, having done exactly the right thing.
   */
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
        if (!v.present) continue;
        if (Math.abs(v.x - cx) > 340 || Math.abs(v.y - cy) > 260) continue;
        actors.push(v);
      }
    } else if (map.villagers) {
      for (const v of map.villagers) actors.push(v);
    }
    if (st.inCafe) {
      if (this.employeeActor) actors.push(this.employeeActor);
      for (const c of st.catActors) actors.push(c);
      for (const c of st.cafeSim.customers) actors.push(c);
    }
    for (const r of this.remotes.values()) {
      if (r.mapId === st.mapId) actors.push(r);
    }
    // She sorts with everything else when she is lounging about. When she is
    // being ridden she is drawn as part of the rider instead — see Renderer,
    // which asks an actor for what goes underneath it.
    if (this.bear && !this.riding && st.mapId === (st.bear?.map || 'overworld')) {
      actors.push(this.bear);
    }

    // Weather takes light out of the day on top of the hour, and colours what
    // is left: fog goes pale, rain and snow go blue.
    const wl = weatherLight(this.sky);
    const dimmed = map.outdoor ? clamp(light.night + wl.dim, 0, 1) : light.night;
    const tint = map.outdoor && wl.dim > light.night ? wl.tint : light.tint;
    this.renderer.draw(ctx, map, this.cam, actors, { night: dimmed, tint, lights });
    if (this.cutscene) this.cutscene.draw(ctx, this.cam.ox, this.cam.oy);
    this.drawWeatherOver(ctx, map, wl, light);

    this.hud.drawFloats(ctx, this.cam.ox, this.cam.oy);
    this.drawInteractPrompt(ctx);
    this.hud.draw(ctx, st, this.t, this.sky);
    this.dialogue.draw(ctx, this.t);

    for (const s of this.screens) s.draw(ctx, this, this.t);
    this.fader.draw(ctx);
  }

  /**
   * The weather, over the top of the finished frame so rain in the dark is
   * lit by the lamps below it — and clipped to the part of the world that has
   * sky over it. Outdoors that is the whole screen. Inside, it is the patio
   * and nothing else, so the rain falls on your terrace and stops at the wall.
   */
  drawWeatherOver(ctx, map, wl, light) {
    if (!map.outdoor && !map.hasOpenSky) return;
    ctx.save();
    const any = this.renderer.skyPath(ctx, map, this.cam);
    if (!any) { ctx.restore(); return; }
    ctx.clip();
    // A terrace under a grey sky is grey, even when the room it opens off is
    // warmly lit. Only worth doing indoors — outside, the renderer has
    // already taken the light out for us.
    if (!map.outdoor && wl.dim > 0.02) {
      ctx.globalAlpha = clamp(wl.dim, 0, 1);
      ctx.fillStyle = wl.tint;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
    this.weatherFx.draw(ctx, this.sky, false);
    ctx.restore();
  }

  /** A small floating prompt when something is within reach. */
  drawInteractPrompt(ctx) {
    this.promptLabel = null;
    if (this.dialogue.active || this.screens.length) return;
    const st = this.state;
    const map = this.currentMap;
    const f = this.player.facingTile();
    let label = null;

    if (st.inCafe) {
      for (const c of st.cafeSim.customers) {
        if (c.state !== 'waiting' || c.served) continue;
        if (Math.hypot(c.x - this.player.x, c.y - this.player.y) >= 34) continue;
        // Say which it's going to be. You can see the icon over their head, but
        // you can't see the pantry from here, and that is the whole decision.
        const want = ITEMS[c.order]?.name;
        label = !want ? 'Serve them'
          : st.cafeSim.stockCount(c.order) > 0 ? `Serve ${want}` : `Out of ${want}`;
        break;
      }
    }
    if (!label && this.riding) label = 'Get down';
    if (!label && this.bearInReach() && !map.interactAt(f.x, f.y)) {
      label = bearPrompt(st.bear, st.clock, this.fishToHand());
    }
    if (!label) {
      const list = st.mapId === 'overworld' ? this.villagers : (map.villagers || []);
      for (const v of list) {
        if (v.shift !== 'here') continue;
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
    this.promptLabel = label;
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

// What this browser last played as. Kept out of the save file on purpose: it
// belongs to the machine rather than to the valley, so it is still there for a
// brand new game, and on a shared laptop each browser profile keeps its own.
const ME_KEY = 'catcafe.me';

function loadMe() {
  try {
    const raw = localStorage.getItem(ME_KEY);
    if (!raw) return null;
    const me = JSON.parse(raw);
    // Anything saved by an older version, or hand-edited, has to be checked
    // before it is trusted — an unknown coat would paint nothing at all.
    const coat = COAT_LIST.includes(me.coat) ? me.coat : null;
    const cloth = CLOTHES.includes(me.cloth) ? me.cloth : null;
    const name = typeof me.name === 'string' && me.name.trim() ? me.name.slice(0, 16) : null;
    if (!coat && !cloth && !name) return null;
    return { name, coat, cloth };
  } catch { return null; }
}

function saveMe(name, look) {
  try {
    localStorage.setItem(ME_KEY, JSON.stringify({ name, coat: look.coat, cloth: look.cloth }));
  } catch { /* private browsing; not worth mentioning */ }
}

/** The sky-to-meadow backdrop with drifting clouds, behind title and lobby. */
function drawSky(ctx, t) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, '#8fd3f0');
  grad.addColorStop(0.55, '#c9e9f2');
  grad.addColorStop(0.56, '#7ac457');
  grad.addColorStop(1, '#3f8236');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 5; i++) {
    const cx = ((t * (6 + i * 3) + i * 137) % (VIEW_W + 90)) - 45;
    const cy = 18 + i * 16;
    ctx.beginPath();
    ctx.arc(cx, cy, 9 + i, 0, Math.PI * 2);
    ctx.arc(cx + 12, cy + 2, 7 + i, 0, Math.PI * 2);
    ctx.arc(cx - 12, cy + 3, 6 + i, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

/** "three days ago", "20 minutes ago" — how long since anyone was in there. */
function agoText(ms) {
  if (!ms) return 'never played';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} minutes ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** The in-world clock as a person would say it. */
function worldTime(day, t) {
  const hour = Math.floor(t / HOUR_SECONDS) % 24;
  const min = Math.floor((t % HOUR_SECONDS) / HOUR_SECONDS * 60);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${DAY_FULL[day % 7]} ${h12}:${String(min).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * Which valley to walk into. Shown only when the server is offering more than
 * one, since a lobby in front of a single game is a door to open on the way to
 * a door.
 *
 * The stats belong to the highlighted row rather than to whatever the mouse is
 * over: this is played on a keyboard and on a phone, and neither of those has
 * a hover.
 */
class LobbyScreen extends Screen {
  constructor(game, games) {
    super();
    this.game = game;
    this.games = games;
    this.index = 0;
    this.busy = false;
    this.msg = '';
    this.confirm = null;      // the valley being thrown away, if any
    this.yes = false;         // which way the confirm is pointing
  }

  get rows() { return [...this.games, { newGame: true }]; }

  /** A valley can be deleted when it exists and nobody is connected to it. */
  canDelete(row) { return !!row && !row.newGame && !row.playing && !row.here; }

  update(dt, input) {
    this.t += dt;
    if (this.busy) return;

    // Throwing a valley away asks first, and starts on No.
    if (this.confirm) {
      if (input.repeat('left', dt) || input.repeat('right', dt)) {
        this.yes = !this.yes;
        audio.sfx('ui_move');
      }
      if (input.hit('cancel')) { this.confirm = null; audio.sfx('ui_back'); return; }
      if (!input.hit('use')) return;
      const doomed = this.confirm;
      this.confirm = null;
      if (!this.yes) { audio.sfx('ui_back'); return; }
      this.busy = true;
      this.msg = 'Removing...';
      audio.sfx('ui_ok');
      NetClient.deleteGame(doomed.id).then((res) => {
        this.busy = false;
        if (!res || !res.ok) {
          this.msg = res && res.why ? `Not removed: ${res.why}.` : 'Not removed.';
          audio.sfx('error');
          return;
        }
        this.msg = `${doomed.cafe || `Game ${doomed.id}`} is gone.`;
        this.refresh();
      });
      return;
    }

    const rows = this.rows;
    if (input.repeat('up', dt)) { this.index = (this.index - 1 + rows.length) % rows.length; audio.sfx('ui_move'); }
    if (input.repeat('down', dt)) { this.index = (this.index + 1) % rows.length; audio.sfx('ui_move'); }

    const row = rows[this.index];
    if (input.hit('cancel')) {
      if (!this.canDelete(row)) {
        if (row && !row.newGame) { this.msg = 'Somebody is in that one.'; audio.sfx('error'); }
        return;
      }
      this.confirm = row;
      this.yes = false;
      audio.sfx('ui_back');
      return;
    }

    if (!input.hit('use')) return;
    audio.sfx('ui_ok');
    this.busy = true;
    if (row.newGame) {
      this.msg = 'Making a new valley...';
      NetClient.newGame().then((made) => {
        if (!made) { this.busy = false; this.msg = 'The server would not make one.'; return; }
        this.enter(made.id);
      });
    } else {
      this.enter(row.id);
    }
  }

  /** Re-read the list after making or removing one. */
  refresh() {
    NetClient.listGames().then((list) => {
      this.games = list || [];
      this.game.lobbyGames = this.games;
      this.index = Math.min(this.index, this.rows.length - 1);
    });
  }

  enter(id) {
    this.msg = 'Joining...';
    this.game.enterGame(id).then((ok) => {
      if (ok) { this.done = true; return; }
      this.busy = false;
      this.msg = 'Could not join that one. Try another.';
    });
  }

  draw(ctx) {
    drawSky(ctx, this.t);
    drawTextCentered(ctx, 'CAT CAFE', VIEW_W / 2, 26, { color: '#3d2a1c', scale: 4 });
    drawTextCentered(ctx, 'CAT CAFE', VIEW_W / 2, 24, { color: '#ffd9a0', scale: 4 });

    const rows = this.rows;
    const w = 340, h = 150;
    const x = Math.round((VIEW_W - w) / 2), y = 62;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Which valley?');

    const listW = 160;
    const VIS = 6;
    const scroll = Math.max(0, Math.min(this.index - 2, rows.length - VIS));
    for (let i = 0; i < Math.min(VIS, rows.length); i++) {
      const idx = scroll + i;
      const row = rows[idx];
      if (!row) break;
      const ry = y + 22 + i * 16;
      const sel = idx === this.index;
      if (sel) {
        ctx.fillStyle = 'rgba(255,207,107,0.14)';
        ctx.fillRect(x + 8, ry - 3, listW, 15);
        cursor(ctx, x + 10, ry + 1, this.t);
      }
      const full = row.newGame ? 'New valley' : (row.cafe || `Game ${row.id}`);
      // Two dots rather than an ellipsis: the font is hand-authored and has no
      // such glyph, so it would draw nothing at all. The panel beside it has
      // the whole name in any case.
      const label = full.length > 23 ? `${full.slice(0, 21)}..` : full;
      drawText(ctx, label, x + 22, ry + 1,
        { color: sel ? P.uiGold : (row.newGame ? P.uiGreen : P.uiText), shadow: P.uiShadow });
      if (!row.newGame && row.playing) {
        drawText(ctx, '\u25cf', x + 8 + listW - 8, ry + 1, { color: P.uiGreen, shadow: P.uiShadow });
      }
    }

    // What the highlighted one is, always on show.
    const dx = x + listW + 22, dw = w - listW - 32;
    const row = rows[this.index];
    panel(ctx, dx, y + 20, dw, h - 34, { fill: P.uiBg2 });
    let ly = y + 30;
    const line = (text, col = P.uiTextDim) => {
      drawText(ctx, text, dx + 8, ly, { color: col, shadow: P.uiShadow });
      ly += LINE_H;
    };
    if (row && row.newGame) {
      line('A brand new valley,', P.uiText);
      line('a new seed, and an', P.uiText);
      line('empty cafe.', P.uiText);
    } else if (row) {
      line(row.cafe || `Game ${row.id}`, P.uiGold);
      ly += 2;
      if (!row.started) {
        line('Not started yet.');
        line('Nobody has opened');
        line('the cafe.');
      } else {
        line(worldTime(row.day, row.t));
        line(`Day ${row.daysPlayed + 1}`);
        line(`${money(row.money)}   ${row.cats} cat${row.cats === 1 ? '' : 's'}`);
        ly += 2;
        line(agoText(row.lastPlayed));
      }
      if (row.playing) line(`${row.playing} playing now`, P.uiGreen);
      else if (row.here) line(`${row.here} in the lobby`, P.uiGreen);
    }

    const hint = this.canDelete(row)
      ? 'Up / Down to choose    Space to join    X to delete'
      : 'Up / Down to choose    Space to join';
    drawTextCentered(ctx, this.msg || hint,
      VIEW_W / 2, y + h + 10, { color: this.msg ? P.uiGold : '#2f3d22' });

    if (this.confirm) this.drawConfirm(ctx);
  }

  /** "Are you sure?" — starting on No, because the answer is usually no. */
  drawConfirm(ctx) {
    dim(ctx, 0.6);
    const w = 250, h = 84;
    const x = Math.round((VIEW_W - w) / 2), y = Math.round((VIEW_H - h) / 2);
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Delete this valley?');
    const name = this.confirm.cafe || `Game ${this.confirm.id}`;
    drawTextCentered(ctx, name, x + w / 2, y + 18, { color: P.uiGold, shadow: P.uiShadow });
    if (this.confirm.started) {
      drawTextCentered(ctx, `Day ${this.confirm.daysPlayed + 1}, ${this.confirm.cats} cats, `
        + `${money(this.confirm.money)}`, x + w / 2, y + 32, { color: P.uiTextDim, shadow: P.uiShadow });
    }
    drawTextCentered(ctx, 'This cannot be undone.', x + w / 2, y + 46,
      { color: P.uiRed, shadow: P.uiShadow });

    const opts = [['No', !this.yes], ['Yes, delete it', this.yes]];
    let ox = x + 26;
    opts.forEach(([label, on]) => {
      const bw = textWidth(label) + 16;
      ctx.fillStyle = on ? 'rgba(255,207,107,0.18)' : 'rgba(0,0,0,0.25)';
      ctx.fillRect(ox, y + h - 26, bw, 15);
      if (on) {
        ctx.strokeStyle = P.uiGold;
        ctx.strokeRect(ox + 0.5, y + h - 26.5, bw, 15);
      }
      drawText(ctx, label, ox + 8, y + h - 23,
        { color: on ? P.uiGold : P.uiTextDim, shadow: P.uiShadow });
      ox += bw + 14;
    });
  }
}

class TitleScreen extends Screen {
  constructor(game) {
    super();
    this.game = game;
    this.stage = 'title';
    this.index = 0;
    // Continue means "pick this valley back up", not "pour in whatever this
    // browser played last". In a session the valley has a seed and the save has
    // to match it: a new valley is new, and the only thing to do in one is
    // start. The one case this keeps is the useful one — a valley the server
    // has forgotten but this browser has not, where Continue hands it back.
    const mine = game.net.connected
      ? GameState.hasSave(game.worldSeed)
      : GameState.hasSave();
    this.options = mine ? ['Continue', 'New game'] : ['New game'];
    // Whatever this browser played as last time, so the usual answer is just
    // to press Space.
    const me = loadMe();
    this.look = {
      species: 'cat',
      coat: (me && me.coat) || 'ginger',
      cloth: (me && me.cloth) || CLOTHES[5],
    };
    // Only shown when there's a session: solo play needs no name.
    this.multiplayer = !!game.net.connected;
    // Somebody has already opened the cafe, so its paint isn't ours to pick.
    this.joining = false;
    if (game.net.world) this.adoptOpenCafe();
    this.name = game.state.playerName || (me && me.name)
      || PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
    this.remembered = !!me;
    this.style = {
      wall: WALL_CHOICES[0], roof: ROOF_CHOICES[0], awning: AWNING_CHOICES[0],
      floor: T.FLOOR_WOOD, name: CAFE_NAMES[0],
    };
    this.row = 0;
  }

  /** There's a cafe already: show its colours, and drop the choices we can't make. */
  adoptOpenCafe() {
    this.joining = true;
    this.options = ['Join the cafe'];
    this.index = 0;
    this.row = Math.min(this.row, 2);
    const c = this.game.net.world.cafe;
    if (c) this.style = { wall: c.wall, roof: c.roof, awning: c.awning, floor: c.floor, name: c.name };
  }

  update(dt, input) {
    this.t += dt;
    // Somebody may open the cafe while we're still reading the title.
    if (!this.joining && this.game.net.world) this.adoptOpenCafe();
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
    const rows = this.joining ? 3 : (this.multiplayer ? 6 : 5);
    if (input.repeat('up', dt)) { this.row = (this.row - 1 + rows) % rows; audio.sfx('ui_move'); }
    if (input.repeat('down', dt)) { this.row = (this.row + 1) % rows; audio.sfx('ui_move'); }
    const dir = input.repeat('right', dt) ? 1 : input.repeat('left', dt) ? -1 : 0;
    if (dir) {
      audio.sfx('ui_move');
      const step = (arr, cur) => arr[(arr.indexOf(cur) + dir + arr.length) % arr.length];
      if (this.multiplayer && this.row === 0) this.name = step(PLAYER_NAMES, this.name);
      else {
        const r = this.row - (this.multiplayer ? 1 : 0);
        if (r === 0) this.look.coat = step(COAT_LIST, this.look.coat);
        else if (r === 1) this.look.cloth = step(CLOTHES, this.look.cloth);
        else if (r === 2) this.style.roof = step(ROOF_CHOICES, this.style.roof);
        else if (r === 3) this.style.awning = step(AWNING_CHOICES, this.style.awning);
        else this.style.name = step(CAFE_NAMES, this.style.name);
      }
    }
    if (input.hit('use')) {
      audio.sfx('levelup', { gain: 0.6 });
      this.done = true;
      this.game.state.playerName = this.name;
      saveMe(this.name, this.look);
      this.game.startNewGame({ ...this.look }, { ...this.style });
    }
    if (input.hit('cancel')) { this.stage = 'title'; audio.sfx('ui_back'); }
  }

  draw(ctx) {
    drawSky(ctx, this.t);

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
      // Naming the host matters: the commonest way to end up alone is for each
      // player to run their own server and browse to their own localhost.
      const n = this.game.net;
      if (n.connected) {
        const here = Math.max(1, n.here);
        drawTextCentered(ctx, here > 1 ? `${here} here — shared valley on ${n.host}`
          : `Shared valley on ${n.host} — you're the only one connected`,
        VIEW_W / 2, VIEW_H - 26, { color: here > 1 ? '#1f4d2a' : '#2f3d22' });
        drawTextCentered(ctx, 'Everyone must open this same address',
          VIEW_W / 2, VIEW_H - 14, { color: '#2f3d22' });
      } else if (n.everConnected) {
        // Never leave a stale count on screen: it reads as "we're fine".
        drawTextCentered(ctx, `Lost the valley on ${n.host} — trying again...`,
          VIEW_W / 2, VIEW_H - 18, { color: '#6b2f2f' });
      } else {
        drawTextCentered(ctx, 'Arrows / WASD to move   Space to act   Esc for the menu',
          VIEW_W / 2, VIEW_H - 18, { color: '#2f3d22' });
      }
      return;
    }

    // --- creation ---
    dim(ctx, 0.28);
    const w = 340, h = this.joining ? 200 : (this.multiplayer ? 218 : 196);
    const x = Math.round((VIEW_W - w) / 2), y = this.multiplayer ? 18 : 26;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, x, y, w, 'Before you open');

    // Live preview: the cafe you're choosing, with you standing at its door.
    // Building and character are drawn at the same zoom so the proportions
    // match what you'll actually see in the valley.
    const Z = 2;
    const shop = buildingSprite({
      tw: 3, wall: this.style.wall, roof: this.style.roof, roofStyle: 'tile',
      timbered: false, wallH: 24, roofH: 20, windows: 1,
      signKey: 'cafe', signBg: null, awning: this.style.awning, v: 0,
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
    // Your name comes first when joining a shared valley.
    const nameRow = this.multiplayer ? 1 : 0;
    if (this.multiplayer) {
      const ry = y + 32;
      const sel = this.row === 0;
      if (sel) {
        ctx.fillStyle = 'rgba(255,207,107,0.14)';
        ctx.fillRect(colX - 12, ry - 5, (x + w - 10) - (colX - 12), 22);
        cursor(ctx, colX - 10, ry + 1, this.t);
      }
      drawText(ctx, 'You are', colX + 4, ry + 1, { color: sel ? P.uiGold : P.uiText, shadow: P.uiShadow });
      drawTextRight(ctx, `< ${this.name} >`, x + w - 16, ry + 1,
        { color: sel ? P.uiGold : P.uiTextDim, shadow: P.uiShadow });
    }

    // Four colour swatches in the right-hand column...
    const swatchRows = this.joining ? [
      ['Your coat', COATS[this.look.coat]?.fur],
      ['Your clothes', this.look.cloth],
    ] : [
      ['Your coat', COATS[this.look.coat]?.fur],
      ['Your clothes', this.look.cloth],
      ['Cafe roof', this.style.roof],
      ['Cafe awning', this.style.awning],
    ];
    swatchRows.forEach(([label, swatch], i) => {
      const ry = y + 32 + (i + nameRow) * 26;
      const sel = i + nameRow === this.row;
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
    if (this.joining) {
      // In the right-hand column, under the swatches: across the whole panel it
      // would be written over the cafe we're previewing.
      const mid = (colX - 12 + x + w - 10) / 2;
      drawTextCentered(ctx, `${this.style.name || 'The cafe'}`,
        mid, y + 112, { color: P.uiGold, shadow: P.uiShadow });
      drawTextCentered(ctx, 'is already open', mid, y + 124, { color: P.uiGold, shadow: P.uiShadow });
      drawTextCentered(ctx, 'You just need a face', mid, y + 146, { color: P.uiTextDim, shadow: P.uiShadow });
      drawTextCentered(ctx, 'and a name', mid, y + 158, { color: P.uiTextDim, shadow: P.uiShadow });
    } else {
      const ry = y + h - 46;
      const sel = this.row === 4 + nameRow;
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
  await g.ready;
  // Nothing to skip past if a valley still has to be chosen: autostart means
  // "don't make me press Space through the title", not "pick for me".
  // A lobby means a valley still has to be chosen. Autostart means "don't make
  // me press Space through the title", so it takes the first one on offer.
  if (g.lobbyGames && g.lobbyGames.length) await g.enterGame(g.lobbyGames[0].id);
  g.screens.length = 0;
  g.startNewGame({ species: 'cat', coat: 'ginger', cloth: CLOTHES[5] },
    { wall: WALL_CHOICES[0], roof: ROOF_CHOICES[0], awning: AWNING_CHOICES[0],
      floor: T.FLOOR_WOOD, name: CAFE_NAMES[0] });
  g.dialogue.active = false;
}
