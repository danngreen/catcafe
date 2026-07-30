// Is this Node new enough to run the server?
//
// Deliberately written in the oldest JavaScript in this repository, and as
// CommonJS: it has to run *on the Node it is complaining about*. Anything
// modern in here — an arrow function, a template literal, an import — and it
// dies with a syntax error instead of a diagnosis, which is the exact failure
// it exists to replace.
//
// The failure it replaces, on Node 12:
//   Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:fs/promises
// which is true, unhelpful, and forty lines from the top of a stack trace.

var MIN_MAJOR = 16;

var raw = process.versions.node;
var major = parseInt(raw.split('.')[0], 10);

if (major >= MIN_MAJOR) process.exit(0);

var lines = [
  '',
  'Cat Cafe needs Node ' + MIN_MAJOR + ' or newer. This is Node ' + raw + '.',
  '  at ' + process.execPath,
  '',
  'It uses three things your Node has not got:',
  '  node:-prefixed builtins (node:fs/promises)   Node 16',
  '  logical assignment (||=)                     Node 15',
  '  nullish coalescing (??)                      Node 14',
  '',
  'The Node in your shell and the Node systemd runs are often not the same.',
  'Check both:',
  '  node --version            # yours',
  '  /usr/bin/node --version   # the one in the service file',
  '',
  'On Debian and Armbian the packaged node is usually years behind. Either',
  'install a current one:',
  '  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -',
  '  sudo apt install -y nodejs',
  '',
  'or point ExecStart and ExecStartPre at a newer one you already have:',
  '  which -a node',
  '',
];

process.stderr.write(lines.join('\n') + '\n');
process.exit(1);
