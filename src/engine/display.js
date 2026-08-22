// The screen: a small logical framebuffer scaled up so every pixel stays
// square and crisp. 480x270 gives us 30x17 tiles of view.
//
// On a phone the on-screen controls need room. In portrait they take a band
// along the bottom and the game sits above; in landscape they float over the
// game so the view keeps the whole height.

import { SAFE } from './safe.js';

export const VIEW_W = 480;
export const VIEW_H = 270;

export function isTouchDevice() {
  // Order matters: the checks that work on old iOS (pre-13) come first, since
  // `(hover)`, `(pointer)`, visualViewport and a non-zero maxTouchPoints all
  // arrived in iOS 13. An old iPad that fails every modern check must still be
  // recognised as touch, or it gets the desktop layout with no input surface.
  return ('ontouchstart' in window)
    || navigator.maxTouchPoints > 0
    || (navigator.msMaxTouchPoints || 0) > 0
    || /iPad|iPhone|iPod/.test(navigator.platform)
    || (navigator.userAgent.includes('Mac') && 'ontouchend' in document) // iPadOS 13+
    || (typeof matchMedia === 'function'
        && (matchMedia('(hover: none)').matches || matchMedia('(pointer: coarse)').matches));
}

/** True when the browser can actually take us fullscreen (not iPhone Safari). */
export function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/** Already installed to the home screen? Then we're fullscreen by definition. */
export function isStandalone() {
  return !!(window.navigator.standalone || matchMedia('(display-mode: fullscreen)').matches
    || matchMedia('(display-mode: standalone)').matches);
}

