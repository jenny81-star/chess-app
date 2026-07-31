# DESIGN GUIDE — Chess Master UI/UX

Claude Code가 UI를 구현할 때 반드시 참고하는 시각 디자인 & UX 지침서.
타겟: 초등학교 6학년 남자아이 / 분위기: 고풍스러운 클래식 체스 클럽

---

## 1. 디자인 원칙 (Design Principles)

| 원칙 | 설명 |
|------|------|
| **Classic & Premium** | 허술한 플래시 게임이 아닌, 고급 체스 클럽 분위기 |
| **Legible & Inviting** | 12세 아이가 직관적으로 이해할 수 있는 UI |
| **Tactile & Responsive** | 클릭/호버 모두 즉각적인 시각 피드백 |
| **Dark & Warm** | 어두운 배경 + 따뜻한 금빛/우드 포인트 컬러 |

---

## 2. 색상 시스템 (Color System)

```css
:root {
  /* ── 배경 레이어 ── */
  --bg-page:       #0f0e17;   /* 최외곽 배경 (거의 검정) */
  --bg-panel:      #1a1a2e;   /* 사이드 패널 */
  --bg-card:       #16213e;   /* 카드/섹션 배경 */
  --bg-card-hover: #1e2a4a;   /* 카드 호버 */

  /* ── 체스판 ── */
  --sq-light:      #f0d9b5;   /* 밝은 칸 (메이플) */
  --sq-dark:       #b58863;   /* 어두운 칸 (월넛) */
  --board-border:  #8B5E3C;   /* 체스판 테두리 */
  --board-coord:   #6b4c2a;   /* 좌표 표기 (a-h, 1-8) */

  /* ── 골드 포인트 컬러 ── */
  --gold-light:    #f5d98a;   /* 밝은 골드 (텍스트) */
  --gold-mid:      #e2b96f;   /* 중간 골드 (UI 강조) */
  --gold-dark:     #a07834;   /* 어두운 골드 (테두리) */

  /* ── 텍스트 ── */
  --text-primary:  #e8e6d9;   /* 기본 텍스트 */
  --text-muted:    #8a8880;   /* 보조 텍스트 */
  --text-faint:    #504e48;   /* 힌트 텍스트 */

  /* ── 게임 상태 하이라이트 ── */
  --hl-selected:   rgba(106, 168, 79, 0.55);   /* 선택된 기물 */
  --hl-move:       rgba(106, 168, 79, 0.35);   /* 이동 가능 (빈 칸) */
  --hl-capture:    rgba(220, 60, 60, 0.45);    /* 캡처 가능 */
  --hl-check:      rgba(220, 30, 30, 0.65);    /* 체크 경고 */
  --hl-last-from:  rgba(255, 220, 80, 0.28);   /* 직전 이동 출발지 */
  --hl-last-to:    rgba(255, 220, 80, 0.42);   /* 직전 이동 도착지 */
  --hl-hint:       rgba(80, 160, 220, 0.50);   /* 힌트 하이라이트 */
}
```

---

## 3. 타이포그래피 (Typography)

