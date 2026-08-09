// The content editor.
//
//   node tools/editor/server.js          # then open http://localhost:8090
//
// A separate server on a separate port, deliberately. It writes to the game's
// source tree and has no business being reachable from the game, so it is not
// part of it: nothing in src/ knows this exists, and the game plays perfectly
// well with this never started.
//
// It binds the loopback address unless told otherwise. A thing that rewrites
// source files with no password on it should not answer the LAN by default —
// but on a house server the person editing is rarely sitting at the machine,
// so EDITOR_HOST=0.0.0.0 opens it deliberately, and it says so loudly when you
// do. The quieter way is an ssh tunnel; see the README.
//
// What it edits: questdata.js, villagerdata.js and itemdata.js — the three
// files that hold content rather than code. It reads them by importing them,
// which means what you see is always what the game sees, and writes them by
// printing them back out. Every save takes a copy of all three first.

import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { questsFile, villagersFile, itemsFile } from './generate.js';
import { validate, OBJECTIVE_TYPES, objectiveFields } from './validate.js';

const HERE = new URL('.', import.meta.url).pathname;
const ROOT = join(HERE, '../..');
const PORT = Number(process.env.EDITOR_PORT || 8090);
const HOST = process.env.EDITOR_HOST || '127.0.0.1';

const FILES = {
  quests: join(ROOT, 'src/game/questdata.js'),
  villagers: join(ROOT, 'src/world/villagerdata.js'),
  items: join(ROOT, 'src/game/itemdata.js'),
};
const BACKUPS = join(ROOT, 'content-backups');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * Load the content as the game sees it.
 *
 * Cache-busted on every read: Node caches modules by URL, and an editor that
 * shows you what the files said when it started up is worse than no editor.
 */
async function loadContent() {
  const bust = `?t=${Date.now()}`;
  const q = await import(pathToFileURL(FILES.quests).href + bust);
  const v = await import(pathToFileURL(FILES.villagers).href + bust);
  const items = await import(pathToFileURL(join(ROOT, 'src/game/items.js')).href + bust);
  const places = await import(pathToFileURL(join(ROOT, 'src/world/places.js')).href + bust);
  const chars = await import(pathToFileURL(join(ROOT, 'src/art/chars.js')).href + bust);
  const objects = await import(pathToFileURL(join(ROOT, 'src/art/objects.js')).href + bust);
  const icons = await import(pathToFileURL(join(ROOT, 'src/art/icons.js')).href + bust);
  // The search spots are declared in main.js, which cannot be imported here —
  // it wants a browser the moment it loads. Read the names out of the source
  // instead: a list of keys is not worth booting a DOM for.
  const mainSrc = await readFile(join(ROOT, 'src/main.js'), 'utf8');
  const spots = [...mainSrc.matchAll(/^  ([a-z_][a-z0-9_]*): \(st\) =>/gm)].map((m) => m[1]);

  return {
    quests: q.QUESTS,
    villagers: v.VILLAGERS,
    items: items.ITEMS,
    // Everything the forms need to offer a choice rather than a text box.
    options: {
      species: chars.SPECIES_LIST,
      coats: Object.keys(chars.COATS || {}),
      towns: places.TOWNS.map((t) => ({ id: t.id, name: t.name })),
      shops: places.SHOPS.map((s) => ({ id: s.id, name: s.name, keeper: s.keeper })),
      categories: [...new Set(Object.values(items.ITEMS).map((i) => i.cat))].filter(Boolean),
      icons: Object.keys(icons.ICONS || {}).sort(),
      furniture: Object.keys(objects.OBJECTS).sort(),
      objectiveTypes: OBJECTIVE_TYPES,
      objectiveFields: Object.fromEntries(OBJECTIVE_TYPES.map((t) => [t, objectiveFields(t)])),
      searchSpots: spots,
      roles: [...new Set(v.VILLAGERS.map((x) => x.role))].filter(Boolean).sort(),
      seats: ['barStool', 'chair', 'sofa', 'stool'],
      // Flags the game sets for itself — searching a place, clearing a
      // barrier, serving somebody after dark. Content can wait on these but
      // cannot invent them: the name has to be one the code already writes.
      codeFlags: [...new Set([
        ...[...mainSrc.matchAll(/flags\.([a-z_][a-z0-9_]*)\s*=/g)].map((m) => m[1]),
        ...[...mainSrc.matchAll(/flag: '([a-z_][a-z0-9_]*)'/g)].map((m) => m[1]),
        ...spots.map((sp) => `found_${sp}`),
        'served_after_dark', 'read_town_history', 'read_stones', 'left_milk',
        'bought_the_bear', 'most_seats',
      ])].sort(),
    },
  };
}

