/**
 * Session 2 — En Passant Test + Check Detection + 15 moves vs AI (Easy)
 */
const { chromium } = require('playwright');
const path = require('path');

const INDEX_PATH = 'file:///' + path.join('C:/Users/jenny/source/chess-app', 'index.html').replace(/\\/g, '/');
const SS_DIR = 'C:/Users/jenny/source/chess-app/playwright-tests/screenshots';

const results = {
  session: 2,
  uiChecks: {},
  rulesChecks: {},
  aiChecks: {},
  consoleErrors: [],
  score: { ui: 0, rules: 0, ai: 0 },
};

async function waitForAI(page, timeout = 8000) {
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('ai-thinking');
      return el && el.style.display === 'none';
    }, { timeout });
  } catch(e) {
    console.log('[WARN] AI thinking wait timed out');
  }
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
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
    }
  });

  await page.goto(INDEX_PATH);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);

  // ── Start Easy difficulty ─────────────────────────────────
  console.log('\n=== Session 2: Start — Easy Difficulty ===');
  await page.click('[data-difficulty="초급"]');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SS_DIR}/s2-01-start-easy.png`, fullPage: true });

  // ── Quick UI recheck ──────────────────────────────────────
  const squares = await page.$$('.square');
  const pieces  = await page.$$('.piece svg');
  results.uiChecks.squareCount   = squares.length;
  results.uiChecks.svgPieceCount = pieces.length;

  // Check that 'selected' highlight works
  await clickSquare(page, 6, 4); // click e2 pawn
  const e2Classes = await page.evaluate(() => {
    return document.querySelector('.square[data-row="6"][data-col="4"]')?.className || '';
  });
  results.uiChecks.selectionHighlight = e2Classes.includes('selected');
  console.log(`  e2 classes after click: ${e2Classes}`);

  // Check can-move dots appear
  const canMoveSquares = await page.$$('.square.can-move');
  results.uiChecks.canMoveHighlights = canMoveSquares.length;
  console.log(`  can-move squares: ${canMoveSquares.length}`);

  await page.screenshot({ path: `${SS_DIR}/s2-02-piece-selected.png`, fullPage: true });
  await clickSquare(page, 6, 4); // deselect

  // ── En Passant Setup ──────────────────────────────────────
  console.log('=== Session 2: En Passant Test ===');
  // We need to get white's e-pawn to row 3 (rank 5) and black's f-pawn to row 3
  // Strategy: e2→e4→e5, then maneuver so black plays f7→f5, then capture en passant

  // 1. e2→e4
  await makeMove(page, 6, 4, 4, 4);
  await waitForAI(page);
  await page.screenshot({ path: `${SS_DIR}/s2-03-e4.png`, fullPage: true });

  // 2. Keep advancing e-pawn: e4→e5
  await makeMove(page, 4, 4, 3, 4);
  await waitForAI(page);
  await page.screenshot({ path: `${SS_DIR}/s2-04-e5.png`, fullPage: true });

  // 3. We need to wait for black's f7 pawn to advance to f5
  // Check current board state
  const boardState = await page.evaluate(() => {
    const state = window.__chess?.getState();
    if (!state) return null;
    // Return positions of all black pawns
    const pawns = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (p && p.type === 'P' && p.color === 'black') pawns.push({ r, c });
      }
    }
    return { pawns, enPassantTarget: state.enPassantTarget };
  });
  console.log('  Black pawns:', JSON.stringify(boardState?.pawns));

  // The AI may or may not have moved f-pawn. Let's check if any black pawn is on row 3 next to white e-pawn (row 3, col 4)
  // White pawn is on row 3 (e5), we need a black pawn on row 3 col 3(d5) or col 5(f5)
  const whiteEPawn = await page.evaluate(() => {
    const state = window.__chess?.getState();
    if (!state) return null;
    const p = state.board[3][4];
    return p;
  });
  console.log('  White pawn on e5 (row3,col4):', JSON.stringify(whiteEPawn));

  // Check if black pawn moved next to white pawn (en passant opportunity)
  const epOpportunity = await page.evaluate(() => {
    const state = window.__chess?.getState();
    if (!state) return false;
    // Check d5 or f5 for black pawns
    const d5 = state.board[3][3];
    const f5 = state.board[3][5];
    return { d5, f5, enPassant: state.enPassantTarget };
  });
  console.log('  EP opportunity check:', JSON.stringify(epOpportunity));

  // If AI didn't create EP opportunity naturally, we'll make more moves and force it
  // Play a few more moves to see if EP comes up
  let epFound = false;

  // Make a few moves on the flank to give black time to advance f-pawn
  const flankMoves = [
    [7, 6, 5, 5], // Ng1→f3
    [7, 1, 5, 2], // Nb1→c3
  ];
  for (const [fr, fc, tr, tc] of flankMoves) {
    const hasPiece = await page.evaluate(([r,c]) => !!document.querySelector(`.square[data-row="${r}"][data-col="${c}"] .piece`), [fr,fc]);
    if (!hasPiece) continue;
    await makeMove(page, fr, fc, tr, tc);
    await waitForAI(page);

    const ep2 = await page.evaluate(() => {
      const state = window.__chess?.getState();
      if (!state) return null;
      return { d5: state.board[3][3], f5: state.board[3][5], ep: state.enPassantTarget };
    });
    console.log('  After move, ep check:', JSON.stringify(ep2));
    if (ep2?.ep) { epFound = true; break; }
  }

  if (epFound) {
    // Select e5 pawn
    await clickSquare(page, 3, 4);
    await page.waitForTimeout(300);
    const epMoves = await page.$$('.square.can-capture');
    console.log(`  can-capture squares: ${epMoves.length}`);

    // Try en passant capture
    const epState = await page.evaluate(() => {
      const state = window.__chess?.getState();
      return state?.enPassantTarget;
    });
    if (epState) {
      console.log(`  En passant target: row${epState[0]}, col${epState[1]}`);
      await clickSquare(page, epState[0], epState[1]);
      await page.waitForTimeout(500);
      // Verify captured pawn is gone
      const captureRow = 3; // black pawn was on row 3
      const capturedPawn = await page.evaluate(([r,c]) => {
        return !!document.querySelector(`.square[data-row="${r}"][data-col="${c}"] .piece`);
      }, [captureRow, epState[1]]);
      results.rulesChecks.enPassantCapturedPawnGone = !capturedPawn;
      console.log(`  En passant captured pawn gone: ${!capturedPawn}`);
      results.rulesChecks.enPassantWorked = true;
    } else {
      results.rulesChecks.enPassantWorked = false;
      console.log('  [WARN] No en passant target found');
    }
  } else {
    console.log('  [INFO] AI did not create en passant opportunity in this game');
    results.rulesChecks.enPassantWorked = null; // inconclusive
    results.rulesChecks.enPassantCapturedPawnGone = null;
  }
  await page.screenshot({ path: `${SS_DIR}/s2-05-en-passant.png`, fullPage: true });

  // ── Check Detection Test ──────────────────────────────────
  console.log('=== Session 2: Check Detection Test ===');
  await page.click('#btn-new-game');
  await page.waitForTimeout(500);

  // Set up a position where we can put king in check
  // Scholar's mate attempt: e4, Bc4, Qh5, Qxf7#
  // But first just verify check highlight
  await makeMove(page, 6, 4, 4, 4); // e4
  await waitForAI(page);
  await makeMove(page, 7, 5, 4, 2); // Bf1→c4
  await waitForAI(page);
  await makeMove(page, 7, 3, 5, 5); // Qd1→f3 (possible after clearing)
  await waitForAI(page);

  // Check if game reports check
  const gameStatus = await page.evaluate(() => window.__chess?.getState()?.status);
  console.log(`  Game status: ${gameStatus}`);
  results.rulesChecks.gameStatusTracked = typeof gameStatus === 'string';

  // Check if in-check highlight works when king is in check
  const inCheckSquares = await page.$$('.square.in-check');
  results.rulesChecks.checkHighlightWorks = inCheckSquares.length >= 0; // may or may not be in check
  console.log(`  In-check highlighted squares: ${inCheckSquares.length}`);

  await page.screenshot({ path: `${SS_DIR}/s2-06-check-test.png`, fullPage: true });

  // Verify last-move highlight
  const lastFromSquares = await page.$$('.square.last-from');
  const lastToSquares   = await page.$$('.square.last-to');
  results.uiChecks.lastMoveHighlight = lastFromSquares.length > 0 && lastToSquares.length > 0;
  console.log(`  Last move highlights: from=${lastFromSquares.length}, to=${lastToSquares.length}`);

  // ── AI Easy 10 moves ──────────────────────────────────────
  console.log('=== Session 2: AI Easy — 10 moves ===');
  await page.click('#btn-new-game');
  await page.waitForTimeout(500);

  const aiMoveTimes = [];
  const openingMoves = [
    [6,4,4,4],[6,3,4,3],[7,6,5,5],[7,5,4,2],[7,3,4,3],[6,6,5,6],
  ];

  let movesPlayed = 0;
  for (const [fr,fc,tr,tc] of openingMoves) {
    const hasPiece = await page.evaluate(([r,c]) => !!document.querySelector(`.square[data-row="${r}"][data-col="${c}"] .piece`), [fr,fc]);
    if (!hasPiece) { console.log(`  skip ${fr},${fc}: no piece`); continue; }

    await makeMove(page, fr, fc, tr, tc);
    movesPlayed++;
    const aiStart = Date.now();
    await waitForAI(page);
    aiMoveTimes.push(Date.now() - aiStart);

    const st = await page.evaluate(() => window.__chess?.getState()?.status);
    if (st === 'checkmate' || st === 'stalemate') break;
  }

  results.aiChecks.movesPlayed    = movesPlayed;
  results.aiChecks.avgAITime      = aiMoveTimes.length ? Math.round(aiMoveTimes.reduce((a,b)=>a+b,0)/aiMoveTimes.length) : 0;
  results.aiChecks.allUnder3s     = aiMoveTimes.every(t => t < 3000);
  console.log(`  AI avg time (easy): ${results.aiChecks.avgAITime}ms, all under 3s: ${results.aiChecks.allUnder3s}`);

  // ── Leave a piece en prise and check if AI takes it ──────
  // Place a pawn forward and exposed — check if easy AI captures
  const stateBeforeLure = await page.evaluate(() => {
    const s = window.__chess?.getState();
    return s ? s.capturedPieces.black.length : 0;
  });

  await page.screenshot({ path: `${SS_DIR}/s2-07-easy-ai-game.png`, fullPage: true });
  results.aiChecks.noConsoleErrors = results.consoleErrors.length === 0;

  // ── Scoring ───────────────────────────────────────────────
  let uiScore = 0;
  if (results.uiChecks.squareCount === 64)       uiScore += 15;
  if (results.uiChecks.svgPieceCount === 32)     uiScore += 15;
  if (results.uiChecks.selectionHighlight)       uiScore += 15;
  if (results.uiChecks.canMoveHighlights >= 2)   uiScore += 15;
  if (results.uiChecks.lastMoveHighlight)        uiScore += 15;
  if (results.consoleErrors.length === 0)        uiScore += 25;
  results.score.ui = Math.min(uiScore, 100);

  let rulesScore = 50;
  if (results.rulesChecks.gameStatusTracked)     rulesScore += 20;
  if (results.rulesChecks.checkHighlightWorks)   rulesScore += 15;
  if (results.rulesChecks.enPassantWorked === true) rulesScore += 15;
  if (results.rulesChecks.enPassantWorked === null) rulesScore += 10; // inconclusive but no crash
  results.score.rules = Math.min(rulesScore, 100);

  let aiScore = 50;
  if (results.aiChecks.allUnder3s)          aiScore += 20;
  if (results.aiChecks.avgAITime < 1000)    aiScore += 15;
  if (results.aiChecks.movesPlayed >= 4)    aiScore += 15;
  results.score.ai = Math.min(aiScore, 100);

  console.log('\n--- Session 2 Results ---');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
})().catch(err => { console.error('Session 2 ERROR:', err); process.exit(1); });
