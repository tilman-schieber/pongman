import { Game, MENU, MUSIC_NAMES, NAME_LEN } from './game';
import { World, Ghost, Ball, Side, DX, DY, SIDE_COLORS, COLS, ROWS, TILE, FIELD_C0, FIELD_C1, FACE_X, PADDLE_W, PADDLE_H, BALL_R, HOLD_FRAMES, DEATH_FRAMES, GRID_H, PELLET, cellAt, cx, cy, colX, rowY } from './world';
import { WALL, DOOR, HOUSE } from './maze';
import { CPUS, PLAYERS, GOALS, SPEED_NAMES } from './modes';
import { MAX_SCORES } from './scores';
import { HELP_PAGES, wrapText } from './help';
import { drawText, drawTextCentered, textWidth } from './font';
import { Ctx, W, H, WHITE, RED, GREY, LIGHT, DARK, YELLOW, GOLD, mix, drawBox, drawSprite, pad } from './draw';

export { W, H };

/** The maze grid starts here on screen; the HUD is above it. */
export const GRID_Y = 28;
const PONGMAN = '#f8d838';
const SCARED = '#2038ec';
const DOT_COLOR = '#fcd8a8';
const WALL_COLOR = '#3858fc';
const GHOST = '#e8e8f0';
const ALIEN = '#58d854';

// ---------- sprites ----------

const GHOST_BODY = ['....####....', '..########..', '.##########.', '.##########.', '############', '############', '############', '############', '############', '############'];
const GHOST_FEET = [
  ['##.##..##.##', '#...#..#...#'],
  ['####.##.####', '.##..##..##.'],
];
const INVADER = [
  ['.#....#.', '..#..#..', '.######.', '##.##.##', '########', '#.####.#', '#.#..#.#', '...##...'],
  ['.#....#.', '#.#..#.#', '#.######', '###.##.#', '.#######', '..####..', '.#.##.#.', '#......#'],
];

/** Pongman, 12 pixels across, centred on (x, y). `gape` is the mouth's half-angle in radians. */
function drawPac(ctx: Ctx, x: number, y: number, dir: number, gape: number, color = PONGMAN, eye = true) {
  const ox = Math.round(x) - 6, oy = Math.round(y) - 6;
  ctx.fillStyle = color;
  for (let py = 0; py < 12; py++)
    for (let px = 0; px < 12; px++) {
      const dx = px - 5.5, dy = py - 5.5;
      const r = Math.hypot(dx, dy);
      if (r > 6.1) continue;
      if (gape > 0 && Math.acos(Math.max(-1, Math.min(1, (dx * DX[dir] + dy * DY[dir]) / r))) < gape) continue;
      ctx.fillRect(ox + px, oy + py, 1, 1);
    }
  if (!eye) return;
  const [ex, ey] = [[3, 4], [6, 2], [3, 6], [5, 2]][dir];
  ctx.fillStyle = '#000';
  ctx.fillRect(ox + ex, oy + ey, 2, 2);
}

function drawGhostEyes(ctx: Ctx, ox: number, oy: number, dir: number) {
  for (const k of [0, 1]) {
    const ex = ox + 2 + k * 5 + DX[dir], ey = oy + 3 + DY[dir];
    ctx.fillStyle = WHITE;
    ctx.fillRect(ex, ey, 3, 4);
    ctx.fillStyle = '#2038ec';
    ctx.fillRect(ex + (DX[dir] > 0 ? 1 : DX[dir] < 0 ? 0 : 1 - k), ey + 1 + DY[dir], 2, 2);
  }
}

function drawScaredFace(ctx: Ctx, ox: number, oy: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(ox + 3, oy + 4, 2, 2);
  ctx.fillRect(ox + 7, oy + 4, 2, 2);
  for (let x = 2; x < 10; x++) ctx.fillRect(ox + x, oy + 8 - (x % 2), 1, 1);
}

