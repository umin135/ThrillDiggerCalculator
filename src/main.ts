import {
  type Cell,
  LEVELS,
  LEVEL_ORDER,
  type LevelId,
  RUPEES,
  RUPEE_BY_COLOR,
  RUPOOR_VALUE,
} from './game/levels';
import { revealCell, visibleBoard } from './game/play';
import { type AppMode, type RecommendMode, Store } from './game/state';
import type { Analysis, CellOdds } from './solver/analyze';
import { SimulationClient, SolverClient } from './solver/client';
import { pct, position, signed } from './ui/format';
import { bombIcon, gemIcon } from './ui/icons';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const store = new Store();
let analysis: Analysis | null = null;
/** 입력 직후 아직 결과가 오지 않은 상태 */
let pending = true;
let focusIndex = 0;
let sheetIndex: number | null = null;
/** 판을 다시 만들어야 하는지 판단하는 키 (모드 + 난이도) */
let renderedKey: string | null = null;

const solver = new SolverClient((res) => {
  analysis = res.analysis;
  pending = false;
  render();
});
const simulation = new SimulationClient();

const els = {
  app: $('app'),
  levels: $('levels'),
  summary: $('summary'),
  board: $('board'),
  advice: $('advice'),
  mode: $('mode'),
  solveActions: $('solve-actions'),
  undo: $<HTMLButtonElement>('undo'),
  redo: $<HTMLButtonElement>('redo'),
  clear: $<HTMLButtonElement>('clear'),
  playActions: $('play-actions'),
  hints: $<HTMLButtonElement>('hints'),
  autoDig: $<HTMLButtonElement>('auto-dig'),
  newPlay: $<HTMLButtonElement>('new-play'),
  money: $('money'),
  playExtra: $('play-extra'),
  record: $('record'),
  simGames: $<HTMLSelectElement>('sim-games'),
  simRun: $<HTMLButtonElement>('sim-run'),
  simResult: $('sim-result'),
  legend: $('legend'),
  sheet: $<HTMLDialogElement>('sheet'),
  sheetTitle: $('sheet-title'),
  sheetOdds: $('sheet-odds'),
  picks: $('picks'),
};

const isPlay = () => store.app === 'play';

/** 지금 화면에 보이는 판: 계산 모드는 입력한 판, 연습 모드는 지금까지 판 칸 */
function currentBoard(): Cell[] {
  return isPlay() ? visibleBoard(store.game) : store.board;
}

// ---------- 고정 UI ----------

els.app.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-app]');
  if (btn) store.setApp(btn.dataset.app as AppMode);
});

els.levels.innerHTML = LEVEL_ORDER.map((id) => {
  const lv = LEVELS[id];
  return `<button type="button" data-level="${id}">
    <span class="lv-name">${lv.name}</span>
    <span class="lv-meta">${lv.width}×${lv.height} · 참가비 ${lv.fee}</span>
    <span class="lv-meta">폭탄 ${lv.bombs} · 도둑루피 ${lv.rupoors}</span>
  </button>`;
}).join('');
els.levels.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-level]');
  if (btn) store.setLevel(btn.dataset.level as LevelId);
});

els.mode.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
  if (btn) store.setMode(btn.dataset.mode as RecommendMode);
});
els.undo.addEventListener('click', () => store.undo());
els.redo.addEventListener('click', () => store.redo());
els.clear.addEventListener('click', () => store.clear());

els.hints.addEventListener('click', () => store.setHints(!store.hints));
els.newPlay.addEventListener('click', () => store.newPlay());
els.autoDig.addEventListener('click', () => {
  const best = pending ? null : recommended();
  if (best !== null) store.dig(best);
});
els.record.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button[data-reset]')) store.resetRecord();
});

