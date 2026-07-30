// Interiors. Shops are laid out from a small recipe; the cafe is rebuilt from
// whatever the player has actually constructed, so knocking through a wall in
// the build mode changes the room you walk around in.

import { GameMap } from './tilemap.js';
import { T, OUTDOOR_FLOORS } from '../art/tiles.js';
import { SHOPS, BOOKS } from './places.js';
import { makeRng, hashStr } from '../engine/util.js';
import { OBJECTS } from '../art/objects.js';

// Windows hang on the wall rather than standing on the floor. The natural
// resting place for an object is the bottom of its tile, which for a window in
// the wall row puts its sill exactly on the floorboards.
const WALL_MOUNT = -6;

/**
 * Turn a set of room rectangles into a walled interior.
 * Walls are derived rather than authored: any tile touching floor becomes wall,
 * with the row above a north wall getting the blank upper course.
 */
function wallInRooms(map, rooms, floorId) {
  const roomAt = (x, y) => rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const isFloor = (x, y) => !!roomAt(x, y);
  const floorOf = (r) => r.floor ?? floorId;
  const isOutside = (r) => r && OUTDOOR_FLOORS.has(floorOf(r));

  for (const r of rooms) map.fillRect(r.x, r.y, r.w, r.h, floorOf(r));

  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (isFloor(x, y)) continue;
      // Which rooms this edge tile is the edge of. A tile between a parlour
      // and a patio belongs to the parlour: the room that needs a wall wins,
      // or the cafe would have a railing where its outside wall should be.
      const near = [];
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const r = roomAt(x + i, y + j);
          if (r && !near.includes(r)) near.push(r);
        }
      }
      if (!near.length) continue;
      const railing = near.every(isOutside);
      // Something with floor directly below it is what we look at face-on.
      const faceOn = isFloor(x, y + 1);
      if (!railing) { map.set(x, y, faceOn ? T.WALL_IN : T.WALL_TOP); continue; }
      // A fence, unlike a wall, has to know which way it runs: the side of a
      // patio drawn with the front-facing tile reads as a row of dashes.
      const sideOn = !faceOn && (isFloor(x - 1, y) || isFloor(x + 1, y));
      map.set(x, y, faceOn ? T.RAIL_IN : sideOn ? T.RAIL_V : T.RAIL_TOP);
    }
  }
  // One more blank course above every face wall, so rooms have visible height.
  // Railings get none: a fence is the height of a fence, and stacking a second
  // course on it would wall the patio in, which is the opposite of the point.
  for (let y = map.h - 1; y >= 1; y--) {
    for (let x = 0; x < map.w; x++) {
      if (map.get(x, y) === T.WALL_IN && !isFloor(x, y - 1) && map.get(x, y - 1) === T.VOID) {
        map.set(x, y - 1, T.WALL_TOP);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

const SHOP_LAYOUTS = {
  grocer: { w: 15, h: 11, floor: T.FLOOR_WOOD, fixtures: ['shelfFood', 'shelfFood', 'crate', 'barrel'] },
  bakery: { w: 15, h: 11, floor: T.FLOOR_TILE, fixtures: ['pastryCase', 'shelfFood', 'plantPot'] },
  petshop: { w: 17, h: 12, floor: T.FLOOR_WOOD, fixtures: ['catTower', 'catBed', 'shelf', 'plantPot'] },
  inn: { w: 17, h: 12, floor: T.FLOOR_WOOD, fixtures: ['fireplace', 'tableSq', 'chair', 'bookshelf', 'piano'] },
  groomer: { w: 15, h: 11, floor: T.FLOOR_TILE, fixtures: ['shelf', 'catTower', 'plantPot'] },
  builder: { w: 15, h: 11, floor: T.FLOOR_STONE, fixtures: ['crate', 'crate', 'barrel', 'shelf'] },
  hardware: { w: 15, h: 11, floor: T.FLOOR_STONE, fixtures: ['shelf', 'shelf', 'crate', 'barrel'] },
  vet: { w: 15, h: 11, floor: T.FLOOR_TILE, fixtures: ['shelf', 'catBed', 'plantPot'] },
  fishmonger: { w: 15, h: 10, floor: T.FLOOR_STONE, fixtures: ['crate', 'crate', 'barrel'] },
  harbour: { w: 15, h: 11, floor: T.FLOOR_WOOD, fixtures: ['shelf', 'barrel', 'crate'] },
  furniture: { w: 19, h: 13, floor: T.FLOOR_WOOD, fixtures: ['sofa', 'tableRound', 'chair', 'bookshelf', 'lampIn', 'plantPot'] },
  flea: { w: 19, h: 12, floor: T.FLOOR_STONE, fixtures: ['crate', 'crate', 'shelf', 'tableSq', 'barrel', 'plantPot'] },
  teahouse: { w: 15, h: 11, floor: T.FLOOR_WOOD, fixtures: ['shelf', 'tableRound', 'chair', 'plantPot'] },
  exotic: { w: 17, h: 12, floor: T.RUG, fixtures: ['catTower', 'catTower', 'catBed', 'lampIn', 'plantPot'] },
  herbalist: { w: 15, h: 11, floor: T.FLOOR_WOOD, fixtures: ['bookshelf', 'shelf', 'plantPot', 'plantPot'] },
  beekeeper: { w: 13, h: 10, floor: T.FLOOR_WOOD, fixtures: ['shelf', 'crate', 'plantPot'] },
  library: { w: 17, h: 12, floor: T.FLOOR_WOOD, fixtures: ['bookshelf', 'bookshelf', 'bookshelf', 'lampIn'] },
};

export function buildShopInterior(shopId) {
  const shop = SHOPS.find((s) => s.id === shopId);
  if (!shop) return null;
  const L = SHOP_LAYOUTS[shopId] || { w: 15, h: 11, floor: T.FLOOR_WOOD, fixtures: ['shelf'] };
  const rng = makeRng(hashStr(shopId));

  const W = L.w + 4, H = L.h + 5;
  const map = new GameMap(`shop:${shopId}`, W, H, {
    kind: 'indoor', name: shop.name, fill: T.VOID,
    music: 'shop', ambience: { indoor: 0.5 },
  });

  const room = { x: 2, y: 3, w: L.w, h: L.h };
  wallInRooms(map, [room], L.floor);

  // Front door, bottom-centre, back out to the street.
  const doorX = room.x + Math.floor(room.w / 2);
  const doorY = room.y + room.h;
  map.set(doorX, doorY, L.floor);
  map.set(doorX, doorY - 1, L.floor);
  map.addObject('doormat', doorX, doorY, { flat: true });
  map.addWarp(doorX, doorY, 'overworld', 0, 0, { sound: 'door' });
  map.spawn = { x: doorX, y: doorY - 1 };

  // Windows and pictures along the back wall.
  for (let i = 0; i < 2; i++) {
    const wx = room.x + 2 + i * (room.w - 5);
    map.addObject('windowIn', wx, room.y - 1, { offY: WALL_MOUNT });
  }

  // Counter across the back with the shopkeeper behind it.
  const cx = room.x + Math.floor(room.w / 2) - 1;
  const cy = room.y + 2;
  map.addObject('counter', cx - 1, cy, {});
  map.addObject('register', cx + 2, cy, {});
  const keeperSpot = { x: cx, y: cy - 1 };
  // The tile in front of the counter is where you talk to them.
  for (let i = -1; i <= 2; i++) {
    map.setInteract(cx + i, cy + 1, { kind: 'shopkeeper', shop: shopId });
  }

  // Fixtures. Fill the back wall either side of the counter first, then work
  // down the side walls, so a shop always looks stocked rather than sparse.
  const spots = [];
  spots.push({ x: room.x + 1, y: room.y + 1 });
  spots.push({ x: room.x + room.w - 3, y: room.y + 1 });
  spots.push({ x: room.x + 4, y: room.y + 1 });
  spots.push({ x: room.x + room.w - 6, y: room.y + 1 });
  for (let y = room.y + 4; y < room.y + room.h - 1; y += 3) {
    spots.push({ x: room.x + 1, y });
    spots.push({ x: room.x + room.w - 3, y });
  }
  for (let x = room.x + 3; x < room.x + room.w - 4; x += 4) {
    spots.push({ x, y: room.y + room.h - 2 });
  }

  // The inn has a staircase to the rooms; keep its landing clear of fixtures.
  const stairs = shopId === 'inn' ? { x: room.x + room.w - 3, y: room.y + 1 } : null;

  const free = spots.filter((s) => {
    if (!map.inBounds(s.x, s.y) || map.solid(s.x, s.y)) return false;
    if (map.solid(s.x + 1, s.y)) return false;                       // wide fixtures need room
    if (Math.abs(s.x - doorX) < 2 && s.y >= doorY - 3) return false; // keep the doorway clear
    if (stairs && Math.abs(s.x - stairs.x) < 3 && Math.abs(s.y - stairs.y) < 3) return false;
    return true;
  });
  // Repeat the fixture list until the shop is comfortably full.
  const wanted = Math.min(free.length, L.fixtures.length + 3);
  for (let i = 0; i < wanted; i++) {
    const f = L.fixtures[i % L.fixtures.length];
    map.addObject(f, free[i].x, free[i].y, { variant: rng.int(3) });
  }

  map.addObject('lampIn', room.x + Math.floor(room.w / 2) + 3, room.y + 1, { lightR: 60 });
  map.lights.push({ x: (room.x + room.w / 2) * 16, y: (room.y + room.h / 2) * 16, r: 130, color: '#ffe0b0' });

  if (stairs) {
    for (let k = -1; k <= 1; k++) map.addObject('stairs', stairs.x + k, stairs.y, { flat: true, variant: (k + 1) % 3 });
    map.addObject('stairs', stairs.x, stairs.y - 1, { flat: true, variant: 2 });
    map.setInteract(stairs.x, stairs.y + 1, { kind: 'sign', text: 'Stairs up to the rooms. The third one creaks, exactly as promised.' });
  }

  // A library is a shop where the goods are free and can't leave the building.
  // Every bookshelf gets something on it worth standing and reading.
  if (shop.kind === 'library') {
    const shelves = map.objects.filter((o) => o.type === 'bookshelf');
    BOOKS.forEach((bk, i) => {
      const o = shelves[i % Math.max(1, shelves.length)];
      if (!o) return;
      // Read from the tile below the shelf, where you'd actually be standing.
      for (let k = 0; k < 2; k++) map.setInteract(o.tx + k, o.ty + 1, { kind: 'book', book: bk.id });
    });
  }

  map.indexObjects();
  map.meta = { shop: shopId, keeperSpot, stairs };
  return map;
}

// ---------------------------------------------------------------------------
// Special interiors
// ---------------------------------------------------------------------------

/**
 * Somebody's front room. One of a handful of layouts chosen by the house's id,
 * so the same cottage is always the same cottage inside, and furnished from a
 * short list — these are places you visit for thirty seconds with a bag of
 * cake, not places to explore.
 */
export function buildHouseInterior(id) {
  const rng = makeRng(hashStr(id));
  const w = 11 + rng.int(3), h = 9 + rng.int(2);
  const floors = [T.FLOOR_WOOD, T.FLOOR_STONE, T.RUG, T.CARPET_GREEN];
  const map = new GameMap(`house:${id}`, w + 4, h + 5, {
    kind: 'indoor', name: 'A cottage', fill: T.VOID, music: 'cafe',
    ambience: { indoor: 0.5 },
  });
  const room = { x: 2, y: 3, w, h };
  wallInRooms(map, [room], floors[rng.int(floors.length)]);
  const doorX = room.x + Math.floor(room.w / 2);
  const doorY = room.y + room.h;
  map.set(doorX, doorY, map.get(doorX, doorY - 1));
  map.addObject('doormat', doorX, doorY, { flat: true });
  map.addWarp(doorX, doorY, 'overworld', 0, 0, { sound: 'door' });
  map.spawn = { x: doorX, y: doorY - 1 };

  // Somewhere to sit, something to look at, a fire more often than not.
  map.addObject('windowIn', room.x + 2, room.y - 1, { offY: WALL_MOUNT });
  map.addObject('windowIn', room.x + room.w - 3, room.y - 1, { offY: WALL_MOUNT });
  if (rng.chance(0.7)) map.addObject('painting', room.x + Math.floor(room.w / 2), room.y - 1, { offY: WALL_MOUNT, variant: rng.int(3) });
  const kit = ['sofa', 'tableRound', 'chair', 'bookshelf', 'plantPot', 'lampIn', 'catBed', 'fireplace'];
  const spots = [];
  for (let y = room.y + 1; y < room.y + room.h - 1; y += 2) {
    for (let x = room.x + 1; x < room.x + room.w - 2; x += 3) spots.push({ x, y });
  }
  for (let i = spots.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const many = 4 + rng.int(3);
  for (let i = 0; i < many && i < spots.length; i++) {
    const type = kit[rng.int(kit.length)];
    map.addObject(type, spots[i].x, spots[i].y, {
      variant: rng.int(3),
      lightR: type === 'lampIn' || type === 'fireplace' ? 70 : undefined,
    });
  }
  map.lights.push({ x: (room.x + room.w / 2) * 16, y: (room.y + room.h / 2) * 16, r: 120, color: '#ffdcae' });
  map.meta = { house: id, room, door: { x: doorX, y: doorY } };
  return map;
}

export function buildSpecialInterior(id) {
  if (id === 'oldmill') {
    const map = new GameMap('shop:oldmill', 17, 14, { kind: 'indoor', name: 'The Old Mill', fill: T.VOID, music: 'night', ambience: { indoor: 0.4, water: 0.35 } });
    wallInRooms(map, [{ x: 2, y: 3, w: 13, h: 9 }], T.FLOOR_WOOD);
    const doorX = 8, doorY = 12;
    map.set(doorX, doorY, T.FLOOR_WOOD);
    map.addWarp(doorX, doorY, 'overworld', 0, 0, {});
    map.spawn = { x: doorX, y: doorY - 1 };
    map.addObject('crate', 3, 5); map.addObject('barrel', 4, 10);
    map.addObject('shelf', 11, 5); map.addObject('stump', 6, 7);
    map.addObject('windowIn', 5, 2, { offY: WALL_MOUNT });
    map.setInteract(8, 6, { kind: 'sign', text: 'The great millstone, still and cold.\n\nSomething small and warm is asleep in the flour hopper. It opens one eye, decides you are acceptable, and goes back to sleep.' });
    map.meta = { special: 'oldmill' };
    map.lights.push({ x: 8 * 16, y: 7 * 16, r: 90, color: '#c9b48a' });
    map.indexObjects();
    return map;
  }

  if (id === 'lighthouse') {
    const map = new GameMap('shop:lighthouse', 13, 13, { kind: 'indoor', name: 'Gullrock Light', fill: T.VOID, music: 'night', ambience: { indoor: 0.3, waves: 0.6 } });
    wallInRooms(map, [{ x: 3, y: 3, w: 7, h: 8 }], T.FLOOR_STONE);
    const doorX = 6, doorY = 11;
    map.set(doorX, doorY, T.FLOOR_STONE);
    map.addWarp(doorX, doorY, 'overworld', 0, 0, {});
    map.spawn = { x: doorX, y: doorY - 1 };
    map.addObject('bookshelf', 4, 5);
    map.addObject('lampIn', 8, 5, { lightR: 70 });
    map.setInteract(6, 5, { kind: 'sign', text: 'The lamp room is up a spiral stair too narrow for you.\n\nThere is a table under the window.' });
    // The keeper's table. Searchable, because something in the valley has to
    // actually hand over the logbook that Slate is asking for — the errand
    // used to name a book that nothing anywhere would give you.
    map.addObject('tableSq', 6, 7);
    map.setInteract(6, 7, { kind: 'search', spot: 'keepers_table' });
    map.setInteract(7, 7, { kind: 'search', spot: 'keepers_table' });
    map.meta = { special: 'lighthouse' };
    map.lights.push({ x: 6 * 16, y: 6 * 16, r: 110, color: '#ffe6a8' });
    map.indexObjects();
    return map;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The cafe
// ---------------------------------------------------------------------------

export const CAFE_MARGIN = 4;

/** The room you start with: modest, but yours. */
export function startingCafe(style = {}) {
  return {
    rooms: [{ x: 0, y: 0, w: 11, h: 8, name: 'Cafe' }],
    furniture: [
      { type: 'counter', x: 1, y: 1 },
      { type: 'register', x: 3, y: 1 },
      { type: 'coffeeMachine', x: 4, y: 1 },
      { type: 'pastryCase', x: 6, y: 1 },
      { type: 'tableRound', x: 3, y: 4 },
      { type: 'chair', x: 2, y: 4 },
      { type: 'chair', x: 4, y: 4 },
      { type: 'tableRound', x: 8, y: 4 },
      { type: 'chair', x: 7, y: 4 },
      { type: 'catBed', x: 9, y: 6 },
      { type: 'catBowl', x: 1, y: 6 },
      { type: 'catTower', x: 10, y: 2 },
      { type: 'plantPot', x: 0, y: 6 },
      { type: 'menuBoard', x: 0, y: 1 },
    ],
    floor: style.floor ?? T.FLOOR_WOOD,
    wall: style.wall ?? '#efe2c8',
    awning: style.awning ?? '#c05a7a',
    roof: style.roof ?? '#c86a4a',
    doorX: 5,
    name: style.name || 'The Contented Cat',
  };
}

/**
 * Rebuild the cafe interior map from its layout. Called at startup and every
 * time the player finishes building.
 */
export function buildCafeMap(cafe) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of cafe.rooms) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  const offX = CAFE_MARGIN - minX;
  const offY = CAFE_MARGIN - minY;
  const W = (maxX - minX) + CAFE_MARGIN * 2;
  const H = (maxY - minY) + CAFE_MARGIN * 2 + 1;

  const map = new GameMap('cafe', W, H, {
    kind: 'indoor', name: cafe.name || 'The Cat Cafe', fill: T.VOID,
    music: 'cafe', ambience: { indoor: 0.5 },
  });

  const rooms = cafe.rooms.map((r) => ({ x: r.x + offX, y: r.y + offY, w: r.w, h: r.h, name: r.name, floor: r.floor }));
  wallInRooms(map, rooms, cafe.floor ?? T.FLOOR_WOOD);

  // Front door on the bottom edge of the first room.
  const home = rooms[0];
  const doorX = home.x + Math.min(home.w - 1, Math.max(0, cafe.doorX ?? Math.floor(home.w / 2)));
  const doorY = home.y + home.h;
  map.set(doorX, doorY, home.floor ?? cafe.floor ?? T.FLOOR_WOOD);
  map.addObject('doormat', doorX, doorY, { flat: true });
  map.addWarp(doorX, doorY, 'overworld', 0, 0, { sound: 'door' });
  map.spawn = { x: doorX, y: doorY - 1 };

  // Furniture, translated into map space.
  const seats = [];
  const tables = [];
  for (const f of cafe.furniture) {
    const x = f.x + offX, y = f.y + offY;
    if (!map.inBounds(x, y)) continue;
    // Anything that hangs on a wall hangs at wall height when it is actually
    // on a wall. A painting used to be pushed ten pixels down the tile, which
    // was only ever right because it could not be put on a wall in the first
    // place.
    const def = OBJECTS[f.type];
    const onWall = def && def.wall && map.get(x, y) === T.WALL_IN;
    const o = map.addObject(f.type, x, y, { variant: f.variant || 0, offY: onWall ? WALL_MOUNT : 0 });
    if (!o) continue;
    o.furniture = f;
    if (['chair', 'chairUp', 'stool', 'barStool', 'sofa',
      'patioChair', 'patioStool', 'patioBench'].includes(f.type)) {
      const slots = f.type === 'sofa' || f.type === 'patioBench' ? 3 : 1;
      // The type comes along: a regular who only ever perches at the bar has
      // to be able to tell a bar stool from a sofa.
      for (let i = 0; i < slots; i++) seats.push({ x: x + i, y, taken: null, type: f.type });
    }
    // The telephone answers when you talk to it, like anybody else in here.
    if (f.type === 'phone') map.setInteract(x, y, { kind: 'phone' });
    if (f.type.startsWith('table') || f.type.startsWith('patioTable')
      || f.type === 'bar' || f.type === 'umbrella') tables.push({ x, y, w: o.tw });
    // The canopy keeps the rain off what is under it, which is the whole
    // reason anybody buys one. Objects sit on their bottom row and grow
    // upwards, so the footprint runs back from y.
    if (f.type === 'umbrella') {
      for (let j = 0; j < (o.th || 1); j++) {
        for (let i = 0; i < (o.tw || 1); i++) map.cover(x + i, y - j);
      }
    }
  }

  // Seats need a table nearby to be worth sitting at; the rest are perches.
  for (const s of seats) {
    s.table = tables.find((t) => Math.abs(t.x - s.x) <= 2 && Math.abs(t.y - s.y) <= 2) || null;
  }

  // Windows along the top wall, so the room feels like it has an outside.
  for (let x = home.x + 1; x < home.x + home.w - 1; x += 4) {
    if (map.get(x, home.y - 1) === T.WALL_IN) map.addObject('windowIn', x, home.y - 1, { offY: WALL_MOUNT });
  }

  map.lights.push({ x: (home.x + home.w / 2) * 16, y: (home.y + home.h / 2) * 16, r: 150, color: '#ffdcae' });
  for (const r of rooms.slice(1)) {
    map.lights.push({ x: (r.x + r.w / 2) * 16, y: (r.y + r.h / 2) * 16, r: 130, color: '#ffdcae' });
  }

  map.indexObjects();
  // Where an employee stands: behind the counter, on the wall side of it, so
  // the customer queue forms on the other face as it always did.
  let staffSpot = null;
  for (const o of map.objects) {
    if (o.type !== 'counter' && o.type !== 'register') continue;
    for (const [dx, dy] of [[0, -1], [1, -1], [-1, -1], [0, -2]]) {
      const sx = o.tx + dx, sy = o.ty + dy;
      if (map.inBounds(sx, sy) && !map.solid(sx, sy)) { staffSpot = { x: sx, y: sy }; break; }
    }
    if (staffSpot) break;
  }
  map.meta = {
    cafe: true, seats, tables, rooms, offX, offY,
    door: { x: doorX, y: doorY },
    staffSpot,
  };
  return map;
}

