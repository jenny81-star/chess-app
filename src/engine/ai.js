/**
 * ai.js — Minimax + Alpha-Beta Pruning + 난이도 시스템
 * 전역: window.ChessAI
 * 의존: window.ChessBoard, window.ChessMoves, window.ChessEval
 */
(function () {
  'use strict';

  const { applyMove, PIECE_VALUES }           = window.ChessBoard;
  const { getAllLegalMoves, isInCheck }        = window.ChessMoves;
  const { evaluate }                          = window.ChessEval;

  // ── 난이도 파라미터 ────────────────────────────────────────
  const DIFFICULTY_CONFIG = {
    '입문':   { depth: 1, mistakeRate: 0.40, topN: 8, thinkTime:  300 },
    '초급':   { depth: 2, mistakeRate: 0.25, topN: 5, thinkTime:  500 },
    '중급':   { depth: 3, mistakeRate: 0.12, topN: 3, thinkTime:  800 },
    '고급':   { depth: 4, mistakeRate: 0.03, topN: 1, thinkTime: 1200 },
    '마스터': { depth: 5, mistakeRate: 0.00, topN: 1, thinkTime: 2000 },
  };

  const CHECKMATE_SCORE = 200000;
  const MAX_SEARCH_MS   = 8000;
  let _searchDeadline   = Infinity;

  // ── 이동 정렬 (MVV-LVA) ───────────────────────────────────

  function getMoveOrderScore(state, move) {
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    const attacker = state.board[fr][fc];
    const victim   = state.board[tr][tc];
    let score = 0;
    if (victim)        score += 10 * PIECE_VALUES[victim.type] - PIECE_VALUES[attacker.type] / 100;
    if (move.promotion) score += PIECE_VALUES[move.promotion] * 0.5;
    if (move.enPassant) score += 90;
    if (move.castling)  score += 70;
    return score;
  }

  function orderMoves(state, moves) {
    return moves.slice().sort((a, b) => getMoveOrderScore(state, b) - getMoveOrderScore(state, a));
  }

  // ── Minimax + Alpha-Beta ──────────────────────────────────

  function minimax(state, depth, alpha, beta, isMaximizing) {
    if (Date.now() > _searchDeadline) return evaluate(state);
    if (depth === 0) return evaluate(state);

    const color = isMaximizing ? 'white' : 'black';
    const moves = getAllLegalMoves(state, color);

    if (moves.length === 0) {
      if (isInCheck(state.board, color)) {
        return isMaximizing ? -(CHECKMATE_SCORE + depth) : (CHECKMATE_SCORE + depth);
      }
      return 0;
    }

    const ordered = orderMoves(state, moves);

    if (isMaximizing) {
      let best = -Infinity;
      for (const move of ordered) {
        const score = minimax(applyMove(state, move), depth - 1, alpha, beta, false);
        if (score > best)  best  = score;
        if (score > alpha) alpha = score;
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const move of ordered) {
        const score = minimax(applyMove(state, move), depth - 1, alpha, beta, true);
        if (score < best) best = score;
        if (score < beta) beta = score;
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  function computeRankedMoves(state, depth, color) {
    const isMaximizing = color === 'white';
    const moves = getAllLegalMoves(state, color);
    if (moves.length === 0) return [];

    const scored = orderMoves(state, moves).map(move => {
      const childState = applyMove(state, move);
      const score = minimax(childState, depth - 1, -Infinity, Infinity, !isMaximizing);
      return { move, score };
    });

    scored.sort((a, b) => isMaximizing ? b.score - a.score : a.score - b.score);
    return scored;
  }

  // ── 실수 주입 ─────────────────────────────────────────────

  function selectMoveWithMistake(rankedMoves, config) {
    if (rankedMoves.length === 0) return null;
    if (Math.random() < config.mistakeRate) {
      const pool = rankedMoves.slice(0, Math.min(config.topN, rankedMoves.length));
      return pool[Math.floor(Math.random() * pool.length)].move;
    }
    return rankedMoves[0].move;
  }

  // ── 공개 API ──────────────────────────────────────────────

  function getBestMove(state, difficulty) {
    const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG['중급'];
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const startTime = Date.now();
          _searchDeadline = startTime + MAX_SEARCH_MS;
          const ranked  = computeRankedMoves(state, config.depth, state.turn);
          const chosen  = selectMoveWithMistake(ranked, config);
          const elapsed = Date.now() - startTime;
          const wait    = config.thinkTime - elapsed;
          if (wait > 0) {
            setTimeout(() => resolve(chosen), wait);
          } else {
            resolve(chosen);
          }
        } catch (err) {
          reject(err);
        }
      }, 0);
    });
  }

  function getHintMove(state) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          _searchDeadline = Date.now() + 3000;
          const ranked = computeRankedMoves(state, 2, state.turn);
          resolve(ranked.length > 0 ? ranked[0].move : null);
        } catch (err) {
          reject(err);
        }
      }, 0);
    });
  }

  function analyzePosition(state, depth) {
    depth = depth || 3;
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          _searchDeadline = Date.now() + MAX_SEARCH_MS;
          resolve(computeRankedMoves(state, depth, state.turn));
        } catch (err) {
          reject(err);
        }
      }, 0);
    });
  }

  // ─── 전역 노출 ───────────────────────────────────────────
  window.ChessAI = {
    DIFFICULTY_CONFIG,
    getBestMove,
    getHintMove,
    analyzePosition,
  };
})();
