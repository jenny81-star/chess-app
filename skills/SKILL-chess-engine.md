# SKILL: 체스 엔진 구현 (Chess Engine)

Claude Code가 체스 엔진을 구현할 때 반드시 참고하는 지침서.

---

## 보드 표현 방식

### 배열 구조
```javascript
// 8x8 2차원 배열. null = 빈 칸
// 기물: { type: 'K'|'Q'|'R'|'B'|'N'|'P', color: 'white'|'black' }
board[row][col]  // row 0 = 8랭크(흑 기물), row 7 = 1랭크(백 기물)
```

### 기물 타입 코드
| 코드 | 기물 | 점수 |
|------|------|------|
| K | 킹 | 20000 |
| Q | 퀸 | 900 |
| R | 룩 | 500 |
| B | 비숍 | 330 |
| N | 나이트 | 320 |
| P | 폰 | 100 |

---

## 이동 규칙 구현 필수 체크리스트

### 기본 이동
- [ ] 폰: 전진 1칸, 초기 2칸, 대각 캡처
- [ ] 나이트: L자 8방향
- [ ] 비숍: 대각선 전방향
- [ ] 룩: 수직/수평 전방향
- [ ] 퀸: 비숍 + 룩
- [ ] 킹: 8방향 1칸

### 특수 규칙 (반드시 구현)
```javascript
// 1. 캐슬링 조건
castling = {
  whiteKingSide:  king/rook 미이동 && 사이 빈 칸 && 경유 칸 체크 없음
  whiteQueenSide: 위와 동일
  blackKingSide:  위와 동일
  blackQueenSide: 위와 동일
}

// 2. 앙파상 (En Passant)
// 상대 폰이 바로 전 턴에 2칸 전진했을 때만 가능
enPassantTarget = lastMove가 폰 2칸 전진이면 해당 칸 좌표 저장

// 3. 폰 프로모션
// 폰이 마지막 랭크 도달 시 → Q/R/B/N 선택 모달 표시
// 기본값: 퀸으로 자동 프로모션 (AI의 경우)
```

### 체크/체크메이트/스테일메이트
```javascript
// 구현 순서
isInCheck(board, color)           // 킹이 공격받는지
isCheckmate(board, color)         // 합법적 이동이 없고 체크
isStalemate(board, color)         // 합법적 이동이 없고 체크 아님
getLegalMoves(board, piece, pos)  // 체크 상태가 되는 이동 제외
```

---

## 포지션 평가 함수 (evaluator.js)

### 기물 위치 보너스 테이블 (Piece-Square Table)
```javascript
// 예: 나이트는 중앙에 있을수록 가치가 높음
const KNIGHT_TABLE = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50],
];

// 최종 평가 = 기물 가치 합계 + 위치 보너스 합계
evaluate(board) = Σ(기물점수 × 색상부호) + Σ(위치보너스 × 색상부호)
// 양수 = 백 유리, 음수 = 흑 유리
```

---

## AI 구현 (ai.js)

### Minimax + Alpha-Beta Pruning
```javascript
function minimax(board, depth, alpha, beta, isMaximizing) {
  if (depth === 0 || isGameOver(board)) return evaluate(board);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of getAllMoves(board, 'white')) {
      const newBoard = applyMove(board, move);
      const eval = minimax(newBoard, depth-1, alpha, beta, false);
      maxEval = Math.max(maxEval, eval);
      alpha = Math.max(alpha, eval);
      if (beta <= alpha) break; // 가지치기
    }
    return maxEval;
  }
  // ... isMinimizing 대칭 구현
}
```

### 난이도별 파라미터 (핵심!)
```javascript
const DIFFICULTY_CONFIG = {
  입문:   { depth: 1, mistakeRate: 0.40, topN: 8  },
  초급:   { depth: 2, mistakeRate: 0.25, topN: 5  },
  중급:   { depth: 3, mistakeRate: 0.12, topN: 3  }, // ← 아이가 이길 수 있는 레벨
  고급:   { depth: 4, mistakeRate: 0.03, topN: 1  },
  마스터: { depth: 5, mistakeRate: 0.00, topN: 1  },
};

// 실수 주입 로직
function selectMove(rankedMoves, config) {
  if (Math.random() < config.mistakeRate) {
    // 상위 N개 중 랜덤 선택 (의도적 차선책)
    const pool = rankedMoves.slice(0, config.topN);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return rankedMoves[0]; // 최선의 수
}
```

### AI 사고 시간 (UX)
```javascript
// AI가 즉시 두면 어색함 → 최소 대기 시간 설정
const MIN_THINK_TIME = {
  입문: 300,   // ms
  초급: 500,
  중급: 800,
  고급: 1200,
  마스터: 2000,
};
// Promise + setTimeout으로 자연스러운 딜레이 구현
```

---

## 게임 상태 객체 구조
```javascript
const gameState = {
  board: Array(8).fill(null).map(() => Array(8).fill(null)),
  turn: 'white',                    // 현재 턴
  castlingRights: {                  // 캐슬링 권한
    whiteKingSide: true,
    whiteQueenSide: true,
    blackKingSide: true,
    blackQueenSide: true,
  },
  enPassantTarget: null,             // 앙파상 대상 칸 [row, col]
  halfMoveClock: 0,                  // 50수 규칙용
  fullMoveNumber: 1,                 // 전체 수
  history: [],                       // 이동 기록 [{from, to, piece, captured}]
  capturedPieces: { white: [], black: [] }, // 잡힌 기물
  selectedPiece: null,               // 현재 선택된 기물
  legalMoves: [],                    // 선택된 기물의 합법 이동 목록
  status: 'playing',                 // 'playing'|'check'|'checkmate'|'stalemate'
  difficulty: '중급',
};
```
