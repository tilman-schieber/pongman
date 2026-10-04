// The court: two paddles in their lanes, and between them a maze that Pongman flies through,
// over dots, ghosts, and the invaders that come down a lane. Everything is simulated at 60 Hz;
// y runs from the top of the maze grid (the renderer adds the HUD).
import { Rng } from './rng';
import { Layout, generate, COLS, ROWS, TILE, FIELD_C0, FIELD_C1, LANE, OPEN, HOUSE_X, HOUSE_Y, DOOR_Y, DOT, PELLET, cellAt, cx, cy } from './maze';

export { COLS, ROWS, TILE, FIELD_C0, FIELD_C1, DOT, PELLET, cellAt, cx, cy };

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export type Side = 0 | 1;
/** Paddle input: -1 up, 0 still, 1 down. */
export type Move = -1 | 0 | 1;

export const GRID_H = ROWS * TILE;
/** The paddle faces: the ball is caught here. */
export const FACE_X: [number, number] = [12, 244];
export const PADDLE_W = 4;
export const PADDLE_H = 24;
export const PADDLE_SPEED = 2.4;
export const BALL_R = 6;
/** Frames he sits on a paddle before he is shot. */
export const HOLD_FRAMES = 70;
export const DEATH_FRAMES = 50;
const GHOST_COUNT = 3;
const GHOST_R = 6;
const POWER_FRAMES = 420;
const TOKEN_LIFE = 900;
const TOKEN_GAP = 420;
const INVADER_COUNT = 4;
const INVADER_HP = 2;
const MAX_TOKENS = 3;

/** How far each thing moves the marker on the bar; a goal is 100. */
export const PULL = { goal: 100, dot: 2, pellet: 10, ghost: 20, alien: 10, shot: 5, death: -30, cleared: 100, barrel: -10 };
export const KONG_UP = 26;
const KONG_GAP = [2400, 4200];
const KONG_THROWS = 5;
const BARREL_FLIGHT = 100;
const GRAVITY = 0.05;

export const colX = (c: number) => c * TILE + TILE / 2;
export const rowY = (r: number) => r * TILE + TILE / 2;
const colOf = (x: number) => Math.floor(x / TILE);
const rowOf = (y: number) => Math.floor(y / TILE);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface Paddle {
  side: Side;
  /** Centre. */
  y: number;
  /** Frames it can't move after a bomb. */
  stun: number;
  move: Move;
}

export interface Ball {
  x: number;
  y: number;
  dir: Dir;
  /** Which way along the court he is headed: +1 right, -1 left. */
  heading: 1 | -1;
  speed: number;
  /** Who shot him last and so steers him; he wears their colour. */
  owner: Side;
  state: 'held' | 'flying' | 'dead';
  timer: number;
  /** Paddle hits this rally. */
  rally: number;
  /** Where on the paddle he sits, from its centre. */
  hold: number;
}

export type GhostState = 'home' | 'leaving' | 'roam' | 'eyes';
export interface Ghost {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  state: GhostState;
  wait: number;
}

export const INVADER_W = 14;
export const INVADER_H = 10;
export interface Invader {
  x: number;
  y: number;
  alive: boolean;
  /** Lasers it still takes. */
  hp: number;
  /** Frames it flashes after a hit. */
  flash: number;
}
export interface Invasion {
  side: Side;
  invaders: Invader[];
  vx: number;
  bombs: { x: number; y: number }[];
  lasers: { x: number; y: number }[];
}

