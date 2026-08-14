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
  // openingWindow: 오프닝 구간(첫 N수)에서 최선수 대비 이 폭(centipawn) 이내의
  //   수들을 후보로 삼아 가중 랜덤 선택한다. 낮은 난이도일수록 넓게 잡아
  //   더 다양하고(때로는 약한) 응수가 나오도록 한다.
  //   실측: 1.e4 이후 Nf6이 Nc6보다 45cp 앞서므로, 45cp보다 커야
  //   e5/d5류의 폰 전진이 후보에 들어와 다양화 효과가 생긴다.
  const DIFFICULTY_CONFIG = {
    '입문':   { depth: 1, mistakeRate: 0.40, topN: 8, thinkTime:  300, openingWindow: 120 },
    '초급':   { depth: 2, mistakeRate: 0.25, topN: 5, thinkTime:  500, openingWindow: 100 },
    '중급':   { depth: 3, mistakeRate: 0.12, topN: 3, thinkTime:  800, openingWindow:  80 },
    '고급':   { depth: 4, mistakeRate: 0.03, topN: 3, thinkTime: 1200, openingWindow:  60 },
    '마스터': { depth: 5, mistakeRate: 0.00, topN: 1, thinkTime: 2000, openingWindow:  50 },
  };

  const CHECKMATE_SCORE   = 200000;
  const MAX_SEARCH_MS     = 8000;
  const OPENING_MOVE_LIMIT = 6; // state.fullMoveNumber가 이 값 이하이면 오프닝 구간으로 간주
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

  // ── 오프닝 다양화 (epsilon-window 가중 랜덤) ───────────────
  //
  // rankedMoves는 이미 "해당 턴 기준 최선수가 먼저" 오도록 정렬되어 있다
  // (백은 내림차순, 흑은 오름차순 — computeRankedMoves 참고). 따라서 최선수
  // 대비 점수 차는 항상 |score - best| >= 0 으로 계산할 수 있다.
  //
  // 최선수와 점수 차가 config.openingWindow(cp) 이내인 후보들만 모아,
  // 점수가 좋을수록 확률이 높은 소프트맥스 가중치로 하나를 뽑는다.
  // 체크메이트급 수(수만 cp 차이)는 window를 훨씬 초과하므로 자연히
  // 후보군에서 제외되어, 필승/필수 수는 항상 그대로 선택된다.

  function isOpeningPhase(state) {
    return !!state && state.fullMoveNumber <= OPENING_MOVE_LIMIT;
  }

  function pickWeightedRandom(candidates) {
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    if (!(total > 0)) return candidates[0].move;
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.move;
    }
    return candidates[candidates.length - 1].move;
  }

  function selectOpeningMove(rankedMoves, config) {
    const window = config.openingWindow || 0;
    const bestScore = rankedMoves[0].score;
    const pool = rankedMoves.filter(r => Math.abs(r.score - bestScore) <= window);
    if (pool.length <= 1) return pool[0] ? pool[0].move : rankedMoves[0].move;

    // temperature가 작을수록 최선수 쏠림이 강해지고, 클수록 균등해진다.
    // window의 1/3 정도로 잡아 window 가장자리 수는 눈에 띄게 낮은 확률을,
    // window 중심부 수들은 고르게 뽑히도록 한다.
    const temperature = Math.max(window / 3, 15);
    const weighted = pool.map(r => ({
      move:   r.move,
      weight: Math.exp(-Math.abs(r.score - bestScore) / temperature),
    }));
    return pickWeightedRandom(weighted);
  }

  function selectMove(state, rankedMoves, config) {
    if (rankedMoves.length === 0) return null;
    if (rankedMoves.length === 1) return rankedMoves[0].move;
    if (isOpeningPhase(state)) {
      return selectOpeningMove(rankedMoves, config);
    }
    return selectMoveWithMistake(rankedMoves, config);
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
          const chosen  = selectMove(state, ranked, config);
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

  // 분석용 동기 API (수 품질 판정 등에서 사용)
  // getBestMove/getHintMove가 남긴 지난 _searchDeadline이 그대로면 탐색이
  // 곧바로 중단되므로, 호출 시점 기준으로 데드라인을 새로 잡는다.
  function rankMovesSync(state, depth, color) {
    _searchDeadline = Date.now() + MAX_SEARCH_MS;
    return computeRankedMoves(state, depth, color || state.turn);
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
    rankMovesSync,   // 분석용 (수 품질 판정) — 동기 실행
  };
})();
