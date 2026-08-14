/**
 * 수 품질 판정 (!, !!, ?, ??) — node 테스트
 * 실행: node tests/quality-test.js
 *
 * 검증 대상: ChessQuality.judgeQuality (순수 함수) + ChessQuality.analyzeMoveAt (엔진 통합)
 *  ① 퀸을 공짜로 헌납하는 수 → '??'
 *  ② 공짜 퀸을 잡는 수 (차선책과 큰 차이) → '!' 또는 '!!'
 *  ③ 평범한 오프닝 수 (1.e4) → 기호 없음
 *  ④ 합법 수가 1개뿐인 강제수 → '!!' 안 붙음
 *  ⑤ 판정 우선순위 (?? > ? > !! > !) — 순수 함수 단위 테스트
 *  ⑥ 메이트를 성사시키는 수 → '!!'
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// 브라우저 IIFE(window.*)를 node에서 그대로 로드
global.window = globalThis;
function load(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  vm.runInThisContext(src, { filename: rel });
}
load('src/engine/board.js');
load('src/engine/moves.js');
load('src/engine/evaluator.js');
load('src/engine/ai.js');
load('src/game/quality.js');

const { createInitialState, createStateFromBoard, applyMove } = window.ChessBoard;
const { getLegalMoves, getAllLegalMoves } = window.ChessMoves;
const { judgeQuality, analyzeMoveAt } = window.ChessQuality;

// ── 테스트 헬퍼 ─────────────────────────────────────────────
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else      { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  (actual: ' + JSON.stringify(extra) + ')' : '')); }
}

const FILES = 'abcdefgh';
function sq(name) {   // 'e2' → [6, 4]
  return [8 - parseInt(name[1], 10), FILES.indexOf(name[0])];
}

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function put(board, square, type, color) {
  const [r, c] = sq(square);
  board[r][c] = { type, color };
}

/** 엔진의 합법 수를 찾아 적용 후, 방금 둔 수의 품질 기호를 계산 */
function playAndJudge(startState, fromName, toName) {
  const from = sq(fromName), to = sq(toName);
  const legal = getLegalMoves(startState, from[0], from[1]);
  const move = legal.find(m => m.to[0] === to[0] && m.to[1] === to[1]);
  if (!move) throw new Error('illegal move in test: ' + fromName + '-' + toName);
  const after = applyMove(startState, move);
  return analyzeMoveAt(startState, after.history, after.history.length - 1);
}

// ═══ ① 퀸 공짜 헌납 → '??' ═══════════════════════════════════
console.log('\n[1] 퀸 헌납 — ?? (심각한 실수)');
{
  // 백 Ke1, Qd4 / 흑 Ke8, Rd8 — Qd4-d5?? 는 Rd8xd5로 퀸을 공짜로 내준다
  const board = emptyBoard();
  put(board, 'e1', 'K', 'white');
  put(board, 'd4', 'Q', 'white');
  put(board, 'e8', 'K', 'black');
  put(board, 'd8', 'R', 'black');
  const start = createStateFromBoard(board, { turn: 'white' });

  const q = playAndJudge(start, 'd4', 'd5');
  check("Qd5?? → '??'", q === '??', q);
}

// ═══ ② 공짜 퀸 잡기 → '!' 또는 '!!' ═════════════════════════
console.log('\n[2] 공짜 퀸 잡기 — ! / !!');
{
  // 백 Ke1, Rd1 / 흑 Ke8, Qd5(무방비) — Rxd5가 차선책 대비 압도적 최선수
  const board = emptyBoard();
  put(board, 'e1', 'K', 'white');
  put(board, 'd1', 'R', 'white');
  put(board, 'e8', 'K', 'black');
  put(board, 'd5', 'Q', 'black');
  const start = createStateFromBoard(board, { turn: 'white' });

  const q = playAndJudge(start, 'd1', 'd5');
  check("Rxd5 → '!' 또는 '!!'", q === '!' || q === '!!', q);
}

// ═══ ③ 평범한 오프닝 수 → 기호 없음 ══════════════════════════
console.log('\n[3] 평범한 수 — 기호 없음');
{
  const start = createInitialState();
  const q = playAndJudge(start, 'e2', 'e4');
  check("1.e4 → '' (기호 없음)", q === '', q);
}

