// Keyboard + on-screen touch input, exposed as a small pad abstraction.
// `held` is level-triggered (walking), `pressed` is edge-triggered (menus, talk).

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  Space: 'use', Enter: 'use', KeyE: 'use', KeyZ: 'use',
  Escape: 'menu', KeyX: 'cancel', Backspace: 'cancel', ShiftLeft: 'run', ShiftRight: 'run',
  KeyM: 'map', KeyI: 'inventory', KeyC: 'cafe', KeyT: 'shift',
  // Tab opens the menu as well as Escape. Fullscreen is the reason: the
  // browser takes Escape to mean "leave fullscreen", so the one key that
  // opened the menu was also the one key that closed the game down to a
  // window. Escape stays — it is what everybody's hands already do.
  Tab: 'menu',
  F3: 'perf',                          // the frame counter, as in every other game
};

// Touch buttons report key names rather than codes.
const TOUCHMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  ' ': 'use', x: 'cancel', Escape: 'menu',
};

import { VIEW_W, VIEW_H } from './display.js';

const DIRS = new Set(['up', 'down', 'left', 'right']);
const DOUBLE_TAP_MS = 320;

// ---------------------------------------------------------------------------
// Pointer events, on a tablet that has never heard of them.
//
// Pointer events arrived in Safari with iOS 13. Before that there are touches
// and there are mouse clicks, and a game that only listens for pointers hears
// nothing at all — which on an old iPad looks exactly like a title screen that
// will not go away. So every listener goes through here: where pointers exist
// nothing changes, and where they don't, touch and mouse are dressed up to
// look like them.
//
// Old iOS also fires a mouse click a moment after every touch, out of sympathy
// for pages written before touchscreens. Taking both would press each button
// twice, so a touch shuts the mouse out for the moment after it.

// `?nopointer` on the address bar takes the old path on a modern browser,
// which is the only way to try it without the iPad in your hands. The test
// harness sets the flag instead, having no address bar to type in.
function hasPointer() {
  return typeof window !== 'undefined' && 'PointerEvent' in window
    && !window.__noPointer && !location.search.includes('nopointer');
}

const FALLBACK = {
  pointerdown: ['touchstart', 'mousedown'],
  pointerup: ['touchend', 'mouseup'],
  pointermove: ['touchmove', 'mousemove'],
  pointercancel: ['touchcancel', null],
  pointerleave: [null, 'mouseleave'],
};

const MOUSE_AFTER_TOUCH_MS = 700;
let lastTouchAt = -Infinity;

/** A touch, or a click, wearing a pointer event's clothes. */
function shim(e, touch) {
  const src = touch || e;
  return {
    clientX: src.clientX,
    clientY: src.clientY,
    target: src.target || e.target,
    // A mouse is one pointer and always the same one; fingers come numbered.
    pointerId: touch ? touch.identifier : -1,
    preventDefault: () => e.preventDefault(),
  };
}

/**
 * Listen for one pointer event. Returns the function that stops listening —
 * the wrappers below are not the handler that was passed in, so
 * removeEventListener on its own would not find them.
 */
