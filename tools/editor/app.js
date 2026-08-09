// The content editor, in the browser.
//
// One page, three lists: quests, cast, items. Everything that refers to
// something else is a dropdown, because the whole class of bug this tool exists
// to prevent is a name typed slightly wrong — a quest pointing at "pipp" looks
// exactly like a quest that is broken, from inside the game.
//
// It draws the cast with the game's own sprite code, imported from /src, so a
// villager looks here exactly as they will look in the valley.

import { charSprite, villagerLook } from '/src/art/chars.js';
import { iconSprite } from '/src/art/icons.js';

const $ = (sel) => document.querySelector(sel);
let content = null;      // { quests, villagers, items, options }
let tab = 'quests';
let picked = null;
let dirty = false;

// ---------------------------------------------------------------- plumbing

async function load() {
  content = await fetch('/api/content').then((r) => r.json());
  render();
}

function touch() {
  dirty = true;
  $('#dirty').hidden = false;
}

function payload() {
  return { quests: content.quests, villagers: content.villagers, items: content.items };
}

async function check() {
  const { problems } = await fetch('/api/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload()),
  }).then((r) => r.json());
  showProblems(problems);
  if (!problems.length) say('Nothing wrong with it.');
  return problems;
}

async function save() {
  const res = await fetch('/api/content', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload()),
  });
  const body = await res.json();
  if (!res.ok) { showProblems(body.problems || [body.error]); return; }
  showProblems([]);
  dirty = false;
  $('#dirty').hidden = true;
  say(`${body.note} Backed up as ${body.backup}.`);
}

function showProblems(list) {
  const el = $('#problems');
  if (!list || !list.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<b>${list.length} thing${list.length > 1 ? 's' : ''} to fix before this can be saved</b>`
    + `<ul>${list.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
}

function say(msg) {
  const el = $('#said');
  el.hidden = false;
  el.textContent = msg;
  setTimeout(() => { el.hidden = true; }, 6000);
}

const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// ---------------------------------------------------------------- widgets

/** A labelled control. `why` is the line of help under it. */
function field(label, el, why) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lab = document.createElement('label');
  lab.textContent = label;
  wrap.append(lab, el);
  if (why) {
    const p = document.createElement('div');
    p.className = 'why';
    p.textContent = why;
    wrap.append(p);
  }
  return wrap;
}

function text(value, onChange, opts = {}) {
  const el = document.createElement(opts.long ? 'textarea' : 'input');
  el.value = value ?? '';
  if (opts.long) el.rows = opts.rows || 3;
  if (opts.placeholder) el.placeholder = opts.placeholder;
  el.addEventListener('input', () => { onChange(el.value); touch(); });
  return el;
}

function number(value, onChange, opts = {}) {
  const el = document.createElement('input');
  el.type = 'number';
  if (opts.step) el.step = opts.step;
  el.value = value ?? '';
  el.addEventListener('input', () => {
    onChange(el.value === '' ? undefined : Number(el.value));
    touch();
  });
  return el;
}

/** A dropdown. `list` is [value, label] pairs; blank means "not set". */
function choose(value, list, onChange, opts = {}) {
  const el = document.createElement('select');
  const items = [...(opts.blank === false ? [] : [['', opts.blank || '— none —']]), ...list];
  for (const [v, label] of items) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    o.selected = String(v) === String(value ?? '');
    el.append(o);
  }
  el.addEventListener('change', () => { onChange(el.value || undefined); touch(); });
  return el;
}

function toggle(value, label, onChange) {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;gap:8px;align-items:center;color:var(--dim);font-size:12px';
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.checked = !!value;
  el.style.width = 'auto';
  el.addEventListener('change', () => { onChange(el.checked || undefined); touch(); });
  wrap.append(el, document.createTextNode(label));
  return wrap;
}