els.simRun.addEventListener('click', () => {
  if (simulation.running) {
    simulation.stop();
    els.simRun.textContent = '시작';
    els.simResult.insertAdjacentHTML('beforeend', '<p class="note">중단했습니다.</p>');
    return;
  }
  const level = LEVELS[store.level];
  const games = Number(els.simGames.value);
  const ok = simulation.start(level.id, games, (res) => {
    const s = res.stats;
    const rate = s.games ? (s.won / s.games) * 100 : 0;
    els.simResult.innerHTML = `<p><strong>${level.name}</strong> ${s.games.toLocaleString()} / ${games.toLocaleString()}판${
      res.done ? '' : ' 진행 중…'
    }</p>
      <ul class="chips">
        <li><span>모두 찾음</span><strong>${rate.toFixed(1)}%</strong></li>
        <li><span>평균 획득</span><strong>${s.games ? (s.earned / s.games).toFixed(1) : '0'}</strong></li>
        <li><span>평균 손익</span><strong class="${s.net >= 0 ? 'pos' : 'neg'}">${
          s.games ? signed(s.net / s.games, 1) : '0'
        }</strong></li>
        <li><span>판당 판 칸</span><strong>${s.games ? (s.digs / s.games).toFixed(1) : '0'}</strong></li>
      </ul>`;
    if (res.done) els.simRun.textContent = '시작';
  });
  if (ok) {
    els.simRun.textContent = '중단';
    els.simResult.innerHTML = '<p class="note">시작하는 중…</p>';
  } else {
    els.simResult.innerHTML = '<p class="note">이 브라우저에서는 시뮬레이션을 실행할 수 없습니다.</p>';
  }
});

els.legend.innerHTML =
  `<thead><tr><th>파낸 것</th><th>값</th><th>주변 8칸의 꽝</th></tr></thead><tbody>` +
  RUPEES.map(
    (r) =>
      `<tr><td>${gemIcon(r.color)} ${r.name}</td><td>${r.value}</td><td>${
        r.min === r.max ? `${r.min}개` : `${r.min}~${r.max}개`
      }</td></tr>`,
  ).join('') +
  `<tr><td>${gemIcon('rupoor')} 도둑루피</td><td>${RUPOOR_VALUE}</td><td>(꽝)</td></tr>` +
  `<tr><td>${bombIcon()} 폭탄</td><td>—</td><td>(꽝, 게임 오버)</td></tr></tbody>`;

// 입력 시트의 선택지
interface Pick {
  cell: Cell;
  label: string;
  sub: string;
  key: string;
  icon: string;
}
const PICKS: Pick[] = [
  ...RUPEES.map((r) => ({
    cell: { kind: 'rupee', color: r.color } as Cell,
    label: r.name,
    sub: r.min === r.max ? `꽝 ${r.min}` : `꽝 ${r.min}~${r.max}`,
    key: r.key,
    icon: gemIcon(r.color),
  })),
  { cell: { kind: 'rupoor' }, label: '도둑루피', sub: '−10', key: 'R', icon: gemIcon('rupoor') },
  { cell: { kind: 'bomb' }, label: '폭탄', sub: '게임 오버', key: 'B', icon: bombIcon() },
  { cell: { kind: 'unknown' }, label: '지우기', sub: '안 판 칸', key: '0', icon: '<span class="hole-icon"></span>' },
];
els.picks.innerHTML = PICKS.map(
  (p, i) => `<button type="button" class="pick" data-pick="${i}">
    ${p.icon}<span class="pick-label">${p.label}</span><span class="pick-sub">${p.sub}</span><kbd>${p.key}</kbd>
  </button>`,
).join('');
els.picks.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pick]');
  if (!btn || sheetIndex === null) return;
  const idx = sheetIndex;
  els.sheet.close();
  store.setCell(idx, PICKS[Number(btn.dataset.pick)].cell);
});
els.sheet.addEventListener('close', () => {
  const idx = sheetIndex;
  sheetIndex = null;
  if (idx !== null) cellButtons()[idx]?.focus();
});
// 바깥(배경)을 누르면 닫기
els.sheet.addEventListener('click', (e) => {
  if (e.target === els.sheet) els.sheet.close();
});

// ---------- 게임판 ----------