function drawGhost(ctx: Ctx, w: World, g: Ghost, frame: number) {
  const ox = Math.round(g.x) - 6, oy = GRID_Y + Math.round(g.y) - 6;
  if (g.state === 'eyes') return drawGhostEyes(ctx, ox, oy, g.dir);
  const scared = w.power > 0 && g.state === 'roam';
  const ending = scared && w.power < 120 && (frame >> 3) % 2 === 0;
  const body = scared ? (ending ? WHITE : SCARED) : GHOST;
  drawSprite(ctx, [...GHOST_BODY, ...GHOST_FEET[(frame >> 3) % 2]], ox, oy, { '#': body });
  if (scared) drawScaredFace(ctx, ox, oy, ending ? RED : DOT_COLOR);
  else {
    // Pale ghosts: dark eyes.
    for (const k of [0, 1]) {
      const ex = ox + 2 + k * 5 + DX[g.dir], ey = oy + 3 + DY[g.dir];
      ctx.fillStyle = '#383838';
      ctx.fillRect(ex, ey, 3, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(ex + (DX[g.dir] > 0 ? 1 : DX[g.dir] < 0 ? 0 : 1 - k), ey + 1 + DY[g.dir], 2, 2);
    }
  }
}

function drawBall(ctx: Ctx, w: World, b: Ball, frame: number) {
  if (w.state === 'goal' || b.state === 'dead') return;
  const color = SIDE_COLORS[b.owner];
  const x = b.x, y = GRID_Y + b.y;
  if (b.state === 'held') {
    // Stuck to the paddle; a ring closes around him until the shot.
    drawPac(ctx, x, y, b.dir, 0.3, color);
    const t = b.timer / HOLD_FRAMES;
    const r = 11;
    ctx.fillStyle = t > 0.85 && (frame >> 1) % 2 ? WHITE : LIGHT;
    const n = Math.round(t * 32);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k / 32) * Math.PI * 2 * (b.owner === 0 ? 1 : -1);
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
    }
    return;
  }
  const chew = [0.15, 0.55, 0.95, 0.55][(frame >> 2) % 4];
  // A blur behind him when he is fast.
  if (b.speed > w.opt.speed * 1.4) drawPac(ctx, x - DX[b.dir] * 5, y - DY[b.dir] * 5, b.dir, chew, mix(color, '#000000', 0.65), false);
  drawPac(ctx, x, y, b.dir, chew, color);
}

function drawPaddle(ctx: Ctx, w: World, side: Side, frame: number) {
  const p = w.paddles[side];
  const x = side === 0 ? FACE_X[0] - PADDLE_W : FACE_X[1];
  const y = GRID_Y + Math.round(p.y - PADDLE_H / 2);
  const color = SIDE_COLORS[side];
  const stunned = p.stun > 0 && (frame >> 1) % 2 === 0;
  ctx.fillStyle = stunned ? GREY : color;
  ctx.fillRect(x, y, PADDLE_W, PADDLE_H);
  // A lit edge on the face, a shaded back.
  ctx.fillStyle = stunned ? LIGHT : mix(color, '#ffffff', 0.5);
  ctx.fillRect(side === 0 ? x + PADDLE_W - 1 : x, y, 1, PADDLE_H);
  ctx.fillStyle = stunned ? DARK : mix(color, '#000000', 0.45);
  ctx.fillRect(side === 0 ? x : x + PADDLE_W - 1, y, 1, PADDLE_H);
  ctx.fillRect(x, y + PADDLE_H - 1, PADDLE_W, 1);
}

// ---------- the maze picture ----------

const mazeCache = new WeakMap<Uint8Array, HTMLCanvasElement>();
/** Walls are drawn this much thinner than their tiles, so the corridors look wider. */
const INSET = 3;
const DISC: [number, number][] = [];
for (let dy = -INSET; dy <= INSET; dy++) for (let dx = -INSET; dx <= INSET; dx++) if (dx * dx + dy * dy <= INSET * INSET) DISC.push([dx, dy]);

