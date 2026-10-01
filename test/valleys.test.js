// The public server: invite codes, device keys, the creator's buttons, limits,
// putting idle valleys away and expiring unwanted ones. And that the LAN server
// is exactly what it was.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { ADJECTIVES, NOUNS } from '../server/words.js';
import { newCode, normalizeCode, hashKey, Limiter } from '../server/access.js';
import { Games, UNLOAD_AFTER_MS, NEVER_STARTED_MS, UNPLAYED_MS, ARCHIVE_KEEP_MS } from '../server/games.js';

const ROOT = new URL('..', import.meta.url).pathname;
const DAY = 24 * 60 * 60 * 1000;

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'catcafe-valleys-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A Games on the public server's footing, closed afterwards so no timer is left running. */
function publicGames(t, dir = tempDir(t)) {
  const games = new Games(dir, { codes: true });
  t.after(() => { for (const room of games.rooms.values()) room.close(); });
  return games;
}

// ------------------------------------------------------------------ codes

test('the word lists are safe to read aloud and type', () => {
  for (const [name, list] of [['adjectives', ADJECTIVES], ['nouns', NOUNS]]) {
    assert.ok(list.length >= 200, `${name}: only ${list.length}`);
    assert.equal(new Set(list).size, list.length, `${name} has a repeat`);
    for (const w of list) assert.match(w, /^[a-z]{2,9}$/, `${name}: ${w}`);
  }
  assert.deepEqual(ADJECTIVES.filter((w) => NOUNS.includes(w)), [], 'a word is in both lists');
  // A few that must never turn up, for a game kids play.
  const never = ['dead', 'kill', 'blood', 'stupid', 'dumb', 'ugly', 'fat', 'sexy', 'drunk', 'beaver', 'cougar', 'booty'];
  for (const w of never) assert.ok(![...ADJECTIVES, ...NOUNS].includes(w), w);
  // Hundreds of millions of codes: hopeless to guess at 20 tries per 10 minutes.
  assert.ok(ADJECTIVES.length * NOUNS.length * 9000 > 4e8);
});

test('codes read the same however they are typed', () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^[a-z]+-[a-z]+-\d{4}$/);
  for (const typed of ['plum-otter-4271', 'Plum Otter 4271', ' plum_otter-4271 ', 'PLUM-OTTER-4271', 'plum otter  4271\n']) {
    assert.equal(normalizeCode(typed), 'plum-otter-4271', JSON.stringify(typed));
  }
  for (const bad of ['', null, 'plum-otter', 'plum-otter-42', 'plum-otter-42711', '4271-plum-otter', 'plum-otter-4271-x']) {
    assert.equal(normalizeCode(bad), null, JSON.stringify(bad));
  }
});

test('a limiter allows its share in the window, then waits', () => {
  const lim = new Limiter(3, 1000);
  assert.ok(lim.take('a', 0) && lim.take('a', 10) && lim.take('a', 20));
  assert.equal(lim.take('a', 30), false);
  assert.ok(lim.take('b', 30), 'another address has its own share');
  assert.ok(lim.take('a', 1015), 'the first one has aged out');
});

// ------------------------------------------------------------- registry

test('making a valley gives its maker a creator key, and a code others can join with', (t) => {
  const games = publicGames(t);
  const made = games.createPublic();
  assert.match(made.id, /^[a-z0-9]{10}$/);
  assert.equal(games.roleOf(made.id, made.key), 'creator');
  assert.equal(games.roleOf(made.id, 'not-a-key'), null);

  const joined = games.join(made.code);
  assert.equal(joined.id, made.id);
  assert.equal(games.roleOf(made.id, joined.key), 'member');
  assert.equal(games.join('plum-otter-0000'), null);

  // Kept on disk with the keys hashed: a copied save lets nobody in.
  const file = readFileSync(games.pathFor(made.id), 'utf8');
  assert.ok(!file.includes(made.key) && !file.includes(joined.key), 'a raw key was written to disk');
  assert.ok(file.includes(hashKey(made.key)));

  // A device's list, including one it no longer has a way into.
  const mine = games.mine([{ id: made.id, key: joined.key }, { id: made.id, key: 'nope' }]);
  assert.equal(mine[0].code, made.code);
  assert.equal(mine[0].creator, false);
  assert.ok(mine[1].gone);
});

