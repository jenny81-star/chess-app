/**
 * game.js — 게임 진입점
 * 메뉴 화면 전환, 게임 상태 초기화, AI 턴 제어
 */
(function () {
  'use strict';

  const { createInitialState, cloneState, applyMove, toFEN } = window.ChessBoard;
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
  let startState = null;       // 커스텀 시작 포지션(기물 배치 모드) — null이면 표준 초기 배치

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

  // ─── 게임 모드 선택 ('ai' | '2p') ─────────────────────────
  let selectedMode = 'ai';

  document.getElementById('difficulty-list').addEventListener('click', (e) => {
    const card = e.target.closest('.difficulty-card');
    if (!card) return;

    document.querySelectorAll('.difficulty-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedDifficulty = card.dataset.difficulty;
  });

  document.getElementById('mode-list').addEventListener('click', (e) => {
    const card = e.target.closest('.mode-card');
    if (!card) return;

    selectedMode = card.dataset.mode;
    updateModeMenuUI();
  });

  // 메뉴의 모드 카드 선택 상태 + 난이도 리스트 표시 여부 동기화
  function updateModeMenuUI() {
    document.querySelectorAll('.mode-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.mode === selectedMode);
    });
    // 2인 대전·기물 배치는 난이도가 필요 없으므로 리스트를 숨김
    document.getElementById('difficulty-list').style.display =
      (selectedMode === '2p' || selectedMode === 'editor') ? 'none' : 'flex';
  }

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
    // 모드에 맞는 항복 확인 문구
    const subEl = document.getElementById('resign-modal-sub');
    if (gameState && gameState.mode === '2p') {
      const winnerName = gameState.turn === 'white' ? '흑' : '백';
      subEl.textContent = '현재 게임을 포기하고 ' + winnerName + '의 승리로 처리됩니다.';
    } else {
      subEl.textContent = '현재 게임을 포기하고 AI의 승리로 처리됩니다.';
    }
    document.getElementById('resign-modal').style.display = 'flex';
  });

  document.getElementById('btn-resign-confirm').addEventListener('click', () => {
    document.getElementById('resign-modal').style.display = 'none';
    if (gameState && gameState.mode === '2p') {
      // 현재 턴인 플레이어가 항복 → 상대 색 승리
      showGameOverModal(gameState.turn === 'white' ? 'black-win' : 'white-win');
    } else {
      showGameOverModal('lose');
    }
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
  function startNewGame(difficulty, mode) {
    mode = mode || selectedMode;

    // 리뷰 모드 중이었다면 해제 (곧바로 새 화면이 그려지므로 silent)
    if (window.ChessReview) window.ChessReview.exit({ silent: true });

    // 기물 배치 모드: 게임을 바로 시작하지 않고 에디터 화면으로 진입
    if (mode === 'editor') {
      if (window.ChessEditor) window.ChessEditor.open();
      return;
    }

    startState = null;
    gameState = createInitialState();
    gameState.difficulty = difficulty;
    gameState.mode = mode;

    // 이전 게임의 품질 분석 예약 취소
    if (window.ChessQuality) window.ChessQuality.reset();

    selectedSquare = null;
    legalMovesCache = [];

    updateGameModeUI();

    menuScreen.style.display = 'none';
    gameScreen.style.display = 'flex';

    renderBoard();
    updatePlayerCards();
    if (window.ChessRenderer) window.ChessRenderer.onBoardReady(gameState);

    resetTimer();
    startTimer();

    console.log('[Chess] New game started:', mode === '2p' ? '2인 대전' : difficulty);
    console.log('[Chess] Initial FEN:', toFEN(gameState));
  }

  // 게임 화면의 뱃지 + 플레이어 카드 라벨을 현재 모드에 맞게 갱신
  function updateGameModeUI() {
    if (!gameState) return;
    const is2P = gameState.mode === '2p';

    difficultyBadge.textContent = is2P
      ? '👥 2인 대전'
      : getDifficultyStars(gameState.difficulty) + ' ' + gameState.difficulty;

    document.querySelector('#black-player-card .player-name').textContent =
      is2P ? '흑 플레이어' : 'AI (흑)';
    document.querySelector('#white-player-card .player-name').textContent =
      is2P ? '백 플레이어' : '나 (백)';
  }

  function showMenu() {
    if (window.ChessReview) window.ChessReview.exit({ silent: true });
    gameScreen.style.display = 'none';
    const editorScreen = document.getElementById('editor-screen');
    if (editorScreen) editorScreen.style.display = 'none';
    menuScreen.style.display = 'flex';
  }

  // ─── 커스텀 포지션으로 게임 시작 (기물 배치 모드 → 대국) ────
  function startFromPosition(state) {
    if (window.ChessReview) window.ChessReview.exit({ silent: true });
    gameState = state;
    startState = cloneState(state);   // 무르기/리플레이의 기준점
    gameState = updateGameStatus(gameState);

    // 이전 게임의 품질 분석 예약 취소
    if (window.ChessQuality) window.ChessQuality.reset();

    selectedSquare = null;
    legalMovesCache = [];

    updateGameModeUI();

    menuScreen.style.display = 'none';
    const editorScreen = document.getElementById('editor-screen');
    if (editorScreen) editorScreen.style.display = 'none';
    gameScreen.style.display = 'flex';

    renderBoard();
    updatePlayerCards();
    if (window.ChessRenderer) window.ChessRenderer.onBoardReady(gameState);

    resetTimer();
    startTimer();

    console.log('[Chess] Custom position game started:', gameState.mode, '| FEN:', toFEN(gameState));

    // 시작 즉시 승패가 나는 포지션(책의 메이트 문제 등)도 허용하고 결과를 바로 표시
    if (gameState.status === 'checkmate') {
      // 현재 턴 쪽이 메이트당한 상태
      let result;
      if (gameState.mode === '2p') {
        result = gameState.turn === 'white' ? 'black-win' : 'white-win';
      } else {
        result = gameState.turn === 'white' ? 'lose' : 'win';
      }
      if (result !== 'lose' && window.ChessEffects) window.ChessEffects.launchConfetti();
      setTimeout(() => showGameOverModal(result), 400);
    } else if (gameState.status === 'stalemate' || gameState.status === 'draw') {
      setTimeout(() => showGameOverModal(gameState.status), 400);
    } else if (gameState.mode !== '2p' && gameState.turn === 'black') {
      // AI 대전에서 흑 차례로 시작하면 즉시 AI가 둠
      triggerAIMove();
    }
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
  }

  // 보드 클릭 리스너는 renderBoard()마다 중복 등록되지 않도록 한 번만 등록
  boardEl.addEventListener('click', onBoardClick);

  function onBoardClick(e) {
    // 리뷰 모드에서는 보드 입력 완전 차단
    if (window.ChessReview && window.ChessReview.isActive()) return;

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
        mode:            gameState.mode || 'ai',
        board:           gameState.board,
        turn:            gameState.turn,
        castlingRights:  gameState.castlingRights,
        enPassantTarget: gameState.enPassantTarget,
        halfMoveClock:   gameState.halfMoveClock,
        fullMoveNumber:  gameState.fullMoveNumber,
        history:         gameState.history,
        capturedPieces:  gameState.capturedPieces,
        status:          gameState.status,
        startPosition:   startState,   // 커스텀 시작 포지션 (표준 시작이면 null)
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

      // 리뷰 모드 중 불러오기 → 리뷰 해제 후 정상 로드
      if (window.ChessReview) window.ChessReview.exit({ silent: true });

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
        mode:            data.mode || 'ai',  // 구버전 저장 데이터는 AI 대전으로 간주
      };

      // 커스텀 시작 포지션 복원 (구버전 저장에는 없음 → 표준 시작으로 간주)
      startState = data.startPosition || null;

      selectedDifficulty = gameState.difficulty;
      selectedMode = gameState.mode;
      document.querySelectorAll('.difficulty-card').forEach(c =>
        c.classList.toggle('selected', c.dataset.difficulty === selectedDifficulty));
      updateModeMenuUI();
      selectedSquare = null;
      legalMovesCache = [];

      updateGameModeUI();

      menuScreen.style.display = 'none';
      gameScreen.style.display = 'flex';

      renderBoard();
      updatePlayerCards();
      if (window.ChessRenderer) window.ChessRenderer.onBoardReady(gameState);

      resetTimer();
      startTimer();

      // quality 없는 옛 저장 데이터도 한 수씩 백그라운드로 채운다
      if (window.ChessQuality) window.ChessQuality.sync();

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
      win:         { title: '🎉 승리!',      sub: '축하합니다! AI를 이겼어요!' },
      lose:        { title: '😢 아쉬워요...', sub: '다시 도전해볼까요?' },
      stalemate:   { title: '🤝 무승부',     sub: '스테일메이트!' },
      draw:        { title: '🤝 무승부',     sub: '50수 규칙으로 무승부!' },
      // 2인 대전 전용 결과
      'white-win': { title: '🎉 백 승리!',   sub: '백 플레이어가 이겼어요!' },
      'black-win': { title: '🎉 흑 승리!',   sub: '흑 플레이어가 이겼어요!' },
    };
    const msg = messages[result] || messages.lose;

    // 2인 대전에서는 "난이도 변경" 대신 "메뉴로" 표시
    document.getElementById('btn-change-difficulty').textContent =
      (gameState && gameState.mode === '2p') ? '메뉴로' : '난이도 변경';

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
    if (window.ChessReview && window.ChessReview.isActive()) return;
    if (!gameState || gameState.history.length < 1) return;

    const is2P = gameState.mode === '2p';
    if (!is2P && gameState.turn !== 'white') return;  // AI 생각 중엔 불가 (AI 대전만)

    // AI 대전: 내 수 + AI 수 = 2수 / 2인 대전: 직전 1수만
    const undoCount     = is2P ? 1 : (gameState.history.length >= 2 ? 2 : 1);
    const movesToReplay = gameState.history.slice(0, -undoCount);

    // 커스텀 포지션(기물 배치 모드)에서 시작한 게임은 그 포지션부터 리플레이
    let state = startState ? cloneState(startState) : createInitialState();
    state.difficulty = gameState.difficulty;
    state.mode       = gameState.mode;

    for (const h of movesToReplay) {
      const move = { from: h.from, to: h.to };
      if (h.castling)  move.castling  = h.castling;
      if (h.enPassant) move.enPassant = h.enPassant;
      if (h.promotion) move.promotion = h.promotion;
      state = applyMove(state, move);
    }

    // 리플레이로 새로 만들어진 엔트리에 기존 품질 분석 결과를 보존 (재분석 방지)
    state.history.forEach((h, i) => {
      if (movesToReplay[i] && movesToReplay[i].quality !== undefined) {
        h.quality = movesToReplay[i].quality;
      }
    });

    state = updateGameStatus(state);
    gameState = state;

    if (window.ChessRenderer) window.ChessRenderer.onBoardReady(gameState);
    updatePlayerCards();
    if (window.ChessQuality) window.ChessQuality.sync();  // 미분석 수가 남았으면 이어서
    showToast('한 수 되돌렸습니다.', 1500, 'info');
  }

  // ─── AI 턴 제어 ────────────────────────────────────────────

  function setAIThinking(thinking) {
    // 2인 대전에서는 AI 생각 중 표시가 절대 나타나지 않음
    if (gameState && gameState.mode === '2p') thinking = false;

    // 품질 분석 큐 일시정지/재개 — 동기 엔진이라 AI 탐색과 겹치면 체감 지연 발생
    if (window.ChessQuality) window.ChessQuality.setBusy(thinking);

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
    if (window.ChessReview && window.ChessReview.isActive()) return;  // 리뷰 모드 방어
    if (!gameState || gameState.mode === '2p') return;  // 2인 대전에서는 AI가 두지 않음
    if (gameState.turn !== 'black') return;
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
    if (window.ChessReview && window.ChessReview.isActive()) return;
    if (!gameState) return;
    // AI 대전은 백 턴에만, 2인 대전은 현재 턴 색 기준으로 힌트 제공
    if (gameState.mode !== '2p' && gameState.turn !== 'white') return;
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
    showMenu,
    startFromPosition,
    getState:          () => gameState,
    setState:          (s) => { gameState = s; },
    getStartState:     () => startState,
    getMode:           () => (gameState && gameState.mode) || 'ai',
    showGameOverModal,
    updatePlayerCards,
  };

})();
