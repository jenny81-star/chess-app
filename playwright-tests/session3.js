/**
 * Session 3 — Pawn Promotion + Pinned Piece + Illegal Move + Hard AI
 */
const { chromium } = require('playwright');
const path = require('path');

const INDEX_PATH = 'file:///' + 'C:/Users/jenny/source/chess-app/index.html';
const SS_DIR = 'C:/Users/jenny/source/chess-app/playwright-tests/screenshots';

const results = {
  session: 3,
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

async function getGameState(page) {
  return page.evaluate(() => window.__chess?.getState());
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

  // ── Promotion Test via game injection ────────────────────
  console.log('\n=== Session 3: Pawn Promotion Test ===');
  await page.click('[data-difficulty="입문"]'); // Easiest for quick game
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(500);

  // Inject a board state where white pawn is on row 1 (7th rank), one step from promotion
  // We do this by manipulating game state via console API then re-rendering
  const promotionInjected = await page.evaluate(() => {
    try {
      const state = window.__chess.getState();
      if (!state) return false;

      // Place a white pawn on row 1, col 4 (e7 in chess notation) - one step from promotion
      // Clear path: remove black piece on e8 (row 0, col 4) if any
      state.board[0][4] = null; // clear e8
      state.board[1][4] = { type: 'P', color: 'white' }; // pawn on e7
      state.board[6][4] = null; // remove original e2 pawn
      state.turn = 'white';
      state.status = 'playing';

      window.ChessGame.setState(state);
      window.ChessRenderer.onBoardReady(state);
      return true;
    } catch(e) {
      console.error('Inject failed:', e.message);
      return false;
    }
  });
  console.log(`  Board injection success: ${promotionInjected}`);
  await page.screenshot({ path: `${SS_DIR}/s3-01-promo-setup.png`, fullPage: true });

  if (promotionInjected) {
    // Click e7 pawn (row 1, col 4)
    await clickSquare(page, 1, 4);
    await page.waitForTimeout(200);
    const e7Classes = await page.evaluate(() => {
      return document.querySelector('.square[data-row="1"][data-col="4"]')?.className || '';
    });
    console.log(`  e7 pawn selected: ${e7Classes.includes('selected')}`);
    results.rulesChecks.promotionPawnSelectable = e7Classes.includes('selected');

    // Check e8 shows as can-move
    const e8Classes = await page.evaluate(() => {
      return document.querySelector('.square[data-row="0"][data-col="4"]')?.className || '';
    });
    console.log(`  e8 can-move: ${e8Classes}`);
    results.rulesChecks.promotionSquareHighlighted = e8Classes.includes('can-move');

    // Move to e8 (row 0, col 4)
    await clickSquare(page, 0, 4);
    await page.waitForTimeout(400);

    // Check if promotion modal appears
    const promoModal = await page.$('#promotion-modal');
    const promoVisible = promoModal ? await promoModal.evaluate(el => el.style.display !== 'none') : false;
    results.rulesChecks.promotionModalAppeared = promoVisible;
    console.log(`  Promotion modal appeared: ${promoVisible}`);
    await page.screenshot({ path: `${SS_DIR}/s3-02-promo-modal.png`, fullPage: true });

    if (promoVisible) {
      // Click Queen button
      await page.click('[data-piece="Q"]');
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SS_DIR}/s3-03-after-promo.png`, fullPage: true });

      // Verify queen appeared on e8
      const queenOnE8 = await page.evaluate(() => {
        const state = window.__chess?.getState();
        if (!state) return null;
        return state.board[0][4];
      });
      results.rulesChecks.promotionQueenPlaced = queenOnE8?.type === 'Q' && queenOnE8?.color === 'white';
      console.log(`  Queen on e8: ${JSON.stringify(queenOnE8)}`);
    } else {
      results.rulesChecks.promotionQueenPlaced = false;
    }
  }

  // ── Pinned Piece Test ────────────────────────────────────
  console.log('=== Session 3: Pinned Piece / Illegal Move Test ===');

  // New game to reset
  await page.click('#btn-new-game');
  await page.waitForTimeout(500);

  // Inject: white king on e1, white rook on e4 (pinned to king by black queen on e8)
  const pinInjected = await page.evaluate(() => {
    try {
      const state = window.__chess.getState();
      if (!state) return false;
      // Clear board
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) state.board[r][c] = null;
      state.board[7][4] = { type: 'K', color: 'white' }; // King e1
      state.board[4][4] = { type: 'R', color: 'white' }; // Rook e5 (pinned)
      state.board[0][4] = { type: 'Q', color: 'black' }; // Black queen e8, pins rook
      state.board[0][5] = { type: 'K', color: 'black' }; // Black king f8 (needs a king)
      state.board[6][0] = { type: 'P', color: 'white' }; // a pawn so not stalemate
      state.turn = 'white';
      state.status = 'playing';
      state.castlingRights = { whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false };
      window.ChessGame.setState(state);
      window.ChessRenderer.onBoardReady(state);
      return true;
    } catch(e) {
      console.error('Pin inject failed:', e.message);
      return false;
    }
  });
  console.log(`  Pin injection success: ${pinInjected}`);
  await page.screenshot({ path: `${SS_DIR}/s3-04-pin-setup.png`, fullPage: true });

  if (pinInjected) {
    // Try to select the rook (which is pinned)
    await clickSquare(page, 4, 4);
    await page.waitForTimeout(300);

    const rookClasses = await page.evaluate(() =>
      document.querySelector('.square[data-row="4"][data-col="4"]')?.className || '');
    console.log(`  Pinned rook selected: ${rookClasses}`);
    results.rulesChecks.pinnedPieceSelectable = rookClasses.includes('selected');

    // Get legal moves for pinned rook - should only be along e-file or zero
    const legalMoves = await page.evaluate(() => {
      const state = window.__chess?.getState();
      if (!state) return [];
      return window.ChessMoves?.getLegalMoves(state, 4, 4) || [];
    });
    console.log(`  Legal moves for pinned rook: ${JSON.stringify(legalMoves)}`);

    // A pinned rook can only move along the pin direction (e-file)
    // So moves to d4, c4, etc. should NOT be allowed
    const illegalMoveLateral = legalMoves.some(m => m.to[1] !== 4); // col must stay 4
    results.rulesChecks.pinnedPieceCannotMoveIllegally = !illegalMoveLateral;
    console.log(`  Pinned piece correctly restricted: ${!illegalMoveLateral}`);

    // Try clicking a lateral destination (d5 = row 3, col 3) — should not execute
    const canMoveSquares = await page.$$('.square.can-move');
    console.log(`  Can-move squares shown: ${canMoveSquares.length}`);
    results.rulesChecks.pinnedPieceMovesShown = canMoveSquares.length;

    await page.screenshot({ path: `${SS_DIR}/s3-05-pin-moves.png`, fullPage: true });
    await clickSquare(page, 4, 4); // deselect
  }

  // ── Hard AI Test ──────────────────────────────────────────
  console.log('=== Session 3: Hard AI (고급) — 8 moves ===');
  await page.click('#btn-new-game');
  await page.waitForTimeout(200);
  // navigate back to menu to change difficulty
  // Use difficulty button - click new game goes back to same difficulty
  // We need to change to hard: go back to menu
  await page.evaluate(() => {
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
  });
  await page.waitForTimeout(300);
  await page.click('[data-difficulty="고급"]');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(500);

  const hardAITimes = [];
  const hardMoves = [
    [6,4,4,4], // e4
    [6,3,4,3], // d4
    [7,6,5,5], // Nf3
    [7,1,5,2], // Nc3
  ];

  let hardMovesPlayed = 0;
  for (const [fr,fc,tr,tc] of hardMoves) {
    const hasPiece = await page.evaluate(([r,c]) => !!document.querySelector(`.square[data-row="${r}"][data-col="${c}"] .piece`), [fr,fc]);
    if (!hasPiece) { console.log(`  Skip: no piece at ${fr},${fc}`); continue; }

    await makeMove(page, fr, fc, tr, tc);
    hardMovesPlayed++;
    const t = Date.now();
    await waitForAI(page, 12000);
    const elapsed = Date.now() - t;
    hardAITimes.push(elapsed);
    console.log(`  Hard AI move ${hardMovesPlayed}: ${elapsed}ms`);

    const st = await page.evaluate(() => window.__chess?.getState()?.status);
    if (st === 'checkmate' || st === 'stalemate') break;
  }

  results.aiChecks.hardMovesPlayed = hardMovesPlayed;
  results.aiChecks.hardAIAvgTime = hardAITimes.length
    ? Math.round(hardAITimes.reduce((a,b)=>a+b,0)/hardAITimes.length) : 0;
  results.aiChecks.hardAIUnder8s = hardAITimes.every(t => t < 8000);
  console.log(`  Hard AI avg time: ${results.aiChecks.hardAIAvgTime}ms`);
  console.log(`  All under 8s: ${results.aiChecks.hardAIUnder8s}`);

  await page.screenshot({ path: `${SS_DIR}/s3-06-hard-ai-game.png`, fullPage: true });

  // Verify hard AI makes valid moves (no crashes, no illegal positions)
  const finalState = await page.evaluate(() => {
    const s = window.__chess?.getState();
    if (!s) return null;
    return { status: s.status, historyLen: s.history.length, turn: s.turn };
  });
  console.log(`  Hard AI final state: ${JSON.stringify(finalState)}`);
  results.aiChecks.hardAINoErrors = results.consoleErrors.length === 0;

  // ── Hint button test ──────────────────────────────────────
  console.log('=== Session 3: Hint Button Test ===');
  await page.click('#btn-hint');
  await page.waitForTimeout(2500); // hint takes ~1-2s
  await page.screenshot({ path: `${SS_DIR}/s3-07-hint.png`, fullPage: true });

  const hintHighlights = await page.$$('.square.hint-from, .square.hint-to');
  results.uiChecks.hintHighlightsShown = hintHighlights.length >= 2;
  console.log(`  Hint highlights shown: ${hintHighlights.length}`);

  // ── Scoring ───────────────────────────────────────────────
  let uiScore = 70;
  if (results.uiChecks.hintHighlightsShown) uiScore += 30;
  results.score.ui = Math.min(uiScore, 100);

  let rulesScore = 30;
  if (results.rulesChecks.promotionModalAppeared)          rulesScore += 25;
  if (results.rulesChecks.promotionQueenPlaced)            rulesScore += 20;
  if (results.rulesChecks.promotionPawnSelectable)         rulesScore += 5;
  if (results.rulesChecks.promotionSquareHighlighted)      rulesScore += 5;
  if (results.rulesChecks.pinnedPieceCannotMoveIllegally)  rulesScore += 15;
  results.score.rules = Math.min(rulesScore, 100);

  let aiScore = 40;
  if (results.aiChecks.hardAIUnder8s)          aiScore += 20;
  if (results.aiChecks.hardAIAvgTime < 4000)   aiScore += 20;
  if (results.aiChecks.hardAINoErrors)         aiScore += 20;
  results.score.ai = Math.min(aiScore, 100);

  console.log('\n--- Session 3 Results ---');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
})().catch(err => { console.error('Session 3 ERROR:', err); process.exit(1); });