export function toggleFullscreen() {
  const el = document.documentElement;
  if (isFullscreen()) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    return true;
  }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return false;
  try {
    const r = req.call(el, { navigationUI: 'hide' });
    if (r && r.catch) r.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export class Display {
  constructor(canvasId = 'screen') {
    this.canvas = document.getElementById(canvasId);
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.scale = 1;
    this.touch = isTouchDevice();
    if (this.touch) document.body.classList.add('has-touch');

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('load', () => this.resize());
    // A home-screen app on old iOS is measured before the window has settled
    // and then never fires `resize` to say so, which leaves the picture stuck
    // at whatever size it guessed in the first frame. Ask again shortly after
    // launch, and go on asking cheaply from the game loop — see recheck().
    for (const ms of [120, 400, 1200, 3000]) setTimeout(() => this.resize(), ms);
    window.addEventListener('pageshow', () => this.resize());
    // Orientation changes and the on-screen keyboard both fire late; re-measure.
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 80));
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.resize(), 60));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.resize());
    }
  }

  /**
   * Has the window changed size without telling us?
   *
   * Called every frame and costs two property reads and a comparison. It
   * exists because the one thing an eleven year old iPad reliably does is
   * report a size, never fire an event, and leave the game in a small box for
   * the rest of the session.
   */
  recheck() {
    const vw = this.viewportW();
    const vh = this.viewportH();
    if (vw === this._lastW && vh === this._lastH) return;
    this.resize();
  }

  viewportW() {
    return (window.visualViewport && window.visualViewport.width)
      || document.documentElement.clientWidth || window.innerWidth;
  }

  viewportH() {
    return (window.visualViewport && window.visualViewport.height)
      || document.documentElement.clientHeight || window.innerHeight;
  }

  resize() {
    const body = document.body;
    // Old iOS (pre-13) has no visualViewport, and in a standalone PWA there its
    // window.innerWidth/Height report the layout viewport at the wrong scale —
    // which is what pinned the canvas to a quarter of the screen. The root
    // element's clientWidth/Height track the real layout box far better there.
    const vw = this.viewportW();
    const vh = this.viewportH();
    this._lastW = vw;
    this._lastH = vh;

    // Decide where the controls live before measuring what's left for the game.
    if (this.touch) {
      const portrait = vh >= vw;
      body.classList.toggle('controls-band', portrait);
      body.classList.toggle('controls-overlay', !portrait);
    }

    const touchEl = document.getElementById('touch');
    const band = this.touch && body.classList.contains('controls-band') && touchEl
      ? touchEl.offsetHeight : 0;
    // The frame stops where the control band starts, so the game centres in
    // what's left rather than clinging to the top of the screen.
    document.documentElement.style.setProperty('--band', `${band}px`);

    const pad = this.touch ? 4 : 8;
    const availW = vw - pad * 2;
    const availH = vh - band - pad * 2;

    let s = Math.min(availW / VIEW_W, availH / VIEW_H);
    // Desktop rounds down to a whole number so pixels stay perfectly square.
    // A phone does not: rounding 1.41 down to 1 throws away 40% of the screen,
    // and `image-rendering: pixelated` keeps a fractional scale chunky anyway.
    //
    // The one place rounding down is indefensible is when it lands on 1: a
    // window that could show the game at 1.6 shows it at 480x270 instead, an
    // eighth of the area, which is what an old iPad looks like the moment the
    // touch check gets it wrong. Above 2 the loss is a few per cent and square
    // pixels are worth it; at 1 it is most of the picture and they are not.
    if (!this.touch && s >= 1) s = Math.floor(s) === 1 && s >= 1.35 ? s : Math.floor(s);
    this.scale = s;
    this.canvas.style.width = `${Math.round(VIEW_W * s)}px`;
    this.canvas.style.height = `${Math.round(VIEW_H * s)}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.measureSafeArea();

    // Kept so the diagnostic can show its working. Every one of these is a
    // number some browser somewhere gets wrong, and knowing which is the whole
    // difference between fixing this and guessing again.
    this.info = {
      vw, vh, band, scale: s, touch: this.touch,
      css: `${Math.round(VIEW_W * s)}x${Math.round(VIEW_H * s)}`,
      visual: window.visualViewport ? `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)}` : 'none',
      client: `${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
      inner: `${window.innerWidth}x${window.innerHeight}`,
      screen: `${window.screen ? window.screen.width : '?'}x${window.screen ? window.screen.height : '?'}`,
      dpr: window.devicePixelRatio || 1,
      standalone: !!(window.navigator.standalone || (window.matchMedia
        && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches)),
      band0: band === 0,
    };
  }

  /**
   * Work out how far the floating controls reach into the canvas, in game
   * pixels, by comparing their on-screen boxes with the canvas box. Only the
   * horizontal reach matters: the pads sit in the bottom corners, so insetting
   * the sides is enough and looks far better than lifting everything.
   */
  measureSafeArea() {
    if (!document.body.classList.contains('controls-overlay')) {
      SAFE.left = SAFE.right = SAFE.bottom = 0;
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    const s = this.scale || 1;
    const box = (sel) => {
      const el = document.querySelector(sel);
      return el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
    };
    const cap = VIEW_W * 0.34;
    const pad = box('.dpad');
    const act = box('.abtns');
    SAFE.left = pad ? Math.max(0, Math.min(cap, (pad.right - r.left) / s + 4)) : 0;
    SAFE.right = act ? Math.max(0, Math.min(cap, (r.right - act.left) / s + 4)) : 0;
    SAFE.bottom = 0;
  }

  clear(color = '#000000') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

/**
 * Everything the browser claims about the window, as text.
 *
 * Written for one situation: somebody on a device you cannot borrow says the
 * picture is too small. Every line here is a number that some browser
 * somewhere reports wrongly, and reading them off the device is the difference
 * between fixing it and guessing at it twice.
 */
export function displayReport(display) {
  const i = display.info || {};
  const lines = [
    'Cat Cafe — display',
    '',
    `picture     ${i.css}  (scale ${(i.scale || 0).toFixed(2)})`,
    `used        ${i.vw} x ${i.vh}${i.band ? `  minus ${i.band} of controls` : ''}`,
    '',
    'the browser says:',
    `  visualViewport  ${i.visual}`,
    `  documentElement ${i.client}`,
    `  window.inner    ${i.inner}`,
    `  screen          ${i.screen}`,
    `  pixel ratio     ${i.dpr}`,
    '',
    `touch       ${i.touch ? 'yes' : 'no'}`,
    `home screen ${i.standalone ? 'yes' : 'no'}`,
    `orientation ${window.orientation === undefined ? 'unknown' : window.orientation}`,
    '',
    navigator.userAgent,
  ];
  return lines.join('\n');
}

/**
 * Show it, or hide it. Returns whether it ended up shown.
 *
 * The version line is added afterwards because it has to be fetched. It
 * answers the question that comes before every other one here — is this
 * device running the code we think it is — which otherwise takes a phone call
 * and a lot of guessing. `.deployed` is written by deploy/push.sh and is not
 * there when the game is served from a working tree, hence the quiet failure.
 */
export function showDisplayReport(display, on) {
  const box = document.getElementById('diag');
  const text = document.getElementById('diagtext');
  if (!box || !text) return false;
  const show = on === undefined ? box.hidden : on;
  if (show) {
    text.textContent = displayReport(display);
    fetch('.deployed', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => {
        if (t && !box.hidden) text.textContent += `\n\nrunning     ${t.trim().split('\n')[0]}`;
      })
      .catch(() => {});
  }
  box.hidden = !show;
  return show;
}