/** The walls as outlined shapes. */
function mazeImage(w: World) {
  let img = mazeCache.get(w.grid);
  if (img) return img;
  const clampY = (v: number) => Math.max(0, Math.min(ROWS - 1, v));
  // Beyond the top and bottom the maze goes on as it ends, so the border stays shut; beyond the
  // sides it is open, so the openings onto the lanes stay open.
  const wall = (px: number, py: number) => {
    const c = px >> 3;
    if (c < FIELD_C0 || c > FIELD_C1) return false;
    const g = w.grid[cellAt(c, clampY(py >> 3))];
    return g === WALL || g === HOUSE || g === DOOR;
  };
  const BW = COLS * TILE, BH = GRID_H;
  const solid = new Uint8Array(BW * BH);
  for (let py = 0; py < BH; py++)
    for (let px = 0; px < BW; px++) solid[py * BW + px] = DISC.every(([dx, dy]) => wall(px + dx, py + dy)) ? 1 : 0;
  const at = (px: number, py: number) => solid[Math.max(0, Math.min(BH - 1, py)) * BW + Math.max(0, Math.min(BW - 1, px))];

  img = document.createElement('canvas');
  img.width = BW;
  img.height = BH;
  const g = img.getContext('2d')!;
  const fill = mix(WALL_COLOR, '#000000', 0.82);
  for (let py = 0; py < BH; py++)
    for (let px = 0; px < BW; px++) {
      if (!at(px, py)) continue;
      const edge = !at(px - 1, py) || !at(px + 1, py) || !at(px, py - 1) || !at(px, py + 1);
      g.fillStyle = edge ? WALL_COLOR : fill;
      g.fillRect(px, py, 1, 1);
    }
  // The pen is hollow, with a pink door.
  g.fillStyle = '#000';
  for (let t = 0; t < w.grid.length; t++) if (w.grid[t] === HOUSE) g.fillRect(cx(t) * TILE, cy(t) * TILE, TILE, TILE);
  g.fillStyle = '#f8b8d8';
  for (let t = 0; t < w.grid.length; t++) if (w.grid[t] === DOOR) g.fillRect(cx(t) * TILE, cy(t) * TILE + 3, TILE, 2);
  mazeCache.set(w.grid, img);
  return img;
}

// ---------- the court ----------

export function drawCourt(ctx: Ctx, w: World, frame: number, still = false) {
  ctx.drawImage(mazeImage(w), 0, GRID_Y);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, GRID_Y, W, GRID_H);
  ctx.clip();
  ctx.fillStyle = DOT_COLOR;
  for (let c = 0; c < w.dots.length; c++) {
    const d = w.dots[c];
    if (!d) continue;
    const x = colX(cx(c)) - 4, y = GRID_Y + rowY(cy(c)) - 4;
    if (d !== PELLET) ctx.fillRect(x + 3, y + 3, 2, 2);
    else if ((frame >> 3) % 2 || still) {
      ctx.fillRect(x + 2, y + 1, 4, 6);
      ctx.fillRect(x + 1, y + 2, 6, 4);
    }
  }
  if (still) {
    ctx.restore();
    return;
  }

  for (const t of w.tokens) {
    if (t.life < 180 && (frame >> 2) % 2) continue;
    const x = colX(cx(t.cell)) - 4, y = GRID_Y + rowY(cy(t.cell)) - 4;
    drawSprite(ctx, INVADER[(frame >> 4) % 2], x, y, { '#': ALIEN });
  }
  for (const g of w.ghosts) if (g.state !== 'home' || (frame >> 3) % 2) drawGhost(ctx, w, g, frame);
  drawBall(ctx, w, w.ball, frame);
  // His death: the shooter's colour flashing out.
  if (w.ball.state === 'dead' && w.ball.timer < DEATH_FRAMES / 2) {
    const t = w.ball.timer / (DEATH_FRAMES / 2);
    const r = Math.round(BALL_R + t * 10);
    ctx.fillStyle = (frame >> 1) % 2 ? SIDE_COLORS[w.ball.owner] : WHITE;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ctx.fillRect(Math.round(w.ball.x + Math.cos(a) * r), Math.round(GRID_Y + w.ball.y + Math.sin(a) * r), 1, 1);
    }
  }
  for (const p of w.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(GRID_Y + p.y), p.size, p.size);
  }
  ctx.restore();

  drawPaddle(ctx, w, 0, frame);
  drawPaddle(ctx, w, 1, frame);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, GRID_Y - 4, W, GRID_H + 4);
  ctx.clip();
  for (const inv of w.invasions) {
    for (const i of inv.invaders) if (i.alive) drawSprite(ctx, INVADER[(frame >> 4) % 2], Math.round(i.x), GRID_Y + Math.round(i.y), { '#': ALIEN });
    ctx.fillStyle = WHITE;
    for (const b of inv.bombs) ctx.fillRect(Math.round(b.x) + ((frame >> 1) % 2), GRID_Y + Math.round(b.y), 1, 3);
    ctx.fillStyle = SIDE_COLORS[inv.side];
    for (const l of inv.lasers) ctx.fillRect(Math.round(l.x), GRID_Y + Math.round(l.y), 1, 4);
  }
  ctx.restore();

  for (const p of w.popups) {
    if (p.life < 15 && (frame >> 1) % 2) continue;
    const tw = textWidth(p.text);
    const x = Math.max(2, Math.min(W - tw - 2, Math.round(p.x - tw / 2)));
    const y = Math.max(GRID_Y + 2, Math.min(H - 10, Math.round(GRID_Y + p.y - 10)));
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, tw + 2, 9);
    drawText(ctx, p.text, x, y, p.color);
  }
}

