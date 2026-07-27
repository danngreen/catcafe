// What the sky is doing, and what that does to everyone else.
//
// Weather is not stored and never sent over the wire. It is a pure function of
// the world seed and the day number, which means every player in a shared
// valley is standing in the same rain without a single byte crossing the
// network — and the forecast for tomorrow is already knowable, which is what
// makes stocking for it a decision rather than a guess.
//
// One kind of weather per day. It eases in over the first minute after
// midnight so the sky doesn't snap between states while you're looking at it.

import { clamp } from '../engine/util.js';

/**
 * `crowd` multiplies how many people come out. `warmth` is what a fireplace
 * is worth against it — 0 for weather nobody minds. `drink` nudges what people
 * feel like ordering, by item tag: cold drinks on a hot day, hot ones when it
 * snows. `dim` is how much light the cloud takes out of the day.
 */
export const WEATHER = {
  sunny: {
    id: 'sunny', name: 'Sunny', blurb: 'Not a cloud. Everyone is out.',
    crowd: 1.28, warmth: 0, dim: 0, cold: -0.35,
    drink: { cold: 2.4, hot: 0.28 },
  },
  cloudy: {
    id: 'cloudy', name: 'Cloudy', blurb: 'Flat grey. Perfectly ordinary.',
    crowd: 1.0, warmth: 0, dim: 0.1, cold: 0,
    drink: {},
  },
  windy: {
    id: 'windy', name: 'Windy', blurb: 'Hold onto the menu board.',
    crowd: 0.88, warmth: 0.35, dim: 0.06, cold: 0.25,
    drink: { hot: 1.3, cold: 0.75 },
  },
  fog: {
    id: 'fog', name: 'Foggy', blurb: 'The valley has gone missing.',
    crowd: 0.74, warmth: 0.5, dim: 0.2, cold: 0.3,
    drink: { hot: 1.5, cold: 0.6 },
  },
  rain: {
    id: 'rain', name: 'Rainy', blurb: 'Steady, soaking, and in for the day.',
    crowd: 0.52, warmth: 1, dim: 0.26, cold: 0.5,
    drink: { hot: 1.9, cold: 0.4 },
  },
  snow: {
    id: 'snow', name: 'Snowy', blurb: 'Thick and silent. Hardly anyone about.',
    crowd: 0.42, warmth: 1.25, dim: 0.16, cold: 1,
    drink: { hot: 2.6, cold: 0.22 },
  },
};

export const WEATHER_LIST = Object.values(WEATHER);

// What each season is likely to throw at you. Snow is winter's alone, and
// summer gets the run of clear days that makes lemonade worth stocking.
const SEASON_ODDS = {
  Spring: { sunny: 3, cloudy: 3, windy: 2, fog: 1.2, rain: 3, snow: 0 },
  Summer: { sunny: 6, cloudy: 2.4, windy: 1.4, fog: 0.6, rain: 1.6, snow: 0 },
  Autumn: { sunny: 2, cloudy: 3.4, windy: 3, fog: 2.2, rain: 3.4, snow: 0 },
  Winter: { sunny: 1.6, cloudy: 3, windy: 2.4, fog: 1.8, rain: 2.4, snow: 3.4 },
};

/** How long after midnight the new sky takes to arrive, in seconds. */
const TURN_SECONDS = 60;

/** Deterministic hash of two integers — the whole sync story, such as it is. */
function hash2(a, b) {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/**
 * The weather on one day. Yesterday counts for something: a run of rain is
 * more valley-like than a sky that reshuffles itself every morning, so the
 * previous day's weather gets a thumb on the scale.
 */
export function weatherOn(seed, day) {
  const season = ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(day / 28) % 4];
  const odds = { ...SEASON_ODDS[season] };
  if (day > 0) {
    const prev = pickRaw(seed, day - 1, season);
    odds[prev] = (odds[prev] || 0) * 2.1;
  }
  return WEATHER[weighted(odds, hash2(seed, day))];
}

/** The same pick without the persistence term, to break the recursion. */
function pickRaw(seed, day, season) {
  const at = ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(day / 28) % 4];
  return weighted(SEASON_ODDS[at] || SEASON_ODDS[season], hash2(seed, day));
}

function weighted(odds, r) {
  const keys = Object.keys(odds);
  let total = 0;
  for (const k of keys) total += odds[k];
  let acc = r * total;
  for (const k of keys) { acc -= odds[k]; if (acc <= 0) return k; }
  return 'cloudy';
}