test('only the creator can change the code or send everybody else away', (t) => {
  const games = publicGames(t);
  const made = games.createPublic();
  const friend = games.join(made.code);

  assert.equal(games.newInviteCode(made.id, friend.key), null, 'a member changed the code');
  assert.equal(games.revoke(made.id, friend.key), null, 'a member sent people away');

  const code2 = games.newInviteCode(made.id, made.key);
  assert.notEqual(code2, made.code);
  assert.equal(games.join(made.code), null, 'the old code still works');
  assert.equal(games.roleOf(made.id, friend.key), 'member', 'a new code should not lock out people already in');
  const late = games.join(code2);
  assert.ok(late);

  // Somebody connected with a key that's about to stop working gets hung up on.
  const room = games.get(made.id);
  const closed = [];
  const fake = (id, keyHash) => ({ id, keyHash, close: (code) => closed.push([id, code]) });
  room.players.set('a', { ws: fake('a', hashKey(made.key)) });
  room.players.set('b', { ws: fake('b', hashKey(friend.key)) });
  const code3 = games.revoke(made.id, made.key);
  assert.ok(code3 && code3 !== code2);
  assert.deepEqual(closed, [['b', 4001]]);
  assert.equal(games.roleOf(made.id, friend.key), null);
  assert.equal(games.roleOf(made.id, late.key), null);
  assert.equal(games.roleOf(made.id, made.key), 'creator');
  assert.equal(games.join(code2), null);
  room.players.clear();
});

test('valleys from before codes get one, and are pinned', (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'valley-001.json'), JSON.stringify({ seed: 42, world: { money: 10 }, clock: { day: 3, t: 0 } }));
  const games = publicGames(t, dir);
  const links = games.links();
  assert.equal(links.length, 1);
  assert.match(links[0].code, /^[a-z]+-[a-z]+-\d{4}$/);
  assert.ok(links[0].pinned);
  // And the same code after a restart.
  const again = publicGames(t, dir);
  assert.equal(again.links()[0].code, links[0].code);
  assert.ok(again.join(links[0].code));
});

test('a valley nobody is in is put away after a while, and comes back as it was', (t) => {
  const games = publicGames(t);
  const made = games.createPublic();
  const room = games.rooms.get(made.id);
  room.world = { money: 77 };
  room.dirty = true;
  const t0 = room.emptySince;
  assert.equal(games.sweep(t0 + UNLOAD_AFTER_MS - 1000), 0);
  assert.equal(games.sweep(t0 + UNLOAD_AFTER_MS + 1000), 1);
  assert.ok(!games.rooms.has(made.id));
  // Still there to join, and still the same valley.
  assert.equal(games.roleOf(made.id, made.key), 'creator');
  assert.equal(games.get(made.id).world.money, 77);
});

