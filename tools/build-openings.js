/**
 * Lichess 오프닝 TSV → src/data/openings-data.js 변환 (한 번만 실행)
 * 실행: node tools/build-openings.js
 *
 * 입력: tools/openings-src/{a..e}.tsv (eco \t name \t pgn) — lichess-org/chess-openings, CC0
 * 출력: window.ChessOpeningsData = { "<압축 포지션 키>": "ECO|Name", ... }
 *
 * PGN의 SAN 수를 엔진 합법 수와 대조해 리플레이한다
 * (기물 종류 + 도착 칸 + 출발 파일/랭크 구분자 + 프로모션).
 * 같은 포지션이 여러 줄에 나오면 수순이 짧은(더 일반적인) 줄의 이름을 쓴다.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

global.window = globalThis;
function load(rel) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), { filename: rel });
}
load('src/engine/board.js');
load('src/engine/moves.js');
load('src/game/openings.js');

const { createInitialState, applyMove, positionKey } = window.ChessBoard;
const { getAllLegalMoves } = window.ChessMoves;
const { compactKey } = window.ChessOpenings;

const FILES = 'abcdefgh';

// SAN 한 수 → 합법 수 객체 (없거나 모호하면 null)
function sanToMove(state, san) {
  san = san.replace(/[+#!?]+$/, '');
  const legal = getAllLegalMoves(state, state.turn);
  if (san === 'O-O' || san === 'O-O-O') {
    const side = san === 'O-O' ? 'kingside' : 'queenside';
    return legal.find(m => m.castling === side) || null;
  }
  const m = san.match(/^([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])(?:=([QRBN]))?$/);
  if (!m) return null;
  const type = m[1] || 'P';
  const toC = FILES.indexOf(m[4][0]), toR = 8 - parseInt(m[4][1], 10);
  const cands = legal.filter(mv => {
    const p = state.board[mv.from[0]][mv.from[1]];
    if (p.type !== type || mv.to[0] !== toR || mv.to[1] !== toC) return false;
    if (m[2] && mv.from[1] !== FILES.indexOf(m[2])) return false;
    if (m[3] && mv.from[0] !== 8 - parseInt(m[3], 10)) return false;
    if ((mv.promotion || null) !== (m[5] || null)) return false;
    return true;
  });
  return cands.length === 1 ? cands[0] : null;
}

function pgnToTokens(pgn) {
  return pgn.split(/\s+/).filter(t => t && !/^\d+\.+$/.test(t));
}

const out = {};      // key → { val, plies }
let lines = 0, failed = 0;

for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = fs.readFileSync(path.join(__dirname, 'openings-src', f + '.tsv'), 'utf8').split(/\r?\n/);
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].trim()) continue;
    const [eco, name, pgn] = rows[i].split('\t');
    lines++;
    let s = createInitialState();
    let ok = true;
    const tokens = pgnToTokens(pgn);
    for (const t of tokens) {
      const mv = sanToMove(s, t);
      if (!mv) { ok = false; console.warn('SAN 실패:', eco, name, '→', t); break; }
      s = applyMove(s, mv);
    }
    if (!ok) { failed++; continue; }
    const key = compactKey(positionKey(s));
    const prev = out[key];
    if (!prev || tokens.length < prev.plies) out[key] = { val: eco + '|' + name, plies: tokens.length };
  }
}

const data = {};
for (const k of Object.keys(out)) data[k] = out[k].val;

const header =
  '/**\n' +
  ' * openings-data.js — 자동 생성 파일 (node tools/build-openings.js). 직접 수정하지 마세요.\n' +
  ' * 출처: https://github.com/lichess-org/chess-openings (commit 880ed9f), CC0-1.0\n' +
  ' */\n';
const body = 'window.ChessOpeningsData = ' + JSON.stringify(data) + ';\n';
const outPath = path.join(__dirname, '..', 'src', 'data', 'openings-data.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + body);

console.log('줄 ' + lines + ' / 실패 ' + failed + ' / 포지션 ' + Object.keys(data).length +
  ' / ' + Math.round((header + body).length / 1024) + 'KB → ' + path.relative(process.cwd(), outPath));
process.exit(failed ? 1 : 0);
