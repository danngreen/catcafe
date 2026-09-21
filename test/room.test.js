// Who runs the cafe, and what happens to that when connections come and go.
//
//   npm test
//
// No browser and no network: the room is handed fake sockets and the clock is
// moved by hand, so a minute of waiting for a timeout costs nothing.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';

let serial = 0;

/** What a Room needs of a connection, recording what it was sent. */
function fakeSocket() {
  const handlers = { message: [], close: [] };
  const ws = {
    id: `s${++serial}`,
    open: true,
    sent: [],
    lastActivity: Date.now(),
    on(evt, fn) { handlers[evt].push(fn); return ws; },
    send(text) { if (ws.open) ws.sent.push(JSON.parse(text)); },
    sendJSON(obj) { ws.send(JSON.stringify(obj)); },
    ping() {},
    close() {
      if (!ws.open) return;
      ws.open = false;
      for (const fn of handlers.close) fn();
    },
    /** As if the browser had sent it. */
    say(obj) {
      ws.lastActivity = Date.now();
      for (const fn of handlers.message) fn(JSON.stringify(obj));
    },
    last(t) { return [...ws.sent].reverse().find((m) => m.t === t); },
    count(t) { return ws.sent.filter((m) => m.t === t).length; },
  };
  return ws;
}

function setup(t) {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const room = new Room(42);
  clearInterval(room.timer);          // ticked by hand below
  t.after(() => { mock.timers.reset(); });
  /** Move time on, with everybody in `awake` saying their frame loop turns. */
  const pass = (ms, awake = []) => {
    for (let left = ms; left > 0; left -= 500) {
      mock.timers.tick(Math.min(500, left));
      for (const ws of awake) if (ws.open) { ws.say({ t: 'alive' }); }
      for (const p of room.players.values()) p.ws.lastActivity = Date.now();
      room.tick();
    }
  };
  const join = (name, who) => {
    const ws = fakeSocket();
    room.attach(ws);
    ws.say({ t: 'join', name, who, x: 0, y: 0, map: 'overworld' });
    return ws;
  };
  return { room, pass, join };
}

const WORLD = { money: 100, inventory: {}, stock: {}, quests: {}, questStep: {}, cats: [] };

test('the first to join runs the cafe, and keeps it when others arrive', (t) => {
  const { room, join } = setup(t);
  const a = join('Ada', 'wa');
  const b = join('Bea', 'wb');
  assert.equal(room.owner, a.id);
  assert.equal(b.last('owner'), undefined, 'nothing changed, so nothing to announce');
});

test('an owner who reconnects keeps the cafe', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  const b = join('Bea', 'wb');
  pass(1000, [a, b]);
  const owners = b.count('owner');
  // Ada's new connection arrives while the old one still looks alive.
  const a2 = join('Ada', 'wa');
  assert.equal(room.owner, a2.id);
  assert.equal(a.open, false, 'the old connection was hung up on');
  assert.equal(b.count('owner'), owners + 1, 'one handover, to the same person');
  assert.equal(b.count('left'), 1, 'and one departure, not two');
  assert.equal(a2.last('youare').name, 'Ada', 'with her own name back');
});

test('the cafe is held for an owner whose connection dropped', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  const b = join('Bea', 'wb');
  pass(1000, [a, b]);
  a.close();
  assert.equal(room.owner, null, 'nobody runs it while we wait');
  pass(3000, [b]);
  assert.equal(room.owner, null);
  const a2 = join('Ada', 'wa');
  assert.equal(room.owner, a2.id);
});

test('but not for ever', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  const b = join('Bea', 'wb');
  pass(1000, [a, b]);
  a.close();
  pass(11000, [b]);
  assert.equal(room.owner, b.id);
});

test('and not at all for one who said goodbye', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  const b = join('Bea', 'wb');
  pass(1000, [a, b]);
  a.say({ t: 'bye' });
  a.close();
  assert.equal(room.owner, b.id);
});

test('an owner whose frame loop stops hands over to somebody awake', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  const b = join('Bea', 'wb');
  pass(6000, [b]);                     // Ada's tab is in the background
  assert.equal(room.owner, b.id);
  assert.ok(a.open, 'she is still connected, just not simulating');
});

test('a hidden tab hands over at once', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  const b = join('Bea', 'wb');
  pass(1000, [a, b]);
  a.say({ t: 'alive', ok: false });
  assert.equal(room.owner, b.id);
});

test('a stalled owner keeps the cafe when nobody else is awake', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  join('Bea', 'wb');
  pass(8000, []);
  assert.equal(room.owner, a.id);
});

test('a morning the owner missed is asked for again', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  const b = join('Bea', 'wb');
  a.say({ t: 'seedworld', world: { ...WORLD }, clock: { day: 3, t: 100 } });
  pass(1000, [a, b]);
  a.close();                           // gone as the day turns
  b.say({ t: 'skip', hour: 0.01 });
  assert.equal(room.clock.day, 4);
  assert.equal(room.cashedDay, 3);
  pass(12000, [b]);                    // the wait for Ada runs out
  assert.equal(room.owner, b.id);
  assert.equal(b.last('cashup').day, 4);
  b.say({ t: 'summary', s: {} });
  assert.equal(room.cashedDay, 4);
  const asked = b.count('cashup');
  pass(10000, [b]);
  assert.equal(b.count('cashup'), asked, 'and not asked for twice');
});

