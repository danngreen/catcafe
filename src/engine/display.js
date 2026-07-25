// The screen: a small logical framebuffer scaled up so every pixel stays
// square and crisp. 480x270 gives us 30x17 tiles of view.
//
// On a phone the on-screen controls need room. In portrait they take a band
// along the bottom and the game sits above; in landscape they float over the
// game so the view keeps the whole height.

export const VIEW_W = 480;
export const VIEW_H = 270;

export function isTouchDevice() {
  return matchMedia('(hover: none)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
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
    // Orientation changes and the on-screen keyboard both fire late; re-measure.
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 80));
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.resize(), 60));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.resize());
    }
  }

  resize() {
    const body = document.body;
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;

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
    if (!this.touch && s >= 1) s = Math.floor(s);
    this.scale = s;
    this.canvas.style.width = `${Math.round(VIEW_W * s)}px`;
    this.canvas.style.height = `${Math.round(VIEW_H * s)}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  clear(color = '#000000') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
