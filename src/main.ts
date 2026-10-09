import { Game, Action, Input } from './game';
import { render, W, H, GRID_Y } from './render';
import { unlockAudio } from './audio';
import { GRID_H } from './world';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

function resize() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  // Whole-number scaling keeps pixels crisp; phones may need a fractional fit.
  const s = scale >= 2 ? Math.floor(scale) : Math.max(0.5, scale);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}
addEventListener('resize', resize);
resize();

// By e.key so labels match any layout. W/S are yellow, the arrows red; A/D and the side arrows
// work the menus.
const KEYS: Record<string, Action> = {
  w: 'p1up',
  s: 'p1down',
  z: 'p1up',
  arrowup: 'p2up',
  arrowdown: 'p2down',
  a: 'left',
  d: 'right',
  q: 'left',
  arrowleft: 'left',
  arrowright: 'right',
  enter: 'start',
  ' ': 'start',
  p: 'start',
  escape: 'back',
  backspace: 'quit',
  m: 'mute',
  h: 'scores',
};

const game = new Game();
const input: Input = { held: new Set(), pressed: new Set(), typed: [], touch: [null, null] };
/** Keys currently down: e.code -> lower-cased e.key at press time (key-up may report a different key). */
const heldKeys = new Map<string, string>();

/** While typing a name, letters are letters. */
const actionFor = (key: string) => (game.phase === 'entry' && /^[a-z0-9]$/.test(key) ? undefined : KEYS[key]);

addEventListener('keydown', (e) => {
  unlockAudio();
  const key = e.key.toLowerCase();
  if (/^[a-z0-9]$/i.test(e.key) && !e.repeat) input.typed.push(e.key.toUpperCase());
  else if (e.key === 'Backspace' || (e.key === 'Enter' && !e.repeat)) input.typed.push(e.key);
  const a = actionFor(key);
  if (a || e.key === 'Backspace') e.preventDefault();
  heldKeys.set(e.code, key);
  if (!e.repeat && a) input.pressed.add(a);
});
addEventListener('keyup', (e) => heldKeys.delete(e.code));
addEventListener('blur', () => {
  heldKeys.clear();
  if (game.phase === 'play' && !game.paused) input.pressed.add('start');
});

// ---------- gamepads: the first is yellow, the second red ----------

const padHeld: Set<Action>[] = [new Set(), new Set()];
const PAD_ACTIONS: [Action, Action][] = [
  ['p1up', 'p1down'],
  ['p2up', 'p2down'],
];

function pollPads() {
  const pads = navigator.getGamepads?.() ?? [];
  let slot = 0;
  for (const pad of pads) {
    if (!pad || slot > 1) continue;
    const [up, down] = PAD_ACTIONS[slot];
    const now = new Set<Action>();
    const y = pad.axes[1] ?? 0;
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    if (y < -0.5 || pressed(12)) now.add(up);
    if (y > 0.5 || pressed(13)) now.add(down);
    if ((pad.axes[0] ?? 0) < -0.5 || pressed(14)) now.add('left');
    if ((pad.axes[0] ?? 0) > 0.5 || pressed(15)) now.add('right');
    // A confirms in the menus; in play only Start pauses.
    if (pressed(9) || (pressed(0) && game.phase !== 'play')) now.add('start');
    if (pressed(1)) now.add('back');
    if (pressed(8)) now.add('quit');
    if (pressed(3) && game.phase === 'title') now.add('scores');
    for (const a of now) {
      if (padHeld[slot].has(a)) continue;
      unlockAudio();
      // Typing a name: A or Start enters it, B rubs out a letter.
      if (game.phase === 'entry' && (a === 'start' || a === 'back')) input.typed.push(a === 'start' ? 'Enter' : 'Backspace');
      else input.pressed.add(a);
    }
    padHeld[slot] = now;
    slot++;
  }
}

// ---------- touch: drag on your half of the court ----------

const fingers = new Map<number, 0 | 1>();
let tapStart: { x: number; y: number; t: number } | null = null;

const canvasY = (e: PointerEvent) => ((e.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight) * H;
const canvasX = (e: PointerEvent) => ((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth) * W;

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (e.pointerType === 'mouse') return;
  const side = game.solo || canvasX(e) < W / 2 ? 0 : 1;
  fingers.set(e.pointerId, side);
  canvas.setPointerCapture(e.pointerId);
  input.touch[side] = Math.max(0, Math.min(GRID_H, canvasY(e) - GRID_Y));
  tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointermove', (e) => {
  const side = fingers.get(e.pointerId);
  if (side === undefined) return;
  input.touch[side] = Math.max(0, Math.min(GRID_H, canvasY(e) - GRID_Y));
});
for (const ev of ['pointerup', 'pointercancel'] as const)
  canvas.addEventListener(ev, (e) => {
    const side = fingers.get(e.pointerId);
    if (side === undefined) return;
    fingers.delete(e.pointerId);
    if (![...fingers.values()].includes(side)) input.touch[side] = null;
    // A short still tap is ENTER, so the menus work by touch too.
    if (ev === 'pointerup' && tapStart && performance.now() - tapStart.t < 300 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 10 && game.phase !== 'play')
      input.pressed.add('start');
    tapStart = null;
  });

function refreshHeld() {
  input.held.clear();
  for (const key of heldKeys.values()) {
    const a = actionFor(key);
    if (a) input.held.add(a);
  }
  for (const set of padHeld) for (const a of set) input.held.add(a);
}

// Fixed 60 Hz simulation.
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();
let frame = 0;

function loop(now: number) {
  acc += Math.min(250, now - last);
  last = now;
  pollPads();
  while (acc >= STEP) {
    refreshHeld();
    game.step(input);
    input.pressed.clear();
    input.typed.length = 0;
    acc -= STEP;
    frame++;
  }
  render(ctx, game, frame);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) {
  // For poking at a game from the console: `step(n)` runs n frames and draws, with `held` actions down.
  const step = (n = 1, held: Action[] = [], draw = true) => {
    for (let i = 0; i < n; i++) {
      refreshHeld();
      for (const a of held) input.held.add(a);
      game.step(input);
      input.pressed.clear();
      input.typed.length = 0;
      frame++;
    }
    if (draw) render(ctx, game, frame);
  };
  Object.assign(window, { game, input, step });
}