/** A barrel in the air: a lob from the gorilla to a spot in a lane. */
export interface Barrel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Frames flown, of the flight's length. */
  t: number;
  flight: number;
  /** Where it comes down. */
  tx: number;
  ty: number;
  side: Side;
}
export interface Kong {
  phase: 'rising' | 'throwing' | 'sinking';
  /** How far he has come up from the bottom edge, in pixels. */
  up: number;
  timer: number;
  thrown: number;
  next: Side;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export type Sound =
  | 'waka'
  | 'bat'
  | 'wall'
  | 'power'
  | 'eatGhost'
  | 'die'
  | 'goal'
  | 'token'
  | 'invade'
  | 'laser'
  | 'zap'
  | 'bomb'
  | 'cleared'
  | 'serve'
  | 'kong'
  | 'throw'
  | 'barrel';

export type State = 'ready' | 'play' | 'goal' | 'over';

export interface Options {
  rng: Rng;
  /** Ball speed at the serve. */
  speed: number;
  /** The lead that wins, in goals. */
  target: number;
}

export const SIDE_COLORS = ['#f8d838', '#f83800'];

export class World {
  rng: Rng;
  opt: Options;
  layout: Layout;
  grid: Uint8Array;
  state: State = 'ready';
  stateTimer = 0;
  paddles: [Paddle, Paddle];
  ball: Ball;
  dots: Uint8Array;
  dotsLeft = 0;
  dotsTotal = 0;
  ghosts: Ghost[] = [];
  /** Frames of ghost fright left, and ghosts eaten in this fright. */
  power = 0;
  chain = 0;
  /** Alien tokens lying in the maze, and frames until the next one. */
  tokens: { cell: number; life: number }[] = [];
  tokenTimer = TOKEN_GAP;
  invasions: Invasion[] = [];
  /** The gorilla, while he is up, and frames until he next comes; barrels fly on without him. */
  kong: Kong | null = null;
  kongTimer: number;
  barrels: Barrel[] = [];
  points: [number, number] = [0, 0];
  goals: [number, number] = [0, 0];
  /** The tug of war: positive is yellow's way. The match ends at +-limit. */
  lead = 0;
  limit: number;
  /** Who serves next. */
  server: Side = 0;
  /** Who scored the last goal. */
  lastGoal: Side = 0;
  bestRally = 0;
  ghostsEaten: [number, number] = [0, 0];
  shots: [number, number] = [0, 0];
  popups: Popup[] = [];
  particles: Particle[] = [];
  shake = 0;
  sounds: Sound[] = [];
  playTime = 0;

  constructor(opt: Options, layout = generate(opt.rng, 0.5 + opt.rng() * 0.25, 3 + Math.floor(opt.rng() * 2))) {
    this.opt = opt;
    this.rng = opt.rng;
    this.layout = layout;
    this.grid = layout.grid;
    this.dots = new Uint8Array(layout.dots);
    this.limit = opt.target * PULL.goal;
    this.kongTimer = KONG_GAP[0] + this.rng() * (KONG_GAP[1] - KONG_GAP[0]);
    this.paddles = [this.newPaddle(0), this.newPaddle(1)];
    this.server = this.rng() < 0.5 ? 0 : 1;
    this.ball = this.newBall(this.server);
    this.countDots();
    for (let i = 0; i < GHOST_COUNT; i++) this.ghosts.push(this.newGhost(i, 120 + i * 240));
  }

  private newPaddle(side: Side): Paddle {
    return { side, y: GRID_H / 2, stun: 0, move: 0 };
  }

  private newBall(owner: Side): Ball {
    return { x: this.heldX(owner), y: this.paddles[owner].y, dir: owner === 0 ? 1 : 3, heading: owner === 0 ? 1 : -1, speed: this.opt.speed, owner, state: 'held', timer: 0, rally: 0, hold: 0 };
  }

  private heldX(side: Side) {
    return side === 0 ? FACE_X[0] + BALL_R : FACE_X[1] - BALL_R;
  }

  private newGhost(id: number, wait: number): Ghost {
    return { id, x: HOUSE_X + (id % 2 ? 6 : -6), y: HOUSE_Y, dir: id % 2 ? 3 : 1, state: 'home', wait };
  }

  private countDots() {
    this.dotsTotal = this.dotsLeft = this.dots.reduce((n, d) => n + (d ? 1 : 0), 0);
  }

  /** A cell he can fly through. */
  passable(c: number, r: number) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const g = this.grid[cellAt(c, r)];
    return g === OPEN || g === LANE;
  }

