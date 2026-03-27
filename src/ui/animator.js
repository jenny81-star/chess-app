/**
 * animator.js — 기물 슬라이드 이동 애니메이션
 * 전역: window.ChessAnimator
 * 의존: 없음 (DOM 직접 접근)
 */
(function () {
  'use strict';

  function getSquareEl(row, col) {
    return document.querySelector('.square[data-row="' + row + '"][data-col="' + col + '"]');
  }

  /**
   * 기물 하나를 목적지 칸까지 슬라이드 애니메이션
   * @param {HTMLElement} pieceEl  - 이동할 .piece 요소
   * @param {HTMLElement} targetSq - 목적지 .square 요소
   * @returns {Promise}
   */
  function animateSinglePiece(pieceEl, targetSq) {
    return new Promise(function (resolve) {
      if (!pieceEl || !targetSq) { resolve(); return; }

      var fromSqRect = pieceEl.parentElement.getBoundingClientRect();
      var toSqRect   = targetSq.getBoundingClientRect();

      var dx = toSqRect.left - fromSqRect.left;
      var dy = toSqRect.top  - fromSqRect.top;

      // 애니메이션 중 다른 기물 위에 렌더링되도록 z-index 올리기
      pieceEl.style.zIndex     = '50';
      // main.css의 0.1s transition을 덮어씀
      pieceEl.style.transition = 'transform 0.18s ease-in-out';
      pieceEl.style.transform  = 'translate(' + dx + 'px, ' + dy + 'px)';

      var done = false;
      function finish() {
        if (done) return;
        done = true;
        pieceEl.style.transition = '';
        pieceEl.style.transform  = '';
        pieceEl.style.zIndex     = '';
        resolve();
      }

      pieceEl.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 250); // transitionend 미발생 대비 fallback
    });
  }

  /**
   * 이동 정보로 필요한 기물들을 애니메이션
   * @param {Array}  board - 현재 board[row][col] (이동 전 상태)
   * @param {Object} move  - { from, to, castling? }
   * @returns {Promise}
   */
  function animateMove(board, move) {
    var fromRow = move.from[0], fromCol = move.from[1];
    var toRow   = move.to[0],   toCol   = move.to[1];

    var fromSqEl = getSquareEl(fromRow, fromCol);
    var toSqEl   = getSquareEl(toRow,   toCol);
    var pieceEl  = fromSqEl ? fromSqEl.querySelector('.piece') : null;

    if (move.castling) {
      // 킹 + 룩 동시 슬라이드
      var rookFromCol, rookToCol;
      if (move.castling === 'kingside') {
        rookFromCol = 7; rookToCol = 5;
      } else {
        rookFromCol = 0; rookToCol = 3;
      }
      var rookRow    = fromRow;  // 킹과 같은 랭크
      var rookFromSq = getSquareEl(rookRow, rookFromCol);
      var rookToSq   = getSquareEl(rookRow, rookToCol);
      var rookEl     = rookFromSq ? rookFromSq.querySelector('.piece') : null;

      return Promise.all([
        animateSinglePiece(pieceEl, toSqEl),
        animateSinglePiece(rookEl,  rookToSq),
      ]);
    }

    return animateSinglePiece(pieceEl, toSqEl);
  }

  window.ChessAnimator = { animateMove };

})();