function cellButtons(): HTMLButtonElement[] {
  return [...els.board.querySelectorAll<HTMLButtonElement>('button.cell')];
}

function buildBoard(): void {
  const lv = LEVELS[store.level];
  els.board.style.setProperty('--cols', String(lv.width));
  els.board.dataset.level = lv.id;
  let html = '';
  for (let y = 0; y < lv.height; y++) {
    html += '<div class="row" role="row">';
    for (let x = 0; x < lv.width; x++) {
      const i = y * lv.width + x;
      html += `<button type="button" class="cell" role="gridcell" data-i="${i}" tabindex="-1"></button>`;
    }
    html += '</div>';
  }
  els.board.innerHTML = html;
  focusIndex = Math.min(focusIndex, lv.width * lv.height - 1);
  renderedKey = `${store.app}:${lv.id}`;
}

els.board.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.cell');
  if (!btn) return;
  focusIndex = Number(btn.dataset.i);
  if (isPlay()) store.dig(focusIndex);
  else openSheet(focusIndex);
});

els.board.addEventListener('keydown', (e) => {
  const lv = LEVELS[store.level];
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.cell');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  const x = i % lv.width;
  const y = Math.floor(i / lv.width);
  let next: number | null = null;
  if (e.key === 'ArrowLeft' && x > 0) next = i - 1;
  else if (e.key === 'ArrowRight' && x < lv.width - 1) next = i + 1;
  else if (e.key === 'ArrowUp' && y > 0) next = i - lv.width;
  else if (e.key === 'ArrowDown' && y < lv.height - 1) next = i + lv.width;
  if (next !== null) {
    e.preventDefault();
    moveFocus(next);
    return;
  }
  if (isPlay() || e.ctrlKey || e.metaKey || e.altKey) return;
  const pick = pickForKey(e.key);
  if (pick) {
    e.preventDefault();
    store.setCell(i, pick.cell);
  }
});

function pickForKey(key: string): Pick | undefined {
  const k = key === 'Delete' || key === 'Backspace' ? '0' : key.toUpperCase();
  return PICKS.find((p) => p.key === k);
}

function moveFocus(i: number): void {
  focusIndex = i;
  const buttons = cellButtons();
  buttons.forEach((b, k) => (b.tabIndex = k === i ? 0 : -1));
  buttons[i]?.focus();
}

document.addEventListener('keydown', (e) => {
  if (els.sheet.open) {
    if (e.ctrlKey || e.metaKey || e.altKey || sheetIndex === null) return;
    const pick = pickForKey(e.key);
    if (pick) {
      e.preventDefault();
      const idx = sheetIndex;
      els.sheet.close();
      store.setCell(idx, pick.cell);
    }
    return;
  }
  if (isPlay() || !(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault();
    store.undo();
  } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
    e.preventDefault();
    store.redo();
  }
});

// ---------- 렌더링 ----------

/** 확률을 화면에 보여 줄지: 연습 모드에서는 "확률 보기"를 켰을 때만 */
const showOdds = () => !isPlay() || store.hints;

function oddsAt(i: number): CellOdds | null {
  return analysis?.status === 'ok' && showOdds() ? analysis.odds[i] : null;
}

function recommended(): number | null {
  if (analysis?.status !== 'ok') return null;
  return store.mode === 'value' && analysis.withExpected ? analysis.bestValue : analysis.bestSafe;
}