  // ---------- the frame ----------

  /** One frame. `moves` is each paddle's input; the owner's input also steers the ball. */
  update(moves: [Move, Move]) {
    this.stateTimer++;
    for (const p of this.paddles) this.movePaddle(p, moves[p.side]);
    // On a paddle he rides along with it, whatever else is going on.
    if (this.ball.state === 'held') {
      this.ball.x = this.heldX(this.ball.owner);
      this.ball.y = this.paddles[this.ball.owner].y + this.ball.hold;
    }
    if (this.state === 'ready' && this.stateTimer >= 60) {
      this.state = 'play';
      this.stateTimer = 0;
    }
    if (this.state === 'play') {
      this.playTime++;
      this.stepBall(moves[this.ball.owner]);
      this.stepGhosts();
      this.stepTokens();
      this.stepKong();
    }
    this.stepBarrels();
    if (this.state === 'goal' && this.stateTimer >= 90) this.nextPoint();
    for (const inv of this.invasions) this.stepInvasion(inv);
    this.invasions = this.invasions.filter((inv) => inv.invaders.some((i) => i.alive) || inv.bombs.length);
    if (this.power > 0 && --this.power === 0) this.chain = 0;
    this.stepFx();
  }

  private movePaddle(p: Paddle, move: Move) {
    p.move = 0;
    if (p.stun > 0) {
      p.stun--;
      return;
    }
    if (!move) return;
    const half = PADDLE_H / 2;
    const y = clamp(p.y + move * PADDLE_SPEED, half, GRID_H - half);
    p.move = y === p.y ? 0 : move;
    p.y = y;
  }

  /** The shot: off the paddle, along the nearest row. */
  private launch() {
    const b = this.ball;
    b.state = 'flying';
    b.timer = 0;
    b.heading = b.owner === 0 ? 1 : -1;
    b.dir = b.heading > 0 ? 1 : 3;
    b.y = rowY(clamp(Math.round((b.y - TILE / 2) / TILE), 0, ROWS - 1));
    this.sounds.push('serve');
  }

  // ---------- Pongman ----------

  private stepBall(steer: Move) {
    const b = this.ball;
    if (b.state === 'dead') {
      // A moment of nothing, then the other side has him.
      if (++b.timer >= DEATH_FRAMES) {
        const other = (1 - b.owner) as Side;
        this.ball = this.newBall(other);
        this.ball.rally = 0;
      }
      return;
    }
    if (b.state === 'held') {
      if (++b.timer >= HOLD_FRAMES) this.launch();
      return;
    }
    let left = b.speed;
    // Move centre to centre so turns land on the grid.
    while (left > 0) {
      const horizontal = b.dir === 1 || b.dir === 3;
      let dist: number;
      if (horizontal) {
        const c = DX[b.dir] > 0 ? Math.ceil((b.x - TILE / 2 + 0.01) / TILE) : Math.floor((b.x - TILE / 2 - 0.01) / TILE);
        dist = Math.abs(colX(c) - b.x);
      } else {
        const r = DY[b.dir] > 0 ? Math.ceil((b.y - TILE / 2 + 0.01) / TILE) : Math.floor((b.y - TILE / 2 - 0.01) / TILE);
        dist = Math.abs(rowY(r) - b.y);
      }
      // A centre a hair's breadth away counts as reached, or rounding can carry him past it.
      if (dist > left + 1e-6) {
        b.x += DX[b.dir] * left;
        b.y += DY[b.dir] * left;
        left = 0;
      } else {
        b.x += DX[b.dir] * dist;
        b.y += DY[b.dir] * dist;
        left -= dist;
        this.atCentre(steer);
      }
      if (this.bounce()) break;
      if (this.eat()) break;
      if (this.reachPaddle()) break;
    }
    b.x = clamp(b.x, -BALL_R - 2, 256 + BALL_R + 2);
    b.y = clamp(b.y, rowY(0), rowY(ROWS - 1));
  }

