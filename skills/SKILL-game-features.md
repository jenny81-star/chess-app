# SKILL: 게임 기능 구현 (Game Features)

Claude Code가 게임 저장, 힌트, 무르기 등 부가 기능을 구현할 때 참고하는 지침서.

---

## 게임 저장 / 불러오기 (storage.js)

### 저장 데이터 구조
```javascript
const SAVE_KEY = 'chess_game_save';

// 저장할 데이터
const saveData = {
  version: '1.0',
  savedAt: new Date().toISOString(),
  difficulty: gameState.difficulty,
  board: serializeBoard(gameState.board),     // 2D 배열 → JSON
  turn: gameState.turn,
  castlingRights: gameState.castlingRights,
  enPassantTarget: gameState.enPassantTarget,
  history: gameState.history,                  // 전체 이동 기록
  capturedPieces: gameState.capturedPieces,
  halfMoveClock: gameState.halfMoveClock,
  fullMoveNumber: gameState.fullMoveNumber,
  timer: {
    white: timerState.white,                   // 경과 시간(ms)
    black: timerState.black,
  }
};

// 저장
function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
  showToast('게임이 저장되었습니다!');
}

// 불러오기
function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { showToast('저장된 게임이 없습니다.'); return; }
  const data = JSON.parse(raw);
  restoreGameState(data);
  showToast(`저장된 게임을 불러왔습니다. (${formatDate(data.savedAt)})`);
}
```

---

## 무르기 (Undo)

```javascript
// history 배열을 스택으로 활용
function undoMove() {
  if (gameState.history.length === 0) return;
  if (gameState.turn === 'black') {
    // AI 차례 중 무르기 불가
    showToast('AI가 생각 중에는 무를 수 없습니다.');
    return;
  }

  // 내 수 + AI 수 동시에 되돌리기 (2수 되돌리기)
  const movesToUndo = Math.min(2, gameState.history.length);
  for (let i = 0; i < movesToUndo; i++) {
    const lastMove = gameState.history.pop();
    revertMove(gameState.board, lastMove);
  }

  gameState.turn = 'white';
  renderBoard();
  showToast('한 수를 되돌렸습니다.');
}

// 무르기 횟수 제한 (선택사항)
// const MAX_UNDO = 3;
```

---

## 힌트 기능

```javascript
async function showHint() {
  if (gameState.turn !== 'white') return;

  // 힌트 버튼 비활성화 + 로딩 표시
  hintBtn.disabled = true;
  hintBtn.textContent = '생각 중...';

  // AI depth 2로 빠르게 계산 (힌트는 깊이 제한)
  const hintMove = await calculateBestMove(gameState.board, 'white', { depth: 2, mistakeRate: 0 });

  // 출발지 + 목적지 하이라이트 (2초)
  highlightSquare(hintMove.from, 'hint-from');   // 파란 테두리
  highlightSquare(hintMove.to,   'hint-to');     // 파란 점선

  await wait(2000);
  clearHintHighlights();

  hintBtn.disabled = false;
  hintBtn.textContent = '💡 힌트';
}
```

---

## 타이머

```javascript
class ChessTimer {
  constructor() {
    this.times = { white: 0, black: 0 };  // ms
    this.current = null;
    this.intervalId = null;
  }

  start(color) {
    this.current = color;
    this.intervalId = setInterval(() => {
      this.times[color] += 100;
      updateTimerDisplay(color, this.times[color]);
    }, 100);
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  switch(toColor) {
    this.stop();
    this.start(toColor);
  }

  format(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  }
}
```

---

## 이동 기록 표시 (PGN 형식)

```javascript
// 기보 표기법 (약식)
function formatMove(move) {
  const files = 'abcdefgh';
  const piece = move.piece.type !== 'P' ? move.piece.type : '';
  const capture = move.captured ? 'x' : '';
  const dest = files[move.to.col] + (8 - move.to.row);

  if (move.castling === 'kingside')  return 'O-O';
  if (move.castling === 'queenside') return 'O-O-O';
  if (move.promotion) return `${dest}=${move.promotion}`;

  return `${piece}${capture}${dest}${move.check ? '+' : ''}${move.checkmate ? '#' : ''}`;
}

// 사이드패널 기보 표시
function updateMoveHistory() {
  const moves = gameState.history;
  let html = '';
  for (let i = 0; i < moves.length; i += 2) {
    const num = Math.floor(i/2) + 1;
    const white = moves[i]   ? formatMove(moves[i])   : '';
    const black = moves[i+1] ? formatMove(moves[i+1]) : '';
    html += `<div class="move-row">
      <span class="move-num">${num}.</span>
      <span class="move white">${white}</span>
      <span class="move black">${black}</span>
    </div>`;
  }
  document.getElementById('move-history').innerHTML = html;
  // 자동 스크롤
  document.getElementById('move-history').scrollTop = 999999;
}
```

---

## 잡은 기물 표시

```javascript
// 잡힌 기물을 점수 기준으로 정렬 후 표시
const PIECE_ORDER = ['Q', 'R', 'B', 'N', 'P'];
const PIECE_SYMBOLS = {
  white: { K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙' },
  black: { K:'♚', Q:'♛', R:'♜', B:'♝', N:'♞', P:'♟' },
};

function renderCapturedPieces(color) {
  const captured = gameState.capturedPieces[color];
  const sorted = PIECE_ORDER.flatMap(type =>
    captured.filter(p => p.type === type)
  );
  return sorted.map(p => PIECE_SYMBOLS[p.color][p.type]).join(' ');
}

// 점수 우위 계산
function getMaterialAdvantage() {
  const PIECE_VALUES = { Q:9, R:5, B:3, N:3, P:1, K:0 };
  const whiteScore = gameState.capturedPieces.black.reduce((s,p) => s + PIECE_VALUES[p.type], 0);
  const blackScore = gameState.capturedPieces.white.reduce((s,p) => s + PIECE_VALUES[p.type], 0);
  return whiteScore - blackScore; // 양수: 플레이어 유리
}
```

---

## 모달 (프로모션 / 게임 종료)

### 프로모션 선택
```javascript
function showPromotionModal(color) {
  return new Promise(resolve => {
    const modal = document.getElementById('promotion-modal');
    modal.style.display = 'flex';

    // 퀸/룩/비숍/나이트 버튼 표시
    ['Q','R','B','N'].forEach(type => {
      modal.querySelector(`[data-piece="${type}"]`).onclick = () => {
        modal.style.display = 'none';
        resolve(type);
      };
    });
  });
}
```

### 게임 종료 모달
```javascript
function showGameOverModal(result) {
  // result: 'win' | 'lose' | 'stalemate' | 'draw'
  const messages = {
    win:       { title: '🎉 승리!',    sub: '축하합니다! AI를 이겼어요!' },
    lose:      { title: '😢 패배',     sub: '다시 도전해보세요!' },
    stalemate: { title: '🤝 무승부',   sub: '스테일메이트!' },
    draw:      { title: '🤝 무승부',   sub: '50수 규칙으로 무승부!' },
  };
  // 승리 시 폭죽 이펙트 실행
  if (result === 'win') confettiEffect.launch();
}
```

---

## 토스트 메시지

```javascript
function showToast(message, duration = 2000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
```

```css
.toast {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: rgba(0,0,0,0.8);
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  opacity: 0;
  transition: all 0.3s ease;
  z-index: 9999;
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```
