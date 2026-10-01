// Static file server for the game, plus the multiplayer session on /ws.
// Zero dependencies: run it on the laptop or a small box on the same LAN and
// point every player's browser at it.

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, isAbsolute, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { upgrade } from './server/ws.js';
import { PollHub } from './server/poll.js';
import { Games } from './server/games.js';
import { currentHoliday, watchHoliday } from './server/holiday.js';
import { PublicValleys, MAX_PLAYERS } from './server/valleys.js';
import { hashKey } from './server/access.js';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8080);
// Which address to listen on. Unset, every interface, which is what the LAN
// wants. Behind a proxy on a public box, 127.0.0.1, so the only way in is
// through the proxy and whatever it checks first.
const HOST = process.env.HOST || undefined;
// Where the valleys are kept. SESSION_SAVE=0 plays without saving anything,
// which is what the test harness wants; anything else names a directory.
const SAVES = process.env.SESSION_SAVE === '0' ? null
  : isAbsolute(process.env.SESSION_SAVE || '') ? process.env.SESSION_SAVE
    : join(ROOT, process.env.SESSION_SAVE || 'saves');
// Everyone lands here if they don't say which game they want, which is what
// every older client and every existing test does.
const DEFAULT_GAME = '001';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// The public server (VALLEY_CODES=1): valleys have invite codes, nothing lists
// them all, and only the game's own files are served. Unset, it's the LAN
// server it has always been. See server/valleys.js.
const PUBLIC = process.env.VALLEY_CODES === '1';
// The address players use, for the links the admin port prints.
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://catcafe.cafe').replace(/\/$/, '');

const games = new Games(SAVES, { codes: PUBLIC });
const polls = new PollHub();
const front = PUBLIC ? new PublicValleys(games) : null;

// What the public server will hand out: the page and the game, and nothing else
// in this folder. The LAN server serves the whole tree, saves and all, which is
// fine in a house and not on the internet.
const SERVED = process.env.SERVE_TOOLS === '1'
  // The test harness, for tools/check.js only: never set this on a real server.
  ? /^\/(index\.html|styles\.css|manifest\.webmanifest|sw\.js|\.deployed|favicon\.ico)$|^\/(icons|src|tools)\//
  : /^\/(index\.html|styles\.css|manifest\.webmanifest|sw\.js|\.deployed|favicon\.ico)$|^\/(icons|src)\//;

/**
 * Every file the game is made of, and a stamp that changes when any of them
 * does. The service worker (sw.js) keeps a copy of exactly these on the
 * device, so the game opens with no connection; a new stamp is how it knows to
 * fetch a new copy. Worked out from the files themselves, so there's no build
 * step to forget. Remembered for a few seconds: every page load asks.
 */
