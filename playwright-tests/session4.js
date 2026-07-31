/**
 * Session 4 — Checkmate/Stalemate Detection + Undo + Game-over Modal
 */
const { chromium } = require('playwright');

const INDEX_PATH = 'file:///C:/Users/jenny/source/chess-app/index.html';
const SS_DIR = 'C:/Users/jenny/source/chess-app/playwright-tests/screenshots';

const results = {
  session: 4,
  uiChecks: {},
  rulesChecks: {},
  aiChecks: {},
  consoleErrors: [],
  score: { ui: 0, rules: 0, ai: 0 },
};

async function waitForAI(page, timeout = 10000) {
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('ai-thinking');
      return el && el.style.display === 'none';
    }, { timeout });
  } catch(e) { console.log('[WARN] AI wait timed out'); }
  await page.waitForTimeout(300);
}

async function clickSquare(page, row, col) {
  await page.click(`.square[data-row="${row}"][data-col="${col}"]`);
  await page.waitForTimeout(120);
}

async function makeMove(page, fr, fc, tr, tc) {
  await clickSquare(page, fr, fc);
  await page.waitForTimeout(150);
  await clickSquare(page, tr, tc);
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  page.on('console', msg => {
    if (msg.type() === 'error') results.consoleErrors.push(msg.text());
  });

  await page.goto(INDEX_PATH);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);

  // ── Scholar's Mate (Checkmate Detection) ─────────────────
  console.log('\n=== Session 4: Checkmate Detection (Scholar\'s Mate) ===');
  await page.click('[data-difficulty="입문"]');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(500);

  // Inject Scholar's Mate position: white wins in 4 moves
  // Instead of playing it out (AI may block), inject checkmate directly
  const checkmateInjected = await page.evaluate(() => {
    try {
      const state = window.__chess.getState();
      if (!state) return false;
      // Scholar's mate position: black king in checkmate
      // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
      // Final position: Qf7 delivers checkmate
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) state.board[r][c] = null;

      // Black pieces
      state.board[0][4] = { type: 'K', color: 'black' }; // e8
      state.board[0][3] = { type: 'Q', color: 'black' }; // d8
      state.board[0][0] = { type: 'R', color: 'black' }; // a8
      state.board[0][7] = { type: 'R', color: 'black' }; // h8
      state.board[1][0] = { type: 'P', color: 'black' }; // a7
      state.board[1][1] = { type: 'P', color: 'black' }; // b7
      state.board[1][2] = { type: 'P', color: 'black' }; // c7
      state.board[1][3] = { type: 'P', color: 'black' }; // d7
      state.board[1][6] = { type: 'P', color: 'black' }; // g7
      state.board[1][7] = { type: 'P', color: 'black' }; // h7
      state.board[3][4] = { type: 'P', color: 'black' }; // e5
      state.board[2][2] = { type: 'N', color: 'black' }; // c6
      state.board[3][5] = { type: 'N', color: 'black' }; // f5 (instead of f6)

      // White pieces
      state.board[7][4] = { type: 'K', color: 'white' }; // e1
      state.board[4][4] = { type: 'P', color: 'white' }; // e4
      state.board[3][2] = { type: 'B', color: 'white' }; // c5 (Bc4 advanced)
      // Place Qh5 on white's turn — white queen attacks f7
      state.board[3][7] = { type: 'Q', color: 'white' }; // h5

      state.turn = 'white';
      state.status = 'playing';
      state.castlingRights = { whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false };

      window.ChessGame.setState(state);
      window.ChessRenderer.onBoardReady(state);
      return true;
    } catch(e) {
      console.error('CM inject failed:', e.message);
      return false;
    }
  });
  console.log(`  Checkmate position injected: ${checkmateInjected}`);
  await page.screenshot({ path: `${SS_DIR}/s4-01-cm-setup.png`, fullPage: true });

  if (checkmateInjected) {
    // Execute Qxf7# (queen h5 takes f7 = row 1, col 5)
    await makeMove(page, 3, 7, 1, 5);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SS_DIR}/s4-02-after-qxf7.png`, fullPage: true });

    // Check game status
    const status = await page.evaluate(() => window.__chess?.getState()?.status);
    console.log(`  Game status after Qxf7: ${status}`);
    results.rulesChecks.checkmateDetected = status === 'checkmate';

    // Check if king is highlighted in-check
    const inCheckSquares = await page.$$('.square.in-check');
    results.rulesChecks.checkmateKingHighlighted = inCheckSquares.length > 0;
    console.log(`  In-check squares: ${inCheckSquares.length}`);

    // Wait for game-over modal
    await page.waitForTimeout(800);
    const gameOverModal = await page.$('#gameover-modal');
    const modalVisible = gameOverModal ? await gameOverModal.evaluate(el => el.style.display !== 'none') : false;
    results.uiChecks.gameOverModalShown = modalVisible;
    console.log(`  Game-over modal shown: ${modalVisible}`);

    if (modalVisible) {
      const modalTitle = await page.$eval('#gameover-title', el => el.textContent);
      results.uiChecks.gameOverModalTitle = modalTitle;
      console.log(`  Modal title: ${modalTitle}`);

      // Check for confetti canvas activity
      const confettiCanvas = await page.$('#confetti-canvas');
      results.uiChecks.confettiCanvasExists = !!confettiCanvas;
      console.log(`  Confetti canvas exists: ${!!confettiCanvas}`);
    }

    await page.screenshot({ path: `${SS_DIR}/s4-03-gameover-modal.png`, fullPage: true });
  }

  // ── Stalemate Detection ───────────────────────────────────
  console.log('=== Session 4: Stalemate Detection ===');

  // Dismiss any modal
  const gameOverModal2 = await page.$('#gameover-modal');
  if (gameOverModal2) {
    const visible = await gameOverModal2.evaluate(el => el.style.display !== 'none');
    if (visible) await page.click('#btn-rematch');
    await page.waitForTimeout(500);
  }

  // Inject stalemate position: black to move, black has no legal moves, not in check
  // Classic: White Kc6, White Qa6, Black Ka8 — after White plays
  // Inject position where it's black's turn with stalemate
  const stalemateInjected = await page.evaluate(() => {
    try {
      const state = window.__chess.getState();
      if (!state) return false;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) state.board[r][c] = null;

      // Black king a8 (row 0, col 0) — cornered
      state.board[0][0] = { type: 'K', color: 'black' };
      // White queen b6 (row 2, col 1) — covers a7 and all escape
      state.board[2][1] = { type: 'Q', color: 'white' };
      // White king c6 (row 2, col 2)
      state.board[2][2] = { type: 'K', color: 'white' };

      // It's black's turn — black king on a8, queen on b6, white king c6
      // Black king can't go to a7 (covered by Qb6), b8 (covered by Qb6 diagonal), b7 (covered by Q+K)
      // This is stalemate IF black king is not in check
      state.turn = 'black';
      state.status = 'playing';
      state.castlingRights = { whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false };

      window.ChessGame.setState(state);
      window.ChessRenderer.onBoardReady(state);

      // Trigger game status update
      const updated = window.ChessMoves.updateGameStatus(state);
      window.ChessGame.setState(updated);
      window.ChessRenderer.onBoardReady(updated);
      return updated.status;
    } catch(e) {
      console.error('Stalemate inject failed:', e.message);
      return 'error';
    }
  });
  console.log(`  Stalemate injection result: ${stalemateInjected}`);
  await page.screenshot({ path: `${SS_DIR}/s4-04-stalemate.png`, fullPage: true });

  if (stalemateInjected === 'stalemate') {
    results.rulesChecks.stalemateDetected = true;
    console.log('  Stalemate correctly detected!');
  } else if (stalemateInjected === 'checkmate') {
    console.log('  [NOTE] Position is checkmate not stalemate — adjust position');
    results.rulesChecks.stalemateDetected = false;

    // Try a pure stalemate: Black K a8, White Q c7 (queen not checking)
    const stalemate2 = await page.evaluate(() => {
      try {
        const state = window.__chess.getState();
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) state.board[r][c] = null;
        state.board[0][0] = { type: 'K', color: 'black' }; // Ka8
        state.board[1][2] = { type: 'Q', color: 'white' }; // Qc7 — covers b8, but doesn't check a8 diagonally... let's check
        // Actually Qc7 is on row 1, col 2. Attacks row 0 col 1 (b8) and row 0 col 3 (d8) diag, and row 0 col 2 (c8)
        // Ka8=row0,col0 is NOT attacked by Qc7. a7=row1,col0: not attacked. b8=row0,col1: attacked.
        // Ka8 can go to a7(row1,col0) or b8(row0,col1). b8 is covered by Q. a7(row1,col0)?
        // Qc7(row1,col2): attacks row 1 col 1, col 0? Only if same row — yes! row1,col0 is attacked.
        // So Ka8 can't go a7 or b8. And Ka8 is not attacked. STALEMATE!
        state.board[7][7] = { type: 'K', color: 'white' }; // White king h1

        state.turn = 'black';
        state.status = 'playing';
        state.castlingRights = { whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false };

        const updated = window.ChessMoves.updateGameStatus(state);
        window.ChessGame.setState(updated);
        window.ChessRenderer.onBoardReady(updated);
        return updated.status;
      } catch(e) { return 'error'; }
    });
    console.log(`  Stalemate v2 result: ${stalemate2}`);
    results.rulesChecks.stalemateDetected = stalemate2 === 'stalemate';
  } else {
    results.rulesChecks.stalemateDetected = stalemateInjected === 'stalemate';
  }

  // Check modal for stalemate
  await page.waitForTimeout(600);
  const staleModal = await page.$('#gameover-modal');
  const staleModalVisible = staleModal ? await staleModal.evaluate(el => el.style.display !== 'none') : false;
  results.uiChecks.stalemateModalShown = staleModalVisible;
  console.log(`  Stalemate modal shown: ${staleModalVisible}`);
  await page.screenshot({ path: `${SS_DIR}/s4-05-stalemate-modal.png`, fullPage: true });

  // Dismiss modal
  if (staleModalVisible) {
    await page.click('#btn-rematch');
    await page.waitForTimeout(500);
  }

  // ── Undo Test ─────────────────────────────────────────────
  console.log('=== Session 4: Undo Test ===');

  // Start fresh game
  const undoModal = await page.$('#gameover-modal');
  if (undoModal) {
    const v = await undoModal.evaluate(el => el.style.display !== 'none');
    if (v) { await page.click('#btn-rematch'); await page.waitForTimeout(500); }
  }
  await page.click('#btn-new-game');
  await page.waitForTimeout(500);

  // Make a move
  await makeMove(page, 6, 4, 4, 4); // e4
  await waitForAI(page);

  const stateAfterMove = await page.evaluate(() => {
    const s = window.__chess?.getState();
    return { historyLen: s?.history.length, turn: s?.turn };
  });
  console.log(`  After 1 move (+ AI): ${JSON.stringify(stateAfterMove)}`);

  // Undo
  await page.click('#btn-undo');
  await page.waitForTimeout(600);

  const stateAfterUndo = await page.evaluate(() => {
    const s = window.__chess?.getState();
    return { historyLen: s?.history.length, turn: s?.turn };
  });
  console.log(`  After undo: ${JSON.stringify(stateAfterUndo)}`);
  results.rulesChecks.undoWorked = stateAfterUndo.historyLen === 0 && stateAfterUndo.turn === 'white';
  console.log(`  Undo worked: ${results.rulesChecks.undoWorked}`);
  await page.screenshot({ path: `${SS_DIR}/s4-06-after-undo.png`, fullPage: true });

  // Toast message check
  const toastEl = await page.$('.toast');
  results.uiChecks.toastShown = !!toastEl;
  console.log(`  Toast shown: ${!!toastEl}`);

  // ── AI Medium: verify no queen blunder ───────────────────
  console.log('=== Session 4: Medium AI No Queen Blunder Test ===');
  await page.evaluate(() => {
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
  });
  await page.waitForTimeout(300);
  await page.click('[data-difficulty="중급"]');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(500);

  // Play 8 moves, check AI queen is not immediately blundered
  const medMoves = [[6,4,4,4],[6,3,4,3],[7,6,5,5],[7,1,5,2],[7,5,4,2],[7,3,5,3]];
  let medMovesPlayed = 0;
  for (const [fr,fc,tr,tc] of medMoves) {
    const hasPiece = await page.evaluate(([r,c]) => !!document.querySelector(`.square[data-row="${r}"][data-col="${c}"] .piece`), [fr,fc]);
    if (!hasPiece) continue;
    await makeMove(page, fr, fc, tr, tc);
    medMovesPlayed++;
    await waitForAI(page);

    const st = await page.evaluate(() => window.__chess?.getState()?.status);
    if (st === 'checkmate' || st === 'stalemate') break;
  }

  // Check if black queen is still on the board (not immediately blundered)
  const blackQueenExists = await page.evaluate(() => {
    const s = window.__chess?.getState();
    if (!s) return null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = s.board[r][c];
        if (p && p.type === 'Q' && p.color === 'black') return true;
      }
    }
    return false;
  });
  results.aiChecks.mediumAIQueenPreserved = blackQueenExists;
  console.log(`  Medium AI black queen still on board: ${blackQueenExists}`);
  await page.screenshot({ path: `${SS_DIR}/s4-07-medium-ai.png`, fullPage: true });

  // ── Scoring ───────────────────────────────────────────────
  let uiScore = 60;
  if (results.uiChecks.gameOverModalShown)  uiScore += 15;
  if (results.uiChecks.stalemateModalShown) uiScore += 10;
  if (results.uiChecks.confettiCanvasExists) uiScore += 10;
  if (results.uiChecks.toastShown)          uiScore += 5;
  results.score.ui = Math.min(uiScore, 100);

  let rulesScore = 30;
  if (results.rulesChecks.checkmateDetected)       rulesScore += 25;
  if (results.rulesChecks.checkmateKingHighlighted) rulesScore += 10;
  if (results.rulesChecks.stalemateDetected)        rulesScore += 20;
  if (results.rulesChecks.undoWorked)               rulesScore += 15;
  results.score.rules = Math.min(rulesScore, 100);

  let aiScore = 70;
  if (results.aiChecks.mediumAIQueenPreserved) aiScore += 30;
  if (results.consoleErrors.length === 0)      aiScore += 0;
  results.score.ai = Math.min(aiScore, 100);

  console.log('\n--- Session 4 Results ---');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
})().catch(err => { console.error('Session 4 ERROR:', err); process.exit(1); });