```css
/* 폰트 패밀리 */
--font-display: 'Cinzel', 'Palatino Linotype', serif;  /* 제목 (체스 클래식 느낌) */
--font-ui:      'Inter', 'Segoe UI', sans-serif;        /* UI 텍스트 */
--font-mono:    'JetBrains Mono', 'Courier New', mono;  /* 기보 기록 */

/* CDN 로드 */
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

| 용도 | 폰트 | 크기 | 굵기 | 색상 |
|------|------|------|------|------|
| 게임 타이틀 | Cinzel | 28px | 700 | --gold-light |
| 메뉴 제목 | Cinzel | 20px | 600 | --text-primary |
| 난이도 라벨 | Cinzel | 14px | 400 | --gold-mid |
| UI 레이블 | Inter | 13px | 500 | --text-muted |
| 기보 기록 | JetBrains Mono | 13px | 400 | --text-primary |
| 타이머 | JetBrains Mono | 22px | 600 | --text-primary |
| 토스트 메시지 | Inter | 14px | 400 | --text-primary |

---

## 4. 화면 구성 (Screen Layout)

### 4-1. 메인 메뉴 화면 (첫 진입)

```
┌─────────────────────────────────────────────────┐  bg: --bg-page
│                                                 │
│           ♟ CHESS MASTER                        │  font: Cinzel 700, gold
│        ─────────────────────────                │
│                                                 │
│    [ 입문 ★       초보자를 위한 체스 ]           │
│    [ 초급 ★★      기초를 배웁시다   ]           │
│    [ 중급 ★★★     도전해볼 만해요  ]  ← 기본값  │
│    [ 고급 ★★★★    실력자의 관문    ]           │
│    [ 마스터 ★★★★★ 최강 AI에 도전!  ]           │
│                                                 │
│              [ 게임 시작 ]                       │
│           [ 저장된 게임 불러오기 ]               │
│                                                 │
└─────────────────────────────────────────────────┘
```

**메뉴 카드 스타일**
```css
.difficulty-card {
  background: var(--bg-card);
  border: 1px solid var(--gold-dark);
  border-radius: 8px;
  padding: 14px 24px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.difficulty-card:hover,
.difficulty-card.selected {
  background: var(--bg-card-hover);
  border-color: var(--gold-mid);
  box-shadow: 0 0 16px rgba(226, 185, 111, 0.15);
}
.difficulty-card .stars { color: var(--gold-mid); }
.difficulty-card .label { color: var(--text-primary); font-family: Cinzel; }
.difficulty-card .desc  { color: var(--text-muted); font-size: 12px; }
```

---

### 4-2. 게임 화면 (메인)

```
┌── header ─────────────────────────────────────────────┐
│  ♟ CHESS MASTER          난이도: ★★★ 중급  [새게임] │
├── board-wrapper ──────────┬── sidebar ─────────────────┤
│                           │                            │
│  8 │ . . . . . . . . │   │  ┌─ 상대 (AI) ──────────┐  │
│  7 │ . . . . . . . . │   │  │ ⏱ 00:00              │  │
│  6 │ . . . . . . . . │   │  │ 잡은 기물: ♟♟        │  │
│  5 │ . . . . . . . . │   │  └──────────────────────┘  │
│  4 │ . . . . . . . . │   │                            │
│  3 │ . . . . . . . . │   │  ┌─ 기보 ───────────────┐  │
│  2 │ . . . . . . . . │   │  │ 1. e4   e5           │  │
│  1 │ . . . . . . . . │   │  │ 2. Nf3  Nc6          │  │
│    └─────────────────┘   │  │ 3. ...               │  │
│      a b c d e f g h     │  └──────────────────────┘  │
│                           │                            │
│                           │  ┌─ 나 (플레이어) ───────┐  │
├── controls ───────────────┤  │ ⏱ 00:00              │  │
│  [💡 힌트] [↩ 무르기] [🏳 항복] │  │ 잡은 기물: ♜          │  │
└───────────────────────────┴──└──────────────────────┘  │
```

---

## 5. 컴포넌트 스타일 가이드 (Component Guide)

### 5-1. 체스판

```css
#board-wrapper {
  padding: 32px;                          /* 좌표 표기 공간 */
  background: linear-gradient(
    135deg, #2a1f12 0%, #1a1208 100%
  );                                       /* 어두운 나무 프레임 */
  border-radius: 4px;
  box-shadow:
    0 24px 80px rgba(0,0,0,0.7),
    inset 0 0 30px rgba(0,0,0,0.4);
}

#board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  border: 3px solid #6b4220;
  box-shadow:
    inset 0 0 0 1px #c8905040,
    0 0 40px rgba(0,0,0,0.5);
}

.square {
  aspect-ratio: 1;
  position: relative;
  cursor: pointer;
  transition: filter 0.1s ease;
}
.square:hover { filter: brightness(1.08); }
.square.light { background-color: var(--sq-light); }
.square.dark  { background-color: var(--sq-dark); }

/* 나무결 텍스처 */
.square.light {
  background-image: repeating-linear-gradient(
    45deg, transparent, transparent 3px,
    rgba(139,94,60,0.04) 3px, rgba(139,94,60,0.04) 6px
  );
}
.square.dark {
  background-image: repeating-linear-gradient(
    -45deg, transparent, transparent 4px,
    rgba(0,0,0,0.07) 4px, rgba(0,0,0,0.07) 8px
  );
}

/* 좌표 표기 (칸 안 모서리에 작게) */
.square .coord {
  position: absolute;
  font-size: 11px;
  font-family: var(--font-ui);
  font-weight: 600;
  opacity: 0.55;
  color: var(--board-coord);
}
.square.light .coord { color: var(--sq-dark); }
.square.dark  .coord { color: var(--sq-light); }
```

### 5-2. 하이라이트 레이어

```css
/* 선택된 기물 */
.square.selected::before {
  content: '';
  position: absolute; inset: 0;
  background: var(--hl-selected);
  z-index: 1;
}