/** What validate() needs to tell a real reference from a misspelt one. */
async function placesFor(content) {
  const objects = await import(pathToFileURL(join(ROOT, 'src/art/objects.js')).href);
  return {
    towns: content.options.towns.map((t) => t.id),
    furniture: Object.keys(objects.OBJECTS),
    places: content.options.searchSpots,
  };
}

/**
 * Copy the three files somewhere dated before touching them.
 *
 * Not clever, on purpose: a folder per save, named by the minute, holding
 * whole files. Restoring is a copy back, which somebody can do without this
 * tool, without git, and without asking anyone how.
 */
async function backup() {
  const now = new Date();
  const stamp = [
    now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'),
  ].join('-') + '-' + [
    String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const dir = join(BACKUPS, stamp);
  await mkdir(dir, { recursive: true });
  for (const [name, path] of Object.entries(FILES)) {
    const body = await readFile(path, 'utf8').catch(() => null);
    if (body !== null) await writeFile(join(dir, `${name}.js`), body);
  }
  return stamp;
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4e6) throw new Error('that is too much content');
  }
  return JSON.parse(raw || '{}');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, body, type = TYPES['.json']) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2));
  };

  try {
    if (url.pathname === '/api/content' && req.method === 'GET') {
      send(200, await loadContent());
      return;
    }

    if (url.pathname === '/api/check' && req.method === 'POST') {
      const body = await readBody(req);
      const current = await loadContent();
      send(200, { problems: validate(body, await placesFor(current)) });
      return;
    }

    if (url.pathname === '/api/content' && req.method === 'POST') {
      const body = await readBody(req);
      const current = await loadContent();
      const problems = validate(body, await placesFor(current));
      if (problems.length) { send(422, { problems }); return; }

      const stamp = await backup();
      await writeFile(FILES.quests, questsFile(body.quests));
      await writeFile(FILES.villagers, villagersFile(body.villagers));
      if (body.items) await writeFile(FILES.items, itemsFile(body.items));
      console.log(`[editor] saved — ${body.quests.length} quests, ${body.villagers.length} cast`
        + `, backup ${stamp}`);
      send(200, {
        ok: true,
        backup: stamp,
        // Nothing to restart: the game reads these files in the browser, so a
        // reload is the whole of it. Say so, because "restart the server" is
        // the natural assumption and it is not true here.
        note: 'Saved. Reload the game in the browser to see it — the server holds no quest data.',
      });
      return;
    }

    if (url.pathname === '/api/backups' && req.method === 'GET') {
      const dirs = await readdir(BACKUPS).catch(() => []);
      send(200, { backups: dirs.sort().reverse().slice(0, 40) });
      return;
    }

    // Static: the editor's own page, and the game's source so the cast can be
    // drawn with the very same sprite code the game uses.
    let path = url.pathname === '/' ? '/app.html' : url.pathname;
    const base = path.startsWith('/src/') ? ROOT : HERE;
    const file = join(base, path.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT)) { send(403, { error: 'no' }); return; }
    const body = await readFile(file);
    send(200, body, TYPES[extname(file)] || 'application/octet-stream');
  } catch (e) {
    if (e.code === 'ENOENT') { send(404, { error: 'not found' }); return; }
    console.error('[editor]', e);
    send(500, { error: String(e.message || e) });
  }
});

/** Every address somebody on the LAN could type in. */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
  }
  return out;
}

server.listen(PORT, HOST, () => {
  console.log(`Cat Cafe content editor — http://localhost:${PORT}`);
  console.log('Editing:');
  for (const [name, path] of Object.entries(FILES)) console.log(`  ${name.padEnd(10)} ${path}`);
  console.log(`Backups in ${BACKUPS}`);
  if (HOST === '127.0.0.1') {
    // The commonest way to meet this server is to deploy it somewhere and then
    // fail to reach it, so say plainly why and what to do about it.
    console.log('');
    console.log('Listening on loopback only — this machine can reach it, nothing else can.');
    console.log('From another machine, either tunnel:');
    console.log(`  ssh -N -L ${PORT}:localhost:${PORT} <this-host>     # then http://localhost:${PORT}`);
    console.log('or open it to the network on purpose:');
    console.log(`  EDITOR_HOST=0.0.0.0 node tools/editor/server.js`);
  } else {
    for (const addr of lanAddresses()) console.log(`  on this network: http://${addr}:${PORT}`);
    console.log('');
    console.log('Open to the network. There is no password on this: anyone who can reach');
    console.log('the port can rewrite the game\'s quests, cast and items. Fine on a home');
    console.log('LAN you trust, and a bad idea anywhere else.');
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
