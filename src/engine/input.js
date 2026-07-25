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
const TOUCHMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'use', Escape: 'menu' };

export class Input {
  constructor() {
    this.held = new Set();
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
    window.addEventListener('blur', () => { this.held.clear(); this.repeatTimers.clear(); });

    const touch = document.getElementById('touch');
    if (touch) {
      const isTouch = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
      if (isTouch) touch.hidden = false;
      for (const btn of touch.querySelectorAll('[data-key]')) {
        const b = TOUCHMAP[btn.dataset.key];
        if (!b) continue;
        const down = (e) => {
          e.preventDefault();
          if (!this.held.has(b)) { this.pressed.add(b); this.repeatTimers.set(b, 0); }
          this.held.add(b);
          this.anyKeyPressed = true;
        };
        const up = (e) => { e.preventDefault(); this.held.delete(b); this.repeatTimers.delete(b); };
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('pointerleave', up);
      }
    }
  }

  down(b) { return this.held.has(b); }
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
    this.anyKeyPressed = false;
  }
}
