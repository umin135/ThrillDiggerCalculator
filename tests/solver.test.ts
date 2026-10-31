import { describe, expect, it } from 'vitest';
import { type Cell, type Level, LEVELS, emptyBoard } from '../src/game/levels';
import { analyze } from '../src/solver/analyze';
import { oracle, randomPosition, rng } from './helpers';

const TOL = 1e-9;

// 전수 나열은 조합 수가 커서 난이도마다 판 수와 파낸 칸 수를 조정한다.
// mini: 도둑루피가 섞인 경우를 더 많이 검증하기 위한 작은 가상 난이도
const ORACLE_CASES: { level: Level; boards: number; minDigs: number; maxDigs: number; seed: number }[] = [
  { level: LEVELS.beginner, boards: 120, minDigs: 1, maxDigs: 9, seed: 1 },
  { level: LEVELS.intermediate, boards: 25, minDigs: 9, maxDigs: 16, seed: 2 },
  {
    level: { id: 'beginner', name: 'mini', width: 5, height: 5, bombs: 2, rupoors: 3, fee: 0 },
    boards: 120,
    minDigs: 1,
    maxDigs: 10,
    seed: 3,
  },
];

describe('analyze vs 전수 나열', () => {
  for (const { level, boards, minDigs, maxDigs, seed } of ORACLE_CASES) {
    it(`${level.name}: 꽝 확률과 루피 색 분포가 일치한다`, { timeout: 120_000 }, () => {
      const rand = rng(seed);
      let checked = 0;
      for (let t = 0; t < boards; t++) {
        const digs = minDigs + Math.floor(rand() * (maxDigs - minDigs + 1));
        const board = randomPosition(level, rand, digs);
        const a = analyze(level, board, true);
        expect(a.status).toBe('ok');
        if (a.status !== 'ok') continue;
        const o = oracle(level, board);
        a.odds.forEach((odds, i) => {
          if (!odds) return;
          expect(Math.abs(odds.bad - o.bad(i))).toBeLessThan(TOL);
          const oc = o.colors(i);
          odds.colors!.forEach((p, k) => expect(Math.abs(p - oc[k])).toBeLessThan(TOL));
          checked++;
        });
      }
      expect(checked).toBeGreaterThan(200);
    });
  }
});

describe('기본 성질', () => {
  it('빈 판의 확률은 꽝 비율과 같다', () => {
    const level = LEVELS.expert;
    const a = analyze(level, emptyBoard(level), true);
    if (a.status !== 'ok') throw new Error(a.status);
    for (const o of a.odds) {
      expect(o!.bad).toBeCloseTo(16 / 40, 12);
      expect(o!.bomb).toBeCloseTo(8 / 40, 12);
      expect(o!.rupoor).toBeCloseTo(8 / 40, 12);
    }
  });

  it('색 분포의 합은 1 - 꽝 확률이다', () => {
    const level = LEVELS.expert;
    const rand = rng(3);
    for (let t = 0; t < 30; t++) {
      const a = analyze(level, randomPosition(level, rand, 6), true);
      if (a.status !== 'ok') throw new Error(a.status);
      for (const o of a.odds) {
        if (!o) continue;
        const sum = o.colors!.reduce((x, y) => x + y, 0);
        expect(sum + o.bad).toBeCloseTo(1, 9);
      }
    }
  });

  it('녹색 루피 주변은 안전하다', () => {
    const level = LEVELS.beginner;
    const board = emptyBoard(level);
    board[0] = { kind: 'rupee', color: 'green' };
    const a = analyze(level, board, false);
    if (a.status !== 'ok') throw new Error(a.status);
    for (const i of [1, 5, 6]) expect(a.odds[i]!.bad).toBe(0);
    expect(a.bestSafe).not.toBeNull();
    expect(a.odds[a.bestSafe!]!.bomb).toBe(0);
  });

  it('도둑루피를 파면 남은 꽝 중 폭탄 비율이 올라간다', () => {
    const level = LEVELS.intermediate;
    const board = emptyBoard(level);
    board[0] = { kind: 'rupoor' };
    const a = analyze(level, board, false);
    if (a.status !== 'ok') throw new Error(a.status);
    const o = a.odds[29]!;
    expect(o.bad).toBeCloseTo(7 / 29, 12);
    expect(o.bomb).toBeCloseTo(4 / 29, 12);
  });

  it('모순된 입력을 잡아낸다', () => {
    const level = LEVELS.beginner;
    const corner: Cell[] = emptyBoard(level);
    corner[0] = { kind: 'rupee', color: 'gold' }; // 모서리 칸은 이웃이 3칸뿐
    expect(analyze(level, corner, false)).toMatchObject({ status: 'invalid', cells: [0] });

    const rupoor = emptyBoard(level);
    rupoor[3] = { kind: 'rupoor' };
    expect(analyze(level, rupoor, false).status).toBe('invalid');

    const pair = emptyBoard(level);
    pair[0] = { kind: 'rupee', color: 'green' };
    pair[1] = { kind: 'rupee', color: 'red' }; // 이웃 중 0,5,6은 녹색 때문에 안전 → 2,7만 남음
    expect(analyze(level, pair, false).status).toBe('invalid');

    const bomb = emptyBoard(level);
    bomb[4] = { kind: 'bomb' };
    expect(analyze(level, bomb, false)).toMatchObject({ status: 'gameover', cells: [4] });
  });
});