function button(label, onClick, cls = '') {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

/** An editable list of strings — what everybody's dialogue is. */
function lineList(arr, onChange, opts = {}) {
  const box = document.createElement('div');
  box.className = 'lines';
  const draw = () => {
    box.textContent = '';
    arr.forEach((line, i) => {
      const row = document.createElement('div');
      row.className = 'line';
      row.append(text(line, (v) => { arr[i] = v; onChange(arr); }, { long: true, rows: 2 }));
      row.append(button('×', () => { arr.splice(i, 1); onChange(arr); draw(); touch(); }, 'danger'));
      box.append(row);
    });
    box.append(button(opts.add || '+ line', () => { arr.push(''); onChange(arr); draw(); touch(); }));
  };
  draw();
  return box;
}

// ---------------------------------------------------------------- choices

const villagerChoices = () => content.villagers
  .map((v) => [v.id, `${v.name} (${v.id})`])
  .sort((a, b) => a[1].localeCompare(b[1]));

const itemChoices = () => Object.entries(content.items)
  .map(([id, it]) => [id, `${it.name} (${id})`])
  .sort((a, b) => a[1].localeCompare(b[1]));

// ---------------------------------------------------------------- portraits

function portrait(v, scale = 3) {
  const look = villagerLook(hashId(v.id || ''));
  const spr = charSprite(v.species || look.species, v.coat || look.coat,
    v.cloth || look.cloth, 'down', 0);
  const c = document.createElement('canvas');
  c.width = spr.width * scale;
  c.height = spr.height * scale;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(spr, 0, 0, c.width, c.height);
  return c;
}

/** The same hash the game uses to pick a look, so the preview matches. */
function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function itemIcon(it, scale = 2) {
  const c = document.createElement('canvas');
  try {
    const spr = iconSprite(it.icon === 'custom' ? (it.glyph || 'parcel') : it.icon);
    c.width = spr.width * scale;
    c.height = spr.height * scale;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(spr, 0, 0, c.width, c.height);
    if (it.icon === 'custom' && it.colour) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = it.colour;
      g.globalAlpha = 0.55;
      g.fillRect(0, 0, c.width, c.height);
    }
  } catch { /* an icon we cannot draw is not worth a broken page */ }
  return c;
}

// ---------------------------------------------------------------- the lists

function listFor(kind) {
  if (kind === 'quests') return content.quests.map((q, i) => ({ i, id: q.id, label: q.title || q.id, sub: q.giver }));
  if (kind === 'cast') return content.villagers.map((v, i) => ({ i, id: v.id, label: v.name || v.id, sub: v.role, villager: v }));
  return Object.entries(content.items).map(([id, it], i) => ({ i, id, label: it.name || id, sub: it.cat, item: it }));
}

/**
 * Redraw everything. Only for changes that alter the shape of the form —
 * picking a different quest, adding a step, switching tabs.
 *
 * Never call this from something you type into. It rebuilds the form, which
 * throws away the very input you are typing in: the name field used to take
 * one letter per click, because every keystroke re-made the box holding the
 * cursor.
 */
function render() {
  renderList();
  drawForm();
}

/** Just the list down the side. Safe to call while somebody is typing. */
function renderList() {
  const filter = $('#filter').value.toLowerCase();
  const ul = $('#list');
  ul.textContent = '';
  for (const row of listFor(tab)) {
    if (filter && !(`${row.label} ${row.id} ${row.sub || ''}`.toLowerCase().includes(filter))) continue;
    const li = document.createElement('li');
    if (row.villager) li.append(portrait(row.villager, 1));
    if (row.item) li.append(itemIcon(row.item, 1));
    const b = document.createElement('b');
    b.textContent = row.label;
    const s = document.createElement('small');
    s.textContent = row.sub || '';
    li.append(b, s);
    if (picked === row.id) li.className = 'on';
    li.addEventListener('click', () => { picked = row.id; render(); });
    ul.append(li);
  }
}

function drawForm() {
  const box = $('#form');
  box.textContent = '';
  if (!picked) { box.innerHTML = '<p class="empty">Pick something on the left.</p>'; return; }
  if (tab === 'quests') return questForm(box);
  if (tab === 'cast') return castForm(box);
  return itemForm(box);
}

// ---------------------------------------------------------------- quests

