// The editor's own tests.
//
//   node tools/editor/test.js            # everything, about fifteen seconds
//   node tools/editor/test.js --quick    # skip the browser half, about two
//
// Here because the game's sweep is the wrong tool for this. The game imports
// nothing from tools/editor — exactly one scenario in the harness does, and
// that scenario takes a second — so running ninety-nine browser scenarios to
// check a change to a form field is ten minutes of proving something that was
// never in question.
//
// Every save is exercised against a copy of the repository in a temp folder, so
// these tests write real files and none of them are yours.

import { readFile, writeFile, mkdir, mkdtemp, cp, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { questsFile, villagersFile, itemsFile, print } from './generate.js';
import { validate } from './validate.js';

const HERE = new URL('.', import.meta.url).pathname;
const ROOT = join(HERE, '../..');
const PORT = 8391;
const quick = process.argv.includes('--quick');

let failures = 0;
const results = [];

/** Run one named check. It returns a list of complaints; none means it passed. */
async function check(name, fn) {
  const started = Date.now();
  let problems = [];
  try {
    problems = (await fn()) || [];
  } catch (e) {
    problems = [`threw: ${e.message}`];
  }
  const ms = Date.now() - started;
  if (problems.length) failures++;
  results.push({ name, problems, ms });
  const mark = problems.length ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mok  \x1b[0m';
  console.log(`${mark} ${name} \x1b[90m${ms}ms\x1b[0m`);
  for (const p of problems) console.log(`       ${p}`);
}

/** Deep equality that does not care what order the keys came out in. */
const norm = (v) => (Array.isArray(v) ? v.map(norm)
  : (v && typeof v === 'object')
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

const load = async (path, bust = Date.now()) => import(`${pathToFileURL(path).href}?t=${bust}`);

// ---------------------------------------------------------------------------

const content = {
  quests: (await load(join(ROOT, 'src/game/questdata.js'))).QUESTS,
  villagers: (await load(join(ROOT, 'src/world/villagerdata.js'))).VILLAGERS,
  items: (await load(join(ROOT, 'src/game/itemdata.js'))).ITEM_DATA,
};
const places = {
  towns: ['brambleford', 'hollowdown', 'saltmere', 'thistlewick', 'oakhollow'],
  furniture: Object.keys((await load(join(ROOT, 'src/art/objects.js'))).OBJECTS),
  places: ['bushes', 'stones', 'pier_mud', 'keepers_table'],
};

await check('the printer writes what it reads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catcafe-print-'));
  await writeFile(join(dir, 'q.js'), questsFile(content.quests));
  await writeFile(join(dir, 'v.js'), villagersFile(content.villagers));
  await writeFile(join(dir, 'i.js'), itemsFile(content.items));
  const out = [];
  if (!same(content.quests, (await load(join(dir, 'q.js'))).QUESTS)) out.push('quests came back different');
  if (!same(content.villagers, (await load(join(dir, 'v.js'))).VILLAGERS)) out.push('cast came back different');
  if (!same(content.items, (await load(join(dir, 'i.js'))).ITEM_DATA)) out.push('items came back different');
  await rm(dir, { recursive: true, force: true });
  return out;
});

await check('the printer refuses what it cannot write', async () => {
  try {
    print({ id: 'x', when: () => true });
    return ['a function went through without complaint'];
  } catch (e) {
    return /cannot hold a function/.test(e.message) ? [] : [`wrong complaint: ${e.message}`];
  }
});

await check('the content as it stands holds together', async () => validate(content, places));

await check('a typo is caught wherever it is made', async () => {
  const out = [];
  const cases = [
    ['a giver who does not exist', (c) => { c.quests[0].giver = 'pipp'; }, /not in the cast/],
    ['an item that does not exist', (c) => { c.quests[1].objective.item = 'hunny'; }, /not an item/],
    ['a reward item that does not exist', (c) => { c.quests[2].reward.items = [['bel', 1]]; }, /pays out/],
    ['two quests with one id', (c) => { c.quests[1].id = c.quests[0].id; }, /two of them/],
    ['a step with no objective', (c) => { c.quests[0].objective = undefined; }, /no objective|no steps/],
    ['a quest with no offer', (c) => { c.quests[0].offer = ''; }, /no offer/],
    ['somebody with nothing to say', (c) => { c.villagers[0].lines = []; }, /nothing to say/],
    ['an id with a space in it', (c) => { c.villagers[0].id = 'two words'; }, /not a usable id/],
    ['a hint nobody can give', (c) => {
      c.quests[0].needsHint = c.villagers.find((v) => !v.hints?.length).id;
    }, /no hint to give/],
  ];
  for (const [what, breakIt, expect] of cases) {
    const copy = JSON.parse(JSON.stringify(content));
    breakIt(copy);
    const found = validate(copy, places);
    if (!found.length) out.push(`${what}: not caught at all`);
    else if (!found.some((p) => expect.test(p))) out.push(`${what}: caught, but said "${found[0]}"`);
  }
  return out;
});

