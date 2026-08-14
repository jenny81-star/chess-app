/**
 * 리뷰 모드(기보 확인) — 리플레이 핵심 로직 node 테스트
 * 실행: node tests/replay-test.js
 *
 * 검증 대상: ChessReview.buildStates
 *  - 표준 시작 포지션에서 history 리플레이 → 각 시점/최종 포지션 일치
 *  - 캐슬링·앙파상·프로모션이 포함된 기보도 정확히 리플레이
 *  - createStateFromBoard 커스텀 시작 포지션에서도 동일하게 동작
 *  - buildStates가 원본 gameState를 변형하지 않음 (표시 전용)
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
load('src/game/review.js');   // DOM 연결부는 브라우저 전용 가드로 스킵됨

const { createInitialState, createStateFromBoard, cloneState, applyMove, toFEN } = window.ChessBoard;
const { getLegalMoves, updateGameStatus } = window.ChessMoves;
const { buildStates } = window.ChessReview;

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

/** 엔진이 생성한 합법 수(캐슬링/앙파상 플래그 포함)를 찾아 적용 */
function play(state, fromName, toName, promotion) {
  const from = sq(fromName), to = sq(toName);
  const legal = getLegalMoves(state, from[0], from[1]);
  let move = legal.find(m =>
    m.to[0] === to[0] && m.to[1] === to[1] &&
    (promotion ? m.promotion === promotion : true));
  if (!move) throw new Error('illegal move in test: ' + fromName + '-' + toName);
  return applyMove(state, move);
}

function boardFEN(state) { return toFEN(state).split(' ')[0]; }

// ═══ 1. 표준 시작 포지션: 리플레이 == 실제 진행 ══════════════
console.log('\n[1] 표준 시작 — 각 시점 포지션 일치');
{
  // 캐슬링 + 앙파상이 모두 나오는 수순
  const moveList = [
    ['e2', 'e4'], ['g8', 'h6'],
    ['g1', 'f3'], ['b8', 'c6'],
    ['f1', 'c4'], ['a7', 'a6'],
    ['e1', 'g1'],               // 백 킹사이드 캐슬링 O-O
    ['a6', 'a5'],
    ['e4', 'e5'], ['f7', 'f5'],
    ['e5', 'f6'],               // 앙파상 exf6 e.p.
  ];

  // 실제 게임처럼 순서대로 진행하며 각 시점 FEN 기록
  let state = createInitialState();
  const liveFENs = [toFEN(state)];
  for (const [f, t] of moveList) {
    state = play(state, f, t);
    liveFENs.push(toFEN(state));
  }
  const finalState = updateGameStatus(state);

  // buildStates로 리플레이
  const states = buildStates(finalState, null);

  check('시점 개수 = history.length + 1',
    states.length === finalState.history.length + 1);
  check('시점 0 = 표준 초기 배치', toFEN(states[0]) === liveFENs[0]);

  let allMatch = true;
  for (let i = 0; i < liveFENs.length; i++) {
    if (toFEN(states[i]) !== liveFENs[i]) {
      allMatch = false;
      console.log('    mismatch at index ' + i + ':\n      live   ' + liveFENs[i] + '\n      replay ' + toFEN(states[i]));
    }
  }
  check('모든 시점 FEN 일치 (캐슬링·앙파상 포함, 총 ' + liveFENs.length + '개)', allMatch);

  check('마지막 시점 보드 = 최종 gameState.board',
    boardFEN(states[states.length - 1]) === boardFEN(finalState));
  check('마지막 시점은 실제 게임 상태 객체 (status 등 완전 일치)',
    states[states.length - 1] === finalState);

  // 앙파상 리플레이 확인: f6에 백 폰, f5는 비어 있음
  const last = states[states.length - 1];
  const f6 = last.board[2][5], f5 = last.board[3][5];
  check('앙파상 결과 재현: f6 백 폰 / f5 빈 칸',
    !!f6 && f6.type === 'P' && f6.color === 'white' && f5 === null);
}

