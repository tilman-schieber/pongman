// High scores for matches against the CPU, one table per difficulty: in this browser and worldwide
// (a Val Town val: tilmanschieber/pongman-scores). The tables themselves are arcade-kit's.
import { createScores } from 'arcade-kit/scores';
import { CPUS, Difficulty } from './modes';

export { load, save } from 'arcade-kit/storage';

export interface ScoreEntry {
  name: string;
  score: number;
  won: boolean;
  /** Longest rally. */
  rally: number;
}

export type Tables = Record<Difficulty, ScoreEntry[]>;

export const { MAX_SCORES, loadTables, saveTables, rankFor, fetchGlobal, submitGlobal, flushPending } = createScores<
  Difficulty,
  ScoreEntry
>({
  game: 'pongman',
  tables: CPUS.map((c) => c.id),
  url: 'https://tilmanschieber--565405dac81411f18f051607ee4eb77e.web.val.run',
  normalize: (e) => ({
    name: e.name,
    score: e.score,
    won: !!e.won,
    rally: Number(e.rally) || 0,
  }),
});
