/**
 * ai-variety-test.js
 *
 * ai.js의 오프닝 다양화(epsilon-window 가중 랜덤) 수정을 검증하는 node 스크립트.
 * ai.js 외의 엔진 파일(board.js/moves.js/evaluator.js)은 수정하지 않고 그대로
 * 로드하며, window 전역을 흉내 내어 브라우저와 동일한 방식으로 IIFE들을 로드한다.
 *
 * 실행: node tests/ai-variety-test.js
 */
'use strict';

// ── 브라우저 전역(window) 흉내 ────────────────────────────────
// board.js/moves.js/evaluator.js/ai.js는 모두 `window.X = ...` 형태로
// 전역에 자신을 노출하므로, node의 global 객체를 window로 그대로 사용한다.
global.window = global;

const path = require('path');
require(path.join(__dirname, '..', 'src', 'engine', 'board.js'));
require(path.join(__dirname, '..', 'src', 'engine', 'moves.js'));
require(path.join(__dirname, '..', 'src', 'engine', 'evaluator.js'));
require(path.join(__dirname, '..', 'src', 'engine', 'ai.js'));

const { createInitialState, applyMove } = window.ChessBoard;
const AI = window.ChessAI;

// 테스트 실행 속도를 위해 thinkTime(인위적 대기)만 런타임에 0으로 오버라이드한다.
// ai.js 파일 자체는 건드리지 않는다 — DIFFICULTY_CONFIG 객체 값만 테스트 프로세스
// 안에서 조정하는 것이며, 프로덕션 코드의 대기 로직(setTimeout)은 그대로 남아있다.
for (const key of Object.keys(AI.DIFFICULTY_CONFIG)) {
  AI.DIFFICULTY_CONFIG[key].thinkTime = 0;
}

// ── 유틸 ──────────────────────────────────────────────────────

function squareName([r, c]) {
  const files = 'abcdefgh';
  return files[c] + (8 - r);
}

function moveNotation(state, move) {
  if (move.castling === 'kingside')  return 'O-O';
  if (move.castling === 'queenside') return 'O-O-O';
  const piece = state.board[move.from[0]][move.from[1]];
  const letter = piece.type === 'P' ? '' : piece.type;
  const isCapture = !!state.board[move.to[0]][move.to[1]] || move.enPassant;
  const promo = move.promotion ? '=' + move.promotion : '';
  return `${letter}${isCapture ? 'x' : ''}${squareName(move.to)}${promo}`;
}

async function sampleMoves(state, difficulty, n) {
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const move = await AI.getBestMove(state, difficulty);
    const notation = moveNotation(state, move);
    counts.set(notation, (counts.get(notation) || 0) + 1);
  }
  return counts;
}

function formatCounts(counts, n) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([mv, c]) => `${mv}:${c}/${n}`)
    .join(', ');
}

// ── 포지션 생성 ───────────────────────────────────────────────

function afterWhiteE4() {
  const initial = createInitialState();
  // e2-e4
  return applyMove(initial, { from: [6, 4], to: [4, 4] });
}

function emptyState() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  return {
    board,
    turn: 'black',
    castlingRights: {
      whiteKingSide: false, whiteQueenSide: false,
      blackKingSide: false, blackQueenSide: false,
    },
    enPassantTarget: null,
    halfMoveClock: 0,
    fullMoveNumber: 10, // 오프닝 구간(<=6) 밖 — 일반 mistakeRate 로직 검증용
    history: [],
    capturedPieces: { white: [], black: [] },
    status: 'playing',
    difficulty: '마스터',
    mode: 'ai',
  };
}

// 흑이 공짜로 백 퀸을 잡을 수 있는 중반 전술 포지션:
// 백 퀸 d4(무방비), 흑 룩 d8, 양쪽 킹은 관계없는 곳에.
function hangingQueenState() {
  const state = emptyState();
  const { board } = state;
  board[0][3] = { type: 'R', color: 'black' }; // Rd8
  board[0][4] = { type: 'K', color: 'black' }; // Ke8
  board[7][4] = { type: 'K', color: 'white' }; // Ke1
  board[4][3] = { type: 'Q', color: 'white' }; // Qd4 (무방비)
  return state;
}

// ── 메인 ─────────────────────────────────────────────────────

async function main() {
  const N = 30;
  let allPass = true;

  console.log('='.repeat(70));
  console.log('테스트 1: 다양성 — 1.e4 이후 흑 응수 (난이도별 %d회 샘플링)', N);
  console.log('='.repeat(70));

  const stateAfterE4 = afterWhiteE4();
  const diversityResults = {};
  for (const difficulty of ['입문', '중급', '마스터']) {
    const counts = await sampleMoves(stateAfterE4, difficulty, N);
    diversityResults[difficulty] = counts;
    console.log(`\n[${difficulty}] 서로 다른 수: ${counts.size}종`);
    console.log(`  ${formatCounts(counts, N)}`);
  }

  console.log();
  for (const difficulty of ['입문', '중급', '마스터']) {
    const counts = diversityResults[difficulty];
    const distinct = counts.size;
    const ok = distinct >= 3;
    if (!ok) allPass = false;
    const nc6Only = distinct === 1 && (counts.has('Nc6') || counts.has('Nf6'));
    console.log(
      `[판정] ${difficulty}: 서로 다른 수 ${distinct}종 (>=3 기대) → ${ok ? 'PASS' : 'FAIL'}` +
      (nc6Only ? '  (여전히 Nc6/Nf6 독점!)' : '')
    );
  }

  console.log();
  console.log('='.repeat(70));
  console.log('테스트 2: 강함 유지 — 퀸 공짜로 잡는 전술 포지션 (마스터, %d회)', N);
  console.log('='.repeat(70));

  const tacticalState = hangingQueenState();
  const tacticalCounts = await sampleMoves(tacticalState, '마스터', N);
  console.log(`\n[마스터] ${formatCounts(tacticalCounts, N)}`);
  const rxd4Count = tacticalCounts.get('Rxd4') || 0;
  const strengthOk = rxd4Count === N;
  if (!strengthOk) allPass = false;
  console.log(
    `[판정] 마스터가 Rxd4를 ${rxd4Count}/${N}회 선택 → ${strengthOk ? 'PASS' : 'FAIL'}`
  );

  console.log();
  console.log('='.repeat(70));
  console.log('테스트 3: 힌트 결정론 — 같은 포지션에서 getHintMove 5회 호출');
  console.log('='.repeat(70));

  const hintResults = [];
  for (let i = 0; i < 5; i++) {
    const move = await AI.getHintMove(stateAfterE4);
    hintResults.push(moveNotation(stateAfterE4, move));
  }
  console.log(`\n힌트 결과: ${hintResults.join(', ')}`);
  const hintDeterministic = hintResults.every(m => m === hintResults[0]);
  if (!hintDeterministic) allPass = false;
  console.log(`[판정] 힌트 5회 모두 동일 → ${hintDeterministic ? 'PASS' : 'FAIL'}`);

  console.log();
  console.log('='.repeat(70));
  console.log(allPass ? '전체 결과: PASS' : '전체 결과: FAIL');
  console.log('='.repeat(70));

  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