function render(): void {
  if (renderedKey !== `${store.app}:${store.level}`) buildBoard();
  const play = isPlay();

  els.app.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.app === store.app));
  });
  els.levels.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.level === store.level));
  });
  els.mode.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.mode === store.mode));
  });
  els.solveActions.hidden = play;
  els.playActions.hidden = !play;
  els.playExtra.hidden = !play;
  els.mode.hidden = play && !store.hints;
  els.undo.disabled = !store.canUndo;
  els.redo.disabled = !store.canRedo;
  els.hints.setAttribute('aria-pressed', String(store.hints));
  els.hints.textContent = store.hints ? '확률 숨기기' : '확률 보기';

  const board = currentBoard();
  const game = store.game;
  const ended = play && game.status !== 'playing';
  const best = pending || ended || !showOdds() ? null : recommended();
  els.autoDig.disabled = ended || pending || recommended() === null;

  const flagged = new Set(analysis && analysis.status === 'invalid' && !pending ? analysis.cells : []);
  if (analysis?.status === 'invalid' && !pending && store.lastChanged !== null && analysis.cells.length === 0)
    flagged.add(store.lastChanged);

  cellButtons().forEach((btn, i) => {
    btn.tabIndex = i === focusIndex ? 0 : -1;
    btn.classList.toggle('flagged', !play && flagged.has(i));
    btn.classList.toggle('best', best === i);
    btn.classList.toggle('last', play && game.lastDug === i);
    btn.disabled = play && (ended || game.dug[i]);
    if (ended && !game.dug[i]) {
      // 끝난 판: 안 판 칸의 정답을 흐리게 보여 준다
      renderCell(btn, revealCell(LEVELS[store.level], game.hidden, i), i);
      btn.classList.add('ghost');
    } else {
      btn.classList.remove('ghost');
      renderCell(btn, board[i], i);
    }
  });

  renderSummary();
  renderAdvice(best);
  renderMoney();
  if (play) renderRecord();
  if (sheetIndex !== null) renderSheet(sheetIndex);
  els.board.classList.toggle('stale', pending && showOdds());
}

function renderCell(btn: HTMLButtonElement, cell: Cell, i: number): void {
  const lv = LEVELS[store.level];
  const where = position(lv, i);
  btn.style.removeProperty('--risk');
  btn.dataset.kind = cell.kind;
  delete btn.dataset.sure;
  if (cell.kind === 'rupee') {
    const r = RUPEE_BY_COLOR[cell.color];
    btn.innerHTML = `${gemIcon(cell.color)}<span class="cell-val">${r.value}</span>`;
    btn.setAttribute('aria-label', `${where}: ${r.name}`);
    return;
  }
  if (cell.kind === 'rupoor') {
    btn.innerHTML = `${gemIcon('rupoor')}<span class="cell-val">−10</span>`;
    btn.setAttribute('aria-label', `${where}: 도둑루피`);
    return;
  }
  if (cell.kind === 'bomb') {
    btn.innerHTML = bombIcon();
    btn.setAttribute('aria-label', `${where}: 폭탄`);
    return;
  }
  const o = oddsAt(i);
  if (!o) {
    btn.innerHTML = isPlay() ? '' : `<span class="cell-q">?</span>`;
    btn.setAttribute('aria-label', `${where}: 안 판 칸`);
    return;
  }
  btn.style.setProperty('--risk', String(Math.min(1, o.bomb / 0.5)));
  const badge = btn.classList.contains('best') ? '<span class="badge">추천</span>' : '';
  if (o.bad === 0) {
    btn.dataset.sure = 'safe';
    btn.innerHTML = `${badge}<span class="cell-main">안전</span>`;
    btn.setAttribute('aria-label', `${where}: 안전 확정`);
    return;
  }
  if (o.bad === 1) {
    btn.dataset.sure = 'bad';
    btn.innerHTML = `<span class="cell-main">꽝</span><span class="cell-sub">폭탄 ${pct(o.bomb)}</span>`;
    btn.setAttribute('aria-label', `${where}: 꽝 확정, 폭탄 확률 ${pct(o.bomb)}`);
    return;
  }
  btn.innerHTML = `${badge}<span class="cell-main">${pct(o.bomb)}</span><span class="cell-sub">꽝 ${pct(o.bad)}</span>`;
  btn.setAttribute('aria-label', `${where}: 폭탄 확률 ${pct(o.bomb)}, 꽝 확률 ${pct(o.bad)}`);
}

