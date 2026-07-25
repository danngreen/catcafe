// A minimal WebSocket server, no dependencies.
//
// We only ever exchange JSON text frames between machines on the same LAN, so
// this implements the useful subset of RFC 6455: the handshake, unmasking
// client frames, writing unmasked server frames, ping/pong, close — and
// reassembly of fragmented messages.
//
// That last one is not optional, however small the messages look. Whether a
// browser splits a message across frames is its own business and depends on
// size, timing and the socket underneath; a client that fragments would have
// had every long message silently dropped here, which is invisible on loopback
// and intermittent over real wifi.

import { createHash, randomUUID } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

export class WSSocket {
  constructor(socket) {
    this.id = randomUUID().slice(0, 8);
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.open = true;
    this.handlers = { message: [], close: [] };
    this.data = {};                       // room state hangs off here
    this.fragOp = 0;                      // opcode of the message being assembled
    this.frag = [];                       // its pieces so far
    // Last time anything at all arrived — a message, a pong, a stray ping.
    // Liveness is a property of the socket, not of whether the game upstairs
    // happens to be sending anything.
    this.lastActivity = Date.now();

    socket.on('data', (chunk) => {
      this.lastActivity = Date.now();
      this.buf = Buffer.concat([this.buf, chunk]);
      try {
        this.drain();
      } catch (err) {
        // Say so out loud. A silent hang-up here looks, from the game, exactly
        // like the other player wandering off and freezing.
        console.warn(`[ws] dropped ${this.id}: ${err.message}`);
        this.close(1002, 'bad frame');
      }
    });
    socket.on('error', () => this.fail());
    socket.on('close', () => this.fail());
    socket.setNoDelay(true);              // latency matters more than packing
  }

  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
  emit(evt, ...args) { for (const fn of this.handlers[evt] || []) fn(...args); }

  /** Pull every complete frame out of the buffer. */
  drain() {
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;

      if (len === 126) {
        if (this.buf.length < off + 2) return;
        len = this.buf.readUInt16BE(off); off += 2;
      } else if (len === 127) {
        if (this.buf.length < off + 8) return;
        len = Number(this.buf.readBigUInt64BE(off)); off += 8;
      }
      let mask = null;
      if (masked) {
        if (this.buf.length < off + 4) return;
        mask = this.buf.subarray(off, off + 4); off += 4;
      }
      if (this.buf.length < off + len) return;

      const payload = Buffer.from(this.buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + len);

      // Control frames are never fragmented and may arrive between the pieces
      // of a message, so deal with them before touching the assembly buffer.
      if (opcode === OP.PING) { this.frame(OP.PONG, payload); continue; }
      if (opcode === OP.PONG) continue;
      if (opcode === OP.CLOSE) { this.close(1000, ''); return; }

      if (opcode === OP.CONT) {
        if (!this.fragOp) continue;             // a continuation of nothing
        this.frag.push(payload);
      } else {
        this.fragOp = opcode;
        this.frag = [payload];
      }
      if (!fin) continue;                       // more pieces to come

      const whole = this.frag.length === 1 ? this.frag[0] : Buffer.concat(this.frag);
      const op = this.fragOp;
      this.fragOp = 0;
      this.frag = [];
      if (op === OP.TEXT) this.emit('message', whole.toString('utf8'));
      // BINARY: nothing in this protocol produces it.
    }
  }

  frame(opcode, payload) {
    if (!this.open) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode; header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode; header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch {
      this.fail();
    }
  }

  send(text) { this.frame(OP.TEXT, Buffer.from(text, 'utf8')); }
  sendJSON(obj) { this.send(JSON.stringify(obj)); }

  /**
   * A protocol-level ping. Every browser answers these itself, down in its
   * networking code — no page script, no timers, nothing that a busy main
   * thread, a throttled background tab or a wedged frame loop can stop. That
   * makes it a far better test of "is anyone there" than asking the game to
   * send something.
   */
  ping() { this.frame(OP.PING, Buffer.alloc(0)); }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    this.frame(OP.CLOSE, body);
    this.open = false;
    try { this.socket.end(); } catch { /* already gone */ }
    this.emit('close');
  }

  fail() {
    if (!this.open) return;
    this.open = false;
    try { this.socket.destroy(); } catch { /* already gone */ }
    this.emit('close');
  }
}

/**
 * Complete the HTTP upgrade and hand back a live socket, or null if the
 * request wasn't a valid WebSocket handshake.
 */
export function upgrade(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.destroy();
    return null;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n'
    + 'Upgrade: websocket\r\n'
    + 'Connection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  const ws = new WSSocket(socket);
  if (head && head.length) { ws.buf = Buffer.concat([ws.buf, head]); ws.drain(); }
  return ws;
}
