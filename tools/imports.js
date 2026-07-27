#!/usr/bin/env node
// Names a module uses but never imports.
//
// `node --check` parses a file without resolving anything, so a call to a name
// that was never imported is perfectly valid syntax and stays invisible until
// the line actually runs. That can be a long way off: the Staff tab of the
// cafe book shipped calling two functions it had not imported, because every
// test that opened the book only ever looked at its first page.
//
// This is not a scope analyser. It looks for calls to bare names that some
// module in src/ exports, and complains when the calling file never imported
// that name — which is exactly the shape a bad import leaves behind.
//
//   node tools/imports.js

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const files = [];
(function walk(d) {
  for (const f of readdirSync(d).sort()) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(p);
  }
})(join(ROOT, 'src'));

/**
 * Comments are full of ordinary English that looks like code — "under the
 * cursor (never the first one)" parses as a call to `cursor` — so they go
 * before anything else. Strings go too, for the same reason.
 */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    // Template literals keep their ${...} parts: a great many calls in this
    // codebase live inside one, and dropping the whole literal would hide them.
    .replace(/`(?:\\.|[^`\\])*`/g, (lit) => {
      const kept = [...lit.matchAll(/\$\{([^{}]*)\}/g)].map((m) => m[1]).join(';');
      return `\`\`${kept ? `;${kept};` : ''}`;
    })
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

function names(re, src, group = 1) {
  const out = [];
  for (const m of src.matchAll(re)) out.push(m[group]);
  return out;
}

/** Everything any module in src/ exports, by name. */
const exported = new Set();
for (const f of files) {
  const src = strip(readFileSync(f, 'utf8'));
  for (const n of names(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g, src)) exported.add(n);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) exported.add(n);
    }
  }
}

const problems = [];
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  const src = strip(raw);
  const local = new Set();

  // Imported.
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) local.add(n);
    }
  }
  for (const n of names(/import\s+([A-Za-z_$][\w$]*)\s+from/g, src)) local.add(n);
  for (const n of names(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/g, src)) local.add(n);

  // Declared, at any depth — this is deliberately generous, because a false
  // "it is fine" costs nothing here and a false alarm costs someone a look.
  for (const n of names(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g, src)) local.add(n);
  for (const n of names(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, src)) local.add(n);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) local.add(part.trim().split(/[:=]/)[0].trim());
  }
  // Class and object methods: `thing(a, b) {` at the head of a line is a
  // definition, not a call.
  for (const n of names(/^\s{2,}(?:async\s+|get\s+|set\s+|static\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm, src)) local.add(n);
  // Parameters.
  for (const m of src.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/[:=]/)[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(n)) local.add(n);
    }
  }

  const seen = new Set();
  for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    if (local.has(name) || seen.has(name) || !exported.has(name)) continue;
    seen.add(name);
    // Line number from the original, so the report points somewhere real.
    const at = raw.split('\n').findIndex((l) => new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(l));
    problems.push(`${f.replace(`${ROOT}/`, '')}:${at + 1}  calls ${name}() but never imports it`);
  }
}

for (const p of problems) console.log(p);
console.log(problems.length
  ? `\n${problems.length} missing import${problems.length === 1 ? '' : 's'}`
  : `checked ${files.length} modules — every name is imported`);
process.exit(problems.length ? 1 : 0);
