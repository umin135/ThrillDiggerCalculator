import { type Level, neighbors } from './levels';
import { dig, newGame, visibleBoard } from './play';
import { analyze } from '../solver/analyze';

export interface SimStats {
  games: number;
  won: number;
  lost: number;
  /** 참가비를 뺀 손익 합계 */
  net: number;
  /** 모은 루피 합계 */
  earned: number;
  digs: number;
}

export function emptyStats(): SimStats {
  return { games: 0, won: 0, lost: 0, net: 0, earned: 0, digs: 0 };
}

/**
 * 솔버 추천대로 한 판을 끝까지 둔다.
 * 폭탄 확률이 가장 낮은 칸을 고르고, 동률이면 주변에 안 판 칸이 많은 칸(정보·기대값이 큰 쪽)을 고른다.
 * 루피 색 분포까지 계산하는 기대값 비교는 느려서 시뮬레이션에서는 쓰지 않는다.
 */
export function playOne(level: Level, rand: () => number): { won: boolean; earned: number; digs: number } {
  let game = newGame(level, rand);
  let digs = 0;
  while (game.status === 'playing') {
    const board = visibleBoard(game);
    const a = analyze(level, board, false);
    if (a.status !== 'ok') throw new Error(`simulation reached ${a.status}`);
    let best = -1;
    let bestBomb = Infinity;
    let bestOpen = -1;
    a.odds.forEach((o, i) => {
      if (!o) return;
      const open = neighbors(level, i).filter((j) => board[j].kind === 'unknown').length;
      if (o.bomb < bestBomb - 1e-12 || (Math.abs(o.bomb - bestBomb) <= 1e-12 && open > bestOpen)) {
        best = i;
        bestBomb = o.bomb;
        bestOpen = open;
      }
    });
    game = dig(game, best);
    digs++;
  }
  return { won: game.status === 'won', earned: game.earned, digs };
}

export function addGame(stats: SimStats, level: Level, r: { won: boolean; earned: number; digs: number }): void {
  stats.games++;
  if (r.won) stats.won++;
  else stats.lost++;
  stats.earned += r.earned;
  stats.net += r.earned - level.fee;
  stats.digs += r.digs;
}
