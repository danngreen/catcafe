// The shared session. Phase 1 of multiplayer: the server owns the world seed
// and the roster, and relays where everybody is. Money, pantry, cats and quests
// are still per-client — those move here in phase 2.

const TICK_HZ = 15;
const IDLE_TIMEOUT_MS = 30_000;

export class Room {
  constructor(seed) {
    this.seed = seed;
    this.players = new Map();     // socket id -> player
    this.nextNumber = 1;
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
    this.timer.unref?.();
  }

  /** Public view of a player, as sent to clients. */
  static describe(p) {
    return { id: p.id, n: p.name, look: p.look, x: p.x, y: p.y, dir: p.dir, map: p.map };
  }

  attach(ws) {
    const player = {
      id: ws.id,
      number: this.nextNumber++,
      name: null,                 // set by the join message
      look: null,
      x: 0, y: 0, dir: 'down', frame: 0, map: 'overworld',
      joined: false,
      lastSeen: Date.now(),
      ws,
    };
    this.players.set(ws.id, player);

    ws.on('message', (text) => {
      player.lastSeen = Date.now();
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      this.handle(player, msg);
    });

    ws.on('close', () => {
      this.players.delete(ws.id);
      if (player.joined) {
        this.broadcast({ t: 'left', id: player.id });
        console.log(`[room] ${player.name || player.id} left (${this.count} playing)`);
      }
    });

    // Everything the client needs before it can build the world.
    ws.sendJSON({
      t: 'welcome',
      id: player.id,
      seed: this.seed,
      players: this.roster(),
    });
  }

  handle(player, msg) {
    switch (msg.t) {
      case 'join': {
        player.name = String(msg.name || `Player ${player.number}`).slice(0, 16);
        player.look = msg.look || null;
        player.x = Number(msg.x) || 0;
        player.y = Number(msg.y) || 0;
        player.map = String(msg.map || 'overworld');
        player.joined = true;
        this.broadcast({ t: 'joined', p: Room.describe(player) }, player.id);
        // Late joiners need the roster as it stands now, not as it was at connect.
        player.ws.sendJSON({ t: 'roster', players: this.roster(player.id) });
        console.log(`[room] ${player.name} joined (${this.count} playing)`);
        break;
      }
      case 'move': {
        player.x = Number(msg.x) || 0;
        player.y = Number(msg.y) || 0;
        player.dir = msg.dir || 'down';
        player.frame = msg.frame | 0;
        player.map = String(msg.map || 'overworld');
        break;
      }
      case 'ping':
        player.ws.sendJSON({ t: 'pong', at: msg.at });
        break;
      default:
        break;
    }
  }

  get count() { return [...this.players.values()].filter((p) => p.joined).length; }

  roster(exceptId) {
    return [...this.players.values()]
      .filter((p) => p.joined && p.id !== exceptId)
      .map(Room.describe);
  }

  broadcast(obj, exceptId) {
    const text = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.id === exceptId) continue;
      p.ws.send(text);
    }
  }

  /** Positions go out as compact tuples; at 15Hz for 8 players it's nothing. */
  tick() {
    const now = Date.now();
    for (const p of [...this.players.values()]) {
      if (now - p.lastSeen > IDLE_TIMEOUT_MS) p.ws.close(1001, 'idle');
    }
    const joined = [...this.players.values()].filter((p) => p.joined);
    if (joined.length < 2) return;        // nobody to tell
    const pos = joined.map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.dir, p.frame, p.map]);
    const text = JSON.stringify({ t: 'pos', p: pos });
    for (const p of joined) p.ws.send(text);
  }
}
