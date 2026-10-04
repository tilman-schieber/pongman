// Tiny Web Audio chiptune synth: SFX, and a loop that fills out as the match goes on. The
// melody is made up afresh for every match.
import { makeRng } from './rng';

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;

export function unlockAudio() {
  // iOS: play through the silent switch like a media app (Safari 16.4+).
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number) {
  if (!ctx) return;
  const t = at || ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function noise(dur: number, vol: number, cutoff: number, at = 0, type: BiquadFilterType = 'lowpass') {
  if (!ctx) return;
  const t = at || ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur);
}

function arp(notes: number[], step: number, vol = 0.25, type: OscillatorType = 'square') {
  if (!ctx) return;
  const t = ctx.currentTime;
  notes.forEach((n, i) => n && tone(midiHz(n), step, type, vol, t + i * step));
}

let wakaK = 0;

export const sfx = {
  move: () => tone(1400, 0.02, 'square', 0.12),
  select: () => tone(988, 0.04, 'square', 0.18),
  start: () => arp([67, 72, 76, 79, 0, 76, 79, 84, 0, 83, 86, 91], 0.07, 0.2),
  pause: () => arp([84, 79], 0.06, 0.18),
  /** Munching: two alternating chirps. */
  waka: () => (wakaK++ % 2 ? tone(520, 0.07, 'triangle', 0.5, 0, 260) : tone(260, 0.07, 'triangle', 0.5, 0, 520)),
  /** The paddle: a Pong blip, higher the longer the rally. */
  bat: (rally: number) => tone(440 + Math.min(10, rally) * 30, 0.06, 'square', 0.3),
  wall: () => tone(220, 0.04, 'square', 0.2),
  serve: () => arp([60, 72], 0.05, 0.2),
  power: () => arp([60, 67, 72, 79, 84, 91], 0.035, 0.24),
  eatGhost: (n: number) => {
    tone(200 + n * 80, 0.3, 'square', 0.22, 0, 1600 + n * 300);
    noise(0.12, 0.3, 1800);
  },
  /** Caught by a ghost: a quick fold-up. */
  die: () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let k = 0; k < 5; k++) tone(700 - k * 90, 0.09, 'triangle', 0.4, t + k * 0.08, 450 - k * 60);
    noise(0.15, 0.3, 900, t + 0.4);
  },
  goal: () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(0.3, 0.4, 2500);
    [72, 79, 84].forEach((n, i) => tone(midiHz(n), 0.12, 'square', 0.22, t + i * 0.08));
  },
  token: () => arp([79, 84, 88, 91], 0.05, 0.22, 'triangle'),
  invade: () => arp([55, 52, 55, 52, 48], 0.09, 0.22, 'sawtooth'),
  laser: () => tone(1800, 0.08, 'square', 0.12, 0, 400),
  zap: () => noise(0.1, 0.3, 3000, 0, 'highpass'),
  bomb: () => {
    tone(140, 0.25, 'square', 0.3, 0, 40);
    noise(0.2, 0.35, 500);
  },
  cleared: () => arp([72, 76, 79, 84, 79, 84, 88, 91], 0.07, 0.22),
  /** The gorilla climbs up: drums and a growl. */
  kong: () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let k = 0; k < 4; k++) perc.kick(t + k * 0.14, 0.5);
    tone(90, 0.5, 'sawtooth', 0.18, t + 0.1, 60);
  },
  throw: () => tone(300, 0.12, 'triangle', 0.25, 0, 900),
  barrel: () => {
    tone(160, 0.2, 'square', 0.3, 0, 50);
    noise(0.25, 0.4, 700);
  },
  win: () => arp([72, 76, 79, 84, 0, 84, 88, 91, 96], 0.08, 0.22),
  lose: () => arp([67, 63, 60, 55, 51, 48], 0.12, 0.22),
  record: () => arp([76, 79, 88, 84, 86, 91], 0.07, 0.22),
};

// ---------- music ----------
// A loop of sixteenths over Am G F E. Intensity 0-5 follows the match: instruments join as
// the bars fill up.

interface Tune {
  /** Seconds per unit at tempo 1. */
  unit: number;
  length: number;
  play(i: number, t: number, lv: number, tr: number, unitSec: number): void;
}

const perc = {
  snare: (t: number, vol: number) => noise(0.05, vol, 7000, t, 'highpass'),
  hat: (t: number, vol: number) => noise(0.03, vol, 9000, t, 'highpass'),
  kick: (t: number, vol: number) => {
    tone(120, 0.12, 'sine', vol, t, 40);
    noise(0.04, vol * 0.4, 300, t);
  },
};

