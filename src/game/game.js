/**
 * game.js — 게임 진입점
 * 메뉴 화면 전환, 게임 상태 초기화, AI 턴 제어
 */
(function () {
  'use strict';

  const { createInitialState, applyMove, toFEN } = window.ChessBoard;
  const {
    getLegalMoves,
    getAllLegalMoves,
    isInCheck,
    isCheckmate,
    isStalemate,
    updateGameStatus,
  } = window.ChessMoves;
  const { getBestMove, getHintMove, analyzePosition, DIFFICULTY_CONFIG } = window.ChessAI;
  const { evaluate } = window.ChessEval;

  // ─── 상태 ──────────────────────────────────────────────────
  let gameState = null;
  let selectedSquare = null;   // [row, col] | null
  let legalMovesCache = [];    // 선택된 기물의 합법 이동 목록

  // ─── 타이머 ──────────────────────────────────────────────
  let _whiteTime     = 0;
  let _blackTime     = 0;
  let _timerInterval = null;

  // 디버깅용 — 브라우저 콘솔에서 __chess로 접근 가능
  window.__chess = {
    getState:        () => gameState,
    getFEN:          () => gameState ? toFEN(gameState) : null,
    getLegalMoves:   (r, c)  => gameState ? getLegalMoves(gameState, r, c) : [],
    getAllMoves:      (color) => gameState ? getAllLegalMoves(gameState, color) : [],
    evaluate:        ()      => gameState ? evaluate(gameState) : null,
    getBestMove:     (diff)  => gameState ? getBestMove(gameState, diff || gameState.difficulty) : null,
    getHintMove:     ()      => gameState ? getHintMove(gameState) : null,
    analyzePosition: (depth) => gameState ? analyzePosition(gameState, depth) : null,
    difficultyConfig: DIFFICULTY_CONFIG,
  };

  // ─── DOM 참조 ──────────────────────────────────────────────
  const menuScreen      = document.getElementById('menu-screen');
  const gameScreen      = document.getElementById('game-screen');
  const boardEl         = document.getElementById('board');
  const difficultyBadge = document.getElementById('difficulty-badge');

  // ─── 난이도 선택 ─────────────────────────────────────────
  let selectedDifficulty = '중급';

  document.getElementById('difficulty-list').addEventListener('click', (e) => {
    const card = e.target.closest('.difficulty-card');
    if (!card) return;

    document.querySelectorAll('.difficulty-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedDifficulty = card.dataset.difficulty;
  });

  // ─── 메뉴 버튼 ─────────────────────────────────────────────
  document.getElementById('btn-start').addEventListener('click', () => {
    startNewGame(selectedDifficulty);
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    loadGame();
  });

  // ─── 게임 내 버튼 ──────────────────────────────────────────
  document.getElementById('btn-new-game').addEventListener('click', () => {
    startNewGame(selectedDifficulty);
  });

  document.getElementById('btn-resign').addEventListener('click', () => {
    document.getElementById('resign-modal').style.display = 'flex';
  });

  document.getElementById('btn-resign-confirm').addEventListener('click', () => {
    document.getElementById('resign-modal').style.display = 'none';
    showGameOverModal('lose');
  });

  document.getElementById('btn-resign-cancel').addEventListener('click', () => {
    document.getElementById('resign-modal').style.display = 'none';
  });

  document.getElementById('btn-rematch').addEventListener('click', () => {
    document.getElementById('gameover-modal').style.display = 'none';
    startNewGame(selectedDifficulty);
  });

  document.getElementById('btn-change-difficulty').addEventListener('click', () => {
    document.getElementById('gameover-modal').style.display = 'none';
    showMenu();
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    saveGame();
  });

  document.getElementById('btn-hint').addEventListener('click', onHintClick);
  document.getElementById('btn-undo').addEventListener('click', () => {
    undoLastRound();
  });

  // ─── 게임 시작 ─────────────────────────────────────────────
  function startNewGame(difficulty) {
    gameState = createInitialState();
    gameState.difficulty = difficulty;

    selectedSquare = null;
    legalMovesCache = [];

    difficultyBadge.textContent = getDifficultyStars(difficulty) + ' ' + difficulty;

    menuScreen.style.display = 'none';
    gameScreen.style.display = 'flex';

    renderBoard();
    updatePlayerCards();
    if (window.ChessRenderer) window.ChessRenderer.onBoardReady(gameState);

    resetTimer();
    startTimer();

    console.log('[Chess] New game started:', difficulty);
    console.log('[Chess] Initial FEN:', toFEN(gameState));
  }

  function showMenu() {
    gameScreen.style.display = 'none';
    menuScreen.style.display = 'flex';
  }

  // ─── 보드 렌더링 ─────────────────────────────────────────
  function renderBoard() {
    boardEl.innerHTML = '';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const square = document.createElement('div');
        square.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        square.dataset.row = r;
        square.dataset.col = c;

        // 랭크 레이블 (왼쪽 열 칸, 칸 좌상단)
        if (c === 0) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'coord rank-label';
          rankLabel.textContent = 8 - r;
          square.appendChild(rankLabel);
        }

        // 파일 레이블 (아래 행 칸, 칸 우하단)
        if (r === 7) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'coord file-label';
          fileLabel.textContent = 'abcdefgh'[c];
          square.appendChild(fileLabel);
        }

        boardEl.appendChild(square);
      }
    }

    boardEl.addEventListener('click', onBoardClick);
  }

  function onBoardClick(e) {
    const square = e.target.closest('.square');
    if (!square || !gameState) return;

    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);

    if (window.ChessRenderer) {
      window.ChessRenderer.onSquareClick(row, col);
    }
  }

  // ─── 플레이어 카드 업데이트 ─────────────────────────────────
  function updatePlayerCards() {
    if (!gameState) return;

    const { turn } = gameState;
    document.getElementById('white-player-card').classList.toggle('active', turn === 'white');
    document.getElementById('black-player-card').classList.toggle('active', turn === 'black');
  }

  // ─── 저장 / 불러오기 ─────────────────────────────────────
  const SAVE_KEY = 'chess_game_save';

  function saveGame() {
    if (!gameState) return;
    try {
      const saveData = {
        version:         '1.0',
        savedAt:         new Date().toISOString(),
        difficulty:      gameState.difficulty,
        board:           gameState.board,
        turn:            gameState.turn,
        castlingRights:  gameState.castlingRights,
        enPassantTarget: gameState.enPassantTarget,
        halfMoveClock:   gameState.halfMoveClock,
        fullMoveNumber:  gameState.fullMoveNumber,
        history:         gameState.history,
        capturedPieces:  gameState.capturedPieces,
        status:          gameState.status,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
      showToast('게임이 저장되었습니다!', 2000, 'success');
    } catch (err) {
      showToast('저장 중 오류가 발생했어요.', 2000, 'error');
      console.error('[Chess] Save error:', err);
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        showToast('저장된 게임이 없습니다.', 2000, 'info');
        return;
      }
      const data = JSON.parse(raw);

      gameState = {
        board:           data.board,
        turn:            data.turn,
        castlingRights:  data.castlingRights,
        enPassantTarget: data.enPassantTarget,
        halfMoveClock:   data.halfMoveClock,
        fullMoveNumber:  data.fullMoveNumber,
        history:         data.history || [],
        capturedPieces:  data.capturedPieces || { white: [], black: [] },
        status:          data.status || 'playing',
        difficulty:      data.difficulty || '중급',
      };

      selectedDifficulty = gameState.difficulty;
      selectedSquare = null;
      legalMovesCache = [];

      difficultyBadge.textContent =
        getDifficultyStars(gameState.difficulty) + ' ' + gameState.difficulty;

      menuScreen.style.display = 'none';
      gameScreen.style.display = 'flex';

      renderBoard();
      updatePlayerCards();
      if (window.ChessRenderer) window.ChessRenderer.onBoardReady(gameState);

      resetTimer();
      startTimer();

      const savedDate = new Date(data.savedAt).toLocaleString('ko-KR');
      showToast('저장된 게임을 불러왔습니다. (' + savedDate + ')', 3000, 'success');
    } catch (err) {
      showToast('불러오기 중 오류가 발생했어요.', 2000, 'error');
      console.error('[Chess] Load error:', err);
    }
  }

  // ─── 게임 종료 모달 ────────────────────────────────────────
  function showGameOverModal(result) {
    stopTimer();
    const messages = {
      win:       { title: '🎉 승리!',      sub: '축하합니다! AI를 이겼어요!' },
      lose:      { title: '😢 아쉬워요...', sub: '다시 도전해볼까요?' },
      stalemate: { title: '🤝 무승부',     sub: '스테일메이트!' },
      draw:      { title: '🤝 무승부',     sub: '50수 규칙으로 무승부!' },
    };
    const msg = messages[result] || messages.lose;

    document.getElementById('gameover-title').textContent = msg.title;
    document.getElementById('gameover-sub').textContent   = msg.sub;

    if (gameState) {
      document.getElementById('gameover-stats').textContent =
        '총 수: ' + gameState.history.length + '수';
    }

    document.getElementById('gameover-modal').style.display = 'flex';
  }

  // ─── 토스트 메시지 ─────────────────────────────────────────
  function showToast(message, duration, type) {
    duration = duration || 2000;
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ─── 타이머 ──────────────────────────────────────────────────

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateTimerDisplay() {
    const wEl = document.getElementById('timer-white');
    const bEl = document.getElementById('timer-black');
    if (wEl) wEl.textContent = formatTime(_whiteTime);
    if (bEl) bEl.textContent = formatTime(_blackTime);
  }

  function stopTimer() {
    if (_timerInterval !== null) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
  }

  function resetTimer() {
    stopTimer();
    _whiteTime = 0;
    _blackTime = 0;
    updateTimerDisplay();
  }

  function startTimer() {
    stopTimer();
    _timerInterval = setInterval(() => {
      if (!gameState) return;
      if (gameState.status !== 'playing' && gameState.status !== 'check') {
        stopTimer();
        return;
      }
      if (gameState.turn === 'white') {
        _whiteTime++;
      } else {
        _blackTime++;
      }
      updateTimerDisplay();
    }, 1000);
  }

  // ─── 무르기 ──────────────────────────────────────────────────

  function undoLastRound() {
    if (!gameState || gameState.history.length < 1) return;
    if (gameState.turn !== 'white') return;  // AI 생각 중엔 불가

    const undoCount     = gameState.history.length >= 2 ? 2 : 1;
    const movesToReplay = gameState.history.slice(0, -undoCount);

    let state = createInitialState();
    state.difficulty = gameState.difficulty;

    for (const h of movesToReplay) {
      const move = { from: h.from, to: h.to };
      if (h.castling)  move.castling  = h.castling;
      if (h.enPassant) move.enPassant = h.enPassant;
      if (h.promotion) move.promotion = h.promotion;
      state = applyMove(state, move);
    }

    state = updateGameStatus(state);
    gameState = state;

    if (window.ChessRenderer) window.ChessRenderer.onBoardReady(gameState);
    updatePlayerCards();
    showToast('한 수 되돌렸습니다.', 1500, 'info');
  }

  // ─── AI 턴 제어 ────────────────────────────────────────────

  function setAIThinking(thinking) {
    const aiThinkingEl = document.getElementById('ai-thinking');
    const hintBtn      = document.getElementById('btn-hint');
    const undoBtn      = document.getElementById('btn-undo');
    const resignBtn    = document.getElementById('btn-resign');

    aiThinkingEl.style.display = thinking ? 'flex' : 'none';
    hintBtn.disabled            = thinking;
    undoBtn.disabled            = thinking;
    resignBtn.disabled          = thinking;
  }

  async function triggerAIMove() {
    if (!gameState || gameState.turn !== 'black') return;
    if (gameState.status !== 'playing' && gameState.status !== 'check') return;

    setAIThinking(true);

    try {
      const move = await getBestMove(gameState, gameState.difficulty);

      if (!move) {
        setAIThinking(false);
        return;
      }

      // DOM이 이동 전 상태일 때 슬라이드 애니메이션 실행
      if (window.ChessAnimator) {
        await window.ChessAnimator.animateMove(gameState.board, move);
      }

      gameState = applyMove(gameState, move);
      gameState = updateGameStatus(gameState);

      console.log('[AI] Move applied:', move, '| FEN:', toFEN(gameState));

      updatePlayerCards();
      if (window.ChessRenderer) window.ChessRenderer.onBoardReady(gameState);

      if (gameState.status === 'checkmate') {
        setTimeout(() => showGameOverModal('lose'), 400);
      } else if (gameState.status === 'stalemate' || gameState.status === 'draw') {
        setTimeout(() => showGameOverModal(gameState.status), 400);
      }
    } catch (err) {
      console.error('[AI] Error computing move:', err);
      showToast('AI 계산 중 오류가 발생했어요.', 2000, 'error');
    } finally {
      setAIThinking(false);
    }
  }

  // ─── 힌트 ──────────────────────────────────────────────────

  async function onHintClick() {
    if (!gameState || gameState.turn !== 'white') return;
    if (gameState.status !== 'playing' && gameState.status !== 'check') return;

    const hintBtn = document.getElementById('btn-hint');
    hintBtn.disabled    = true;
    hintBtn.textContent = '생각 중...';

    try {
      const move = await getHintMove(gameState);

      if (!move) {
        showToast('추천 수를 찾을 수 없어요.', 1500, 'info');
        return;
      }

      const files   = 'abcdefgh';
      const fromStr = files[move.from[1]] + (8 - move.from[0]);
      const toStr   = files[move.to[1]]   + (8 - move.to[0]);

      showToast('💡 힌트: ' + fromStr + ' → ' + toStr, 2500, 'info');
      if (window.ChessRenderer) window.ChessRenderer.showHint(move.from, move.to);
      console.log('[Hint] Suggested move:', move);
    } catch (err) {
      console.error('[Hint] Error:', err);
      showToast('힌트를 가져오는 데 실패했어요.', 1500, 'error');
    } finally {
      hintBtn.disabled    = false;
      hintBtn.textContent = '💡 힌트';
    }
  }

  // ─── 유틸 ──────────────────────────────────────────────────
  function getDifficultyStars(difficulty) {
    const stars = { '입문': '★', '초급': '★★', '중급': '★★★', '고급': '★★★★', '마스터': '★★★★★' };
    return stars[difficulty] || '★★★';
  }

  // ─── 전역 노출 (Step 3+ 에서 renderer 등이 사용) ────────────
  window.ChessGame = {
    triggerAIMove,
    setAIThinking,
    showToast,
    getState:          () => gameState,
    setState:          (s) => { gameState = s; },
    showGameOverModal,
    updatePlayerCards,
  };

})();
