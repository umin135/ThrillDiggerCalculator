import { type Cell, type LevelId, LEVELS, LEVEL_ORDER, RUPEES, emptyBoard } from './levels';
import { type PlayGame, dig, isPlayGame, newGame } from './play';

export type RecommendMode = 'safe' | 'value';
export type AppMode = 'solve' | 'play';

export interface PlayRecord {
  games: number;
  won: number;
  lost: number;
  net: number;
}

const emptyRecord = (): PlayRecord => ({ games: 0, won: 0, lost: 0, net: 0 });

interface History {
  past: Cell[][];
  future: Cell[][];
}

interface Saved {
  version: 1;
  level: LevelId;
  mode: RecommendMode;
  boards: Partial<Record<LevelId, Cell[]>>;
  app?: AppMode;
  hints?: boolean;
  games?: Partial<Record<LevelId, PlayGame>>;
  records?: Partial<Record<LevelId, PlayRecord>>;
}

const STORAGE_KEY = 'skydigger:v1';
const HISTORY_LIMIT = 200;

export class Store {
  level: LevelId = 'beginner';
  mode: RecommendMode = 'safe';
  boards: Record<LevelId, Cell[]>;
  app: AppMode = 'solve';
  /** 연습 플레이에서 확률을 보여 줄지 */
  hints = false;
  games: Record<LevelId, PlayGame>;
  records: Record<LevelId, PlayRecord>;
  /** 마지막으로 바꾼 칸 (모순 표시용) */
  lastChanged: number | null = null;
  private history: Record<LevelId, History>;
  private listeners = new Set<() => void>();

  constructor() {
    this.boards = {
      beginner: emptyBoard(LEVELS.beginner),
      intermediate: emptyBoard(LEVELS.intermediate),
      expert: emptyBoard(LEVELS.expert),
    };
    this.history = {
      beginner: { past: [], future: [] },
      intermediate: { past: [], future: [] },
      expert: { past: [], future: [] },
    };
    this.games = {
      beginner: newGame(LEVELS.beginner),
      intermediate: newGame(LEVELS.intermediate),
      expert: newGame(LEVELS.expert),
    };
    this.records = { beginner: emptyRecord(), intermediate: emptyRecord(), expert: emptyRecord() };
    this.load();
  }

  get game(): PlayGame {
    return this.games[this.level];
  }

  get record(): PlayRecord {
    return this.records[this.level];
  }

  setApp(app: AppMode): void {
    if (app === this.app) return;
    this.app = app;
    this.emit();
  }

  setHints(on: boolean): void {
    if (on === this.hints) return;
    this.hints = on;
    this.emit();
  }

  newPlay(): void {
    this.games[this.level] = newGame(LEVELS[this.level]);
    this.emit();
  }

  dig(index: number): void {
    const before = this.game;
    const after = dig(before, index);
    if (after === before) return;
    this.games[this.level] = after;
    if (after.status !== 'playing') {
      const r = this.record;
      r.games++;
      if (after.status === 'won') r.won++;
      else r.lost++;
      r.net += after.earned - LEVELS[this.level].fee;
    }
    this.emit();
  }

  resetRecord(): void {
    this.records[this.level] = emptyRecord();
    this.emit();
  }

  get board(): Cell[] {
    return this.boards[this.level];
  }

  subscribe(fn: () => void): void {
    this.listeners.add(fn);
  }

  setLevel(level: LevelId): void {
    if (level === this.level) return;
    this.level = level;
    this.lastChanged = null;
    this.emit();
  }

  setMode(mode: RecommendMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.emit();
  }

  setCell(index: number, cell: Cell): void {
    const prev = this.board[index];
    if (sameCell(prev, cell)) return;
    this.commit(this.board.map((c, i) => (i === index ? cell : c)));
    this.lastChanged = index;
    this.emit();
  }

  clear(): void {
    if (this.board.every((c) => c.kind === 'unknown')) return;
    this.commit(emptyBoard(LEVELS[this.level]));
    this.lastChanged = null;
    this.emit();
  }

  get canUndo(): boolean {
    return this.history[this.level].past.length > 0;
  }

  get canRedo(): boolean {
    return this.history[this.level].future.length > 0;
  }

  undo(): void {
    const h = this.history[this.level];
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(this.board);
    this.lastChanged = diffIndex(this.board, prev);
    this.boards[this.level] = prev;
    this.emit();
  }

  redo(): void {
    const h = this.history[this.level];
    const next = h.future.pop();
    if (!next) return;
    h.past.push(this.board);
    this.lastChanged = diffIndex(this.board, next);
    this.boards[this.level] = next;
    this.emit();
  }

  private commit(next: Cell[]): void {
    const h = this.history[this.level];
    h.past.push(this.board);
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.future = [];
    this.boards[this.level] = next;
  }

  private emit(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }

  private save(): void {
    const data: Saved = {
      version: 1,
      level: this.level,
      mode: this.mode,
      boards: this.boards,
      app: this.app,
      hints: this.hints,
      games: this.games,
      records: this.records,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 사생활 보호 모드 등에서는 저장 없이 동작한다.
    }
  }

  private load(): void {
    let data: Saved | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      data = raw ? (JSON.parse(raw) as Saved) : null;
    } catch {
      data = null;
    }
    if (!data || data.version !== 1) return;
    if (LEVEL_ORDER.includes(data.level)) this.level = data.level;
    if (data.mode === 'safe' || data.mode === 'value') this.mode = data.mode;
    if (data.app === 'solve' || data.app === 'play') this.app = data.app;
    if (typeof data.hints === 'boolean') this.hints = data.hints;
    for (const id of LEVEL_ORDER) {
      const b = data.boards?.[id];
      const size = LEVELS[id].width * LEVELS[id].height;
      if (Array.isArray(b) && b.length === size && b.every(isCell)) this.boards[id] = b;
      const g = data.games?.[id];
      if (isPlayGame(g) && g.level === id) this.games[id] = g;
      const r = data.records?.[id];
      if (r && [r.games, r.won, r.lost, r.net].every((n) => typeof n === 'number')) this.records[id] = r;
    }
  }
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.kind === b.kind && (a.kind !== 'rupee' || a.color === (b as typeof a).color);
}

function diffIndex(a: Cell[], b: Cell[]): number | null {
  const i = a.findIndex((c, k) => !sameCell(c, b[k]));
  return i < 0 ? null : i;
}

function isCell(c: unknown): c is Cell {
  if (!c || typeof c !== 'object') return false;
  const kind = (c as { kind?: unknown }).kind;
  if (kind === 'unknown' || kind === 'rupoor' || kind === 'bomb') return true;
  return kind === 'rupee' && RUPEES.some((r) => r.color === (c as { color?: unknown }).color);
}