let assetsCache = null;
async function gameAssets() {
  if (assetsCache && Date.now() - assetsCache.at < 5000) return assetsCache.body;
  const files = ['/', '/index.html', '/styles.css', '/manifest.webmanifest'];
  const walk = async (dir, ext) => {
    for (const ent of await readdir(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${ent.name}`;
      if (ent.isDirectory()) await walk(rel, ext);
      else if (ext.test(ent.name)) files.push(`/${rel}`);
    }
  };
  await walk('src', /\.js$/);
  await walk('icons', /\.png$/);
  const hash = createHash('sha1');
  for (const f of files.slice(1)) {
    const st = await stat(join(ROOT, f));
    hash.update(`${f}:${st.size}:${st.mtimeMs}\n`);
  }
  const body = { version: hash.digest('hex').slice(0, 12), files };
  assetsCache = { at: Date.now(), body };
  return body;
}

// With a room full of people who have never played, "New valley" and the
// delete key are two ways to end up somewhere nobody meant to be. Locking the
// lobby takes both away — the valleys that exist stay joinable. Set
// LOBBY_LOCK=1 to start locked; tools/rescue.js turns it on and off live.
const lobby = { locked: process.env.LOBBY_LOCK === '1' };

// A single-valley save from before there were several becomes game 001.
const moved = PUBLIC ? null : games.adoptLegacy(SAVES ? join(ROOT, 'valley.json') : null);
// There is always somewhere to play on the LAN, so a fresh install has a game
// to join. The public server starts empty: valleys are made by the people who
// play in them.
if (!PUBLIC && !games.ids().length) games.create();

/**
 * The game a request is asking for. On the LAN, defaulting to the first one.
 * On the public server, only with a device key that valley knows, and never a
 * default: `{ room, keyHash }`, or null.
 */
function gameFor(url) {
  const q = new URL(url, 'http://x').searchParams;
  if (PUBLIC) {
    const id = q.get('game'), key = q.get('key');
    if (!games.roleOf(id, key)) return null;
    const room = games.get(id);
    return room ? { room, keyHash: hashKey(key) } : null;
  }
  const room = games.get(q.get('game') || DEFAULT_GAME) || games.get(games.ids()[0]);
  return room ? { room, keyHash: null } : null;
}

/** Is this request from this machine itself, not through Caddy? */
const fromHere = (req) => !req.headers['x-forwarded-for']
  && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

/** The game's page, with links like /v/plum-otter-4271 still finding its files. */
let pageCache = null;
async function pageForLink() {
  if (!pageCache) {
    const html = await readFile(join(ROOT, 'index.html'), 'utf8');
    pageCache = html.replace(/<head>/i, '<head>\n<base href="/">');
  }
  return pageCache;
}

// Closing the laptop lid should not cost anyone their afternoon.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { games.persistAll(); process.exit(0); });
}

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // The server's own view of the session. Open it from any machine on the LAN
  // when the game and the players disagree about who is in the valley.
  const json = (body, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body, null, 2));
  };
  // On the public server, only from the machine itself: it names everybody in.
  if (path === '/status' && (!PUBLIC || fromHere(req))) {
    const room = PUBLIC ? games.get(new URL(req.url, 'http://x').searchParams.get('game'))
      : (gameFor(req.url) || {}).room;
    json(room ? room.status() : { error: 'no such game' }, room ? 200 : 404);
    return;
  }
  if (path === '/sw-assets.json') { json(await gameAssets()); return; }
  if (PUBLIC) {
    if (await front.handle(req, path, json)) return;
    // An invite link opens the game; the page reads the code from the address.
    if (/^\/v\/[^/]+\/?$/.test(path) && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
      res.end(await pageForLink());
      return;
    }
  }
  // What the lobby lists. Plain HTTP and no socket, so a player can read the
  // stats of every valley before deciding which one to walk into. The public
  // server answers with no valleys at all: nobody gets to browse other people's.
  if (path === '/games' && req.method === 'GET' && PUBLIC) {
    json({ games: [], locked: true, codes: true, holiday: currentHoliday() });
    return;
  }
  if (PUBLIC && (path === '/games/new' || path.startsWith('/games/'))) {
    json({ ok: false, why: 'not on this server' }, 404);
    return;
  }
  if (path === '/games' && req.method === 'GET') {
    json({ games: games.list(), locked: lobby.locked, holiday: currentHoliday() });
    return;
  }
  if (path === '/games/new' && req.method === 'POST') {
    if (lobby.locked) { json({ ok: false, why: 'the lobby is locked' }, 403); return; }
    json(games.create());
    return;
  }
  const del = /^\/games\/(\d{3})$/.exec(path);
  if (del && req.method === 'DELETE') {
    if (lobby.locked) { json({ ok: false, why: 'the lobby is locked' }, 403); return; }
    const res2 = games.remove(del[1]);
    if (res2.ok) console.log(`[games] removed valley ${del[1]}`);
    json(res2, res2.ok ? 200 : 409);
    return;
  }
  // The session over plain HTTP, for machines that can't hold a socket open.
  if (path === '/poll' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();       // nothing legitimate is this big
    });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
      const g = gameFor(req.url);
      if (!g) { json({ error: 'no such game' }, PUBLIC ? 403 : 404); return; }
      const { room, keyHash } = g;
      // A new connection to a full valley is turned away; one already in is fine.
      if (PUBLIC && !body.id && room.players.size >= MAX_PLAYERS) {
        json({ error: 'full', why: 'That valley is full right now.' }, 503);
        return;
      }
      const reply = polls.handle(body, (conn) => { conn.keyHash = keyHash; room.attach(conn); });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(reply));
    });
    return;
  }

  if (path === '/') path = '/index.html';
  // Checked on the path as it will actually be read: an escaped slash in the
  // address ("/src/..%2Fsaves/...") only becomes a way out once it's decoded and
  // normalized, so the check has to come after both.
  const clean = normalize(path).replace(/^(\.\.[/\\])+/, '');
  if (PUBLIC && !SERVED.test(clean)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
    return;
  }
  const file = join(ROOT, clean);
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
  }
});

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path !== '/ws') { socket.destroy(); return; }
  const g = gameFor(req.url);
  if (!g) {
    if (PUBLIC) socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    else socket.destroy();
    return;
  }
  if (PUBLIC && g.room.players.size >= MAX_PLAYERS) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    return;
  }
  const ws = upgrade(req, socket, head);
  if (ws) { ws.keyHash = g.keyHash; g.room.attach(ws); }
});

// The host's back door, for tools/rescue.js: more money in the till, every cat
// better. Bound to loopback on its own port, so nothing on the LAN can reach
// it — you have to be on the box, which in practice means ssh'd into it.
// ADMIN_PORT=0 turns it off.
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 8081);

/**
 * Which valley a rescue is for. Named, or else the only one anybody is in —
 * at a party that's the one you mean, and guessing between two is not a thing
 * to do to somebody's books.
 */
function rescueTarget(want) {
  if (want) return games.get(want) ? { room: games.get(want) } : { why: `no valley ${want}` };
  const busy = games.list().filter((g) => g.playing);
  if (busy.length === 1) return { room: games.get(busy[0].id) };
  const ids = games.ids();
  if (!busy.length && ids.length === 1) return { room: games.get(ids[0]) };
  return { why: `say which valley with --game (${(busy.length ? busy : games.list()).map((g) => g.id).join(', ')})` };
}

if (ADMIN_PORT) {
  const admin = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const json = (body, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body, null, 2));
    };
    if (url.pathname === '/games' && req.method === 'GET') {
      json({ games: games.list(), locked: lobby.locked });
      return;
    }
    // The lobby lock, on and off without a restart: at a party the point is to
    // change your mind about it while people are sitting there playing.
    if (url.pathname === '/lock' && req.method === 'POST') {
      lobby.locked = url.searchParams.get('on') !== '0';
      console.log(`[rescue] lobby ${lobby.locked ? 'locked' : 'unlocked'}`);
      json({ ok: true, locked: lobby.locked });
      return;
    }
    // The public server's books: every valley's link, how busy it is, and the
    // two things only you can do — pin a valley so it never expires, and give a
    // creator who lost their device a new creator key.
    if (PUBLIC && url.pathname === '/links' && req.method === 'GET') {
      json({ valleys: games.links().map((v) => ({ ...v, link: v.code ? `${PUBLIC_URL}/v/${v.code}` : null })) });
      return;
    }
    if (url.pathname === '/stats' && req.method === 'GET') {
      json({ public: PUBLIC, ...games.stats() });
      return;
    }
    if (PUBLIC && url.pathname === '/pin' && req.method === 'POST') {
      const id = url.searchParams.get('game');
      const ok = games.pin(id, url.searchParams.get('on') !== '0');
      json(ok ? { ok, id } : { ok: false, why: `no valley ${id}` }, ok ? 200 : 404);
      return;
    }
    if (PUBLIC && url.pathname === '/creator' && req.method === 'POST') {
      const id = url.searchParams.get('game');
      const key = games.addCreator(id);
      if (!key) { json({ ok: false, why: `no valley ${id}` }, 404); return; }
      console.log(`[rescue] valley ${id}: a new creator key was handed out`);
      json({ ok: true, id, link: `${PUBLIC_URL}/v/${games.accessOf(id).code}#creator=${id}.${key}` });
      return;
    }
    if (url.pathname !== '/rescue' || req.method !== 'POST') { json({ ok: false, why: 'not here' }, 404); return; }
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let op;
      try { op = JSON.parse(raw || '{}'); } catch { json({ ok: false, why: 'bad json' }, 400); return; }
      const { room, why } = rescueTarget(url.searchParams.get('game'));
      if (!room) { json({ ok: false, why }, 409); return; }
      const out = room.rescue(op);
      if (out.ok && out.changed.length) console.log(`[rescue] valley ${room.gameId}: ${JSON.stringify(op)}`);
      json({ game: room.gameId, ...out }, out.ok ? 200 : 409);
    });
  });
  admin.on('error', (err) => console.warn(`[rescue] admin port ${ADMIN_PORT} unavailable: ${err.message}`));
  admin.listen(ADMIN_PORT, '127.0.0.1');
}

