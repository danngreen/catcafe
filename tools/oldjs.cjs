// Would this still run on an eleven year old iPad?
//
// The game is plain ES modules with no build step, which is a good deal until
// the day somebody writes `?.` and an iPad Air on iOS 12 refuses the whole
// module before a line of it runs. Nothing is logged where anyone can see it:
// the title card sits there and taps do nothing. There is no way to notice
// that from a Mac, so this notices instead.
//
// Everything here is younger than Safari 12.1 (iOS 12.5), the last version
// those tablets can install. Syntax is the dangerous half — the file is
// refused whole — but a missing method takes the game down just as far, so
// both are listed. CommonJS and old JavaScript on purpose: same reason as
// preflight.cjs.
//
//   node tools/oldjs.cjs
//
// The other half of the same job is the `oldsafari` scenario in harness.html,
// which checks the stylesheet and the way the picture measures itself.

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DIRS = ['src'];

var RULES = [
  { re: /\?\./g,                    what: 'optional chaining (?.)',        since: 'Safari 13.1' },
  { re: /\?\?/g,                    what: 'nullish coalescing (??)',       since: 'Safari 13.1' },
  { re: /(\|\||&&)=[^=]/g,          what: 'logical assignment (||=, &&=)', since: 'Safari 14' },
  { re: /^await |[^.\w]await [^\s]/g, what: 'top-level await',             since: 'Safari 15', topLevelOnly: true },
  { re: /\breplaceAll\(/g,          what: 'String.replaceAll',             since: 'Safari 13.1' },
  { re: /\bmatchAll\(/g,            what: 'String.matchAll',               since: 'Safari 13' },
  { re: /\.at\(/g,                  what: 'Array.at',                      since: 'Safari 15.4' },
  { re: /\ballSettled\(/g,          what: 'Promise.allSettled',            since: 'Safari 13' },
  { re: /\bstructuredClone\(/g,     what: 'structuredClone',               since: 'Safari 15.4' },
  { re: /\breplaceChildren\(/g,     what: 'Element.replaceChildren',       since: 'Safari 14' },
  { re: /\bBigInt\b/g,              what: 'BigInt',                        since: 'Safari 14' },
  { re: /\bhasOwn\(/g,              what: 'Object.hasOwn',                 since: 'Safari 15.4' },
  { re: /[0-9]_[0-9]/g,             what: 'numeric separators (1_000)',    since: 'Safari 13' },
  // In a regular expression, and so read when the file is parsed rather than
  // when the line runs: one of these takes the whole module down with it.
  { re: /\(\?<[=!]/g,              what: 'regexp lookbehind ((?<=))',     since: 'Safari 16.4' },
  { re: /this\.#|\s#[A-Za-z_$]/g,   what: 'private class fields (#x)',     since: 'Safari 14.1' },
  // Pointer events are the other half of the same story: they arrived in iOS
  // 13 too, so a listener bound straight to one is a button that cannot be
  // pressed. input.js is where the translation lives and is allowed to name
  // them.
  { re: /addEventListener\(\s*['"]pointer/g, what: 'a pointer event bound directly — use onPointer() from engine/input.js',
    since: 'Safari 13', raw: true, except: 'src/engine/input.js' },
];

function files(dir, out) {
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var full = path.join(dir, e.name);
    if (e.isDirectory()) files(full, out);
    else if (/\.js$/.test(e.name)) out.push(full);
  }
  return out;
}

// Crude, and deliberately so: strip line comments and quoted text before
// looking, so a `??` inside a sentence in a string is not a finding.
function bare(line) {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

var found = [];
var list = files(path.join(ROOT, DIRS[0]), []);
for (var f = 0; f < list.length; f++) {
  var lines = fs.readFileSync(list[f], 'utf8').split('\n');
  for (var n = 0; n < lines.length; n++) {
    var line = bare(lines[n]);
    var rel = path.relative(ROOT, list[f]);
    for (var r = 0; r < RULES.length; r++) {
      var rule = RULES[r];
      if (rule.except && rel === rule.except) continue;
      rule.re.lastIndex = 0;
      if (!rule.re.test(rule.raw ? lines[n] : line)) continue;
      // `await` inside an async function is fine; only the top level is not,
      // and at the top level it is not indented.
      if (rule.topLevelOnly && /^\s/.test(lines[n])) continue;
      found.push({
        file: rel, line: n + 1,
        what: rule.what, since: rule.since, text: lines[n].trim(),
      });
    }
  }
}

if (!found.length) {
  if (process.argv.indexOf('--quiet') < 0) {
    console.log('oldjs: ' + list.length + ' files, nothing an iOS 12 iPad would choke on.');
  }
  process.exit(0);
}

console.error('');
console.error('These would stop the game dead on an old iPad (iOS 12.5, Safari 12.1):');
console.error('');
for (var k = 0; k < found.length; k++) {
  var it = found[k];
  console.error('  ' + it.file + ':' + it.line + '  ' + it.what + ' — ' + it.since);
  console.error('      ' + it.text.slice(0, 100));
}
console.error('');
console.error('A module with any of the syntax ones in it is refused whole, before a line');
console.error('of it runs — the title card stays up and taps do nothing, with no error');
console.error('shown anywhere. Write it the old way instead.');
console.error('');
process.exit(1);
