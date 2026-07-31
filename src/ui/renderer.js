/**
 * renderer.js — 기물 SVG 렌더링 + 보드 인터랙션
 * 전역: window.ChessRenderer
 * 의존: window.ChessBoard, window.ChessMoves, window.ChessEval, window.ChessGame
 */
(function () {
  'use strict';

  const { applyMove, findKing } = window.ChessBoard;
  const { getLegalMoves, isInCheck, updateGameStatus } = window.ChessMoves;
  const { getMaterialScore } = window.ChessEval;

  // ── 내부 상태 ─────────────────────────────────────────────
  let _state          = null;
  let _selectedSquare = null;
  let _legalMoves     = [];
  let _hintFrom       = null;
  let _hintTo         = null;
  let _hintTimer      = null;

  // ── SVG 기물 (CBurnett 스타일, viewBox="0 0 45 45") ────────
  const PIECE_SVG = {
    white: {
      K: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#fff" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V17s-3.5-7-10.5-4c-3.5 1.5-5 3-5 8s4.5 6.5 4.5 6.5V37z" fill="#fff"/><path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0"/></g></svg>',

      Q: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 13a4 4 0 1 1-4 4 4 4 0 0 1 4-4zm13.5-7a4 4 0 1 1-4 4 4 4 0 0 1 4-4zM36 13a4 4 0 1 1-4 4 4 4 0 0 1 4-4zM14.5 10.5a4 4 0 1 1-4 4 4 4 0 0 1 4-4zM30.5 10.5a4 4 0 1 1-4 4 4 4 0 0 1 4-4z" fill="#fff"/><path d="M9 26c8.5-8.5 15.5-4 22.5 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 9.5 14 12 26z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5 1.5-18.5 1.5-27 0z" stroke-linecap="butt"/><path d="M11 38.5a35 35 1 0 0 23 0" fill="none" stroke-linecap="butt"/><path d="M11 29a35 35 1 0 1 23 0M12.5 31.5h20M11.5 34.5a35 35 1 0 0 22 0M10.5 37.5a35 35 1 0 0 24 0" fill="none" stroke="#000"/></g></svg>',

      R: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none" stroke-linejoin="miter"/></g></svg>',

      B: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#fff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/></g><path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" stroke-linejoin="miter"/></g></svg>',

      N: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff"/><path d="M24 18c.38 5.12-5.3 5.5-6 5.5-3 0-5.5-2-5.5-5.5 0-2.5 1.5-5 6.5-5" fill="#fff"/><path d="M9.5 25.5a.5.5 0 1 0 1 0 .5.5 0 0 0-1 0z" fill="#000" stroke="#000"/><path d="M14.933 15.75c.315 1.267-.5 2.667-2.183 4.5" stroke-linecap="butt"/></g></svg>',

      P: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03C15.41 27.09 14 29.3 14 32c0 1.85.63 3.54 1.67 4.88.97 1.27 2.2 2.12 3.33 2.12h7c1.13 0 2.36-.85 3.33-2.12C30.37 35.54 31 33.85 31 32c0-2.7-1.41-4.91-3.41-5.97C29.06 24.84 30 23.03 30 21c0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round"/><path d="M14 37h17M14.5 34.5h16" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>',
    },
    black: {
      K: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter" stroke="#fff"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#000" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V17s-3.5-7-10.5-4c-3.5 1.5-5 3-5 8s4.5 6.5 4.5 6.5V37z" fill="#000"/><path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" stroke="#fff"/></g></svg>',

      Q: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 13a4 4 0 1 1-4 4 4 4 0 0 1 4-4zm13.5-7a4 4 0 1 1-4 4 4 4 0 0 1 4-4zM36 13a4 4 0 1 1-4 4 4 4 0 0 1 4-4zM14.5 10.5a4 4 0 1 1-4 4 4 4 0 0 1 4-4zM30.5 10.5a4 4 0 1 1-4 4 4 4 0 0 1 4-4z" fill="#000"/><path d="M9 26c8.5-8.5 15.5-4 22.5 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 9.5 14 12 26z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5 1.5-18.5 1.5-27 0z" stroke-linecap="butt"/><path d="M11 38.5a35 35 1 0 0 23 0" fill="none" stroke="#fff" stroke-linecap="butt"/><path d="M11 29a35 35 1 0 1 23 0M12.5 31.5h20M11.5 34.5a35 35 1 0 0 22 0M10.5 37.5a35 35 1 0 0 24 0" fill="none" stroke="#fff"/></g></svg>',

      R: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none" stroke="#fff" stroke-linejoin="miter"/></g></svg>',

      B: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#000" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/></g><path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" stroke="#fff" stroke-linejoin="miter"/></g></svg>',

      N: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#000"/><path d="M24 18c.38 5.12-5.3 5.5-6 5.5-3 0-5.5-2-5.5-5.5 0-2.5 1.5-5 6.5-5" fill="#000"/><path d="M9.5 25.5a.5.5 0 1 0 1 0 .5.5 0 0 0-1 0z" fill="#fff" stroke="#fff"/><path d="M14.933 15.75c.315 1.267-.5 2.667-2.183 4.5" stroke="#fff" stroke-linecap="butt"/></g></svg>',

      P: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03C15.41 27.09 14 29.3 14 32c0 1.85.63 3.54 1.67 4.88.97 1.27 2.2 2.12 3.33 2.12h7c1.13 0 2.36-.85 3.33-2.12C30.37 35.54 31 33.85 31 32c0-2.7-1.41-4.91-3.41-5.97C29.06 24.84 30 23.03 30 21c0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round"/><path d="M14 37h17M14.5 34.5h16" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
    },
  };

  // ── 헬퍼 ─────────────────────────────────────────────────
  function getSquareEl(row, col) {
    return document.querySelector('.square[data-row="' + row + '"][data-col="' + col + '"]');
  }

  // ── 기물 렌더링 ───────────────────────────────────────────
  function renderAllPieces(state) {
    document.querySelectorAll('.square .piece').forEach(function (el) { el.remove(); });
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var piece = state.board[r][c];
        if (piece) {
          var squareEl = getSquareEl(r, c);
          if (squareEl) placePiece(squareEl, piece);
        }
      }
    }
  }

  function placePiece(squareEl, piece) {
    var div = document.createElement('div');
    div.className = 'piece';
    div.innerHTML = PIECE_SVG[piece.color][piece.type];
    squareEl.appendChild(div);
  }

  // ── 하이라이트 ────────────────────────────────────────────
  var HIGHLIGHT_CLASSES = ['selected', 'can-move', 'can-capture', 'in-check', 'last-from', 'last-to', 'hint-from', 'hint-to'];

  function clearAllHighlights() {
    document.querySelectorAll('.square').forEach(function (sq) {
      HIGHLIGHT_CLASSES.forEach(function (cls) { sq.classList.remove(cls); });
    });
  }

  function applyHighlights(state) {
    clearAllHighlights();
    applyLastMoveHighlight(state);
    applyCheckHighlight(state);
    applyHintHighlight();
    if (_selectedSquare) applySelectionHighlights(state);
  }

  function applyLastMoveHighlight(state) {
    if (!state.history.length) return;
    var last = state.history[state.history.length - 1];
    var fromEl = getSquareEl(last.from[0], last.from[1]);
    var toEl   = getSquareEl(last.to[0],   last.to[1]);
    if (fromEl) fromEl.classList.add('last-from');
    if (toEl)   toEl.classList.add('last-to');
  }

  function applyCheckHighlight(state) {
    if (!isInCheck(state.board, state.turn)) return;
    var kingPos = findKing(state.board, state.turn);
    if (!kingPos) return;
    var kingEl = getSquareEl(kingPos[0], kingPos[1]);
    if (kingEl) kingEl.classList.add('in-check');
  }

  function applySelectionHighlights(state) {
    var sr = _selectedSquare[0], sc = _selectedSquare[1];
    var selEl = getSquareEl(sr, sc);
    if (selEl) selEl.classList.add('selected');

    _legalMoves.forEach(function (move) {
      var tr = move.to[0], tc = move.to[1];
      var targetEl = getSquareEl(tr, tc);
      if (!targetEl) return;
      var isCapture = (state.board[tr][tc] !== null) || move.enPassant;
      targetEl.classList.add(isCapture ? 'can-capture' : 'can-move');
    });
  }

  function applyHintHighlight() {
    if (_hintFrom) {
      var el = getSquareEl(_hintFrom[0], _hintFrom[1]);
      if (el) el.classList.add('hint-from');
    }
    if (_hintTo) {
      var el2 = getSquareEl(_hintTo[0], _hintTo[1]);
      if (el2) el2.classList.add('hint-to');
    }
  }

  // ── 클릭 처리 ─────────────────────────────────────────────
  function onSquareClick(row, col) {
    if (!_state) return;
    if (_state.turn !== 'white') return;
    if (_state.status !== 'playing' && _state.status !== 'check') return;

    // 선택된 기물이 있을 때: 목적지인지 확인
    if (_selectedSquare) {
      var candidates = _legalMoves.filter(function (m) {
        return m.to[0] === row && m.to[1] === col;
      });
      if (candidates.length > 0) {
        executeMove(candidates);
        return;
      }
    }

    // 내 기물 클릭: 선택 (이미 선택된 기물이면 재선택)
    var piece = _state.board[row][col];
    if (piece && piece.color === 'white') {
      selectPiece(row, col);
    } else {
      deselect();
    }
  }

  function selectPiece(row, col) {
    _selectedSquare = [row, col];
    _legalMoves = getLegalMoves(_state, row, col);
    applyHighlights(_state);
  }

  function deselect() {
    _selectedSquare = null;
    _legalMoves = [];
    applyHighlights(_state);
  }

  // ── 이동 실행 ─────────────────────────────────────────────
  async function executeMove(candidateMoves) {
    // 힌트 초기화
    clearTimeout(_hintTimer);
    _hintFrom = null;
    _hintTo = null;

    _selectedSquare = null;
    _legalMoves = [];

    var move;
    var isPromotion = candidateMoves.some(function(m) { return m.promotion !== undefined; });

    if (isPromotion) {
      try {
        var pieceType = await askPromotion();
        move = candidateMoves.find(function (m) { return m.promotion === pieceType; });
      } catch (e) {
        // 사용자가 프로모션 취소 (Escape)
        applyHighlights(_state);
        return;
      }
    } else {
      move = candidateMoves[0];
    }

    if (!move) return;

    // ── ① 캡처 애니메이션 (피캡처 기물 먼저 사라지게) ────────
    var capturedPieceEl = null;
    if (move.enPassant) {
      // 앙파상: 잡히는 폰은 move.to 칸이 아닌 다른 칸
      var epCaptureRow = (_state.board[move.from[0]][move.from[1]].color === 'white')
        ? move.to[0] + 1 : move.to[0] - 1;
      var epSq = getSquareEl(epCaptureRow, move.to[1]);
      capturedPieceEl = epSq ? epSq.querySelector('.piece') : null;
    } else if (_state.board[move.to[0]][move.to[1]]) {
      var capSq = getSquareEl(move.to[0], move.to[1]);
      capturedPieceEl = capSq ? capSq.querySelector('.piece') : null;
    }
    if (capturedPieceEl) {
      capturedPieceEl.classList.add('capturing');
      await new Promise(function (r) { setTimeout(r, 150); });
    }

    // ── ② 기물 슬라이드 애니메이션 ───────────────────────────
    if (window.ChessAnimator) {
      await window.ChessAnimator.animateMove(_state.board, move);
    }

    // ── ③ 상태 적용 + 전체 재렌더 ───────────────────────────
    var newState = applyMove(_state, move);
    var updatedState = updateGameStatus(newState);

    _state = updatedState;
    window.ChessGame.setState(updatedState);

    renderAllPieces(_state);
    applyHighlights(_state);
    updateCapturedPieces(_state);
    updateMaterialAdvantage(_state);
    updateMoveHistory(_state);
    window.ChessGame.updatePlayerCards();

    // ── ④ 게임 종료 처리 ─────────────────────────────────────
    if (updatedState.status === 'checkmate') {
      // 백이 흑을 체크메이트 = 플레이어 승리 → 폭죽
      if (window.ChessEffects) window.ChessEffects.launchConfetti();
      setTimeout(function () { window.ChessGame.showGameOverModal('win'); }, 400);
    } else if (updatedState.status === 'stalemate' || updatedState.status === 'draw') {
      setTimeout(function () { window.ChessGame.showGameOverModal(updatedState.status); }, 400);
    } else if (updatedState.turn === 'black') {
      window.ChessGame.triggerAIMove();
    }
  }

  // ── 프로모션 모달 ─────────────────────────────────────────
  function askPromotion() {
    return new Promise(function (resolve, reject) {
      // 모달 기물 아이콘 업데이트 (항상 백 기물)
      document.querySelectorAll('.promo-symbol').forEach(function (span) {
        var type = span.dataset.type;
        if (type && PIECE_SVG.white[type]) {
          span.innerHTML = PIECE_SVG.white[type];
        }
      });

      var modal = document.getElementById('promotion-modal');
      modal.style.display = 'flex';

      function onBtnClick(e) {
        var btn = e.target.closest('.promotion-btn');
        if (!btn) return;
        cleanup();
        resolve(btn.dataset.piece);
      }

      function onEscape(e) {
        if (e.key === 'Escape') {
          cleanup();
          reject(new Error('cancelled'));
        }
      }

      var btns = document.querySelectorAll('.promotion-btn');
      btns.forEach(function (btn) { btn.addEventListener('click', onBtnClick); });
      document.addEventListener('keydown', onEscape);

      function cleanup() {
        modal.style.display = 'none';
        btns.forEach(function (btn) { btn.removeEventListener('click', onBtnClick); });
        document.removeEventListener('keydown', onEscape);
      }
    });
  }

  // ── 사이드패널: 잡은 기물 ────────────────────────────────
  var PIECE_ORDER = ['Q', 'R', 'B', 'N', 'P'];

  function updateCapturedPieces(state) {
    function renderCaptured(pieces, containerId, byColor) {
      var container = document.getElementById(containerId);
      if (!container) return;
      var sorted = pieces.slice().sort(function (a, b) {
        return PIECE_ORDER.indexOf(a.type) - PIECE_ORDER.indexOf(b.type);
      });
      container.innerHTML = sorted.map(function (p) {
        return '<span style="width:22px;height:22px;display:inline-flex;vertical-align:middle;opacity:0.9">' +
          PIECE_SVG[p.color][p.type] +
          '</span>';
      }).join('');
    }

    // 백이 잡은 흑 기물
    renderCaptured(state.capturedPieces.white, 'captured-by-white', 'white');
    // 흑이 잡은 백 기물
    renderCaptured(state.capturedPieces.black, 'captured-by-black', 'black');
  }

  // ── 사이드패널: 기물 점수 차이 ───────────────────────────
  function updateMaterialAdvantage(state) {
    var wScore = getMaterialScore(state.board, 'white');
    var bScore = getMaterialScore(state.board, 'black');
    var diff = wScore - bScore;  // 양수 = 백 우세

    var wAdvEl = document.getElementById('material-adv-white');
    var bAdvEl = document.getElementById('material-adv-black');
    var diffPawns = Math.round(Math.abs(diff) / 100);

    if (diffPawns === 0) {
      if (wAdvEl) wAdvEl.textContent = '';
      if (bAdvEl) bAdvEl.textContent = '';
    } else if (diff > 0) {
      if (wAdvEl) wAdvEl.textContent = '+' + diffPawns;
      if (bAdvEl) bAdvEl.textContent = '';
    } else {
      if (wAdvEl) wAdvEl.textContent = '';
      if (bAdvEl) bAdvEl.textContent = '+' + diffPawns;
    }
  }

  // ── 사이드패널: 기보 ─────────────────────────────────────
  function updateMoveHistory(state) {
    var historyEl = document.getElementById('move-history');
    if (!historyEl) return;

    var history = state.history;
    var rows = [];
    var lastIdx = history.length - 1;

    for (var i = 0; i < history.length; i += 2) {
      var moveNum    = Math.floor(i / 2) + 1;
      var whiteEntry = history[i];
      var blackEntry = history[i + 1];
      var isLastWhite = (i === lastIdx);
      var isLastBlack = (i + 1 === lastIdx);

      var whiteStr = historyEntryToNotation(whiteEntry);
      var blackStr = blackEntry ? historyEntryToNotation(blackEntry) : '';

      rows.push(
        '<div class="move-row" style="display:flex;gap:4px;padding:2px 4px;font-family:var(--font-mono);font-size:12px">' +
          '<span style="color:var(--text-muted);min-width:24px">' + moveNum + '.</span>' +
          '<span style="flex:1;' + (isLastWhite ? 'color:var(--gold-light);font-weight:600' : 'color:var(--text-primary)') + '">' + whiteStr + '</span>' +
          '<span style="flex:1;' + (isLastBlack ? 'color:var(--gold-light);font-weight:600' : 'color:var(--text-primary)') + '">' + blackStr + '</span>' +
        '</div>'
      );
    }

    var savedScrollY = window.scrollY;
    historyEl.innerHTML = rows.join('');
    window.scrollTo(0, savedScrollY);
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function historyEntryToNotation(entry) {
    if (!entry) return '';
    if (entry.castling === 'kingside')  return 'O-O';
    if (entry.castling === 'queenside') return 'O-O-O';

    var FILES = 'abcdefgh';
    var pieceStr = entry.piece.type === 'P' ? '' : entry.piece.type;
    var capture  = (entry.captured || entry.enPassant) ? 'x' : '';
    var fromFile = (entry.piece.type === 'P' && capture) ? FILES[entry.from[1]] : '';
    var toSquare = FILES[entry.to[1]] + (8 - entry.to[0]);
    var promoStr = entry.promotion ? '=' + entry.promotion : '';

    return pieceStr + fromFile + capture + toSquare + promoStr;
  }

  // ── 힌트 하이라이트 ───────────────────────────────────────
  function showHint(fromSq, toSq) {
    clearTimeout(_hintTimer);
    _hintFrom = fromSq;
    _hintTo   = toSq;
    if (_state) applyHighlights(_state);
    _hintTimer = setTimeout(function () {
      _hintFrom = null;
      _hintTo   = null;
      if (_state) applyHighlights(_state);
    }, 3000);
  }

  // ── 초기화 ────────────────────────────────────────────────
  function onBoardReady(state) {
    _state = state;
    _selectedSquare = null;
    _legalMoves = [];
    // 힌트는 새 게임/불러오기 시 초기화
    clearTimeout(_hintTimer);
    _hintFrom = null;
    _hintTo   = null;

    renderAllPieces(state);
    applyHighlights(state);
    updateCapturedPieces(state);
    updateMaterialAdvantage(state);
    updateMoveHistory(state);
  }

  // ── 전역 노출 ─────────────────────────────────────────────
  window.ChessRenderer = {
    onBoardReady,
    onSquareClick,
    showHint,
  };

})();
