import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_ORDER, neighbors } from '../src/game/levels';
import { dig, newGame, rupeeAt, visibleBoard } from '../src/game/play';
import { addGame, emptyStats, playOne } from '../src/game/simulate';
import { analyze } from '../src/solver/analyze';
import { rng } from './helpers';

describe('Play 모드 판 생성', () => {
  for (const id of LEVEL_ORDER) {
    it(`${LEVELS[id].name}: 폭탄·도둑루피 개수가 맞다`, () => {
      const level = LEVELS[id];
      const rand = rng(10);
      for (let t = 0; t < 50; t++) {
        const g = newGame(level, rand);
        expect(g.hidden.filter((h) => h === 'bomb')).toHaveLength(level.bombs);
        expect(g.hidden.filter((h) => h === 'rupoor')).toHaveLength(level.rupoors);
      }
    });
  }

  it('루피 색은 주변 꽝 개수 범위와 맞는다', () => {
    const level = LEVELS.expert;
    const g = newGame(level, rng(11));
    g.hidden.forEach((h, i) => {
      if (h !== 'rupee') return;
      const bad = neighbors(level, i).filter((j) => g.hidden[j] !== 'rupee').length;
      const r = rupeeAt(level, g.hidden, i);
      expect(bad).toBeGreaterThanOrEqual(r.min);
      expect(bad).toBeLessThanOrEqual(r.max);
    });
  });
});

describe('파기', () => {
  it('루피를 모두 파면 승리, 폭탄을 파면 패배', () => {
    const level = LEVELS.beginner;
    let g = newGame(level, rng(12));
    const safe = g.hidden.flatMap((h, i) => (h === 'rupee' ? [i] : []));
    for (const i of safe.slice(0, -1)) g = dig(g, i);
    expect(g.status).toBe('playing');
    g = dig(g, safe[safe.length - 1]);
    expect(g.status).toBe('won');

    let lost = newGame(level, rng(12));
    lost = dig(lost, lost.hidden.indexOf('bomb'));
    expect(lost.status).toBe('lost');
    // 끝난 판은 더 파지지 않는다
    expect(dig(lost, safe[0])).toBe(lost);
  });

  it('도둑루피는 −10이지만 0 아래로 내려가지 않는다', () => {
    const level = LEVELS.intermediate;
    let g = newGame(level, rng(13));
    g = dig(g, g.hidden.indexOf('rupoor'));
    expect(g.status).toBe('playing');
    expect(g.earned).toBe(0);
    const safe = g.hidden.findIndex((h) => h === 'rupee');
    g = dig(g, safe);
    const v = rupeeAt(level, g.hidden, safe).value;
    expect(g.earned).toBe(v);
  });

  it('보이는 판은 솔버가 항상 유효하다고 판단한다', () => {
    const level = LEVELS.expert;
    const rand = rng(14);
    for (let t = 0; t < 30; t++) {
      let g = newGame(level, rand);
      const order = g.hidden.flatMap((h, i) => (h === 'bomb' ? [] : [i])).sort(() => rand() - 0.5);
      for (const i of order.slice(0, 10)) g = dig(g, i);
      expect(analyze(level, visibleBoard(g), false).status).toBe('ok');
    }
  });
});

describe('자동 시뮬레이션', () => {
  it('추천대로 두면 판이 끝까지 진행된다', () => {
    const rand = rng(15);
    for (const id of LEVEL_ORDER) {
      const level = LEVELS[id];
      const stats = emptyStats();
      for (let t = 0; t < 20; t++) addGame(stats, level, playOne(level, rand));
      expect(stats.games).toBe(20);
      expect(stats.won + stats.lost).toBe(20);
      expect(stats.digs).toBeGreaterThan(20);
    }
  });
});
