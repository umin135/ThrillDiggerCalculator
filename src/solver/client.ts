import { type Cell, type LevelId, LEVELS } from '../game/levels';
import { analyze } from './analyze';
import type { SimulateRequest, SimulateResponse, SolveRequest, SolveResponse } from './worker';

function spawn(): Worker | null {
  try {
    return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

/** 계산은 Web Worker에서 하고, 결과는 가장 최근 요청의 것만 전달한다. */
export class SolverClient {
  private worker: Worker | null = null;
  private nextId = 0;
  private latest = 0;
  private last: { level: LevelId; board: Cell[] } | null = null;

  constructor(private onResult: (res: SolveResponse) => void) {
    this.worker = spawn();
    if (!this.worker) return;
    this.worker.onmessage = (e: MessageEvent<SolveResponse>) => {
      if (e.data.id === this.latest) this.onResult(e.data);
    };
    this.worker.onerror = () => {
      // Worker를 못 띄우면 마지막 요청을 메인 스레드에서 다시 계산한다.
      this.worker = null;
      if (this.last) this.request(this.last.level, this.last.board);
    };
  }

  request(level: LevelId, board: Cell[]): void {
    const id = ++this.nextId;
    this.latest = id;
    this.last = { level, board };
    if (this.worker) {
      const msg: SolveRequest = { type: 'solve', id, level, board };
      this.worker.postMessage(msg);
      return;
    }
    // Worker를 쓸 수 없는 환경: 메인 스레드에서 바로 계산한다 (수 ms ~ 수십 ms).
    const lv = LEVELS[level];
    const basic = analyze(lv, board, false);
    this.onResult({ type: 'solve', id, phase: 'basic', analysis: basic });
    if (basic.status === 'ok') {
      setTimeout(() => {
        if (id === this.latest)
          this.onResult({ type: 'solve', id, phase: 'full', analysis: analyze(lv, board, true) });
      }, 0);
    }
  }
}

/** 자동 시뮬레이션은 별도 Worker에서 돌리고, 중단하면 Worker를 종료한다. */
export class SimulationClient {
  private worker: Worker | null = null;
  private id = 0;

  get running(): boolean {
    return this.worker !== null;
  }

  start(level: LevelId, games: number, onProgress: (res: SimulateResponse) => void): boolean {
    this.stop();
    const worker = spawn();
    if (!worker) return false;
    this.worker = worker;
    const id = ++this.id;
    worker.onmessage = (e: MessageEvent<SimulateResponse>) => {
      if (e.data.id !== id) return;
      if (e.data.done) this.stop();
      onProgress(e.data);
    };
    const msg: SimulateRequest = { type: 'simulate', id, level, games };
    worker.postMessage(msg);
    return true;
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