  /** Which way he goes from a crossing, given the steerer's input: never straight back. */
  turnFor(c: number, r: number, dir: Dir, heading: 1 | -1, steer: Move): Dir {
    const open = (d: Dir) => this.passable(c + DX[d], r + DY[d]);
    const flat: Dir = heading > 0 ? 1 : 3;
    const back = ((dir + 2) % 4) as Dir;
    if (steer) {
      const want: Dir = steer < 0 ? 0 : 2;
      if (want !== back && open(want)) return want;
    }
    if (flat !== back && open(flat)) return flat;
    if (open(dir)) return dir;
    // Nowhere forward: any way but back, away from the goal if need be.
    for (const d of [0, 2, (flat + 2) % 4] as Dir[]) if (d !== back && open(d)) return d;
    return back;
  }

  private atCentre(steer: Move) {
    const b = this.ball;
    const c = Math.round((b.x - TILE / 2) / TILE), r = Math.round((b.y - TILE / 2) / TILE);
    b.x = colX(c);
    b.y = rowY(r);
    // In the lanes he only ever flies straight.
    if (c < FIELD_C0 || c > FIELD_C1) return;
    b.dir = this.turnFor(c, r, b.dir, b.heading, steer);
    // Out of the maze he goes wherever he is pointed, even back the way he came: catch him or
    // it is the other side's goal.
    if ((c === FIELD_C0 && b.dir === 3) || (c === FIELD_C1 && b.dir === 1)) b.heading = b.dir === 1 ? 1 : -1;
  }

  /** Shot into the maze wall: back he comes. */
  private bounce() {
    const b = this.ball;
    if (b.dir !== 1 && b.dir !== 3) return false;
    const r = rowOf(b.y);
    // He may touch the wall before he turns; the lanes are narrow.
    const entering = b.dir === 1 && b.x < colX(FIELD_C0) && b.x + 2 > FIELD_C0 * TILE ? FIELD_C0 : b.dir === 3 && b.x > colX(FIELD_C1) && b.x - 2 < (FIELD_C1 + 1) * TILE ? FIELD_C1 : -1;
    if (entering < 0 || this.passable(entering, r)) return false;
    b.x = entering === FIELD_C0 ? FIELD_C0 * TILE - 2 : (FIELD_C1 + 1) * TILE + 2;
    b.heading = -b.heading as 1 | -1;
    b.dir = b.heading > 0 ? 1 : 3;
    this.sounds.push('wall');
    this.burst(b.x + (entering === FIELD_C0 ? BALL_R : -BALL_R), b.y, '#3858fc', 4);
    return true;
  }

  /** Dots and aliens under him. True when the field was cleared, which ends the step. */
  private eat() {
    const b = this.ball;
    const c = colOf(b.x), r = rowOf(b.y);
    if (c < FIELD_C0 || c > FIELD_C1 || r < 0 || r >= ROWS) return false;
    if (Math.abs(b.x - colX(c)) > 4 || Math.abs(b.y - rowY(r)) > 4) return false;
    const cell = cellAt(c, r);
    const d = this.dots[cell];
    if (d) {
      this.dots[cell] = 0;
      this.dotsLeft--;
      if (d === PELLET) {
        this.score(b.owner, 50, PULL.pellet);
        this.power = POWER_FRAMES;
        this.chain = 0;
        for (const g of this.ghosts) if (g.state === 'roam') g.dir = ((g.dir + 2) % 4) as Dir;
        this.sounds.push('power');
        this.fire(b.owner, 4);
      } else {
        this.score(b.owner, 10, PULL.dot);
        this.sounds.push('waka');
        this.fire(b.owner, 1);
      }
      if (this.dotsLeft === 0) {
        this.score(b.owner, 1000, PULL.cleared);
        this.popup(b.x, b.y, 'MAZE CLEARED 1000', SIDE_COLORS[b.owner]);
        this.dots.set(this.layout.dots);
        this.countDots();
        this.sounds.push('cleared');
        return true;
      }
    }
    const k = this.tokens.findIndex((t) => t.cell === cell);
    if (k >= 0) {
      this.tokens.splice(k, 1);
      this.score(b.owner, 100, PULL.alien);
      this.startInvasion((1 - b.owner) as Side);
    }
    return false;
  }

