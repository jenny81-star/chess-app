/**
 * Session 5 — Save/Load + Correct Checkmate (Fool's Mate) + Master AI + Full UI review
 */
const { chromium } = require('playwright');

const INDEX_PATH = 'file:///C:/Users/jenny/source/chess-app/index.html';
const SS_DIR = 'C:/Users/jenny/source/chess-app/playwright-tests/screenshots';

const results = {
  session: 5,
  uiChecks: {},
  rulesChecks: {},
  aiChecks: {},
  consoleErrors: [],
  score: { ui: 0, rules: 0, ai: 0 },
};

async function waitForAI(page, timeout = 12000) {
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
    if (msg.type() === 'log' && msg.text().includes('[Chess]')) {
      console.log(`  [Page Log] ${msg.text()}`);
    }
  });

  await page.goto(INDEX_PATH);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);

  // ── Checkmate: Fool's Mate ────────────────────────────────
  console.log('\n=== Session 5: Fool\'s Mate Checkmate Test ===');
  await page.click('[data-difficulty="입문"]');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(500);

  // Fool's Mate: 1.f3 e5 2.g4 Qh4#
  // After Qh4, white king is in checkmate
  // But we are white — so we need to trigger black's checkmate ON white
  // Actually this means we need to play f3 and g4, then AI (black) plays Qh4 (if it sees it)
  // For AI at 입문 level, it's unlikely to find this. Let's inject directly.

  // Inject Fool's Mate final position (black queen delivers checkmate to white king)
  const foolsMateInjected = await page.evaluate(() => {
    try {
      const state = window.__chess.getState();
      if (!state) return 'no state';

      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) state.board[r][c] = null;

      // Fool's Mate position: Qh4#
      // White king e1(row7,col4) is in check from Qh4(row4,col7)
      // White has pawns blocking escape: f3(row5,col5), g4(row4,col6)
      // White pieces:
      state.board[7][4] = { type: 'K', color: 'white' }; // Ke1
      state.board[5][5] = { type: 'P', color: 'white' }; // f3
      state.board[4][6] = { type: 'P', color: 'white' }; // g4

      // Black pieces: Queen about to move to h4
      state.board[0][4] = { type: 'K', color: 'black' }; // Ke8
      state.board[0][3] = { type: 'Q', color: 'black' }; // Qd8 (will move to h4)

      state.turn = 'black'; // It's black's turn to deliver Qh4
      state.status = 'playing';
      state.castlingRights = { whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false };

      window.ChessGame.setState(state);
      window.ChessRenderer.onBoardReady(state);
      return 'ok';
    } catch(e) {
      return 'error: ' + e.message;
    }
  });
  console.log(`  Fool's Mate setup: ${foolsMateInjected}`);
  await page.screenshot({ path: `${SS_DIR}/s5-01-fools-mate-setup.png`, fullPage: true });

  if (foolsMateInjected === 'ok') {
    // Trigger AI to find Qh4# — but AI is in black's position
    // Since it's black's turn and we set the game, trigger AI
    // Actually we need to let AI play (it's black's turn)
    // But we also need to directly make Qd8→h4 to test engine
    // Inject: position AFTER Qh4 (white king in checkmate)
    const checkmatePos = await page.evaluate(() => {
      try {
        const state = window.__chess.getState();

        // Apply Qd8→h4
        state.board[4][7] = { type: 'Q', color: 'black' }; // Qh4 — delivers check
        state.board[0][3] = null; // Qd8 gone

        state.turn = 'white'; // Now white to move
        state.status = 'playing';

        // Update game status — should detect checkmate
        const updated = window.ChessMoves.updateGameStatus(state);
        window.ChessGame.setState(updated);
        window.ChessRenderer.onBoardReady(updated);
        return updated.status;
      } catch(e) {
        return 'error: ' + e.message;
      }
    });
    console.log(`  Engine status after Qh4: ${checkmatePos}`);
    results.rulesChecks.foolsMateDetected = checkmatePos === 'checkmate';
    console.log(`  Fool's Mate checkmate detected: ${checkmatePos === 'checkmate'}`);
    await page.screenshot({ path: `${SS_DIR}/s5-02-fools-mate-state.png`, fullPage: true });

    // Verify: in check highlight on white king
    await page.waitForTimeout(400);
    const inCheckSquares = await page.$$('.square.in-check');
    results.rulesChecks.foolsMateKingHighlighted = inCheckSquares.length > 0;
    console.log(`  King in-check highlighted: ${inCheckSquares.length > 0}`);

    // Wait for modal
    await page.waitForTimeout(800);
    const gmModal = await page.$('#gameover-modal');
    const gmVisible = gmModal ? await gmModal.evaluate(el => el.style.display !== 'none') : false;
    results.uiChecks.checkmateModalShown = gmVisible;
    console.log(`  Game-over modal shown: ${gmVisible}`);

    if (gmVisible) {
      const title = await page.$eval('#gameover-title', el => el.textContent);
      console.log(`  Modal title: ${title}`);
      results.uiChecks.checkmateModalTitle = title;
      await page.screenshot({ path: `${SS_DIR}/s5-03-checkmate-modal.png`, fullPage: true });
    }
  }

  // ── Save/Load Test ────────────────────────────────────────
  console.log('=== Session 5: Save/Load Test ===');

  // Dismiss modal if open
  const modalEl = await page.$('#gameover-modal');
  if (modalEl && await modalEl.evaluate(el => el.style.display !== 'none')) {
    await page.click('#btn-rematch');
    await page.waitForTimeout(500);
  }

  // Start fresh game and make some moves
  await page.click('#btn-new-game');
  await page.waitForTimeout(500);

  await makeMove(page, 6, 4, 4, 4); // e4
  await waitForAI(page);
  await makeMove(page, 6, 3, 4, 3); // d4
  await waitForAI(page);

  // Capture FEN before save
  const fenBefore = await page.evaluate(() => window.__chess?.getFEN());
  const histLenBefore = await page.evaluate(() => window.__chess?.getState()?.history.length);
  console.log(`  FEN before save: ${fenBefore}`);
  console.log(`  History length before save: ${histLenBefore}`);

  // Save the game
  await page.click('#btn-save');
  await page.waitForTimeout(500);

  // Check localStorage has save data
  const saveExists = await page.evaluate(() => {
    return !!localStorage.getItem('chess_game_save');
  });
  results.rulesChecks.saveWorked = saveExists;
  console.log(`  Save to localStorage: ${saveExists}`);
  await page.screenshot({ path: `${SS_DIR}/s5-04-after-save.png`, fullPage: true });

  // Navigate back to menu
  await page.evaluate(() => {
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
  });
  await page.waitForTimeout(300);

  // Load the saved game
  await page.click('#btn-load');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SS_DIR}/s5-05-after-load.png`, fullPage: true });

  // Verify position matches
  const fenAfterLoad = await page.evaluate(() => window.__chess?.getFEN());
  const histLenAfterLoad = await page.evaluate(() => window.__chess?.getState()?.history.length);
  console.log(`  FEN after load: ${fenAfterLoad}`);
  console.log(`  History length after load: ${histLenAfterLoad}`);

  results.rulesChecks.loadRestoredPosition = (fenBefore === fenAfterLoad);
  results.rulesChecks.loadRestoredHistory   = (histLenBefore === histLenAfterLoad);
  console.log(`  Position restored correctly: ${results.rulesChecks.loadRestoredPosition}`);
  console.log(`  History restored correctly: ${results.rulesChecks.loadRestoredHistory}`);

  // ── Master AI Test ────────────────────────────────────────
  console.log('=== Session 5: Master AI (마스터) — 5 moves ===');
  await page.evaluate(() => {
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
  });
  await page.waitForTimeout(300);
  await page.click('[data-difficulty="마스터"]');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(500);

  const masterTimes = [];
  const masterMoves = [[6,4,4,4],[6,3,4,3],[7,6,5,5]];
  let masterPlayed = 0;
  for (const [fr,fc,tr,tc] of masterMoves) {
    const hp = await page.evaluate(([r,c]) => !!document.querySelector(`.square[data-row="${r}"][data-col="${c}"] .piece`), [fr,fc]);
    if (!hp) continue;
    await makeMove(page, fr, fc, tr, tc);
    masterPlayed++;
    const t = Date.now();
    await waitForAI(page, 15000);
    masterTimes.push(Date.now() - t);
    console.log(`  Master AI move ${masterPlayed}: ${masterTimes[masterTimes.length-1]}ms`);
    const st = await page.evaluate(() => window.__chess?.getState()?.status);
    if (st === 'checkmate' || st === 'stalemate') break;
  }
  results.aiChecks.masterMovesPlayed = masterPlayed;
  results.aiChecks.masterAvgTime = masterTimes.length
    ? Math.round(masterTimes.reduce((a,b)=>a+b,0)/masterTimes.length) : 0;
  results.aiChecks.masterUnder15s = masterTimes.every(t => t < 15000);
  console.log(`  Master AI avg time: ${results.aiChecks.masterAvgTime}ms`);
  await page.screenshot({ path: `${SS_DIR}/s5-06-master-ai.png`, fullPage: true });

  // ── Queenside Castling test ───────────────────────────────
  console.log('=== Session 5: Queenside Castling Test ===');
  await page.click('#btn-new-game');
  await page.waitForTimeout(500);

  // Clear queenside: d2→d4, c1→e3, Qd1→d2, Nb1→c3
  const qsCastleMoves = [
    [6,3,4,3], // d2→d4
    [6,2,5,2], // c2→c3 (to clear bishop path)
    [7,2,5,4], // Bc1→e3
    [7,3,5,3], // Qd1→d3
    [7,1,5,2], // Nb1→c3 (already moved c2-c3, knight goes to c3? No — c3 is now occupied by pawn)
  ];

  // Inject a board with queenside castling possible
  const qsCastleInjected = await page.evaluate(() => {
    try {
      const state = window.__chess.getState();
      if (!state) return false;

      // Set up: White king e1, Rook a1, pieces between removed
      state.board[7][1] = null; // remove Nb1
      state.board[7][2] = null; // remove Bc1
      state.board[7][3] = null; // remove Qd1
      state.castlingRights.whiteQueenSide = true;
      state.turn = 'white';
      state.status = 'playing';

      window.ChessGame.setState(state);
      window.ChessRenderer.onBoardReady(state);
      return true;
    } catch(e) { return false; }
  });
  console.log(`  Queenside castling setup: ${qsCastleInjected}`);
  await page.screenshot({ path: `${SS_DIR}/s5-07-qs-castle-setup.png`, fullPage: true });

  if (qsCastleInjected) {
    await clickSquare(page, 7, 4); // select king
    await page.waitForTimeout(300);
    const c1Classes = await page.evaluate(() =>
      document.querySelector('.square[data-row="7"][data-col="2"]')?.className || '');
    results.rulesChecks.queensideCastlingHighlighted = c1Classes.includes('can-move');
    console.log(`  Queenside castling (c1) highlighted: ${c1Classes}`);

    if (results.rulesChecks.queensideCastlingHighlighted) {
      await clickSquare(page, 7, 2); // castle queenside
      await page.waitForTimeout(600);
      // Check king on c1 (row7,col2) and rook on d1 (row7,col3)
      const kingOnC1 = await page.evaluate(() => {
        const p = window.__chess?.getState()?.board[7][2];
        return p?.type === 'K' && p?.color === 'white';
      });
      const rookOnD1 = await page.evaluate(() => {
        const p = window.__chess?.getState()?.board[7][3];
        return p?.type === 'R' && p?.color === 'white';
      });
      results.rulesChecks.queensideCastlingKingMoved = kingOnC1;
      results.rulesChecks.queensideCastlingRookMoved = rookOnD1;
      console.log(`  King on c1: ${kingOnC1}, Rook on d1: ${rookOnD1}`);
      await page.screenshot({ path: `${SS_DIR}/s5-08-qs-castle-done.png`, fullPage: true });
    } else {
      await clickSquare(page, 7, 4); // deselect
    }
  }

  // ── UI Final checks ───────────────────────────────────────
  console.log('=== Session 5: Final UI Checks ===');

  // Check AI thinking indicator exists and has correct structure
  const aiThinking = await page.$('#ai-thinking');
  results.uiChecks.aiThinkingIndicator = !!aiThinking;

  // Check player cards active state
  const whiteCardActive = await page.evaluate(() => {
    return document.getElementById('white-player-card')?.classList.contains('active');
  });
  results.uiChecks.playerCardActiveState = whiteCardActive;
  console.log(`  White player card active (white's turn): ${whiteCardActive}`);

  // Check timer is running
  const timerVal = await page.$eval('#timer-white', el => el.textContent);
  console.log(`  White timer value: ${timerVal}`);
  results.uiChecks.timerRunning = timerVal !== '00:00'; // should be non-zero after playing

  // Check move history has entries
  const moveHistoryContent = await page.$eval('#move-history', el => el.innerHTML);
  results.uiChecks.moveHistoryHasContent = moveHistoryContent.length > 0;
  console.log(`  Move history content length: ${moveHistoryContent.length} chars`);

  // Resign button test
  await page.click('#btn-resign');
  await page.waitForTimeout(300);
  const resignModal = await page.$('#resign-modal');
  const resignVisible = resignModal ? await resignModal.evaluate(el => el.style.display !== 'none') : false;
  results.uiChecks.resignModalWorks = resignVisible;
  console.log(`  Resign modal shows: ${resignVisible}`);
  if (resignVisible) {
    await page.click('#btn-resign-cancel');
    await page.waitForTimeout(200);
  }

  await page.screenshot({ path: `${SS_DIR}/s5-09-final-ui.png`, fullPage: true });

  // ── Scoring ───────────────────────────────────────────────
  let uiScore = 50;
  if (results.uiChecks.checkmateModalShown)    uiScore += 15;
  if (results.uiChecks.aiThinkingIndicator)    uiScore += 5;
  if (results.uiChecks.playerCardActiveState)  uiScore += 5;
  if (results.uiChecks.moveHistoryHasContent)  uiScore += 10;
  if (results.uiChecks.resignModalWorks)       uiScore += 10;
  if (results.uiChecks.timerRunning)           uiScore += 5;
  results.score.ui = Math.min(uiScore, 100);

  let rulesScore = 20;
  if (results.rulesChecks.foolsMateDetected)         rulesScore += 20;
  if (results.rulesChecks.foolsMateKingHighlighted)  rulesScore += 10;
  if (results.rulesChecks.saveWorked)                rulesScore += 15;
  if (results.rulesChecks.loadRestoredPosition)      rulesScore += 15;
  if (results.rulesChecks.loadRestoredHistory)       rulesScore += 10;
  if (results.rulesChecks.queensideCastlingHighlighted) rulesScore += 5;
  if (results.rulesChecks.queensideCastlingKingMoved)   rulesScore += 3;
  if (results.rulesChecks.queensideCastlingRookMoved)   rulesScore += 2;
  results.score.rules = Math.min(rulesScore, 100);

  let aiScore = 50;
  if (results.aiChecks.masterUnder15s)          aiScore += 20;
  if (results.aiChecks.masterAvgTime < 5000)    aiScore += 15;
  if (results.aiChecks.masterAvgTime < 3000)    aiScore += 15;
  if (results.consoleErrors.length === 0)       aiScore += 0;
  results.score.ai = Math.min(aiScore, 100);

  console.log('\n--- Session 5 Results ---');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
})().catch(err => { console.error('Session 5 ERROR:', err); process.exit(1); });