function questForm(box) {
  const q = content.quests.find((x) => x.id === picked);
  if (!q) { picked = null; return drawForm(); }

  const head = document.createElement('div');
  head.className = 'row';
  head.append(
    field('Title', text(q.title, (v) => { q.title = v; renderList(); })),
    field('Id', text(q.id, (v) => { q.id = v; picked = v; renderList(); },
      { placeholder: 'lower_case' }),
    'Saved games remember quests by id. Changing it on a quest somebody is part way '
      + 'through loses their progress.'),
    field('Given by', choose(q.giver, villagerChoices(), (v) => { q.giver = v; renderList(); }, { blank: false })),
  );
  box.append(head);

  box.append(field('Description', text(q.desc, (v) => { q.desc = v; }, { long: true }),
    'The line in the journal that says what this is about.'));
  box.append(field('Note to yourself', text(q.note, (v) => { q.note = v || undefined; }, { long: true }),
    'Not shown in the game. This is where the comment on a quest lives now.'));

  const flags = document.createElement('div');
  flags.className = 'row';
  flags.append(
    field('After dark only', toggle(q.night, 'giver only appears at night', (v) => { q.night = v; })),
    field('Needs a hint from', choose(q.needsHint, villagerChoices(), (v) => { q.needsHint = v; }),
      'The giver will not offer this until that person has told you their hint.'),
  );
  box.append(flags);

  box.append(field('Offer', text(q.offer, (v) => { q.offer = v; }, { long: true, rows: 5 }),
    'What they say when they ask. Blank line for a paragraph break.'));
  box.append(field('On finishing', text(q.complete, (v) => { q.complete = v; }, { long: true, rows: 5 })));

  // --- steps ---------------------------------------------------------------
  const stepBox = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = 'Steps';
  box.append(h, stepBox);

  const drawSteps = () => {
    stepBox.textContent = '';
    const single = !q.steps;
    if (single) {
      stepBox.append(stepCard({ objective: q.objective, progress: q.progress, progressWhen: q.progressWhen },
        0, 1, {
          onChange: (s) => {
            q.objective = s.objective; q.progress = s.progress;
            q.progressWhen = s.progressWhen?.length ? s.progressWhen : undefined;
          },
          split: () => {
            q.steps = [{ objective: q.objective, progress: q.progress, progressWhen: q.progressWhen },
              { objective: { type: 'talk', to: q.giver } }];
            delete q.objective; delete q.progress; delete q.progressWhen;
            touch(); drawSteps();
          },
        }));
      return;
    }
    q.steps.forEach((s, i) => {
      stepBox.append(stepCard(s, i, q.steps.length, {
        onChange: (v) => { q.steps[i] = v; },
        remove: q.steps.length > 1 ? () => { q.steps.splice(i, 1); touch(); drawSteps(); } : null,
        up: i > 0 ? () => { [q.steps[i - 1], q.steps[i]] = [q.steps[i], q.steps[i - 1]]; touch(); drawSteps(); } : null,
      }));
    });
    stepBox.append(button('+ step', () => {
      q.steps.push({ objective: { type: 'talk', to: q.giver }, note: '' });
      touch(); drawSteps();
    }));
  };
  drawSteps();

  // --- reward --------------------------------------------------------------
  const rh = document.createElement('h3');
  rh.textContent = 'Reward';
  box.append(rh, rewardCard(q));

  const del = document.createElement('div');
  del.style.marginTop = '30px';
  del.append(button('Delete this quest', () => {
    if (!confirm(`Delete "${q.title}"? Anybody part way through it keeps a journal entry that no longer exists.`)) return;
    content.quests.splice(content.quests.indexOf(q), 1);
    picked = null; touch(); render();
  }, 'danger'));
  box.append(del);
}