export function onPointer(el, type, fn) {
  if (hasPointer()) {
    el.addEventListener(type, fn);
    return () => el.removeEventListener(type, fn);
  }
  const [touchName, mouseName] = FALLBACK[type];
  const off = [];
  if (touchName) {
    const onTouch = (e) => {
      lastTouchAt = performance.now();
      const touches = e.changedTouches;
      for (let i = 0; i < touches.length; i++) fn(shim(e, touches[i]));
    };
    // Not passive: the d-pad has to be able to say "this is not a scroll".
    el.addEventListener(touchName, onTouch, { passive: false });
    off.push(() => el.removeEventListener(touchName, onTouch));
  }
  if (mouseName) {
    const onMouse = (e) => {
      if (performance.now() - lastTouchAt < MOUSE_AFTER_TOUCH_MS) return;
      fn(shim(e, null));
    };
    el.addEventListener(mouseName, onMouse);
    off.push(() => el.removeEventListener(mouseName, onMouse));
  }
  return () => { for (const f of off) f(); };
}

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
      this.wireDpad(touch);

      for (const btn of touch.querySelectorAll('[data-key]')) {
        const b = TOUCHMAP[btn.dataset.key];
        if (!b) continue;
        // The arrows are not four buttons any more — see wireDpad.
        if (DIRS.has(b)) continue;
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
        onPointer(btn, 'pointerdown', down);
        onPointer(btn, 'pointerup', up);
        onPointer(btn, 'pointercancel', up);
        onPointer(btn, 'pointerleave', up);
      }

      for (const btn of touch.querySelectorAll('[data-toggle]')) {
        if (btn.dataset.toggle !== 'run') continue;
        onPointer(btn, 'pointerdown', (e) => {
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
      onPointer(canvas, 'pointerdown', (e) => {
        this.tapStart = this.canvasPoint(canvas, e);
        this.anyKeyPressed = true;
      });
      onPointer(canvas, 'pointerup', (e) => {
        const p = this.canvasPoint(canvas, e);
        // Only count it as a tap if the finger stayed put; a drag isn't a press.
        if (this.tapStart && Math.hypot(p.x - this.tapStart.x, p.y - this.tapStart.y) < 10) {
          this.tapped = p;
        }
        this.tapStart = null;
      });
      onPointer(canvas, 'pointercancel', () => { this.tapStart = null; });
    }
  }

  /** Run is held (Shift), latched (the toggle), or burst (double-tap). */
  /**
   * The d-pad, as one surface rather than four buttons.
   *
   * Four buttons means changing direction is: lift, aim, press. On a phone,
   * held in one hand, with a thumb that cannot see what it is doing, aiming is
   * the whole problem — you have to look down at the pad every time you want
   * to turn a corner.
   *
   * So the pad takes the pointer and keeps it. Wherever the thumb slides, the
   * direction follows: out of the middle and up is up, and drifting between up
   * and left is both, which is the diagonal a keyboard gets by holding two
   * keys. The thumb never has to leave the glass.
   */
  wireDpad(touch) {
    const pad = touch.querySelector('.dpad');
    if (!pad) return;
    const arrows = ['up', 'down', 'left', 'right']
      .map((d) => [d, pad.querySelector(`.tb.${d}`)])
      .filter(([, el]) => el);

    let active = null;                    // the pointer id doing the walking

    /**
     * Which way the thumb is asking to go.
     *
     * By angle from the middle of the pad rather than by which button is under
     * it: a thumb between two arrows means both, and one that has slid off the
     * pad entirely still means whatever direction it slid towards. The dead
     * middle is where the RUN button sits, and means stop.
     */
    const dirsFor = (e) => {
      const r = pad.getBoundingClientRect();
      // A synthetic press with no coordinates — the test harness taps buttons
      // this way — means exactly the button it was aimed at.
      if (!e.clientX && !e.clientY) {
        const hit = arrows.find(([, el]) => el === e.target || el.contains(e.target));
        return hit ? [hit[0]] : [];
      }
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.17) return [];        // the RUN circle
      const out = [];
      // Generous straight zones with diagonals in the corners: a thumb aiming
      // for "up" should not get "up and slightly left" for being a few degrees
      // off, but one genuinely in the corner should get both.
      if (Math.abs(dx) > Math.abs(dy) * 0.42) out.push(dx > 0 ? 'right' : 'left');
      if (Math.abs(dy) > Math.abs(dx) * 0.42) out.push(dy > 0 ? 'down' : 'up');
      return out;
    };

    /** Hold exactly these, and let go of the rest. */
    const setDirs = (want) => {
      for (const [d, el] of arrows) {
        const on = want.includes(d);
        if (on && !this.held.has(d)) { this.pressed.add(d); this.repeatTimers.set(d, 0); }
        if (!on) this.repeatTimers.delete(d);
        if (on) this.held.add(d); else this.held.delete(d);
        // The pressed look has to follow the thumb too: the browser only knows
        // about the element the press landed on.
        el.classList.toggle('on', on);
      }
      if (!want.length) this.tapRun = false;
      if (want.length) this.anyKeyPressed = true;
    };

    onPointer(pad, 'pointerdown', (e) => {
      // The RUN button in the middle is its own thing and keeps its own handler.
      if (e.target.closest && e.target.closest('.tb.run')) return;
      e.preventDefault();
      active = e.pointerId;
      try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      const want = dirsFor(e);
      // Two quick presses the same way still means run, as they always have.
      const first = want[0];
      if (first) {
        const now = performance.now();
        if (this.lastTapBtn === first && now - this.lastTapAt < DOUBLE_TAP_MS) this.tapRun = true;
        this.lastTapBtn = first;
        this.lastTapAt = now;
      }
      setDirs(want);
    });



    onPointer(pad, 'pointermove', (e) => {
      if (active !== e.pointerId) return;
      e.preventDefault();
      setDirs(dirsFor(e));
    });

    const release = (e) => {
      if (active !== e.pointerId) return;
      active = null;
      try { pad.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
      setDirs([]);
    };
    onPointer(pad, 'pointerup', release);
    onPointer(pad, 'pointercancel', release);
  }

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
