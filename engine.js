// Chomper engine: a faithful re-implementation of the 1980 arcade maze chase rules (no original code or assets).
// Logic runs at a fixed 60 Hz. Positions are in pixels (8 px tiles, 28 x 31 maze). Pure logic: no DOM.
(function (root) {
  'use strict';

  var T = 8, COLS = 28, ROWS = 31;
  var UP = 0, LEFT = 1, DOWN = 2, RIGHT = 3;
  var DX = [0, -1, 0, 1], DY = [-1, 0, 1, 0], OPP = [2, 3, 0, 1];
  var PXF = 75.75 / 60;                 // pixels per frame at 100% speed
  function sp(pct) { return pct / 100 * PXF; }

  var MAZE_SRC = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '     #.##### ## #####.#     ',
    '     #.##          ##.#     ',
    '     #.## ###--### ##.#     ',
    '######.## #      # ##.######',
    '      .   #      #   .      ',
    '######.## #      # ##.######',
    '     #.## ######## ##.#     ',
    '     #.##          ##.#     ',
    '     #.## ######## ##.#     ',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##.......  .......##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################'
  ];
  // the blank areas left and right of the ghost house are solid, not walkable
  var MAZE = MAZE_SRC.map(function (row, y) {
    var r = row.split('');
    if ([10, 11, 12, 16, 17, 18].indexOf(y) >= 0) { for (var x = 0; x < 5; x++) { r[x] = '#'; r[27 - x] = '#'; } }
    return r.join('');
  });

  // ---------- per-level tables ----------
  function lv(table, L) { return table[Math.min(L, table.length) - 1]; }
  var FRIGHT_SEC = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];
  var FRIGHT_FLASH = [5, 5, 5, 5, 5, 5, 5, 5, 3, 5, 5, 3, 3, 5, 3, 3, 0, 3];
  var FRUITS = [
    { name: 'cherry', pts: 100 }, { name: 'strawberry', pts: 300 }, { name: 'orange', pts: 500 }, { name: 'orange', pts: 500 },
    { name: 'apple', pts: 700 }, { name: 'apple', pts: 700 }, { name: 'melon', pts: 1000 }, { name: 'melon', pts: 1000 },
    { name: 'galaxian', pts: 2000 }, { name: 'galaxian', pts: 2000 }, { name: 'bell', pts: 3000 }, { name: 'bell', pts: 3000 },
    { name: 'key', pts: 5000 }
  ];

  function levelCfg(L) {
    var c = {};
    if (L === 1) { c.pac = 80; c.pacF = 90; c.gh = 75; c.ghF = 50; c.tun = 40; }
    else if (L <= 4) { c.pac = 90; c.pacF = 95; c.gh = 85; c.ghF = 55; c.tun = 45; }
    else if (L <= 20) { c.pac = 100; c.pacF = 100; c.gh = 95; c.ghF = 60; c.tun = 50; }
    else { c.pac = 90; c.pacF = 90; c.gh = 95; c.ghF = 60; c.tun = 50; }
    var e = L === 1 ? [20, 10] : L === 2 ? [30, 15] : L <= 5 ? [40, 20] : L <= 8 ? [50, 25] : L <= 11 ? [60, 30] : L <= 14 ? [80, 40] : L <= 18 ? [100, 50] : [120, 60];
    c.e1 = e[0]; c.e2 = e[1];
    var es = L === 1 ? [80, 85] : L <= 4 ? [90, 95] : [100, 105];
    c.e1s = es[0]; c.e2s = es[1];
    c.frightFrames = Math.round(lv(FRIGHT_SEC, L > 18 ? 19 : L) * 60) * (L > 18 ? 0 : 1);
    c.flashes = L > 18 ? 0 : lv(FRIGHT_FLASH, L);
    var sched;
    if (L === 1) sched = [7, 20, 7, 20, 5, 20, 5, 1e9];
    else if (L <= 4) sched = [7, 20, 7, 20, 5, 1033, 1 / 60, 1e9];
    else sched = [5, 20, 5, 20, 5, 1037, 1 / 60, 1e9];
    c.sched = sched.map(function (s) { return Math.round(s * 60); });
    c.limits = L === 1 ? [0, 30, 60] : L === 2 ? [0, 0, 50] : [0, 0, 0];
    c.dotTimeout = L < 5 ? 240 : 180;
    c.fruit = lv(FRUITS, L);
    return c;
  }

  var SCATTER = [[25, -3], [2, -3], [27, 31], [0, 31]];
  var NO_UP = { '12,11': 1, '15,11': 1, '12,23': 1, '15,23': 1 };
  var EXTRA_LIFE_AT = 10000;
  var DEATH_FRAMES = 60 + 105 + 45, CLEAR_FRAMES = 60 + 120, EAT_FREEZE = 50;

  function Game(opts) {
    this.opts = opts || {};
    this.events = [];
    this.pops = [];
    this.tick = 0;
    this.newGame();
  }

  Game.prototype.emit = function (type, data) { this.events.push({ type: type, data: data }); };

  Game.prototype.newGame = function () {
    this.score = 0; this.lives = 3; this.level = 1; this.extraGiven = false; this.tick = 0;
    this.over = false;
    this.startLevel(true);
  };

  Game.prototype.startLevel = function (first) {
    this.cfg = levelCfg(this.level);
    this.grid = MAZE.map(function (r) { return r.split(''); });
    this.dotsLeft = 0;
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) { var c = this.grid[y][x]; if (c === '.' || c === 'o') this.dotsLeft++; }
    this.dotsTotal = this.dotsLeft; this.dotsEaten = 0;
    this.fruit = null;
    this.globalActive = false; this.globalCounter = 0;
    this.elroyOn = true;
    this.resetActors(true);
    this.state = 'ready';
    this.stateTimer = first ? 160 : 110;
    this.firstReady = first;
    this.emit('ready', { first: first, level: this.level });
  };

  Game.prototype.resetActors = function (newLevel) {
    this.pac = { x: 112, y: 188, dir: LEFT, want: LEFT, moving: false, pause: 0, anim: 0 };
    var old = this.ghosts || [];
    this.ghosts = [];
    var starts = [[112, 92, 'active'], [112, 116, 'house'], [96, 116, 'house'], [128, 116, 'house']];
    for (var i = 0; i < 4; i++) {
      this.ghosts.push({ id: i, x: starts[i][0], y: starts[i][1], dir: i === 0 ? LEFT : UP, state: starts[i][2], fright: false,
        reverse: false, dotCount: newLevel || !old[i] ? 0 : old[i].dotCount, bob: i === 1 ? 1 : -1, anim: 0 });
    }
    this.mode = 'scatter'; this.modeIdx = 0; this.modeFrames = 0;
    this.frightTimer = 0; this.ghostsEatenInFright = 0;
    this.noDotFrames = 0;
    this.eatTimer = 0; this.eatenGhost = null;
    this.fruit = null;
  };

  // ---------- helpers ----------
  function openFor(grid, tx, ty, forPac) {
    if (ty === 14 && (tx < 0 || tx > 27)) return true;       // tunnel
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false;
    var c = grid[ty][tx];
    return c !== '#' && c !== '-';
  }
  function tileOf(v) { return Math.floor(v / T); }
  function wrap(e) { if (e.x <= -12) e.x += 240; else if (e.x >= 228) e.x -= 240; }
  function inTunnel(e) { var ty = tileOf(e.y), tx = tileOf(e.x); return ty === 14 && (tx <= 5 || tx >= 22); }

  Game.prototype.setDir = function (d) { if (d >= 0 && d <= 3) this.pac.want = d; };

  Game.prototype.addScore = function (n) {
    this.score += n;
    if (!this.extraGiven && this.score >= EXTRA_LIFE_AT) { this.extraGiven = true; this.lives++; this.emit('extralife'); }
  };

  // ---------- main update ----------
  Game.prototype.update = function () {
    this.tick++;
    var s = this.state;
    if (s === 'ready') {
      if (--this.stateTimer <= 0) { this.state = 'playing'; this.emit('go'); }
    } else if (s === 'playing') {
      this.step();
    } else if (s === 'eating') {
      if (--this.eatTimer <= 0) { this.state = 'playing'; this.eatenGhost = null; }
    } else if (s === 'dying') {
      this.stateTimer++;
      if (this.stateTimer >= DEATH_FRAMES) this.afterDeath();
    } else if (s === 'clear') {
      this.stateTimer++;
      if (this.stateTimer >= CLEAR_FRAMES) { this.level++; this.emit('levelup', { level: this.level }); this.startLevel(false); }
    }
    for (var i = this.pops.length - 1; i >= 0; i--) { if (--this.pops[i].t <= 0) this.pops.splice(i, 1); }
  };

  Game.prototype.afterDeath = function () {
    this.lives--;
    if (this.lives <= 0) { this.state = 'over'; this.over = true; this.emit('gameover', { score: this.score, level: this.level }); return; }
    this.resetActors(false);
    this.globalActive = true; this.globalCounter = 0; this.elroyOn = false;
    this.state = 'ready'; this.stateTimer = 110; this.firstReady = false;
    this.emit('ready', { first: false, level: this.level });
  };

  Game.prototype.step = function () {
    var cfg = this.cfg;
    // scatter / chase timer (paused while frightened)
    if (this.frightTimer <= 0) {
      this.modeFrames++;
      if (this.modeIdx < cfg.sched.length && this.modeFrames >= cfg.sched[this.modeIdx]) {
        this.modeIdx++; this.modeFrames = 0;
        this.mode = this.modeIdx % 2 === 0 ? 'scatter' : 'chase';
        for (var i = 0; i < 4; i++) if (this.ghosts[i].state === 'active') this.ghosts[i].reverse = true;
      }
    } else {
      this.frightTimer--;
      if (this.frightTimer <= 0) for (var j = 0; j < 4; j++) this.ghosts[j].fright = false;
    }

    this.movePac();
    this.checkCollisions();
    if (this.state !== 'playing') return;
    for (var k = 0; k < 4; k++) this.moveGhost(this.ghosts[k]);
    this.checkCollisions();
    if (this.state !== 'playing') return;

    this.updateRelease();
    if (this.fruit && --this.fruit.t <= 0) this.fruit = null;
  };

  // ---------- Pac-Man ----------
  Game.prototype.movePac = function () {
    var p = this.pac;
    if (p.pause > 0) { p.pause--; return; }
    var dist = sp(this.frightTimer > 0 ? this.cfg.pacF : this.cfg.pac);
    var guard = 0;
    p.moving = false;
    while (dist > 1e-9 && guard++ < 12) {
      var tx = tileOf(p.x), ty = tileOf(p.y), cx = tx * T + 4, cy = ty * T + 4;
      if (p.want === OPP[p.dir]) { p.dir = p.want; }
      else if (p.want !== p.dir) {
        // perpendicular turn: allowed at the tile center, or up to 3 px past it (cornering)
        var along = (p.dir === LEFT || p.dir === RIGHT) ? (p.x - cx) * DX[p.dir] : (p.y - cy) * DY[p.dir];
        if (along >= -1e-9 && along <= 3 + 1e-9 && openFor(this.grid, tx + DX[p.want], ty + DY[p.want], true)) {
          p.x = cx; p.y = cy; p.dir = p.want;
        }
      }
      var atC = Math.abs(p.x - cx) < 1e-6 && Math.abs(p.y - cy) < 1e-6;
      if (atC && !openFor(this.grid, tx + DX[p.dir], ty + DY[p.dir], true)) break;   // blocked
      var f = p.dir === RIGHT ? cx - p.x : p.dir === LEFT ? p.x - cx : p.dir === DOWN ? cy - p.y : p.y - cy;
      var dc = f > 1e-9 ? f : f + T;
      var step = Math.min(dist, dc);
      p.x += DX[p.dir] * step; p.y += DY[p.dir] * step;
      p.anim += step; p.moving = true;
      dist -= step; wrap(p);
      this.eatAt(p);
    }
  };

  Game.prototype.eatAt = function (p) {
    var tx = tileOf(p.x), ty = tileOf(p.y);
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
    var c = this.grid[ty][tx];
    if (c !== '.' && c !== 'o') { this.checkFruit(p); return; }
    this.grid[ty][tx] = ' ';
    this.dotsLeft--; this.dotsEaten++; this.noDotFrames = 0;
    if (c === '.') { this.addScore(10); p.pause = 1; this.emit('dot'); }
    else { this.addScore(50); p.pause = 3; this.emit('pellet'); this.startFright(); }
    this.onDotEaten();
    if (this.dotsEaten === 70 || this.dotsEaten === 170) this.fruit = { x: 112, y: 140, t: 540 + Math.floor(Math.random() * 60), kind: this.cfg.fruit };
    if (this.dotsLeft <= 0) { this.state = 'clear'; this.stateTimer = 0; this.emit('clear'); }
  };

  Game.prototype.checkFruit = function (p) {
    var f = this.fruit;
    if (f && Math.abs(p.x - f.x) <= 7 && Math.abs(p.y - f.y) <= 4) {
      this.addScore(f.kind.pts); this.emit('fruit', { pts: f.kind.pts });
      this.pops.push({ x: f.x, y: f.y, text: String(f.kind.pts), t: 120, c: '#ff9bff' });
      this.fruit = null;
    }
  };

  Game.prototype.startFright = function () {
    this.ghostsEatenInFright = 0;
    var fr = this.cfg.frightFrames;
    for (var i = 0; i < 4; i++) {
      var g = this.ghosts[i];
      if (g.state === 'eaten') continue;
      if (fr > 0) g.fright = true;
      if (g.state === 'active') g.reverse = true;
    }
    if (fr > 0) { this.frightTimer = fr; this.emit('fright'); }
  };

  // ---------- ghost house release ----------
  Game.prototype.firstInHouse = function () {
    for (var i = 1; i < 4; i++) if (this.ghosts[i].state === 'house') return this.ghosts[i];
    return null;
  };
  Game.prototype.releaseGhost = function (g) { if (g && g.state === 'house') { g.state = 'leaving'; this.noDotFrames = 0; } };
  Game.prototype.onDotEaten = function () {
    if (this.globalActive) {
      this.globalCounter++;
      var gc = this.globalCounter, gh = this.ghosts;
      if (gc === 7) this.releaseGhost(gh[1]);
      else if (gc === 17) this.releaseGhost(gh[2]);
      else if (gc === 32) { if (gh[3].state === 'house') this.releaseGhost(gh[3]); this.globalActive = false; this.globalCounter = 0; }
    } else {
      var g = this.firstInHouse();
      if (g) g.dotCount++;
    }
  };
  Game.prototype.updateRelease = function () {
    if (!this.globalActive) {
      var g = this.firstInHouse();
      if (g && g.dotCount >= this.cfg.limits[g.id - 1]) this.releaseGhost(g);
    }
    if (++this.noDotFrames >= this.cfg.dotTimeout) { this.releaseGhost(this.firstInHouse()); this.noDotFrames = 0; }
  };

  // ---------- ghosts ----------
  Game.prototype.ghostSpeed = function (g) {
    var c = this.cfg;
    if (g.state === 'eaten') return sp(200);
    if (g.state === 'house' || g.state === 'leaving') return 0.5;
    if (g.state === 'entering') return 1.5;
    if (inTunnel(g)) return sp(c.tun);
    if (g.fright) return sp(c.ghF);
    if (g.id === 0 && this.elroyOn) {
      if (this.dotsLeft <= c.e2) return sp(c.e2s);
      if (this.dotsLeft <= c.e1) return sp(c.e1s);
    }
    return sp(c.gh);
  };

  Game.prototype.targetFor = function (g) {
    var p = this.pac, ptx = Math.max(0, Math.min(27, tileOf(p.x))), pty = tileOf(p.y);
    if (g.state === 'eaten') return [13.5, 11];
    var chase = this.mode === 'chase' || (g.id === 0 && this.elroyOn && this.dotsLeft <= this.cfg.e1);
    if (!chase) return SCATTER[g.id];
    if (g.id === 0) return [ptx, pty];
    if (g.id === 1) return [ptx + DX[p.dir] * 4 + (p.dir === UP ? -4 : 0), pty + DY[p.dir] * 4];
    if (g.id === 2) {
      var ax = ptx + DX[p.dir] * 2 + (p.dir === UP ? -2 : 0), ay = pty + DY[p.dir] * 2, b = this.ghosts[0];
      return [ax * 2 - tileOf(b.x), ay * 2 - tileOf(b.y)];
    }
    var cx = tileOf(g.x), cy = tileOf(g.y), d2 = (cx - ptx) * (cx - ptx) + (cy - pty) * (cy - pty);
    return d2 > 64 ? [ptx, pty] : SCATTER[3];
  };

  Game.prototype.decide = function (g, tx, ty) {
    var opts = [], i;
    for (i = 0; i < 4; i++) {
      if (i === OPP[g.dir]) continue;
      if (!openFor(this.grid, tx + DX[i], ty + DY[i], false)) continue;
      if (i === UP && NO_UP[tx + ',' + ty] && !g.fright && g.state !== 'eaten') continue;
      opts.push(i);
    }
    if (!opts.length) { g.dir = OPP[g.dir]; return; }
    if (g.fright && g.state === 'active') { g.dir = opts[Math.floor(Math.random() * opts.length)]; return; }
    var t = this.targetFor(g), best = -1, bd = 1e12;
    for (i = 0; i < opts.length; i++) {
      var d = opts[i], nx = tx + DX[d], ny = ty + DY[d], dd = (nx - t[0]) * (nx - t[0]) + (ny - t[1]) * (ny - t[1]);
      if (dd < bd) { bd = dd; best = d; }
    }
    g.dir = best;
  };

  Game.prototype.moveGhost = function (g) {
    g.anim++;
    var spd = this.ghostSpeed(g);
    if (g.state === 'house') {            // bob up and down inside the house
      g.y += g.bob * spd * 0.6;
      if (g.y <= 112) { g.y = 112; g.bob = 1; } else if (g.y >= 120) { g.y = 120; g.bob = -1; }
      return;
    }
    if (g.state === 'leaving') {
      if (Math.abs(g.x - 112) > 0.01) { g.x += Math.sign(112 - g.x) * Math.min(spd, Math.abs(112 - g.x)); }
      else if (g.y > 92 + 1e-6) { g.y -= Math.min(spd, g.y - 92); if (g.y <= 92 + 1e-6) { g.y = 92; g.state = 'active'; g.dir = LEFT; this.onLeft(g); } }
      return;
    }
    if (g.state === 'entering') {
      g.y += Math.min(spd, 116 - g.y);
      if (g.y >= 116 - 1e-6) { g.y = 116; g.state = 'leaving'; g.fright = false; g.dir = UP; }
      return;
    }
    if (g.reverse) { g.dir = OPP[g.dir]; g.reverse = false; }
    var dist = spd, guard = 0;
    while (dist > 1e-9 && guard++ < 14) {
      var tx = tileOf(g.x), ty = tileOf(g.y), cx = tx * T + 4, cy = ty * T + 4;
      var atC = Math.abs(g.x - cx) < 1e-6 && Math.abs(g.y - cy) < 1e-6;
      if (atC) {
        if (g.state === 'eaten' && ty === 11 && (tx === 13 || tx === 14)) { g.x = 112; g.y = 92; g.state = 'entering'; return; }
        this.decide(g, tx, ty);
      }
      var f = g.dir === RIGHT ? cx - g.x : g.dir === LEFT ? g.x - cx : g.dir === DOWN ? cy - g.y : g.y - cy;
      var dc = f > 1e-9 ? f : f + T;
      var step = Math.min(dist, dc);
      g.x += DX[g.dir] * step; g.y += DY[g.dir] * step;
      dist -= step; wrap(g);
    }
  };
  Game.prototype.onLeft = function (g) { if (g.id === 3 && !this.elroyOn) this.elroyOn = true; };

  // ---------- collisions ----------
  Game.prototype.checkCollisions = function () {
    var p = this.pac, ptx = tileOf(p.x), pty = tileOf(p.y);
    for (var i = 0; i < 4; i++) {
      var g = this.ghosts[i];
      if (g.state !== 'active') continue;
      if (tileOf(g.x) !== ptx || tileOf(g.y) !== pty) continue;
      if (g.fright) {
        var pts = 200 * Math.pow(2, this.ghostsEatenInFright++);
        g.state = 'eaten'; g.fright = false;
        this.addScore(pts); this.emit('ghost', { pts: pts });
        this.pops.push({ x: g.x, y: g.y, text: String(pts), t: EAT_FREEZE + 20, c: '#40e0ff' });
        this.state = 'eating'; this.eatTimer = EAT_FREEZE; this.eatenGhost = g.id;
        return;
      } else {
        this.state = 'dying'; this.stateTimer = 0; this.frightTimer = 0;
        this.emit('death');
        return;
      }
    }
  };

  var API = { Game: Game, MAZE: MAZE, T: T, COLS: COLS, ROWS: ROWS, UP: UP, LEFT: LEFT, DOWN: DOWN, RIGHT: RIGHT, levelCfg: levelCfg,
    FRUITS: FRUITS, DEATH_FRAMES: DEATH_FRAMES, CLEAR_FRAMES: CLEAR_FRAMES, EAT_FREEZE: EAT_FREEZE, sp: sp };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PM = API;
})(typeof window !== 'undefined' ? window : globalThis);