  /** In a lane: caught by the paddle, or past it for a goal. True when the rally ended. */
  private reachPaddle() {
    const b = this.ball;
    const side: Side = b.x < 128 ? 0 : 1;
    const towards = (side === 0 && b.heading < 0) || (side === 1 && b.heading > 0);
    if (!towards) return false;
    const p = this.paddles[side];
    const face = FACE_X[side];
    const reached = side === 0 ? b.x - BALL_R <= face : b.x + BALL_R >= face;
    if (reached && Math.abs(b.x - this.heldX(side)) < b.speed + 1 && Math.abs(b.y - p.y) <= PADDLE_H / 2 + BALL_R - 1) {
      // Caught. He sticks to the paddle, then is shot back, a little faster.
      b.state = 'held';
      b.owner = side;
      b.timer = 0;
      b.rally++;
      b.hold = clamp(b.y - p.y, -(PADDLE_H / 2 - 3), PADDLE_H / 2 - 3);
      b.speed = Math.min(this.opt.speed * 2.3, b.speed + 0.1);
      b.x = this.heldX(side);
      b.y = p.y + b.hold;
      b.dir = side === 0 ? 1 : 3;
      this.bestRally = Math.max(this.bestRally, b.rally);
      this.sounds.push('bat');
      this.burst(b.x, b.y, SIDE_COLORS[side], 6);
      return true;
    }
    if (b.x < -BALL_R || b.x > 256 + BALL_R) {
      this.goal((1 - side) as Side);
      return true;
    }
    return false;
  }

  private goal(scorer: Side) {
    this.goals[scorer]++;
    this.score(scorer, 500, PULL.goal);
    this.lastGoal = scorer;
    this.server = (1 - scorer) as Side;
    this.state = this.state === 'over' ? 'over' : 'goal';
    this.stateTimer = 0;
    this.shake = 12;
    this.sounds.push('goal');
    this.burst(scorer === 0 ? 236 : 20, this.ball.y, SIDE_COLORS[scorer], 18);
  }

  /** After a goal: the loser serves, the ball starts slow again. */
  private nextPoint() {
    this.ball = this.newBall(this.server);
    this.state = 'ready';
    this.stateTimer = 0;
  }

  /** Points for the record, and a pull on the bar. */
  private score(side: Side, n: number, pull: number) {
    this.points[side] = Math.max(0, this.points[side] + n);
    this.lead = clamp(this.lead + (side === 0 ? pull : -pull), -this.limit, this.limit);
    if (Math.abs(this.lead) >= this.limit && this.state !== 'over') {
      this.state = 'over';
      this.stateTimer = 0;
    }
  }

  // ---------- ghosts ----------

  private stepGhosts() {
    const b = this.ball;
    for (const g of this.ghosts) {
      if (g.state === 'home') {
        if (--g.wait <= 0) g.state = 'leaving';
        continue;
      }
      if (g.state === 'leaving' || g.state === 'eyes') {
        // Out through the door, or back in through it: they float straight there.
        const [tx, ty] = g.state === 'eyes' ? [HOUSE_X, HOUSE_Y] : [HOUSE_X, DOOR_Y];
        const d = Math.hypot(tx - g.x, ty - g.y);
        const s = 1.4;
        if (d <= s) {
          g.x = tx;
          g.y = ty;
          if (g.state === 'eyes') {
            g.state = 'home';
            g.wait = 300;
          } else {
            g.state = 'roam';
            g.dir = this.rng() < 0.5 ? 1 : 3;
            g.x = colX(g.dir === 1 ? FIELD_C0 + 12 : FIELD_C0 + 11);
          }
        } else {
          g.x += ((tx - g.x) / d) * s;
          g.y += ((ty - g.y) / d) * s;
        }
        continue;
      }
      this.moveGhost(g, this.power > 0 ? 0.45 : 0.55 + Math.min(0.3, this.playTime / 12000));
      if (b.state !== 'flying') continue;
      if (Math.hypot(g.x - b.x, g.y - b.y) >= GHOST_R + 1) continue;
      if (this.power > 0) {
        const pts = 200 << Math.min(3, this.chain++);
        this.score(b.owner, pts, PULL.ghost);
        this.ghostsEaten[b.owner]++;
        this.popup(g.x, g.y, String(pts), '#3cbcfc');
        g.state = 'eyes';
        this.sounds.push('eatGhost');
      } else this.die();
    }
  }

