/**
 * 기물 배치 모드(에디터) — 엔진 레벨 node 테스트
 * 실행: node tests/editor-engine.test.js
 *
 * 검증 대상:
 *  - ChessBoard.createStateFromBoard: 캐슬링 권리 유도, 기본 필드
 *  - ChessEditor.validatePlacement: 폰 1·8랭크, 킹 1개, 인접 킹, 폰 8개/총 16개 제한
 *  - ChessEditor.validateStart: 킹 존재, 차례 아닌 쪽 체크 차단, 메이트 포지션 허용
 *  - moves.js 캐슬링 룩 부재 버그 수정: 룩 없는 포지션에서 캐슬링 수 미생성
 *  - toFEN이 커스텀 포지션에서 예외 없이 동작
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
load('src/ui/editor.js');   // DOM 초기화는 open() 전까지 실행되지 않음

const { createInitialState, createStateFromBoard, applyMove, toFEN } = window.ChessBoard;
const { getLegalMoves, getAllLegalMoves, isCheckmate, isStalemate } = window.ChessMoves;
const { validatePlacement, validateStart, createEmptyBoard } = window.ChessEditor;

// ── 테스트 헬퍼 ─────────────────────────────────────────────
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else      { fail++; console.log('  FAIL ' + name); }
}
function put(board, r, c, type, color) {
  board[r][c] = { type, color };
  return board;
}
// 좌표 참고: row 0 = 8랭크, row 7 = 1랭크 / col 0 = a파일

// ═══ 1. createStateFromBoard: 캐슬링 권리 유도 ═══════════════
console.log('\n[1] createStateFromBoard — 캐슬링 유도');
{
  const std = createStateFromBoard(createInitialState().board);
  check('표준 배치 → 캐슬링 4종 모두 true',
    std.castlingRights.whiteKingSide && std.castlingRights.whiteQueenSide &&
    std.castlingRights.blackKingSide && std.castlingRights.blackQueenSide);

  const noRooks = createEmptyBoard();
  put(noRooks, 7, 4, 'K', 'white');
  put(noRooks, 0, 4, 'K', 'black');
  const s2 = createStateFromBoard(noRooks);
  check('룩 없음 → 캐슬링 4종 모두 false',
    !s2.castlingRights.whiteKingSide && !s2.castlingRights.whiteQueenSide &&
    !s2.castlingRights.blackKingSide && !s2.castlingRights.blackQueenSide);

  const kingOff = createEmptyBoard();
  put(kingOff, 6, 4, 'K', 'white');   // 킹이 e2 (홈 아님)
  put(kingOff, 7, 0, 'R', 'white');
  put(kingOff, 7, 7, 'R', 'white');
  put(kingOff, 0, 4, 'K', 'black');
  const s3 = createStateFromBoard(kingOff);
  check('킹이 홈 칸 아님 → 룩 있어도 백 캐슬링 false',
    !s3.castlingRights.whiteKingSide && !s3.castlingRights.whiteQueenSide);

  const oneRook = createEmptyBoard();
  put(oneRook, 7, 4, 'K', 'white');
  put(oneRook, 7, 7, 'R', 'white');   // h1만
  put(oneRook, 0, 4, 'K', 'black');
  const s4 = createStateFromBoard(oneRook);
  check('h1 룩만 → 킹사이드만 true',
    s4.castlingRights.whiteKingSide && !s4.castlingRights.whiteQueenSide);

  check('기본 필드: enPassant null / halfMove 0 / fullMove 1 / history []',
    s4.enPassantTarget === null && s4.halfMoveClock === 0 &&
    s4.fullMoveNumber === 1 && s4.history.length === 0 &&
    s4.capturedPieces.white.length === 0 && s4.capturedPieces.black.length === 0);

  const s5 = createStateFromBoard(oneRook, { turn: 'black', mode: '2p', difficulty: '고급' });
  check('options: turn/mode/difficulty 반영',
    s5.turn === 'black' && s5.mode === '2p' && s5.difficulty === '고급');
}

// ═══ 2. validatePlacement ═══════════════════════════════════
console.log('\n[2] validatePlacement — 배치 시점 검증');
{
  const b = createEmptyBoard();
  check('폰 8랭크(row 0) 배치 차단',
    validatePlacement(b, 0, 3, { type: 'P', color: 'white' }) !== null);
  check('폰 1랭크(row 7) 배치 차단',
    validatePlacement(b, 7, 3, { type: 'P', color: 'black' }) !== null);
  check('폰 2~7랭크 배치 허용',
    validatePlacement(b, 4, 3, { type: 'P', color: 'white' }) === null);

  const oneKing = put(createEmptyBoard(), 7, 4, 'K', 'white');
  check('같은 색 두 번째 킹 차단',
    validatePlacement(oneKing, 5, 5, { type: 'K', color: 'white' }) !== null);
  check('기존 킹 칸에 같은 킹 다시 놓기(교체)는 허용',
    validatePlacement(oneKing, 7, 4, { type: 'K', color: 'white' }) === null);
  check('다른 색 킹은 (떨어져 있으면) 허용',
    validatePlacement(oneKing, 0, 4, { type: 'K', color: 'black' }) === null);

  check('인접 킹 배치 차단 (e1 백킹 옆 d2에 흑킹)',
    validatePlacement(oneKing, 6, 3, { type: 'K', color: 'black' }) !== null);

  const eightPawns = createEmptyBoard();
  for (let c = 0; c < 8; c++) put(eightPawns, 6, c, 'P', 'white');
  check('9번째 폰 차단',
    validatePlacement(eightPawns, 5, 0, { type: 'P', color: 'white' }) !== null);
  check('폰이 8개여도 다른 기물은 허용',
    validatePlacement(eightPawns, 5, 0, { type: 'N', color: 'white' }) === null);
  check('폰 8개 중 하나를 교체하는 폰 배치는 허용',
    validatePlacement(eightPawns, 6, 0, { type: 'P', color: 'white' }) === null);

  const sixteen = createEmptyBoard();       // 백 16개 채우기
  for (let c = 0; c < 8; c++) {
    put(sixteen, 6, c, 'P', 'white');
    put(sixteen, 7, c, ['R','N','B','Q','K','B','N','R'][c], 'white');
  }
  check('17번째 기물 차단',
    validatePlacement(sixteen, 4, 4, { type: 'Q', color: 'white' }) !== null);
  check('16개 상태에서 기존 기물 교체는 허용',
    validatePlacement(sixteen, 6, 0, { type: 'N', color: 'white' }) === null);
  check('상대 색 기물은 16개와 무관하게 허용',
    validatePlacement(sixteen, 2, 4, { type: 'Q', color: 'black' }) === null);
}

// ═══ 3. validateStart ═══════════════════════════════════════
console.log('\n[3] validateStart — 시작 시점 검증');
{
  const noBlackKing = put(createEmptyBoard(), 7, 4, 'K', 'white');
  check('흑 킹 없음 → 시작 불가', validateStart(noBlackKing, 'white') !== null);
  check('양쪽 킹 없음 → 시작 불가', validateStart(createEmptyBoard(), 'white') !== null);

  // 흑 킹이 백 룩에게 체크당하는 포지션
  const blackInCheck = createEmptyBoard();
  put(blackInCheck, 7, 4, 'K', 'white');
  put(blackInCheck, 0, 4, 'K', 'black');
  put(blackInCheck, 0, 0, 'R', 'white');   // a8 백 룩 → e8 흑 킹 체크
  check('백 차례인데 흑(차례 아님)이 체크 → 시작 불가',
    validateStart(blackInCheck, 'white') !== null);
  check('같은 포지션이라도 흑 차례면 시작 허용 (체크 상태로 시작)',
    validateStart(blackInCheck, 'black') === null);

  // 백-랭크 메이트: 흑 차례, 흑이 즉시 체크메이트 → 허용되어야 함
  const backRankMate = createEmptyBoard();
  put(backRankMate, 0, 6, 'K', 'black');   // g8
  put(backRankMate, 1, 5, 'P', 'black');   // f7
  put(backRankMate, 1, 6, 'P', 'black');   // g7
  put(backRankMate, 1, 7, 'P', 'black');   // h7
  put(backRankMate, 0, 0, 'R', 'white');   // a8 룩
  put(backRankMate, 7, 4, 'K', 'white');   // e1
  check('시작 즉시 체크메이트 포지션 허용 (책 메이트 문제 재현)',
    validateStart(backRankMate, 'black') === null);
  const mateState = createStateFromBoard(backRankMate, { turn: 'black' });
  check('그 포지션은 실제로 체크메이트로 판정됨', isCheckmate(mateState, 'black'));

  // 스테일메이트 포지션도 허용
  const stale = createEmptyBoard();
  put(stale, 0, 7, 'K', 'black');   // h8
  put(stale, 1, 5, 'Q', 'white');   // f7
  put(stale, 2, 6, 'K', 'white');   // g6
  check('시작 즉시 스테일메이트 포지션 허용', validateStart(stale, 'black') === null);
  const staleState = createStateFromBoard(stale, { turn: 'black' });
  check('그 포지션은 실제로 스테일메이트로 판정됨', isStalemate(staleState, 'black'));
}

// ═══ 4. 캐슬링 룩 부재 버그 수정 (moves.js) ══════════════════
console.log('\n[4] 캐슬링 룩 부재 버그 — 수정 확인');
{
  // 룩이 없는데 castlingRights가 true인 비정상 상태 (구버전 저장 등)
  const board = createEmptyBoard();
  put(board, 7, 4, 'K', 'white');
  put(board, 0, 4, 'K', 'black');
  const badState = {
    board,
    turn: 'white',
    castlingRights: { whiteKingSide: true, whiteQueenSide: true, blackKingSide: true, blackQueenSide: true },
    enPassantTarget: null, halfMoveClock: 0, fullMoveNumber: 1,
    history: [], capturedPieces: { white: [], black: [] },
    status: 'playing', difficulty: '중급', mode: 'ai',
  };
  const kingMoves = getLegalMoves(badState, 7, 4);
  check('룩 없는 포지션에서 캐슬링 수가 생성되지 않음',
    kingMoves.every(m => !m.castling) && kingMoves.length > 0);

  let fenOk = true;
  try {
    for (const m of getAllLegalMoves(badState, 'white')) {
      toFEN(applyMove(badState, m));   // 가짜 룩({})이 생기면 여기서 TypeError
    }
  } catch (e) { fenOk = false; }
  check('모든 합법 수 적용 후 toFEN 예외 없음 (가짜 기물 미생성)', fenOk);

  // 정상 캐슬링은 여전히 동작해야 함 (회귀 방지)
  const withRooks = createEmptyBoard();
  put(withRooks, 7, 4, 'K', 'white');
  put(withRooks, 7, 0, 'R', 'white');
  put(withRooks, 7, 7, 'R', 'white');
  put(withRooks, 0, 4, 'K', 'black');
  const okState = createStateFromBoard(withRooks);
  const okKingMoves = getLegalMoves(okState, 7, 4);
  check('룩이 있으면 킹사이드+퀸사이드 캐슬링 모두 생성',
    okKingMoves.some(m => m.castling === 'kingside') &&
    okKingMoves.some(m => m.castling === 'queenside'));

  const afterCastle = applyMove(okState, okKingMoves.find(m => m.castling === 'kingside'));
  check('캐슬링 적용 후 toFEN 정상',
    typeof toFEN(afterCastle) === 'string' && toFEN(afterCastle).indexOf('undefined') === -1);
}

// ═══ 5. 커스텀 포지션 toFEN ═════════════════════════════════
console.log('\n[5] 커스텀 포지션 toFEN');
{
  const sparse = createEmptyBoard();
  put(sparse, 7, 4, 'K', 'white');
  put(sparse, 0, 4, 'K', 'black');
  put(sparse, 3, 3, 'Q', 'white');
  const st = createStateFromBoard(sparse, { turn: 'black' });
  let fen = null, threw = false;
  try { fen = toFEN(st); } catch (e) { threw = true; }
  check('희소 포지션 toFEN 예외 없음', !threw);
  check('FEN 캐슬링 필드가 "-" (룩 없음)', !threw && fen.split(' ')[2] === '-');
  check('FEN 차례 필드가 "b"', !threw && fen.split(' ')[1] === 'b');
}

// ── 결과 ────────────────────────────────────────────────────
console.log('\n═══ 결과: ' + pass + ' 통과 / ' + fail + ' 실패 ═══');
process.exit(fail === 0 ? 0 : 1);
