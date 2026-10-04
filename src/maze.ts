// The court as a grid of 8-pixel tiles: a lane down each side for the paddles, and between them
// a maze that is new for every match: corridors one tile wide on a 3-tile lattice, mirrored left
// to right, with no dead ends, a ghost pen in the middle, and openings onto the lanes.
import { Rng } from './rng';

export const TILE = 8;
export const COLS = 32;
export const ROWS = 24;
/** Maze columns; the lanes are either side. */
export const FIELD_C0 = 4;
export const FIELD_C1 = 27;

export const LANE = 0;
export const OPEN = 1;
export const WALL = 2;
export const DOOR = 3;
export const HOUSE = 4;

export const DOT = 1;
export const PELLET = 2;

export const cellAt = (c: number, r: number) => r * COLS + c;
export const cx = (cell: number) => cell % COLS;
export const cy = (cell: number) => Math.floor(cell / COLS);

// The lattice, in maze columns (0-23): crossings at (X(i), Y(j)), two wall tiles apart.
const NX = 8;
const NY = 8;
const X = (i: number) => 1 + 3 * i;
const Y = (j: number) => 1 + 3 * j;

/** The pen: the ghosts' home, in screen pixels. */
export const HOUSE_X = (FIELD_C0 + 12) * TILE;
export const HOUSE_Y = Y(3) * TILE + TILE / 2;
/** Where they come out: above the door. */
export const DOOR_Y = Y(2) * TILE + TILE / 2;
const PELLET_NODES = [[0, 1], [NX - 1, 1], [0, NY - 2], [NX - 1, NY - 2]];

export interface Layout {
  grid: Uint8Array;
  /** DOT or PELLET per tile, 0 for none. */
  dots: Uint8Array;
  /** Rows on which the maze opens onto the lanes. */
  openings: number[];
}

function shuffle<T>(a: T[], rng: Rng) {
  for (let k = a.length - 1; k > 0; k--) {
    const r = Math.floor(rng() * (k + 1));
    [a[k], a[r]] = [a[r], a[k]];
  }
  return a;
}