test('the books are done once, even if the cafe changes hands as they are', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  const b = join('Bea', 'wb');
  a.say({ t: 'seedworld', world: { ...WORLD }, clock: { day: 1, t: 100 } });
  pass(1000, [a, b]);
  b.say({ t: 'skip', hour: 0.01 });
  // Ada does the books, but her tab is hidden before the card gets here.
  a.say({ t: 'alive', ok: false });
  assert.equal(room.owner, b.id);
  a.say({ t: 'summary', s: { from: 'ada' } });
  assert.equal(room.cashedDay, 2, 'her card still counts');
  assert.equal(b.last('summary').s.from, 'ada');
  pass(10000, [b]);
  assert.equal(b.count('cashup'), 0, 'so Bea is never asked to do them again');
  // And a second card for the same morning goes nowhere.
  const cards = b.count('summary');
  a.say({ t: 'summary', s: { from: 'ada again' } });
  assert.equal(b.count('summary'), cards);
});

test('a morning cashed up on time is never asked for', (t) => {
  const { room, join, pass } = setup(t);
  const a = join('Ada', 'wa');
  a.say({ t: 'seedworld', world: { ...WORLD }, clock: { day: 1, t: 100 } });
  a.say({ t: 'skip', hour: 0.01 });
  a.say({ t: 'summary', s: {} });
  pass(10000, [a]);
  assert.equal(a.count('cashup'), 0);
  assert.equal(room.cashedDay, 2);
});

// ------------------------------------------------------ rearranging the cafe

const CAFE = { rooms: [{ x: 0, y: 0, w: 5, h: 5 }], furniture: [] };

function building(t) {
  const s = setup(t);
  const a = s.join('Ada', 'wa');
  const b = s.join('Bea', 'wb');
  a.say({ t: 'seedworld', world: { ...WORLD, cafe: CAFE }, clock: { day: 1, t: 100 } });
  s.pass(1000, [a, b]);
  return { ...s, a, b };
}

test('one person rearranges the cafe at a time', (t) => {
  const { room, a, b } = building(t);
  a.say({ t: 'build', on: true });
  assert.equal(a.last('build').ok, true);
  b.say({ t: 'build', on: true });
  assert.deepEqual(b.last('build'), { t: 'build', ok: false, by: 'Ada' });
  // And a layout from anybody else is turned away, and they are put right.
  b.say({ t: 'op', op: 'put', k: 'cafe', key: 'furniture', v: [{ type: 'sofa', x: 1, y: 1 }] });
  assert.deepEqual(room.world.cafe.furniture, []);
  assert.deepEqual(b.last('sync'), { t: 'sync', k: 'cafe', v: room.world.cafe });
  // Ada's goes in; then it is Bea's turn.
  a.say({ t: 'op', op: 'put', k: 'cafe', key: 'furniture', v: [{ type: 'chair', x: 2, y: 2 }] });
  a.say({ t: 'build', on: false });
  assert.equal(room.world.cafe.furniture[0].type, 'chair');
  b.say({ t: 'build', on: true });
  assert.equal(b.last('build').ok, true);
});

test('a builder who drops keeps their place, for a while', (t) => {
  const { room, pass, join, a, b } = building(t);
  a.say({ t: 'build', on: true });
  a.close();
  pass(5000, [b]);
  b.say({ t: 'build', on: true });
  assert.equal(b.last('build').ok, false);
  const a2 = join('Ada', 'wa');
  a2.say({ t: 'build', on: true });
  assert.equal(a2.last('build').ok, true, 'back, and it is still hers');
  a2.say({ t: 'op', op: 'put', k: 'cafe', key: 'furniture', v: [{ type: 'chair', x: 2, y: 2 }] });
  assert.equal(room.world.cafe.furniture.length, 1);
});

test('but their place is not kept for ever', (t) => {
  const { pass, a, b } = building(t);
  a.say({ t: 'build', on: true });
  a.close();
  pass(31000, [b]);
  b.say({ t: 'build', on: true });
  assert.equal(b.last('build').ok, true);
});

test('nor at all if they left on purpose', (t) => {
  const { a, b } = building(t);
  a.say({ t: 'build', on: true });
  a.say({ t: 'bye' });
  a.close();
  b.say({ t: 'build', on: true });
  assert.equal(b.last('build').ok, true);
});

test('a plan left open in a tab nobody is looking at can be taken over', (t) => {
  const { pass, a, b } = building(t);
  a.say({ t: 'build', on: true });
  pass(31000, [b]);                    // Ada is connected, but her tab is hidden
  b.say({ t: 'build', on: true });
  assert.equal(b.last('build').ok, true);
  assert.deepEqual(a.last('build'), { t: 'build', ok: false, by: 'Bea' }, 'and she is told');
});

test('with nobody rearranging, anybody may write the layout', (t) => {
  const { room, b } = building(t);
  b.say({ t: 'op', op: 'put', k: 'cafe', key: 'wall', v: '#fff' });
  assert.equal(room.world.cafe.wall, '#fff');
});
