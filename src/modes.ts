// Match settings: who plays, how hard the CPU is, how long a match is, how fast the ball flies.

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Cpu {
  id: Difficulty;
  name: string;
  /** Paddle speed as a fraction of a human's. */
  speed: number;
  /** Frames between looks at the ball. */
  react: number;
  /** Pixels of error when lining up with the ball. */
  error: number;
  /** How often it steers for dots, ghosts and the gap instead of flying straight. */
  wit: number;
}

export const CPUS: Cpu[] = [
  { id: 'easy', name: 'EASY', speed: 0.6, react: 14, error: 12, wit: 0.3 },
  { id: 'normal', name: 'NORMAL', speed: 0.8, react: 7, error: 6, wit: 0.65 },
  { id: 'hard', name: 'HARD', speed: 1.0, react: 2, error: 1, wit: 0.95 },
];

export const PLAYERS = ['1 PLAYER', '2 PLAYERS'];
/** The lead, in goals, that wins a match. */
export const GOALS = [3, 5, 7, 11];
/** Ball speed in pixels per frame at the serve, for SPEED 1-3. */
export const SPEEDS = [1.1, 1.4, 1.75];
export const SPEED_NAMES = ['SLOW', 'NORMAL', 'FAST'];
