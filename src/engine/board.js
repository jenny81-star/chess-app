/**
 * board.js — 보드 상태, 기물 배치, 이동 적용
 * 전역: window.ChessBoard
 *
 * 좌표계:
 *   board[row][col]  row 0 = 8랭크(흑 기물), row 7 = 1랭크(백 기물)
 *   col 0 = a파일, col 7 = h파일
 */
(function () {
  'use strict';

  // ─── 상수 ────────────────────────────────────────────────
  const PIECE_VALUES = { K: 20000, Q: 900, R: 500, B: 330, N: 320, P: 100 };
  const BACK_ROW     = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

  // ─── 유틸 ────────────────────────────────────────────────

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function findKing(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'K' && p.color === color) return [r, c];
      }
    }
    return null;
  }

  // ─── 게임 상태 ───────────────────────────────────────────

  function createInitialState() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let col = 0; col < 8; col++) {
      board[0][col] = { type: BACK_ROW[col], color: 'black' };
      board[1][col] = { type: 'P',           color: 'black' };
      board[6][col] = { type: 'P',           color: 'white' };
      board[7][col] = { type: BACK_ROW[col], color: 'white' };
    }
    const state = {
      board,
      turn: 'white',
      castlingRights: {
        whiteKingSide:  true,
        whiteQueenSide: true,
        blackKingSide:  true,
        blackQueenSide: true,
      },
      enPassantTarget: null,
      halfMoveClock:   0,
      fullMoveNumber:  1,
      history:         [],
      capturedPieces:  { white: [], black: [] },
      status:          'playing',
      difficulty:      '중급',
      mode:            'ai',      // 'ai' | '2p'
    };
    state.positionKeys = [positionKey(state)];
    return state;
  }

  function cloneState(state) {
    return {
      board:           state.board.map(row => row.map(p => p ? { ...p } : null)),
      turn:            state.turn,
      castlingRights:  { ...state.castlingRights },
      enPassantTarget: state.enPassantTarget ? [...state.enPassantTarget] : null,
      halfMoveClock:   state.halfMoveClock,
      fullMoveNumber:  state.fullMoveNumber,
      history:         state.history.map(h => ({ ...h })),
      capturedPieces: {
        white: state.capturedPieces.white.map(p => ({ ...p })),
        black: state.capturedPieces.black.map(p => ({ ...p })),
      },
      status:     state.status,
      drawReason: state.drawReason || null,
      difficulty: state.difficulty,
      level:      state.level,
      mode:       state.mode || 'ai',
      // AI 탐색용 상태는 positionKeys를 null로 비워 복사 비용을 아낀다
      positionKeys: state.positionKeys ? state.positionKeys.slice() : null,
    };
  }

  // ─── 커스텀 포지션 → 게임 상태 (기물 배치 모드) ──────────
  // castlingRights는 킹/룩이 실제 홈 칸에 있을 때만 true로 유도한다.
  function createStateFromBoard(board, options) {
    options = options || {};
    const b = board.map(row => row.map(p => (p ? { ...p } : null)));
    const has = (r, c, type, color) => {
      const p = b[r][c];
      return !!p && p.type === type && p.color === color;
    };
    const wKingHome = has(7, 4, 'K', 'white');   // e1
    const bKingHome = has(0, 4, 'K', 'black');   // e8
    const state = {
      board: b,
      turn: options.turn === 'black' ? 'black' : 'white',
      castlingRights: {
        whiteKingSide:  wKingHome && has(7, 7, 'R', 'white'),  // h1
        whiteQueenSide: wKingHome && has(7, 0, 'R', 'white'),  // a1
        blackKingSide:  bKingHome && has(0, 7, 'R', 'black'),  // h8
        blackQueenSide: bKingHome && has(0, 0, 'R', 'black'),  // a8
      },
      enPassantTarget: null,
      halfMoveClock:   0,
      fullMoveNumber:  1,
      history:         [],
      capturedPieces:  { white: [], black: [] },
      status:          'playing',
      difficulty:      options.difficulty || '중급',
      level:           options.level,
      mode:            options.mode || 'ai',
    };
    state.positionKeys = [positionKey(state)];
    return state;
  }

  // ─── 이동 적용 ───────────────────────────────────────────

  function applyMove(state, move) {
    const next = cloneState(state);
    const { board } = next;
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    const piece = board[fr][fc];

    let captured = board[tr][tc];

    if (move.enPassant) {
      const capturedRow = piece.color === 'white' ? tr + 1 : tr - 1;
      captured = board[capturedRow][tc];
      board[capturedRow][tc] = null;
    }

    if (captured) {
      next.capturedPieces[piece.color].push({ ...captured });
    }

    board[tr][tc] = move.promotion
      ? { type: move.promotion, color: piece.color }
      : { ...piece };
    board[fr][fc] = null;

    if (move.castling === 'kingside') {
      board[fr][tc - 1] = { ...board[fr][7] };
      board[fr][7] = null;
    } else if (move.castling === 'queenside') {
      board[fr][tc + 1] = { ...board[fr][0] };
      board[fr][0] = null;
    }

    _updateCastlingRights(next.castlingRights, piece, fr, fc, captured, tr, tc);

    next.enPassantTarget =
      piece.type === 'P' && Math.abs(tr - fr) === 2
        ? [(fr + tr) / 2, fc]
        : null;

    next.halfMoveClock =
      piece.type === 'P' || captured ? 0 : next.halfMoveClock + 1;

    if (piece.color === 'black') next.fullMoveNumber++;

    next.history.push({
      from:      [...move.from],
      to:        [...move.to],
      piece:     { ...piece },
      captured:  captured ? { ...captured } : null,
      castling:  move.castling  || null,
      enPassant: move.enPassant || false,
      promotion: move.promotion || null,
    });

    next.turn = piece.color === 'white' ? 'black' : 'white';
    if (next.positionKeys) next.positionKeys.push(positionKey(next));
    return next;
  }

  function _updateCastlingRights(rights, piece, fr, fc, captured, tr, tc) {
    if (piece.type === 'K') {
      if (piece.color === 'white') {
        rights.whiteKingSide  = false;
        rights.whiteQueenSide = false;
      } else {
        rights.blackKingSide  = false;
        rights.blackQueenSide = false;
      }
    }
    if (piece.type === 'R') {
      if (piece.color === 'white') {
        if (fr === 7 && fc === 7) rights.whiteKingSide  = false;
        if (fr === 7 && fc === 0) rights.whiteQueenSide = false;
      } else {
        if (fr === 0 && fc === 7) rights.blackKingSide  = false;
        if (fr === 0 && fc === 0) rights.blackQueenSide = false;
      }
    }
    if (captured && captured.type === 'R') {
      if (captured.color === 'white') {
        if (tr === 7 && tc === 7) rights.whiteKingSide  = false;
        if (tr === 7 && tc === 0) rights.whiteQueenSide = false;
      } else {
        if (tr === 0 && tc === 7) rights.blackKingSide  = false;
        if (tr === 0 && tc === 0) rights.blackQueenSide = false;
      }
    }
  }

  // ─── 포지션 키 (3회 동형 판정용) ──────────────────────────
  // 기물 배치 + 차례 + 캐슬링 권리 + 앙파상 가능 칸.
  // 앙파상 칸은 실제로 잡을 수 있는 폰이 옆에 있을 때만 포함한다
  // (FIDE 기준: 앙파상이 불가능하면 같은 포지션으로 본다).
  function positionKey(state) {
    const { board, turn, castlingRights: cr, enPassantTarget: ep } = state;
    let key = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        key += p ? (p.color === 'white' ? p.type : p.type.toLowerCase()) : '.';
      }
    }
    key += turn === 'white' ? 'w' : 'b';
    key += (cr.whiteKingSide ? 'K' : '') + (cr.whiteQueenSide ? 'Q' : '') +
           (cr.blackKingSide ? 'k' : '') + (cr.blackQueenSide ? 'q' : '');
    if (ep) {
      const pawnRow = turn === 'white' ? ep[0] + 1 : ep[0] - 1;
      const canCapture = [-1, 1].some(dc => {
        const c = ep[1] + dc;
        const p = inBounds(pawnRow, c) && board[pawnRow][c];
        return p && p.type === 'P' && p.color === turn;
      });
      if (canCapture) key += 'e' + ep[0] + ep[1];
    }
    return key;
  }

  // ─── FEN ─────────────────────────────────────────────────

  function toFEN(state) {
    const { board, turn, castlingRights: cr, enPassantTarget: ep,
            halfMoveClock: hm, fullMoveNumber: fm } = state;
    const FILES = 'abcdefgh';
    let rows = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) {
          empty++;
        } else {
          if (empty) { rows += empty; empty = 0; }
          rows += p.color === 'white' ? p.type : p.type.toLowerCase();
        }
      }
      if (empty) rows += empty;
      if (r < 7) rows += '/';
    }
    let castle = '';
    if (cr.whiteKingSide)  castle += 'K';
    if (cr.whiteQueenSide) castle += 'Q';
    if (cr.blackKingSide)  castle += 'k';
    if (cr.blackQueenSide) castle += 'q';
    if (!castle) castle = '-';
    const epStr = ep ? FILES[ep[1]] + (8 - ep[0]) : '-';
    return `${rows} ${turn === 'white' ? 'w' : 'b'} ${castle} ${epStr} ${hm} ${fm}`;
  }

  // ─── 전역 노출 ───────────────────────────────────────────
  window.ChessBoard = {
    PIECE_VALUES,
    inBounds,
    findKing,
    createInitialState,
    createStateFromBoard,
    cloneState,
    applyMove,
    positionKey,
    toFEN,
  };
})();