/**
 * The sky right now: today's weather, yesterday's, and how far through the
 * changeover we are. Everything that reads the weather goes through here so
 * that midnight is a fade rather than a jump.
 */
export function weatherNow(seed, clock) {
  const today = weatherOn(seed, clock.day);
  if (clock.t >= TURN_SECONDS || clock.day === 0) {
    return { now: today, from: today, blend: 1, today };
  }
  return {
    now: today,
    from: weatherOn(seed, clock.day - 1),
    blend: clamp(clock.t / TURN_SECONDS, 0, 1),
    today,
  };
}

/** Blend one numeric property across the changeover. */
export function mix(sky, key) {
  const a = sky.from[key] ?? 0, b = sky.now[key] ?? 0;
  return a + (b - a) * sky.blend;
}

/** Tomorrow, for the shop screen — the whole point of a forecast. */
export function forecast(seed, clock, days = 2) {
  const out = [];
  for (let i = 1; i <= days; i++) out.push(weatherOn(seed, clock.day + i));
  return out;
}

/**
 * Ambience levels the sky wants layered over whatever the ground is doing.
 * Rain is loud enough indoors to be worth hearing through the window.
 */
export function weatherAmbience(sky, indoor) {
  const w = sky.now;
  const out = {};
  const muffle = indoor ? 0.4 : 1;
  if (w.id === 'rain') out.rain = 0.75 * muffle;
  if (w.id === 'snow') out.wind = 0.3 * muffle;
  if (w.id === 'windy') out.wind = 0.72 * muffle;
  if (w.id === 'fog') out.wind = 0.16 * muffle;
  return out;
}

/**
 * How dark and what colour the weather makes the daylight, on top of the hour.
 * Fog goes pale rather than dark; rain and cloud go blue-grey.
 */
export function weatherLight(sky) {
  const dim = mix(sky, 'dim');
  const w = sky.now;
  const tint = w.id === 'fog' ? '#b6bfd0'
    : w.id === 'snow' ? '#9fb0d0'
      : '#2f3550';
  return { dim, tint };
}

// ---------------------------------------------------------------------------
// The sky, drawn
// ---------------------------------------------------------------------------

/**
 * Particles live in screen space, not world space. Rain falling past the
 * camera does not need to know where it is in the valley, and keeping it on
 * screen means the count is bounded by the window rather than the map.
 */
