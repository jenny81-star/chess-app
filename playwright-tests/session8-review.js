/**
 * Session 8 — 게임 종료 후 기보 확인(리뷰) 모드 스모크 테스트
 * 1) 2인 대전 풀스메이트(4수) → 게임오버 모달에 "기보 확인" 버튼 존재
 * 2) 클릭 → 모달 닫힘, 리뷰 바 표시, 결과 뱃지 표시, 위치 "4 / 4수"
 * 3) ⏮ ◀ ▶ ⏭ 탐색 시 보드가 해당 시점으로 렌더 + last-from/last-to 하이라이트
 * 4) 리뷰 중 보드 입력 차단 (기물 선택 불가)
 * 5) 기보 목록 수 클릭 → 해당 시점 점프 + .active 하이라이트
 * 6) 키보드 ←/→ 탐색
 * 7) 원본 gameState 보존 (history 길이 유지)
 * 8) "메뉴로" → 리뷰 해제 + 메뉴 화면 / 새 게임 시작하면 정상 입력 가능
 * 9) 콘솔 에러 0건
 */
const { chromium } = require('playwright');

const INDEX_PATH = 'file:///C:/Users/jenny/source/chess-app/index.html';
const SS_DIR = 'C:/Users/jenny/source/chess-app/playwright-tests/screenshots';

const results = {
  session: 8,
  checks: {},
  consoleErrors: [],
};

async function clickSquare(page, row, col) {
  await page.click(`.square[data-row="${row}"][data-col="${col}"]`);
  await page.waitForTimeout(120);
}

async function makeMove(page, fr, fc, tr, tc) {
  await clickSquare(page, fr, fc);
  await page.waitForTimeout(150);
  await clickSquare(page, tr, tc);
  await page.waitForTimeout(600); // 애니메이션 대기
}

async function getReviewPos(page) {
  return page.$eval('#review-position', el => el.textContent);
}

