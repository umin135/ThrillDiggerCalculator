/**
 * 열 단위 sweep DP(전이 행렬)로 "단서와 모순 없는 꽝 배치"의 가중 개수를 센다.
 *
 * - 변수(vars)는 꽝 여부(0/1)를 정할 칸들이다. 열 우선 순서로 하나씩 정한다.
 * - 상태 = (지금까지 꽝 수 k, 탐지 칸 꽝 수, 아직 닫히지 않은 제약들의 부분합).
 *   판 높이가 4~5칸이라 동시에 열린 제약이 적어서 상태 수가 작다.
 * - 변수 밖의 미확인 칸(free)은 아무 제약이 없으므로 마지막에 C(free, R - k)를 곱한다.
 * - forward 개수 f와 backward 개수 b를 곱해 각 변수의 주변 가중치를 한 번에 얻는다.
 *
 * 모든 가중치는 정수이며 최대 C(40, 16) ≈ 6.3e10 < 2^53 이라 number로 정확하다.
 */

export interface Constraint {
  vars: number[];
  lo: number;
  hi: number;
}

export interface DpProblem {
  width: number;
  vars: number[];
  constraints: Constraint[];
  /** 변수 밖에 있는 미확인 칸 수 */
  free: number;
  /** 아직 숨어 있는 꽝 수 */
  remaining: number;
  /** 반드시 꽝이 아닌 변수 */
  forcedSafe?: number[];
  /** 꽝 개수 분포를 끝까지 추적할 변수 */
  probe?: number[];
  marginals?: boolean;
}

export interface DpResult {
  total: number;
  /** 변수별로 "그 칸이 꽝인" 배치의 가중치 */
  marginals: Map<number, number>;
  /** free 칸 전체에 들어간 꽝 개수의 가중 합 (free 칸 확률 = freeBad / total / free) */
  freeBad: number;
  /** probe[s] = 탐지 칸 꽝 수가 s인 배치의 가중치 */
  probe: number[];
}

const MAX_N = 64;
const PASCAL: number[][] = (() => {
  const t: number[][] = [];
  for (let n = 0; n <= MAX_N; n++) {
    t.push(new Array(n + 1).fill(1));
    for (let k = 1; k < n; k++) t[n][k] = t[n - 1][k - 1] + t[n - 1][k];
  }
  return t;
})();

export function binom(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  return PASCAL[n][k];
}

interface State {
  k: number;
  ps: number;
  s: number[];
  f: number;
  b: number;
  n0: State | null;
  n1: State | null;
}

export function sweep(problem: DpProblem): DpResult {
  const { width, constraints, free, remaining: R } = problem;
  const order = [...problem.vars].sort((a, b) => (a % width) - (b % width) || a - b);
  const n = order.length;
  const pos = new Map<number, number>();
  order.forEach((v, p) => pos.set(v, p));
  const forced = new Uint8Array(n);
  for (const v of problem.forcedSafe ?? []) forced[pos.get(v)!] = 1;
  const probe = new Uint8Array(n);
  for (const v of problem.probe ?? []) probe[pos.get(v)!] = 1;
  const probeSize = problem.probe?.length ?? 0;

  // 제약별 첫/마지막 위치와, 각 위치 이후 남은 변수 수
  const first: number[] = [];
  const last: number[] = [];
  const touch: { ci: number; after: number }[][] = order.map(() => []);
  constraints.forEach((c, ci) => {
    const ps = c.vars.map((v) => pos.get(v)!).sort((a, b) => a - b);
    first.push(ps[0]);
    last.push(ps[ps.length - 1]);
    ps.forEach((p, idx) => touch[p].push({ ci, after: ps.length - 1 - idx }));
  });
  // open[p] = p번째 변수를 정하기 직전에 열려 있는 제약 (first < p <= last)
  const open: number[][] = [];
  const slot: Map<number, number>[] = [];
  for (let p = 0; p <= n; p++) {
    const list: number[] = [];
    constraints.forEach((_, ci) => {
      if (first[ci] < p && last[ci] >= p) list.push(ci);
    });
    open.push(list);
    slot.push(new Map(list.map((ci, i) => [ci, i])));
  }

  const start: State = { k: 0, ps: 0, s: [], f: 1, b: 0, n0: null, n1: null };
  let layer: State[] = [start];
  const layers: State[][] = [layer];

  for (let p = 0; p < n; p++) {
    const next = new Map<string, State>();
    const nextOpen = open[p + 1];
    const curSlot = slot[p];
    const tp = touch[p];
    // 남은 변수와 free 칸을 모두 꽝으로 채워도 R에 못 미치면 가지치기
    const capacityAfter = n - p - 1 + free;
    for (const st of layer) {
      for (let val = 0; val <= 1; val++) {
        if (val === 1 && forced[p]) continue;
        const k = st.k + val;
        if (k > R || R - k > capacityAfter) continue;
        let ok = true;
        const delta = new Map<number, number>();
        for (const { ci, after } of tp) {
          const i = curSlot.get(ci);
          const sum = (i === undefined ? 0 : st.s[i]) + val;
          const c = constraints[ci];
          if (sum > c.hi || sum + after < c.lo) {
            ok = false;
            break;
          }
          delta.set(ci, sum);
        }
        if (!ok) continue;
        const s = nextOpen.map((ci) => {
          const d = delta.get(ci);
          if (d !== undefined) return d;
          const i = curSlot.get(ci);
          return i === undefined ? 0 : st.s[i];
        });
        const ps = st.ps + (probe[p] ? val : 0);
        const key = `${k},${ps}|${s.join(',')}`;
        let nx = next.get(key);
        if (nx) nx.f += st.f;
        else {
          nx = { k, ps, s, f: st.f, b: 0, n0: null, n1: null };
          next.set(key, nx);
        }
        if (val) st.n1 = nx;
        else st.n0 = nx;
      }
    }
    layer = [...next.values()];
    layers.push(layer);
  }

  let total = 0;
  let freeBad = 0;
  const probeDist = new Array<number>(probeSize + 1).fill(0);
  for (const st of layer) {
    st.b = binom(free, R - st.k);
    const w = st.f * st.b;
    total += w;
    probeDist[st.ps] += w;
    if (free > 0) freeBad += st.f * binom(free - 1, R - st.k - 1) * free;
  }

  const marginals = new Map<number, number>();
  if (problem.marginals) {
    for (let p = n - 1; p >= 0; p--) {
      let m = 0;
      for (const st of layers[p]) {
        st.b = (st.n0 ? st.n0.b : 0) + (st.n1 ? st.n1.b : 0);
        if (st.n1) m += st.f * st.n1.b;
      }
      marginals.set(order[p], m);
    }
  }

  return { total, marginals, freeBad, probe: probeDist };
}