const CHORDS = [
  [45, 0, 3, 7],
  [43, 0, 4, 7],
  [41, 0, 4, 7],
  [40, 0, 4, 7],
];
const PENTATONIC = [0, 3, 5, 7, 10, 12, 15, 17];
/** Midi note per unit, 0 for a rest. */
let melody: number[] = [];
let power = false;

function compose(seed: number) {
  const rng = makeRng(seed);
  const bar = () => {
    const out: number[] = [];
    let d = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < 8; k++) {
      d = Math.max(0, Math.min(PENTATONIC.length - 1, d + [-2, -1, -1, 0, 1, 1, 2][Math.floor(rng() * 7)]));
      out.push(k === 0 || rng() < 0.72 ? 69 + PENTATONIC[d] : 0, 0);
    }
    return out;
  };
  const a = bar(), b = bar(), c = bar();
  melody = [...a, ...b, ...a, ...c];
}
compose(1);

const RALLY: Tune = {
  unit: 60 / 124 / 4,
  length: 64,
  play(i, t, lv, tr, u) {
    const [root, ...triad] = CHORDS[i >> 4];
    const s = i % 16;
    // A bouncing bass, like the ball.
    if (s % 2 === 0) tone(midiHz(root + tr + (s % 4 === 2 ? 12 : 0)), u * 1.7, 'triangle', 0.3, t);
    if (lv >= 1 && s % 8 === 0) perc.kick(t, 0.45);
    if (lv >= 2 && s % 8 === 4) perc.snare(t, 0.11);
    if (lv >= 3 && s % 2 === 1) perc.hat(t, 0.045);
    if (lv >= 4 && (s === 10 || s === 14)) perc.kick(t, 0.3);
    if (power) {
      tone(midiHz(root + 24 + tr + triad[i % 3] + 12 * ((i >> 1) % 2)), u * 0.9, 'square', 0.07, t);
      return;
    }
    if (lv >= 2) tone(midiHz(root + 12 + tr + triad[(i >> 1) % 3]), u * 0.8, 'square', 0.025 + lv * 0.004, t);
    const m = melody[i];
    if (m) {
      tone(midiHz(m + tr), u * 1.8, lv >= 3 ? 'square' : 'triangle', lv >= 3 ? 0.08 : 0.26, t);
      if (lv >= 3) tone(midiHz(m + tr), u * 1.5, 'triangle', 0.14, t + u * 3);
      if (lv >= 5) tone(midiHz(m + tr + 12), u * 1.5, 'square', 0.03, t);
    }
  },
};

let musicOn = true;
let playing = false;
let unit = 0;
let nextTime = 0;
let timer: number | undefined;
let transpose = 0;
let intensity = 0;
let tempo = 1;

function schedule() {
  if (!ctx) return;
  while (nextTime < ctx.currentTime + 0.12) {
    const u = RALLY.unit / tempo;
    RALLY.play(unit % RALLY.length, nextTime, intensity, transpose, u);
    unit++;
    nextTime += u;
  }
}

export const music = {
  /** Start (or keep playing) the tune; `restart` takes it from the top. */
  play(restart = false) {
    if (restart) {
      this.halt();
      unit = 0;
    }
    playing = true;
    if (!ctx || !musicOn || timer !== undefined) return;
    nextTime = ctx.currentTime + 0.05;
    timer = window.setInterval(schedule, 25);
  },
  resume() {
    if (playing) this.play();
  },
  stop() {
    playing = false;
    this.halt();
  },
  halt() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  },
  /** Semitones up or down from A minor, kept within a tritone. */
  setKey(semis: number) {
    transpose = ((semis + 18) % 12) - 6;
  },
  setIntensity(lv: number) {
    intensity = lv;
  },
  setTempo(mult: number) {
    tempo = mult;
  },
  setMelody(seed: number) {
    compose(seed);
  },
  /** While the ghosts are blue the tune races. */
  setPower(on: boolean) {
    power = on;
  },
  toggle() {
    musicOn = !musicOn;
    if (!musicOn) this.halt();
    else if (playing) this.play();
    return musicOn;
  },
  set enabled(on: boolean) {
    if (on !== musicOn) this.toggle();
  },
  get enabled() {
    return musicOn;
  },
  get running() {
    return timer !== undefined;
  },
};
