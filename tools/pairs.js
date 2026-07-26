// Runs the scenarios that need two browsers at once.
//
//   node tools/pairs.js            # every pair
//   node tools/pairs.js netcafe    # just that one
//
// Each pair is two check.js runs against the same session, the second started a
// few seconds after the first so it arrives to a valley somebody is already in.
// Doing this by hand meant a shell one-liner with sleeps in it, which was easy
// to get subtly wrong and impossible to run as a set.

import { spawn } from 'node:child_process';

const HERE = new URL('.', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAIRS = [
  { id: 'netcafe', first: 'netcafehost', second: 'netcafeguest', gap: 4000 },
  { id: 'netfound', first: 'netfound', second: 'netguest', gap: 5000 },
  { id: 'netwalk', first: 'netwalkhost', second: 'netwalkguest', gap: 3000 },
  { id: 'nettitle', first: 'nettitlehost', second: 'nettitleguest', gap: 3000 },
  { id: 'netquest', first: 'netquesthost', second: 'netquestguest', gap: 3000 },
  { id: 'netjoin', first: 'nettitle', second: 'netpresence', gap: 2000 },
  { id: 'netcreate', first: 'netfound', second: 'netcreatetitle', gap: 4000 },
  { id: 'netmix', first: 'netcafehost', second: 'netpollbooks', gap: 4000 },
  // Both halves sit on the title screen for a minute doing nothing, which is
  // the whole point: neither should be hung up on.
  { id: 'netidle', first: 'netidletitle', second: 'netidletitle', gap: 2000 },
];

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const pairs = wanted.length ? PAIRS.filter((p) => wanted.includes(p.id)) : PAIRS;
if (!pairs.length) {
  console.error(`no such pair. known: ${PAIRS.map((p) => p.id).join(' ')}`);
  process.exit(2);
}

/** One check.js run, its output captured rather than interleaved. */
function run(scenario, hold = 0) {
  return new Promise((resolve) => {
    const argv = [`${HERE}check.js`, scenario, '--clean'];
    if (hold) argv.push('--hold', String(hold));
    const p = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => resolve(out));
  });
}

let failed = 0;
for (const pair of pairs) {
  // A fresh room each time, so a previous pair's players aren't still in it.
  const server = spawn(process.execPath, [`${HERE}../server.js`], {
    stdio: 'ignore',
    env: { ...process.env, SESSION_SAVE: '0' },
  });
  await sleep(1500);

  // The first browser has to still be connected while the second does its
  // checks, so hold it open past the second's finish rather than letting it
  // close the moment its own scenario is done.
  // Ten seconds covers the gap between the halves finishing in every pair
  // here; the long ones overlap by themselves.
  const a = run(pair.first, pair.hold ?? 10000);
  await sleep(pair.gap);
  const b = run(pair.second);
  const [outA, outB] = await Promise.all([a, b]);

  server.kill();
  await sleep(300);

  for (const [name, out] of [[pair.first, outA], [pair.second, outB]]) {
    const line = out.split('\n').find((l) => l.startsWith('RESULT')) || '(no result)';
    const bad = !line.startsWith('RESULT OK');
    if (bad) failed++;
    console.log(`${bad ? 'FAIL' : 'ok  '}  ${pair.id}/${name}  ${line}`);
    if (bad) console.log(out.split('\n').slice(0, 8).map((l) => '        ' + l).join('\n'));
  }
}

console.log(failed ? `\n${failed} half-pair(s) failed` : `\nall ${pairs.length} pairs passed`);
process.exit(failed ? 1 : 0);
