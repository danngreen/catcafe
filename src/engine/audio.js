// Everything you hear is synthesised at runtime with the Web Audio API — there
// are no sound files in this project.
//
//   * Music  : a lookahead scheduler plays lo-fi jazz chord loops on a Rhodes-ish
//              FM voice, upright bass, brushed drums and vinyl crackle.
//   * SFX    : short synth recipes (meows, coins, door chimes, plate clinks...).
//   * Ambience: per-biome beds — running water, wind, birds, cafe chatter — whose
//              levels the world can nudge as you walk around.

import { makeRng, clamp } from './util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Chord shapes as semitone offsets from the root.
const CH = {
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  min7: [0, 3, 7, 10],
  min9: [0, 3, 7, 10, 14],
  dom9: [0, 4, 7, 10, 14],
  dom7: [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
  sus2: [0, 2, 7, 14],
  add9: [0, 4, 7, 14],
  min6: [0, 3, 7, 9],
};

// Each entry: [rootMidi, chordName]. Roots sit around C3 (48).
const TRACKS = {
  // Warm, slow, the "sitting by the window with a coffee" loop.
  cafe: {
    bpm: 72, swing: 0.16, drums: 0.9, pad: 0.5, melody: 0.55, crackle: 0.5,
    prog: [[53, 'maj9'], [50, 'min9'], [48, 'min7'], [46, 'dom9'],
           [53, 'maj9'], [55, 'min9'], [48, 'dom9'], [53, 'maj9']],
  },
  // Brighter and more bouncy for the villages.
  town: {
    bpm: 88, swing: 0.12, drums: 0.75, pad: 0.35, melody: 0.7, crackle: 0.28,
    prog: [[48, 'maj9'], [55, 'dom9'], [45, 'min9'], [50, 'min7'],
           [48, 'maj9'], [53, 'maj7'], [50, 'min9'], [55, 'dom7']],
  },
  // Open pastoral fields: sparse, airy, no backbeat.
  field: {
    bpm: 66, swing: 0.1, drums: 0.0, pad: 0.85, melody: 0.6, crackle: 0.16,
    prog: [[50, 'sus2'], [50, 'add9'], [48, 'maj9'], [45, 'min9'],
           [43, 'sus2'], [50, 'add9'], [55, 'min7'], [48, 'maj9']],
  },
  // Night: hushed, mostly pad and the odd chime.
  night: {
    bpm: 60, swing: 0.14, drums: 0.28, pad: 0.95, melody: 0.35, crackle: 0.55,
    prog: [[45, 'min9'], [43, 'm7b5'], [41, 'maj9'], [48, 'dom9'],
           [45, 'min9'], [50, 'min7'], [43, 'min6'], [45, 'min9']],
  },
  // Little shop jingle-ish loop, a touch faster and cheerier.
  shop: {
    bpm: 96, swing: 0.18, drums: 0.6, pad: 0.3, melody: 0.85, crackle: 0.22,
    prog: [[53, 'maj7'], [52, 'min7'], [50, 'min9'], [48, 'dom9']],
  },
  // Building your cafe extension: focused, rhythmic, satisfying.
  build: {
    bpm: 84, swing: 0.1, drums: 0.8, pad: 0.55, melody: 0.4, crackle: 0.3,
    prog: [[48, 'sus2'], [48, 'add9'], [46, 'maj9'], [46, 'maj7'],
           [51, 'maj9'], [50, 'min9'], [43, 'sus2'], [48, 'add9']],
  },
};

// Pentatonic-ish degrees used to pick melody notes over the current chord.
const MELODY_STEPS = [0, 2, 4, 7, 9, 11, 14, 16];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this.master = null;
    this.rng = makeRng(0xc0ffee);

    this.volumes = { master: 0.75, music: 0.5, sfx: 0.75, ambience: 0.5 };

    this.trackName = null;
    this.nextTrack = null;
    this.beat = 0;          // integer 8th-note counter
    this.nextNoteTime = 0;
    this.barCount = 0;
    this.musicOn = true;

    this.ambience = {};     // target levels by name
    this.ambientNodes = {}; // live gain nodes
    this.birdTimer = 4;
    this.critterTimer = 9;
    this.catTimer = 20;
  }

  /** Must be called from a user gesture (click / keypress) to unlock audio. */
  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(c.destination);

    // A soft limiter keeps stacked voices from clipping on loud moments.
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.2;
    this.limiter.connect(this.master);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(2.1, 2.6);
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.34;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.limiter);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.volumes.music;
    this.musicBus.connect(this.limiter);
    this.musicSend = c.createGain();
    this.musicSend.gain.value = 0.5;
    this.musicBus.connect(this.musicSend);
    this.musicSend.connect(this.reverb);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.volumes.sfx;
    this.sfxBus.connect(this.limiter);
    this.sfxSend = c.createGain();
    this.sfxSend.gain.value = 0.22;
    this.sfxBus.connect(this.sfxSend);
    this.sfxSend.connect(this.reverb);

    this.ambBus = c.createGain();
    this.ambBus.gain.value = this.volumes.ambience;
    this.ambBus.connect(this.limiter);

    this.noiseBuf = this._noiseBuffer(2.0);
    this.ready = true;
    this.nextNoteTime = c.currentTime + 0.08;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setVolume(kind, v) {
    this.volumes[kind] = clamp(v, 0, 1);
    if (!this.ready) return;
    const bus = { master: this.master, music: this.musicBus, sfx: this.sfxBus, ambience: this.ambBus }[kind];
    if (bus) bus.gain.setTargetAtTime(this.volumes[kind], this.ctx.currentTime, 0.05);
  }

  // ---- buffers -------------------------------------------------------------

  _noiseBuffer(seconds) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Exponentially decaying noise = a serviceable room reverb. */
  _impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    return s;
  }

  // ---- low level voice helpers ---------------------------------------------

  /** One enveloped oscillator. Returns the gain node so callers can route it. */
  tone(dest, { type = 'sine', freq = 440, t0, attack = 0.005, decay = 0.2, sustain = 0, release = 0.1, dur = 0.2, gain = 0.2, detune = 0, glideTo = null, glideTime = 0.1 }) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + glideTime);
    osc.detune.value = detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    const susLevel = Math.max(0.0002, gain * sustain);
    g.gain.exponentialRampToValueAtTime(susLevel, t0 + attack + decay);
    g.gain.setValueAtTime(susLevel, t0 + Math.max(attack + decay, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + decay, dur) + release);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + Math.max(attack + decay, dur) + release + 0.05);
    return g;
  }

  /** A short burst of filtered noise — percussion, clinks, footsteps, water. */
  noiseHit(dest, { t0, dur = 0.1, gain = 0.2, type = 'bandpass', freq = 2000, q = 1, sweepTo = null, attack = 0.002 }) {
    const c = this.ctx;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    return g;
  }

  /** Two-operator FM voice; the Rhodes/bell character of the music. */
  fmVoice(dest, { t0, freq, ratio = 2.0, index = 3, dur = 0.6, gain = 0.15, attack = 0.006, release = 0.5, type = 'sine' }) {
    const c = this.ctx;
    const carrier = c.createOscillator();
    carrier.type = type;
    carrier.frequency.value = freq;

    const mod = c.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * ratio;
    const modGain = c.createGain();
    modGain.gain.setValueAtTime(freq * index, t0);
    // The modulation index decaying faster than the amplitude is what gives
    // electric pianos their bright attack and mellow tail.
    modGain.gain.exponentialRampToValueAtTime(freq * index * 0.05 + 0.01, t0 + Math.min(0.5, dur));
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
    carrier.connect(g);
    g.connect(dest);
    mod.start(t0); carrier.start(t0);
    mod.stop(t0 + dur + release + 0.05);
    carrier.stop(t0 + dur + release + 0.05);
    return g;
  }

  // ---- music ---------------------------------------------------------------

  setTrack(name, immediate = false) {
    if (!TRACKS[name] || this.trackName === name) return;
    if (!this.trackName || immediate) {
      this.trackName = name;
      this.beat = 0;
      this.barCount = 0;
      if (this.ready) this.nextNoteTime = Math.max(this.nextNoteTime, this.ctx.currentTime + 0.05);
    } else {
      // Wait for the current bar to finish so transitions land musically.
      this.nextTrack = name;
    }
  }

  setMusicEnabled(on) {
    this.musicOn = on;
    if (this.ready) this.musicBus.gain.setTargetAtTime(on ? this.volumes.music : 0, this.ctx.currentTime, 0.3);
  }

  get track() { return TRACKS[this.trackName] || TRACKS.cafe; }

  /** Called every frame; schedules any 8th notes falling inside the lookahead. */
  updateMusic(dt) {
    if (!this.ready || !this.enabled) return;
    const c = this.ctx;
    const lookahead = 0.25;
    let guard = 0;
    while (this.nextNoteTime < c.currentTime + lookahead && guard++ < 64) {
      const tr = this.track;
      const spb = 60 / tr.bpm;          // seconds per quarter
      const eighth = spb / 2;
      const isOffbeat = this.beat % 2 === 1;
      const t = this.nextNoteTime + (isOffbeat ? eighth * tr.swing : 0);
      if (this.musicOn) this._scheduleBeat(this.beat, t, tr, spb);

      this.beat++;
      this.nextNoteTime += eighth;

      // Bar boundary: 8 eighths per 4/4 bar.
      if (this.beat % 8 === 0) {
        this.barCount++;
        if (this.nextTrack) {
          this.trackName = this.nextTrack;
          this.nextTrack = null;
          this.beat = 0;
          this.barCount = 0;
        }
      }
    }
  }

  _scheduleBeat(beat, t, tr, spb) {
    const bar = Math.floor(beat / 8) % tr.prog.length;
    const [root, chordName] = tr.prog[bar];
    const chord = CH[chordName] || CH.maj7;
    const pos = beat % 8;                       // 0..7 within the bar
    const rng = this.rng;
    const mus = this.musicBus;

    // --- bass: root on 1, a fifth or approach note late in the bar ----------
    if (pos === 0) {
      this.tone(mus, { type: 'triangle', freq: mtof(root - 12), t0: t, attack: 0.012, decay: 0.25, sustain: 0.5, release: 0.35, dur: spb * 1.1, gain: 0.2 });
    } else if (pos === 5 && rng.chance(0.65)) {
      const n = rng.chance(0.5) ? root - 12 + 7 : root - 12 + chord[1];
      this.tone(mus, { type: 'triangle', freq: mtof(n), t0: t, attack: 0.012, decay: 0.2, sustain: 0.4, release: 0.3, dur: spb * 0.7, gain: 0.15 });
    }

    // --- comping chords: lay them on the offbeats like a lazy left hand -----
    if (pos === 2 || pos === 6 || (pos === 3 && rng.chance(0.35))) {
      const voicing = this._voice(root, chord);
      voicing.forEach((n, i) => {
        this.fmVoice(mus, {
          t0: t + i * 0.008,
          freq: mtof(n),
          ratio: 2.01,
          index: 1.6,
          dur: spb * 0.9,
          release: 0.7,
          gain: 0.085,
        });
      });
    }

    // --- pad: a slow swell held across the bar ------------------------------
    if (pos === 0 && tr.pad > 0) {
      const voicing = this._voice(root, chord, -12);
      for (const n of voicing) {
        this.tone(mus, {
          type: 'sawtooth', freq: mtof(n), t0: t,
          attack: spb * 0.9, decay: 0.4, sustain: 0.85, release: spb * 1.4,
          dur: spb * 3.2, gain: 0.028 * tr.pad, detune: rng.range(-9, 9),
        });
      }
    }

    // --- melody: sparse, chord-tone led ------------------------------------
    if (tr.melody > 0 && rng.chance(0.3 * tr.melody) && pos !== 0) {
      const step = rng.pick(MELODY_STEPS);
      const n = root + 12 + (chord.includes(step % 12) ? step : step);
      this.fmVoice(mus, {
        t0: t, freq: mtof(n), ratio: 1.0, index: 2.4,
        dur: spb * (rng.chance(0.3) ? 0.9 : 0.4), release: 0.5, gain: 0.075 * tr.melody,
      });
    }

    // --- drums: soft brushed kit -------------------------------------------
    const d = tr.drums;
    if (d > 0) {
      if (pos === 0 || (pos === 3 && rng.chance(0.5)) || (pos === 6 && rng.chance(0.25))) {
        // kick
        this.tone(mus, { type: 'sine', freq: 120, glideTo: 44, glideTime: 0.09, t0: t, attack: 0.002, decay: 0.13, sustain: 0.0001, release: 0.05, dur: 0.13, gain: 0.42 * d });
      }
      if (pos === 4 || (pos === 7 && rng.chance(0.12))) {
        // brushed snare
        this.noiseHit(mus, { t0: t, dur: 0.16, gain: 0.1 * d, type: 'highpass', freq: 1400, q: 0.7 });
        this.noiseHit(mus, { t0: t, dur: 0.06, gain: 0.07 * d, type: 'bandpass', freq: 250, q: 1.2 });
      }
      if (rng.chance(0.82)) {
        // hats, quieter on offbeats
        const v = (pos % 2 === 0 ? 0.05 : 0.028) * d;
        this.noiseHit(mus, { t0: t, dur: 0.035, gain: v, type: 'highpass', freq: 7000, q: 0.6 });
      }
    }

    // --- vinyl crackle: the lo-fi glue --------------------------------------
    if (tr.crackle > 0 && rng.chance(0.5)) {
      this.noiseHit(mus, { t0: t + rng.range(0, spb * 0.5), dur: 0.012, gain: 0.02 * tr.crackle, type: 'bandpass', freq: rng.range(1500, 6000), q: 3 });
    }
  }

  /** Spread a chord into a playable close voicing around middle C. */
  _voice(root, chord, shift = 0) {
    const out = [];
    for (let i = 1; i < chord.length; i++) {
      let n = root + chord[i] + shift;
      while (n < 55 + shift) n += 12;
      while (n > 79 + shift) n -= 12;
      out.push(n);
    }
    return out;
  }

  // ---- ambience ------------------------------------------------------------

  /**
   * Continuous beds. `levels` maps name -> 0..1; anything omitted fades out.
   * Supported: water, wind, forest, indoor, chatter, fire, waves, rain.
   */
  setAmbience(levels) {
    if (!this.ready) return;
    this.ambience = levels || {};
    const all = new Set([...Object.keys(this.ambientNodes), ...Object.keys(this.ambience)]);
    for (const name of all) {
      const target = this.ambience[name] || 0;
      let node = this.ambientNodes[name];
      if (!node && target > 0) node = this.ambientNodes[name] = this._makeBed(name);
      if (node) node.gain.gain.setTargetAtTime(target * node.scale, this.ctx.currentTime, 1.2);
    }
  }

  _makeBed(name) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(this.ambBus);
    const src = this.noiseSource();
    const f = c.createBiquadFilter();
    let scale = 0.2;

    switch (name) {
      case 'water': // brook: mid-band hiss with a slow wobble
        f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.7; scale = 0.22;
        this._lfo(f.frequency, 0.19, 320, 1500);
        break;
      case 'waves': // surf: low rumble that swells
        f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 0.6; scale = 0.34;
        this._lfo(f.frequency, 0.09, 260, 620);
        this._lfo(g.gain, 0.07, 0.35, 0.65, true);
        break;
      case 'wind':
        f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.4; scale = 0.24;
        this._lfo(f.frequency, 0.05, 220, 430);
        break;
      case 'forest': // leaves rustling, higher and airier than wind
        f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.5; scale = 0.1;
        this._lfo(f.frequency, 0.13, 900, 3400);
        break;
      case 'rain':
        f.type = 'highpass'; f.frequency.value = 1100; f.Q.value = 0.4; scale = 0.3;
        break;
      case 'indoor': // faint room tone
        f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.5; scale = 0.1;
        break;
      case 'fire':
        f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.8; scale = 0.13;
        this._lfo(f.frequency, 0.9, 380, 900);
        break;
      case 'chatter': // murmuring customers; discrete blips handled in update()
        f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.1; scale = 0.09;
        this._lfo(f.frequency, 0.6, 380, 900);
        break;
      default:
        f.type = 'lowpass'; f.frequency.value = 800;
    }
    src.connect(f); f.connect(g);
    src.start();
    return { gain: g, src, filter: f, scale };
  }

  _lfo(param, rate, lo, hi, isGain = false) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = rate;
    const amt = c.createGain();
    amt.gain.value = (hi - lo) / 2;
    osc.connect(amt);
    amt.connect(param);
    if (!isGain) param.value = (hi + lo) / 2;
    osc.start();
    return osc;
  }

  /** Random one-shots layered over the beds: birds, crickets, distant meows. */
  updateAmbience(dt, opts = {}) {
    if (!this.ready || !this.enabled) return;
    const amb = this.ambience;
    const night = opts.night || 0;

    if ((amb.forest || 0) > 0.05 && !night) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = this.rng.range(2.2, 9) / Math.max(0.2, amb.forest);
        this.chirp(amb.forest * 0.55);
      }
    }
    if (night > 0.4 && (amb.forest || amb.wind)) {
      this.critterTimer -= dt;
      if (this.critterTimer <= 0) {
        this.critterTimer = this.rng.range(3.5, 11);
        this.cricket(0.4);
      }
    }
    if ((amb.chatter || 0) > 0.05) {
      this.critterTimer2 = (this.critterTimer2 || 3) - dt;
      if (this.critterTimer2 <= 0) {
        this.critterTimer2 = this.rng.range(1.4, 5.0) / Math.max(0.2, amb.chatter);
        if (this.rng.chance(0.45)) this.sfx('clink', { gain: 0.35 * amb.chatter });
        else this.sfx('murmur', { gain: 0.5 * amb.chatter });
      }
    }
  }

  chirp(vol = 0.4) {
    const c = this.ctx, t = c.currentTime + 0.01;
    const n = this.rng.irange(2, 4);
    const base = this.rng.range(2200, 3600);
    for (let i = 0; i < n; i++) {
      const t0 = t + i * this.rng.range(0.07, 0.13);
      this.tone(this.sfxBus, {
        type: 'sine', freq: base * this.rng.range(0.92, 1.1), glideTo: base * this.rng.range(1.15, 1.5), glideTime: 0.05,
        t0, attack: 0.006, decay: 0.05, sustain: 0.2, release: 0.05, dur: 0.06, gain: 0.09 * vol,
      });
    }
  }

  cricket(vol = 0.3) {
    const c = this.ctx, t = c.currentTime + 0.01;
    for (let i = 0; i < 3; i++) {
      this.noiseHit(this.sfxBus, { t0: t + i * 0.085, dur: 0.035, gain: 0.05 * vol, type: 'bandpass', freq: 5200, q: 14 });
    }
  }

  // ---- sound effects -------------------------------------------------------

  /**
   * Fire a named effect. opts: { gain, pitch, pan }
   * Everything is defined here rather than in a data file so the recipes live
   * next to the synth helpers they use.
   */
  sfx(name, opts = {}) {
    if (!this.ready || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime + 0.005;
    const vol = opts.gain ?? 1;
    const pitch = opts.pitch ?? 1;
    let dest = this.sfxBus;
    if (opts.pan !== undefined && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(opts.pan, -1, 1);
      p.connect(this.sfxBus);
      dest = p;
    }
    const R = this.rng;

    switch (name) {
      case 'meow': {
        // Two formant-ish bands sweeping up then down = a passable "mrow".
        const f0 = R.range(440, 700) * pitch;
        const peak = f0 * R.range(1.5, 1.9);
        const dur = R.range(0.28, 0.5);
        for (const [ratio, g] of [[1, 0.16], [2, 0.07], [3, 0.03]]) {
          const osc = c.createOscillator();
          osc.type = ratio === 1 ? 'sawtooth' : 'sine';
          const f = osc.frequency;
          f.setValueAtTime(f0 * ratio, t);
          f.exponentialRampToValueAtTime(peak * ratio, t + dur * 0.32);
          f.exponentialRampToValueAtTime(f0 * 0.82 * ratio, t + dur);
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 1100 * ratio; bp.Q.value = 1.6;
          const gn = c.createGain();
          gn.gain.setValueAtTime(0.0001, t);
          gn.gain.linearRampToValueAtTime(g * vol, t + 0.05);
          gn.gain.setValueAtTime(g * vol, t + dur * 0.6);
          gn.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
          osc.connect(bp); bp.connect(gn); gn.connect(dest);
          osc.start(t); osc.stop(t + dur + 0.2);
        }
        break;
      }
      case 'meow_happy':
        this.sfx('meow', { gain: vol, pitch: 1.25 * pitch, pan: opts.pan });
        break;
      case 'meow_sad':
        this.sfx('meow', { gain: vol * 0.85, pitch: 0.72 * pitch, pan: opts.pan });
        break;
      case 'purr': {
        const src = this.noiseSource();
        const f = c.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 3;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.16 * vol, t + 0.15);
        g.gain.setValueAtTime(0.16 * vol, t + 1.0);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        // Amplitude modulation at ~26Hz is what makes a purr sound like a purr.
        const lfo = c.createOscillator();
        lfo.frequency.value = 26;
        const lg = c.createGain(); lg.gain.value = 0.09 * vol;
        lfo.connect(lg); lg.connect(g.gain);
        src.connect(f); f.connect(g); g.connect(dest);
        src.start(t); src.stop(t + 1.6); lfo.start(t); lfo.stop(t + 1.6);
        break;
      }
      case 'sneeze': {
        // Tiny intake, then a soft "tssh".
        this.noiseHit(dest, { t0: t, dur: 0.16, gain: 0.05 * vol, type: 'bandpass', freq: 700, sweepTo: 1600, q: 1.2, attack: 0.1 });
        this.noiseHit(dest, { t0: t + 0.2, dur: 0.22, gain: 0.2 * vol, type: 'highpass', freq: 2600, sweepTo: 900, q: 0.7 });
        this.tone(dest, { type: 'sine', freq: 900 * pitch, glideTo: 420, glideTime: 0.16, t0: t + 0.2, attack: 0.004, decay: 0.1, sustain: 0.05, release: 0.08, dur: 0.14, gain: 0.06 * vol });
        break;
      }
      case 'step':
        this.noiseHit(dest, { t0: t, dur: 0.055, gain: 0.045 * vol, type: 'lowpass', freq: R.range(700, 1200), q: 0.8 });
        break;
      case 'step_wood':
        this.noiseHit(dest, { t0: t, dur: 0.06, gain: 0.05 * vol, type: 'bandpass', freq: R.range(300, 480), q: 2.2 });
        break;
      case 'step_water':
        this.noiseHit(dest, { t0: t, dur: 0.13, gain: 0.09 * vol, type: 'bandpass', freq: R.range(1400, 2600), sweepTo: 500, q: 1.1 });
        break;
      case 'coin': {
        const base = 1180 * pitch;
        this.tone(dest, { type: 'square', freq: base, t0: t, attack: 0.002, decay: 0.05, sustain: 0.3, release: 0.09, dur: 0.05, gain: 0.06 * vol });
        this.tone(dest, { type: 'square', freq: base * 1.5, t0: t + 0.06, attack: 0.002, decay: 0.06, sustain: 0.2, release: 0.16, dur: 0.09, gain: 0.055 * vol });
        break;
      }
      case 'cash': {
        // Register ding + drawer.
        this.tone(dest, { type: 'sine', freq: 1560, t0: t, attack: 0.002, decay: 0.3, sustain: 0.02, release: 0.4, dur: 0.35, gain: 0.1 * vol });
        this.tone(dest, { type: 'sine', freq: 2340, t0: t, attack: 0.002, decay: 0.24, sustain: 0.02, release: 0.3, dur: 0.28, gain: 0.05 * vol });
        this.noiseHit(dest, { t0: t + 0.14, dur: 0.12, gain: 0.06 * vol, type: 'lowpass', freq: 900, q: 1 });
        break;
      }
      case 'buy':
        this.sfx('coin', { gain: vol });
        this.tone(dest, { type: 'triangle', freq: 660, t0: t + 0.09, attack: 0.004, decay: 0.1, sustain: 0.2, release: 0.2, dur: 0.12, gain: 0.07 * vol });
        break;
      case 'door': {
        // Shop bell above the door.
        for (const f of [2100, 2620, 3380]) {
          this.tone(dest, { type: 'sine', freq: f * pitch, t0: t + R.range(0, 0.03), attack: 0.003, decay: 0.5, sustain: 0.03, release: 0.6, dur: 0.5, gain: 0.055 * vol });
        }
        break;
      }
      case 'clink': {
        const f0 = R.range(2400, 4200);
        this.tone(dest, { type: 'sine', freq: f0, t0: t, attack: 0.001, decay: 0.14, sustain: 0.02, release: 0.18, dur: 0.12, gain: 0.055 * vol });
        this.tone(dest, { type: 'sine', freq: f0 * 1.62, t0: t, attack: 0.001, decay: 0.1, sustain: 0.02, release: 0.12, dur: 0.08, gain: 0.03 * vol });
        break;
      }
      case 'murmur': {
        // A wordless syllable or two — the sound of a room with people in it.
        const n = R.irange(2, 4);
        for (let i = 0; i < n; i++) {
          const t0 = t + i * R.range(0.08, 0.17);
          this.noiseHit(dest, { t0, dur: R.range(0.07, 0.14), gain: 0.035 * vol, type: 'bandpass', freq: R.range(300, 900), q: 5 });
        }
        break;
      }
      case 'talk': {
        // Per-character blip while dialogue types out.
        this.tone(dest, { type: 'square', freq: R.range(380, 520) * pitch, t0: t, attack: 0.002, decay: 0.03, sustain: 0.001, release: 0.02, dur: 0.028, gain: 0.03 * vol });
        break;
      }
      case 'ui_move':
        this.tone(dest, { type: 'square', freq: 720 * pitch, t0: t, attack: 0.001, decay: 0.035, sustain: 0.001, release: 0.03, dur: 0.03, gain: 0.05 * vol });
        break;
      case 'ui_ok':
        this.tone(dest, { type: 'square', freq: 880, t0: t, attack: 0.002, decay: 0.05, sustain: 0.2, release: 0.06, dur: 0.05, gain: 0.055 * vol });
        this.tone(dest, { type: 'square', freq: 1320, t0: t + 0.055, attack: 0.002, decay: 0.06, sustain: 0.15, release: 0.1, dur: 0.06, gain: 0.05 * vol });
        break;
      case 'ui_back':
        this.tone(dest, { type: 'square', freq: 520, t0: t, attack: 0.002, decay: 0.06, sustain: 0.1, release: 0.06, dur: 0.05, gain: 0.05 * vol });
        this.tone(dest, { type: 'square', freq: 360, t0: t + 0.05, attack: 0.002, decay: 0.07, sustain: 0.1, release: 0.08, dur: 0.05, gain: 0.045 * vol });
        break;
      case 'error':
        this.tone(dest, { type: 'square', freq: 220, t0: t, attack: 0.003, decay: 0.12, sustain: 0.2, release: 0.1, dur: 0.14, gain: 0.06 * vol });
        break;
      case 'fanfare': {
        const notes = [72, 76, 79, 84];
        notes.forEach((n, i) => {
          this.fmVoice(dest, { t0: t + i * 0.11, freq: mtof(n), ratio: 2, index: 2.5, dur: i === 3 ? 0.6 : 0.14, release: 0.5, gain: 0.11 * vol });
        });
        break;
      }
      case 'levelup': {
        [60, 64, 67, 72, 76].forEach((n, i) => {
          this.fmVoice(dest, { t0: t + i * 0.07, freq: mtof(n), ratio: 1.5, index: 3, dur: 0.12, release: 0.4, gain: 0.09 * vol });
        });
        break;
      }
      case 'hammer': {
        this.noiseHit(dest, { t0: t, dur: 0.07, gain: 0.13 * vol, type: 'bandpass', freq: 1800, q: 1.4 });
        this.tone(dest, { type: 'triangle', freq: 320, glideTo: 150, glideTime: 0.06, t0: t, attack: 0.001, decay: 0.07, sustain: 0.01, release: 0.05, dur: 0.06, gain: 0.1 * vol });
        break;
      }
      case 'saw':
        this.noiseHit(dest, { t0: t, dur: 0.34, gain: 0.07 * vol, type: 'bandpass', freq: 1500, sweepTo: 2600, q: 2 });
        break;
      case 'place':
        this.tone(dest, { type: 'triangle', freq: 540 * pitch, t0: t, attack: 0.002, decay: 0.06, sustain: 0.15, release: 0.08, dur: 0.06, gain: 0.07 * vol });
        break;
      case 'wing': {
        // Mail / taxi bird flapping away.
        for (let i = 0; i < 5; i++) {
          this.noiseHit(dest, { t0: t + i * 0.11, dur: 0.09, gain: 0.06 * vol * (1 - i * 0.13), type: 'lowpass', freq: 900, sweepTo: 400, q: 0.8, attack: 0.02 });
        }
        break;
      }
      case 'mail':
        this.tone(dest, { type: 'sine', freq: 1046, t0: t, attack: 0.004, decay: 0.2, sustain: 0.1, release: 0.3, dur: 0.2, gain: 0.08 * vol });
        this.tone(dest, { type: 'sine', freq: 1568, t0: t + 0.12, attack: 0.004, decay: 0.25, sustain: 0.08, release: 0.4, dur: 0.25, gain: 0.07 * vol });
        break;
      case 'splash':
        this.noiseHit(dest, { t0: t, dur: 0.3, gain: 0.14 * vol, type: 'bandpass', freq: 2400, sweepTo: 420, q: 0.8 });
        break;
      case 'bush':
        this.noiseHit(dest, { t0: t, dur: 0.16, gain: 0.07 * vol, type: 'highpass', freq: 3000, q: 0.5 });
        break;
      case 'blocked':
        this.noiseHit(dest, { t0: t, dur: 0.07, gain: 0.05 * vol, type: 'lowpass', freq: 400, q: 1 });
        break;
      case 'eat':
        this.noiseHit(dest, { t0: t, dur: 0.09, gain: 0.06 * vol, type: 'lowpass', freq: 800, q: 2 });
        this.noiseHit(dest, { t0: t + 0.13, dur: 0.08, gain: 0.05 * vol, type: 'lowpass', freq: 650, q: 2 });
        break;
      case 'brush':
        this.noiseHit(dest, { t0: t, dur: 0.22, gain: 0.07 * vol, type: 'bandpass', freq: 2200, sweepTo: 3400, q: 0.9, attack: 0.05 });
        break;
      case 'quest':
        [67, 72, 76, 79].forEach((n, i) =>
          this.fmVoice(dest, { t0: t + i * 0.09, freq: mtof(n), ratio: 3, index: 2, dur: 0.2, release: 0.5, gain: 0.08 * vol }));
        break;
      default:
        break;
    }
  }

  update(dt, opts) {
    this.updateMusic(dt);
    this.updateAmbience(dt, opts);
  }
}

export const audio = new AudioEngine();
