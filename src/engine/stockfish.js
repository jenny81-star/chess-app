/**
 * stockfish.js — Stockfish(WASM, lite single-threaded) 웹 워커 브리지
 * 전역: window.ChessStockfish
 * 의존(호출 시점): window.ChessBoard (toFEN), window.ChessMoves (getLegalMoves)
 *
 * 엔진 인스턴스(워커) 두 개를 쓴다:
 *   analysis — 힌트 · 수 품질 · 평가 막대 (항상 Skill Level 20)
 *   opponent — 상대 AI 착수 (레벨별 Skill Level / 깊이)
 * UCI 옵션은 워커 전역 상태라, 상대 AI의 약한 설정이 분석에 섞이지 않도록 분리한다.
 * 작업마다 Skill Level·MultiPV를 다시 지정하는 것도 같은 이유.
 *
 * 워커를 띄울 수 없는 환경(file:// 실행, 구형 브라우저, 로딩 실패)에서는
 * isReady()가 false가 되고, 호출 측은 내장 엔진(ai.js)으로 대체한다.
 *
 * 엔진: Stockfish.js 18 (c) Chess.com, LLC / Stockfish 개발팀 — GPLv3
 *       assets/stockfish/Copying.txt 참고
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;

  const ENGINE_PATH     = 'assets/stockfish/stockfish-18-lite-single.js';
  const INIT_TIMEOUT_MS = 15000;   // 7MB wasm 다운로드 + 초기화
  const JOB_TIMEOUT_MS  = 10000;   // 탐색이 이 시간을 넘으면 stop
  const KILL_GRACE_MS   = 3000;    // stop 후에도 bestmove가 없으면 워커 재시작
  const MATE_SCORE      = 200000;  // ai.js CHECKMATE_SCORE와 같은 스케일

  // 작업 우선순위 (높을수록 먼저)
  const PRIORITY = { move: 3, hint: 3, eval: 2, quality: 1 };

  // ── UCI 변환 (순수 함수 — node 테스트 대상) ──────────────────
  const FILES = 'abcdefgh';

  function moveToUci(move) {
    const sq = ([r, c]) => FILES[c] + (8 - r);
    return sq(move.from) + sq(move.to) + (move.promotion ? move.promotion.toLowerCase() : '');
  }

  function uciToMove(uci) {
    if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
    const sq = s => [8 - parseInt(s[1], 10), FILES.indexOf(s[0])];
    const move = { from: sq(uci.slice(0, 2)), to: sq(uci.slice(2, 4)) };
    if (uci.length > 4) move.promotion = uci[4].toUpperCase();
    return move;
  }

  // UCI 수 → 엔진 합법 수 객체 (castling/enPassant 플래그 포함). 없으면 null.
  // applyMove가 룩 이동·앙파상 잡기를 이 플래그로 처리하므로 착수에는 반드시 이걸 쓴다.
  function toLegalMove(state, uci) {
    const m = uciToMove(uci);
    if (!m || !root.ChessMoves) return null;
    const legal = root.ChessMoves.getLegalMoves(state, m.from[0], m.from[1]);
    return legal.find(l =>
      l.to[0] === m.to[0] && l.to[1] === m.to[1] &&
      (l.promotion || null) === (m.promotion || null)) || null;
  }

  // "info depth 12 ... multipv 2 score cp -35 ... pv e7e5 g1f3" → { multipv, depth, score, pv }
  // score는 둘 차례(side to move) 관점 centipawn. 메이트는 ±(MATE_SCORE - 수)로 환산.
  function parseInfo(line) {
    if (line.indexOf('info ') !== 0 || line.indexOf(' score ') < 0 || line.indexOf(' pv ') < 0) return null;
    if (line.indexOf(' lowerbound') >= 0 || line.indexOf(' upperbound') >= 0) return null;
    const t = line.split(' ');
    const at = key => t.indexOf(key);
    const depth = parseInt(t[at('depth') + 1], 10);
    const multipv = at('multipv') >= 0 ? parseInt(t[at('multipv') + 1], 10) : 1;
    const kind = t[at('score') + 1];
    const val  = parseInt(t[at('score') + 2], 10);
    let score;
    if (kind === 'mate') score = val > 0 ? MATE_SCORE - val : -MATE_SCORE - val;
    else score = val;
    return { depth, multipv, score, pv: t.slice(at('pv') + 1) };
  }

  // ── 엔진 인스턴스 ─────────────────────────────────────────
  function createEngine(name) {
    let worker = null;
    let ready  = false;
    let failed = false;        // 이 환경에서 워커 자체가 불가 — 다시 시도하지 않음
    let readyPromise = null;
    let queue   = [];          // [{ fen, depth, multipv, skill, searchmoves, priority, tag, resolve, reject }]
    let current = null;        // 진행 중인 작업 { job, onLine }

    function log(msg, extra) { console.log('[Stockfish:' + name + '] ' + msg, extra || ''); }

    function init() {
      if (readyPromise) return readyPromise;
      readyPromise = new Promise(resolve => {
        const fail = (why, permanent) => {
          if (ready) return;
          if (permanent) failed = true;
          console.warn('[Stockfish:' + name + '] 사용 불가 — 내장 엔진으로 대체합니다:', why);
          try { if (worker) worker.terminate(); } catch (e) { /* noop */ }
          worker = null;
          if (!permanent) readyPromise = null;   // 일시적 실패는 다음 호출 때 재시도
          resolve(false);
        };
        if (failed) { resolve(false); return; }
        if (typeof Worker === 'undefined' || (root.location && root.location.protocol === 'file:')) {
          fail('worker unavailable', true);
          return;
        }
        const timer = setTimeout(() => fail('init timeout', false), INIT_TIMEOUT_MS);
        try {
          worker = new Worker(ENGINE_PATH);
        } catch (err) {
          clearTimeout(timer);
          fail(err && err.message, true);
          return;
        }
        worker.onerror = (e) => {
          clearTimeout(timer);
          if (ready) restart('worker error: ' + (e && e.message));
          else fail(e && e.message || 'worker error', false);
        };
        worker.onmessage = (e) => {
          const line = typeof e.data === 'string' ? e.data : String(e.data);
          if (!ready) {
            if (line === 'uciok') worker.postMessage('isready');
            else if (line === 'readyok') {
              clearTimeout(timer);
              ready = true;
              log('엔진 준비 완료');
              resolve(true);
              pump();
            }
            return;
          }
          if (current) current.onLine(line);
        };
        worker.postMessage('uci');
      });
      return readyPromise;
    }

    // 워커가 응답하지 않거나 죽었을 때: 진행/대기 작업을 모두 실패 처리하고 재시작 준비
    function restart(why) {
      console.warn('[Stockfish:' + name + '] 워커 재시작:', why);
      try { if (worker) worker.terminate(); } catch (e) { /* noop */ }
      worker = null;
      ready = false;
      readyPromise = null;
      const pending = (current ? [current.job] : []).concat(queue);
      current = null;
      queue = [];
      pending.forEach(j => j.reject(new Error('stockfish restarted: ' + why)));
      init();
    }

    function pump() {
      if (current || queue.length === 0 || !ready) return;
      const job = queue.shift();
      const lines = {};   // multipv → 마지막(가장 깊은) info
      let stopTimer = null, killTimer = null;
      current = {
        job,
        onLine(line) {
          const info = parseInfo(line);
          if (info) { lines[info.multipv] = info; return; }
          if (line.indexOf('bestmove') === 0) {
            clearTimeout(stopTimer);
            clearTimeout(killTimer);
            current = null;
            const best = line.split(' ')[1];
            const result = Object.keys(lines).map(Number).sort((a, b) => a - b).map(k => lines[k]);
            job.resolve({ bestmove: best && best !== '(none)' ? best : null, lines: result });
            pump();
          }
        },
      };
      worker.postMessage('setoption name Skill Level value ' + job.skill);
      worker.postMessage('setoption name MultiPV value ' + job.multipv);
      worker.postMessage('position fen ' + job.fen);
      worker.postMessage('go depth ' + job.depth + (job.searchmoves ? ' searchmoves ' + job.searchmoves.join(' ') : ''));
      stopTimer = setTimeout(() => {
        if (worker) worker.postMessage('stop');
        killTimer = setTimeout(() => restart('no bestmove after stop'), KILL_GRACE_MS);
      }, JOB_TIMEOUT_MS);
    }

    // 원시 탐색 → { bestmove(uci), lines: [{ multipv, depth, score(둘 차례 관점), pv }] }
    function search(fen, opts) {
      opts = opts || {};
      if (!ready) return Promise.reject(new Error('stockfish not ready'));
      return new Promise((resolve, reject) => {
        const job = {
          fen,
          depth:       opts.depth || 12,
          multipv:     opts.multipv || 1,
          skill:       opts.skill === undefined ? 20 : opts.skill,
          searchmoves: opts.searchmoves || null,
          priority:    opts.priority || 0,
          tag:         opts.tag || null,
          resolve, reject,
        };
        // 우선순위가 높은 작업 앞에, 같은 우선순위끼리는 들어온 순서대로
        let i = queue.findIndex(q => q.priority < job.priority);
        if (i < 0) i = queue.length;
        queue.splice(i, 0, job);
        pump();
      });
    }

    // 아직 시작하지 않은 같은 태그 작업 취소 (평가 막대: 최신 포지션만 의미 있음)
    function cancel(tag) {
      queue = queue.filter(j => {
        if (j.tag !== tag) return true;
        j.reject(new Error('cancelled'));
        return false;
      });
    }

    return { init, isReady: () => ready, whenReady: init, search, cancel };
  }

  const analysis = createEngine('analysis');
  const opponent = createEngine('opponent');

  // ── 게임 상태 기준 API ─────────────────────────────────────

  // 최선수 (합법 수 객체) — 힌트용
  async function getBestMove(state, depth) {
    const res = await analysis.search(root.ChessBoard.toFEN(state),
      { depth: depth || 14, priority: PRIORITY.hint });
    return toLegalMove(state, res.bestmove);
  }

  // 수 품질 판정용 랭킹: ChessAI.rankMovesSync와 같은 형식 [{ move, score }]
  //   score는 백 기준, 둔 쪽 최선수가 맨 앞. 최선수·차선책(MultiPV 2)에
  //   실제 둔 수가 둘 다 아니면 searchmoves로 그 수만 따로 평가해 덧붙인다.
  //   → ChessQuality.judgeQuality에 그대로 넣을 수 있다.
  async function rankForQuality(state, playedMove, depth) {
    depth = depth || 12;
    const fen  = root.ChessBoard.toFEN(state);
    const sign = state.turn === 'white' ? 1 : -1;   // 둘 차례 관점 → 백 기준
    const opts = { depth, multipv: 2, priority: PRIORITY.quality };
    const res  = await analysis.search(fen, opts);
    const ranked = res.lines
      .filter(l => l.pv && l.pv[0])
      .map(l => ({ move: uciToMove(l.pv[0]), score: sign * l.score }));

    const playedUci = moveToUci(playedMove);
    if (!ranked.some(r => moveToUci(r.move) === playedUci)) {
      const one = await analysis.search(fen, { depth, multipv: 1, searchmoves: [playedUci], priority: PRIORITY.quality });
      const line = one.lines[0];
      if (line) ranked.push({ move: uciToMove(playedUci), score: sign * line.score });
    }
    return ranked;
  }

  // 평가 막대용 — 백 기준 점수. 이전 평가 요청 중 시작 안 된 것은 취소(최신 포지션 우선).
  async function evaluatePosition(state, depth) {
    analysis.cancel('eval');
    const sign = state.turn === 'white' ? 1 : -1;
    const res = await analysis.search(root.ChessBoard.toFEN(state),
      { depth: depth || 12, priority: PRIORITY.eval, tag: 'eval' });
    const line = res.lines[0];
    return line ? sign * line.score : null;
  }

  // 상대 AI 착수 탐색 (opponent 워커). opts: { skill, depth, multipv }
  //   → { move: 합법 수 객체 | null, ranked: [{ move, score(백 기준) }] }
  async function searchOpponent(state, opts) {
    const sign = state.turn === 'white' ? 1 : -1;
    const res = await opponent.search(root.ChessBoard.toFEN(state), {
      depth: opts.depth, skill: opts.skill, multipv: opts.multipv || 1, priority: PRIORITY.move,
    });
    const ranked = res.lines
      .filter(l => l.pv && l.pv[0])
      .map(l => ({ move: toLegalMove(state, l.pv[0]), score: sign * l.score }))
      .filter(r => r.move);
    return { move: toLegalMove(state, res.bestmove), ranked };
  }

  // ─── 전역 노출 ───────────────────────────────────────────
  root.ChessStockfish = {
    // 분석 엔진 (힌트·수 품질·평가 막대)
    init:      analysis.init,
    isReady:   analysis.isReady,
    whenReady: analysis.whenReady,
    search:    analysis.search,
    getBestMove,
    rankForQuality,
    evaluatePosition,
    // 상대 AI 엔진
    initOpponent:      opponent.init,
    isOpponentReady:   opponent.isReady,
    whenOpponentReady: opponent.whenReady,
    searchOpponent,
    // 순수 함수 (테스트용)
    moveToUci,
    uciToMove,
    toLegalMove,
    parseInfo,
    MATE_SCORE,
  };

  // 페이지 로드 시 백그라운드로 두 엔진 준비 (메뉴 화면에서 미리 받아 둠 — wasm은 캐시 공유)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    analysis.init();
    opponent.init();
  }
})();
