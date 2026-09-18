#!/usr/bin/env node
// Quietly bail a valley out while people are playing in it — somebody spent
// the lot on a fountain, or the cats have all come down with something.
//
// Runs against the live server, not the save file, so unlike resetquests.js
// you do NOT stop anything first. It talks to the admin port, which only
// listens on 127.0.0.1: run it on the server itself.
//
//   ssh orangepi@mcserve
//   cd catcafe
//   node tools/rescue.js                   how the valley stands
//   node tools/rescue.js money 500         put 500 in the till
//   node tools/rescue.js money -200        take some back out
//   node tools/rescue.js heal              every cat well, fed and cheerful
//   node tools/rescue.js heal --game 002   a particular valley
//   node tools/rescue.js games             every valley and who is in it
//   node tools/rescue.js lock              no new valleys, and none deleted
//   node tools/rescue.js unlock            allow both again
//
// Nothing is announced to the players. The money on their screens just goes
// up, and a sneezing cat stops sneezing.

import { request } from 'node:http';

const PORT = Number(process.env.ADMIN_PORT || 8081);
const args = process.argv.slice(2);
const gi = args.indexOf('--game');
const game = gi >= 0 ? args.splice(gi, 2)[1] : null;
const [cmd = 'status', amount] = args;

function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: PORT, method, path }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { reject(new Error(`odd answer: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    if (body) req.end(JSON.stringify(body)); else req.end();
  });
}

function show(r) {
  if (!r.ok) { console.error(`not done: ${r.why}`); process.exit(1); }
  const what = r.changed.length ? `changed ${r.changed.join(', ')}` : 'nothing needed changing';
  console.log(`valley ${r.game}: ${what}`);
  console.log(`  money ${r.money}   cats ${r.cats} (${r.sick} sick, ${r.hungry} hungry)   ${r.playing} playing`);
}

const rescue = (op) => call('POST', `/rescue${game ? `?game=${encodeURIComponent(game)}` : ''}`, op);

async function main() {
  if (cmd === 'status') show(await rescue({ op: 'look' }));
  else if (cmd === 'heal') show(await rescue({ op: 'heal' }));
  else if (cmd === 'money' || cmd === 'coins') {
    const d = Math.round(Number(amount));
    if (!Number.isFinite(d) || !d) { console.error('how much? e.g. node tools/rescue.js money 500'); process.exit(1); }
    show(await rescue({ op: 'money', d }));
  } else if (cmd === 'lock' || cmd === 'unlock') {
    const r = await call('POST', `/lock?on=${cmd === 'lock' ? 1 : 0}`, {});
    console.log(r.locked
      ? 'Locked. Nobody can make a new valley or delete one, and the lobby stops offering it.'
      : 'Unlocked. New valleys and deleting are allowed again.');
  } else if (cmd === 'games') {
    const r = await call('GET', '/games');
    if (r.locked) console.log('(the lobby is locked)');
    for (const g of r.games) {
      console.log(`${g.id}  ${g.cafe || '(not opened)'}  day ${g.day}  money ${g.money}  cats ${g.cats}  ${g.playing} playing`);
    }
  } else {
    console.error('commands: status, money <n>, heal, lock, unlock, games   (and --game NNN)');
    process.exit(1);
  }
}

// Not top-level await: the distro Node on the box is too old for it, and an
// ssh shell may well find that one before nvm's.
main().catch((err) => {
  console.error(err.code === 'ECONNREFUSED'
    ? `nothing on 127.0.0.1:${PORT} — is the game server running, and are you on that machine?`
    : err.message);
  process.exit(1);
});
