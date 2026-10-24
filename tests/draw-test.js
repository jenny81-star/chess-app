/**
 * 무승부 판정 — 3회 동형 / 기물 부족 node 테스트
 * 실행: node tests/draw-test.js
 *
 * 검증 대상: ChessMoves.updateGameStatus / isInsufficientMaterial / isThreefoldRepetition,
 *           ChessBoard.positionKey, AI 탐색이 positionKeys를 건드리지 않음
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

global.window = globalThis;
function load(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  vm.runInThisContext(src, { filename: rel });
}
load('src/engine/board.js');
load('src/engine/moves.js');
load('src/engine/evaluator.js');
load('src/engine/ai.js');

const { createInitialState, createStateFromBoard, applyMove, positionKey } = window.ChessBoard;
const { getLegalMoves, updateGameStatus, isInsufficientMaterial } = window.ChessMoves;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else      { fail++; console.log('  FAIL ' + name); }
}

const FILES = 'abcdefgh';
function sq(name) { return [8 - parseInt(name[1], 10), FILES.indexOf(name[0])]; }

// 'Ke1 Nb1 ...' (대문자=백, 소문자=흑) → board
function boardOf(spec) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const tok of spec.split(' ')) {
    const t = tok[0];
    const [r, c] = sq(tok.slice(1));
    board[r][c] = { type: t.toUpperCase(), color: t === t.toUpperCase() ? 'white' : 'black' };
  }
  return board;
}

function play(state, from, to) {
  const m = getLegalMoves(state, ...sq(from)).find(m => m.to[0] === sq(to)[0] && m.to[1] === sq(to)[1]);
  if (!m) throw new Error('illegal ' + from + to);
  return updateGameStatus(applyMove(state, m));
}

// ── 기물 부족 ────────────────────────────────────────────────
console.log('기물 부족');
check('킹 vs 킹',                    isInsufficientMaterial(boardOf('Ke1 ke8')));
check('킹+비숍 vs 킹',               isInsufficientMaterial(boardOf('Ke1 Bc1 ke8')));
check('킹+나이트 vs 킹',             isInsufficientMaterial(boardOf('Ke1 ke8 nb8')));
check('킹+나이트 2개 vs 킹',         isInsufficientMaterial(boardOf('Ke1 Nb1 Ng1 ke8')));
check('킹+비숍 vs 킹+비숍 (같은 색 칸)', isInsufficientMaterial(boardOf('Ke1 Bc1 ke8 bf8')));
check('킹+비숍 vs 킹+비숍 (다른 색 칸) 아님', !isInsufficientMaterial(boardOf('Ke1 Bc1 ke8 bc8')));
check('킹+나이트 vs 킹+나이트 아님',  !isInsufficientMaterial(boardOf('Ke1 Nb1 ke8 nb8')));
check('킹+룩 vs 킹 아님',            !isInsufficientMaterial(boardOf('Ke1 Ra1 ke8')));
check('킹+폰 vs 킹 아님',            !isInsufficientMaterial(boardOf('Ke1 Pe2 ke8')));
check('킹+나이트 2개 vs 킹+폰 아님', !isInsufficientMaterial(boardOf('Ke1 Nb1 Ng1 ke8 pa7')));

{
  const s = updateGameStatus(createStateFromBoard(boardOf('Ke1 ke8')));
  check('킹 vs 킹 시작 → status draw / insufficient', s.status === 'draw' && s.drawReason === 'insufficient');
}
{
  // 백 룩이 마지막 흑 나이트를 잡지 않고, 흑 킹이 백 룩을 잡아 킹+나이트 2개 vs 킹이 되는 경우
  let s = createStateFromBoard(boardOf('Ke1 Nb1 Ng1 Rd7 ke8'), { turn: 'black' });
  s = updateGameStatus(s);
  check('잡기 전에는 진행 중', s.status === 'playing' || s.status === 'check');
  s = play(s, 'e8', 'd7');
  check('룩을 잡아 킹+나이트 2개 vs 킹 → 무승부', s.status === 'draw' && s.drawReason === 'insufficient');
}

// ── 3회 동형 ─────────────────────────────────────────────────
console.log('3회 동형');
{
  let s = createInitialState();
  const shuffle = [['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']];
  let statuses = [];
  for (let round = 0; round < 2; round++) {
    for (const [f, t] of shuffle) { s = play(s, f, t); statuses.push(s.status); }
  }
  check('7수째까지는 무승부 아님', statuses.slice(0, 7).every(st => st === 'playing'));
  check('8수째(시작 포지션 3번째) → 3회 동형 무승부', s.status === 'draw' && s.drawReason === 'repetition');
  check('positionKeys 길이 = 수 + 1', s.positionKeys.length === 9);
}
{
  const b = boardOf('Ke1 Nb1 ke8');
  const w = createStateFromBoard(b, { turn: 'white' });
  const k = createStateFromBoard(b, { turn: 'black' });
  check('같은 배치라도 차례가 다르면 키가 다름', positionKey(w) !== positionKey(k));
}
{
  // 앙파상: 잡을 폰이 없으면 키에 포함되지 않음
  let s = createInitialState();
  s = play(s, 'e2', 'e4');
  check('1.e4 후 잡을 폰이 없으면 앙파상 칸 무시', !/e/.test(positionKey(s).slice(65)));
  const b = boardOf('Ke1 Pe2 ke8 pd4');
  let t = updateGameStatus(createStateFromBoard(b));
  t = play(t, 'e2', 'e4');
  check('옆에 흑 폰이 있으면 앙파상 칸 포함', /e/.test(positionKey(t).slice(65)));
}
{
  // 캐슬링 권리가 달라지면 같은 포지션이 아님
  let s = createInitialState();
  const start = positionKey(s);
  for (const [f, t] of [['g1','f3'],['g8','f6'],['h1','g1'],['f6','g8'],['g1','h1'],['b8','c6'],['f3','g1'],['c6','b8']]) {
    s = play(s, f, t);
  }
  check('룩이 움직였다 돌아오면 캐슬링 권리가 달라 시작 포지션과 다름', positionKey(s) !== start);
}

// ── AI 탐색은 positionKeys를 건드리지 않음 ───────────────────
console.log('AI 연동');
{
  let s = createInitialState();
  s = play(s, 'e2', 'e4');
  const before = s.positionKeys.slice();
  const ranked = window.ChessAI.rankMovesSync(s, 2, s.turn);
  check('AI 탐색 결과 존재', ranked.length > 0);
  check('AI 탐색 후 positionKeys 그대로', JSON.stringify(before) === JSON.stringify(s.positionKeys));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
