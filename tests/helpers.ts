import { type Cell, type Level, RUPEES, neighbors } from '../src/game/levels';
import { newGame, revealCell } from '../src/game/play';

export { seededRandom as rng } from '../src/game/random';

/** 실제 판에서 폭탄이 아닌 칸을 digs개 파낸 상태 (도둑루피 포함 가능) */
export function randomPosition(level: Level, rand: () => number, digs: number): Cell[] {
  const { hidden } = newGame(level, rand);
  const board: Cell[] = hidden.map(() => ({ kind: 'unknown' }));
  const candidates = hidden.flatMap((t, i) => (t === 'bomb' ? [] : [i]));
  for (let d = 0; d < digs && candidates.length; d++) {
    const i = candidates.splice(Math.floor(rand() * candidates.length), 1)[0];
    board[i] = revealCell(level, hidden, i);
  }
  return board;
}

/**
 * 기준값: 남은 꽝을 미확인 칸에 놓는 모든 조합을 직접 나열한다 (작은 판 전용).
 * 반환: 칸별 꽝 확률, 칸별 "안전 & 각 색 루피" 확률
 */
export function oracle(level: Level, board: Cell[]) {
  const N = level.width * level.height;
  const unknown = board.flatMap((c, i) => (c.kind === 'unknown' ? [i] : []));
  const dugRupoors = board.filter((c) => c.kind === 'rupoor').length;
  const R = level.bombs + level.rupoors - dugRupoors;
  const bad = new Uint8Array(N);
  board.forEach((c, i) => {
    if (c.kind === 'rupoor') bad[i] = 1;
  });
  const badCount = new Float64Array(N);
  const colorCount = Array.from({ length: N }, () => new Float64Array(RUPEES.length));
  let total = 0;
  const nb = Array.from({ length: N }, (_, i) => neighbors(level, i));
  const consistent = () => {
    for (let i = 0; i < N; i++) {
      const c = board[i];
      if (c.kind !== 'rupee') continue;
      const r = RUPEES.find((x) => x.color === c.color)!;
      let n = 0;
      for (const j of nb[i]) n += bad[j];
      if (n < r.min || n > r.max) return false;
    }
    return true;
  };
  const rec = (start: number, left: number) => {
    if (left === 0) {
      if (!consistent()) return;
      total++;
      for (const u of unknown) {
        if (bad[u]) {
          badCount[u]++;
          continue;
        }
        let n = 0;
        for (const j of nb[u]) n += bad[j];
        colorCount[u][RUPEES.findIndex((x) => n >= x.min && n <= x.max)]++;
      }
      return;
    }
    for (let k = start; k <= unknown.length - left; k++) {
      bad[unknown[k]] = 1;
      rec(k + 1, left - 1);
      bad[unknown[k]] = 0;
    }
  };
  rec(0, R);
  return {
    total,
    bad: (i: number) => badCount[i] / total,
    colors: (i: number) => Array.from(colorCount[i], (c) => c / total),
  };
}