// --- the server, against a copy of the repository --------------------------

const sandbox = await mkdtemp(join(tmpdir(), 'catcafe-editor-'));
await mkdir(join(sandbox, 'src'), { recursive: true });
await cp(join(ROOT, 'src'), join(sandbox, 'src'), { recursive: true });
await cp(join(ROOT, 'tools/editor'), join(sandbox, 'tools/editor'), { recursive: true });

const server = spawn(process.execPath, [join(ROOT, 'tools/editor/server.js')], {
  env: { ...process.env, EDITOR_ROOT: sandbox, EDITOR_PORT: String(PORT), EDITOR_HOST: '127.0.0.1' },
  stdio: 'ignore',
});
const api = (path, opts) => fetch(`http://127.0.0.1:${PORT}${path}`, opts);
await new Promise((r) => setTimeout(r, 900));

// Prove the sandbox took before writing a single byte.
//
// These tests save for real, and the only thing standing between them and your
// content is one environment variable. When EDITOR_ROOT stopped being read —
// which happened, by way of a careless git checkout — the tests carried on
// happily and renamed a quest in the actual repository. So: mark the copy,
// ask the server what it can see, and refuse to go on if the mark is missing.
const CANARY = 'sandbox_canary_do_not_ship';
{
  const path = join(sandbox, 'src/game/questdata.js');
  const body = await readFile(path, 'utf8');
  await writeFile(path, body.replace(/^\];/m, `  { id: '${CANARY}', title: 'Canary', giver: 'pip',\n`
    + "    objective: { type: 'talk', to: 'pip' }, offer: 'x', complete: 'x' },\n];"));
  const seen = await api('/api/content').then((r) => r.json()).catch(() => ({}));
  if (!(seen.quests || []).some((q) => q.id === CANARY)) {
    console.log('\x1b[31mFAIL\x1b[0m the sandbox is not in effect — refusing to run the write tests');
    console.log('       the editor is reading somewhere other than the copy, so a save here');
    console.log('       would edit real content. Check EDITOR_ROOT in tools/editor/server.js.');
    server.kill('SIGTERM');
    await rm(sandbox, { recursive: true, force: true });
    process.exit(1);
  }
  await writeFile(path, body);      // put the copy back as it was
}

await check('it serves the content it is pointed at', async () => {
  const body = await api('/api/content').then((r) => r.json());
  const out = [];
  if (body.quests?.length !== content.quests.length) out.push(`${body.quests?.length} quests, expected ${content.quests.length}`);
  if (body.villagers?.length !== content.villagers.length) out.push('wrong number of cast');
  if (!body.options?.species?.length) out.push('no species to choose from');
  if (!body.options?.codeFlags?.length) out.push('no list of the flags the game sets');
  if (!body.options?.searchSpots?.length) out.push('no search spots, so a villager cannot be put at one');
  return out;
});

await check('it refuses to save content that does not hold together', async () => {
  const before = await readFile(join(sandbox, 'src/game/questdata.js'), 'utf8');
  const broken = JSON.parse(JSON.stringify(content));
  broken.quests[0].giver = 'nobody_at_all';
  const res = await api('/api/content', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(broken),
  });
  const body = await res.json();
  const after = await readFile(join(sandbox, 'src/game/questdata.js'), 'utf8');
  const out = [];
  if (res.status !== 422) out.push(`answered ${res.status}, expected 422`);
  if (!body.problems?.length) out.push('refused without saying why');
  if (after !== before) out.push('refused the save and wrote the file anyway');
  return out;
});

