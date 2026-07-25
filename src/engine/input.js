// Keyboard + on-screen touch input, exposed as a small pad abstraction.
// `held` is level-triggered (walking), `pressed` is edge-triggered (menus, talk).

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  Space: 'use', Enter: 'use', KeyE: 'use', KeyZ: 'use',
  Escape: 'menu', KeyX: 'cancel', Backspace: 'cancel', ShiftLeft: 'run', ShiftRight: 'run',
  KeyM: 'map', KeyI: 'inventory', KeyC: 'cafe', KeyT: 'shift', Tab: 'shift',
};

// Touch buttons report key names rather than codes.
const TOUCHMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  ' ': 'use', x: 'cancel', Escape: 'menu',
};

import { VIEW_W, VIEW_H } from './display.js';

const DIRS = new Set(['up', 'down', 'left', 'right']);
const DOUBLE_TAP_MS = 320;

export class Input {
  constructor() {
    this.held = new Set();
    // Running without a Shift key: a latching RUN toggle in the middle of the
    // d-pad, and double-tap-and-hold on any direction for a quick burst.
    this.runLatch = false;
    this.tapRun = false;
    this.lastTapBtn = null;
    this.lastTapAt = 0;
    // Taps on the canvas, in game pixels, so on-screen tabs and lists can be
    // touched directly. Without this, anything bound only to a key — build
    // mode's Tab, for one — is unreachable on a phone.
    this.tapped = null;
    this.tapStart = null;
    this.pressed = new Set();
    this.released = new Set();
    this.repeatTimers = new Map();
    this.anyKeyPressed = false;
    this._attach();
  }

  _attach() {
    window.addEventListener('keydown', (e) => {
      const b = KEYMAP[e.code];
      // Don't swallow devtools / reload shortcuts.
      if (b && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!this.held.has(b)) { this.pressed.add(b); this.repeatTimers.set(b, 0); }
        this.held.add(b);
      }
      this.anyKeyPressed = true;
    });

    window.addEventListener('keyup', (e) => {
      const b = KEYMAP[e.code];
      if (b) { this.held.delete(b); this.released.add(b); this.repeatTimers.delete(b); }
    });

    // Losing focus mid-walk would otherwise leave the player sliding forever.
    window.addEventListener('blur', () => {
      this.held.clear();
      this.repeatTimers.clear();
      this.tapRun = false;
    });

    const touch = document.getElementById('touch');
    if (touch) {
      // Display sets `has-touch` on the body once it knows; CSS does the rest.
      touch.hidden = false;
      for (const btn of touch.querySelectorAll('[data-key]')) {
        const b = TOUCHMAP[btn.dataset.key];
        if (!b) continue;
        const down = (e) => {
          e.preventDefault();
          if (DIRS.has(b)) {
            // Second tap of the same arrow, quickly: hold it to run.
            const now = performance.now();
            if (this.lastTapBtn === b && now - this.lastTapAt < DOUBLE_TAP_MS) this.tapRun = true;
            this.lastTapBtn = b;
            this.lastTapAt = now;
          }
          if (!this.held.has(b)) { this.pressed.add(b); this.repeatTimers.set(b, 0); }
          this.held.add(b);
          this.anyKeyPressed = true;
        };
        const up = (e) => {
          e.preventDefault();
          this.held.delete(b);
          this.repeatTimers.delete(b);
          // The burst lasts as long as you keep walking.
          if (DIRS.has(b) && ![...this.held].some((h) => DIRS.has(h))) this.tapRun = false;
        };
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('pointerleave', up);
      }

      for (const btn of touch.querySelectorAll('[data-toggle]')) {
        if (btn.dataset.toggle !== 'run') continue;
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.runLatch = !this.runLatch;
          btn.classList.toggle('on', this.runLatch);
          // Also emit a press, so build mode's Shift-to-cycle has a touch
          // equivalent — cycling furniture was keyboard-only otherwise.
          this.pressed.add('run');
          this.anyKeyPressed = true;
        });
      }
    }

    const canvas = document.getElementById('screen');
    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => {
        this.tapStart = this.canvasPoint(canvas, e);
        this.anyKeyPressed = true;
      });
      canvas.addEventListener('pointerup', (e) => {
        const p = this.canvasPoint(canvas, e);
        // Only count it as a tap if the finger stayed put; a drag isn't a press.
        if (this.tapStart && Math.hypot(p.x - this.tapStart.x, p.y - this.tapStart.y) < 10) {
          this.tapped = p;
        }
        this.tapStart = null;
      });
      canvas.addEventListener('pointercancel', () => { this.tapStart = null; });
    }
  }

  /** Run is held (Shift), latched (the toggle), or burst (double-tap). */
  isRunning() { return this.held.has('run') || this.runLatch || this.tapRun; }

  /** Convert a pointer event into framebuffer coordinates. */
  canvasPoint(canvas, e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return { x: -1, y: -1 };
    return {
      x: (e.clientX - r.left) * (VIEW_W / r.width),
      y: (e.clientY - r.top) * (VIEW_H / r.height),
    };
  }

  /** Did a tap land inside this rect (in game pixels) this frame? */
  tapIn(x, y, w, h) {
    const p = this.tapped;
    return !!p && p.x >= x && p.y >= y && p.x < x + w && p.y < y + h;
  }

  down(b) { return b === 'run' ? this.isRunning() : this.held.has(b); }
  hit(b) { return this.pressed.has(b); }

  /**
   * Edge trigger with key-repeat, for scrolling long menus.
   * Fires immediately, then every `rate` seconds after a `delay`.
   */
  repeat(b, dt, delay = 0.36, rate = 0.09) {
    if (!this.held.has(b)) return false;
    if (this.pressed.has(b)) return true;
    let t = (this.repeatTimers.get(b) || 0) + dt;
    if (t >= delay) {
      this.repeatTimers.set(b, delay - rate);
      return true;
    }
    this.repeatTimers.set(b, t);
    return false;
  }

  /** Current 8-way direction as a normalised-ish vector. */
  axis() {
    let x = 0, y = 0;
    if (this.held.has('left')) x -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('up')) y -= 1;
    if (this.held.has('down')) y += 1;
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.tapped = null;
    this.anyKeyPressed = false;
  }
}