  /** Caught by a ghost: he is gone, and the other side gets him. */
  private die() {
    const b = this.ball;
    b.state = 'dead';
    b.timer = 0;
    this.score(b.owner, -100, PULL.death);
    this.popup(b.x, b.y, '-100', SIDE_COLORS[b.owner]);
    this.burst(b.x, b.y, SIDE_COLORS[b.owner], 14);
    this.shake = 6;
    this.sounds.push('die');
  }

  /** Ghosts walk the maze, turning at crossings: towards Pongman, or away when frightened. */
  private moveGhost(g: Ghost, speed: number) {
    let left = speed;
    while (left > 0) {
      const horizontal = g.dir === 1 || g.dir === 3;
      let dist: number;
      if (horizontal) {
        const c = g.dir === 1 ? Math.ceil((g.x - TILE / 2 + 0.01) / TILE) : Math.floor((g.x - TILE / 2 - 0.01) / TILE);
        dist = Math.abs(colX(c) - g.x);
      } else {
        const r = g.dir === 2 ? Math.ceil((g.y - TILE / 2 + 0.01) / TILE) : Math.floor((g.y - TILE / 2 - 0.01) / TILE);
        dist = Math.abs(rowY(r) - g.y);
      }
      if (dist > left + 1e-6) {
        g.x += DX[g.dir] * left;
        g.y += DY[g.dir] * left;
        return;
      }
      g.x += DX[g.dir] * dist;
      g.y += DY[g.dir] * dist;
      left -= dist;
      this.ghostTurn(g);
    }
  }

  private ghostTurn(g: Ghost) {
    const c = Math.round((g.x - TILE / 2) / TILE), r = Math.round((g.y - TILE / 2) / TILE);
    g.x = colX(c);
    g.y = rowY(r);
    // Ghosts keep to the maze; the lanes and the pen are shut to them.
    const open = (d: Dir) => {
      const nc = c + DX[d], nr = r + DY[d];
      return nc >= FIELD_C0 && nc <= FIELD_C1 && nr >= 0 && nr < ROWS && this.grid[cellAt(nc, nr)] === OPEN;
    };
    const back = ((g.dir + 2) % 4) as Dir;
    let dirs = ([0, 1, 2, 3] as Dir[]).filter((d) => d !== back && open(d));
    if (!dirs.length) dirs = [back];
    const b = this.ball;
    const inMaze = b.state === 'flying' && b.x > colX(FIELD_C0) - 4 && b.x < colX(FIELD_C1) + 4;
    const chasing = inMaze && this.rng() < (this.power > 0 ? 0.8 : 0.25 + g.id * 0.12);
    if (chasing) {
      const score = (d: Dir) => Math.hypot(colX(c + DX[d]) - b.x, rowY(r + DY[d]) - b.y);
      dirs.sort((p, q) => score(p) - score(q));
      g.dir = this.power > 0 ? dirs[dirs.length - 1] : dirs[0];
    } else g.dir = dirs[Math.floor(this.rng() * dirs.length)];
  }

  // ---------- aliens and invasions ----------