export class WeatherFx {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.drops = [];
    this.flakes = [];
    this.leaves = [];
    this.fogBanks = [];
    this.t = 0;
    this.seedT = 1234.5;
    for (let i = 0; i < 5; i++) {
      this.fogBanks.push({
        x: this.rand() * w, y: h * (0.25 + this.rand() * 0.7),
        w: 120 + this.rand() * 220, h: 18 + this.rand() * 34,
        v: 5 + this.rand() * 12,
      });
    }
  }

  /** A cheap deterministic-ish stream; particles need no reproducibility. */
  rand() {
    this.seedT = (this.seedT * 16807) % 2147483647;
    return this.seedT / 2147483647;
  }

  update(dt, sky, indoor) {
    this.t += dt;
    const id = sky.now.id;
    const strength = indoor ? 0 : sky.blend;
    const prev = indoor ? 0 : 1 - sky.blend;

    this.step(dt, id === 'rain' ? strength : 0, sky.from.id === 'rain' ? prev : 0, 'rain');
    this.step(dt, id === 'snow' ? strength : 0, sky.from.id === 'snow' ? prev : 0, 'snow');
    this.step(dt, id === 'windy' ? strength : 0, sky.from.id === 'windy' ? prev : 0, 'wind');
    for (const b of this.fogBanks) {
      b.x += b.v * dt;
      if (b.x - b.w > this.w) { b.x = -b.w; b.y = this.h * (0.25 + this.rand() * 0.7); }
    }
  }

  step(dt, a, b, kind) {
    const amount = Math.max(a, b);
    if (kind === 'rain') {
      const want = Math.round(150 * amount);
      while (this.drops.length < want) {
        this.drops.push({
          x: this.rand() * (this.w + 90) - 60, y: this.rand() * this.h,
          v: 300 + this.rand() * 220, len: 7 + this.rand() * 9,
          a: 0.2 + this.rand() * 0.32,
        });
      }
      if (this.drops.length > want) this.drops.length = want;
      for (const d of this.drops) {
        d.y += d.v * dt;
        d.x += d.v * 0.22 * dt;
        if (d.y > this.h) { d.y = -10; d.x = this.rand() * (this.w + 90) - 60; }
      }
    } else if (kind === 'snow') {
      const want = Math.round(90 * amount);
      while (this.flakes.length < want) {
        this.flakes.push({
          x: this.rand() * this.w, y: this.rand() * this.h,
          v: 16 + this.rand() * 26, r: this.rand() < 0.3 ? 2 : 1,
          phase: this.rand() * 6.28, sway: 6 + this.rand() * 14,
        });
      }
      if (this.flakes.length > want) this.flakes.length = want;
      for (const f of this.flakes) {
        f.y += f.v * dt;
        f.x += Math.sin(this.t * 0.8 + f.phase) * f.sway * dt;
        if (f.y > this.h) { f.y = -4; f.x = this.rand() * this.w; }
        if (f.x < -6) f.x = this.w + 4;
        if (f.x > this.w + 6) f.x = -4;
      }
    } else {
      const want = Math.round(14 * amount);
      while (this.leaves.length < want) {
        this.leaves.push({
          x: -20 - this.rand() * 200, y: this.rand() * this.h,
          v: 70 + this.rand() * 90, phase: this.rand() * 6.28,
          spin: 2 + this.rand() * 5, hue: this.rand(),
        });
      }
      if (this.leaves.length > want) this.leaves.length = want;
      for (const l of this.leaves) {
        l.x += l.v * dt;
        l.y += Math.sin(this.t * 1.6 + l.phase) * 22 * dt;
        l.phase += l.spin * dt;
        if (l.x > this.w + 20) { l.x = -20; l.y = this.rand() * this.h; }
      }
    }
  }

  /**
   * Everything the sky adds, over the top of the finished frame. Drawn after
   * the night tint so that rain in the dark is lit by the lamps below it.
   */
  draw(ctx, sky, indoor) {
    if (indoor) return;
    const id = sky.now.id, fromId = sky.from.id;
    const at = (want) => (id === want ? sky.blend : 0) + (fromId === want ? 1 - sky.blend : 0);

    const sun = at('sunny');
    if (sun > 0.01) {
      // A wash of warm light, brightest at the top of the screen.
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, `rgba(255,226,150,${0.16 * sun})`);
      g.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    const cloud = at('cloudy') + at('rain') * 0.6;
    if (cloud > 0.01) {
      // Slow shadows crossing the ground, which is what "cloudy" looks like
      // from underneath when nothing else is happening.
      ctx.save();
      ctx.globalAlpha = 0.1 * Math.min(1, cloud);
      ctx.fillStyle = '#2a3050';
      for (let i = 0; i < 3; i++) {
        const cx = ((this.t * (9 + i * 4) + i * 260) % (this.w + 460)) - 230;
        ctx.beginPath();
        ctx.ellipse(cx, this.h * (0.2 + i * 0.3), 190, 62, 0, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    }

    const fog = at('fog');
    if (fog > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(206,214,226,${0.3 * fog})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 0.26 * fog;
      ctx.fillStyle = '#e6ecf2';
      for (const b of this.fogBanks) {
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.w / 2, b.h / 2, 0, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    }

    if (this.drops.length) {
      ctx.save();
      ctx.strokeStyle = '#b9d4ec';
      ctx.lineWidth = 1;
      for (const d of this.drops) {
        ctx.globalAlpha = d.a;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.22, d.y + d.len);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.flakes.length) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.86;
      for (const f of this.flakes) ctx.fillRect(Math.round(f.x), Math.round(f.y), f.r, f.r);
      ctx.restore();
    }

    if (this.leaves.length) {
      ctx.save();
      for (const l of this.leaves) {
        ctx.fillStyle = l.hue < 0.4 ? '#c9863f' : l.hue < 0.75 ? '#8fa653' : '#b2624b';
        const s = 2 + Math.round(Math.abs(Math.cos(l.phase)) * 2);
        ctx.fillRect(Math.round(l.x), Math.round(l.y), s, 2);
      }
      ctx.restore();
    }
  }
}

/** "Rainy — steady, soaking, and in for the day." */
export function weatherLine(w) { return `${w.name} — ${w.blurb.toLowerCase()}`; }