function stepCard(step, i, total, opts) {
  const card = document.createElement('div');
  card.className = 'step';
  const title = document.createElement('h4');
  title.textContent = total > 1 ? `Step ${i + 1} of ${total}` : 'What finishes it';
  const sp = document.createElement('span');
  sp.className = 'sp';
  if (opts.split) sp.append(button('make it multi-step', opts.split));
  if (opts.up) sp.append(button('↑', opts.up));
  if (opts.remove) sp.append(button('×', opts.remove, 'danger'));
  title.append(sp);
  card.append(title);

  const o = step.objective || (step.objective = { type: 'talk' });
  const kind = choose(o.type, content.options.objectiveTypes.map((t) => [t, t]), (v) => {
    step.objective = { type: v };
    opts.onChange(step);
    redraw();
  }, { blank: false });
  const body = document.createElement('div');

  const redraw = () => {
    body.textContent = '';
    const oo = step.objective;
    const fields = content.options.objectiveFields[oo.type] || [];
    const row = document.createElement('div');
    row.className = 'row';
    for (const f of fields) {
      if (f === 'to') row.append(field('Who', choose(oo.to, villagerChoices(), (v) => { oo.to = v; }, { blank: false })));
      else if (f === 'item') row.append(field('Which item', choose(oo.item, itemChoices(), (v) => { oo.item = v; }, { blank: false })));
      else if (f === 'any') {
        row.append(field('Any of these', multiItems(oo.any || (oo.any = []), (v) => { oo.any = v; })));
      } else if (f === 'place') {
        row.append(field('Furniture', choose(oo.place, content.options.furniture.map((x) => [x, x]), (v) => { oo.place = v; }, { blank: false })));
      } else if (f === 'give') {
        row.append(field('Hand it over', toggle(oo.give !== false, 'the giver hands you the parcel', (v) => { oo.give = v ? undefined : false; })));
      } else if (f === 'flag') {
        row.append(field('Flag', text(oo.flag, (v) => { oo.flag = v; }, { placeholder: 'barrier_eastpass' })));
      } else {
        row.append(field(f, number(oo[f], (v) => { oo[f] = v; }, { step: f === 'quality' ? '0.01' : '1' })));
      }
    }
    body.append(row);
    body.append(field('Journal note', text(step.note, (v) => { step.note = v || undefined; }),
      'The short line in the journal — "Look at the hedge, after dark".'));
    body.append(field('If they ask how it is going', text(step.progress, (v) => { step.progress = v || undefined; }, { long: true }),
      'What the giver says while it is unfinished.'));
    if (total > 1) {
      body.append(field('On finishing this step', text(step.done, (v) => { step.done = v || undefined; }, { long: true })));
      body.append(field('Counts as done if this flag is set', text(step.evidence, (v) => { step.evidence = v || undefined; }),
        'For steps that consume what they ask for: once the collar is handed over you '
        + 'are not holding it, and without this the step looks unfinished for ever.'));
    }
    body.append(conditionalNotes(step));
    opts.onChange(step);
  };

  card.append(field('Kind', kind), body);
  redraw();
  return card;
}

/** Notes that replace the usual one once a flag is set. */
function conditionalNotes(step) {
  const wrap = document.createElement('fieldset');
  const lg = document.createElement('legend');
  lg.textContent = 'Instead, once something is known';
  wrap.append(lg);
  const draw = () => {
    wrap.textContent = '';
    wrap.append(lg);
    (step.progressWhen || []).forEach((alt, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.append(field('When this flag is set', text(alt.flag, (v) => { alt.flag = v; })));
      row.append(field('Say this instead', text(alt.text, (v) => { alt.text = v; }, { long: true })));
      row.append(button('×', () => { step.progressWhen.splice(i, 1); touch(); draw(); }, 'danger'));
      wrap.append(row);
    });
    wrap.append(button('+ condition', () => {
      (step.progressWhen ||= []).push({ flag: '', text: '' });
      touch(); draw();
    }));
  };
  draw();
  return wrap;
}

function multiItems(arr, onChange) {
  const box = document.createElement('div');
  const draw = () => {
    box.textContent = '';
    arr.forEach((id, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.append(choose(id, itemChoices(), (v) => { arr[i] = v; onChange(arr); }, { blank: false }));
      row.append(button('×', () => { arr.splice(i, 1); onChange(arr); draw(); touch(); }, 'danger'));
      box.append(row);
    });
    box.append(button('+ item', () => { arr.push(Object.keys(content.items)[0]); onChange(arr); draw(); touch(); }));
  };
  draw();
  return box;
}

