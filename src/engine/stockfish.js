/**
 * stockfish.js — Stockfish(WASM, lite single-threaded) 웹 워커 브리지
 * 전역: window.ChessStockfish
 * 의존: window.ChessBoard (toFEN)
 *
 * 힌트·수 품질 분석 전용 (상대 AI는 기존 ai.js 그대로 — 아이가 이길 수 있는 난이도 유지).
 * 워커를 띄울 수 없는 환경(file:// 실행, 구형 브라우저, 로딩 실패)에서는
 * isReady()가 false가 되고, 호출 측은 내장 엔진으로 대체한다.
 *
 * 엔진: Stockfish.js 18 (c) Chess.com, LLC / Stockfish 개발팀 — GPLv3
 *       assets/stockfish/Copying.txt 참고
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;

  const ENGINE_PATH     = 'assets/stockfish/stockfish-18-lite-single.js';
  const INIT_TIMEOUT_MS = 15000;   // 7MB wasm 다운로드 + 초기화
  const JOB_TIMEOUT_MS  = 10000;   // 한 번의 탐색이 이 시간을 넘으면 stop
  const MATE_SCORE      = 200000;  // ai.js CHECKMATE_SCORE와 같은 스케일

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

  // ── 워커 관리 ─────────────────────────────────────────────
  let _worker  = null;
  let _ready   = false;
  let _failed  = false;
  let _readyPromise = null;
  let _queue   = [];       // 대기 중인 탐색 작업
  let _current = null;     // 진행 중인 작업 { lines, onLine, finish }

  function init() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = new Promise(resolve => {
      const fail = (why) => {
        if (_ready || _failed) return;
        _failed = true;
        console.warn('[Stockfish] 사용 불가 — 내장 엔진으로 대체합니다:', why);
        try { if (_worker) _worker.terminate(); } catch (e) { /* noop */ }
        _worker = null;
        resolve(false);
      };
      if (typeof Worker === 'undefined' || (root.location && root.location.protocol === 'file:')) {
        fail('worker unavailable');
        return;
      }
      const timer = setTimeout(() => fail('init timeout'), INIT_TIMEOUT_MS);
      try {
        _worker = new Worker(ENGINE_PATH);
      } catch (err) {
        clearTimeout(timer);
        fail(err && err.message);
        return;
      }
      _worker.onerror = (e) => { clearTimeout(timer); fail(e && e.message || 'worker error'); };
      _worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : String(e.data);
        if (!_ready) {
          if (line === 'uciok') _worker.postMessage('isready');
          else if (line === 'readyok') {
            clearTimeout(timer);
            _ready = true;
            console.log('[Stockfish] 엔진 준비 완료');
            resolve(true);
          }
          return;
        }
        if (_current) _current.onLine(line);
      };
      _worker.postMessage('uci');
    });
    return _readyPromise;
  }

  function isReady() { return _ready; }

  // 준비 완료 여부를 기다림 (실패/불가 시 false)
  function whenReady() { return init(); }

  function pump() {
    if (_current || _queue.length === 0 || !_ready) return;
    const job = _queue.shift();
    const lines = {};   // multipv → 마지막(가장 깊은) info
    let timer = null;
    _current = {
      onLine(line) {
        const info = parseInfo(line);
        if (info) { lines[info.multipv] = info; return; }
        if (line.indexOf('bestmove') === 0) {
          clearTimeout(timer);
          _current = null;
          const best = line.split(' ')[1];
          const result = Object.keys(lines).map(Number).sort((a, b) => a - b).map(k => lines[k]);
          job.resolve({ bestmove: best && best !== '(none)' ? best : null, lines: result });
          pump();
        }
      },
    };
    _worker.postMessage('setoption name MultiPV value ' + (job.multipv || 1));
    _worker.postMessage('position fen ' + job.fen);
    _worker.postMessage('go depth ' + job.depth + (job.searchmoves ? ' searchmoves ' + job.searchmoves.join(' ') : ''));
    timer = setTimeout(() => { if (_worker) _worker.postMessage('stop'); }, JOB_TIMEOUT_MS);
  }

  // 원시 탐색: fen 문자열 기준 → { bestmove(uci), lines: [{ multipv, depth, score(둘 차례 관점), pv }] }
  function search(fen, opts) {
    opts = opts || {};
    if (!_ready) return Promise.reject(new Error('stockfish not ready'));
    return new Promise(resolve => {
      // priority: 힌트처럼 사용자가 기다리는 요청은 대기열 맨 앞에
      _queue[opts.priority ? 'unshift' : 'push']({
        fen,
        depth: opts.depth || 12,
        multipv: opts.multipv || 1,
        searchmoves: opts.searchmoves || null,
        resolve,
      });
      pump();
    });
  }

  // ── 게임 상태 기준 API ─────────────────────────────────────

  // 최선수 (내장 엔진 move 형식) — 힌트용
  async function getBestMove(state, depth) {
    const res = await search(root.ChessBoard.toFEN(state), { depth: depth || 14, priority: true });
    return uciToMove(res.bestmove);
  }

  // 수 품질 판정용 랭킹: ChessAI.rankMovesSync와 같은 형식 [{ move, score }]
  //   score는 백 기준, 둔 쪽 최선수가 맨 앞. 최선수·차선책(MultiPV 2)에
  //   실제 둔 수가 둘 다 아니면 searchmoves로 그 수만 따로 평가해 덧붙인다.
  //   → ChessQuality.judgeQuality에 그대로 넣을 수 있다.
  async function rankForQuality(state, playedMove, depth) {
    depth = depth || 12;
    const fen  = root.ChessBoard.toFEN(state);
    const sign = state.turn === 'white' ? 1 : -1;   // 둘 차례 관점 → 백 기준
    const res  = await search(fen, { depth, multipv: 2 });
    const ranked = res.lines
      .filter(l => l.pv && l.pv[0])
      .map(l => ({ move: uciToMove(l.pv[0]), score: sign * l.score }));

    const playedUci = moveToUci(playedMove);
    if (!ranked.some(r => moveToUci(r.move) === playedUci)) {
      const one = await search(fen, { depth, multipv: 1, searchmoves: [playedUci] });
      const line = one.lines[0];
      if (line) ranked.push({ move: uciToMove(playedUci), score: sign * line.score });
    }
    return ranked;
  }

  // ─── 전역 노출 ───────────────────────────────────────────
  root.ChessStockfish = {
    init,
    isReady,
    whenReady,
    search,
    getBestMove,
    rankForQuality,
    // 테스트용 순수 함수
    moveToUci,
    uciToMove,
    parseInfo,
  };

  // 페이지 로드 시 백그라운드로 엔진 준비 (메뉴 화면에서 미리 받아 둠)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') init();
})();
