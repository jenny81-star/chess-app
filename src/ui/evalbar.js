/**
 * evalbar.js — 보드 왼쪽 평가 막대 + 보드 위 오프닝 이름
 * 전역: window.ChessEvalBar
 * 의존(호출 시점): ChessStockfish, ChessEval, ChessOpenings, ChessBoard
 *
 * renderer.js가 포지션이 바뀔 때마다(플레이어 착수·AI 착수·무르기·불러오기·복기 이동)
 * update(state)를 호출한다. Stockfish 평가는 비동기라 최신 포지션 결과만 반영한다.
 * 막대는 백 기준: 흰 부분(아래)이 길수록 백 우세.
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;

  const EVAL_DEPTH  = 12;
  const STORAGE_KEY = 'chess-evalbar-enabled';
  const MATE_SCORE  = 200000;
  const MATE_ZONE   = 1000;   // |score| > MATE_SCORE - MATE_ZONE 이면 메이트 점수

  // ── 순수 함수 (node 테스트 대상) ───────────────────────────
  // 백 기준 점수 → 막대에서 백이 차지하는 비율(%)
  // Lichess와 같은 로지스틱 곡선: +1.0 ≈ 59%, +3.0 ≈ 75%, +6.0 ≈ 90%
  function scoreToPercent(score) {
    if (score === null || score === undefined || !isFinite(score)) return 50;
    if (Math.abs(score) > MATE_SCORE - MATE_ZONE) return score > 0 ? 100 : 0;
    const pct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score)) - 1);
    return Math.max(3, Math.min(97, pct));   // 한쪽이 완전히 사라지지 않게
  }

  // 백 기준 점수 → 표시 문자열 ('+1.2', '-0.4', 'M3')
  function scoreToLabel(score) {
    if (score === null || score === undefined || !isFinite(score)) return '';
    if (Math.abs(score) > MATE_SCORE - MATE_ZONE) return 'M' + (MATE_SCORE - Math.abs(score));
    const pawns = score / 100;
    if (Math.abs(pawns) < 0.05) return '0.0';
    return (pawns > 0 ? '+' : '') + pawns.toFixed(1);
  }

  // ── DOM ───────────────────────────────────────────────────
  let _enabled = true;
  let _fen     = null;     // 막대가 지금 보여줘야 하는 포지션
  let _last    = null;     // 마지막으로 받은 상태 (다시 켤 때 갱신용)

  try {
    if (root.localStorage && root.localStorage.getItem(STORAGE_KEY) === 'off') _enabled = false;
  } catch (e) { /* 저장소 불가 — 기본값 사용 */ }

  function els() {
    return {
      bar:     document.getElementById('eval-bar'),
      fill:    document.getElementById('eval-bar-fill'),
      label:   document.getElementById('eval-bar-label'),
      btn:     document.getElementById('btn-evalbar'),
      opening: document.getElementById('opening-name'),
    };
  }

  function render(pct, text) {
    const e = els();
    if (!e.bar) return;
    e.fill.style.height = pct + '%';
    e.label.textContent = text;
    // 우세한 쪽 끝에 점수를 표시 (백 우세 → 아래쪽 흰 부분, 흑 우세 → 위쪽 검은 부분)
    e.label.classList.toggle('white-adv', pct >= 50);
    e.label.classList.toggle('black-adv', pct < 50);
  }

  function renderScore(score) {
    render(scoreToPercent(score), scoreToLabel(score));
  }

  function updateOpening(state) {
    const e = els();
    if (!e.opening) return;
    const hit = root.ChessOpenings ? root.ChessOpenings.nameFor(state) : null;
    e.opening.textContent = hit ? hit.eco + ' · ' + hit.name : '';
    e.opening.title = e.opening.textContent;
  }

  function update(state) {
    if (!state) return;
    _last = state;
    updateOpening(state);
    if (!_enabled) return;

    const fen = root.ChessBoard.toFEN(state);
    _fen = fen;

    // 끝난 포지션은 엔진에 보내지 않고 결과로 표시 (메이트/무승부 포지션엔 pv가 없음)
    if (state.status === 'checkmate') {
      const whiteWon = state.turn === 'black';
      render(whiteWon ? 100 : 0, whiteWon ? '1-0' : '0-1');
      return;
    }
    if (state.status === 'stalemate' || state.status === 'draw') {
      render(50, '½-½');
      return;
    }

    const sf = root.ChessStockfish;
    if (sf && sf.isReady()) {
      sf.evaluatePosition(state, EVAL_DEPTH).then(score => {
        if (_fen === fen && score !== null) renderScore(score);
      }).catch(() => { /* 취소됨(더 새 포지션 요청) 또는 엔진 재시작 — 무시 */ });
    } else if (root.ChessEval) {
      // Stockfish를 못 쓰는 환경: 내장 정적 평가로 대략 표시
      renderScore(root.ChessEval.evaluate(state));
    }
  }

  function setEnabled(on) {
    _enabled = !!on;
    try { if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, _enabled ? 'on' : 'off'); }
    catch (e) { /* 저장 실패는 무시 */ }
    const e = els();
    if (e.bar) e.bar.classList.toggle('hidden', !_enabled);
    if (e.btn) e.btn.classList.toggle('active', _enabled);
    if (_enabled && _last) update(_last);
  }

  if (typeof document !== 'undefined') {
    const init = () => {
      const e = els();
      if (e.btn) e.btn.addEventListener('click', () => setEnabled(!_enabled));
      setEnabled(_enabled);
      render(50, '0.0');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  root.ChessEvalBar = { update, setEnabled, isEnabled: () => _enabled, scoreToPercent, scoreToLabel };
})();
