// What happens to changes made while the link is down.
//
//   npm test
//
// The game changes its own copy of the books first and tells the server
// second, and on reconnecting takes the server's copy wholesale. So a change
// the server never heard about is undone a few seconds after it was made.
// These check that it is heard about, late, and that hearing about it late
// doesn't undo what anybody else did in the meantime.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp } from '../server/world.js';

globalThis.location = { host: 'test', search: '', protocol: 'http:' };
const { NetClient } = await import('../src/net/client.js');

/** A client that is in a valley, talking to a link that records. */
function playing(t, world) {
  const net = new NetClient();
  const sent = [];
  net.link = { send: (text) => sent.push(JSON.parse(text)), close() {} };
  net.receive({ t: 'welcome', id: 'me', seed: 1, world: JSON.parse(JSON.stringify(world)) });
  clearInterval(net.keepalive);
  t.after(() => clearInterval(net.keepalive));
  net.join('Ada', null, 0, 0, 'overworld');
  sent.length = 0;
  return { net, sent };
}

/** The link drops; later a new one comes up with the books as they are now. */
function drop(net) { net.link = null; net.noteClose(); }
function comeBack(net, sent, worldNow) {
  net.link = { send: (text) => sent.push(JSON.parse(text)), close() {} };
  net.receive({ t: 'welcome', id: 'me2', seed: 1, world: JSON.parse(JSON.stringify(worldNow)) });
  clearInterval(net.keepalive);
  const j = net.rejoin;
  net.join(j.name, j.look, j.x, j.y, j.map);
  return net.flushPending();
}

const ops = (sent) => sent.filter((m) => m.t === 'op');

test('online, a change goes straight out', (t) => {
  const { net, sent } = playing(t, { money: 500, flags: {} });
  net.op({ op: 'money', d: -50 });
  assert.deepEqual(ops(sent), [{ t: 'op', op: 'money', d: -50 }]);
  assert.equal(net.pending.length, 0);
});

test('offline, it is kept and sent on coming back', (t) => {
  const { net, sent } = playing(t, { money: 500, flags: {} });
  drop(net);
  net.op({ op: 'money', d: -50 });
  net.op({ op: 'inv', key: 'f_chair', d: 1 });
  assert.equal(sent.length, 0);
  const n = comeBack(net, sent, { money: 500, flags: {} });
  assert.equal(n, 2);
  assert.deepEqual(ops(sent).map((m) => m.op), ['money', 'inv']);
  assert.equal(sent[0].t, 'join', 'after we have rejoined, so the server will take them');
  assert.equal(net.pending.length, 0);
});

test('a field touched offline does not undo what others did meanwhile', (t) => {
  const { net, sent } = playing(t, { flags: { met_owl: true }, friends: { owl: 0.2 } });
  drop(net);
  // Here: a flag set and a friendship warmed, on top of what we knew.
  net.touch('flags', { met_owl: true, cleared_bridge: true });
  net.touch('friends', { owl: 0.5 });
  // There: somebody else set a different flag and made a different friend.
  const now = { flags: { met_owl: true, found_shell: true }, friends: { owl: 0.2, fox: 0.4 } };
  comeBack(net, sent, now);
  const world = JSON.parse(JSON.stringify(now));
  for (const m of ops(sent)) applyOp(world, m);
  assert.deepEqual(world.flags, { met_owl: true, found_shell: true, cleared_bridge: true });
  assert.deepEqual(world.friends, { owl: 0.5, fox: 0.4 });
});

test('a cat adopted offline joins the cats, not replaces them', (t) => {
  const tabby = { id: 'c1', name: 'Tab', hunger: 0 };
  const { net, sent } = playing(t, { cats: [tabby] });
  drop(net);
  net.touch('cats', [tabby, { id: 'c9', name: 'Mine', hunger: 0 }]);
  // Meanwhile Tab got hungry and somebody else adopted one too.
  const now = { cats: [{ id: 'c1', name: 'Tab', hunger: 1 }, { id: 'c5', name: 'Theirs', hunger: 0 }] };
  comeBack(net, sent, now);
  const world = JSON.parse(JSON.stringify(now));
  for (const m of ops(sent)) applyOp(world, m);
  assert.deepEqual(world.cats.map((c) => c.id), ['c1', 'c5', 'c9']);
  assert.equal(world.cats[0].hunger, 1, 'and Tab is as hungry as the server says');
});

test('later changes to the live object cannot reach what we compare with', (t) => {
  const { net, sent } = playing(t, { flags: {} });
  const live = { x: true };
  net.receive({ t: 'sync', k: 'flags', v: live });
  live.mine = true;                          // the game edits in place, as it does
  net.touch('flags', live);
  assert.deepEqual(ops(sent), [{ t: 'op', op: 'put', k: 'flags', key: 'mine', v: true }]);
});

test('nothing is kept on the title screen, alone, or after leaving', (t) => {
  const solo = new NetClient();
  solo.op({ op: 'money', d: 1 });
  assert.equal(solo.pending.length, 0);
  const { net } = playing(t, { money: 1 });
  net.leave();
  net.op({ op: 'money', d: 1 });
  assert.equal(net.pending.length, 0);
});

test('what a dead HTTP link never delivered is kept too', (t) => {
  const { net, sent } = playing(t, { money: 500 });
  net.requeue([JSON.stringify({ t: 'op', op: 'money', d: -5 }), JSON.stringify({ t: 'move', x: 1 })]);
  drop(net);
  comeBack(net, sent, { money: 500 });
  assert.deepEqual(ops(sent), [{ t: 'op', op: 'money', d: -5 }]);
});


test('touching a tally twice before the server answers adds to it twice, not three times', (t) => {
  const { net, sent } = playing(t, { reputation: 0.5 });
  net.touch('reputation', 0.51);
  net.touch('reputation', 0.52);
  const world = { reputation: 0.5 };
  for (const m of ops(sent)) applyOp(world, m);
  assert.ok(Math.abs(world.reputation - 0.52) < 1e-9);
});
