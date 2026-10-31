import { type Cell, type Level, RUPEES, RUPEE_BY_COLOR, RUPOOR_VALUE, neighbors } from '../game/levels';
import { type Constraint, sweep } from './sweepDp';

export interface CellOdds {
  /** 꽝(폭탄 또는 도둑루피)일 확률 */
  bad: number;
  bomb: number;
  rupoor: number;
  /** RUPEES 순서대로 "안전하고 그 색 루피가 나올" 확률. 합은 1 - bad. */
  colors: number[] | null;
  /** 이 칸을 팠을 때 얻는 루피 기대값 (폭탄으로 끝나는 손실은 포함하지 않음) */
  expected: number | null;
}

export type Analysis =
  | {
      status: 'ok';
      odds: (CellOdds | null)[];
      remainingBombs: number;
      remainingRupoors: number;
      unknownCount: number;
      /** 아직 안 판 루피 칸 수 */
      safeLeft: number;
      /** 폭탄 확률이 가장 낮은 칸 (동률이면 기대값이 큰 칸) */
      bestSafe: number | null;
      /** 기대값이 가장 큰 칸 */
      bestValue: number | null;
      withExpected: boolean;
    }
  | { status: 'invalid'; reason: string; cells: number[] }
  | { status: 'gameover'; cells: number[] };

const EPS = 1e-12;

export function analyze(level: Level, board: Cell[], withExpected: boolean): Analysis {
  const N = level.width * level.height;
  const bombCells: number[] = [];
  let dugRupoors = 0;
  let unknownCount = 0;
  for (let i = 0; i < N; i++) {
    const c = board[i];
    if (c.kind === 'bomb') bombCells.push(i);
    else if (c.kind === 'rupoor') dugRupoors++;
    else if (c.kind === 'unknown') unknownCount++;
  }
  if (bombCells.length > 0) return { status: 'gameover', cells: bombCells };
  if (dugRupoors > level.rupoors) {
    const cells = board.flatMap((c, i) => (c.kind === 'rupoor' ? [i] : []));
    return {
      status: 'invalid',
      reason:
        level.rupoors === 0
          ? `${level.name}에는 도둑루피가 없습니다.`
          : `${level.name}의 도둑루피는 ${level.rupoors}개뿐입니다.`,
      cells,
    };
  }
  const remainingRupoors = level.rupoors - dugRupoors;
  const R = level.bombs + remainingRupoors;
  if (unknownCount < R) {
    return {
      status: 'invalid',
      reason: `남은 꽝 ${R}개를 숨길 칸이 부족합니다. 루피를 너무 많이 입력했어요.`,
      cells: [],
    };
  }

  // 루피 칸마다 "주변 미확인 칸 중 꽝 수"에 대한 범위 제약을 만든다.
  const constraints: Constraint[] = [];
  const conflicts: number[] = [];
  const frontier = new Set<number>();
  for (let i = 0; i < N; i++) {
    const c = board[i];
    if (c.kind !== 'rupee') continue;
    const info = RUPEE_BY_COLOR[c.color];
    let known = 0;
    const vars: number[] = [];
    for (const j of neighbors(level, i)) {
      const nc = board[j];
      if (nc.kind === 'rupoor') known++;
      else if (nc.kind === 'unknown') vars.push(j);
    }
    const lo = Math.max(0, info.min - known);
    const hi = info.max - known;
    if (hi < 0 || lo > vars.length) {
      conflicts.push(i);
      continue;
    }
    if (vars.length === 0) continue;
    constraints.push({ vars, lo, hi });
    for (const v of vars) frontier.add(v);
  }
  if (conflicts.length > 0) {
    return {
      status: 'invalid',
      reason: '주변 칸과 맞지 않는 루피가 있습니다.',
      cells: conflicts,
    };
  }

  const vars = [...frontier];
  const free = unknownCount - vars.length;
  const base = sweep({ width: level.width, vars, constraints, free, remaining: R, marginals: true });
  if (base.total === 0) {
    return {
      status: 'invalid',
      reason: '입력한 루피들을 동시에 만족하는 배치가 없습니다.',
      cells: [],
    };
  }

  const pFree = free > 0 ? base.freeBad / base.total / free : 0;
  const bombShare = R > 0 ? level.bombs / R : 0;
  const odds: (CellOdds | null)[] = board.map((c, i) => {
    if (c.kind !== 'unknown') return null;
    const m = base.marginals.get(i);
    const bad = m === undefined ? pFree : m / base.total;
    return { bad, bomb: bad * bombShare, rupoor: bad * (1 - bombShare), colors: null, expected: null };
  });

  if (withExpected) {
    for (let t = 0; t < N; t++) {
      const o = odds[t];
      if (!o) continue;
      const probe: number[] = [];
      let knownBad = 0;
      for (const j of neighbors(level, t)) {
        if (board[j].kind === 'unknown') probe.push(j);
        else if (board[j].kind === 'rupoor') knownBad++;
      }
      const pv = new Set([...vars, t, ...probe]);
      const r = sweep({
        width: level.width,
        vars: [...pv],
        constraints,
        free: unknownCount - pv.size,
        remaining: R,
        forcedSafe: [t],
        probe,
      });
      const colors = RUPEES.map((info) => {
        let w = 0;
        for (let s = 0; s < r.probe.length; s++) {
          const count = s + knownBad;
          if (count >= info.min && count <= info.max) w += r.probe[s];
        }
        return w / base.total;
      });
      o.colors = colors;
      o.expected =
        colors.reduce((acc, p, idx) => acc + p * RUPEES[idx].value, 0) + o.rupoor * RUPOOR_VALUE;
    }
  }

  let bestSafe: number | null = null;
  let bestValue: number | null = null;
  odds.forEach((o, i) => {
    if (!o) return;
    if (bestSafe === null) bestSafe = i;
    else {
      const b = odds[bestSafe]!;
      if (
        o.bomb < b.bomb - EPS ||
        (Math.abs(o.bomb - b.bomb) <= EPS && (o.expected ?? 0) > (b.expected ?? 0) + EPS)
      )
        bestSafe = i;
    }
    if (o.expected !== null && (bestValue === null || o.expected > odds[bestValue]!.expected! + EPS))
      bestValue = i;
  });

  const safeLeft = unknownCount - R;
  if (safeLeft === 0) {
    bestSafe = null;
    bestValue = null;
  }

  return {
    status: 'ok',
    odds,
    remainingBombs: level.bombs,
    remainingRupoors,
    unknownCount,
    safeLeft,
    bestSafe,
    bestValue,
    withExpected,
  };
}
