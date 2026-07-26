// Static file server for the game, plus the multiplayer session on /ws.
// Zero dependencies: run it on the laptop or a small box on the same LAN and
// point every player's browser at it.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { upgrade } from './server/ws.js';
import { PollHub } from './server/poll.js';
import { Games } from './server/games.js';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8080);
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

const games = new Games(SAVES);
const polls = new PollHub();

// A single-valley save from before there were several becomes game 001.
const moved = games.adoptLegacy(SAVES ? join(ROOT, 'valley.json') : null);
// There is always somewhere to play, so a fresh install has a game to join.
if (!games.ids().length) games.create();

/** The game a request is asking for, defaulting to the first one. */
function gameFor(url) {
  const want = new URL(url, 'http://x').searchParams.get('game');
  return games.get(want || DEFAULT_GAME) || games.get(games.ids()[0]);
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
  if (path === '/status') {
    const room = gameFor(req.url);
    json(room ? room.status() : { error: 'no such game' }, room ? 200 : 404);
    return;
  }
  // What the lobby lists. Plain HTTP and no socket, so a player can read the
  // stats of every valley before deciding which one to walk into.
  if (path === '/games' && req.method === 'GET') { json({ games: games.list() }); return; }
  if (path === '/games/new' && req.method === 'POST') { json(games.create()); return; }
  const del = /^\/games\/(\d{3})$/.exec(path);
  if (del && req.method === 'DELETE') {
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
      const room = gameFor(req.url);
      if (!room) { json({ error: 'no such game' }, 404); return; }
      const reply = polls.handle(body, (conn) => room.attach(conn));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(reply));
    });
    return;
  }

  if (path === '/') path = '/index.html';
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
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
  const room = gameFor(req.url);
  if (!room) { socket.destroy(); return; }
  const ws = upgrade(req, socket, head);
  if (ws) room.attach(ws);
});

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

server.listen(PORT, () => {
  console.log(`Cat Cafe — http://localhost:${PORT}`);
  for (const addr of lanAddresses()) console.log(`  on this network: http://${addr}:${PORT}`);
  if (moved) console.log(`  moved your old valley.json to ${moved}`);
  for (const g of games.list()) {
    console.log(`  game ${g.id}: ${g.started ? `${g.cafe || 'a cafe'}, day ${g.day}` : 'not started yet'}`);
  }
  console.log(SAVES ? `  valleys kept in ${SAVES}` : '  not saving anything');
});
