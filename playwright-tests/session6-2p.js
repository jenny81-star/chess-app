/**
 * Session 6 — 2인 대전(핫시트) 모드 스모크 테스트
 * 1) 메뉴에서 2인 대전 선택 → 난이도 숨김 → 게임 시작
 * 2) 백 e2-e4 → 턴이 흑으로 넘어가고 AI가 두지 않음
 * 3) 흑 기물 클릭·이동 가능 (e7-e5)
 * 4) 몇 수 더 진행 후 무르기 → 1수만 되돌아감
 * 5) AI 대전 모드는 기존대로 동작 (백 이동 → AI 응수)
 */
const { chromium } = require('playwright');

const INDEX_PATH = 'file:///C:/Users/jenny/source/chess-app/index.html';
const SS_DIR = 'C:/Users/jenny/source/chess-app/playwright-tests/screenshots';

const results = {
  session: 6,
  twoPlayerChecks: {},
  aiModeChecks: {},
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

async function waitForAI(page, timeout = 12000) {
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('ai-thinking');
      return el && el.style.display === 'none';
    }, { timeout });
  } catch (e) { console.log('[WARN] AI wait timed out'); }
  await page.waitForTimeout(300);
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

  await page.goto(INDEX_PATH);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);

  // ── ① 메뉴: 2인 대전 선택 → 난이도 숨김 → 시작 ──────────
  console.log('\n=== Session 6-1: 2인 대전 메뉴 선택 ===');
  await page.screenshot({ path: `${SS_DIR}/s6-01-menu.png`, fullPage: true });

  const modeCards = await page.$$('.mode-card');
  results.twoPlayerChecks.modeCardsExist = modeCards.length === 2;
  console.log(`  Mode cards exist (2): ${results.twoPlayerChecks.modeCardsExist}`);

  await page.click('.mode-card[data-mode="2p"]');
  await page.waitForTimeout(300);

  const twoPSelected = await page.evaluate(() =>
    document.querySelector('.mode-card[data-mode="2p"]')?.classList.contains('selected'));
  const diffHidden = await page.evaluate(() =>
    document.getElementById('difficulty-list').style.display === 'none');
  results.twoPlayerChecks.twoPCardSelected = !!twoPSelected;
  results.twoPlayerChecks.difficultyListHidden = diffHidden;
  console.log(`  2P card selected: ${twoPSelected}`);
  console.log(`  Difficulty list hidden: ${diffHidden}`);
  await page.screenshot({ path: `${SS_DIR}/s6-02-menu-2p-selected.png`, fullPage: true });

  await page.click('#btn-start');
  await page.waitForTimeout(600);

  const gameVisible = await page.evaluate(() =>
    document.getElementById('game-screen').style.display !== 'none');
  const badgeText = await page.$eval('#difficulty-badge', el => el.textContent);
  const blackName = await page.$eval('#black-player-card .player-name', el => el.textContent);
  const whiteName = await page.$eval('#white-player-card .player-name', el => el.textContent);
  const stateMode = await page.evaluate(() => window.__chess.getState()?.mode);
  results.twoPlayerChecks.gameStarted = gameVisible;
  results.twoPlayerChecks.badgeIs2P = badgeText.includes('2인 대전');
  results.twoPlayerChecks.playerLabels = (blackName === '흑 플레이어' && whiteName === '백 플레이어');
  results.twoPlayerChecks.stateModeIs2P = stateMode === '2p';
  console.log(`  Game started: ${gameVisible}, badge: "${badgeText}"`);
  console.log(`  Labels: black="${blackName}", white="${whiteName}"`);
  console.log(`  state.mode: ${stateMode}`);
  await page.screenshot({ path: `${SS_DIR}/s6-03-2p-game-start.png`, fullPage: true });

  // ── ② 백 e2-e4 → 턴이 흑, AI가 두지 않음 ────────────────
  console.log('=== Session 6-2: 백 e2-e4 후 AI 미동작 확인 ===');
  await makeMove(page, 6, 4, 4, 4); // e2 → e4
  await page.waitForTimeout(2500);  // AI가 있었다면 이 사이에 두었을 시간

  const afterE4 = await page.evaluate(() => {
    const s = window.__chess.getState();
    return {
      turn: s.turn,
      histLen: s.history.length,
      aiThinking: document.getElementById('ai-thinking').style.display !== 'none',
    };
  });
  results.twoPlayerChecks.turnIsBlackAfterE4 = afterE4.turn === 'black';
  results.twoPlayerChecks.aiDidNotMove = afterE4.histLen === 1;
  results.twoPlayerChecks.aiThinkingHidden = !afterE4.aiThinking;
  console.log(`  Turn after e4: ${afterE4.turn} (expect black)`);
  console.log(`  History length: ${afterE4.histLen} (expect 1 — AI did not move)`);
  console.log(`  AI thinking hidden: ${!afterE4.aiThinking}`);
  await page.screenshot({ path: `${SS_DIR}/s6-04-2p-after-e4.png`, fullPage: true });

  // ── ③ 흑 기물 클릭·이동 (e7-e5) ─────────────────────────
  console.log('=== Session 6-3: 흑 e7-e5 이동 ===');
  await clickSquare(page, 1, 4); // e7 폰 선택
  await page.waitForTimeout(200);
  const blackPawnSelectable = await page.evaluate(() =>
    !!document.querySelector('.square[data-row="1"][data-col="4"].selected'));
  results.twoPlayerChecks.blackPieceSelectable = blackPawnSelectable;
  console.log(`  Black pawn e7 selectable: ${blackPawnSelectable}`);

  await clickSquare(page, 3, 4); // e5
  await page.waitForTimeout(600);
  const afterE5 = await page.evaluate(() => {
    const s = window.__chess.getState();
    return { turn: s.turn, histLen: s.history.length };
  });
  results.twoPlayerChecks.blackMoved = afterE5.histLen === 2;
  results.twoPlayerChecks.turnBackToWhite = afterE5.turn === 'white';
  console.log(`  After e5 — turn: ${afterE5.turn} (expect white), history: ${afterE5.histLen} (expect 2)`);
  await page.screenshot({ path: `${SS_DIR}/s6-05-2p-after-e5.png`, fullPage: true });

  // ── ④ 몇 수 더 진행 후 무르기 → 1수만 되돌아감 ───────────
  console.log('=== Session 6-4: 무르기 (1수만) ===');
  await makeMove(page, 7, 6, 5, 5); // Ng1 → f3
  await makeMove(page, 0, 1, 2, 2); // Nb8 → c6
  const beforeUndo = await page.evaluate(() => {
    const s = window.__chess.getState();
    return { turn: s.turn, histLen: s.history.length };
  });
  console.log(`  Before undo — turn: ${beforeUndo.turn}, history: ${beforeUndo.histLen}`);

  await page.click('#btn-undo');
  await page.waitForTimeout(600);
  const afterUndo = await page.evaluate(() => {
    const s = window.__chess.getState();
    return { turn: s.turn, histLen: s.history.length, mode: s.mode };
  });
  results.twoPlayerChecks.undoOnlyOneMove =
    afterUndo.histLen === beforeUndo.histLen - 1;
  results.twoPlayerChecks.undoTurnFlipped = afterUndo.turn !== beforeUndo.turn;
  results.twoPlayerChecks.undoKeepsMode = afterUndo.mode === '2p';
  console.log(`  After undo — turn: ${afterUndo.turn}, history: ${afterUndo.histLen} (expect ${beforeUndo.histLen - 1}), mode: ${afterUndo.mode}`);
  await page.screenshot({ path: `${SS_DIR}/s6-06-2p-after-undo.png`, fullPage: true });

  // ── ⑤ AI 대전 모드 회귀 확인 ─────────────────────────────
  console.log('=== Session 6-5: AI 대전 회귀 테스트 ===');
  await page.evaluate(() => {
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
  });
  await page.waitForTimeout(300);

  await page.click('.mode-card[data-mode="ai"]');
  await page.waitForTimeout(300);
  const diffVisibleAgain = await page.evaluate(() =>
    document.getElementById('difficulty-list').style.display !== 'none');
  results.aiModeChecks.difficultyListVisible = diffVisibleAgain;
  console.log(`  Difficulty list visible again: ${diffVisibleAgain}`);

  await page.click('[data-difficulty="입문"]');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(600);

  const aiBadge = await page.$eval('#difficulty-badge', el => el.textContent);
  const aiBlackName = await page.$eval('#black-player-card .player-name', el => el.textContent);
  results.aiModeChecks.badgeIsDifficulty = aiBadge.includes('입문');
  results.aiModeChecks.labelsRestored = aiBlackName === 'AI (흑)';
  console.log(`  Badge: "${aiBadge}", black label: "${aiBlackName}"`);

  await makeMove(page, 6, 4, 4, 4); // e2 → e4
  await waitForAI(page);
  const aiState = await page.evaluate(() => {
    const s = window.__chess.getState();
    return { turn: s.turn, histLen: s.history.length, mode: s.mode };
  });
  results.aiModeChecks.aiResponded = aiState.histLen >= 2 && aiState.turn === 'white';
  results.aiModeChecks.stateModeIsAI = aiState.mode === 'ai';
  console.log(`  After e4 + AI — turn: ${aiState.turn}, history: ${aiState.histLen}, mode: ${aiState.mode}`);
  await page.screenshot({ path: `${SS_DIR}/s6-07-ai-mode-regression.png`, fullPage: true });

  // ── 결과 요약 ─────────────────────────────────────────────
  const allChecks = { ...results.twoPlayerChecks, ...results.aiModeChecks };
  const failed = Object.entries(allChecks).filter(([, v]) => v !== true);
  console.log('\n--- Session 6 Results ---');
  console.log(JSON.stringify(results, null, 2));
  console.log(failed.length === 0
    ? '\n✅ ALL CHECKS PASSED'
    : `\n❌ FAILED CHECKS: ${failed.map(([k]) => k).join(', ')}`);

  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch(err => { console.error('Session 6 ERROR:', err); process.exit(1); });