function rewardCard(q) {
  const r = q.reward || (q.reward = {});
  const card = document.createElement('fieldset');
  const row = document.createElement('div');
  row.className = 'row';
  row.append(
    field('Money', number(r.money, (v) => { r.money = v; }), 'Negative if the job costs them.'),
    field('Reputation', number(r.rep, (v) => { r.rep = v; }, { step: '0.01' })),
  );
  card.append(row);

  const items = document.createElement('div');
  const drawItems = () => {
    items.textContent = '';
    (r.items || []).forEach((pair, i) => {
      const line = document.createElement('div');
      line.className = 'row';
      line.append(choose(pair[0], itemChoices(), (v) => { pair[0] = v; }, { blank: false }));
      line.append(number(pair[1], (v) => { pair[1] = v || 1; }));
      line.append(button('×', () => { r.items.splice(i, 1); touch(); drawItems(); }, 'danger'));
      items.append(line);
    });
    items.append(button('+ item', () => {
      (r.items ||= []).push([Object.keys(content.items)[0], 1]);
      touch(); drawItems();
    }));
  };
  drawItems();
  card.append(field('Items', items));

  const friends = document.createElement('div');
  const drawFriends = () => {
    friends.textContent = '';
    (r.friendship || []).forEach((id, i) => {
      const line = document.createElement('div');
      line.className = 'row';
      line.append(choose(id, villagerChoices(), (v) => { r.friendship[i] = v; }, { blank: false }));
      line.append(button('×', () => { r.friendship.splice(i, 1); touch(); drawFriends(); }, 'danger'));
      friends.append(line);
    });
    friends.append(button('+ friend', () => { (r.friendship ||= []).push(q.giver); touch(); drawFriends(); }));
  };
  drawFriends();
  card.append(field('Makes a friend of', friends));

  card.append(field('Flags it sets', text((r.flags || []).join(', '),
    (v) => { r.flags = v.split(',').map((x) => x.trim()).filter(Boolean); if (!r.flags.length) delete r.flags; }),
  'Comma separated. Other quests can wait on these — recipe_honey, for instance.'));
  card.append(field('Hint it unlocks', text(r.hint, (v) => { r.hint = v || undefined; })));
  return card;
}

// ---------------------------------------------------------------- the cast

