import { type Cell, type LevelId, LEVELS } from '../game/levels';
import { analyze } from './analyze';

export interface SolveRequest {
  id: number;
  level: LevelId;
  board: Cell[];
}

export interface SolveResponse {
  id: number;
  /** basic: 폭탄 확률만, full: 루피 색 분포와 기대값까지 */
  phase: 'basic' | 'full';
  analysis: ReturnType<typeof analyze>;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<SolveRequest>) => void) | null;
  postMessage(msg: SolveResponse): void;
};

let latest = 0;
const queue: SolveRequest[] = [];
let running = false;

scope.onmessage = (e) => {
  latest = e.data.id;
  queue.push(e.data);
  if (!running) void drain();
};

// 기대값 계산 전에 한 번 양보해서, 그사이 들어온 새 요청이 있으면 오래된 계산을 건너뛴다.
async function drain(): Promise<void> {
  running = true;
  while (queue.length) {
    const req = queue.shift()!;
    if (req.id !== latest) continue;
    const level = LEVELS[req.level];
    const basic = analyze(level, req.board, false);
    scope.postMessage({ id: req.id, phase: 'basic', analysis: basic });
    if (basic.status !== 'ok') continue;
    await new Promise((r) => setTimeout(r, 0));
    if (req.id !== latest) continue;
    scope.postMessage({ id: req.id, phase: 'full', analysis: analyze(level, req.board, true) });
  }
  running = false;
}
