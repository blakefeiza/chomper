// Chomper: game loop, input, audio hooks and the flow between title, play and score entry.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), cab = $('cab'), stage = $('stage');
  var renderer = null, game = null, ui = { mode: 'title', highScore: 0 };
  var paused = false, acc = 0, last = 0, endTimer = null, viewMode = 'play';
  var KEYS = { ArrowUp: 0, ArrowLeft: 1, ArrowDown: 2, ArrowRight: 3, w: 0, a: 1, s: 2, d: 3, W: 0, A: 1, S: 2, D: 3 };

  // ---------- layout: fit the cabinet beside (or above) the board ----------
  function layout() {
    var narrow = window.innerWidth < 820, views = $('views');
    var availW = narrow ? window.innerWidth - 24 : views.clientWidth;
    var availH = narrow ? Math.min(window.innerHeight * 0.9 - 50, 1000) : views.clientHeight;
    var w = Math.max(200, Math.min(availW, availH * 224 / 288));
    cab.style.width = Math.floor(w) + 'px'; cab.style.height = Math.floor(w * 288 / 224) + 'px';
    var sw = $('swarm'); sw.style.height = narrow ? Math.round(Math.min(window.innerWidth * 1.34, 780)) + 'px' : ''; 
    if (renderer && viewMode === 'play') renderer.resize();
    document.documentElement.style.setProperty('--u', (w / 224) + 'px');   // one logical game pixel, used for overlay text sizing
    moveThumb();
  }
  function moveThumb() {
    var b = viewMode === 'play' ? $('modePlay') : $('modeSwarm'), t = $('segThumb');
    t.style.left = b.offsetLeft + 'px'; t.style.width = b.offsetWidth + 'px';
  }
  function setMode(m) {
    if (m === viewMode) return;
    viewMode = m;
    $('modePlay').classList.toggle('on', m === 'play'); $('modeSwarm').classList.toggle('on', m === 'swarm');
    if (m === 'swarm') {
      if (game && game.state === 'playing' && !paused) togglePause();
      PMAudio.loop('off');
      cab.style.display = 'none'; $('swarm').hidden = false; layout(); PMSwarmView.show();
    } else {
      PMSwarmView.hide(); $('swarm').hidden = true; cab.style.display = ''; layout();
    }
    moveThumb();
  }
  $('modePlay').onclick = function () { setMode('play'); };
  $('modeSwarm').onclick = function () { setMode('swarm'); };
  document.addEventListener('chomp:swarm', function () { setMode('swarm'); });

  // ---------- flow ----------
  function startGame() {
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    PMAudio.unlock(); window.focus();
    game = new PM.Game(); ui.mode = 'play'; paused = false; $('pause').classList.remove('on');
    PMBoard.clearYou();
  }
  function toTitle() { game = null; ui.mode = 'title'; PMAudio.loop('off'); }

  function handleEvents() {
    var ev = game.events.splice(0), i;
    for (i = 0; i < ev.length; i++) {
      var t = ev[i].type;
      if (t === 'dot' || t === 'pellet' || t === 'ghost' || t === 'fruit' || t === 'extralife' || t === 'death' || t === 'clear') PMAudio.play(t);
      if (t === 'ready' && ev[i].data.first) PMAudio.play('ready');
      if (t === 'death' || t === 'clear') PMAudio.loop('off');
      if (t === 'gameover') {
        var run = ev[i].data;
        endTimer = setTimeout(function () {
          endTimer = null;
          PMBoard.showEntry(run, function (again) { if (again) startGame(); else toTitle(); });
        }, 2200);
      }
    }
  }
  function ambience() {
    if (!game || game.state !== 'playing') { if (game && game.state !== 'eating') PMAudio.loop('off'); return; }
    var eyes = game.ghosts.some(function (g) { return g.state === 'eaten' || g.state === 'entering'; });
    if (eyes) PMAudio.loop('eyes'); else if (game.frightTimer > 0) PMAudio.loop('fright');
    else PMAudio.loop('siren', 1 - game.dotsLeft / game.dotsTotal);
  }

  // ---------- main loop ----------
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.25, (now - (last || now)) / 1000); last = now;
    if (game && !paused) {
      acc += dt;
      var n = 0;
      while (acc >= 1 / 60 && n++ < 6) { game.update(); acc -= 1 / 60; handleEvents(); if (!game) break; }
      if (game) ambience();
    } else acc = 0;
    ui.highScore = Math.max(PMBoard.highScore(), game ? game.score : 0);
    renderer.draw(game, ui);
  }

  // ---------- input ----------
  function dirKey(e) { return Object.prototype.hasOwnProperty.call(KEYS, e.key) ? KEYS[e.key] : -1; }
  window.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (viewMode === 'swarm') { if (e.key === 'm' || e.key === 'M') toggleMute(); return; }
    var d = dirKey(e);
    if (d >= 0) { e.preventDefault(); if (game && game.state !== 'over') game.setDir(d); else if (ui.mode === 'title' && !$('overlay').classList.contains('on')) startGame(); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      if ($('overlay').classList.contains('on')) return;
      e.preventDefault(); if (ui.mode === 'title') startGame(); else if (e.key === ' ') togglePause();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (game && game.state !== 'over') togglePause(); }
    else if (e.key === 'm' || e.key === 'M') toggleMute();
  });
  function togglePause() { paused = !paused; $('pause').classList.toggle('on', paused); if (paused) PMAudio.loop('off'); }
  function toggleMute() { PMAudio.setMuted(!PMAudio.isMuted()); $('mute').innerHTML = PMAudio.isMuted() ? '&#128263;' : '&#128266;'; }
  $('mute').onclick = function (e) { e.stopPropagation(); toggleMute(); };
  $('mute').innerHTML = PMAudio.isMuted() ? '&#128263;' : '&#128266;';
  canvas.addEventListener('pointerdown', function (e) { if (ui.mode === 'title' && !$('overlay').classList.contains('on')) startGame(); else if (paused) togglePause(); });
  $('pause').addEventListener('pointerdown', function () { if (paused) togglePause(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && game && game.state === 'playing' && !paused) togglePause(); });
  window.addEventListener('blur', function () { if (game && game.state === 'playing' && !paused) togglePause(); });

  // swipe + on-screen d-pad (touch)
  var sx = 0, sy = 0, swiping = false;
  canvas.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; swiping = true; }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (!swiping || !game) return; var t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 18 || Math.abs(dy) > 18) { game.setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 2 : 0)); sx = t.clientX; sy = t.clientY; }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function () { swiping = false; });
  [].forEach.call(document.querySelectorAll('#dpad button'), function (b) {
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); if (game) game.setDir(+b.getAttribute('data-d')); else if (ui.mode === 'title') startGame(); });
  });
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  // ---------- boot ----------
  function boot() {
    layout();
    renderer = new PMRender.Renderer(canvas);
    layout();
    PMBoard.init();
    PMBoard.onUpdate = function () { if (viewMode === 'swarm') PMSwarmView.refresh(); };
    window.addEventListener('resize', layout);
    if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
    requestAnimationFrame(frame);
  }
  var fontReady = document.fonts && document.fonts.load ? document.fonts.load('8px "Press Start 2P"').catch(function () {}) : Promise.resolve();
  Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(boot);

  window.__chomper = { get game() { return game; }, start: startGame, ui: ui, setMode: setMode };   // handy for debugging
})();
