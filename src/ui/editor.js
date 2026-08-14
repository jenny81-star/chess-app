/**
 * editor.js — 기물 배치 모드 (보드 에디터)
 * 전역: window.ChessEditor
 * 의존: window.ChessBoard, window.ChessMoves,
 *       window.ChessRenderer(PIECE_SVG), window.ChessGame (DOM 사용 시)
 *
 * 검증 로직(validatePlacement / validateStart)은 순수 함수로 두어
 * node 테스트에서도 그대로 사용할 수 있게 한다.
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const { createInitialState, createStateFromBoard } = root.ChessBoard;
  const { isInCheck } = root.ChessMoves;

  const PIECE_TYPES = ['K', 'Q', 'R', 'B', 'N', 'P'];
  const PIECE_KO    = { K: '킹', Q: '퀸', R: '룩', B: '비숍', N: '나이트', P: '폰' };

  // ── 에디터 상태 ──────────────────────────────────────────
  let editorBoard  = createEmptyBoard();
  let selectedTool = null;      // { kind:'piece', color, type } | { kind:'eraser' } | null
  let firstTurn    = 'white';   // 선공
  let _domReady    = false;

  function createEmptyBoard() {
    return Array.from({ length: 8 }, () => Array(8).fill(null));
  }

  // ── 순수 검증 로직 (node 테스트 대상) ─────────────────────

  // (skipR, skipC) 칸을 제외하고 킹 위치 탐색 (교체 배치 고려)
  function findKingSquare(board, color, skipR, skipC) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === skipR && c === skipC) continue;
        const p = board[r][c];
        if (p && p.type === 'K' && p.color === color) return [r, c];
      }
    }
    return null;
  }

  /**
   * 배치 시점 검증. 통과하면 null, 불가하면 한국어 사유 문자열 반환.
   * (row, col)에 이미 있는 기물은 교체되므로 개수 계산에서 제외한다.
   */
  function validatePlacement(board, row, col, piece) {
    if (piece.type === 'P' && (row === 0 || row === 7)) {
      return '폰은 1·8랭크에 놓을 수 없어요';
    }

    let total = 0, pawns = 0, kings = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === row && c === col) continue;   // 교체될 기물은 제외
        const p = board[r][c];
        if (p && p.color === piece.color) {
          total++;
          if (p.type === 'P') pawns++;
          if (p.type === 'K') kings++;
        }
      }
    }

    if (piece.type === 'K') {
      if (kings >= 1) return '킹은 한 개만 놓을 수 있어요';
      const enemy = piece.color === 'white' ? 'black' : 'white';
      const ek = findKingSquare(board, enemy, row, col);
      if (ek && Math.abs(ek[0] - row) <= 1 && Math.abs(ek[1] - col) <= 1) {
        return '두 킹을 서로 붙여 놓을 수 없어요';
      }
    }
    if (piece.type === 'P' && pawns >= 8) return '폰은 한 색에 8개까지만 놓을 수 있어요';
    if (total >= 16) return '기물은 한 색에 16개까지만 놓을 수 있어요';

    return null;
  }

  /**
   * 시작 시점 검증(▶ 버튼). 통과하면 null, 불가하면 사유 문자열.
   * 시작 즉시 체크메이트/스테일메이트인 포지션은 허용한다(책의 메이트 문제 재현용).
   */
  function validateStart(board, turn) {
    if (!findKingSquare(board, 'white') || !findKingSquare(board, 'black')) {
      return '백 킹과 흑 킹을 하나씩 놓아야 해요';
    }
    const waiting = turn === 'white' ? 'black' : 'white';
    if (isInCheck(board, waiting)) {
      return '차례가 아닌 쪽 킹이 이미 잡히는 자리예요';
    }
    return null;
  }

  function countPieces(board) {
    let white = 0, black = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) (p.color === 'white' ? white++ : black++);
      }
    }
    return { white, black };
  }

  // ── DOM (브라우저 전용) ───────────────────────────────────

  function toast(msg, type) {
    if (root.ChessGame && root.ChessGame.showToast) {
      root.ChessGame.showToast(msg, 2000, type || 'info');
    }
  }

  function initDom() {
    buildBoard();
    buildPalette();

    document.getElementById('editor-eraser').addEventListener('click', toggleEraser);
    document.getElementById('btn-editor-menu').addEventListener('click', () => {
      root.ChessGame.showMenu();
    });
    document.getElementById('btn-editor-initial').addEventListener('click', () => {
      editorBoard = createInitialState().board;
      render();
    });
    document.getElementById('btn-editor-clear').addEventListener('click', () => {
      editorBoard = createEmptyBoard();
      render();
    });
    document.getElementById('btn-editor-start').addEventListener('click', onStartClick);

    // 선공 선택
    document.querySelectorAll('.turn-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        firstTurn = btn.dataset.turn === 'black' ? 'black' : 'white';
        document.querySelectorAll('.turn-btn').forEach(b =>
          b.classList.toggle('selected', b.dataset.turn === firstTurn));
      });
    });

    // 대국 방식 선택 모달
    document.getElementById('editor-diff-row').addEventListener('click', (e) => {
      const pill = e.target.closest('.diff-pill');
      if (!pill) return;
      document.querySelectorAll('#editor-diff-row .diff-pill').forEach(p =>
        p.classList.toggle('selected', p === pill));
    });
    document.getElementById('btn-editor-start-ai').addEventListener('click', () => {
      const sel = document.querySelector('#editor-diff-row .diff-pill.selected');
      startGame('ai', sel ? sel.dataset.difficulty : '중급');
    });
    document.getElementById('btn-editor-start-free').addEventListener('click', () => {
      startGame('2p');
    });
    document.getElementById('btn-editor-start-cancel').addEventListener('click', () => {
      document.getElementById('editor-start-modal').style.display = 'none';
    });
  }

  function buildBoard() {
    const boardEl = document.getElementById('editor-board');
    boardEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const square = document.createElement('div');
        square.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        square.dataset.row = r;
        square.dataset.col = c;

        if (c === 0) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'coord rank-label';
          rankLabel.textContent = 8 - r;
          square.appendChild(rankLabel);
        }
        if (r === 7) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'coord file-label';
          fileLabel.textContent = 'abcdefgh'[c];
          square.appendChild(fileLabel);
        }
        boardEl.appendChild(square);
      }
    }
    boardEl.addEventListener('click', (e) => {
      const square = e.target.closest('.square');
      if (!square) return;
      onSquareClick(parseInt(square.dataset.row), parseInt(square.dataset.col));
    });
  }

  function buildPalette() {
    const svg = root.ChessRenderer.PIECE_SVG;
    ['white', 'black'].forEach(color => {
      const grid = document.getElementById('palette-' + color);
      grid.innerHTML = '';
      PIECE_TYPES.forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'palette-piece';
        btn.dataset.color = color;
        btn.dataset.type  = type;
        btn.title = (color === 'white' ? '백 ' : '흑 ') + PIECE_KO[type];
        btn.innerHTML = svg[color][type];
        btn.addEventListener('click', () => selectPieceTool(color, type));
        grid.appendChild(btn);
      });
    });
  }

  // ── 팔레트 도구 선택 ──────────────────────────────────────

  function selectPieceTool(color, type) {
    if (selectedTool && selectedTool.kind === 'piece' &&
        selectedTool.color === color && selectedTool.type === type) {
      selectedTool = null;   // 같은 기물 다시 클릭 → 선택 해제
    } else {
      selectedTool = { kind: 'piece', color, type };
    }
    updateToolUI();
  }

  function toggleEraser() {
    selectedTool = (selectedTool && selectedTool.kind === 'eraser')
      ? null
      : { kind: 'eraser' };
    updateToolUI();
  }

  function updateToolUI() {
    document.querySelectorAll('.palette-piece').forEach(btn => {
      btn.classList.toggle('selected',
        !!selectedTool && selectedTool.kind === 'piece' &&
        btn.dataset.color === selectedTool.color &&
        btn.dataset.type === selectedTool.type);
    });
    document.getElementById('editor-eraser').classList.toggle('selected',
      !!selectedTool && selectedTool.kind === 'eraser');
  }

  // ── 보드 클릭: 배치 / 제거 ────────────────────────────────

  function onSquareClick(row, col) {
    const existing = editorBoard[row][col];

    if (!selectedTool) {
      // 팔레트 선택 없이 배치된 기물 클릭 → 제거
      if (existing) {
        editorBoard[row][col] = null;
        render();
      } else {
        toast('팔레트에서 기물을 먼저 골라 주세요', 'info');
      }
      return;
    }

    if (selectedTool.kind === 'eraser') {
      if (existing) {
        editorBoard[row][col] = null;
        render();
      }
      return;
    }

    // 기물 배치 (이미 있으면 교체)
    const piece = { type: selectedTool.type, color: selectedTool.color };
    const err = validatePlacement(editorBoard, row, col, piece);
    if (err) {
      toast(err, 'error');
      return;
    }
    editorBoard[row][col] = piece;
    render();
  }

  // ── 렌더링 ────────────────────────────────────────────────

  function render() {
    const boardEl = document.getElementById('editor-board');
    const svg = root.ChessRenderer.PIECE_SVG;

    boardEl.querySelectorAll('.piece').forEach(el => el.remove());
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = editorBoard[r][c];
        if (!piece) continue;
        const squareEl = boardEl.querySelector(
          '.square[data-row="' + r + '"][data-col="' + c + '"]');
        if (!squareEl) continue;
        const div = document.createElement('div');
        div.className = 'piece';
        div.innerHTML = svg[piece.color][piece.type];
        squareEl.appendChild(div);
      }
    }

    const counts = countPieces(editorBoard);
    document.getElementById('editor-count').textContent =
      '백 ' + counts.white + ' · 흑 ' + counts.black;
  }

  // ── 시작 흐름 ─────────────────────────────────────────────

  function onStartClick() {
    const err = validateStart(editorBoard, firstTurn);
    if (err) {
      toast(err, 'error');
      return;
    }
    document.getElementById('editor-start-modal').style.display = 'flex';
  }

  function startGame(mode, difficulty) {
    document.getElementById('editor-start-modal').style.display = 'none';
    const state = createStateFromBoard(editorBoard, {
      turn:       firstTurn,
      mode:       mode,
      difficulty: difficulty || '중급',
    });
    root.ChessGame.startFromPosition(state);
  }

  // ── 화면 진입 ─────────────────────────────────────────────

  function open() {
    if (!_domReady) {
      initDom();
      _domReady = true;
    }
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('editor-screen').style.display = 'flex';
    render();
  }

  // ── 전역 노출 ─────────────────────────────────────────────
  root.ChessEditor = {
    open,
    // 순수 로직 (테스트용)
    validatePlacement,
    validateStart,
    countPieces,
    createEmptyBoard,
    getBoard: () => editorBoard,
  };
})();
