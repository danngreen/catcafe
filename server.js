// Static file server for the game, plus the multiplayer session on /ws.
// Zero dependencies: run it on the laptop or a small box on the same LAN and
// point every player's browser at it.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { upgrade } from './server/ws.js';
import { PollHub } from './server/poll.js';
import { Room } from './server/room.js';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8080);
// One shared valley. Change it (or set WORLD_SEED) for a different countryside.
const SEED = Number(process.env.WORLD_SEED || 20260724);
// Where the shared cafe is kept between sessions. SESSION_SAVE=0 plays without
// saving at all, which is what the test harness wants.
const SAVE = process.env.SESSION_SAVE === '0' ? null
  : isAbsolute(process.env.SESSION_SAVE || '') ? process.env.SESSION_SAVE
    : join(ROOT, process.env.SESSION_SAVE || 'valley.json');

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

const room = new Room(SEED, SAVE);
const polls = new PollHub();

// Closing the laptop lid should not cost anyone their afternoon.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { room.persist(); process.exit(0); });
}

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // The server's own view of the session. Open it from any machine on the LAN
  // when the game and the players disagree about who is in the valley.
  if (path === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(room.status(), null, 2));
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
  console.log(`  world seed ${SEED}`);
  console.log(SAVE ? `  shared cafe saved to ${SAVE}` : '  not saving the shared cafe');
});
