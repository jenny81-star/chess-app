/**
 * moves.js — 이동 규칙 생성 및 검증
 * 전역: window.ChessMoves
 * 의존: window.ChessBoard
 */
(function () {
  'use strict';

  const { inBounds, findKing, applyMove } = window.ChessBoard;

  // ─── 공격 감지 ───────────────────────────────────────────

  function isSquareAttacked(board, row, col, byColor) {
    // 폰 공격
    const pawnAttackRow = byColor === 'white' ? row + 1 : row - 1;
    for (const dc of [-1, 1]) {
      const c = col + dc;
      if (inBounds(pawnAttackRow, c)) {
        const p = board[pawnAttackRow][c];
        if (p && p.type === 'P' && p.color === byColor) return true;
      }
    }

    // 나이트 공격
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const r = row + dr, c = col + dc;
      if (inBounds(r, c)) {
        const p = board[r][c];
        if (p && p.type === 'N' && p.color === byColor) return true;
      }
    }

    // 비숍 / 퀸 대각선
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let r = row + dr, c = col + dc;
      while (inBounds(r, c)) {
        const p = board[r][c];
        if (p) {
          if (p.color === byColor && (p.type === 'B' || p.type === 'Q')) return true;
          break;
        }
        r += dr; c += dc;
      }
    }

    // 룩 / 퀸 직선
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let r = row + dr, c = col + dc;
      while (inBounds(r, c)) {
        const p = board[r][c];
        if (p) {
          if (p.color === byColor && (p.type === 'R' || p.type === 'Q')) return true;
          break;
        }
        r += dr; c += dc;
      }
    }

    // 킹 공격
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const r = row + dr, c = col + dc;
      if (inBounds(r, c)) {
        const p = board[r][c];
        if (p && p.type === 'K' && p.color === byColor) return true;
      }
    }

    return false;
  }

  function isInCheck(board, color) {
    const kingPos = findKing(board, color);
    if (!kingPos) return false;
    const enemy = color === 'white' ? 'black' : 'white';
    return isSquareAttacked(board, kingPos[0], kingPos[1], enemy);
  }

  // ─── 의사 합법 이동 ──────────────────────────────────────

  function getPseudoLegalMoves(state, row, col) {
    const { board, castlingRights, enPassantTarget } = state;
    const piece = board[row][col];
    if (!piece) return [];

    const { type, color } = piece;
    const enemy = color === 'white' ? 'black' : 'white';
    const moves = [];

    const addMove = (tr, tc, extras) => {
      moves.push(Object.assign({ from: [row, col], to: [tr, tc] }, extras));
    };

    const addSliding = (dirs) => {
      for (const [dr, dc] of dirs) {
        let r = row + dr, c = col + dc;
        while (inBounds(r, c)) {
          const target = board[r][c];
          if (!target) {
            addMove(r, c);
          } else {
            if (target.color === enemy) addMove(r, c);
            break;
          }
          r += dr; c += dc;
        }
      }
    };

    switch (type) {
      case 'P': {
        const dir      = color === 'white' ? -1 : 1;
        const startRow = color === 'white' ? 6 : 1;
        const promoRow = color === 'white' ? 0 : 7;

        const r1 = row + dir;
        if (inBounds(r1, col) && !board[r1][col]) {
          if (r1 === promoRow) {
            for (const promo of ['Q', 'R', 'B', 'N']) addMove(r1, col, { promotion: promo });
          } else {
            addMove(r1, col, null);
            if (row === startRow) {
              const r2 = row + 2 * dir;
              if (!board[r2][col]) addMove(r2, col, null);
            }
          }
        }

        for (const dc of [-1, 1]) {
          const rc = row + dir, cc = col + dc;
          if (!inBounds(rc, cc)) continue;
          if (board[rc][cc] && board[rc][cc].color === enemy) {
            if (rc === promoRow) {
              for (const promo of ['Q', 'R', 'B', 'N']) addMove(rc, cc, { promotion: promo });
            } else {
              addMove(rc, cc, null);
            }
          }
          if (enPassantTarget && rc === enPassantTarget[0] && cc === enPassantTarget[1]) {
            addMove(rc, cc, { enPassant: true });
          }
        }
        break;
      }

      case 'N': {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          const r = row + dr, c = col + dc;
          if (inBounds(r, c) && (!board[r][c] || board[r][c].color !== color)) {
            addMove(r, c, null);
          }
        }
        break;
      }

      case 'B': addSliding([[-1,-1],[-1,1],[1,-1],[1,1]]); break;
      case 'R': addSliding([[-1,0],[1,0],[0,-1],[0,1]]); break;
      case 'Q': addSliding([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]); break;

      case 'K': {
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          const r = row + dr, c = col + dc;
          if (inBounds(r, c) && (!board[r][c] || board[r][c].color !== color)) {
            addMove(r, c, null);
          }
        }

        if (!isInCheck(board, color)) {
          const kingRow = color === 'white' ? 7 : 0;
          if (row === kingRow && col === 4) {
            const ksRight = color === 'white' ? castlingRights.whiteKingSide : castlingRights.blackKingSide;
            if (ksRight && !board[kingRow][5] && !board[kingRow][6] &&
                !isSquareAttacked(board, kingRow, 5, enemy) &&
                !isSquareAttacked(board, kingRow, 6, enemy)) {
              addMove(kingRow, 6, { castling: 'kingside' });
            }

            const qsRight = color === 'white' ? castlingRights.whiteQueenSide : castlingRights.blackQueenSide;
            if (qsRight && !board[kingRow][3] && !board[kingRow][2] && !board[kingRow][1] &&
                !isSquareAttacked(board, kingRow, 3, enemy) &&
                !isSquareAttacked(board, kingRow, 2, enemy)) {
              addMove(kingRow, 2, { castling: 'queenside' });
            }
          }
        }
        break;
      }
    }

    return moves;
  }

  // ─── 합법 이동 ───────────────────────────────────────────

  function getLegalMoves(state, row, col) {
    const piece = state.board[row][col];
    if (!piece) return [];
    if (piece.color !== state.turn) return [];
    return getPseudoLegalMoves(state, row, col).filter(move => {
      const nextState = applyMove(state, move);
      return !isInCheck(nextState.board, piece.color);
    });
  }

  function getAllLegalMoves(state, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (p && p.color === color) {
          for (const move of getPseudoLegalMoves(state, r, c)) {
            const nextState = applyMove(state, move);
            if (!isInCheck(nextState.board, color)) moves.push(move);
          }
        }
      }
    }
    return moves;
  }

  // ─── 게임 종료 판정 ──────────────────────────────────────

  function isCheckmate(state, color) {
    return isInCheck(state.board, color) && getAllLegalMoves(state, color).length === 0;
  }

  function isStalemate(state, color) {
    return !isInCheck(state.board, color) && getAllLegalMoves(state, color).length === 0;
  }

  function updateGameStatus(state) {
    const { turn } = state;
    if (isCheckmate(state, turn))       return { ...state, status: 'checkmate' };
    if (isStalemate(state, turn))       return { ...state, status: 'stalemate' };
    if (state.halfMoveClock >= 100)     return { ...state, status: 'draw' };
    if (isInCheck(state.board, turn))   return { ...state, status: 'check' };
    return { ...state, status: 'playing' };
  }

  // ─── 전역 노출 ───────────────────────────────────────────
  window.ChessMoves = {
    isSquareAttacked,
    isInCheck,
    getLegalMoves,
    getAllLegalMoves,
    isCheckmate,
    isStalemate,
    updateGameStatus,
  };
})();