test('valleys nobody wants are let go; pinned and open ones never are', (t) => {
  const games = publicGames(t);
  const unstarted = games.createPublic();
  const stale = games.createPublic();
  const pinned = games.createPublic();
  const open = games.createPublic();
  for (const v of [stale, pinned, open]) {
    const room = games.get(v.id);
    room.world = { money: 1 };
    room.lastPlayed = Date.now();
    room.persist(true);
  }
  games.pin(pinned.id);
  // Everything but `open` put away, as the sweep would.
  for (const v of [unstarted, stale, pinned]) { games.rooms.get(v.id).unload(); games.rooms.delete(v.id); }

  const soon = games.expire(Date.now() + DAY);
  assert.deepEqual(soon.deleted, []);
  assert.deepEqual(soon.archived, []);

  const later = games.expire(Date.now() + NEVER_STARTED_MS + DAY);
  assert.deepEqual(later.deleted, [unstarted.id]);
  assert.equal(games.join(unstarted.code), null);

  const much = games.expire(Date.now() + UNPLAYED_MS + DAY);
  assert.deepEqual(much.archived, [stale.id]);
  assert.ok(existsSync(join(games.dir, 'archive', `valley-${stale.id}.json.gz`)));
  assert.ok(existsSync(games.pathFor(pinned.id)), 'a pinned valley expired');
  assert.ok(existsSync(games.pathFor(open.id)), 'an open valley expired');

  // A year in the archive, and it's gone for good.
  const after = games.expire(Date.now() + UNPLAYED_MS + ARCHIVE_KEEP_MS + 2 * DAY);
  assert.equal(after.purged, 1);
  assert.ok(!existsSync(join(games.dir, 'archive', `valley-${stale.id}.json.gz`)));
});

// --------------------------------------------------------- the real server

async function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** server.js in a child process, on its own port and save folder. */
async function startServer(t, env) {
  const port = await freePort();
  const admin = await freePort();
  const dir = tempDir(t);
  const child = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), ADMIN_PORT: String(admin), SESSION_SAVE: dir, HOLIDAY: 'off', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGKILL'));
  await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (c) => { out += c; if (out.includes('Cat Cafe')) resolve(); });
    child.on('exit', (code) => reject(new Error(`server exited ${code}: ${out}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, body: body && JSON.stringify(body), headers: body ? { 'Content-Type': 'application/json' } : {} });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, data, text };
  };
  const adminCall = async (method, path) => (await fetch(`http://127.0.0.1:${admin}${path}`, { method })).json();
  return { base, port, dir, call, adminCall };
}

/** The first message a WebSocket gets, or its failure. */
function firstMessage(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const done = (v) => { try { ws.close(); } catch { /* fine */ } resolve(v); };
    ws.onmessage = (e) => done({ ok: true, msg: JSON.parse(e.data) });
    ws.onerror = () => done({ ok: false });
    setTimeout(() => done({ ok: false, timeout: true }), 3000);
  });
}

test('the public server: codes, keys, the creator, and nothing to browse', async (t) => {
  const s = await startServer(t, { VALLEY_CODES: '1', PUBLIC_URL: 'https://catcafe.example' });

  // Nothing listed, nothing to make or delete the LAN way.
  assert.deepEqual((await s.call('GET', '/games')).data.games, []);
  assert.equal((await s.call('POST', '/games/new')).status, 404);

  // Only the game's own files.
  assert.equal((await s.call('GET', '/')).status, 200);
  assert.equal((await s.call('GET', '/src/main.js')).status, 200);
  for (const p of ['/server.js', '/saves/', '/package.json', '/tools/harness.html', '/server/games.js',
    '/src/..%2Fpackage.json', '/src/%2e%2e%2Fserver.js', '/icons/..%2F..%2Fserver.js', '/src/../package.json']) {
    assert.equal((await s.call('GET', p)).status, 404, p);
  }

  // Making one, and the link to it.
  const made = (await s.call('POST', '/valleys', {})).data;
  assert.ok(made.ok && made.code && made.key && made.creator);
  const page = await s.call('GET', `/v/${made.code}`);
  assert.equal(page.status, 200);
  assert.ok(page.text.includes('<base href="/">'));

  // Getting in takes a key.
  const ws = `ws://127.0.0.1:${s.port}/ws?game=${made.id}`;
  assert.equal((await firstMessage(ws)).ok, false, 'no key, but let in');
  assert.equal((await firstMessage(`${ws}&key=wrong`)).ok, false, 'a wrong key, but let in');
  const welcome = await firstMessage(`${ws}&key=${encodeURIComponent(made.key)}`);
  assert.ok(welcome.ok && welcome.msg.t === 'welcome');
  assert.equal((await s.call('POST', `/poll?game=${made.id}`, {})).status, 403);
  const poll = await s.call('POST', `/poll?game=${made.id}&key=${encodeURIComponent(made.key)}`, {});
  assert.ok(poll.data.msgs.some((m) => JSON.parse(m).t === 'welcome'));

  // A friend with the code.
  const friend = (await s.call('POST', '/valleys/join', { code: made.code.toUpperCase().replace(/-/g, ' ') })).data;
  assert.ok(friend.ok && friend.key && friend.id === made.id && !friend.creator);
  const mine = (await s.call('POST', '/valleys/mine', { valleys: [{ id: friend.id, key: friend.key }] })).data;
  assert.equal(mine.valleys[0].code, made.code);

  // Only the creator changes the code.
  assert.equal((await s.call('POST', `/valleys/${made.id}/code`, { key: friend.key })).status, 403);
  const changed = (await s.call('POST', `/valleys/${made.id}/code`, { key: made.key })).data;
  assert.ok(changed.ok && changed.code !== made.code);
  assert.equal((await s.call('POST', '/valleys/join', { code: made.code })).status, 404);

  // The admin port has every link.
  const links = await s.adminCall('GET', '/links');
  assert.equal(links.valleys[0].link, `https://catcafe.example/v/${changed.code}`);
  const stats = await s.adminCall('GET', '/stats');
  assert.equal(stats.valleys, 1);
});

