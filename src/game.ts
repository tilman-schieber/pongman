import { CPUS, PLAYERS, GOALS, SPEEDS } from './modes';
import { loadTables, saveTables, rankFor, ScoreEntry, Tables, MAX_SCORES, load, save } from './scores';
import { sfx, music } from './audio';
import { makeRng, randomSeed } from './rng';
import { World, Move, Side } from './world';
import { Brain } from './ai';
import { HELP_PAGES } from './help';

export type Action = 'p1up' | 'p1down' | 'p2up' | 'p2down' | 'left' | 'right' | 'start' | 'back' | 'quit' | 'mute' | 'scores';

export interface Input {
  held: Set<Action>;
  pressed: Set<Action>;
  /** Raw A-Z / 0-9 / Backspace / Enter, for name entry. */
  typed: string[];
  /** A finger on each half of the court: the y it points at, in screen pixels. */
  touch: [number | null, number | null];
}

export type Phase = 'title' | 'play' | 'over' | 'entry' | 'scores' | 'help';

export interface Settings {
  /** 0: one player against the CPU, 1: two players. */
  players: number;
  cpu: number;
  goals: number;
  speed: number;
  music: number;
  /** M mutes without changing the selection. */
  muted: boolean;
}

export const MUSIC_NAMES = ['ON', 'OFF'];
export const MENU = ['PLAYERS', 'CPU', 'MATCH', 'SPEED', 'MUSIC', 'HELP'] as const;
export const NAME_LEN = 6;
const NAME_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_SETTINGS: Settings = { players: 0, cpu: 1, goals: 1, speed: 1, music: 0, muted: false };