// ---------- in play ----------

export function render(ctx: Ctx, game: Game, frame: number) {
  ctx.save();
  const shake = game.world?.shake ?? 0;
  if (shake > 0 && game.phase === 'play') ctx.translate(frame % 2 ? 1 : -1, Math.min(2, shake >> 2) * (frame % 4 < 2 ? 1 : -1));
  switch (game.phase) {
    case 'title':
      renderTitle(ctx, game, frame);
      break;
    case 'entry':
    case 'scores':
      renderScores(ctx, game, frame);
      break;
    case 'help':
      renderHelp(ctx, game, frame);
      break;
    default:
      renderPlay(ctx, game, frame);
  }
  ctx.restore();
}

function banner(ctx: Ctx, text: string, color: string, y = GRID_Y + GRID_H / 2 - 4) {
  ctx.fillStyle = '#000';
  ctx.fillRect(128 - textWidth(text) / 2 - 3, y - 2, textWidth(text) + 6, 11);
  drawTextCentered(ctx, text, 128, y, color);
}

function renderPlay(ctx: Ctx, game: Game, frame: number) {
  const w = game.world!;
  ctx.fillStyle = '#000';
  ctx.fillRect(-2, -2, W + 4, H + 4);
  drawCourt(ctx, w, frame);
  drawHud(ctx, game, w, frame);

  if (game.phase === 'play' && game.paused) drawPause(ctx, game, w);
  else if (game.phase === 'play' && w.state === 'ready' && w.playTime === 0) banner(ctx, 'READY!', YELLOW, GRID_Y + 2);
  else if (game.phase === 'play' && w.state === 'goal') banner(ctx, `GOAL ${game.sideName(w.lastGoal)}!`, SIDE_COLORS[w.lastGoal], GRID_Y + 2);
  if (game.phase === 'over') drawOver(ctx, game, w, frame);
}

/** The tug of war: a bar with Pongman on it, pulled towards whoever is ahead. */
function drawBar(ctx: Ctx, w: World, frame: number) {
  const x0 = 72, x1 = 184, y = 15;
  ctx.fillStyle = DARK;
  ctx.fillRect(x0, y, x1 - x0, 3);
  for (const x of [x0, 128, x1 - 1]) ctx.fillRect(x, y - 2, 1, 7);
  const t = w.lead / w.limit;
  const mx = Math.round(128 + t * (x1 - x0) / 2);
  ctx.fillStyle = t > 0 ? SIDE_COLORS[0] : SIDE_COLORS[1];
  ctx.fillRect(Math.min(128, mx), y + 1, Math.abs(mx - 128), 1);
  const owner = w.ball.owner;
  const gape = w.state === 'over' ? 0 : [0.2, 0.6, 0.95, 0.6][(frame >> 3) % 4];
  // He is drawn smaller here: 8 across.
  ctx.fillStyle = SIDE_COLORS[owner];
  for (let py = 0; py < 8; py++)
    for (let px = 0; px < 8; px++) {
      const dx = px - 3.5, dy = py - 3.5;
      const r = Math.hypot(dx, dy);
      if (r > 4.1) continue;
      const facing = owner === 0 ? 1 : -1;
      if (gape > 0 && Math.acos(Math.max(-1, Math.min(1, (dx * facing) / r))) < gape) continue;
      ctx.fillRect(mx - 4 + px, y - 2 + py, 1, 1);
    }
}

