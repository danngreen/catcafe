// The screen: a small logical framebuffer scaled up by an integer factor so
// every pixel stays square and crisp. 480x270 gives us 30x17 tiles of view.

export const VIEW_W = 480;
export const VIEW_H = 270;

export class Display {
  constructor(canvasId = 'screen') {
    this.canvas = document.getElementById(canvasId);
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.scale = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Some browsers fire resize before layout settles on orientation change.
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 60));
  }

  resize() {
    const pad = 8;
    const availW = window.innerWidth - pad * 2;
    const availH = window.innerHeight - pad * 2;
    // Integer scaling keeps pixels sharp; fall back to fractional on tiny screens.
    let s = Math.min(availW / VIEW_W, availH / VIEW_H);
    s = s >= 1 ? Math.floor(s) : s;
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