/** Every address a player on the LAN could type in. */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

// The public server may hold thousands of valleys: put away the ones nobody is
// in, and let go of the ones nobody wants (see Games.expire).
if (PUBLIC) {
  setInterval(() => games.sweep(), 60 * 1000).unref();
  const expire = () => {
    const out = games.expire();
    if (out.deleted.length || out.archived.length || out.purged) {
      console.log(`[valleys] expired: ${out.deleted.length} never started, ${out.archived.length} archived, ${out.purged} archives purged`);
    }
  };
  expire();
  setInterval(expire, 6 * 60 * 60 * 1000).unref();
}

// A holiday starting or ending mid-session: tell everyone who's in, and let
// them reload when it suits them.
watchHoliday((h) => {
  console.log(`[holiday] ${h ? `${h.id} ${h.year}` : 'none'}`);
  for (const room of games.rooms.values()) room.broadcast({ t: 'holiday', holiday: h });
});

server.listen(PORT, HOST, () => {
  console.log(`Cat Cafe — http://${HOST || 'localhost'}:${PORT}${PUBLIC ? ` (public: valley codes, ${PUBLIC_URL})` : ''}`);
  if (!HOST) for (const addr of lanAddresses()) console.log(`  on this network: http://${addr}:${PORT}`);
  if (moved) console.log(`  moved your old valley.json to ${moved}`);
  // The public server may have thousands; a count is enough there.
  if (PUBLIC) console.log(`  ${games.ids().length} valleys`);
  else {
    for (const g of games.list()) {
      console.log(`  game ${g.id}: ${g.started ? `${g.cafe || 'a cafe'}, day ${g.day}` : 'not started yet'}`);
    }
  }
  console.log(SAVES ? `  valleys kept in ${SAVES}` : '  not saving anything');
  const h = currentHoliday();
  if (h) console.log(`  holiday: ${h.id} ${h.year}`);
});