function renderSummary(): void {
  const lv = LEVELS[store.level];
  if (isPlay()) {
    const g = store.game;
    if (g.status === 'lost') {
      els.summary.innerHTML = `<p class="banner banner-bad">${bombIcon()} 폭탄이 터졌습니다! ${g.earned}루피를 모으고 끝났어요.</p>`;
      return;
    }
    if (g.status === 'won') {
      els.summary.innerHTML = `<p class="banner banner-good">${gemIcon('gold')} 숨은 루피를 모두 찾았습니다! ${g.earned}루피 획득.</p>`;
      return;
    }
    const dugRupoors = g.hidden.filter((h, i) => h === 'rupoor' && g.dug[i]).length;
    const rupeesLeft = g.hidden.filter((h, i) => h === 'rupee' && !g.dug[i]).length;
    els.summary.innerHTML = `<ul class="chips">
      <li><span>남은 폭탄</span><strong>${lv.bombs}</strong></li>
      <li><span>남은 도둑루피</span><strong>${lv.rupoors - dugRupoors}</strong></li>
      <li><span>남은 루피</span><strong>${rupeesLeft}칸</strong></li>
      <li><span>판 칸</span><strong>${g.dug.filter(Boolean).length}</strong></li>
    </ul>`;
    return;
  }
  if (!analysis || pending) {
    els.summary.innerHTML = `<p class="note">계산 중…</p>`;
    return;
  }
  if (analysis.status === 'gameover') {
    els.summary.innerHTML = `<p class="banner banner-bad">${bombIcon()} 폭탄이 터졌습니다. 잘못 입력했다면 되돌리기, 아니면 새 게임을 누르세요.</p>`;
    return;
  }
  if (analysis.status === 'invalid') {
    els.summary.innerHTML = `<p class="banner banner-warn">입력이 맞지 않습니다: ${analysis.reason}</p>`;
    return;
  }
  if (analysis.safeLeft === 0) {
    els.summary.innerHTML = `<p class="banner banner-good">${gemIcon('gold')} 숨은 루피를 모두 찾았습니다! 남은 칸은 전부 꽝입니다.</p>`;
    return;
  }
  els.summary.innerHTML = `<ul class="chips">
    <li><span>남은 폭탄</span><strong>${analysis.remainingBombs}</strong></li>
    <li><span>남은 도둑루피</span><strong>${analysis.remainingRupoors}</strong></li>
    <li><span>남은 루피</span><strong>${analysis.safeLeft}칸</strong></li>
    <li><span>안 판 칸</span><strong>${analysis.unknownCount}</strong></li>
  </ul>`;
}

function renderAdvice(best: number | null): void {
  const lv = LEVELS[store.level];
  if (isPlay()) {
    if (store.game.status !== 'playing') {
      els.advice.innerHTML = `<p class="note">새 판을 눌러 다시 도전하세요.</p>`;
      return;
    }
    if (!store.hints) {
      els.advice.innerHTML = `<p class="note">칸을 누르면 바로 팝니다. 막히면 확률 보기를 켜 보세요.</p>`;
      return;
    }
  }
  if (best === null || analysis?.status !== 'ok') {
    els.advice.innerHTML = '';
    return;
  }
  const o = analysis.odds[best]!;
  const ev = o.expected === null ? '' : ` · 기대값 <strong>${signed(o.expected, 1)}</strong>루피`;
  const fresh = currentBoard().every((c) => c.kind === 'unknown');
  const howTo = isPlay() ? '' : ' 게임에서 판 칸을 눌러 결과를 입력하세요.';
  els.advice.innerHTML = fresh
    ? `<p>첫 칸은 어디를 파도 폭탄 확률이 <strong>${pct(o.bomb)}</strong>로 같습니다. 이웃이 많은 칸일수록 기대값이 높아서 안쪽 칸을 추천합니다.${howTo}</p>`
    : `<p><span class="badge-inline">추천</span> <strong>${position(lv, best)}</strong> · 폭탄 <strong>${pct(o.bomb)}</strong>${ev}</p>`;
}

