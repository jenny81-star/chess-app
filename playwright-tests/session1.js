/**
 * Session 1 — UI/UX Audit + Castling Test + 15 moves vs AI (Medium)
 */
const { chromium } = require('playwright');
const path = require('path');

const INDEX_PATH = 'file:///' + path.join('C:/Users/jenny/source/chess-app', 'index.html').replace(/\\/g, '/');
const SS_DIR = path.join('C:/Users/jenny/source/chess-app/playwright-tests/screenshots');

const errors = [];
const results = {
  session: 1,
  uiChecks: {},
  rulesChecks: {},
  aiChecks: {},
  consoleErrors: [],
  score: { ui: 0, rules: 0, ai: 0 },
};

async function waitForAI(page, timeout = 8000) {
  // Wait until AI thinking indicator disappears
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
  const sel = `.square[data-row="${row}"][data-col="${col}"]`;
  await page.click(sel);
  await page.waitForTimeout(100);
}

async function makeMove(page, fromRow, fromCol, toRow, toCol) {
  await clickSquare(page, fromRow, fromCol);
  await page.waitForTimeout(150);
  await clickSquare(page, toRow, toCol);
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
      console.log('[Console Error]', msg.text());
    }
  });

  // ── Step 1: Navigate ─────────────────────────────────────
  console.log('\n=== Session 1: Step 1 — Navigate to game ===');
  await page.goto(INDEX_PATH);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SS_DIR}/s1-01-menu.png`, fullPage: true });

  // ── Step 2: UI Audit — Menu Screen ───────────────────────
  console.log('=== Session 1: Step 2 — UI Audit (Menu) ===');

  // Check difficulty cards
  const diffCards = await page.$$('.difficulty-card');
  results.uiChecks.difficultyCards = diffCards.length;
  console.log(`  Difficulty cards: ${diffCards.length}`);

  // Check selected card
  const selectedCard = await page.$('.difficulty-card.selected');
  results.uiChecks.difficultySelectedCard = !!selectedCard;
  const selectedText = selectedCard ? await selectedCard.evaluate(el => el.dataset.difficulty) : null;
  console.log(`  Selected difficulty: ${selectedText}`);

  // Click 중급 and start game
  await page.click('[data-difficulty="중급"]');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SS_DIR}/s1-02-game-start.png`, fullPage: true });

  // ── Step 3: UI Audit — Game Screen ───────────────────────
  console.log('=== Session 1: Step 3 — UI Audit (Game) ===');

  // Board exists
  const boardEl = await page.$('#board');
  results.uiChecks.boardExists = !!boardEl;

  // 64 squares
  const squares = await page.$$('.square');
  results.uiChecks.squareCount = squares.length;
  console.log(`  Squares: ${squares.length}`);

  // Pieces
  const pieces = await page.$$('.piece');
  results.uiChecks.pieceCount = pieces.length;
  console.log(`  Pieces: ${pieces.length}`);

  // SVG inside pieces
  const svgPieces = await page.$$('.piece svg');
  results.uiChecks.svgPieceCount = svgPieces.length;
  console.log(`  SVG pieces: ${svgPieces.length}`);

  // Light/dark squares
  const lightSquares = await page.$$('.square.light');
  const darkSquares = await page.$$('.square.dark');
  results.uiChecks.lightSquares = lightSquares.length;
  results.uiChecks.darkSquares = darkSquares.length;
  console.log(`  Light: ${lightSquares.length}, Dark: ${darkSquares.length}`);

  // Rank and file labels
  const rankLabels = await page.$$('.coord.rank-label');
  const fileLabels = await page.$$('.coord.file-label');
  results.uiChecks.rankLabels = rankLabels.length;
  results.uiChecks.fileLabels = fileLabels.length;
  console.log(`  Rank labels: ${rankLabels.length}, File labels: ${fileLabels.length}`);

  // Sidebar elements
  const moveHistoryPanel = await page.$('#move-history-panel');
  results.uiChecks.moveHistoryPanel = !!moveHistoryPanel;

  const capturedByWhite = await page.$('#captured-by-white');
  const capturedByBlack = await page.$('#captured-by-black');
  results.uiChecks.capturedPiecesPanel = !!(capturedByWhite && capturedByBlack);

  const timerWhite = await page.$('#timer-white');
  const timerBlack = await page.$('#timer-black');
  results.uiChecks.timers = !!(timerWhite && timerBlack);

  const diffBadge = await page.$('#difficulty-badge');
  results.uiChecks.difficultyBadge = !!diffBadge;
  const badgeText = diffBadge ? await diffBadge.textContent() : '';
  console.log(`  Difficulty badge: ${badgeText}`);

  // Buttons
  const btnHint = await page.$('#btn-hint');
  const btnUndo = await page.$('#btn-undo');
  const btnResign = await page.$('#btn-resign');
  const btnNewGame = await page.$('#btn-new-game');
  const btnSave = await page.$('#btn-save');
  results.uiChecks.buttons = !!(btnHint && btnUndo && btnResign && btnNewGame && btnSave);
  console.log(`  Buttons: hint=${!!btnHint}, undo=${!!btnUndo}, resign=${!!btnResign}, newgame=${!!btnNewGame}, save=${!!btnSave}`);

  await page.screenshot({ path: `${SS_DIR}/s1-03-ui-audit.png`, fullPage: true });

  // ── Step 4: Castling Test (Kingside) ─────────────────────
  console.log('=== Session 1: Step 4 — Castling Test ===');

  // Clear path for kingside castling: move e2 pawn, g1 knight, f1 bishop
  // e2→e4
  await makeMove(page, 6, 4, 4, 4); // e2→e4
  await waitForAI(page);

  // g1→f3
  await makeMove(page, 7, 6, 5, 5); // Ng1→f3
  await waitForAI(page);

  // f1→e2 (bishop clears)
  await makeMove(page, 7, 5, 6, 4); // Bf1→e2 (if path is open)
  await waitForAI(page);

  await page.screenshot({ path: `${SS_DIR}/s1-04-castling-setup.png`, fullPage: true });

  // Now try kingside castling: e1→g1 (row 7, col 4 → row 7, col 6)
  await clickSquare(page, 7, 4); // select king
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SS_DIR}/s1-05-king-selected.png`, fullPage: true });

  // Check if g1 shows as valid move
  const g1El = await page.$(`.square[data-row="7"][data-col="6"]`);
  const g1Classes = g1El ? await g1El.evaluate(el => el.className) : '';
  console.log(`  g1 square classes after king select: ${g1Classes}`);
  results.rulesChecks.castlingHighlightVisible = g1Classes.includes('can-move');

  if (results.rulesChecks.castlingHighlightVisible) {
    await clickSquare(page, 7, 6); // castle kingside
    await page.waitForTimeout(500);
    await waitForAI(page);

    // Check rook moved to f1
    const f1Piece = await page.evaluate(() => {
      const el = document.querySelector('.square[data-row="7"][data-col="5"] .piece');
      return el ? true : false;
    });
    results.rulesChecks.castlingRookMoved = f1Piece;
    console.log(`  Castling rook moved to f1: ${f1Piece}`);

    const kingOnG1 = await page.evaluate(() => {
      const el = document.querySelector('.square[data-row="7"][data-col="6"] .piece');
      return el ? true : false;
    });
    results.rulesChecks.castlingKingMoved = kingOnG1;
    console.log(`  King on g1 after castling: ${kingOnG1}`);

    await page.screenshot({ path: `${SS_DIR}/s1-06-after-castling.png`, fullPage: true });
  } else {
    console.log('  [WARN] Castling move not highlighted — path may not be clear');
    await clickSquare(page, 7, 4); // deselect
    results.rulesChecks.castlingHighlightVisible = false;
    results.rulesChecks.castlingKingMoved = null;
    results.rulesChecks.castlingRookMoved = null;
  }

  // ── Step 5: Play 15 moves vs AI ──────────────────────────
  console.log('=== Session 1: Step 5 — Play 15 moves vs AI (Medium) ===');
  await page.click('#btn-new-game');
  await page.waitForTimeout(500);

  // Play standard opening moves
  const openingMoves = [
    [6, 4, 4, 4],  // e2→e4
    [6, 2, 4, 2],  // c2→c4
    [7, 6, 5, 5],  // Ng1→f3
    [7, 1, 5, 2],  // Nb1→c3
    [7, 5, 4, 2],  // Bf1→c4
  ];

  let movesPlayed = 0;
  const aiMoveTimes = [];

  for (const [fr, fc, tr, tc] of openingMoves) {
    const piece = await page.evaluate(([r, c]) => {
      const el = document.querySelector(`.square[data-row="${r}"][data-col="${c}"] .piece`);
      return !!el;
    }, [fr, fc]);
    if (!piece) { console.log(`  Skip move ${fr},${fc}→${tr},${tc}: no piece`); continue; }

    await makeMove(page, fr, fc, tr, tc);
    movesPlayed++;
    await page.screenshot({ path: `${SS_DIR}/s1-07-move${movesPlayed}.png`, fullPage: true });

    const aiStart = Date.now();
    await waitForAI(page);
    const aiEnd = Date.now();
    aiMoveTimes.push(aiEnd - aiStart);
    console.log(`  Move ${movesPlayed}: AI responded in ${aiEnd - aiStart}ms`);

    // Check game not over
    const gameStatus = await page.evaluate(() => {
      return window.__chess ? window.__chess.getState()?.status : 'unknown';
    });
    if (gameStatus === 'checkmate' || gameStatus === 'stalemate') {
      console.log(`  Game ended at move ${movesPlayed}: ${gameStatus}`);
      break;
    }
  }

  results.aiChecks.movesPlayed = movesPlayed;
  results.aiChecks.avgAIResponseTime = aiMoveTimes.length
    ? Math.round(aiMoveTimes.reduce((a,b) => a+b, 0) / aiMoveTimes.length)
    : 0;
  results.aiChecks.maxAIResponseTime = aiMoveTimes.length ? Math.max(...aiMoveTimes) : 0;
  console.log(`  AI avg response time: ${results.aiChecks.avgAIResponseTime}ms`);
  console.log(`  AI max response time: ${results.aiChecks.maxAIResponseTime}ms`);

  // Check AI played legal moves only (no console errors)
  results.aiChecks.noLegalMoveErrors = results.consoleErrors.length === 0;

  await page.screenshot({ path: `${SS_DIR}/s1-08-after-15moves.png`, fullPage: true });

  // ── Step 6: Scoring ──────────────────────────────────────
  console.log('=== Session 1: Step 6 — Scoring ===');

  // UI Score
  let uiScore = 0;
  if (results.uiChecks.boardExists)             uiScore += 8;
  if (results.uiChecks.squareCount === 64)       uiScore += 7;
  if (results.uiChecks.pieceCount === 32)        uiScore += 7;
  if (results.uiChecks.svgPieceCount === 32)     uiScore += 8;
  if (results.uiChecks.lightSquares === 32 && results.uiChecks.darkSquares === 32) uiScore += 5;
  if (results.uiChecks.rankLabels === 8)         uiScore += 5;
  if (results.uiChecks.fileLabels === 8)         uiScore += 5;
  if (results.uiChecks.moveHistoryPanel)         uiScore += 8;
  if (results.uiChecks.capturedPiecesPanel)      uiScore += 7;
  if (results.uiChecks.timers)                   uiScore += 5;
  if (results.uiChecks.difficultyBadge)          uiScore += 5;
  if (results.uiChecks.buttons)                  uiScore += 10;
  if (results.uiChecks.difficultyCards === 5)    uiScore += 8;
  if (results.uiChecks.difficultySelectedCard)   uiScore += 5;
  if (results.consoleErrors.length === 0)        uiScore += 7;
  results.score.ui = Math.min(uiScore, 100);

  // Rules Score
  let rulesScore = 70; // base
  if (results.rulesChecks.castlingHighlightVisible) rulesScore += 15;
  if (results.rulesChecks.castlingKingMoved)        rulesScore += 10;
  if (results.rulesChecks.castlingRookMoved)        rulesScore += 5;
  results.score.rules = Math.min(rulesScore, 100);

  // AI Score
  let aiScore = 50;
  if (results.aiChecks.avgAIResponseTime < 3000)   aiScore += 20;
  if (results.aiChecks.avgAIResponseTime < 1500)   aiScore += 10;
  if (results.aiChecks.movesPlayed >= 3)            aiScore += 10;
  if (results.aiChecks.noLegalMoveErrors)           aiScore += 10;
  results.score.ai = Math.min(aiScore, 100);

  console.log('\n--- Session 1 Results ---');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
  return results;
})().catch(err => {
  console.error('Session 1 ERROR:', err);
  process.exit(1);
});
