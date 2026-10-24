/**
 * openings.js — 오프닝 이름 조회
 * 전역: window.ChessOpenings
 * 의존(호출 시점): window.ChessOpeningsData (src/data/openings-data.js)
 *
 * 데이터: Lichess chess-openings (CC0) — tools/build-openings.js로 변환.
 * 키는 ChessBoard.positionKey를 압축한 문자열이라 수순이 달라도(트랜스포지션)
 * 같은 포지션이면 같은 이름이 나온다.
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;

  // positionKey('rnbqkbnr pppppppp ........ ...w KQkq') → 빈칸 연속을 숫자로 압축
  function compactKey(positionKey) {
    return positionKey.replace(/\.+/g, m => String(m.length));
  }

  function lookupKey(positionKey) {
    const data = root.ChessOpeningsData;
    if (!data || !positionKey) return null;
    const hit = data[compactKey(positionKey)];
    if (!hit) return null;
    const bar = hit.indexOf('|');
    return { eco: hit.slice(0, bar), name: hit.slice(bar + 1) };
  }

  // 게임 상태의 포지션 기록에서 가장 최근(가장 깊은) 오프닝 — 책을 벗어나도 마지막 이름 유지
  function nameFor(state) {
    const keys = state && state.positionKeys;
    if (!keys) return null;
    for (let i = keys.length - 1; i >= 0; i--) {
      const hit = lookupKey(keys[i]);
      if (hit) return hit;
    }
    return null;
  }

  root.ChessOpenings = { compactKey, lookupKey, nameFor };
})();
