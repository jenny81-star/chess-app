# Chess Game — Claude Code Project Context

## 프로젝트 개요
초등학교 6학년(12세) 남자아이를 위한 체스 웹게임.
"근사한 PC 게임 느낌" — 허술한 플래시 게임이 아닌, 고품질 브라우저 게임.

## 핵심 목표
1. 아이가 **재미를 느낄 수 있는 난이도** — 중급에서 이길 수 있어야 함
2. **시각적으로 고급스러운** UI (클래식 우드 체스판 + SVG 기물)
3. 서버 없이 동작하는 **Serverless** 구조 (순수 HTML/CSS/JS)

## 기술 스택
- **언어**: 순수 HTML5 / CSS3 / Vanilla JavaScript (ES6+)
- **빌드 도구**: 없음 (index.html 직접 실행)
- **배포**: GitHub → Vercel 자동배포
- **저장**: localStorage (게임 저장/불러오기)
- **외부 라이브러리 / 데이터**:
  - Stockfish.js 18 lite-single (WASM, GPLv3) — 상대 AI · 힌트 · 수 품질 · 평가 막대
    - 파일: `assets/stockfish/` (라이선스: `assets/stockfish/Copying.txt`), 브리지: `src/engine/stockfish.js`
    - 워커 2개: analysis(분석, 항상 Skill 20) / opponent(상대 AI, 레벨별 설정)
    - 워커를 못 띄우는 환경(file:// 등, Playwright 테스트 포함)에서는 내장 엔진(ai.js)으로 자동 대체
  - Lichess chess-openings (CC0) — 오프닝 이름. 원본 `tools/openings-src/`, 변환 `node tools/build-openings.js` → `src/data/openings-data.js`
- **난이도**: 레벨 1~20 (`ai.js`의 LEVEL_* 표) + 5단계 이름(입문 1-4 / 초급 5-8 / 중급 9-12 / 고급 13-16 / 마스터 17-20)
  - 낮은 레벨은 Skill Level + 깊이 제한 + 실수 주입. 내장 엔진 상대로 실측해 조정함

## 프로젝트 구조
```
chess-game/
├── CLAUDE.md                  # 이 파일
├── index.html                 # 메인 진입점 (모든 JS/CSS 로드)
├── vercel.json                # Vercel 배포 설정
├── src/
│   ├── engine/
│   │   ├── board.js           # 보드 상태, 기물 배치, FEN
│   │   ├── moves.js           # 이동 규칙 (캐슬링, 앙파상, 프로모션)
│   │   ├── ai.js              # Minimax + Alpha-Beta + 난이도별 실수
│   │   └── evaluator.js       # 포지션 평가 함수
│   ├── ui/
│   │   ├── renderer.js        # 체스판 & 기물 렌더링
│   │   ├── animator.js        # 이동 슬라이드 애니메이션
│   │   └── effects.js         # 폭죽(confetti), 파티클 이펙트
│   └── game/
│       ├── game.js            # 게임 흐름 (턴 관리, 승패 판정)
│       └── storage.js         # 저장/불러오기 (localStorage)
├── styles/
│   └── main.css               # 전체 스타일 (우드 텍스처, 레이아웃)
└── assets/
    └── pieces/                # SVG 기물 파일 (또는 인라인 SVG)
```

## 구현 단계 (Step별 진행)
- **Step 1**: index.html 뼈대 + board.js + moves.js (체스 규칙 완성)
- **Step 2**: ai.js + evaluator.js (Minimax AI + 난이도 시스템)
- **Step 3**: renderer.js + main.css (우드 체스판 + SVG 기물 렌더링)
- **Step 4**: animator.js + effects.js (이동 애니메이션 + 폭죽)
- **Step 5**: game.js + storage.js + UI 완성 (저장, 무르기, 힌트, 사이드패널)

## 현재 진행 상태
- [x] Step 1 완료
- [x] Step 2 완료
- [x] Step 3 완료
- [x] Step 4 완료
- [x] Step 5 완료

## 배포 정보
- **Repository**: GitHub (chess-game)
- **Platform**: Vercel (GitHub 연동 자동배포)
- **URL**: 배포 후 기입
