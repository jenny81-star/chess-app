/**
 * Session 7 — 기물 배치 모드(보드 에디터) 스모크 테스트
 * 1) 메뉴: 기물 배치 카드 선택 → 난이도 숨김 → 에디터 진입
 * 2) 팔레트 선택 → 배치, 불법 배치 차단(폰 8랭크, 두 번째 킹, 인접 킹) + 토스트
 * 3) 지우개 / 기물 클릭 제거 / 기물 수 표시
 * 4) ▶ → 자유 진행(2p) 시작 → 실제로 수를 둘 수 있음
 * 5) 새게임 → 에디터 복귀 → 흑 먼저 + AI 대전(입문) → AI가 즉시 둠
 * 6) 콘솔 에러 0건
 */
const { chromium } = require('playwright');

const INDEX_PATH = 'file:///C:/Users/jenny/source/chess-app/index.html';
const SS_DIR = 'C:/Users/jenny/source/chess-app/playwright-tests/screenshots';

const results = { session: 7, checks: {}, consoleErrors: [] };

function record(name, cond) {
  results.checks[name] = !!cond;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
}

async function clickEditorSquare(page, row, col) {
  await page.click(`#editor-board .square[data-row="${row}"][data-col="${col}"]`);
  await page.waitForTimeout(80);
}

async function pickPalette(page, color, type) {
  await page.click(`.palette-piece[data-color="${color}"][data-type="${type}"]`);
  await page.waitForTimeout(80);
}

async function editorSquareHasPiece(page, row, col) {
  return page.evaluate(([r, c]) => {
    const sq = document.querySelector(`#editor-board .square[data-row="${r}"][data-col="${c}"]`);
    return !!(sq && sq.querySelector('.piece'));
  }, [row, col]);
}