await check('a good save is written, and backed up first', async () => {
  const edited = JSON.parse(JSON.stringify(content));
  edited.quests[0].title = 'Something To Sell, Renamed';
  const res = await api('/api/content', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edited),
  });
  const body = await res.json();
  const out = [];
  if (res.status !== 200) out.push(`answered ${res.status}`);

  const back = await load(join(sandbox, 'src/game/questdata.js'), Math.random());
  if (back.QUESTS[0].title !== 'Something To Sell, Renamed') out.push('the edit did not land in the file');
  if (!same(back.QUESTS.slice(1), content.quests.slice(1))) out.push('the rest of the quests changed too');

  const backups = await readdir(join(sandbox, 'content-backups')).catch(() => []);
  if (!backups.length) out.push('no backup was taken');
  else {
    const saved = await readFile(join(sandbox, 'content-backups', backups[0], 'quests.js'), 'utf8');
    if (!/Something To Sell'/.test(saved)) out.push('the backup is not the file as it was before');
  }
  if (!/reload/i.test(body.note || '')) out.push('said nothing about reloading the game');
  return out;
});

await check('what it saved still loads as a game would load it', async () => {
  const q = await load(join(sandbox, 'src/game/questdata.js'), Math.random());
  const v = await load(join(sandbox, 'src/world/villagerdata.js'), Math.random());
  const i = await load(join(sandbox, 'src/game/itemdata.js'), Math.random());
  const out = [];
  const strays = [...Object.keys(q), ...Object.keys(v), ...Object.keys(i)]
    .filter((k) => !['QUESTS', 'VILLAGERS', 'ITEM_DATA'].includes(k));
  if (strays.length) out.push(`a content file exports something else: ${strays}`);
  return [...out, ...validate({ quests: q.QUESTS, villagers: v.VILLAGERS, items: i.ITEM_DATA }, places)];
});

// --- the page itself -------------------------------------------------------

if (!quick) {
  await check('the page works, and typing into it does not fight back', async () => {
    const script = `
      const out = [];
      // Every tab lists something.
      for (const tab of ['quests', 'cast', 'items']) {
        document.querySelector('nav button[data-tab=' + tab + ']').click();
        const n = document.querySelectorAll('#list li').length;
        if (!n) out.push(tab + ' lists nothing');
      }
      // Open somebody and type their name, a letter at a time.
      document.querySelector('nav button[data-tab=cast]').click();
      const row = [...document.querySelectorAll('#list li')][0];
      row.click();
      const box = [...document.querySelectorAll('#form input')][0];
      box.focus();
      const was = box.value;
      let lost = 0;
      for (const ch of 'abcdef') {
        box.value += ch;
        box.dispatchEvent(new Event('input', { bubbles: true }));
        if (document.activeElement !== box) lost++;
      }
      if (lost) out.push('focus lost after ' + lost + ' of six keystrokes');
      if (box.value !== was + 'abcdef') out.push('the box did not keep what was typed: ' + box.value);
      if (!document.querySelector('#list li.on b').textContent.endsWith('abcdef')) {
        out.push('the list did not follow the name');
      }
      // A quest with steps draws them.
      document.querySelector('nav button[data-tab=quests]').click();
      const multi = [...document.querySelectorAll('#list li')].find((r) => r.textContent.includes('Hedge'));
      if (multi) {
        multi.click();
        if (document.querySelectorAll('.step').length < 2) out.push('a multi-step quest drew fewer than two steps');
      }
      // And the flag boxes offer what exists.
      if (!document.getElementById('flags-known')) out.push('no list of known flags');
      out.length ? out.join('; ') : 'ok';
    `;
    // Not flattened to one line: it has // comments in it, and collapsing the
    // newlines turns the rest of the script into a comment. spawn takes the
    // argument as-is, so there is no shell to keep happy.
    const said = await run(process.execPath,
      [join(ROOT, 'tools/check.js'), '--url', `http://127.0.0.1:${PORT}/`, '--ms', '4500', '--eval', script]);
    const last = said.trim().split('\n').filter(Boolean).pop() || '';
    if (/EXCEPTION|SyntaxError/.test(said)) return [`the page threw: ${said.slice(-300)}`];
    return last.trim() === 'ok' ? [] : [last.trim() || 'said nothing'];
  });
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => resolve(out));
  });
}

server.kill('SIGTERM');
await rm(sandbox, { recursive: true, force: true });

const total = results.reduce((n, r) => n + r.ms, 0);
console.log('');
console.log(failures
  ? `\x1b[31m${failures} of ${results.length} checks failed\x1b[0m (${(total / 1000).toFixed(1)}s)`
  : `\x1b[32mall ${results.length} checks passed\x1b[0m (${(total / 1000).toFixed(1)}s)`);
console.log('The game itself is not covered here: run `node tools/check.js content` for the');
console.log('one scenario that reads this tool, and the full sweep only when src/ changes.');
process.exit(failures ? 1 : 0);
