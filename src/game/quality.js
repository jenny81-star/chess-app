/**
 * quality.js — 수 품질 판정 (!, !!, ?, ??)
 * 전역: window.ChessQuality
 * 의존(호출 시점): window.ChessBoard, window.ChessAI, window.ChessGame,
 *                 window.ChessRenderer, window.ChessReview
 *
 * 판정 기준 (그 수를 두기 직전 포지션을 depth 3으로 분석):
 *   cpLoss = 최선수 점수 - 실제 둔 수 점수 (둔 쪽 관점, centipawn)
 *   ??  cpLoss >= 300         (심각한 실수)
 *   ?   cpLoss >= 120         (실수)
 *   !!  최선수이고 차선책보다 >= 400cp 좋음 (메이트 유일수 포함 — 메이트 점수는
 *       ±200000대라 차선책과의 차이가 자연히 400을 넘는다)
 *   !   최선수이고 차선책보다 >= 150cp 좋음
 *   단, 합법 수가 1개뿐이면 !/!!를 부여하지 않음 (강제수는 잘한 게 아님)
 *   우선순위: ?? > ? > !! > !
 *
 * 성능: 수마다 setTimeout 체인으로 한 수씩 백그라운드 분석하고
 *       결과를 history 엔트리의 quality 필드에 캐시한다
 *       ('!' | '!!' | '?' | '??' | '' — undefined/null이면 미분석).
 *       저장/불러오기는 history를 통째로 직렬화하므로 자동으로 함께 저장된다.
 */
