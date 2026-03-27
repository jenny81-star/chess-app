/**
 * effects.js — 폭죽(confetti) 이펙트
 * 전역: window.ChessEffects
 * 의존: 없음 (#confetti-canvas DOM 요소)
 */
(function () {
  'use strict';

  var _canvas    = null;
  var _ctx       = null;
  var _rafId     = null;
  var _particles = [];

  var COLORS = [
    '#f5d98a', '#e2b96f', '#ffd700', '#a07834',  // 골드
    '#50c878', '#2ecc71', '#27ae60',              // 그린
    '#e74c3c', '#c0392b', '#ff6b6b',              // 레드
    '#ffffff', '#f0d9b5', '#dda0dd',              // 흰/크림/라벤더
  ];

  function randomBetween(a, b) {
    return a + Math.random() * (b - a);
  }

  function createParticle(canvasWidth) {
    return {
      x:             randomBetween(canvasWidth * 0.2, canvasWidth * 0.8),
      y:             -10,
      vx:            randomBetween(-3.5, 3.5),
      vy:            randomBetween(2.5, 6),
      gravity:       0.12,
      color:         COLORS[Math.floor(Math.random() * COLORS.length)],
      size:          randomBetween(6, 13),
      rotation:      randomBetween(0, 360),
      rotationSpeed: randomBetween(-8, 8),
      opacity:       1,
      shape:         Math.random() < 0.5 ? 'rect' : 'circle',
    };
  }

  function drawParticle(ctx, p) {
    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle   = p.color;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation * Math.PI / 180);

    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 납작한 직사각형 — 실제 폭죽 조각처럼 보임
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    }

    ctx.restore();
  }

  function launchConfetti() {
    _canvas = document.getElementById('confetti-canvas');
    if (!_canvas) return;
    _ctx = _canvas.getContext('2d');

    // canvas 해상도를 뷰포트에 맞춤
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
    _canvas.style.display = 'block';

    // 파티클 생성
    _particles = [];
    for (var i = 0; i < 40; i++) {
      _particles.push(createParticle(_canvas.width));
    }

    var startTime = null;
    var DURATION  = 3000; // ms

    if (_rafId) cancelAnimationFrame(_rafId);

    function frame(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;

      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

      for (var j = 0; j < _particles.length; j++) {
        var p = _particles[j];
        p.x        += p.vx;
        p.y        += p.vy;
        p.vy       += p.gravity;
        p.rotation += p.rotationSpeed;

        // 마지막 1초 동안 서서히 사라짐
        if (elapsed > DURATION - 1000) {
          p.opacity = Math.max(0, 1 - (elapsed - (DURATION - 1000)) / 1000);
        }

        drawParticle(_ctx, p);
      }

      if (elapsed < DURATION) {
        _rafId = requestAnimationFrame(frame);
      } else {
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
        _canvas.style.display = 'none';
        _particles = [];
        _rafId = null;
      }
    }

    _rafId = requestAnimationFrame(frame);
  }

  window.ChessEffects = { launchConfetti };

})();