// ═══ 2. 프로모션 리플레이 (커스텀 포지션) ════════════════════
console.log('\n[2] 프로모션 — history의 promotion 플래그 리플레이');
{
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[7][4] = { type: 'K', color: 'white' };  // Ke1
  board[7][0] = { type: 'K', color: 'black' };  // Ka1 (g8=Q 체크 안 걸리는 위치)
  board[1][6] = { type: 'P', color: 'white' };  // g7 백 폰
  board[2][7] = { type: 'P', color: 'black' };  // h6 흑 폰

  const start = createStateFromBoard(board, { turn: 'white', mode: '2p' });

  let state = cloneState(start);
  state = play(state, 'g7', 'g8', 'Q');   // g8=Q
  state = play(state, 'h6', 'h5');
  const finalState = updateGameStatus(state);

  const states = buildStates(finalState, start);

  check('시점 0 = 커스텀 시작 포지션', boardFEN(states[0]) === boardFEN(start));
  const g8 = states[1].board[0][6];
  check('시점 1: g8에 백 퀸 (프로모션 재현)',
    !!g8 && g8.type === 'Q' && g8.color === 'white');
  check('마지막 시점 보드 = 최종 gameState.board',
    boardFEN(states[states.length - 1]) === boardFEN(finalState));
}

// ═══ 3. createStateFromBoard 커스텀 시작 — 전체 시점 일치 ════
console.log('\n[3] 커스텀 시작 포지션 — 각 시점 일치');
{
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[7][4] = { type: 'K', color: 'white' };
  board[7][7] = { type: 'R', color: 'white' };  // h1 룩 → 캐슬링 가능
  board[0][4] = { type: 'K', color: 'black' };
  board[1][3] = { type: 'P', color: 'black' };  // d7 폰

  const start = createStateFromBoard(board, { turn: 'black', mode: 'ai', difficulty: '중급' });

  let state = cloneState(start);
  const liveFENs = [toFEN(state)];
  for (const [f, t] of [['d7', 'd5'], ['e1', 'g1'], ['d5', 'd4']]) {  // 흑 먼저, 백 O-O
    state = play(state, f, t);
    liveFENs.push(toFEN(state));
  }
  const finalState = updateGameStatus(state);
  const states = buildStates(finalState, start);

  let allMatch = true;
  for (let i = 0; i < liveFENs.length; i++) {
    if (toFEN(states[i]) !== liveFENs[i]) allMatch = false;
  }
  check('모든 시점 FEN 일치 (흑 선공 + 캐슬링, 총 ' + liveFENs.length + '개)', allMatch);
  check('mode/difficulty가 시점 상태에 유지',
    states[1].mode === 'ai' && states[1].difficulty === '중급');
}

// ═══ 4. buildStates는 원본을 변형하지 않음 ═══════════════════
console.log('\n[4] 원본 gameState 보존');
{
  let state = createInitialState();
  state = play(state, 'e2', 'e4');
  state = play(state, 'e7', 'e5');
  const finalState = updateGameStatus(state);

  const fenBefore  = toFEN(finalState);
  const histBefore = JSON.stringify(finalState.history);

  const states = buildStates(finalState, null);
  states.forEach(s => toFEN(s));  // 전 시점 순회(렌더 시뮬레이션)

  check('buildStates 후 최종 FEN 불변', toFEN(finalState) === fenBefore);
  check('buildStates 후 history 불변', JSON.stringify(finalState.history) === histBefore);
  check('중간 시점 상태는 별개 객체 (시점 0 보드 수정해도 원본 무관)', (() => {
    states[0].board[6][4] = null;
    return toFEN(finalState) === fenBefore;
  })());
}

// ── 결과 ────────────────────────────────────────────────────
console.log('\n──────────────────────────────');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