// ═══ ④ 강제수(합법 수 1개) → '!!' 안 붙음 ═══════════════════
console.log('\n[4] 강제수 — !! 미부여');
{
  // 흑 Kh8, Ph7 / 백 Ke1, Ra8(체크) — 흑의 합법 수는 Kg7 하나뿐
  const board = emptyBoard();
  put(board, 'e1', 'K', 'white');
  put(board, 'a8', 'R', 'white');
  put(board, 'h8', 'K', 'black');
  put(board, 'h7', 'P', 'black');
  const start = createStateFromBoard(board, { turn: 'black' });

  const legal = getAllLegalMoves(start, 'black');
  check('합법 수가 정확히 1개 (Kg7)', legal.length === 1, legal.length);

  const q = playAndJudge(start, 'h8', 'g7');
  check("강제수 Kg7 → '' (!! 미부여)", q === '', q);
}

// ═══ ⑤ 판정 우선순위 — 순수 함수 단위 테스트 ═════════════════
console.log('\n[5] judgeQuality 우선순위/경계값 (순수 함수)');
{
  // 가상의 랭킹: from/to만 구분되면 충분
  const mv = i => ({ from: [0, i], to: [1, i] });
  const ranked = scores => scores.map((s, i) => ({ move: mv(i), score: s }));

  // ?? 가 ? 보다 우선 (cpLoss 800 → ?? 하나만)
  check("cpLoss 800 → '??' (?보다 우선)",
    judgeQuality(ranked([500, -300]), mv(1), 'white') === '??');

  // 경계값: cpLoss 정확히 300 → '??', 120 → '?', 119 → ''
  check("cpLoss 300 → '??'", judgeQuality(ranked([300, 0]),   mv(1), 'white') === '??');
  check("cpLoss 120 → '?'",  judgeQuality(ranked([120, 0]),   mv(1), 'white') === '?');
  check("cpLoss 119 → ''",   judgeQuality(ranked([119, 0]),   mv(1), 'white') === '');

  // !! 가 ! 보다 우선 (gap 450 → !! 하나만), 경계값 400/150/149
  check("gap 450 → '!!'", judgeQuality(ranked([450, 0]), mv(0), 'white') === '!!');
  check("gap 400 → '!!'", judgeQuality(ranked([400, 0]), mv(0), 'white') === '!!');
  check("gap 200 → '!'",  judgeQuality(ranked([200, 0]), mv(0), 'white') === '!');
  check("gap 149 → ''",   judgeQuality(ranked([149, 0]), mv(0), 'white') === '');

  // 최선수 동점(둘 다 최고점) → ! 없음
  check("동점 최선수 → ''", judgeQuality(ranked([300, 300, 0]), mv(0), 'white') === '');

  // 흑 관점 (점수는 백 기준이므로 부호 반전): 흑이 -500짜리 최선 대신 +300짜리 수 → cpLoss 800
  const blackRanked = [
    { move: mv(0), score: -500 },  // 흑 최선
    { move: mv(1), score:  300 },  // 흑 실수
  ];
  check("흑 관점 cpLoss 800 → '??'", judgeQuality(blackRanked, mv(1), 'black') === '??');
  check("흑 관점 최선수 gap 800 → '!!'", judgeQuality(blackRanked, mv(0), 'black') === '!!');

  // 합법 수 1개 → 항상 ''
  check("합법 수 1개 → ''", judgeQuality(ranked([99999]), mv(0), 'white') === '');
}

// ═══ ⑥ 메이트 성사 수 → '!!' ═════════════════════════════════
console.log('\n[6] 백랭크 메이트 — !!');
{
  // 백 Kg1, Rd1 / 흑 Kg8, Pf7, Pg7, Ph7 — Rd8#만 메이트, 나머지는 평범
  const board = emptyBoard();
  put(board, 'g1', 'K', 'white');
  put(board, 'd1', 'R', 'white');
  put(board, 'g8', 'K', 'black');
  put(board, 'f7', 'P', 'black');
  put(board, 'g7', 'P', 'black');
  put(board, 'h7', 'P', 'black');
  const start = createStateFromBoard(board, { turn: 'white' });

  const q = playAndJudge(start, 'd1', 'd8');
  check("Rd8# → '!!'", q === '!!', q);
}

// ── 결과 ────────────────────────────────────────────────────
console.log('\n──────────────────────────────');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
