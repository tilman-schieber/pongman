// The CPU paddle: it tracks the ball with a human-ish delay, shoots at an opening in the maze,
// and when it steers it goes for dots and aliens, keeps clear of ghosts, and aims for the gap
// past your paddle.
import { Cpu } from './modes';
import { World, Side, Move, Dir, DX, DY, FIELD_C0, FIELD_C1, TILE, GRID_H, PADDLE_H, cellAt, rowY } from './world';

export class Brain {
  private target = GRID_H / 2;
  private look = 0;
  private steer: Move = 0;
  private steerFor = 0;
  /** Fractional paddle speed is paid out over frames. */
  private owed = 0;

  constructor(private side: Side, private cpu: Cpu) {}

  decide(w: World): Move {
    const b = w.ball;
    const p = w.paddles[this.side];
    const mine = b.owner === this.side;
    const coming = (this.side === 0 && b.heading < 0) || (this.side === 1 && b.heading > 0);
    // Steering: while he flies away from me, my paddle's moves are his turns.
    if (b.state === 'flying' && mine && !coming) return this.drive(w);

    if (--this.look <= 0) {
      this.look = this.cpu.react;
      const err = (w.rng() * 2 - 1) * this.cpu.error;
      if (b.state === 'flying' && coming) this.target = b.y + err;
      else if (b.state === 'held' && mine) this.target = this.aim(w, p.y + b.hold) - b.hold + err;
      else this.target = GRID_H / 2 + err * 2;
    }
    const dodge = this.dodge(w);
    if (dodge) return dodge;
    return this.towards(p.y, this.target);
  }

  /** With the ball on the paddle: line up with an opening, the nearest one usually. */
  private aim(w: World, y: number) {
    if (w.rng() > this.cpu.wit) return y;
    const rows = w.layout.openings.map(rowY);
    rows.sort((a, b) => Math.abs(a - y) - Math.abs(b - y));
    return rows[w.rng() < 0.7 ? 0 : Math.floor(w.rng() * rows.length)];
  }

  /** Moves the paddle at the CPU's share of a human's speed. */
  private towards(y: number, target: number): Move {
    const d = target - y;
    if (Math.abs(d) < 2) return 0;
    this.owed += this.cpu.speed;
    if (this.owed < 1) return 0;
    this.owed -= 1;
    return d < 0 ? -1 : 1;
  }

  /** A bomb or a barrel about to land on the paddle: step aside. */
  private dodge(w: World): Move {
    if (w.rng() > this.cpu.wit) return 0;
    const p = w.paddles[this.side];
    for (const b of w.barrels) {
      if (b.side !== this.side || b.t < b.flight - 45 || Math.abs(b.ty - p.y) > PADDLE_H / 2 + 8) continue;
      return b.ty > p.y ? -1 : 1;
    }
    const inv = w.invasions.find((i) => i.side === this.side);
    if (!inv) return 0;
    for (const bm of inv.bombs) {
      if (bm.y > p.y - PADDLE_H / 2 - 24 && bm.y < p.y && Math.abs(bm.x - (this.side === 0 ? 10 : 246)) < 4) return p.y > GRID_H / 2 ? -1 : 1;
    }
    return 0;
  }

  /** Choosing turns for Pongman: each possible input is judged by the way it would send him. */
  private drive(w: World): Move {
    if (--this.steerFor > 0) return this.steer;
    this.steerFor = 5;
    const b = w.ball;
    const c = Math.round((b.x - TILE / 2) / TILE), r = Math.round((b.y - TILE / 2) / TILE);
    if (c < FIELD_C0 || c > FIELD_C1) return (this.steer = 0);
    if (w.rng() > this.cpu.wit) {
      // Half-hearted: wander a bit.
      this.steer = w.rng() < 0.3 ? (w.rng() < 0.5 ? -1 : 1) : 0;
      return this.steer;
    }
    let best = -Infinity;
    for (const s of [0, -1, 1] as Move[]) {
      const d = w.turnFor(c, r, b.dir, b.heading, s);
      const v = this.worth(w, c, r, d) + w.rng() * 4;
      if (v > best) {
        best = v;
        this.steer = s;
      }
    }
    return this.steer;
  }

  /** What lies the next few cells along a direction. */
  private worth(w: World, c: number, r: number, d: Dir) {
    const b = w.ball;
    const flat: Dir = b.heading > 0 ? 1 : 3;
    let v = d === flat ? 6 : d === ((flat + 2) % 4) ? -8 : 0;
    for (let k = 1; k <= 6; k++) {
      const nc = c + DX[d] * k, nr = r + DY[d] * k;
      if (!w.passable(nc, nr)) break;
      if (nc < FIELD_C0 || nc > FIELD_C1) {
        // Out into the lane: good if the far paddle is elsewhere.
        const op = w.paddles[1 - this.side];
        v += Math.abs(op.y - rowY(nr)) > PADDLE_H / 2 + 8 ? 30 : -10;
        break;
      }
      const cell = cellAt(nc, nr);
      if (w.dots[cell]) v += 3;
      if (w.tokens.some((t) => t.cell === cell)) v += 25;
      for (const g of w.ghosts) {
        if (g.state !== 'roam') continue;
        const gc = Math.round((g.x - TILE / 2) / TILE), gr = Math.round((g.y - TILE / 2) / TILE);
        if (gc === nc && gr === nr) v += w.power > 0 ? 20 : -60 + k * 6;
      }
    }
    return v;
  }
}
