import {
  type Cell,
  type Level,
  type LevelId,
  LEVELS,
  RUPEES,
  type RupeeInfo,
  RUPOOR_VALUE,
  neighbors,
} from './levels';

export type Hidden = 'rupee' | 'bomb' | 'rupoor';
export type PlayStatus = 'playing' | 'won' | 'lost';

export interface PlayGame {
  level: LevelId;
  hidden: Hidden[];
  dug: boolean[];
  /** 이번 판에서 모은 루피 (도둑루피로 0 아래로는 내려가지 않음) */
  earned: number;
  status: PlayStatus;
  lastDug: number | null;
}

/** 폭탄과 도둑루피를 빈 칸에 고르게 무작위로 놓는다. */
export function newGame(level: Level, rand: () => number = Math.random): PlayGame {
  const N = level.width * level.height;
  const hidden: Hidden[] = new Array(N).fill('rupee');
  const place = (kind: Hidden, count: number) => {
    while (count > 0) {
      const i = Math.floor(rand() * N);
      if (hidden[i] === 'rupee') {
        hidden[i] = kind;
        count--;
      }
    }
  };
  place('bomb', level.bombs);
  place('rupoor', level.rupoors);
  return { level: level.id, hidden, dug: new Array(N).fill(false), earned: 0, status: 'playing', lastDug: null };
}

/** 루피 칸에서 나오는 루피: 주변 8칸의 꽝 개수로 색이 정해진다. */
export function rupeeAt(level: Level, hidden: Hidden[], i: number): RupeeInfo {
  const bad = neighbors(level, i).filter((j) => hidden[j] !== 'rupee').length;
  return RUPEES.find((r) => bad >= r.min && bad <= r.max)!;
}

export function revealCell(level: Level, hidden: Hidden[], i: number): Cell {
  if (hidden[i] === 'bomb') return { kind: 'bomb' };
  if (hidden[i] === 'rupoor') return { kind: 'rupoor' };
  return { kind: 'rupee', color: rupeeAt(level, hidden, i).color };
}

/** 지금까지 판 칸만 보이는 판 (솔버 입력용) */
export function visibleBoard(game: PlayGame): Cell[] {
  const level = LEVELS[game.level];
  return game.hidden.map((_, i) => (game.dug[i] ? revealCell(level, game.hidden, i) : { kind: 'unknown' }));
}

export function dig(game: PlayGame, i: number): PlayGame {
  if (game.status !== 'playing' || game.dug[i]) return game;
  const level = LEVELS[game.level];
  const dug = game.dug.slice();
  dug[i] = true;
  const h = game.hidden[i];
  let earned = game.earned;
  let status: PlayStatus = 'playing';
  if (h === 'bomb') status = 'lost';
  else if (h === 'rupoor') earned = Math.max(0, earned + RUPOOR_VALUE);
  else earned += rupeeAt(level, game.hidden, i).value;
  if (status === 'playing' && game.hidden.every((x, k) => x !== 'rupee' || dug[k])) status = 'won';
  return { ...game, dug, earned, status, lastDug: i };
}

export function isPlayGame(g: unknown): g is PlayGame {
  if (!g || typeof g !== 'object') return false;
  const p = g as PlayGame;
  const level = LEVELS[p.level];
  if (!level) return false;
  const N = level.width * level.height;
  return (
    Array.isArray(p.hidden) &&
    p.hidden.length === N &&
    Array.isArray(p.dug) &&
    p.dug.length === N &&
    typeof p.earned === 'number' &&
    (p.status === 'playing' || p.status === 'won' || p.status === 'lost')
  );
}
