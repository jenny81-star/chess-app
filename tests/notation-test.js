/**
 * 기보 표기 체크(+)/체크메이트(#) 접미사 — node 테스트
 * 실행: node tests/notation-test.js
 *
 * 검증 대상: ChessRenderer.buildNotations(startState, history)
 *  - 스콜라스 메이트 수순 마지막 수 → 'Qxf7#'
 *  - 체크지만 메이트 아닌 수 → 'Qxf7+' (접미사 '+')
 *  - 체크 아닌 수엔 접미사 없음
 *  - 커스텀 시작 포지션(createStateFromBoard)에서도 정상 동작
 *  - 캐슬링 + 체크 → 'O-O+'
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
load('src/ui/renderer.js');   // DOM 접근은 모두 함수 내부라 로드 시점엔 document 불필요

const { createInitialState, createStateFromBoard } = window.ChessBoard;
const { getLegalMoves } = window.ChessMoves;
const { buildNotations, historyEntryToNotation } = window.ChessRenderer;

// ── 테스트 헬퍼 ─────────────────────────────────────────────
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else      { fail++; console.log('  FAIL ' + name); }
}

const FILES = 'abcdefgh';
function sq(name) {   // 'e2' → [6, 4]
  return [8 - parseInt(name[1], 10), FILES.indexOf(name[0])];
}

/** 엔진이 생성한 합법 수(캐슬링/앙파상/프로모션 플래그 포함)를 찾아 적용 */
function play(state, fromName, toName, promotion) {
  const { applyMove } = window.ChessBoard;
  const from = sq(fromName), to = sq(toName);
  const legal = getLegalMoves(state, from[0], from[1]);
  let move = legal.find(m =>
    m.to[0] === to[0] && m.to[1] === to[1] &&
    (promotion ? m.promotion === promotion : true));
  if (!move) throw new Error('illegal move in test: ' + fromName + '-' + toName);
  return applyMove(state, move);
}

// ═══ 1. 스콜라스 메이트: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7# ═════
console.log('\n[1] 스콜라스 메이트 — 마지막 수 Qxf7#');
{
  let state = createInitialState();
  const moveList = [
    ['e2', 'e4'], ['e7', 'e5'],
    ['f1', 'c4'], ['b8', 'c6'],
    ['d1', 'h5'], ['g8', 'f6'],
    ['h5', 'f7'],   // Qxf7#
  ];
  for (const [f, t] of moveList) state = play(state, f, t);

  const notations = buildNotations(null, state.history);
  check('총 7수 표기 생성', notations.length === 7);
  check('마지막 수 = Qxf7#', notations[6] === 'Qxf7#');
  check('그 이전 수들은 체크/메이트 접미사 없음',
    notations.slice(0, 6).every(n => n.indexOf('+') === -1 && n.indexOf('#') === -1));
}

// ═══ 2. 체크지만 메이트 아님: 1.e4 e5 2.Qh5 Nc6 3.Qxf7+ ══════════
console.log('\n[2] 체크(메이트 아님) — Qxf7+');
{
  let state = createInitialState();
  const moveList = [
    ['e2', 'e4'], ['e7', 'e5'],
    ['d1', 'h5'], ['b8', 'c6'],
    ['h5', 'f7'],   // Qxf7+ (킹이 잡을 수 있어 메이트 아님)
  ];
  for (const [f, t] of moveList) state = play(state, f, t);

  const notations = buildNotations(null, state.history);
  check('마지막 수 = Qxf7+ (메이트 아님)', notations[4] === 'Qxf7+');
}

// ═══ 3. 커스텀 시작 포지션 + 캐슬링 체크 → O-O+ ══════════════════
console.log('\n[3] 커스텀 시작 포지션 — 캐슬링 체크 O-O+');
{
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[7][4] = { type: 'K', color: 'white' };  // Ke1
  board[7][7] = { type: 'R', color: 'white' };  // Rh1
  board[0][5] = { type: 'K', color: 'black' };  // Kf8 (f-파일 위)

  const start = createStateFromBoard(board, { turn: 'white' });
  check('캐슬링 권리(백 킹사이드) 유도됨', start.castlingRights.whiteKingSide === true);

  let state = start;
  const legal = getLegalMoves(state, 7, 4);
  const castleMove = legal.find(m => m.castling === 'kingside');
  check('백 킹사이드 캐슬링이 합법 수로 생성됨', !!castleMove);
  state = window.ChessBoard.applyMove(state, castleMove);

  const notations = buildNotations(start, state.history);
  check('캐슬링 + 체크 표기 = O-O+', notations[0] === 'O-O+');
}

// ═══ 4. 체크 아닌 일반 수엔 접미사 없음 ══════════════════════════
console.log('\n[4] 일반 수 — 접미사 없음');
{
  let state = createInitialState();
  state = play(state, 'e2', 'e4');
  state = play(state, 'e7', 'e5');
  const notations = buildNotations(null, state.history);
  check("1.e4 표기 = 'e4' (접미사 없음)", notations[0] === 'e4');
  check("1...e5 표기 = 'e5' (접미사 없음)", notations[1] === 'e5');
}

// ═══ 5. buildNotations는 원본 history/entry를 변형하지 않음 ═══════
console.log('\n[5] 원본 history 보존');
{
  let state = createInitialState();
  state = play(state, 'e2', 'e4');
  state = play(state, 'e7', 'e5');
  const histBefore = JSON.stringify(state.history);
  buildNotations(null, state.history);
  check('buildNotations 후 history 불변', JSON.stringify(state.history) === histBefore);
}

// ═══ 6. 기보 행 구성 — 흑 선수면 '1...' 행 ═════════════════════
console.log('\n[6] 기보 행 구성 (buildMoveRows)');
{
  const { buildMoveRows } = window.ChessRenderer;
  const rowsW = buildMoveRows(null, 3);
  check('백 선수: 1. (0,1) / 2. (2,-)',
    JSON.stringify(rowsW) === JSON.stringify([
      { label: '1.', white: 0, black: 1 },
      { label: '2.', white: 2, black: -1 },
    ]));

  const blackStart = { turn: 'black', fullMoveNumber: 1 };
  const rowsB = buildMoveRows(blackStart, 4);
  check("흑 선수: 1... (-,0) / 2. (1,2) / 3. (3,-)",
    JSON.stringify(rowsB) === JSON.stringify([
      { label: '1...', white: -1, black: 0 },
      { label: '2.',   white: 1,  black: 2 },
      { label: '3.',   white: 3,  black: -1 },
    ]));
  check('흑 선수라도 수가 없으면 행 없음', buildMoveRows(blackStart, 0).length === 0);
}

// ── 결과 ────────────────────────────────────────────────────
console.log('\n──────────────────────────────');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
