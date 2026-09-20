// The session over plain HTTP, on a network that loses things.
//
//   npm test
//
// The real client link talks to the real hub through a stand-in for fetch that
// can lose a request on the way there or a reply on the way back. The second is
// the one that matters: the server has acted on the request and the client
// doesn't know, so it asks again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PollHub } from '../server/poll.js';
import { PollLink } from '../src/net/link.js';
import { Room } from '../server/room.js';

/**
 * A hub, something attached to it, and a link whose polls we fire by hand.
 * `net.next` decides the fate of the next request: 'ok', 'lose-request' or
 * 'lose-reply'.
 */
function setup(t, attach) {
  const hub = new PollHub();
  const net = { next: 'ok', requests: 0 };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    net.requests++;
    const fate = net.next;
    net.next = 'ok';
    if (fate === 'lose-request') throw new Error('network');
    const reply = hub.handle(JSON.parse(init.body), attach);
    if (fate === 'lose-reply') throw new Error('network');
    const text = JSON.stringify(reply);
    return { ok: true, json: async () => JSON.parse(text) };
  };
  const got = [];
  let closed = 0;
  const link = new PollLink('/poll', {
    message: (text) => got.push(JSON.parse(text)),
    close: () => { closed++; },
  });
  clearInterval(link.timer);
  t.after(() => { globalThis.fetch = realFetch; clearInterval(link.timer); });
  return { hub, net, link, got, closed: () => closed };
}

/** The constructor fires the first poll itself; let it land. */
const settle = () => new Promise((r) => setImmediate(r));

/** Something that records what it is sent and can say things back. */
function echo() {
  const heard = [];
  let conn = null;
  const attach = (c) => {
    conn = c;
    c.on('message', (text) => heard.push(JSON.parse(text)));
    c.sendJSON({ t: 'welcome' });
  };
  return { heard, attach, say: (obj) => conn.sendJSON(obj) };
}

test('messages go both ways', async (t) => {
  const far = echo();
  const { link, got } = setup(t, far.attach);
  await settle();
  assert.deepEqual(got, [{ t: 'welcome' }]);
  link.send(JSON.stringify({ n: 1 }));
  far.say({ m: 1 });
  await link.tick();
  assert.deepEqual(far.heard, [{ n: 1 }]);
  assert.deepEqual(got, [{ t: 'welcome' }, { m: 1 }]);
});

test('a lost reply does not deliver the same message twice', async (t) => {
  const far = echo();
  const { link, net } = setup(t, far.attach);
  await settle();
  link.send(JSON.stringify({ n: 1 }));
  net.next = 'lose-reply';
  await link.tick();
  assert.deepEqual(far.heard, [{ n: 1 }], 'the server did get it');
  link.send(JSON.stringify({ n: 2 }));
  await link.tick();
  await link.tick();
  assert.deepEqual(far.heard, [{ n: 1 }, { n: 2 }], 'once each, in order');
  assert.equal(link.outbox.length, 0, 'and the client knows it');
});

test('a lost reply does not lose what the server said in it', async (t) => {
  const far = echo();
  const { link, net, got } = setup(t, far.attach);
  await settle();
  far.say({ m: 1 });
  net.next = 'lose-reply';
  await link.tick();
  far.say({ m: 2 });
  await link.tick();
  await link.tick();
  assert.deepEqual(got, [{ t: 'welcome' }, { m: 1 }, { m: 2 }]);
});

test('a lost request is simply sent again', async (t) => {
  const far = echo();
  const { link, net } = setup(t, far.attach);
  await settle();
  link.send(JSON.stringify({ n: 1 }));
  net.next = 'lose-request';
  await link.tick();
  assert.deepEqual(far.heard, []);
  await link.tick();
  assert.deepEqual(far.heard, [{ n: 1 }]);
});

test('a bad run of both loses nothing and repeats nothing', async (t) => {
  const far = echo();
  const { link, net, got } = setup(t, far.attach);
  await settle();
  const fates = ['lose-reply', 'lose-request', 'ok', 'lose-reply', 'lose-reply', 'ok', 'lose-request'];
  for (let i = 0; i < 40; i++) {
    link.send(JSON.stringify({ n: i }));
    far.say({ m: i });
    net.next = fates[i % fates.length];
    await link.tick();
  }
  for (let i = 0; i < 3; i++) await link.tick();
  assert.deepEqual(far.heard.map((m) => m.n), [...Array(40).keys()]);
  assert.deepEqual(got.slice(1).map((m) => m.m), [...Array(40).keys()]);
});

test('money spent over a bad connection is spent once', async (t) => {
  const room = new Room(7);
  clearInterval(room.timer);
  const { link, net, got } = setup(t, (c) => room.attach(c));
  await settle();
  const say = (obj) => link.send(JSON.stringify(obj));
  say({ t: 'join', name: 'Ada', who: 'wa', x: 0, y: 0, map: 'overworld' });
  say({ t: 'seedworld', world: { money: 500, inventory: {}, stock: {} }, clock: { day: 1, t: 0 } });
  await link.tick();
  say({ t: 'op', op: 'money', d: -100 });
  net.next = 'lose-reply';
  await link.tick();
  await link.tick();
  await link.tick();
  assert.equal(room.world.money, 400);
  assert.equal(got.filter((m) => m.t === 'sync' && m.k === 'money').length, 1);
});

test('a connection the server has forgotten is reported, not quietly replaced', async (t) => {
  const far = echo();
  const { hub, link, closed } = setup(t, far.attach);
  await settle();
  const before = hub.conns.size;
  // Timed out while the tab was asleep.
  hub.conns.get(link.id).close();
  await link.tick();
  assert.equal(closed(), 1, 'the link ends, so the client reconnects and rejoins');
  assert.equal(hub.conns.size, before - 1, 'and no connection was made behind its back');
});

test('a client from before messages were numbered still works', () => {
  const hub = new PollHub();
  const far = echo();
  const first = hub.handle({ id: null, msgs: [] }, far.attach);
  assert.deepEqual(first.msgs.map((m) => JSON.parse(m)), [{ t: 'welcome' }]);
  const second = hub.handle({ id: first.id, msgs: [JSON.stringify({ n: 1 })] }, far.attach);
  assert.deepEqual(far.heard, [{ n: 1 }]);
  assert.deepEqual(second.msgs, [], 'and is not sent the welcome again');
});
