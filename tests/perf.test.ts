import { expect, it } from 'vitest';
import { LEVELS } from '../src/game/levels';
import { analyze } from '../src/solver/analyze';
import { randomPosition, rng } from './helpers';

it('상급 무작위 판: 확률 계산이 충분히 빠르다', () => {
  const level = LEVELS.expert;
  const rand = rng(42);
  let worstBasic = 0;
  let worstFull = 0;
  for (let t = 0; t < 400; t++) {
    const board = randomPosition(level, rand, 1 + Math.floor(rand() * 20));
    let t0 = performance.now();
    analyze(level, board, false);
    worstBasic = Math.max(worstBasic, performance.now() - t0);
    if (t % 4 === 0) {
      t0 = performance.now();
      analyze(level, board, true);
      worstFull = Math.max(worstFull, performance.now() - t0);
    }
  }
  console.log(`worst basic ${worstBasic.toFixed(1)}ms, worst with expected ${worstFull.toFixed(1)}ms`);
  // CI 환경 편차를 고려한 넉넉한 상한
  expect(worstBasic).toBeLessThan(100);
  expect(worstFull).toBeLessThan(2000);
});
