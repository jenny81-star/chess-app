/**
 * Stockfish 브리지 순수 함수 node 테스트
 * 실행: node tests/stockfish-bridge-test.js
 *
 * 검증 대상: ChessStockfish.moveToUci / uciToMove / parseInfo
 *  (워커·엔진 자체는 브라우저 전용 — node에서는 로드만 하고 띄우지 않음)
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
load('src/engine/stockfish.js');

const { moveToUci, uciToMove, parseInfo } = window.ChessStockfish;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else      { fail++; console.log('  FAIL ' + name); }
}

console.log('UCI 변환');
check('e2e4 → from [6,4] to [4,4]', JSON.stringify(uciToMove('e2e4')) === JSON.stringify({ from: [6, 4], to: [4, 4] }));
check('[6,4]→[4,4] → e2e4', moveToUci({ from: [6, 4], to: [4, 4] }) === 'e2e4');
check('프로모션 e7e8q → promotion Q', uciToMove('e7e8q').promotion === 'Q');
check('프로모션 왕복', moveToUci(uciToMove('a2a1n')) === 'a2a1n');
check('캐슬링 e1g1 (킹 이동으로 표현)', moveToUci({ from: [7, 4], to: [7, 6], castling: 'kingside' }) === 'e1g1');
check('(none)/빈 값 → null', uciToMove('(none)') === null && uciToMove('') === null);

console.log('info 파싱');
{
  const i = parseInfo('info depth 12 seldepth 18 multipv 2 score cp -35 nodes 12345 nps 100000 time 120 pv e7e5 g1f3 b8c6');
  check('depth/multipv/score', i.depth === 12 && i.multipv === 2 && i.score === -35);
  check('pv 첫 수', i.pv[0] === 'e7e5' && i.pv.length === 3);
}
{
  const m = parseInfo('info depth 10 score mate 3 pv d1h5 g7g6 h5e5');
  check('메이트 3 → 200000-3, multipv 기본 1', m.score === 199997 && m.multipv === 1);
  const n = parseInfo('info depth 10 score mate -2 pv e8d8 d1d7');
  check('메이트 -2 → -200000+2', n.score === -199998);
}
check('bound 값은 무시', parseInfo('info depth 9 score cp 20 lowerbound pv e2e4') === null);
check('pv 없는 info 무시', parseInfo('info string NNUE evaluation enabled') === null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