function loadSettings(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(load('pongman.settings') ?? '{}') };
    s.players = Math.min(PLAYERS.length - 1, Math.max(0, s.players | 0));
    s.cpu = Math.min(CPUS.length - 1, Math.max(0, s.cpu | 0));
    s.goals = Math.min(GOALS.length - 1, Math.max(0, s.goals | 0));
    s.speed = Math.min(SPEEDS.length - 1, Math.max(0, s.speed | 0));
    s.music = Math.min(MUSIC_NAMES.length - 1, Math.max(0, s.music | 0));
    s.muted = !!s.muted;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export class Game {
  phase: Phase = 'title';
  settings = loadSettings();
  menuRow = 0;
  paused = false;
  timer = 0;

  world: World | null = null;
  private brain: Brain | null = null;
  private seed = 0;
  private musicOn = false;

  tables: Tables = loadTables();
  scoresView = 0;
  entryRank = -1;
  entryName: string[] = [];
  entryCursor = 0;
  private entryFresh = false;

  helpPage = 0;
  private preview: World | null = null;

  constructor() {
    music.enabled = !this.settings.muted;
  }

  get solo() {
    return this.settings.players === 0;
  }

  get cpu() {
    return CPUS[this.settings.cpu];
  }

  get target() {
    return GOALS[this.settings.goals];
  }

  /** The name of each side, for the HUD and the result. */
  sideName(side: Side) {
    if (this.solo) return side === 0 ? 'YOU' : 'CPU';
    return side === 0 ? 'P1' : 'P2';
  }

  best(cpuIdx = this.settings.cpu): ScoreEntry | undefined {
    return this.tables[CPUS[cpuIdx].id]?.[0];
  }

  private newWorld(seed: number) {
    return new World({ rng: makeRng(seed), speed: SPEEDS[this.settings.speed], target: this.target });
  }

  /** A quiet court behind the menus. */
  titleWorld() {
    this.preview ??= this.newWorld(1234);
    return this.preview;
  }

  step(input: Input) {
    const { pressed } = input;
    if (this.phase === 'entry') return this.stepEntry(input);
    if (pressed.has('mute')) this.toggleMusic();

    switch (this.phase) {
      case 'title':
        return this.stepTitle(pressed);
      case 'play':
        return this.stepPlay(input);
      case 'over':
        if (++this.timer > 40 && (pressed.has('start') || pressed.has('back'))) {
          if (this.entryRank >= 0) this.phase = 'entry';
          else if (this.solo) this.showScores();
          else this.toTitle();
          sfx.select();
        }
        return;
      case 'scores':
        return this.stepScores(pressed);
      case 'help':
        return this.stepHelp(pressed);
    }
  }

  // ---------- menu ----------

  private saveSettings() {
    save('pongman.settings', JSON.stringify(this.settings));
  }

  private toggleMusic() {
    this.settings.muted = !music.toggle();
    this.saveSettings();
  }

  private get musicWanted() {
    return this.settings.music === 0;
  }

  private titleMusic() {
    if (!this.musicWanted) return music.stop();
    if (music.running) return;
    music.setKey(0);
    music.setIntensity(2);
    music.setTempo(1);
    music.setPower(false);
    music.setMelody(1);
    music.play(true);
  }

  rowEnabled(row: (typeof MENU)[number]) {
    if (row === 'CPU') return this.solo;
    return true;
  }

  private stepTitle(pressed: Set<Action>) {
    const s = this.settings;
    this.titleMusic();
    const up = pressed.has('p1up') || pressed.has('p2up');
    const down = pressed.has('p1down') || pressed.has('p2down');
    if (up) this.menuRow = (this.menuRow + MENU.length - 1) % MENU.length;
    if (down) this.menuRow = (this.menuRow + 1) % MENU.length;
    if (up || down) sfx.move();

    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    const row = MENU[this.menuRow];
    if (row === 'HELP' && (d || pressed.has('start'))) {
      this.helpPage = 0;
      this.phase = 'help';
      sfx.select();
      return;
    }
    if (d && this.rowEnabled(row)) {
      const wrap = (v: number, n: number) => (v + d + n) % n;
      if (row === 'PLAYERS') s.players = wrap(s.players, PLAYERS.length);
      if (row === 'CPU') s.cpu = wrap(s.cpu, CPUS.length);
      if (row === 'MATCH') s.goals = wrap(s.goals, GOALS.length);
      if (row === 'SPEED') s.speed = wrap(s.speed, SPEEDS.length);
      if (row === 'MUSIC') s.music = wrap(s.music, MUSIC_NAMES.length);
      sfx.select();
      this.saveSettings();
    }
    if (pressed.has('scores')) {
      this.scoresView = s.cpu;
      this.entryRank = -1;
      this.phase = 'scores';
      sfx.select();
    } else if (pressed.has('start')) this.startMatch();
  }

  private stepHelp(pressed: Set<Action>) {
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      this.helpPage = (this.helpPage + d + HELP_PAGES.length) % HELP_PAGES.length;
      sfx.move();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('quit')) {
      this.phase = 'title';
      sfx.select();
    }
  }

  // ---------- a match ----------

  startMatch() {
    this.seed = randomSeed();
    this.world = this.newWorld(this.seed);
    this.brain = this.solo ? new Brain(1, this.cpu) : null;
    this.entryRank = -1;
    this.paused = false;
    this.phase = 'play';
    this.timer = 0;
    music.stop();
    this.musicOn = false;
    sfx.start();
  }

  /** The music plays through the match and swells as the bars fill. */
  private stepMusic(w: World) {
    if (w.state === 'over' || !this.musicWanted) {
      if (this.musicOn) music.stop();
      this.musicOn = false;
      return;
    }
    const lead = Math.max(w.fill[0], w.fill[1]) / w.limit;
    music.setIntensity(Math.min(5, Math.floor(lead * 4) + (w.state === 'play' ? 1 : 0)));
    music.setTempo(0.95 + this.settings.speed * 0.05 + Math.min(0.25, w.ball.rally * 0.02));
    music.setPower(w.power > 0);
    if (this.musicOn) return;
    this.musicOn = true;
    music.setKey(this.seed % 12);
    music.setMelody(this.seed);
    music.play(true);
  }

  /** A paddle's input: keys, a finger, or the CPU. */
  private moveFor(side: Side, input: Input): Move {
    const w = this.world!;
    if (side === 1 && this.brain) return this.brain.decide(w);
    const t = input.touch[side];
    if (t !== null) {
      const d = t - w.paddles[side].y;
      return Math.abs(d) < 2 ? 0 : d < 0 ? -1 : 1;
    }
    const keys = side === 0 ? (['p1up', 'p1down'] as const) : (['p2up', 'p2down'] as const);
    let up = input.held.has(keys[0]), down = input.held.has(keys[1]);
    // Alone, either set of keys is yours.
    if (this.solo && side === 0) {
      up ||= input.held.has('p2up');
      down ||= input.held.has('p2down');
    }
    return up === down ? 0 : up ? -1 : 1;
  }

  private stepPlay(input: Input) {
    const { pressed } = input;
    const w = this.world!;
    if (pressed.has('start') || pressed.has('back')) {
      this.paused = !this.paused;
      sfx.pause();
      if (this.paused) music.halt();
      else music.resume();
      return;
    }
    if (this.paused) {
      if (pressed.has('quit')) this.toTitle();
      return;
    }
    w.update([this.moveFor(0, input), this.moveFor(1, input)]);
    this.playSounds(w);
    this.stepMusic(w);
    if (w.state === 'over' && w.stateTimer > 50) this.matchOver();
  }

  private playSounds(w: World) {
    for (const s of w.sounds) {
      if (s === 'bat') sfx.bat(w.ball.rally);
      else if (s === 'eatGhost') sfx.eatGhost(w.chain);
      else sfx[s]();
    }
    w.sounds.length = 0;
  }

  private matchOver() {
    const w = this.world!;
    this.phase = 'over';
    this.timer = 0;
    music.stop();
    const won = w.leader === 0;
    if (this.solo) won ? sfx.win() : sfx.lose();
    else sfx.win();
    this.prepareEntry();
  }

  private toTitle() {
    this.phase = 'title';
    this.world = null;
    this.brain = null;
    this.paused = false;
    this.entryRank = -1;
    music.stop();
    sfx.select();
  }

  // ---------- high scores ----------

  private prepareEntry() {
    this.entryRank = -1;
    this.scoresView = this.settings.cpu;
    const w = this.world!;
    if (!this.solo || w.points[0] <= 0) return;
    const entry: ScoreEntry = { name: '', score: w.points[0], won: w.leader === 0, rally: w.bestRally };
    // A record never named (the page was closed mid-entry) makes way.
    const list = (this.tables[this.cpu.id] = this.tables[this.cpu.id].filter((e) => e.name.trim()));
    const at = rankFor(list, entry);
    if (at < 0) return;
    list.splice(at, 0, entry);
    list.length = Math.min(list.length, MAX_SCORES);
    this.entryRank = at;
    const last = (load('pongman.name') ?? '').slice(0, NAME_LEN);
    this.entryName = last.padEnd(NAME_LEN, ' ').split('');
    this.entryCursor = Math.min(NAME_LEN - 1, last.length);
    this.entryFresh = last.length > 0;
  }

  private stepEntry({ pressed, typed }: Input) {
    const name = this.entryName;
    const cycle = (d: number) => {
      const i = NAME_CHARS.indexOf(name[this.entryCursor]);
      name[this.entryCursor] = NAME_CHARS[(i + d + NAME_CHARS.length) % NAME_CHARS.length];
      sfx.move();
    };
    if (pressed.has('p1up') || pressed.has('p2up')) cycle(1);
    if (pressed.has('p1down') || pressed.has('p2down')) cycle(-1);
    if (pressed.has('left') && this.entryCursor > 0) this.entryCursor--;
    if (pressed.has('right') && this.entryCursor < NAME_LEN - 1) this.entryCursor++;

    for (const key of typed) {
      if (key === 'Enter') return this.commitName();
      if (key === 'Backspace') {
        if (name[this.entryCursor] === ' ' && this.entryCursor > 0) this.entryCursor--;
        name[this.entryCursor] = ' ';
      } else {
        // A suggested name is replaced as soon as you type.
        if (this.entryFresh) {
          name.fill(' ');
          this.entryCursor = 0;
        }
        name[this.entryCursor] = key;
        this.entryCursor = Math.min(NAME_LEN - 1, this.entryCursor + 1);
      }
      this.entryFresh = false;
      sfx.move();
    }
    if (pressed.size) this.entryFresh = false;
  }

  private commitName() {
    const name = this.entryName.join('').trim() || '------';
    this.tables[this.cpu.id][this.entryRank].name = name;
    saveTables(this.tables);
    save('pongman.name', name);
    this.phase = 'scores';
    this.timer = 0;
    sfx.record();
  }

  private showScores() {
    this.scoresView = this.settings.cpu;
    this.phase = 'scores';
    this.timer = 0;
  }

  private stepScores(pressed: Set<Action>) {
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      this.scoresView = (this.scoresView + d + CPUS.length) % CPUS.length;
      this.entryRank = -1;
      sfx.select();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('scores')) this.toTitle();
  }
}
