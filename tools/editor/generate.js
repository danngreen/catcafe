// Turning content back into source.
//
// The editor's whole trick is that questdata.js, villagerdata.js and itemdata.js
// contain nothing but data — no functions, no imports, no cleverness — so they
// can be read by importing them and written by printing them. This is the
// printing half.
//
// It aims at the same shape a person would type: two-space indent, single
// quotes, short objects on one line, long ones broken up. It will not preserve
// hand formatting, which is why the three files it writes say so at the top and
// why every other file is left alone.

/** Order the keys the way a reader wants them, not the way JSON happens to. */
const ORDER = [
  'id', 'name', 'title', 'giver', 'town', 'species', 'coat', 'cloth', 'role',
  'note', 'desc', 'cat', 'icon', 'glyph', 'colour',
  'when', 'night', 'regular', 'visitChance', 'seat', 'spot', 'ghost', 'sells',
  'tellsFirst', 'requires', 'secret', 'arrives',
  'objective', 'steps', 'evidence', 'progress', 'progressWhen', 'reward',
  'offer', 'complete', 'done', 'lines', 'hint', 'sold',
];

function keysOf(o) {
  const known = ORDER.filter((k) => k in o);
  const rest = Object.keys(o).filter((k) => !ORDER.includes(k));
  return [...known, ...rest];
}

/** A JS string literal, quoted the way the rest of the codebase quotes. */
export function str(s) {
  const body = String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/\t/g, '\\t');
  // Single quotes unless the text has more of them than it has doubles.
  const singles = (body.match(/'/g) || []).length;
  const doubles = (body.match(/"/g) || []).length;
  if (singles && singles > doubles) return `"${body.replace(/"/g, '\\"')}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
}

/** Would this whole value fit on one line, and should it? */
function inline(v, budget) {
  const s = print(v, 0, true);
  return s.length <= budget && !s.includes('\\n') ? s : null;
}

/**
 * Print a value as JavaScript. `flat` forces one line, which is how the
 * one-line test above works without a second serialiser to disagree with.
 */
export function print(v, depth = 0, flat = false) {
  const pad = '  '.repeat(depth + 1);
  const close = '  '.repeat(depth);
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return str(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const one = flat ? null : inline(v, 76 - depth * 2);
    if (one) return one;
    if (flat) return `[${v.map((x) => print(x, depth + 1, true)).join(', ')}]`;
    return `[\n${v.map((x) => pad + print(x, depth + 1)).join(',\n')},\n${close}]`;
  }
  if (typeof v === 'object') {
    const keys = keysOf(v);
    if (!keys.length) return '{}';
    const parts = keys.map((k) => `${key(k)}: ${print(v[k], depth + 1, true)}`);
    const one = `{ ${parts.join(', ')} }`;
    if (flat || one.length <= 76 - depth * 2) return one;
    return `{\n${keys.map((k) => `${pad}${key(k)}: ${print(v[k], depth + 1)}`).join(',\n')},\n${close}}`;
  }
  throw new Error(`content cannot hold a ${typeof v}: ${String(v)}`);
}

/** Quote a key only when it needs it. */
function key(k) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : str(k);
}

const HEADER = (what, extra = '') => `// ${what}
//
// Written by the editor in tools/editor. Everything in here is data: no
// functions, no imports, nothing that cannot survive a round trip through
// JSON. Hand edits are welcome and will be kept, but the formatting and any
// comments outside this header are replaced the next time the editor saves.
// A prose note about a particular entry belongs in its own \`note\` field,
// which is data and does survive.${extra ? '\n//\n// ' + extra : ''}

`;

export function questsFile(quests) {
  return `${HEADER('The quests, as plain data.')}export const QUESTS = [\n`
    + quests.map((q) => `  ${print(q, 1)},`).join('\n')
    + '\n];\n';
}

export function villagersFile(villagers) {
  return `${HEADER('The cast, as plain data.',
    'secretMet() and arrivesNow() live in villagers.js and read the small objects here.')}`
    + 'export const VILLAGERS = [\n'
    + villagers.map((v) => `  ${print(v, 1)},`).join('\n')
    + '\n];\n';
}

export function itemsFile(items) {
  const ids = Object.keys(items);
  return `${HEADER('Everything you can carry, buy, cook or put down.')}export const ITEM_DATA = {\n`
    + ids.map((id) => `  ${key(id)}: ${print(items[id], 1)},`).join('\n')
    + '\n};\n';
}