/* 이동 가능 (빈 칸) — 반투명 원 */
.square.can-move::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 32%; height: 32%;
  background: rgba(0,0,0,0.18);
  border-radius: 50%;
  z-index: 2;
}

/* 캡처 가능 (적 기물 있는 칸) — 링 */
.square.can-capture::after {
  content: '';
  position: absolute; inset: 0;
  border: 4px solid rgba(220,60,60,0.55);
  border-radius: 50%;
  z-index: 2;
}

/* 체크 경고 */
.square.in-check::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(
    ellipse at center,
    rgba(220,30,30,0.7) 0%,
    rgba(220,30,30,0.0) 70%
  );
  z-index: 1;
}
```

### 5-3. 기물 (SVG)

```css
.piece {
  position: absolute; inset: 4%;
  display: flex; align-items: center; justify-content: center;
  cursor: grab;
  z-index: 3;
  transition: transform 0.1s ease;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));
}
.piece:hover { transform: scale(1.08); }
.piece.dragging {
  cursor: grabbing;
  transform: scale(1.15);
  z-index: 100;
  filter: drop-shadow(0 6px 12px rgba(0,0,0,0.5));
}

/* SVG 권장 소스: Lichess cburnett 세트 */
/* https://lichess1.org/assets/piece/cburnett/wK.svg 형식 */
/* 파일명: [w|b][K|Q|R|B|N|P].svg */
```

### 5-4. 버튼

```css
/* 기본 게임 버튼 */
.btn-game {
  background: transparent;
  border: 1px solid var(--gold-dark);
  color: var(--gold-light);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex; align-items: center; gap: 6px;
}
.btn-game:hover {
  background: rgba(226,185,111,0.1);
  border-color: var(--gold-mid);
  box-shadow: 0 0 8px rgba(226,185,111,0.12);
}
.btn-game:active { transform: scale(0.97); }
.btn-game:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 강조 버튼 (게임 시작) */
.btn-primary {
  background: var(--gold-dark);
  border: 1px solid var(--gold-mid);
  color: #0f0e17;
  font-weight: 600;
}
.btn-primary:hover {
  background: var(--gold-mid);
  box-shadow: 0 0 20px rgba(226,185,111,0.3);
}

/* 위험 버튼 (항복) */
.btn-danger {
  border-color: #7a3030;
  color: #e88080;
}
.btn-danger:hover {
  background: rgba(220,60,60,0.12);
  border-color: #c04040;
}
```

### 5-5. 사이드 패널

```css
#sidebar {
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-panel);
  border-left: 1px solid rgba(226,185,111,0.1);
}

/* 플레이어 카드 */
.player-card {
  background: var(--bg-card);
  border: 1px solid rgba(226,185,111,0.12);
  border-radius: 8px;
  padding: 12px 16px;
}
.player-card.active {
  border-color: var(--gold-dark);
  box-shadow: 0 0 12px rgba(226,185,111,0.08);
}

/* 타이머 */
.timer {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 2px;
}
.timer.urgent { color: #e87070; animation: timerPulse 1s infinite; }

@keyframes timerPulse {
  0%,100% { opacity: 1; }
  50%      { opacity: 0.6; }
}

/* 기보 기록 */
#move-history {
  font-family: var(--font-mono);
  font-size: 13px;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--gold-dark) transparent;
}
.move-row { display: grid; grid-template-columns: 30px 1fr 1fr; padding: 3px 0; }
.move-row:hover { background: rgba(255,255,255,0.03); }
.move-num { color: var(--text-muted); }
.move.last-move { color: var(--gold-light); font-weight: 600; }
```

### 5-6. 모달

```css
/* 오버레이 */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}