  private stepTokens() {
    for (const t of this.tokens) t.life--;
    this.tokens = this.tokens.filter((t) => t.life > 0);
    if (this.tokens.length >= MAX_TOKENS || --this.tokenTimer > 0) return;
    this.tokenTimer = TOKEN_GAP;
    // On a corridor somewhere, away from the ball.
    for (let tries = 0; tries < 30; tries++) {
      const c = FIELD_C0 + 1 + Math.floor(this.rng() * (FIELD_C1 - FIELD_C0 - 1));
      const r = Math.floor(this.rng() * ROWS);
      const cell = cellAt(c, r);
      if (this.grid[cell] !== OPEN || this.dots[cell] === PELLET || this.tokens.some((t) => t.cell === cell)) continue;
      if (Math.abs(colX(c) - this.ball.x) < 40 && Math.abs(rowY(r) - this.ball.y) < 40) continue;
      this.tokens.push({ cell, life: TOKEN_LIFE });
      this.sounds.push('token');
      return;
    }
  }

  /** The middle of a paddle, where its laser comes from. */
  private laneX(side: Side) {
    return FACE_X[side] + (side === 0 ? -PADDLE_W / 2 : PADDLE_W / 2);
  }

  /** Six invaders drop into a lane and bomb the paddle there; it fires back by itself. */
  private startInvasion(side: Side) {
    const there = this.invasions.find((i) => i.side === side);
    if (there) {
      // Reinforcements join the ones already there.
      for (const i of there.invaders) if (!i.alive) {
        i.alive = true;
        i.hp = INVADER_HP;
      }
      this.sounds.push('invade');
      return;
    }
    const x0 = this.laneX(side) - INVADER_W / 2;
    const invaders: Invader[] = [];
    for (let row = 0; row < INVADER_COUNT; row++) invaders.push({ x: x0, y: -INVADER_H - 2 - row * (INVADER_H + 4), alive: true, hp: INVADER_HP, flash: 0 });
    this.invasions.push({ side, invaders, vx: 0.3, bombs: [], lasers: [] });
    this.popup(side === 0 ? 40 : 216, 16, 'INVASION!', '#58d854');
    this.sounds.push('invade');
  }

  private stepInvasion(inv: Invasion) {
    const p = this.paddles[inv.side];
    const mid = this.laneX(inv.side) - INVADER_W / 2;
    // The column sways over the paddle and sinks.
    const x = inv.invaders[0].x + inv.vx;
    if (x < mid - 6 || x > mid + 6) inv.vx = -inv.vx;
    for (const i of inv.invaders) {
      i.x += inv.vx;
      i.y += 0.12;
      if (i.flash > 0) i.flash--;
      if (i.alive && i.y > GRID_H) i.alive = false;
      if (i.alive && i.y > 0 && this.rng() < 1 / 170) inv.bombs.push({ x: i.x + INVADER_W / 2 + (this.rng() < 0.5 ? -3 : 3), y: i.y + INVADER_H });
    }
    // Bombs fall; one on the paddle stuns it.
    const px0 = FACE_X[inv.side] - (inv.side === 0 ? PADDLE_W : 0);
    inv.bombs = inv.bombs.filter((bm) => {
      bm.y += 1.3;
      if (bm.x >= px0 - 1 && bm.x <= px0 + PADDLE_W && bm.y >= p.y - PADDLE_H / 2 && bm.y <= p.y + PADDLE_H / 2) {
        p.stun = 60;
        this.shake = 4;
        this.sounds.push('bomb');
        this.burst(bm.x, bm.y, '#fcfcfc', 5);
        return false;
      }
      return bm.y < GRID_H;
    });
    inv.lasers = inv.lasers.filter((l) => {
      l.y -= 3;
      for (const i of inv.invaders) {
        if (!i.alive || l.x < i.x || l.x > i.x + INVADER_W || l.y < i.y || l.y > i.y + INVADER_H) continue;
        i.flash = 10;
        if (--i.hp > 0) {
          this.sounds.push('zap');
          return false;
        }
        i.alive = false;
        this.score(inv.side, 50, PULL.shot);
        this.shots[inv.side]++;
        this.popup(i.x + INVADER_W / 2, i.y, '50', '#58d854');
        this.burst(i.x + INVADER_W / 2, i.y + INVADER_H / 2, '#58d854', 8);
        this.sounds.push('zap');
        return false;
      }
      return l.y > -8;
    });
  }