(function () {
  'use strict';

  // node 테스트에서도 로드 가능하도록 (review.js와 같은 패턴)
  const root = typeof window !== 'undefined' ? window : globalThis;

  // ── 판정 상수 ─────────────────────────────────────────────
  const ANALYSIS_DEPTH   = 3;    // 난이도와 무관하게 고정
  const BLUNDER_CP       = 300;  // ??
  const MISTAKE_CP       = 120;  // ?
  const BRILLIANT_GAP_CP = 400;  // !!
  const GOOD_GAP_CP      = 150;  // !

  // ── 순수 판정 함수 ────────────────────────────────────────
  // rankedMoves: [{ move, score }] — ChessAI.rankMovesSync 결과
  //   (score는 백 기준 centipawn, 둔 쪽 최선수가 맨 앞에 오도록 정렬됨)
  // playedMove:  { from, to, promotion? }
  // color:       수를 둔 쪽 ('white' | 'black')
  function judgeQuality(rankedMoves, playedMove, color) {
    if (!rankedMoves || rankedMoves.length === 0 || !playedMove) return '';

    const sign = color === 'black' ? -1 : 1;  // 둔 쪽 관점으로 변환
    const idx = rankedMoves.findIndex(r => sameMove(r.move, playedMove));
    if (idx < 0) return '';

    const played = sign * rankedMoves[idx].score;
    const best   = sign * rankedMoves[0].score;
    const cpLoss = best - played;

    if (cpLoss >= BLUNDER_CP) return '??';
    if (cpLoss >= MISTAKE_CP) return '?';

    if (rankedMoves.length < 2) return '';  // 강제수(합법 수 1개)엔 !/!! 없음
    if (cpLoss > 0) return '';              // 최선수가 아니면 !/!! 대상 아님

    // 차선책 = 실제 둔 수를 제외한 나머지 중 최고 점수
    let second = -Infinity;
    for (let i = 0; i < rankedMoves.length; i++) {
      if (i === idx) continue;
      const s = sign * rankedMoves[i].score;
      if (s > second) second = s;
    }
    const gap = played - second;

    if (gap >= BRILLIANT_GAP_CP) return '!!';
    if (gap >= GOOD_GAP_CP)      return '!';
    return '';
  }

  function sameMove(a, b) {
    return a.from[0] === b.from[0] && a.from[1] === b.from[1] &&
           a.to[0]   === b.to[0]   && a.to[1]   === b.to[1] &&
           (a.promotion || null) === (b.promotion || null);
  }

  // ── history 엔트리 → applyMove용 move 객체 ────────────────
  function entryToMove(h) {
    const move = { from: h.from, to: h.to };
    if (h.castling)  move.castling  = h.castling;
    if (h.enPassant) move.enPassant = h.enPassant;
    if (h.promotion) move.promotion = h.promotion;
    return move;
  }

  // index수를 두기 직전 포지션 (시작 상태에서 리플레이 — undoLastRound 패턴)
  function positionBefore(startState, history, index) {
    const { cloneState, createInitialState, applyMove } = root.ChessBoard;
    let s = startState ? cloneState(startState) : createInitialState();
    for (let i = 0; i < index; i++) {
      s = applyMove(s, entryToMove(history[i]));
    }
    return s;
  }

  // 한 수 동기 분석 → 품질 기호 반환 (엔트리는 변형하지 않음)
  function analyzeMoveAt(startState, history, index) {
    const before = positionBefore(startState, history, index);
    const ranked = root.ChessAI.rankMovesSync(before, ANALYSIS_DEPTH, before.turn);
    return judgeQuality(ranked, entryToMove(history[index]), before.turn);
  }

  // ── 백그라운드 분석 큐 ────────────────────────────────────
  // 항상 "현재 게임 상태"에서 quality가 없는 첫 엔트리를 찾아 한 수씩 처리한다.
  // (엔트리 참조를 캡처하지 않으므로 새 게임/무르기/불러오기로 history가
  //  통째로 바뀌어도 안전하고, 남은 수는 자연히 이어서 채워진다.)
  let _busy  = false;   // AI 탐색 대기 중이면 true — 동기 엔진이라 겹치면 체감 지연
  let _timer = null;    // 예약된 처리 타이머 (중복 예약 방지 플래그 겸용)

  function sync() {
    if (_timer !== null || _busy) return;
    _timer = setTimeout(processNext, 0);
  }

  // game.js의 setAIThinking에서 호출 — AI가 생각 중일 땐 분석을 멈추고,
  // 착수가 끝나면 밀린 수들을 이어서 처리한다.
  function setBusy(busy) {
    _busy = !!busy;
    if (_busy) {
      if (_timer !== null) { clearTimeout(_timer); _timer = null; }
    } else {
      sync();
    }
  }

  // 새 게임/리셋 시 예약된 분석 취소
  function reset() {
    if (_timer !== null) { clearTimeout(_timer); _timer = null; }
  }

  function processNext() {
    _timer = null;
    if (_busy) return;
    if (!root.ChessGame) return;

    const game = root.ChessGame.getState();
    if (!game || !game.history || game.history.length === 0) return;

    const history = game.history;
    let idx = -1;
    for (let i = 0; i < history.length; i++) {
      if (history[i].quality === undefined || history[i].quality === null) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;  // 전부 분석됨 — 체인 종료

    let q = '';
    try {
      q = analyzeMoveAt(root.ChessGame.getStartState(), history, idx);
    } catch (err) {
      console.error('[Quality] analyze error at move ' + idx + ':', err);
    }
    history[idx].quality = q;

    refreshUI();

    // 다음 수는 다음 틱에 — 한꺼번에 돌려 UI가 굳는 것 방지
    _timer = setTimeout(processNext, 0);
  }

  // 분석 결과가 채워질 때마다 기보 패널만 갱신 (보드는 건드리지 않음)
  function refreshUI() {
    if (root.ChessReview && root.ChessReview.isActive()) {
      if (root.ChessReview.refreshNotations) root.ChessReview.refreshNotations();
    } else if (root.ChessRenderer && root.ChessRenderer.updateMoveHistory) {
      const s = root.ChessGame && root.ChessGame.getState();
      if (s) root.ChessRenderer.updateMoveHistory(s);
    }
  }

  // ── 전역 노출 ─────────────────────────────────────────────
  root.ChessQuality = {
    judgeQuality,     // 순수 판정 함수 (테스트용)
    analyzeMoveAt,    // 한 수 동기 분석 (테스트용)
    sync,             // 미분석 수가 있으면 백그라운드 분석 시작
    setBusy,          // AI 생각 중 큐 일시정지
    reset,            // 예약된 분석 취소
    ANALYSIS_DEPTH,
  };
})();