function castForm(box) {
  const v = content.villagers.find((x) => x.id === picked);
  if (!v) { picked = null; return drawForm(); }

  const top = document.createElement('div');
  top.className = 'portrait';
  const pic = portrait(v, 4);
  top.append(pic);
  const who = document.createElement('div');
  who.innerHTML = `<b>${esc(v.name || v.id)}</b><span class="pill">${esc(v.id)}</span>`
    + `<div class="tag">${esc(v.species || 'picked from the id')} · ${esc(v.coat || 'picked from the id')}`
    + ` · ${esc(v.town || 'wanders')}</div>`;
  top.append(who);
  box.append(top);

  const redrawPic = () => { top.replaceChild(portrait(v, 4), top.firstChild); };

  const r1 = document.createElement('div');
  r1.className = 'row';
  r1.append(
    field('Name', text(v.name, (x) => { v.name = x; renderList(); })),
    field('Id', text(v.id, (x) => { v.id = x; picked = x; renderList(); }),
      'Quests point at people by id.'),
    field('Role', choose(v.role, content.options.roles.map((x) => [x, x]), (x) => { v.role = x; renderList(); })),
  );
  box.append(r1);

  const r2 = document.createElement('div');
  r2.className = 'row';
  r2.append(
    field('Species', choose(v.species, content.options.species.map((x) => [x, x]), (x) => { v.species = x; redrawPic(); }),
      'Left blank, it is picked from the id and never changes.'),
    field('Coat', choose(v.coat, content.options.coats.map((x) => [x, x]), (x) => { v.coat = x; redrawPic(); })),
    field('Clothes', text(v.cloth, (x) => { v.cloth = x || undefined; redrawPic(); }, { placeholder: '#5b8fd6' })),
  );
  box.append(r2);

  const r3 = document.createElement('div');
  r3.className = 'row';
  r3.append(
    field('Town', choose(v.town, content.options.towns.map((t) => [t.id, t.name]), (x) => { v.town = x; renderList(); }),
      'Blank means they wander the countryside.'),
    field('About when', choose(v.when, [['day', 'daytime'], ['night', 'after dark'], ['always', 'always']], (x) => { v.when = x; })),
    field('Stands at', choose(v.spot, (content.options.searchSpots || []).map((x) => [x, x]), (x) => { v.spot = x || undefined; }),
      'A landmark they are always beside, like the ghost at the hedge.'),
  );
  box.append(r3);

  const r4 = document.createElement('div');
  r4.className = 'row';
  r4.append(
    field('Comes into the cafe', toggle(v.regular, 'a regular rather than a resident', (x) => { v.regular = x; })),
    field('How often', number(v.visitChance, (x) => { v.visitChance = x; }, { step: '0.05' }), '0 to 1. Blank is the usual rate.'),
    field('Prefers to sit', choose(v.seat, content.options.seats.map((x) => [x, x]), (x) => { v.seat = x || undefined; })),
  );
  box.append(r4);

  box.append(field('Note to yourself', text(v.note, (x) => { v.note = x || undefined; }, { long: true }),
    'Not shown in the game.'));

  box.append(field('Lines', lineList(v.lines || (v.lines = []), (x) => { v.lines = x; }),
    'Said in turn as you talk to them again.'));
  box.append(field('Hint', text(v.hint, (x) => { v.hint = x || undefined; }, { long: true }),
    'The one useful thing they know. Saying it sets the flag heard_hint_'
    + (v.id || 'them') + ', which a quest can wait on.'));

  const secret = document.createElement('fieldset');
  const lg = document.createElement('legend');
  lg.textContent = 'Not in the valley until…';
  const kind = choose(v.secret ? (v.secret.quest ? 'quest' : 'flag') : '',
    [['flag', 'a flag is set'], ['quest', 'a quest has got somewhere']],
    (x) => {
      v.secret = x === 'flag' ? { flag: '' } : x === 'quest' ? { quest: content.quests[0]?.id, step: 1 } : undefined;
      drawForm();
    });
  secret.append(lg, field('Condition', kind));
  if (v.secret?.flag !== undefined) {
    secret.append(field('Flag', text(v.secret.flag, (x) => { v.secret.flag = x; })));
  }
  if (v.secret?.quest !== undefined) {
    const row = document.createElement('div');
    row.className = 'row';
    row.append(field('Quest', choose(v.secret.quest, content.quests.map((q) => [q.id, q.title]), (x) => { v.secret.quest = x; }, { blank: false })));
    row.append(field('Reached step', number(v.secret.step ?? 1, (x) => { v.secret.step = x; })));
    secret.append(row);
  }
  box.append(secret);

  const del = document.createElement('div');
  del.style.marginTop = '30px';
  del.append(button('Delete', () => {
    const used = content.quests.filter((q) => q.giver === v.id
      || (q.steps || []).some((s) => s.objective?.to === v.id) || q.objective?.to === v.id);
    if (used.length && !confirm(`${v.name} is part of ${used.length} quest(s): ${used.map((q) => q.title).join(', ')}. Delete anyway?`)) return;
    if (!used.length && !confirm(`Delete ${v.name}?`)) return;
    content.villagers.splice(content.villagers.indexOf(v), 1);
    picked = null; touch(); render();
  }, 'danger'));
  box.append(del);
}

// ---------------------------------------------------------------- items

const SHAPES = ['parcel', 'bell', 'ribbon', 'key', 'book', 'map', 'shell', 'lantern', 'rope', 'brush'];