  /** The paddle fires only when its Pongman eats: a laser a dot, while invaders are up there. */
  private fire(side: Side, shots: number) {
    const inv = this.invasions.find((i) => i.side === side);
    if (!inv || !inv.invaders.some((i) => i.alive)) return;
    const p = this.paddles[side];
    for (let k = 0; k < shots; k++) inv.lasers.push({ x: this.laneX(side), y: p.y - PADDLE_H / 2 - k * 6 });
    this.sounds.push('laser');
  }

  // ---------- the gorilla ----------

  /** Now and then he climbs up at the bottom, beats his chest, and lobs barrels at the paddles. */
  private stepKong() {
    const k = this.kong;
    if (!k) {
      if (--this.kongTimer > 0) return;
      this.kongTimer = KONG_GAP[0] + this.rng() * (KONG_GAP[1] - KONG_GAP[0]);
      this.kong = { phase: 'rising', up: 0, timer: 0, thrown: 0, next: this.rng() < 0.5 ? 0 : 1 };
      this.sounds.push('kong');
      return;
    }
    k.timer++;
    if (k.phase === 'rising') {
      k.up = Math.min(KONG_UP, k.up + 0.8);
      if (k.up >= KONG_UP) {
        k.phase = 'throwing';
        k.timer = 0;
      }
    } else if (k.phase === 'throwing') {
      if (k.timer % 55 === 30) {
        this.throwBarrel(k.next);
        k.next = (1 - k.next) as Side;
        if (++k.thrown >= KONG_THROWS) {
          k.phase = 'sinking';
          k.timer = 0;
        }
      }
    } else if (k.timer > 45) {
      k.up -= 0.8;
      if (k.up <= 0) this.kong = null;
    }
  }

  /** A lob from his hands to a lane: at the paddle, or wherever. */
  private throwBarrel(side: Side) {
    const p = this.paddles[side];
    const x0 = 128, y0 = GRID_H - KONG_UP + 4;
    const tx = this.laneX(side);
    const ty = this.rng() < 0.6 ? clamp(p.y + (this.rng() - 0.5) * 16, 12, GRID_H - 12) : 12 + this.rng() * (GRID_H - 24);
    const T = BARREL_FLIGHT;
    this.barrels.push({ x: x0, y: y0, vx: (tx - x0) / T, vy: (ty - y0) / T - 0.5 * GRAVITY * T, t: 0, flight: T, tx, ty, side });
    this.sounds.push('throw');
  }

  private stepBarrels() {
    this.barrels = this.barrels.filter((b) => {
      b.x += b.vx;
      b.y += b.vy;
      b.vy += GRAVITY;
      if (++b.t < b.flight) return true;
      // Down it comes: on the paddle, or in pieces on the ground.
      const p = this.paddles[b.side];
      if (Math.abs(b.ty - p.y) <= PADDLE_H / 2 + 5) {
        p.stun = 45;
        this.score(b.side, -50, PULL.barrel);
        this.popup(b.tx, b.ty, '-50', SIDE_COLORS[b.side]);
        this.shake = 5;
        this.sounds.push('barrel');
        this.burst(b.tx, b.ty, '#c87828', 10);
      } else this.burst(b.tx, b.ty, '#c87828', 5);
      return false;
    });
  }

  // ---------- effects ----------

  popup(x: number, y: number, text: string, color: string) {
    this.popups.push({ x, y, text, color, life: 70 });
  }

  private burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, v = 0.5 + this.rng() * 1.5;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 20 + Math.floor(this.rng() * 20), color, size: this.rng() < 0.3 ? 2 : 1 });
    }
  }

  private stepFx() {
    if (this.shake > 0) this.shake--;
    for (const p of this.popups) {
      p.life--;
      p.y -= 0.25;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}
