# RULES — Chess Game 개발 규칙

Claude Code가 이 프로젝트에서 반드시 따라야 하는 규칙 모음.

---

## 1. 코딩 스타일 규칙

### 파일 & 네이밍
```
✅ 파일명: kebab-case  (chess-engine.js)
✅ 함수명: camelCase  (getLegalMoves)
✅ 클래스명: PascalCase (ChessTimer)
✅ 상수명: UPPER_SNAKE_CASE (MAX_DEPTH)
✅ CSS 클래스: kebab-case (move-history)
```

### JavaScript
```javascript
// ✅ ES6+ 사용
const, let  (var 금지)
Arrow function, Destructuring, Template literal, async/await

// ✅ 모듈 패턴 (전역 오염 방지)
// 각 파일은 즉시실행함수 또는 class로 감싸기
// index.html에서 <script type="module"> 사용

// ✅ 에러 처리
try-catch로 localStorage 접근 감싸기
AI 계산은 항상 타임아웃 안전장치 포함

// ❌ 금지
jQuery, lodash 등 외부 라이브러리
var 선언
전역 변수 무분별 사용
```

### CSS
```css
/* ✅ CSS 변수 사용 (styles/main.css에 :root에 정의) */
color: var(--panel-accent);

/* ✅ Flexbox / Grid 레이아웃 */
/* ✅ transition으로 부드러운 인터랙션 */
/* ❌ 인라인 스타일은 JS 애니메이션에만 한정 */
/* ❌ !important 남용 금지 */
```

### HTML
```html
<!-- ✅ 시맨틱 태그 사용 -->
<header>, <main>, <aside>, <section>

<!-- ✅ data-* 속성으로 JS와 연결 -->
<div class="square" data-row="0" data-col="0">

<!-- ❌ 인라인 onclick 금지 → addEventListener 사용 -->
```

---

## 2. AI 난이도 설계 원칙

### 핵심 원칙: "아이가 중급에서 이길 수 있어야 한다"
```
입문 (⭐)    — 누구나 이길 수 있음. 랜덤에 가까운 수준
초급 (⭐⭐)   — 기본 전술 없음. 기물 공짜로 줌
중급 (⭐⭐⭐)  — 체스를 조금 아는 아이가 40~50% 확률로 승리 ← 핵심 레벨
고급 (⭐⭐⭐⭐) — 체스를 잘 하는 사람이 간신히 이길 수 있음
마스터 (⭐⭐⭐⭐⭐) — 거의 최강. 일반인은 이기기 매우 어려움
```

### AI 실수 주입 방식 (엄격히 준수)
```javascript
// 규칙 1: 실수는 "완전 랜덤"이 아닌 "차선책 선택"
// ❌ 나쁜 방법: 완전히 랜덤한 수를 선택
// ✅ 좋은 방법: 상위 N개 중에서 랜덤 선택

// 규칙 2: 입문/초급은 기물을 일부러 희생하지 않음
// (너무 어색하게 나쁜 수는 현실감을 해침)

// 규칙 3: AI 사고 시간은 난이도에 비례해 딜레이
// (즉시 두면 불쾌감 → 최소 300ms)

// 규칙 4: 킹 안전은 항상 최우선 (모든 난이도에서)
// (AI가 체크메이트를 당하는 수는 절대 두지 않음)
```

---

## 3. 체스 규칙 구현 원칙

### 절대 누락 금지 항목
```
✅ 캐슬링 — 4가지 (킹사이드/퀸사이드 × 흑/백)
✅ 앙파상 — 직전 턴 폰 2칸 이동 시에만 가능
✅ 폰 프로모션 — 마지막 랭크 도달 시 반드시 선택 모달
✅ 체크 상태에서 체크 유발 이동 불가
✅ 스테일메이트 감지 (무승부)
✅ 50수 규칙 (선택 구현)
```

### 이동 검증 순서
```
1. 기물의 이동 패턴 확인
2. 경로상 장애물 확인 (나이트 제외)
3. 목적지 아군 기물 확인
4. 이동 후 자신의 킹이 체크인지 확인 ← 반드시!
5. 특수 규칙 (캐슬링, 앙파상) 조건 확인
```

---

## 4. Git 커밋 & 배포 규칙

### 커밋 메시지 형식
```
feat: 체스 엔진 기본 이동 규칙 구현
feat: AI Minimax + 난이도 5단계 추가
fix: 캐슬링 체크 통과 버그 수정
style: 체스판 우드 텍스처 개선
refactor: evaluator.js 포지션 테이블 최적화
```

### 브랜치 전략
```
main      ← Vercel 자동배포 (항상 동작하는 상태 유지)
dev       ← 개발 작업 브랜치
feature/* ← 개별 기능 (선택사항)
```

### Vercel 배포 규칙
```
✅ vercel.json 항상 프로젝트 루트에 위치
✅ main 브랜치 push = 자동 배포
✅ 빌드 실패 시 이전 버전 유지됨
❌ API 키, 비밀 정보 코드에 절대 포함 금지
```

### vercel.json 기본 설정
```json
{
  "version": 2,
  "builds": [{ "src": "index.html", "use": "@vercel/static" }],
  "routes": [{ "src": "/(.*)", "dest": "/index.html" }]
}
```

---

## 5. 성능 규칙

### AI 계산
```javascript
// ✅ AI 계산은 반드시 setTimeout으로 UI 블로킹 방지
// ✅ depth 4 이상은 Web Worker 검토
// ✅ Alpha-Beta Pruning 반드시 적용 (depth 3 이상 필수)
// ❌ AI 계산 중 UI 조작 불가 (버튼 비활성화)
```

### 렌더링
```javascript
// ✅ 이동할 때만 변경된 칸만 업데이트 (전체 리렌더 최소화)
// ✅ SVG는 최초 1회만 fetch → 캐시 후 재사용
// ✅ requestAnimationFrame 활용
```

---

## 6. UX 규칙 (초등학생 친화)

```
✅ 이동 가능한 칸은 항상 시각적으로 표시 (끄기 옵션 가능)
✅ 체크 상태는 즉시 빨간 하이라이트로 경고
✅ AI 턴에는 "AI가 생각 중..." 표시
✅ 모든 중요 행동에 토스트 메시지 피드백
✅ 무르기는 내 수 + AI 수 동시에 (1수가 아닌 2수)
✅ 항복 버튼에는 확인 다이얼로그 필수
❌ 설명 없는 에러 메시지 노출 금지
❌ 버튼 클릭 후 0.5초 이상 무응답 금지
```