function drawHud(ctx: Ctx, game: Game, w: World, frame: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, GRID_Y);
  const steer = w.ball.owner;
  for (const side of [0, 1] as Side[]) {
    const name = game.sideName(side);
    const score = pad(w.points[side], 6);
    const color = SIDE_COLORS[side];
    const bright = steer === side && w.state !== 'over';
    if (side === 0) {
      drawText(ctx, name, 4, 3, color);
      drawText(ctx, score, 4 + textWidth(name) + 5, 3, bright ? WHITE : LIGHT);
    } else {
      drawText(ctx, name, 252 - textWidth(name), 3, color);
      drawText(ctx, score, 252 - textWidth(name) - 5 - textWidth(score), 3, bright ? WHITE : LIGHT);
    }
  }
  drawTextCentered(ctx, `${w.goals[0]} - ${w.goals[1]}`, 128, 3, WHITE);
  drawBar(ctx, w, frame);

  if (w.ball.rally > 0 && w.state === 'play') drawText(ctx, `RALLY ${w.ball.rally}`, 4, 15, w.ball.rally >= 10 ? YELLOW : GREY);
  // The fright, running down, or the invasion.
  if (w.power > 0) {
    const left = w.power / 420;
    ctx.fillStyle = DARK;
    ctx.fillRect(204, 16, 48, 3);
    ctx.fillStyle = left < 0.28 && (frame >> 2) % 2 ? WHITE : SCARED;
    ctx.fillRect(204, 16, Math.ceil(48 * left), 3);
  } else if (w.invasions.length) {
    const text = 'INVASION';
    drawText(ctx, text, 252 - textWidth(text), 15, (frame >> 3) % 2 ? ALIEN : GREY);
  }
}

function drawPause(ctx: Ctx, game: Game, w: World) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, GRID_Y, W, H - GRID_Y);
  drawBox(ctx, 52, 72, 152, 80);
  drawTextCentered(ctx, 'PAUSED', 128, 82, YELLOW);
  drawTextCentered(ctx, `${game.sideName(0)} ${w.goals[0]} - ${w.goals[1]} ${game.sideName(1)}`, 128, 96);
  drawTextCentered(ctx, `A LEAD OF ${w.opt.target} GOALS WINS`, 128, 108, GREY);
  drawTextCentered(ctx, 'ENTER RESUME', 128, 124, LIGHT);
  drawTextCentered(ctx, 'BKSP QUIT', 128, 136, GREY);
}

function drawOver(ctx: Ctx, game: Game, w: World, frame: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, GRID_Y, W, H - GRID_Y);
  const winner: Side = w.lead > 0 ? 0 : 1;
  drawBox(ctx, 44, 56, 168, 112);
  const title = game.solo ? (winner === 0 ? 'YOU WIN!' : 'CPU WINS') : `PLAYER ${winner + 1} WINS!`;
  drawTextCentered(ctx, title, 128, 66, SIDE_COLORS[winner]);
  drawTextCentered(ctx, `${w.goals[0]} - ${w.goals[1]}`, 128, 78, WHITE);
  const rows: [string, string, string][] = [
    ['POINTS', String(w.points[0]), String(w.points[1])],
    ['GHOSTS', String(w.ghostsEaten[0]), String(w.ghostsEaten[1])],
    ['SHOTS', String(w.shots[0]), String(w.shots[1])],
  ];
  drawText(ctx, game.sideName(0), 134 - textWidth(game.sideName(0)), 94, SIDE_COLORS[0]);
  drawText(ctx, game.sideName(1), 158, 94, SIDE_COLORS[1]);
  rows.forEach(([k, a, b], i) => {
    const y = 106 + i * 12;
    drawText(ctx, k, 54, y, GREY);
    drawText(ctx, a, 134 - textWidth(a), y, LIGHT);
    drawText(ctx, b, 158, y, LIGHT);
  });
  drawText(ctx, 'RALLY', 54, 142, GREY);
  drawText(ctx, String(w.bestRally), 158, 142, LIGHT);
  if (game.timer > 40 && (frame >> 5) % 2 === 0) drawTextCentered(ctx, 'PRESS ENTER', 128, 156, WHITE);
}

// ---------- title ----------

