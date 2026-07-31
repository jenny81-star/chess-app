# SKILL: UI & 비주얼 구현 (UI / Visual)

Claude Code가 체스 게임의 UI와 시각 효과를 구현할 때 참고하는 지침서.

---

## 디자인 원칙

- **테마**: 클래식 우드 + 다크 사이드패널 (고급 체스 클럽 분위기)
- **금지**: 플래시 게임 느낌의 단순 색상, 픽셀 기물, 딱딱한 레이아웃
- **목표**: Steam 인디게임 수준의 완성도

---

## 색상 팔레트

```css
:root {
  /* 체스판 */
  --board-light: #f0d9b5;        /* 연한 메이플 */
  --board-dark:  #b58863;        /* 진한 월넛 */
  --board-border: #8B5E3C;       /* 테두리 나무 */
  --board-shadow: rgba(0,0,0,0.5);

  /* UI 패널 */
  --panel-bg:    #1a1a2e;        /* 다크 네이비 */
  --panel-card:  #16213e;        /* 카드 배경 */
  --panel-accent: #e2b96f;       /* 골드 포인트 */
  --panel-text:  #e0e0e0;
  --panel-muted: #888;

  /* 하이라이트 */
  --highlight-selected: rgba(20, 85, 30, 0.5);   /* 선택된 기물 */
  --highlight-move:     rgba(20, 85, 30, 0.3);   /* 이동 가능 위치 */
  --highlight-capture:  rgba(220, 20, 20, 0.4);  /* 캡처 가능 위치 */
  --highlight-check:    rgba(255, 0, 0, 0.6);    /* 체크 경고 */
  --highlight-last:     rgba(255, 255, 0, 0.3);  /* 마지막 이동 */
}
```

---

## 체스판 렌더링 (renderer.js)

### 구조
```html
<div id="board-container">
  <div id="board">
    <!-- 64개의 .square div -->
    <div class="square light" data-row="0" data-col="0">
      <div class="piece white king"><!-- SVG --></div>
    </div>
    ...
  </div>
</div>
```

### 우드 텍스처 CSS
```css
.square.light {
  background-color: var(--board-light);
  background-image:
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 2px,
      rgba(139, 94, 60, 0.04) 2px,
      rgba(139, 94, 60, 0.04) 4px
    );
}

.square.dark {
  background-color: var(--board-dark);
  background-image:
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 3px,
      rgba(0,0,0,0.06) 3px,
      rgba(0,0,0,0.06) 6px
    );
}

#board {
  border: 12px solid var(--board-border);
  border-radius: 4px;
  box-shadow:
    0 20px 60px rgba(0,0,0,0.6),
    inset 0 0 20px rgba(0,0,0,0.2);
}
```

---

## SVG 기물 스타일

### 요구사항
- 고품질 일러스트 스타일 (Lichess 또는 Chess.com 수준)
- 흰색 기물: 밝은 색 + 진한 윤곽선
- 검정 기물: 어두운 색 + 밝은 윤곽선
- 권장 소스: Lichess 오픈소스 기물 SVG (cburnett 세트)
  - URL: `https://lichess1.org/assets/piece/cburnett/`

### 기물 렌더링
```javascript
// 기물 SVG를 .square 안에 삽입
function renderPiece(square, piece) {
  const svg = getPieceSVG(piece.type, piece.color); // 캐시된 SVG
  square.innerHTML = `<div class="piece" draggable="true">${svg}</div>`;
}
```

---

## 이동 애니메이션 (animator.js)

### 슬라이드 이동
```javascript
async function animateMove(fromSquare, toSquare, piece) {
  const fromRect = fromSquare.getBoundingClientRect();
  const toRect = toSquare.getBoundingClientRect();

  const dx = toRect.left - fromRect.left;
  const dy = toRect.top  - fromRect.top;

  // 기물을 절대 위치로 띄워서 이동
  piece.style.transform = `translate(${dx}px, ${dy}px)`;
  piece.style.transition = 'transform 0.2s ease-in-out';

  await wait(200); // 애니메이션 완료 대기
  // 실제 DOM 업데이트
}
```

### 캡처 이펙트
```javascript
// 캡처되는 기물: 페이드아웃 + 축소
capturedPiece.style.animation = 'captureEffect 0.3s ease-out forwards';

// CSS keyframe
@keyframes captureEffect {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.3) rotate(30deg); }
}
```

---

## 승리 폭죽 효과 (effects.js)

### Canvas 기반 Confetti
```javascript
class ConfettiEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
  }

  launch() {
    // 200개 파티클 생성
    for (let i = 0; i < 200; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: -10,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: Math.random() * 8 + 4,
        speedX: Math.random() * 6 - 3,
        speedY: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 10 - 5,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }
    this.animate();
  }

  animate() {
    // requestAnimationFrame 루프
    // 3초 후 자동 종료
  }
}

const COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
```

---

## 레이아웃 구조

```
┌─────────────────────────────────────────────────────┐
│  header: "♟ CHESS MASTER"              [새게임]      │
├────────────────────────┬────────────────────────────┤
│                        │  난이도 배지               │
│  체스판 (정사각형)      │  ─────────────────         │
│  700×700px (최대)      │  ⏱ 나: 00:00               │
│                        │  ⏱ AI: 00:00              │
│                        │  ─────────────────         │
│                        │  잡은 기물                  │
│                        │  ─────────────────         │
│                        │  이동 기록 (스크롤)         │
├────────────────────────┤                            │
│  [힌트] [무르기] [항복] │                            │
└────────────────────────┴────────────────────────────┘
```

### 반응형
```css
/* 체스판은 항상 정사각형 유지 */
#board-container {
  width: min(70vw, 70vh, 700px);
  aspect-ratio: 1;
}

/* 사이드패널은 나머지 공간 */
#sidebar {
  width: 280px;
  min-width: 240px;
}
```

---

## 인터랙션 UX

### 기물 선택 & 이동
1. 기물 클릭 → 선택 (초록 하이라이트)
2. 이동 가능 칸 표시 → 빈 칸: 반투명 원, 적 기물: 빨간 테두리
3. 목적지 클릭 → 이동 애니메이션 실행
4. 다른 내 기물 클릭 → 선택 변경
5. 빈 칸 클릭 → 선택 취소

### 드래그 앤 드롭 (선택 구현)
- mousedown → 기물 잡기 (커서: grabbing)
- mousemove → 기물 따라다님
- mouseup → 가장 가까운 칸에 드롭