test('guessing codes runs out quickly', async (t) => {
  const s = await startServer(t, { VALLEY_CODES: '1' });
  for (let i = 0; i < 20; i++) {
    assert.equal((await s.call('POST', '/valleys/join', { code: `plum-otter-${1000 + i}` })).status, 404);
  }
  assert.equal((await s.call('POST', '/valleys/join', { code: 'plum-otter-9999' })).status, 429);
});

test('making valleys runs out quickly too', async (t) => {
  const s = await startServer(t, { VALLEY_CODES: '1' });
  for (let i = 0; i < 5; i++) assert.equal((await s.call('POST', '/valleys', {})).status, 200);
  assert.equal((await s.call('POST', '/valleys', {})).status, 429);
});

test('the LAN server is unchanged: every valley listed, no keys needed', async (t) => {
  const s = await startServer(t, {});
  const list = (await s.call('GET', '/games')).data;
  assert.equal(list.games.length, 1);
  assert.equal(list.games[0].id, '001');
  assert.equal((await s.call('POST', '/valleys', {})).status, 404, 'the public endpoints answered on the LAN');
  const welcome = await firstMessage(`ws://127.0.0.1:${s.port}/ws?game=001`);
  assert.ok(welcome.ok && welcome.msg.t === 'welcome');
  // The LAN still serves the whole folder, as it always has.
  assert.equal((await s.call('GET', '/package.json')).status, 200);
  assert.ok(readdirSync(s.dir).includes('valley-001.json'));
});

// ------------------------------------------------------- this device's valley

test("a device's own valley: its own seed, kept, and an old save keeps its world", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    const { localValleySeed } = await import('../src/net/valleys.js');
    const LEGACY = 20260724;
    // A new device: a seed of its own, the same one every time after.
    const a = localValleySeed(LEGACY, () => false);
    assert.notEqual(a, LEGACY);
    assert.ok(Number.isInteger(a) && a > 0);
    assert.equal(localValleySeed(LEGACY, () => false), a);
    // A device with a single-player save from before: it keeps that valley.
    store.clear();
    assert.equal(localValleySeed(LEGACY, (seed) => seed === LEGACY), LEGACY);
    assert.equal(localValleySeed(LEGACY, () => false), LEGACY);
  } finally {
    delete globalThis.localStorage;
  }
});
