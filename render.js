// Chomper renderer: everything is drawn as vectors on a 224 x 288 logical canvas (28 x 36 tiles of 8 px).
(function () {
  'use strict';
  var PM = window.PM, T = PM.T, W = 224, H = 288, OY = 24;
  var GHOST_COLORS = ['#ff2a2a', '#ffb8ff', '#19f0ff', '#ffb851'];
  var WALL = '#2f4bff', WALL_GLOW = 'rgba(70,110,255,.85)';
  var DOT = '#ffd9c9', YEL = '#ffe100';
  var FONT = '"Press Start 2P", "Courier New", monospace';

  // ---------- maze outline: trace the boundary of the wall tiles, inset toward the wall, with rounded corners ----------
  function wallAt(x, y) {
    if (y < 0 || y >= PM.ROWS) return false;
    if (x < 0 || x >= PM.COLS) return y >= 13 && y <= 15;   // tunnel mouths stay open at the screen edge
    return PM.MAZE[y][x] === '#';
  }
  function traceLoops() {
    var edges = {}, key = function (x, y) { return x + ',' + y; }, y, x, list = [], inc = {};
    function add(x0, y0, x1, y1) {
      var k = key(x0, y0), e = { x0: x0, y0: y0, x1: x1, y1: y1, used: false };
      (edges[k] = edges[k] || []).push(e); list.push(e); inc[key(x1, y1)] = (inc[key(x1, y1)] || 0) + 1;
    }
    for (y = 0; y < PM.ROWS; y++) for (x = 0; x < PM.COLS; x++) {
      if (!wallAt(x, y)) continue;
      if (!wallAt(x, y - 1)) add(x, y, x + 1, y);
      if (!wallAt(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!wallAt(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!wallAt(x - 1, y)) add(x, y + 1, x, y);
    }
    var out = [];
    function follow(e0, open) {
      var pts = [], e = e0;
      while (e && !e.used) {
        e.used = true; pts.push({ x: e.x0, y: e.y0 });
        var nxt = edges[key(e.x1, e.y1)], nn = nxt ? nxt.filter(function (c) { return !c.used; })[0] : null;
        if (!nn && open) pts.push({ x: e.x1, y: e.y1 });
        e = nn;
      }
      if (pts.length > 2) out.push({ pts: pts, open: open });
    }
    // open chains first (they end at the screen edge, where the tunnel leaves the maze), then closed loops
    list.forEach(function (e0) { if (!e0.used && !inc[key(e0.x0, e0.y0)]) follow(e0, true); });
    list.forEach(function (e0) { if (!e0.used) follow(e0, false); });
    return out;
  }
  var LOOPS = null;
  function insetLoop(ch, d) {
    var pts = ch.pts, n = pts.length, out = [], open = ch.open;
    for (var i = 0; i < n; i++) {
      var hasPrev = !(open && i === 0), hasNext = !(open && i === n - 1);
      var a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n], nx = 0, ny = 0, nrm = [];
      if (hasPrev) { var d1 = [Math.sign(b.x - a.x), Math.sign(b.y - a.y)]; nrm.push([-d1[1], d1[0]]); }
      if (hasNext) { var d2 = [Math.sign(c.x - b.x), Math.sign(c.y - b.y)]; nrm.push([-d2[1], d2[0]]); }
      if (nrm.length === 2 && nrm[0][0] === nrm[1][0] && nrm[0][1] === nrm[1][1]) nrm.pop();
      nrm.forEach(function (v) { nx += v[0]; ny += v[1]; });
      out.push({ x: b.x * T + nx * d, y: b.y * T + ny * d });
    }
    return { pts: out, open: open };
  }
  function strokeLoops(ctx, color, glow, lw) {
    if (!LOOPS) LOOPS = traceLoops().map(function (l) { return insetLoop(l, 2.8); });
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.shadowColor = glow; ctx.shadowBlur = 5;
    LOOPS.forEach(function (ch) {
      var p = ch.pts, n = p.length, r = 2.6, i;
      ctx.beginPath();
      if (ch.open) {
        ctx.moveTo(p[0].x, p[0].y);
        for (i = 1; i < n - 1; i++) ctx.arcTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2, r);
        ctx.lineTo(p[n - 1].x, p[n - 1].y);
      } else {
        ctx.moveTo((p[n - 1].x + p[0].x) / 2, (p[n - 1].y + p[0].y) / 2);
        for (i = 0; i < n; i++) { var nx = p[(i + 1) % n]; ctx.arcTo(p[i].x, p[i].y, (p[i].x + nx.x) / 2, (p[i].y + nx.y) / 2, r); }
        ctx.closePath();
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  // ---------- sprites ----------
  function drawPac(ctx, x, y, dir, half, scale) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate([-Math.PI / 2, Math.PI, Math.PI / 2, 0][dir]);
    if (scale) ctx.scale(scale, scale);
    ctx.fillStyle = YEL; ctx.shadowColor = 'rgba(255,225,0,.65)'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 6.6, half, Math.PI * 2 - half); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function pacHalf(p) {
    if (!p.moving && p.anim === 0) return 0.5;
    var a = (p.anim % 9) / 9, o = a < 0.5 ? a * 2 : 2 - a * 2;
    return 0.06 + o * 0.78;
  }
  function eyes(ctx, dir) {
    var dx = [0, -1, 0, 1][dir], dy = [-1, 0, 1, 0][dir];
    ctx.fillStyle = '#fff';
    [-2.8, 2.8].forEach(function (ex) { ctx.beginPath(); ctx.ellipse(ex + dx * 0.8, -2 + dy * 0.8, 2.1, 2.8, 0, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#1b2bff';
    [-2.8, 2.8].forEach(function (ex) { ctx.beginPath(); ctx.arc(ex + dx * 1.9, -2 + dy * 2.1, 1.15, 0, 7); ctx.fill(); });
  }
  function drawGhost(ctx, g, frightFrames, flashing, frame) {
    ctx.save(); ctx.translate(g.x, g.y);
    if (g.state === 'eaten' || g.state === 'entering') { eyes(ctx, g.dir); ctx.restore(); return; }
    var fr = g.fright, white = fr && flashing && Math.floor(frame / 10) % 2 === 0;
    var col = fr ? (white ? '#ffffff' : '#2231ff') : GHOST_COLORS[g.id];
    ctx.fillStyle = col; ctx.shadowColor = fr ? 'rgba(60,80,255,.6)' : col; ctx.shadowBlur = 6;
    var f = Math.floor(g.anim / 8) % 2;
    ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(-7, -1); ctx.arc(0, -1, 7, Math.PI, 0); ctx.lineTo(7, 7);
    var k;
    for (k = 0; k < 6; k++) { var px = 7 - (k + 1) * (14 / 6); ctx.lineTo(px, ((k + f) % 2 === 0) ? 4.2 : 7); }
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    if (fr) {
      ctx.fillStyle = white ? '#ff2a2a' : '#ffd9c9'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1;
      ctx.fillRect(-3.4, -3, 2, 2.4); ctx.fillRect(1.4, -3, 2, 2.4);
      ctx.beginPath(); ctx.moveTo(-5, 3.6); for (k = 0; k < 6; k++) ctx.lineTo(-5 + (k + 1) * 10 / 6, k % 2 === 0 ? 2 : 3.8); ctx.stroke();
    } else eyes(ctx, g.dir);
    ctx.restore();
  }
  function drawFruit(ctx, name, x, y, s) {
    ctx.save(); ctx.translate(x, y); if (s) ctx.scale(s, s);
    var c = function (cx, cy, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); };
    if (name === 'cherry') {
      ctx.strokeStyle = '#3ad03a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, 2); ctx.quadraticCurveTo(-1, -5, 3, -6); ctx.moveTo(3, 1); ctx.quadraticCurveTo(3, -4, 3, -6); ctx.stroke();
      c(-3, 3, 3, '#ff2a2a'); c(3.2, 2.6, 3, '#ff2a2a'); c(-4, 2, 0.8, '#ffd0d0');
    } else if (name === 'strawberry') {
      ctx.fillStyle = '#ff2a4a'; ctx.beginPath(); ctx.moveTo(-5, -2); ctx.quadraticCurveTo(0, -5, 5, -2); ctx.quadraticCurveTo(4, 4, 0, 6); ctx.quadraticCurveTo(-4, 4, -5, -2); ctx.fill();
      ctx.fillStyle = '#3ad03a'; ctx.fillRect(-3, -4, 6, 2); ctx.fillStyle = '#fff'; [[-2, 0], [2, 0], [0, 2], [-1, 4], [1.5, 3.5]].forEach(function (q) { ctx.fillRect(q[0], q[1], 1, 1); });
    } else if (name === 'orange') {
      c(0, 1, 5, '#ff9a1a'); ctx.fillStyle = '#3ad03a'; ctx.fillRect(-1, -5, 2, 2); c(-1.6, -0.6, 1, '#ffd08a');
    } else if (name === 'apple') {
      c(0, 1, 5, '#ff2a2a'); ctx.fillStyle = '#3ad03a'; ctx.fillRect(0, -6, 2, 3); c(-1.8, -0.6, 1.1, '#ffb0b0');
    } else if (name === 'melon') {
      c(0, 1, 5, '#3ad03a'); ctx.strokeStyle = '#b9ffb0'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 2); ctx.moveTo(-3, 4); ctx.lineTo(3, -1); ctx.moveTo(0, -4); ctx.lineTo(0, 6); ctx.stroke();
    } else if (name === 'galaxian') {
      ctx.fillStyle = YEL; ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(0, 0); ctx.lineTo(6, -4); ctx.lineTo(4, 2); ctx.lineTo(0, 6); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff2a2a'; ctx.fillRect(-1, -3, 2, 6); ctx.fillStyle = '#2f4bff'; ctx.fillRect(-5, -4, 2, 2); ctx.fillRect(3, -4, 2, 2);
    } else if (name === 'bell') {
      ctx.fillStyle = YEL; ctx.beginPath(); ctx.moveTo(-5, 4); ctx.quadraticCurveTo(-5, -6, 0, -6); ctx.quadraticCurveTo(5, -6, 5, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#19f0ff'; ctx.fillRect(-6, 3, 12, 2); c(0, 6, 1.3, '#fff');
    } else {   // key
      ctx.strokeStyle = '#19f0ff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -3, 2.6, 0, 7); ctx.moveTo(0, -0.4); ctx.lineTo(0, 6); ctx.moveTo(0, 4); ctx.lineTo(2.6, 4); ctx.moveTo(0, 6); ctx.lineTo(2.6, 6); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- renderer ----------
  function Renderer(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.mazeCache = {}; this.scale = 1; this.t = 0;
    this.resize();
  }
  Renderer.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var cw = this.canvas.clientWidth || W;
    this.scale = cw * dpr / W;
    this.canvas.width = Math.round(W * this.scale); this.canvas.height = Math.round(H * this.scale);
    this.mazeCache = {};
  };
  Renderer.prototype.mazeLayer = function (color, glow) {
    var k = color;
    if (this.mazeCache[k]) return this.mazeCache[k];
    var c = document.createElement('canvas'); c.width = this.canvas.width; c.height = Math.round(PM.ROWS * T * this.scale) + 8;
    var x = c.getContext('2d'); x.scale(this.scale, this.scale);
    strokeLoops(x, color, glow, 1.7);
    x.fillStyle = '#ffb8d0'; x.shadowColor = 'rgba(255,150,200,.9)'; x.shadowBlur = 4;
    x.fillRect(13 * T, 12 * T + 2.5, 16, 2.2);
    this.mazeCache[k] = c; return c;
  };
  Renderer.prototype.text = function (s, x, y, color, size, align) {
    var c = this.ctx; c.font = (size || 8) + 'px ' + FONT; c.fillStyle = color || '#fff'; c.textAlign = align || 'left'; c.textBaseline = 'middle';
    c.fillText(s, x, y);
  };

  Renderer.prototype.draw = function (g, ui) {
    var c = this.ctx, sc = this.scale; this.t++;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(sc, 0, 0, sc, 0, 0);
    var playing = g && ui.mode !== 'title';
    var flashWhite = g && g.state === 'clear' && g.stateTimer > 60 && Math.floor((g.stateTimer - 60) / 15) % 2 === 0;
    var layer = this.mazeLayer(flashWhite ? '#ffffff' : WALL, flashWhite ? 'rgba(255,255,255,.9)' : WALL_GLOW);
    c.save(); c.translate(0, OY); c.scale(1 / sc, 1 / sc); c.drawImage(layer, 0, 0); c.restore();

    c.save(); c.translate(0, OY);
    var grid = g ? g.grid : PM.MAZE.map(function (r) { return r.split(''); });
    var blink = Math.floor(this.t / 14) % 2 === 0, x, y;
    if (!(g && g.state === 'clear' && g.stateTimer > 60)) {
      c.fillStyle = DOT;
      for (y = 0; y < PM.ROWS; y++) for (x = 0; x < PM.COLS; x++) {
        var ch = grid[y][x];
        if (ch === '.') c.fillRect(x * T + 3, y * T + 3, 2, 2);
        else if (ch === 'o' && (blink || !playing)) { c.save(); c.shadowColor = 'rgba(255,217,201,.8)'; c.shadowBlur = 6; c.beginPath(); c.arc(x * T + 4, y * T + 4, 3.6, 0, 7); c.fill(); c.restore(); }
      }
    }
    c.beginPath(); c.rect(0, -OY, W, H); c.clip();

    if (g && ui.mode !== 'title') {
      if (g.fruit) drawFruit(c, g.fruit.kind.name, g.fruit.x, g.fruit.y, 1.1);
      var st = g.state, showGhosts = !(st === 'dying' && g.stateTimer > 60) && st !== 'over';
      var flashing = g.frightTimer > 0 && g.frightTimer < g.cfg.flashes * 20;
      if (showGhosts) for (var i = 3; i >= 0; i--) {
        var gh = g.ghosts[i]; if (st === 'eating' && g.eatenGhost === i) continue;
        drawGhost(c, gh, g.cfg.frightFrames, flashing, this.t);
      }
      var p = g.pac;
      if (st === 'dying') {
        var d = g.stateTimer - 60;
        if (d < 0) drawPac(c, p.x, p.y, p.dir, pacHalf(p));
        else if (d < 105) drawPac(c, p.x, p.y, 0, 0.5 + d / 105 * (Math.PI - 0.5), 1);
        else if (d < 125) { c.save(); c.translate(p.x, p.y); c.strokeStyle = YEL; c.lineWidth = 1.2; var rr = (d - 105) / 20; for (var s = 0; s < 8; s++) { var a = s / 8 * 6.283; c.beginPath(); c.moveTo(Math.cos(a) * (3 + rr * 4), Math.sin(a) * (3 + rr * 4)); c.lineTo(Math.cos(a) * (6 + rr * 6), Math.sin(a) * (6 + rr * 6)); c.stroke(); } c.restore(); }
      } else if (st !== 'eating' && st !== 'over') drawPac(c, p.x, p.y, p.dir, st === 'ready' ? 0.5 : pacHalf(p));
      g.pops.forEach(function (o) { c.save(); c.globalAlpha = Math.min(1, o.t / 20); c.font = '6px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = o.c; c.shadowColor = o.c; c.shadowBlur = 4; c.fillText(o.text, o.x, o.y - Math.max(0, 6 * (1 - o.t / 120))); c.restore(); });
    }
    c.restore();

    // HUD
    this.hud(g, ui);
    if (!playing) this.title(ui);
    else if (g.state === 'ready') {
      if (g.firstReady) this.text('PLAYER ONE', 112, OY + 11 * T + 4, '#19f0ff', 8, 'center');
      this.text('READY!', 112, OY + 17 * T + 4, YEL, 8, 'center');
    } else if (g.state === 'over') this.text('GAME  OVER', 112, OY + 17 * T + 4, '#ff2a2a', 8, 'center');
  };

  Renderer.prototype.hud = function (g, ui) {
    var c = this.ctx, blink = Math.floor(this.t / 20) % 2 === 0;
    if (blink || (g && g.state !== 'playing')) this.text('1UP', 32, 7, '#fff', 8, 'center');
    this.text(String(g && ui.mode !== 'title' ? g.score : 0).replace(/^0+(?=\d)/, ''), 56, 17, '#fff', 8, 'right');
    this.text('HIGH SCORE', 112, 7, '#fff', 8, 'center');
    this.text(String(ui.highScore || 0), 128, 17, '#fff', 8, 'right');
    // lives and fruit history
    var lives = g && ui.mode !== 'title' ? Math.max(0, g.lives - 1) : 2, i;
    for (i = 0; i < Math.min(lives, 5); i++) drawPac(c, 14 + i * 16, 280, 1, 0.55, 0.95);
    var lvl = g && ui.mode !== 'title' ? g.level : 1;
    for (i = 0; i < Math.min(lvl, 7); i++) {
      var L = lvl - Math.min(lvl, 7) + 1 + i, name = PM.FRUITS[Math.min(L, 13) - 1].name;
      drawFruit(c, name, 210 - (Math.min(lvl, 7) - 1 - i) * 16, 280, 1);
    }
  };

  Renderer.prototype.title = function (ui) {
    var c = this.ctx, t = this.t;
    c.save(); c.fillStyle = 'rgba(2,3,12,.72)'; c.fillRect(0, OY, W, 31 * T); c.restore();
    var pulse = 0.5 + 0.5 * Math.sin(t / 14);
    c.save(); c.shadowColor = 'rgba(255,225,0,.9)'; c.shadowBlur = 12;
    this.text('CHOMPER', 112, 78, YEL, 22, 'center'); c.restore();
    this.text('FREE PLAY', 112, 106, '#8fa4ff', 7, 'center');
    c.save(); c.globalAlpha = 0.45 + 0.55 * pulse; this.text('PRESS ENTER OR CLICK', 112, 124, '#fff', 8, 'center'); c.restore();
    // attract: a chase loop, then the tables turn
    var period = 720, k = t % period, y = 168, tail = [0, 1, 2, 3], i;
    var turned = k > 360, span = 300;
    var base = turned ? 224 + 40 - ((k - 360) / 360) * (224 + 120) : -20 + (k / 360) * (224 + 120);
    if (!turned) {
      for (i = 0; i < 4; i++) { var gx = base - 26 - i * 17; this.ghostIcon(gx, y, i, 3, false, k); }
      drawPac(c, base, y, 3, 0.1 + 0.7 * Math.abs(Math.sin(k / 5)));
    } else {
      drawPac(c, base, y, 1, 0.1 + 0.7 * Math.abs(Math.sin(k / 5)));
      for (i = 0; i < 4; i++) { var gx2 = base + 26 + i * 17; this.ghostIcon(gx2, y, i, 1, true, k); }
    }
    // cast list
    var names = ['RED', 'PINK', 'CYAN', 'ORANGE'], lines = ['chases you', 'ambushes you', 'flanks you', 'wanders off'];
    for (i = 0; i < 4; i++) {
      this.ghostIcon(46, 198 + i * 15, i, 3, false, t);
      this.text(names[i], 62, 198 + i * 15, GHOST_COLORS[i], 6, 'left');
      this.text(lines[i], 108, 198 + i * 15, '#cfd6ff', 6, 'left');
    }
    this.text('ARROWS / WASD  -  P PAUSE  -  M MUTE', 112, 268, '#6f7bb8', 5, 'center');
  };
  Renderer.prototype.ghostIcon = function (x, y, id, dir, fright, frame) {
    var c = this.ctx; c.save(); c.translate(0, 0);
    drawGhost(c, { id: id, x: x, y: y, dir: dir, state: 'active', fright: fright, anim: frame }, 360, false, frame);
    c.restore();
  };

  window.PMRender = { Renderer: Renderer, drawPac: drawPac, drawGhost: drawGhost, drawFruit: drawFruit, GHOST_COLORS: GHOST_COLORS };
})();
