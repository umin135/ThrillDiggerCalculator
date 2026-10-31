import { type Cell, type LevelId, LEVELS } from '../game/levels';
import { seededRandom } from '../game/random';
import { type SimStats, addGame, emptyStats, playOne } from '../game/simulate';
import { analyze } from './analyze';

export interface SolveRequest {
  type: 'solve';
  id: number;
  level: LevelId;
  board: Cell[];
}

export interface SimulateRequest {
  type: 'simulate';
  id: number;
  level: LevelId;
  games: number;
}

export interface SolveResponse {
  type: 'solve';
  id: number;
  /** basic: 폭탄 확률만, full: 루피 색 분포와 기대값까지 */
  phase: 'basic' | 'full';
  analysis: ReturnType<typeof analyze>;
}

export interface SimulateResponse {
  type: 'simulate';
  id: number;
  done: boolean;
  stats: SimStats;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<SolveRequest | SimulateRequest>) => void) | null;
  postMessage(msg: SolveResponse | SimulateResponse): void;
};

let latest = 0;
const queue: SolveRequest[] = [];
let running = false;

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'simulate') {
    void simulate(msg);
    return;
  }
  latest = msg.id;
  queue.push(msg);
  if (!running) void drain();
};

const tick = () => new Promise((r) => setTimeout(r, 0));

// 기대값 계산 전에 한 번 양보해서, 그사이 들어온 새 요청이 있으면 오래된 계산을 건너뛴다.
async function drain(): Promise<void> {
  running = true;
  while (queue.length) {
    const req = queue.shift()!;
    if (req.id !== latest) continue;
    const level = LEVELS[req.level];
    const basic = analyze(level, req.board, false);
    scope.postMessage({ type: 'solve', id: req.id, phase: 'basic', analysis: basic });
    if (basic.status !== 'ok') continue;
    await tick();
    if (req.id !== latest) continue;
    scope.postMessage({ type: 'solve', id: req.id, phase: 'full', analysis: analyze(level, req.board, true) });
  }
  running = false;
}

async function simulate(req: SimulateRequest): Promise<void> {
  const level = LEVELS[req.level];
  const rand = seededRandom((Date.now() ^ (req.id * 0x9e3779b1)) >>> 0);
  const stats = emptyStats();
  let lastPost = performance.now();
  while (stats.games < req.games) {
    addGame(stats, level, playOne(level, rand));
    if (performance.now() - lastPost > 100) {
      scope.postMessage({ type: 'simulate', id: req.id, done: false, stats: { ...stats } });
      lastPost = performance.now();
      await tick();
    }
  }
  scope.postMessage({ type: 'simulate', id: req.id, done: true, stats });
}