const LOGO = [
  ['###', '#.#', '###', '#..', '#..'],
  ['###', '#.#', '#.#', '#.#', '###'],
  ['#..#', '##.#', '#.##', '#..#', '#..#'],
  ['####', '#...', '#.##', '#..#', '####'],
  ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  ['###', '#.#', '###', '#.#', '#.#'],
  ['#..#', '##.#', '#.##', '#..#', '#..#'],
];
const LOGO_CELL = 5;
const LOGO_COLS = LOGO.reduce((n, l) => n + l[0].length + 1, -1);
const LOGO_X = Math.round((W - LOGO_COLS * LOGO_CELL) / 2);

/** Under the logo: Pongman shot from one paddle to the other, a ghost in tow. */
function drawParade(ctx: Ctx, frame: number, y: number) {
  // The paddle faces; he turns round the moment he touches one.
  const left = 34, right = 222;
  const x0 = left + BALL_R, x1 = right - BALL_R;
  const span = x1 - x0;
  const t = (frame * 1.4) % (span * 2);
  const back = t >= span;
  const x = back ? x1 - (t - span) : x0 + t;
  const dir = back ? 3 : 1;
  const chew = [0.15, 0.55, 0.95, 0.55][(frame >> 2) % 4];
  // A paddle gives a little when he hits it.
  const hit = (edge: number) => Math.max(0, 3 - Math.abs(x - edge));
  ctx.fillStyle = SIDE_COLORS[0];
  ctx.fillRect(left - 4 - hit(x0), y - 8, 4, 16);
  ctx.fillStyle = SIDE_COLORS[1];
  ctx.fillRect(right + hit(x1), y - 8, 4, 16);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, y - 8, right - left, 16);
  ctx.clip();
  const gx = back ? x + 22 : x - 22;
  drawSprite(ctx, [...GHOST_BODY, ...GHOST_FEET[(frame >> 3) % 2]], Math.round(gx) - 6, y - 6, { '#': GHOST });
  drawGhostEyes(ctx, Math.round(gx) - 6, y - 6, dir);
  drawPac(ctx, x, y, dir, chew, back ? SIDE_COLORS[1] : SIDE_COLORS[0]);
  ctx.restore();
}

function renderTitle(ctx: Ctx, game: Game, frame: number) {
  const s = game.settings;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawCourt(ctx, game.titleWorld(), frame, true);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  drawBox(ctx, 24, 6, 208, 56);
  let col = 0;
  LOGO.forEach((letter) => {
    letter.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== '#') return;
        const px = LOGO_X + (col + x) * LOGO_CELL, py = 13 + y * LOGO_CELL;
        // A shine runs across the letters.
        const wave = (col + x + y - (frame >> 2) + 4000) % 46 < 2;
        ctx.fillStyle = wave ? WHITE : PONGMAN;
        ctx.fillRect(px, py, LOGO_CELL - 1, LOGO_CELL - 1);
        ctx.fillStyle = GOLD;
        ctx.fillRect(px, py + LOGO_CELL - 2, LOGO_CELL - 1, 1);
      }),
    );
    col += letter[0].length + 1;
  });
  drawParade(ctx, frame, 49);

  drawBox(ctx, 16, 68, 224, 88);
  const values: Record<(typeof MENU)[number], string> = {
    PLAYERS: PLAYERS[s.players],
    CPU: CPUS[s.cpu].name,
    MATCH: `${GOALS[s.goals]} GOALS LEAD`,
    SPEED: SPEED_NAMES[s.speed],
    MUSIC: MUSIC_NAMES[s.music],
    HELP: 'HOW TO PLAY',
  };
  MENU.forEach((row, i) => {
    const y = 77 + i * 12;
    const on = i === game.menuRow;
    const enabled = game.rowEnabled(row);
    if (on) drawText(ctx, '>', 26, y, YELLOW);
    drawText(ctx, row, 36, y, on ? YELLOW : enabled ? WHITE : '#585858');
    const v = values[row];
    drawText(ctx, v, 96, y, !enabled ? '#585858' : on ? WHITE : LIGHT);
    if (on && enabled && row !== 'HELP') {
      drawText(ctx, '<', 88, y, GREY);
      drawText(ctx, '>', 98 + textWidth(v), y, GREY);
    }
  });

  drawBox(ctx, 8, 160, 240, 62);
  drawTextCentered(ctx, game.solo ? 'PONG THROUGH A MAZE OF GHOSTS.' : 'TWO PLAYERS, ONE KEYBOARD.', 128, 168, YELLOW);
  const best = game.best();
  if (game.solo) drawTextCentered(ctx, best ? `TOP ${pad(best.score, 6)} ${best.name}` : 'NO RECORD YET', 128, 180, RED);
  else drawTextCentered(ctx, 'YELLOW: W S    RED: UP DOWN', 128, 180, LIGHT);
  if ((frame >> 5) % 2 === 0) drawTextCentered(ctx, 'ENTER START   H SCORES   M MUSIC', 128, 194);
  drawTextCentered(ctx, 'YOUR PADDLE STEERS HIM WHILE HE FLIES', 128, 206, GREY);
}