/** A new maze. `sparse` is the share of removable corridors taken out: more gives bigger blocks. */
export function generate(rng: Rng, sparse = 0.6, openings = 3): Layout {
  // Corridors between neighbouring crossings: h[j][i] runs right from (i, j), v[j][i] down from it.
  const h = Array.from({ length: NY }, () => new Array<boolean>(NX - 1).fill(true));
  const v = Array.from({ length: NY - 1 }, () => new Array<boolean>(NX).fill(true));
  const hKeep = h.map((r) => r.map(() => false));
  const vKeep = v.map((r) => r.map(() => false));

  // Faces of the lattice (the wall blocks), merged as corridors between them go.
  const FX = NX - 1, FY = NY - 1;
  const parent = Array.from({ length: FX * FY }, (_, k) => k);
  const size = new Array<number>(FX * FY).fill(1);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const union = (a: number, b: number) => {
    a = find(a);
    b = find(b);
    if (a === b) return;
    parent[b] = a;
    size[a] += size[b];
  };
  const face = (i: number, j: number) => j * FX + i;

  // The outer ring stays.
  for (let i = 0; i < NX - 1; i++) hKeep[0][i] = hKeep[NY - 1][i] = true;
  for (let j = 0; j < NY - 1; j++) vKeep[j][0] = vKeep[j][NX - 1] = true;
  // The pen: its two inner crossings go, the ring around it stays.
  for (const i of [2, 3, 4]) {
    h[3][i] = false;
    hKeep[2][i] = hKeep[4][i] = hKeep[3][i] = true;
  }
  for (const j of [2, 3]) {
    v[j][3] = v[j][4] = false;
    vKeep[j][2] = vKeep[j][3] = vKeep[j][4] = vKeep[j][5] = true;
  }
  for (const i of [2, 3, 4]) union(face(2, 2), face(i, 2)), union(face(2, 2), face(i, 3));
  size[find(face(2, 2))] = 99;

  const degree = (i: number, j: number) =>
    (i > 0 && h[j][i - 1] ? 1 : 0) + (i < NX - 1 && h[j][i] ? 1 : 0) + (j > 0 && v[j - 1][i] ? 1 : 0) + (j < NY - 1 && v[j][i] ? 1 : 0);
  const inHouse = (i: number, j: number) => j === 3 && (i === 3 || i === 4);
  const valid = () => {
    let total = 0;
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        if (inHouse(i, j)) continue;
        total++;
        if (degree(i, j) < 2) return false;
      }
    const seen = new Uint8Array(NX * NY);
    const stack = [0];
    seen[0] = 1;
    let n = 0;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      const i = k % NX, j = Math.floor(k / NX);
      const visit = (ni: number, nj: number) => {
        const nk = nj * NX + ni;
        if (!seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      };
      if (i > 0 && h[j][i - 1]) visit(i - 1, j);
      if (i < NX - 1 && h[j][i]) visit(i + 1, j);
      if (j > 0 && v[j - 1][i]) visit(i, j - 1);
      if (j < NY - 1 && v[j][i]) visit(i, j + 1);
    }
    return n === total;
  };

  // Candidates in the left half (and the middle); each goes together with its mirror image.
  type Edge = { horizontal: boolean; i: number; j: number };
  const cands: Edge[] = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i <= 3; i++) if (h[j][i] && !hKeep[j][i]) cands.push({ horizontal: true, i, j });
  for (let j = 0; j < NY - 1; j++) for (let i = 0; i <= 3; i++) if (v[j][i] && !vKeep[j][i]) cands.push({ horizontal: false, i, j });
  shuffle(cands, rng);
  const MAX_FACE = 3;
  let budget = Math.round(cands.length * sparse);
  for (const e of cands) {
    if (budget <= 0) break;
    const { i, j } = e;
    const mi = e.horizontal ? NX - 2 - i : NX - 1 - i;
    // The two wall blocks this corridor separates, and their mirror images.
    const a = e.horizontal ? face(i, j - 1) : face(i - 1, j);
    const b = face(i, j);
    const ma = e.horizontal ? face(mi, j - 1) : face(mi, j);
    const mb = e.horizontal ? face(mi, j) : face(mi - 1, j);
    if (find(a) === find(b)) continue;
    // A corridor on or next to the centre line joins a block to its own mirror image.
    const roots = new Set([find(a), find(b)]);
    const all = new Set([...roots, find(ma), find(mb)]);
    const area = (s: Set<number>) => [...s].reduce((n, r) => n + size[r], 0);
    if (area(all.size < 4 ? all : roots) > MAX_FACE) continue;
    const set = (on: boolean) => {
      if (e.horizontal) h[j][i] = h[j][mi] = on;
      else v[j][i] = v[j][mi] = on;
    };
    set(false);
    if (!valid()) {
      set(true);
      continue;
    }
    union(a, b);
    union(ma, mb);
    budget--;
  }

  const grid = new Uint8Array(COLS * ROWS).fill(LANE);
  const at = (x: number, y: number) => cellAt(FIELD_C0 + x, y);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x <= FIELD_C1 - FIELD_C0; x++) grid[at(x, y)] = WALL;
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      if (inHouse(i, j)) continue;
      grid[at(X(i), Y(j))] = OPEN;
      if (i < NX - 1 && h[j][i]) grid[at(X(i) + 1, Y(j))] = grid[at(X(i) + 2, Y(j))] = OPEN;
      if (j < NY - 1 && v[j][i]) grid[at(X(i), Y(j) + 1)] = grid[at(X(i), Y(j) + 2)] = OPEN;
    }
  for (let y = Y(2) + 2; y <= Y(4) - 2; y++) for (let x = 9; x <= 14; x++) grid[at(x, y)] = HOUSE;
  grid[at(11, Y(2) + 1)] = grid[at(12, Y(2) + 1)] = DOOR;

  // Openings onto the lanes, the same rows both sides, never two next to each other.
  const rows = shuffle([0, 1, 2, 3, 4, 5, 6, 7], rng);
  const open: number[] = [];
  for (const j of rows) {
    if (open.length >= openings) break;
    if (open.some((t) => Math.abs(t - j) < 2)) continue;
    open.push(j);
    grid[at(0, Y(j))] = grid[at(FIELD_C1 - FIELD_C0, Y(j))] = OPEN;
  }

  const dots = new Uint8Array(grid.length);
  for (let c = 0; c < grid.length; c++) {
    const x = cx(c) - FIELD_C0;
    if (grid[c] !== OPEN || x === 0 || x === FIELD_C1 - FIELD_C0) continue;
    dots[c] = DOT;
  }
  for (const [i, j] of PELLET_NODES) dots[at(X(i), Y(j))] = PELLET;
  return { grid, dots, openings: open.map(Y).sort((a, b) => a - b) };
}