async function lastToastText(page) {
  try {
    await page.waitForSelector('.toast', { timeout: 2500 });
    return page.evaluate(() => {
      const toasts = document.querySelectorAll('.toast');
      return toasts.length ? toasts[toasts.length - 1].textContent : '';
    });
  } catch (e) { return ''; }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  page.on('console', msg => {
    if (msg.type() === 'error') results.consoleErrors.push(msg.text());
    if (msg.type() === 'log' && msg.text().includes('[Chess]')) {
      console.log(`  [Page Log] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => results.consoleErrors.push(String(err)));

  await page.goto(INDEX_PATH);
  await page.waitForLoadState('load');
  await page.waitForTimeout(400);

  // ── ① 메뉴 → 에디터 진입 ────────────────────────────────
  console.log('\n=== Session 7-1: 메뉴에서 기물 배치 선택 ===');
  const modeCardCount = await page.$$eval('.mode-card', els => els.length);
  record('모드 카드 3개 존재', modeCardCount === 3);

  await page.click('.mode-card[data-mode="editor"]');
  await page.waitForTimeout(200);
  record('기물 배치 카드 selected', await page.evaluate(() =>
    document.querySelector('.mode-card[data-mode="editor"]').classList.contains('selected')));
  record('난이도 리스트 숨김', await page.evaluate(() =>
    document.getElementById('difficulty-list').style.display === 'none'));
  await page.screenshot({ path: `${SS_DIR}/s7-01-menu-editor.png`, fullPage: true });

  await page.click('#btn-start');
  await page.waitForTimeout(300);
  record('에디터 화면 표시', await page.evaluate(() =>
    document.getElementById('editor-screen').style.display === 'flex' &&
    document.getElementById('menu-screen').style.display === 'none'));
  record('팔레트 기물 12종 렌더링', await page.$$eval('.palette-piece', els => els.length) === 12);
  await page.screenshot({ path: `${SS_DIR}/s7-02-editor-empty.png`, fullPage: true });

  // ── ② 배치 + 불법 배치 차단 ─────────────────────────────
  console.log('\n=== Session 7-2: 배치 / 불법 배치 차단 ===');
  await pickPalette(page, 'white', 'K');
  record('팔레트 selected 표시', await page.evaluate(() =>
    document.querySelector('.palette-piece[data-color="white"][data-type="K"]').classList.contains('selected')));
  await clickEditorSquare(page, 7, 4);   // 백 킹 e1
  record('백 킹 e1 배치됨', await editorSquareHasPiece(page, 7, 4));

  await pickPalette(page, 'black', 'K');
  await clickEditorSquare(page, 0, 4);   // 흑 킹 e8
  record('흑 킹 e8 배치됨', await editorSquareHasPiece(page, 0, 4));
  record('기물 수 표시 "백 1 · 흑 1"', await page.evaluate(() =>
    document.getElementById('editor-count').textContent === '백 1 · 흑 1'));

  // 폰 8랭크 차단
  await pickPalette(page, 'white', 'P');
  await clickEditorSquare(page, 0, 0);
  const pawnToast = await lastToastText(page);
  record('폰 8랭크 차단 + 토스트', pawnToast.includes('폰은 1·8랭크') &&
    !(await editorSquareHasPiece(page, 0, 0)));

  // 두 번째 킹 차단
  await pickPalette(page, 'white', 'K');
  await clickEditorSquare(page, 4, 0);
  const kingToast = await lastToastText(page);
  record('두 번째 킹 차단 + 토스트', kingToast.includes('킹은 한 개만') &&
    !(await editorSquareHasPiece(page, 4, 0)));

  // 인접 킹 차단: 흑 킹(e8)을 지우개로 지우고 e2(백킹 e1 인접)에 배치 시도
  await page.click('#editor-eraser');
  await clickEditorSquare(page, 0, 4);
  record('지우개로 흑 킹 제거', !(await editorSquareHasPiece(page, 0, 4)));
  await pickPalette(page, 'black', 'K');
  await clickEditorSquare(page, 6, 4);   // e2 — 백킹 e1 인접
  const adjToast = await lastToastText(page);
  record('인접 킹 차단 + 토스트', adjToast.includes('두 킹') &&
    !(await editorSquareHasPiece(page, 6, 4)));
  await clickEditorSquare(page, 0, 4);   // 흑 킹 e8 복구

  // 팔레트 선택 없이 기물 클릭 → 제거
  await pickPalette(page, 'black', 'K'); // 현재 도구(흑킹) 선택 해제 (같은 것 재클릭)
  await pickPalette(page, 'white', 'Q');
  await clickEditorSquare(page, 3, 3);   // 백 퀸 d5
  await pickPalette(page, 'white', 'Q'); // 도구 해제
  await clickEditorSquare(page, 3, 3);   // 선택 없이 클릭 → 제거
  record('도구 없이 기물 클릭 → 제거', !(await editorSquareHasPiece(page, 3, 3)));
  await pickPalette(page, 'white', 'Q');
  await clickEditorSquare(page, 3, 3);   // 백 퀸 d5 다시 배치
  record('기물 수 표시 "백 2 · 흑 1"', await page.evaluate(() =>
    document.getElementById('editor-count').textContent === '백 2 · 흑 1'));
  await page.screenshot({ path: `${SS_DIR}/s7-03-editor-placed.png`, fullPage: true });

  // ── ③ ▶ → 자유 진행(2p) ─────────────────────────────────
  console.log('\n=== Session 7-3: 이 포지션으로 시작 → 자유 진행 ===');
  await page.click('#btn-editor-start');
  await page.waitForTimeout(200);
  record('대국 방식 모달 표시', await page.evaluate(() =>
    document.getElementById('editor-start-modal').style.display === 'flex'));
  await page.screenshot({ path: `${SS_DIR}/s7-04-start-modal.png`, fullPage: true });

  await page.click('#btn-editor-start-free');
  await page.waitForTimeout(400);
  record('게임 화면 전환', await page.evaluate(() =>
    document.getElementById('game-screen').style.display === 'flex' &&
    document.getElementById('editor-screen').style.display === 'none'));
  record('게임 보드에 기물 3개', await page.$$eval('#board .piece', els => els.length) === 3);
  record('mode=2p / turn=white', await page.evaluate(() => {
    const s = window.__chess.getState();
    return s.mode === '2p' && s.turn === 'white' && s.history.length === 0;
  }));

  // 퀸 d5 → h5 이동
  await page.click('#board .square[data-row="3"][data-col="3"]');
  await page.waitForTimeout(200);
  await page.click('#board .square[data-row="3"][data-col="7"]');
  await page.waitForTimeout(700);
  record('커스텀 포지션에서 수 두기 동작 (턴 흑으로)', await page.evaluate(() => {
    const s = window.__chess.getState();
    return s.history.length === 1 && s.turn === 'black';
  }));
  await page.screenshot({ path: `${SS_DIR}/s7-05-free-play.png`, fullPage: true });

  // ── ④ 새게임 → 에디터 복귀 → 흑 먼저 + AI 대전 ──────────
  console.log('\n=== Session 7-4: 새게임 → 에디터 복귀 → 흑 먼저 AI 대전 ===');
  await page.click('#btn-new-game');
  await page.waitForTimeout(300);
  record('새게임 → 에디터로 복귀 (모드 유지)', await page.evaluate(() =>
    document.getElementById('editor-screen').style.display === 'flex' &&
    document.getElementById('game-screen').style.display === 'none'));
  record('에디터 보드 유지 (백 2 · 흑 1)', await page.evaluate(() =>
    document.getElementById('editor-count').textContent === '백 2 · 흑 1'));

  await page.click('#btn-turn-black');
  await page.waitForTimeout(100);
  record('흑 먼저 선택됨', await page.evaluate(() =>
    document.getElementById('btn-turn-black').classList.contains('selected')));

  await page.click('#btn-editor-start');
  await page.waitForTimeout(200);
  await page.click('.diff-pill[data-difficulty="입문"]');
  await page.waitForTimeout(100);
  await page.click('#btn-editor-start-ai');
  await page.waitForTimeout(500);

  // AI(흑)가 즉시 둠
  try {
    await page.waitForFunction(() => {
      const s = window.__chess.getState();
      return s && s.mode === 'ai' && s.history.length >= 1 && s.turn === 'white';
    }, { timeout: 15000 });
  } catch (e) { console.log('[WARN] AI 첫 수 대기 타임아웃'); }
  record('흑 먼저 AI 대전: AI가 즉시 첫 수를 둠', await page.evaluate(() => {
    const s = window.__chess.getState();
    return s.mode === 'ai' && s.difficulty === '입문' && s.history.length >= 1 && s.turn === 'white';
  }));
  await page.screenshot({ path: `${SS_DIR}/s7-06-ai-black-first.png`, fullPage: true });

  // ── ⑤ 콘솔 에러 ─────────────────────────────────────────
  console.log('\n=== Session 7-5: 콘솔 에러 ===');
  record('콘솔 에러 0건', results.consoleErrors.length === 0);
  if (results.consoleErrors.length) {
    console.log('  콘솔 에러 목록:', results.consoleErrors);
  }

  const names = Object.keys(results.checks);
  const passed = names.filter(n => results.checks[n]).length;
  console.log(`\n═══ Session 7 결과: ${passed}/${names.length} 통과 ═══`);

  await browser.close();
  process.exit(passed === names.length ? 0 : 1);
})();
