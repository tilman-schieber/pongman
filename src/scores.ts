// High scores for matches against the CPU, one table per difficulty: in this browser and worldwide.
import { CPUS, Difficulty } from './modes';

export interface ScoreEntry {
  name: string;
  score: number;
  won: boolean;
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

export const isEntry = (e: unknown): e is ScoreEntry =>
  !!e && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score);

export const normalize = (e: ScoreEntry): ScoreEntry => ({
  name: e.name.slice(0, 6),
  score: e.score,
  won: !!e.won,
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

// ---------- world scores (a Val Town val: tilmanschieber/pongman-scores) ----------

const GLOBAL_URL = 'https://tilmanschieber--565405dac81411f18f051607ee4eb77e.web.val.run';
/** A hanging server counts as offline after this long. */
const TIMEOUT = 5000;
const PENDING_KEY = 'pongman.pending';
const MAX_PENDING = 20;

const cleanList = (list: unknown) =>
  Array.isArray(list) ? list.filter(isEntry).map(normalize).slice(0, MAX_SCORES) : [];

/** A game waiting to reach the world table; the uid lets the server ignore resends. */
interface Pending {
  mode: Difficulty;
  entry: ScoreEntry;
  uid: string;
}

function loadPending(): Pending[] {
  try {
    const raw = JSON.parse(load(PENDING_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.uid === 'string' && isEntry(p.entry)) : [];
  } catch {
    return [];
  }
}

const savePending = (list: Pending[]) => save(PENDING_KEY, JSON.stringify(list.slice(-MAX_PENDING)));

const newUid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** The world top 10 of every mode, or null when offline. */
export async function fetchGlobal(): Promise<Tables | null> {
  if (!GLOBAL_URL) return null;
  try {
    const res = await fetch(GLOBAL_URL, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    const raw = await res.json();
    return Object.fromEntries(CPUS.map((c) => [c.id, cleanList(raw[c.id])])) as unknown as Tables;
  } catch {
    return null;
  }
}

type Sent = { rank: number; top: ScoreEntry[] };

/** One attempt; 'retry' when the server can't take it now, 'drop' when it never will. */
async function post(p: Pending): Promise<Sent | 'retry' | 'drop'> {
  if (!GLOBAL_URL) return 'retry';
  try {
    const res = await fetch(GLOBAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: p.mode, ...p.entry, uid: p.uid }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status === 400) return 'drop';
    if (!res.ok) return 'retry';
    const raw = await res.json();
    return { rank: Number.isInteger(raw.rank) ? raw.rank : -1, top: cleanList(raw.top) };
  } catch {
    return 'retry';
  }
}

/** Sends a finished game; returns its world rank (-1 outside the top 10) and the new top 10, or null if it was queued. */
export async function submitGlobal(mode: Difficulty, entry: ScoreEntry): Promise<Sent | null> {
  const p: Pending = { mode, entry: { ...entry }, uid: newUid() };
  const res = await post(p);
  if (res === 'retry') savePending([...loadPending(), p]);
  return typeof res === 'object' ? res : null;
}

let flushing = false;

/** Resends games that didn't get through earlier. */
export async function flushPending() {
  if (flushing) return;
  flushing = true;
  try {
    for (const p of loadPending()) {
      const res = await post(p);
      if (res === 'retry') break;
      savePending(loadPending().filter((q) => q.uid !== p.uid));
    }
  } finally {
    flushing = false;
  }
}