function itemForm(box) {
  const id = picked;
  const it = content.items[id];
  if (!it) { picked = null; return drawForm(); }

  const top = document.createElement('div');
  top.className = 'portrait';
  top.append(itemIcon(it, 4));
  const who = document.createElement('div');
  who.innerHTML = `<b>${esc(it.name || id)}</b><span class="pill">${esc(id)}</span>`;
  top.append(who);
  box.append(top);
  const redrawIcon = () => { top.replaceChild(itemIcon(it, 4), top.firstChild); };

  const r1 = document.createElement('div');
  r1.className = 'row';
  r1.append(
    field('Name', text(it.name, (v) => { it.name = v; renderList(); })),
    field('Id', text(id, (v) => {
      if (!v || v === id || content.items[v]) return;
      const copy = {};
      for (const [k, val] of Object.entries(content.items)) copy[k === id ? v : k] = val;
      content.items = copy;
      picked = v; renderList();
    })),
    field('Category', choose(it.cat, content.options.categories.map((c) => [c, c]), (v) => { it.cat = v; renderList(); }, { blank: false })),
  );
  box.append(r1);

  const r2 = document.createElement('div');
  r2.className = 'row';
  r2.append(
    field('Icon', choose(it.icon, [...content.options.icons.map((x) => [x, x]), ['custom', '— custom —']],
      (v) => { it.icon = v; redrawIcon(); drawForm(); }, { blank: false }),
    'The picture in the bag and the shop.'),
    field('Cost to you', number(it.cost, (v) => { it.cost = v; })),
    field('Price to a customer', number(it.price, (v) => { it.price = v; })),
  );
  box.append(r2);

  if (it.icon === 'custom') {
    const cust = document.createElement('div');
    cust.className = 'row';
    cust.append(
      field('Shape', choose(it.glyph, SHAPES.map((s) => [s, s]), (v) => { it.glyph = v; redrawIcon(); }, { blank: false })),
      field('Tint', text(it.colour, (v) => { it.colour = v; redrawIcon(); }, { placeholder: '#d0a659' })),
    );
    box.append(cust);
  }

  box.append(field('Description', text(it.desc, (v) => { it.desc = v; }, { long: true })));

  const r3 = document.createElement('div');
  r3.className = 'row';
  r3.append(
    field('Appeal', number(it.appeal, (v) => { it.appeal = v; }, { step: '0.05' })),
    field('Keeps for (days)', number(it.shelf, (v) => { it.shelf = v; })),
    field('Served hot or cold', choose(it.temp, [['hot', 'hot'], ['cold', 'cold']], (v) => { it.temp = v; })),
  );
  box.append(r3);

  const del = document.createElement('div');
  del.style.marginTop = '30px';
  del.append(button('Delete', () => {
    if (!confirm(`Delete ${it.name}? Anything holding one keeps a thing with no name.`)) return;
    delete content.items[id];
    picked = null; touch(); render();
  }, 'danger'));
  box.append(del);
}

// ---------------------------------------------------------------- new things

function addNew() {
  if (tab === 'quests') {
    const q = {
      id: `new_quest_${content.quests.length + 1}`,
      title: 'A New Errand',
      giver: content.villagers[0].id,
      desc: '',
      objective: { type: 'talk', to: content.villagers[0].id },
      progress: '',
      reward: { money: 100 },
      offer: '',
      complete: '',
    };
    content.quests.push(q);
    picked = q.id;
  } else if (tab === 'cast') {
    const v = {
      id: `newcomer${content.villagers.length + 1}`,
      name: 'Somebody New',
      town: content.options.towns[0].id,
      role: 'villager',
      lines: ['...'],
    };
    content.villagers.push(v);
    picked = v.id;
  } else {
    const id = `new_item_${Object.keys(content.items).length + 1}`;
    content.items[id] = {
      name: 'A New Thing', cat: content.options.categories[0],
      icon: 'custom', glyph: 'parcel', colour: '#d0a659',
      cost: 10, desc: '',
    };
    picked = id;
  }
  touch();
  render();
}

// ---------------------------------------------------------------- start

for (const b of document.querySelectorAll('nav button')) {
  b.addEventListener('click', () => {
    for (const o of document.querySelectorAll('nav button')) o.classList.toggle('on', o === b);
    tab = b.dataset.tab;
    picked = null;
    render();
  });
}
$('#filter').addEventListener('input', renderList);
$('#add').addEventListener('click', addNew);
$('#check').addEventListener('click', check);
$('#save').addEventListener('click', save);
window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

load();
