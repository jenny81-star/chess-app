# ♟ Chess Master

초등학생도 즐길 수 있는 브라우저 체스 게임입니다.
클래식 우드 체스판과 SVG 기물, 이동 애니메이션을 갖췄고, 서버 없이 정적 파일만으로 동작합니다.

## 주요 기능

### 대국
- **AI 대전**: 상대는 Stockfish 18(WASM)이며, 난이도는 레벨 1~20 중에서 고릅니다.
  - 5단계 카드(입문·초급·중급·고급·마스터)를 누르면 그 단계의 기본 레벨로 맞춰집니다.
  - 슬라이더로 세부 레벨을 조절할 수 있습니다.
- **2인 대전**: 한 화면에서 번갈아 두는 핫시트 방식입니다.
- **기물 배치 모드**: 원하는 포지션을 직접 만들고, 그 포지션에서 AI 대전이나 자유 진행을 시작합니다.

### 체스 규칙
캐슬링, 앙파상, 프로모션(퀸·룩·비숍·나이트 선택), 체크·체크메이트·스테일메이트를 지원합니다.

다음 경우에는 무승부로 끝납니다.
- 50수 규칙
- 같은 포지션이 세 번 반복될 때
- 기물이 부족할 때: 킹 vs 킹, 킹+비숍/나이트 1개 vs 킹, 킹+나이트 2개 vs 킹, 같은 색 칸 비숍만 남은 경우

### 분석과 학습
- **평가 막대**: 보드 왼쪽에서 매 수마다 형세를 보여 줍니다.
  - 흰 부분이 길수록 백이 우세합니다.
  - 점수는 `+1.2`, `M3`(3수 안에 메이트)처럼 표시됩니다.
  - 📊 버튼으로 켜고 끌 수 있습니다.
- **오프닝 이름**: 보드 위에 `C60 · Ruy Lopez`처럼 표시됩니다.
  - Lichess 오프닝 데이터 3,818개를 쓰며, 수순이 달라도 같은 포지션이면 이름을 찾아냅니다.
- **힌트**: Stockfish가 추천하는 수를 보드에 표시합니다.
- **수 품질 표기**: 둔 수마다 기보에 `!!`(최고의 수), `!`(좋은 수), `?`(실수), `??`(심각한 실수)를 자동으로 붙입니다.
- **기보**: 체크(`+`)와 체크메이트(`#`)를 표기합니다. 흑이 먼저 두는 포지션은 `1...`로 시작합니다.
- **복기 모드**: 게임이 끝난 뒤 기보를 한 수씩 다시 볼 수 있습니다.
  - 키보드 `←` `→`로 한 수씩, `Home` `End`로 처음과 끝으로 이동합니다.

### 편의 기능
- 무르기: AI 대전은 내 수와 AI 수를 한 번에, 2인 대전은 한 수씩 되돌립니다.
- 그 밖에 항복, 대국 시계, 잡은 기물과 기물 점수 차 표시가 있습니다.
- 게임 저장/불러오기: 브라우저 `localStorage`에 한 판을 저장합니다.
- 승리하면 폭죽 효과가 나옵니다.

## 실행 방법

빌드 과정은 없습니다. Stockfish가 Web Worker로 동작하므로 **로컬 웹 서버로 열어야** 합니다.

```bash
python -m http.server 8123
```

그다음 브라우저에서 http://localhost:8123 을 엽니다.

`index.html`을 파일로 직접 열면(`file://`) Worker를 쓸 수 없습니다.
이때는 자동으로 직접 구현한 내장 엔진(Minimax + Alpha-Beta)으로 대체되어, 게임은 그대로 할 수 있습니다.

## 테스트

### 엔진·로직 테스트 (node)
```bash
node tests/draw-test.js
node tests/levels-evalbar-openings-test.js
node tests/notation-test.js
node tests/quality-test.js
node tests/replay-test.js
node tests/editor-engine.test.js
node tests/ai-variety-test.js
node tests/stockfish-bridge-test.js
```

### 브라우저 시나리오 테스트 (Playwright)
`file://`로 열기 때문에 내장 엔진 경로를 검사합니다.
```bash
npm install
node playwright-tests/session1.js
```
`session1.js` ~ `session9-quality.js`까지 있습니다.

## 프로젝트 구조

```
├── index.html               # 진입점 (스크립트 로드 순서 = 의존 순서)
├── styles/main.css          # 전체 스타일
├── src/
│   ├── engine/
│   │   ├── board.js         # 보드 상태, 이동 적용, FEN, 포지션 키
│   │   ├── moves.js         # 이동 규칙, 체크·무승부 판정
│   │   ├── evaluator.js     # 내장 엔진 평가 함수
│   │   ├── ai.js            # 레벨 1~20 설정, 착수 선택, 내장 엔진(대체용)
│   │   └── stockfish.js     # Stockfish Web Worker 브리지 (상대 AI / 분석 분리)
│   ├── game/
│   │   ├── game.js          # 게임 흐름, 저장·불러오기, 무르기, 힌트
│   │   ├── quality.js       # 수 품질(!! ! ? ??) 백그라운드 분석
│   │   ├── review.js        # 복기 모드
│   │   └── openings.js      # 오프닝 이름 조회
│   ├── ui/
│   │   ├── renderer.js      # 체스판·기보 렌더링
│   │   ├── animator.js      # 이동 애니메이션
│   │   ├── effects.js       # 폭죽
│   │   ├── evalbar.js       # 평가 막대 · 오프닝 이름 표시
│   │   └── editor.js        # 기물 배치 모드
│   └── data/
│       └── openings-data.js # 오프닝 데이터 (자동 생성)
├── assets/stockfish/        # Stockfish.js 18 lite-single (JS + WASM)
├── tools/
│   ├── build-openings.js    # Lichess TSV → openings-data.js 변환
│   └── openings-src/        # Lichess 오프닝 원본 TSV
├── tests/                   # node 테스트
└── playwright-tests/        # 브라우저 시나리오 테스트
```

오프닝 데이터를 다시 만들 때는 아래 명령을 실행합니다.

```bash
node tools/build-openings.js
```

## 라이선스와 출처

- 이 프로젝트는 **GPLv3** 라이선스입니다([LICENSE](LICENSE)).
- [Stockfish.js](https://github.com/nmrugg/stockfish.js)는 (c) Chess.com, LLC 및 [Stockfish](https://github.com/official-stockfish/Stockfish) 개발팀의 저작물이며 GPLv3입니다([assets/stockfish/Copying.txt](assets/stockfish/Copying.txt)).
- 오프닝 데이터는 [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)의 것이며 CC0입니다([tools/openings-src/COPYING.txt](tools/openings-src/COPYING.txt)).
