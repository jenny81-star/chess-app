/**
 * 레벨(1~20) · 평가 막대 수식 · 오프닝 조회 · UCI→합법 수 node 테스트
 * 실행: node tests/levels-evalbar-openings-test.js
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
load('src/engine/evaluator.js');
load('src/engine/ai.js');
load('src/engine/stockfish.js');
load('src/data/openings-data.js');
load('src/game/openings.js');
load('src/ui/evalbar.js');

const { createInitialState, createStateFromBoard, applyMove } = window.ChessBoard;
const { getLegalMoves } = window.ChessMoves;
const AI = window.ChessAI;
const { toLegalMove } = window.ChessStockfish;
const { nameFor } = window.ChessOpenings;
const { scoreToPercent, scoreToLabel } = window.ChessEvalBar;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else      { fail++; console.log('  FAIL ' + name); }
}

const FILES = 'abcdefgh';
const sq = n => [8 - parseInt(n[1], 10), FILES.indexOf(n[0])];
function play(state, from, to) {
  const m = getLegalMoves(state, ...sq(from)).find(m => m.to[0] === sq(to)[0] && m.to[1] === sq(to)[1]);
  if (!m) throw new Error('illegal ' + from + to);
  return applyMove(state, m);
}
function playLine(line) {
  let s = createInitialState();
  for (const mv of line.split(' ')) s = play(s, mv.slice(0, 2), mv.slice(2, 4));
  return s;
}

// ── 레벨 ────────────────────────────────────────────────────
console.log('레벨 1~20');
{
  const cfgs = [];
  for (let l = 1; l <= 20; l++) cfgs.push(AI.getLevelConfig(l));
  check('레벨 20개 모두 설정 존재', cfgs.every(c => c.depth >= 1 && c.skill >= 0 && c.skill <= 20));
  check('레벨 1 = Skill 0, 레벨 20 = Skill 20', cfgs[0].skill === 0 && cfgs[19].skill === 20);
  check('Skill/깊이는 레벨이 오를수록 줄지 않음',
    cfgs.every((c, i) => i === 0 || (c.skill >= cfgs[i - 1].skill && c.depth >= cfgs[i - 1].depth)));
  check('실수 확률은 레벨이 오를수록 늘지 않음, 14 이상은 0',
    cfgs.every((c, i) => i === 0 || c.mistakeRate <= cfgs[i - 1].mistakeRate) &&
    cfgs.slice(13).every(c => c.mistakeRate === 0));
  check('단계 경계: 4 입문 / 5 초급 / 12 중급 / 13 고급 / 17 마스터',
    AI.levelToCategory(4) === '입문' && AI.levelToCategory(5) === '초급' &&
    AI.levelToCategory(12) === '중급' && AI.levelToCategory(13) === '고급' && AI.levelToCategory(17) === '마스터');
  check('단계 기본 레벨은 그 단계 안에 있음',
    Object.entries(AI.CATEGORY_DEFAULT_LEVEL).every(([cat, lv]) => AI.levelToCategory(lv) === cat));
  check('범위 밖/잘못된 값은 보정', AI.clampLevel(0) === 1 && AI.clampLevel(99) === 20 && AI.clampLevel('x') === AI.CATEGORY_DEFAULT_LEVEL['중급']);
  check('구버전 저장(difficulty만) → 단계 기본 레벨', AI.resolveLevel({ difficulty: '고급' }) === AI.CATEGORY_DEFAULT_LEVEL['고급']);
  check('level 필드가 있으면 우선', AI.resolveLevel({ difficulty: '입문', level: 17 }) === 17);
}

// ── 평가 막대 수식 ───────────────────────────────────────────
console.log('평가 막대');
check('0점 = 50%', scoreToPercent(0) === 50);
check('백 우세면 50% 초과, 흑 우세면 미만', scoreToPercent(150) > 50 && scoreToPercent(-150) < 50);
check('대칭: p(+x) + p(-x) = 100', Math.abs(scoreToPercent(320) + scoreToPercent(-320) - 100) < 1e-9);
check('큰 점수도 3~97% 안', scoreToPercent(5000) <= 97 && scoreToPercent(-5000) >= 3);
check('메이트 점수 → 100% / 0%', scoreToPercent(199997) === 100 && scoreToPercent(-199998) === 0);
check("라벨: +1.2 / -0.4 / 0.0", scoreToLabel(120) === '+1.2' && scoreToLabel(-40) === '-0.4' && scoreToLabel(3) === '0.0');
check("라벨: 메이트 M3 (양쪽)", scoreToLabel(199997) === 'M3' && scoreToLabel(-199997) === 'M3');

// ── 오프닝 조회 ──────────────────────────────────────────────
console.log('오프닝');
{
  const ruy = nameFor(playLine('e2e4 e7e5 g1f3 b8c6 f1b5'));
  check('1.e4 e5 2.Nf3 Nc6 3.Bb5 → C60 Ruy Lopez', !!ruy && ruy.eco === 'C60' && /^Ruy Lopez/.test(ruy.name));
  const sic = nameFor(playLine('e2e4 c7c5'));
  check('1.e4 c5 → Sicilian Defense', !!sic && sic.name === 'Sicilian Defense');
  // 트랜스포지션: 1.Nf3 d5 2.e4 와 1.e4 d5 2.Nf3 은 같은 포지션
  const a = nameFor(playLine('g1f3 d7d5 e2e4'));
  const b = nameFor(playLine('e2e4 d7d5 g1f3'));
  check('트랜스포지션은 같은 이름', !!a && !!b && a.name === b.name);
  // 구분자가 필요한 수(Ngf3)가 들어간 줄
  const tar = nameFor(playLine('e2e4 e7e6 d2d4 d7d5 b1d2 b8c6 g1f3'));
  check('구분자 수(Ngf3) 포함 줄 조회 (French Tarrasch)', !!tar && /^French Defense: Tarrasch/.test(tar.name));
  // 책을 벗어나도 마지막 이름 유지
  const out = nameFor(playLine('e2e4 c7c5 a2a3 h7h6 h2h3 a7a6'));
  check('책을 벗어나도 마지막(가장 깊은) 이름 유지', !!out && /^Sicilian Defense/.test(out.name));
  check('시작 포지션은 이름 없음', nameFor(createInitialState()) === null);
}

// ── UCI → 합법 수 (castling/enPassant 플래그) ────────────────
console.log('UCI → 합법 수');
{
  const empty = () => Array.from({ length: 8 }, () => Array(8).fill(null));
  const b = empty();
  b[7][4] = { type: 'K', color: 'white' }; b[7][7] = { type: 'R', color: 'white' };
  b[0][4] = { type: 'K', color: 'black' };
  const s = createStateFromBoard(b, { turn: 'white' });
  const c = toLegalMove(s, 'e1g1');
  check('e1g1 → castling kingside 플래그', !!c && c.castling === 'kingside');
  const after = applyMove(s, c);
  check('캐슬링 적용 후 룩이 f1', after.board[7][5] && after.board[7][5].type === 'R' && !after.board[7][7]);

  let e = createInitialState();
  e = play(e, 'e2', 'e4'); e = play(e, 'a7', 'a6'); e = play(e, 'e4', 'e5'); e = play(e, 'd7', 'd5');
  const ep = toLegalMove(e, 'e5d6');
  check('e5d6 → enPassant 플래그', !!ep && ep.enPassant === true);
  check('앙파상 적용 후 d5 폰 제거', !applyMove(e, ep).board[3][3]);

  const pb = empty();
  pb[1][0] = { type: 'P', color: 'white' }; pb[7][4] = { type: 'K', color: 'white' }; pb[0][7] = { type: 'K', color: 'black' };
  const ps = createStateFromBoard(pb, { turn: 'white' });
  const promo = toLegalMove(ps, 'a7a8n');
  check('a7a8n → 나이트 프로모션', !!promo && promo.promotion === 'N');
  check('불법 수 → null', toLegalMove(ps, 'a7a6') === null && toLegalMove(ps, '(none)') === null);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
