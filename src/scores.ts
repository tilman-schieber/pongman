// High scores for matches against the CPU, one table per difficulty, in this browser.
import { CPUS, Difficulty } from './modes';

export interface ScoreEntry {
  name: string;
  score: number;
  /** The final goals, yours first. */
  won: number;
  lost: number;
  /** Longest rally. */
  rally: number;
}

export type Tables = Record<Difficulty, ScoreEntry[]>;

export const MAX_SCORES = 10;
const KEY = 'pongman.scores';

export function load(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

const isEntry = (e: unknown): e is ScoreEntry =>
  !!e && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score);

const normalize = (e: ScoreEntry): ScoreEntry => ({
  name: e.name.slice(0, 6),
  score: e.score,
  won: Number(e.won) || 0,
  lost: Number(e.lost) || 0,
  rally: Number(e.rally) || 0,
});

export function loadTables(): Tables {
  const tables = Object.fromEntries(CPUS.map((c) => [c.id, [] as ScoreEntry[]])) as Tables;
  try {
    const raw = JSON.parse(load(KEY) ?? '{}');
    for (const c of CPUS) {
      const list = Array.isArray(raw[c.id]) ? raw[c.id].filter(isEntry).map(normalize) : [];
      tables[c.id] = list.sort((a: ScoreEntry, b: ScoreEntry) => b.score - a.score).slice(0, MAX_SCORES);
    }
  } catch {}
  return tables;
}

export const saveTables = (t: Tables) => save(KEY, JSON.stringify(t));

/** Index the entry would take in the table, or -1 if it doesn't make it. */
export function rankFor(list: ScoreEntry[], e: ScoreEntry) {
  const i = list.findIndex((x) => e.score > x.score);
  const at = i >= 0 ? i : list.length;
  return at < MAX_SCORES ? at : -1;
}