function renderMoney(): void {
  const lv = LEVELS[store.level];
  let got: number;
  if (isPlay()) got = store.game.earned;
  else {
    let sum = 0;
    for (const c of store.board) {
      if (c.kind === 'rupee') sum += RUPEE_BY_COLOR[c.color].value;
      else if (c.kind === 'rupoor') sum += RUPOOR_VALUE;
    }
    got = Math.max(0, sum);
  }
  const net = got - lv.fee;
  els.money.innerHTML = `<span>획득 <strong>${got}</strong></span>
    <span>참가비 <strong>${lv.fee}</strong></span>
    <span class="${net >= 0 ? 'pos' : 'neg'}">손익 <strong>${signed(net)}</strong>루피</span>`;
}

function renderRecord(): void {
  const lv = LEVELS[store.level];
  const r = store.record;
  els.record.innerHTML = `<h3>${lv.name} 기록</h3>
    <ul class="chips">
      <li><span>판 수</span><strong>${r.games}</strong></li>
      <li><span>모두 찾음</span><strong>${r.won}</strong></li>
      <li><span>폭탄</span><strong>${r.lost}</strong></li>
      <li><span>누적 손익</span><strong class="${r.net >= 0 ? 'pos' : 'neg'}">${signed(r.net)}</strong></li>
    </ul>
    ${r.games ? '<button type="button" class="link-btn" data-reset>기록 지우기</button>' : ''}`;
}

// ---------- 입력 시트 ----------

function openSheet(i: number): void {
  sheetIndex = i;
  renderSheet(i);
  if (!els.sheet.open) els.sheet.showModal();
}

function renderSheet(i: number): void {
  const lv = LEVELS[store.level];
  els.sheetTitle.textContent = position(lv, i);
  const cell = store.board[i];
  els.picks.querySelectorAll<HTMLButtonElement>('.pick').forEach((b) => {
    const p = PICKS[Number(b.dataset.pick)];
    const current =
      p.cell.kind === cell.kind && (cell.kind !== 'rupee' || (p.cell as typeof cell).color === cell.color);
    b.classList.toggle('current', current);
    if (p.cell.kind === 'rupoor') b.disabled = lv.rupoors === 0;
  });
  const o = oddsAt(i);
  if (cell.kind !== 'unknown' || !o) {
    els.sheetOdds.innerHTML = cell.kind === 'unknown' ? '' : `<p class="note">이미 입력한 칸입니다. 다른 값으로 바꾸거나 지울 수 있어요.</p>`;
    return;
  }
  const rows = o.colors
    ? RUPEES.map((r, k) => {
        const p = o.colors![k];
        return `<li><span class="dist-name">${gemIcon(r.color)}${r.name}</span>
          <span class="dist-bar"><span style="width:${(p * 100).toFixed(2)}%"></span></span>
          <span class="dist-p">${pct(p)}</span></li>`;
      }).join('')
    : '';
  els.sheetOdds.innerHTML = `<div class="odds-grid">
      <div><span>폭탄</span><strong>${pct(o.bomb)}</strong></div>
      <div><span>도둑루피</span><strong>${pct(o.rupoor)}</strong></div>
      <div><span>기대값</span><strong>${o.expected === null ? '…' : signed(o.expected, 1)}</strong></div>
    </div>
    ${rows ? `<ul class="dist">${rows}</ul>` : '<p class="note">루피 색 분포 계산 중…</p>'}`;
}

// ---------- 시작 ----------

function solve(): void {
  pending = true;
  solver.request(store.level, currentBoard());
  // 결과가 아주 빨리 오므로, 늦을 때만 "계산 중" 상태가 보이도록 렌더링을 미룬다.
  setTimeout(() => {
    if (pending) render();
  }, 120);
}

store.subscribe(() => {
  // 결과는 보통 수 ms 안에 오므로 그때 그린다. 모드나 난이도가 바뀌면 판부터 다시 그린다.
  if (renderedKey !== `${store.app}:${store.level}`) {
    analysis = null;
    if (simulation.running) {
      simulation.stop();
      els.simRun.textContent = '시작';
    }
    els.simResult.innerHTML = '';
    render();
  }
  solve();
});

buildBoard();
render();
solve();
