// Frame-level tests for the hand-rolled WebSocket server.
//
// The browser decides for itself whether to split a message across frames, and
// on loopback it generally doesn't — so the cases that only bite over real wifi
// have to be fed in deliberately. Run: node tools/wsframes.js

import { WSSocket } from '../server/ws.js';
import { EventEmitter } from 'node:events';

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
}

/** A stand-in for the TCP socket, so we can feed bytes by hand. */
class FakeSocket extends EventEmitter {
  constructor() { super(); this.written = []; this.destroyed = false; }
  write(b) { this.written.push(b); return true; }
  end() { this.destroyed = true; }
  destroy() { this.destroyed = true; }
  setNoDelay() {}
}

/** Build a client frame: always masked, as browsers must. */
function clientFrame(opcode, payload, fin = true) {
  const body = Buffer.from(payload, 'utf8');
  const mask = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
  const masked = Buffer.from(body);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  let head;
  const len = masked.length;
  if (len < 126) {
    head = Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | len]);
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = (fin ? 0x80 : 0) | opcode;
    head[1] = 0x80 | 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = (fin ? 0x80 : 0) | opcode;
    head[1] = 0x80 | 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, mask, masked]);
}

function harness() {
  const sock = new FakeSocket();
  const ws = new WSSocket(sock);
  const got = [];
  ws.on('message', (m) => got.push(m));
  return { sock, ws, got };
}

// --- a plain short message ---------------------------------------------------
{
  const { sock, got } = harness();
  sock.emit('data', clientFrame(0x1, '{"t":"ping"}'));
  check('short text frame', got, ['{"t":"ping"}']);
}

// --- a message needing the 16-bit length ------------------------------------
{
  const { sock, got } = harness();
  const big = JSON.stringify({ t: 'cust', pad: 'x'.repeat(900) });
  sock.emit('data', clientFrame(0x1, big));
  check('extended-length frame', got, [big]);
}

// --- one frame arriving as several TCP chunks -------------------------------
{
  const { sock, got } = harness();
  const big = JSON.stringify({ t: 'cust', pad: 'y'.repeat(500) });
  const buf = clientFrame(0x1, big);
  for (let i = 0; i < buf.length; i += 7) sock.emit('data', buf.subarray(i, i + 7));
  check('frame split across chunks', got, [big]);
}

// --- a message split across frames, which is what wifi may produce ----------
{
  const { sock, got } = harness();
  const a = '{"t":"cust","c":[[1,2,';
  const b = '3,"down",0]]}';
  sock.emit('data', clientFrame(0x1, a, false));   // FIN=0, TEXT
  sock.emit('data', clientFrame(0x0, b, true));    // FIN=1, CONT
  check('fragmented message', got, [a + b]);
}

// --- three-way fragmentation ------------------------------------------------
{
  const { sock, got } = harness();
  sock.emit('data', clientFrame(0x1, '{"t":', false));
  sock.emit('data', clientFrame(0x0, '"pi', false));
  sock.emit('data', clientFrame(0x0, 'ng"}', true));
  check('three-part message', got, ['{"t":"ping"}']);
}

// --- a ping interleaved between the pieces, which RFC 6455 allows -----------
{
  const { sock, ws, got } = harness();
  sock.emit('data', clientFrame(0x1, '{"a":', false));
  sock.emit('data', clientFrame(0x9, 'hi'));        // control frame in the middle
  sock.emit('data', clientFrame(0x0, '1}', true));
  check('control frame mid-message', got, ['{"a":1}']);
  check('and it was ponged', sock.written.length > 0 && (sock.written[0][0] & 0x0f) === 0xa, true);
  if (!ws.open) failures++;
}

// --- two messages in one chunk ----------------------------------------------
{
  const { sock, got } = harness();
  sock.emit('data', Buffer.concat([clientFrame(0x1, '{"n":1}'), clientFrame(0x1, '{"n":2}')]));
  check('two messages, one chunk', got, ['{"n":1}', '{"n":2}']);
}

// --- a close frame ends it --------------------------------------------------
{
  const { sock, ws } = harness();
  let closed = false;
  ws.on('close', () => { closed = true; });
  sock.emit('data', clientFrame(0x8, ''));
  check('close frame closes', closed, true);
}

// --- the server's own writes, at each length class --------------------------
{
  const { sock, ws } = harness();
  ws.send('hi');
  ws.send('z'.repeat(200));
  ws.send('z'.repeat(70000));
  const [a, b, c] = sock.written;
  check('server short header', [a[0], a[1]], [0x81, 2]);
  check('server 16-bit header', [b[0], b[1], b.readUInt16BE(2)], [0x81, 126, 200]);
  check('server 64-bit header', [c[0], c[1], Number(c.readBigUInt64BE(2))], [0x81, 127, 70000]);
  check('server frames are unmasked', (a[1] & 0x80) === 0, true);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall frame tests passed');
process.exit(failures ? 1 : 0);
