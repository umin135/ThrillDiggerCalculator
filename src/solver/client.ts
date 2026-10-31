import { type Cell, type LevelId, LEVELS } from '../game/levels';
import { analyze } from './analyze';
import type { SolveRequest, SolveResponse } from './worker';

/** 계산은 Web Worker에서 하고, 결과는 가장 최근 요청의 것만 전달한다. */
export class SolverClient {
  private worker: Worker | null = null;
  private nextId = 0;
  private latest = 0;
  private last: { level: LevelId; board: Cell[] } | null = null;

  constructor(private onResult: (res: SolveResponse) => void) {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<SolveResponse>) => {
        if (e.data.id === this.latest) this.onResult(e.data);
      };
      this.worker.onerror = () => {
        // Worker를 못 띄우면 마지막 요청을 메인 스레드에서 다시 계산한다.
        this.worker = null;
        if (this.last) this.request(this.last.level, this.last.board);
      };
    } catch {
      this.worker = null;
    }
  }

  request(level: LevelId, board: Cell[]): void {
    const id = ++this.nextId;
    this.latest = id;
    this.last = { level, board };
    if (this.worker) {
      const msg: SolveRequest = { id, level, board };
      this.worker.postMessage(msg);
      return;
    }
    // Worker를 쓸 수 없는 환경: 메인 스레드에서 바로 계산한다 (수 ms ~ 수십 ms).
    const lv = LEVELS[level];
    const basic = analyze(lv, board, false);
    this.onResult({ id, phase: 'basic', analysis: basic });
    if (basic.status === 'ok') {
      setTimeout(() => {
        if (id === this.latest) this.onResult({ id, phase: 'full', analysis: analyze(lv, board, true) });
      }, 0);
    }
  }
}
