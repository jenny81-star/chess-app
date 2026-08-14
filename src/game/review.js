/**
 * review.js — 게임 종료 후 기보 확인(리뷰) 모드
 * 전역: window.ChessReview
 * 의존(호출 시점): window.ChessBoard, window.ChessGame, window.ChessRenderer
 *
 * 원리:
 *   시작 포지션(커스텀이면 startState, 아니면 표준 초기 배치)에서
 *   gameState.history를 applyMove로 순서대로 리플레이해
 *   각 시점(0..N)의 파생 상태 배열을 만든다.
 *   탐색은 파생 상태를 렌더에만 사용하며, 원본 gameState는 절대 건드리지 않는다.
 */
(function () {
  'use strict';

  // node 테스트에서도 로드 가능하도록 (editor.js와 같은 패턴)
  const root = typeof window !== 'undefined' ? window : globalThis;

  // ── 내부 상태 ─────────────────────────────────────────────
  let _active = false;
  let _states = [];   // 시점별 상태: _states[i] = i수까지 둔 포지션
  let _index  = 0;    // 현재 보고 있는 시점 (0 = 시작 포지션)
  let _total  = 0;    // 전체 수

  // ── 시점별 상태 빌드 (undoLastRound와 같은 리플레이 패턴) ──
  function buildStates(finalState, startState) {
    const { cloneState, createInitialState, applyMove } = root.ChessBoard;

    let s = startState ? cloneState(startState) : createInitialState();
    s.difficulty = finalState.difficulty;
    s.mode       = finalState.mode;

    const states = [s];
    for (const h of finalState.history) {
      const move = { from: h.from, to: h.to };
      if (h.castling)  move.castling  = h.castling;
      if (h.enPassant) move.enPassant = h.enPassant;
      if (h.promotion) move.promotion = h.promotion;
      s = applyMove(s, move);
      states.push(s);
    }
    // 마지막 시점은 실제 게임 상태를 그대로 사용 (status 등 완전 일치 보장)
    states[states.length - 1] = finalState;
    return states;
  }

  // ── 진입 / 종료 ───────────────────────────────────────────
  function enter(resultText) {
    const game = window.ChessGame.getState();
    if (!game || _active) return;

    _states = buildStates(game, window.ChessGame.getStartState());
    _total  = game.history.length;
    _active = true;

    document.getElementById('gameover-modal').style.display = 'none';
    document.getElementById('controls').style.display = 'none';
    document.getElementById('review-bar').style.display = 'flex';
    document.getElementById('review-result-badge').textContent = resultText || '복기 중';

    // 종료(메뉴로) 버튼 라벨을 게임오버 모달과 동일하게 (모드별 분기 유지)
    document.getElementById('btn-review-menu').textContent =
      document.getElementById('btn-change-difficulty').textContent;

    document.addEventListener('keydown', onKeyDown);
    goTo(_total);
  }

  /**
   * 리뷰 모드 해제.
   * opts.silent === true 면 보드를 다시 그리지 않는다
   * (새 게임/불러오기/메뉴 이동 등 곧바로 다른 화면이 그려질 때).
   */
  function exit(opts) {
    if (!_active) return;
    _active = false;
    _states = [];
    _index  = 0;
    _total  = 0;

    document.removeEventListener('keydown', onKeyDown);
    document.getElementById('review-bar').style.display = 'none';
    document.getElementById('controls').style.display = 'flex';

    if (!(opts && opts.silent)) {
      const game = window.ChessGame.getState();
      if (game && window.ChessRenderer) window.ChessRenderer.onBoardReady(game);
    }
  }

  function isActive() {
    return _active;
  }

  // ── 탐색 ─────────────────────────────────────────────────
  function goTo(i) {
    if (!_active) return;
    _index = Math.max(0, Math.min(_total, i));

    // 파생 상태를 렌더에만 사용 — gameState는 건드리지 않음
    window.ChessRenderer.onBoardReady(_states[_index]);

    renderReviewHistory();
    updateNavUI();
  }

  function updateNavUI() {
    document.getElementById('review-position').textContent = _index + ' / ' + _total + '수';
    document.getElementById('btn-review-first').disabled = _index === 0;
    document.getElementById('btn-review-prev').disabled  = _index === 0;
    document.getElementById('btn-review-next').disabled  = _index === _total;
    document.getElementById('btn-review-last').disabled  = _index === _total;
  }

  // ── 기보 패널: 전체 수 + 클릭 점프 + 현재 수 하이라이트 ────
  function renderReviewHistory() {
    const historyEl = document.getElementById('move-history');
    if (!historyEl) return;

    const history = _states[_total].history;
    const rows = [];

    for (let i = 0; i < history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      rows.push(
        '<div class="move-row" style="display:flex;gap:4px;padding:2px 4px;font-family:var(--font-mono);font-size:12px">' +
          '<span style="color:var(--text-muted);min-width:24px">' + moveNum + '.</span>' +
          reviewMoveSpan(history[i], i) +
          reviewMoveSpan(history[i + 1], i + 1) +
        '</div>'
      );
    }

    historyEl.innerHTML = rows.join('');

    // 현재 보고 있는 수가 목록에서 보이도록 스크롤
    const activeEl = historyEl.querySelector('.review-move.active');
    if (activeEl) {
      const row = activeEl.closest('.move-row');
      if (row) {
        historyEl.scrollTop = row.offsetTop - historyEl.clientHeight / 2 + row.offsetHeight / 2;
      }
    }
  }

  function reviewMoveSpan(entry, idx) {
    if (!entry) return '<span style="flex:1"></span>';
    const notation = window.ChessRenderer.historyEntryToNotation(entry);
    const isActiveMove = (idx === _index - 1);
    return '<span class="review-move' + (isActiveMove ? ' active' : '') + '"' +
      ' data-idx="' + idx + '" style="flex:1">' + notation + '</span>';
  }

  // ── 키보드 탐색 ───────────────────────────────────────────
  function onKeyDown(e) {
    if (!_active) return;
    if (e.key === 'ArrowLeft')       { e.preventDefault(); goTo(_index - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(_index + 1); }
    else if (e.key === 'Home')       { e.preventDefault(); goTo(0); }
    else if (e.key === 'End')        { e.preventDefault(); goTo(_total); }
  }

  // ── DOM 이벤트 연결 (스크립트 로드 시 1회, 브라우저 전용) ──
  if (typeof document !== 'undefined' && document.getElementById('btn-review')) {

  document.getElementById('btn-review').addEventListener('click', () => {
    enter(document.getElementById('gameover-title').textContent);
  });

  document.getElementById('btn-review-first').addEventListener('click', () => goTo(0));
  document.getElementById('btn-review-prev').addEventListener('click', () => goTo(_index - 1));
  document.getElementById('btn-review-next').addEventListener('click', () => goTo(_index + 1));
  document.getElementById('btn-review-last').addEventListener('click', () => goTo(_total));

  // 종료 버튼: 게임오버 모달의 기존 버튼과 완전히 같은 동작(모드별 분기 포함)
  document.getElementById('btn-review-rematch').addEventListener('click', () => {
    exit({ silent: true });
    document.getElementById('btn-rematch').click();
  });
  document.getElementById('btn-review-menu').addEventListener('click', () => {
    exit({ silent: true });
    document.getElementById('btn-change-difficulty').click();
  });

  // 기보 목록에서 수 클릭 → 그 시점으로 점프
  document.getElementById('move-history').addEventListener('click', (e) => {
    if (!_active) return;
    const mv = e.target.closest('.review-move');
    if (!mv) return;
    goTo(parseInt(mv.dataset.idx, 10) + 1);
  });

  } // end DOM 이벤트 연결

  // ── 전역 노출 ─────────────────────────────────────────────
  root.ChessReview = {
    enter,
    exit,
    isActive,
    goTo,
    buildStates,   // 테스트용
  };
})();