/* 모달 카드 */
.modal-card {
  background: var(--bg-panel);
  border: 1px solid var(--gold-dark);
  border-radius: 12px;
  padding: 32px;
  min-width: 320px;
  text-align: center;
  box-shadow: 0 30px 80px rgba(0,0,0,0.6);
  animation: modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalIn {
  from { transform: scale(0.85); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}

.modal-title {
  font-family: var(--font-display);
  font-size: 28px;
  color: var(--gold-light);
  margin-bottom: 8px;
}
```

---

## 6. 애니메이션 명세 (Animation Spec)

| 이벤트 | 효과 | 시간 | Easing |
|--------|------|------|--------|
| 기물 이동 | translate 슬라이드 | 200ms | ease-in-out |
| 기물 선택 | scale 1.0→1.08 | 100ms | ease |
| 기물 캡처 | scale 1.0→0.0 + rotate + fade | 250ms | ease-in |
| 체크 경고 | 빨간 glow 펄스 | 600ms × 3 | ease-in-out |
| AI 사고 중 | 점 3개 로딩 애니 | 0.6s loop | ease |
| 힌트 표시 | 파란 하이라이트 fade in/out | 300ms | ease |
| 승리 모달 등장 | scale 0.85→1 + fade | 300ms | cubic-bezier(0.34,1.56,0.64,1) |
| 폭죽 | 캔버스 confetti | 3~4초 | 중력+감속 |
| 프로모션 모달 | 아래→위 슬라이드 | 250ms | ease-out |

### 기물 이동 애니메이션 패턴
```javascript
async function animatePieceMove(pieceEl, fromRect, toRect) {
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top  - fromRect.top;

  pieceEl.style.transition = 'none';
  pieceEl.style.transform  = 'translate(0,0)';

  requestAnimationFrame(() => {
    pieceEl.style.transition = 'transform 0.2s ease-in-out';
    pieceEl.style.transform  = `translate(${dx}px, ${dy}px)`;
  });

  await new Promise(r => setTimeout(r, 210));
}
```

---

## 7. AI 상태 표시 (AI Status UX)

```
AI 사고 중 상태:
┌─────────────────────────────────┐
│  AI가 생각하고 있어요...  ● ● ●  │  ← 점 3개 순차 fade
│  [힌트] [무르기] 버튼 비활성화    │
└─────────────────────────────────┘

CSS:
.ai-thinking-dots span {
  animation: dotFade 1.2s ease-in-out infinite;
}
.ai-thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.ai-thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotFade {
  0%,80%,100% { opacity: 0.2; }
  40%         { opacity: 1.0; }
}
```

---

## 8. 반응형 (Responsive)

```css
/* 체스판: 항상 정사각형, 화면에 맞게 조정 */
#board-container {
  width: min(calc(100vh - 140px), calc(100vw - 320px), 680px);
  aspect-ratio: 1;
}

/* 사이드패널: 좁은 화면에서 하단으로 이동 */
@media (max-width: 900px) {
  #game-layout {
    flex-direction: column;
  }
  #sidebar {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }
  #board-container {
    width: min(90vw, 90vh);
  }
}
```

---

## 9. 승리/패배 화면

```
승리 시:
┌────────────────────────────────────┐
│  🎉                                │  ← 폭죽 효과 (Canvas)
│                                    │
│    CHESS MASTER                    │  Cinzel, gold
│    승리!                            │
│                                    │
│  플레이 시간: 12분 34초             │
│  총 수: 42수                        │
│  잡은 기물: ♛♜♝♞♟♟♟             │
│                                    │
│  [ 다시 도전 ]  [ 난이도 변경 ]     │
└────────────────────────────────────┘

패배 시:
  타이틀: "아쉬워요..." (Cinzel, --text-muted)
  서브: "다시 도전해볼까요?"
  폭죽 없음
```

---

## 10. 토스트 & 상태 메시지

```css
/* 토스트 (하단 중앙) */
.toast {
  position: fixed;
  bottom: 24px; left: 50%;
  transform: translateX(-50%) translateY(12px);
  background: rgba(20,18,30,0.92);
  color: var(--text-primary);
  border: 1px solid rgba(226,185,111,0.2);
  backdrop-filter: blur(8px);
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 14px;
  opacity: 0;
  transition: all 0.25s ease;
  pointer-events: none;
  white-space: nowrap;
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* 메시지 타입별 색상 */
.toast.success { border-color: rgba(80,200,120,0.3); color: #8be4a8; }
.toast.error   { border-color: rgba(220,80,80,0.3);  color: #e4a0a0; }
.toast.info    { border-color: rgba(80,160,220,0.3); color: #a0c8e4; }
```

---

## 11. 프로모션 UI

```
폰이 마지막 랭크 도달 시 표시:

┌─────────────────────────┐
│  기물을 선택하세요      │
│                         │
│   [♕]  [♖]  [♗]  [♘]   │  ← 클릭 가능한 SVG 기물 버튼
│   퀸   룩  비숍 나이트  │
│                         │
└─────────────────────────┘

위치: 프로모션 칸 근처 or 화면 중앙
```
