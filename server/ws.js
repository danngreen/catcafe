// A minimal WebSocket server, no dependencies.
//
// We only ever send and receive small JSON text frames between machines on the
// same LAN, so this implements the useful subset of RFC 6455: the handshake,
// unmasking client frames, writing unmasked server frames, ping/pong and close.
// Fragmented and binary frames are not used by the protocol and are ignored.

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

    socket.on('data', (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      try {
        this.drain();
      } catch (err) {
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

      if (opcode === OP.TEXT) {
        this.emit('message', payload.toString('utf8'));
      } else if (opcode === OP.PING) {
        this.frame(OP.PONG, payload);
      } else if (opcode === OP.CLOSE) {
        this.close(1000, '');
        return;
      }
      // CONT / BINARY / PONG: nothing in this protocol produces them.
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