// ---------- high scores ----------

function renderScores(ctx: Ctx, game: Game, frame: number) {
  const entering = game.phase === 'entry';
  const cpu = CPUS[game.scoresView];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawCourt(ctx, game.world ?? game.titleWorld(), frame, true);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  drawBox(ctx, 24, 12, 208, 176);
  drawTextCentered(ctx, entering ? 'NEW RECORD!' : 'HIGH SCORES', 128, 20, entering ? YELLOW : WHITE);
  drawTextCentered(ctx, entering ? `CPU ${cpu.name}` : `< CPU ${cpu.name} >`, 128, 32, LIGHT);
  const cols: [string, number][] = [['NAME', 50], ['SCORE', 94], ['GOALS', 142], ['RALLY', 184]];
  for (const [label, x] of cols) drawText(ctx, label, x, 44, GREY);
  ctx.fillStyle = '#585858';
  ctx.fillRect(34, 53, 188, 1);

  const blink = (frame >> 4) % 2 === 0;
  const list = game.tables[cpu.id];
  for (let i = 0; i < MAX_SCORES; i++) {
    const y = 58 + i * 12;
    const e = list[i];
    const mine = i === game.entryRank && game.scoresView === game.settings.cpu;
    const color = mine ? (entering || blink ? YELLOW : WHITE) : i < 3 ? WHITE : LIGHT;
    const n = String(i + 1);
    drawText(ctx, n, 45 - textWidth(n), y, mine ? color : GREY);
    if (!e) {
      drawText(ctx, '------', 50, y, DARK);
      continue;
    }
    if (mine && entering) {
      drawText(ctx, game.entryName.join(''), 50, y, color);
      if (blink) {
        ctx.fillStyle = WHITE;
        ctx.fillRect(50 + game.entryCursor * 6, y + 8, 5, 1);
      }
    } else drawText(ctx, e.name.slice(0, NAME_LEN), 50, y, color);
    drawText(ctx, pad(e.score, 6), 94, y, color);
    drawText(ctx, `${e.won}-${e.lost}`, 142, y, e.won > e.lost ? color : GREY);
    drawText(ctx, String(e.rally), 184, y, GREY);
  }

  drawBox(ctx, 24, 194, 208, 24);
  if (entering) drawTextCentered(ctx, 'TYPE NAME  THEN ENTER', 128, 202);
  else drawTextCentered(ctx, '< > DIFFICULTY   ENTER BACK', 128, 202, blink ? WHITE : LIGHT);
}

// ---------- help ----------

function renderHelp(ctx: Ctx, game: Game, frame: number) {
  const page = HELP_PAGES[game.helpPage];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawCourt(ctx, game.titleWorld(), frame, true);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  drawBox(ctx, 16, 8, 224, 182);
  drawTextCentered(ctx, `< ${page.title} >`, 128, 16, YELLOW);
  ctx.fillStyle = '#585858';
  ctx.fillRect(26, 27, 204, 1);
  wrapText(page.text, 34).forEach((line, i) => drawText(ctx, line, 26, 34 + i * 10));
  drawBox(ctx, 16, 194, 224, 24);
  const blink = (frame >> 4) % 2 === 0;
  drawTextCentered(ctx, `< > PAGE ${game.helpPage + 1}/${HELP_PAGES.length}    ENTER BACK`, 128, 202, blink ? WHITE : LIGHT);
}