function hasPiece(page, row, col) {
  return page.evaluate(([r, c]) =>
    !!document.querySelector(`.square[data-row="${r}"][data-col="${c}"] .piece`),
    [row, col]);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  page.on('console', msg => {
    if (msg.type() === 'error') results.consoleErrors.push(msg.text());
  });

  await page.goto(INDEX_PATH);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);

  // ── ① 2인 대전 시작 → 풀스메이트 (1.f3 e5 2.g4 Qh4#) ──────
  console.log('\n=== Session 8-1: 2인 대전 풀스메이트 → 게임오버 모달 ===');
  await page.click('.mode-card[data-mode="2p"]');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(600);

  await makeMove(page, 6, 5, 5, 5); // 백 f2-f3
  await makeMove(page, 1, 4, 3, 4); // 흑 e7-e5
  await makeMove(page, 6, 6, 4, 6); // 백 g2-g4
  await makeMove(page, 0, 3, 4, 7); // 흑 Qd8-h4#

  await page.waitForFunction(() =>
    document.getElementById('gameover-modal').style.display === 'flex',
    { timeout: 5000 });
  await page.waitForTimeout(300);

  const goTitle = await page.$eval('#gameover-title', el => el.textContent);
  const reviewBtnVisible = await page.evaluate(() => {
    const btn = document.getElementById('btn-review');
    return !!btn && btn.offsetParent !== null;
  });
  results.checks.gameOverShown = goTitle.includes('흑 승리');
  results.checks.reviewButtonExists = reviewBtnVisible;
  console.log(`  Game over title: "${goTitle}"`);
  console.log(`  Review button visible: ${reviewBtnVisible}`);
  await page.screenshot({ path: `${SS_DIR}/s8-01-gameover-modal.png`, fullPage: true });

  // ── ② 기보 확인 진입 ─────────────────────────────────────
  console.log('=== Session 8-2: 기보 확인 진입 ===');
  await page.click('#btn-review');
  await page.waitForTimeout(400);

  const afterEnter = await page.evaluate(() => ({
    modalHidden: document.getElementById('gameover-modal').style.display === 'none',
    barVisible: document.getElementById('review-bar').style.display === 'flex',
    controlsHidden: document.getElementById('controls').style.display === 'none',
    badge: document.getElementById('review-result-badge').textContent,
    pos: document.getElementById('review-position').textContent,
    active: window.ChessReview.isActive(),
  }));
  results.checks.modalClosedOnEnter = afterEnter.modalHidden;
  results.checks.reviewBarVisible = afterEnter.barVisible;
  results.checks.controlsHidden = afterEnter.controlsHidden;
  results.checks.resultBadgeShown = afterEnter.badge.includes('흑 승리');
  results.checks.startsAtLastMove = afterEnter.pos === '4 / 4수';
  console.log(`  Modal hidden: ${afterEnter.modalHidden}, bar visible: ${afterEnter.barVisible}`);
  console.log(`  Badge: "${afterEnter.badge}", position: "${afterEnter.pos}"`);
  await page.screenshot({ path: `${SS_DIR}/s8-02-review-entered.png`, fullPage: true });

  // ── ③ 탐색: ⏮ ◀ ▶ ⏭ ────────────────────────────────────
  console.log('=== Session 8-3: 탐색 컨트롤 ===');

  // ⏮ 처음: 초기 배치 (f2 폰 복귀, h4 빈 칸)
  await page.click('#btn-review-first');
  await page.waitForTimeout(250);
  const posFirst = await getReviewPos(page);
  const f2HasPawn = await hasPiece(page, 6, 5);
  const h4Empty = !(await hasPiece(page, 4, 7));
  results.checks.firstGoesToStart = posFirst === '0 / 4수' && f2HasPawn && h4Empty;
  console.log(`  ⏮ → "${posFirst}", f2 pawn: ${f2HasPawn}, h4 empty: ${h4Empty}`);

  // ▶ 다음: 1수 시점 (f3에 폰, last-to 하이라이트)
  await page.click('#btn-review-next');
  await page.waitForTimeout(250);
  const posNext = await getReviewPos(page);
  const f3State = await page.evaluate(() => {
    const sq = document.querySelector('.square[data-row="5"][data-col="5"]');
    return { piece: !!sq.querySelector('.piece'), lastTo: sq.classList.contains('last-to') };
  });
  results.checks.nextStepsForward = posNext === '1 / 4수' && f3State.piece;
  results.checks.lastMoveHighlighted = f3State.lastTo;
  console.log(`  ▶ → "${posNext}", f3 piece: ${f3State.piece}, last-to: ${f3State.lastTo}`);
  await page.screenshot({ path: `${SS_DIR}/s8-03-review-move1.png`, fullPage: true });

  // ⏭ 마지막: 퀸이 h4에, last-to 하이라이트
  await page.click('#btn-review-last');
  await page.waitForTimeout(250);
  const posLast = await getReviewPos(page);
  const h4State = await page.evaluate(() => {
    const sq = document.querySelector('.square[data-row="4"][data-col="7"]');
    return { piece: !!sq.querySelector('.piece'), lastTo: sq.classList.contains('last-to') };
  });
  results.checks.lastGoesToEnd = posLast === '4 / 4수' && h4State.piece && h4State.lastTo;
  console.log(`  ⏭ → "${posLast}", h4 queen: ${h4State.piece}, last-to: ${h4State.lastTo}`);

  // ◀ 이전: 3수 시점
  await page.click('#btn-review-prev');
  await page.waitForTimeout(250);
  const posPrev = await getReviewPos(page);
  results.checks.prevStepsBack = posPrev === '3 / 4수';
  console.log(`  ◀ → "${posPrev}"`);

  // ── ④ 보드 입력 차단 ─────────────────────────────────────
  console.log('=== Session 8-4: 리뷰 중 보드 입력 차단 ===');
  await clickSquare(page, 3, 4); // 흑 e5 폰 클릭 시도
  await page.waitForTimeout(200);
  const noSelection = await page.evaluate(() =>
    !document.querySelector('.square.selected'));
  results.checks.boardInputBlocked = noSelection;
  console.log(`  No selection after board click: ${noSelection}`);

  // ── ⑤ 기보 목록 클릭 점프 + active 하이라이트 ─────────────
  console.log('=== Session 8-5: 기보 클릭 점프 ===');
  await page.click('.review-move[data-idx="1"]'); // 2번째 수(e5) 클릭 → 시점 2
  await page.waitForTimeout(250);
  const jumpState = await page.evaluate(() => ({
    pos: document.getElementById('review-position').textContent,
    activeIdx: document.querySelector('#move-history .review-move.active')?.dataset.idx,
    e5Piece: !!document.querySelector('.square[data-row="3"][data-col="4"] .piece'),
  }));
  results.checks.historyClickJumps =
    jumpState.pos === '2 / 4수' && jumpState.activeIdx === '1' && jumpState.e5Piece;
  console.log(`  Click move #2 → "${jumpState.pos}", active idx: ${jumpState.activeIdx}, e5 piece: ${jumpState.e5Piece}`);
  await page.screenshot({ path: `${SS_DIR}/s8-04-review-jump.png`, fullPage: true });

  // ── ⑥ 키보드 ←/→ ────────────────────────────────────────
  console.log('=== Session 8-6: 키보드 탐색 ===');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const posRight = await getReviewPos(page);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  const posLeft = await getReviewPos(page);
  results.checks.keyboardNav = posRight === '3 / 4수' && posLeft === '2 / 4수';
  console.log(`  → "${posRight}" (expect 3/4), ← "${posLeft}" (expect 2/4)`);

  // ── ⑦ 원본 gameState 보존 ────────────────────────────────
  console.log('=== Session 8-7: gameState 보존 ===');
  const stateCheck = await page.evaluate(() => {
    const s = window.__chess.getState();
    return { histLen: s.history.length, status: s.status, mode: s.mode };
  });
  results.checks.gameStatePreserved =
    stateCheck.histLen === 4 && stateCheck.status === 'checkmate' && stateCheck.mode === '2p';
  console.log(`  history: ${stateCheck.histLen} (expect 4), status: ${stateCheck.status}, mode: ${stateCheck.mode}`);

  // ── ⑧ 메뉴로 종료 → 새 게임 정상 동작 ────────────────────
  console.log('=== Session 8-8: 메뉴로 종료 후 새 게임 ===');
  await page.click('#btn-review-menu');
  await page.waitForTimeout(400);
  const afterExit = await page.evaluate(() => ({
    menuVisible: document.getElementById('menu-screen').style.display !== 'none',
    barHidden: document.getElementById('review-bar').style.display === 'none',
    controlsRestored: document.getElementById('controls').style.display === 'flex',
    reviewInactive: !window.ChessReview.isActive(),
  }));
  results.checks.menuExitWorks =
    afterExit.menuVisible && afterExit.barHidden && afterExit.reviewInactive;
  results.checks.controlsRestored = afterExit.controlsRestored;
  console.log(`  Menu: ${afterExit.menuVisible}, bar hidden: ${afterExit.barHidden}, controls: ${afterExit.controlsRestored}, inactive: ${afterExit.reviewInactive}`);
  await page.screenshot({ path: `${SS_DIR}/s8-05-back-to-menu.png`, fullPage: true });

  // 새 게임(2인 대전) → 보드 입력 다시 가능
  await page.click('#btn-start');
  await page.waitForTimeout(600);
  await clickSquare(page, 6, 4); // e2 폰 선택
  await page.waitForTimeout(200);
  const canSelectAgain = await page.evaluate(() =>
    !!document.querySelector('.square[data-row="6"][data-col="4"].selected'));
  const freshState = await page.evaluate(() => window.__chess.getState().history.length);
  results.checks.newGameInputWorks = canSelectAgain && freshState === 0;
  console.log(`  New game — e2 selectable: ${canSelectAgain}, history: ${freshState}`);
  await page.screenshot({ path: `${SS_DIR}/s8-06-new-game.png`, fullPage: true });

  // ── ⑨ 콘솔 에러 ──────────────────────────────────────────
  results.checks.noConsoleErrors = results.consoleErrors.length === 0;
  console.log(`  Console errors: ${results.consoleErrors.length}`);

  // ── 결과 요약 ─────────────────────────────────────────────
  const failed = Object.entries(results.checks).filter(([, v]) => v !== true);
  console.log('\n--- Session 8 Results ---');
  console.log(JSON.stringify(results, null, 2));
  console.log(failed.length === 0
    ? '\n✅ ALL CHECKS PASSED'
    : `\n❌ FAILED CHECKS: ${failed.map(([k]) => k).join(', ')}`);

  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch(err => { console.error('Session 8 ERROR:', err); process.exit(1); });
