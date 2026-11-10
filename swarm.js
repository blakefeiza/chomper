// Score Swarm physics: circles (area ~ score) pulled to the middle of a giant Pac-Man shaped container,
// with smooth position-based collisions, and one body that can be dragged. Pure logic, no DOM.
(function (root) {
  'use strict';

  var SUB = 3, ITER = 6, FILL_CAP = 0.58, RIM = 5;

  function World() {
    this.bodies = []; this.byId = {};
    this.cx = 0; this.cy = 0; this.R = 300; this.theta = 0.62;     // mouth half-angle (rad), mouth faces right
    this.gx = 0; this.gy = 0;                                      // gravity target = centroid of the solid sector
    this.fit = 1; this.drag = null; this.tx = 0; this.ty = 0;
    this.grid = null; this.next = null; this.rmax = 10;
  }

  World.prototype.alpha = function () { return Math.PI - this.theta; };
  World.prototype.area = function () { return this.alpha() * this.R * this.R; };        // solid sector area

  World.prototype.geometry = function (cx, cy, R) {
    var i, b, s = this.bodies.length && this.R > 0 ? R / this.R : 1;
    for (i = 0; i < this.bodies.length; i++) {
      b = this.bodies[i];
      b.x = cx + (b.x - this.cx) * s; b.y = cy + (b.y - this.cy) * s; b.vx *= s; b.vy *= s;
    }
    this.cx = cx; this.cy = cy; this.R = R;
    var al = this.alpha();
    this.gx = cx - 2 * R * Math.sin(al) / (3 * al); this.gy = cy;
    this.refit();
  };

  // radius of a body when the container is not yet full (fraction of R times R)
  World.prototype.fillFraction = function () {
    var sum = 0; for (var i = 0; i < this.bodies.length; i++) { var r0 = this.bodies[i].rn * this.R; sum += Math.PI * r0 * r0; }
    return sum / (FILL_CAP * this.area());
  };
  World.prototype.refit = function () {
    var f = this.fillFraction();
    this.fit = f > 1 ? 1 / Math.sqrt(f) : 1;
    this.rmax = 4;
    for (var i = 0; i < this.bodies.length; i++) { var b = this.bodies[i]; b.r = b.rn * this.R * this.fit * b.grow; if (b.r > this.rmax) this.rmax = b.r; }
  };

  World.prototype.spawn = function (id, rn, data, instant) {
    if (this.byId[id]) return this.byId[id];
    var a = this.theta + 0.25 + Math.random() * (2 * Math.PI - 2 * this.theta - 0.5), d = this.R * (0.45 + Math.random() * 0.4);
    var b = { id: id, x: this.cx + Math.cos(a) * d, y: this.cy + Math.sin(a) * d, vx: 0, vy: 0, px: 0, py: 0, rn: rn, r: 1, grow: instant ? 1 : 0, data: data, dying: 0 };
    this.bodies.push(b); this.byId[id] = b; this.refit(); return b;
  };
  World.prototype.remove = function (id) {
    var b = this.byId[id]; if (!b) return;
    if (this.drag === b) this.drag = null;
    this.bodies.splice(this.bodies.indexOf(b), 1); delete this.byId[id]; this.refit();
  };

  World.prototype.pick = function (x, y) {
    var best = null, bd = 1e12;
    for (var i = 0; i < this.bodies.length; i++) {
      var b = this.bodies[i], dx = x - b.x, dy = y - b.y, d = dx * dx + dy * dy;
      if (d <= b.r * b.r && d < bd) { bd = d; best = b; }
    }
    return best;
  };
  World.prototype.beginDrag = function (b, x, y) { this.drag = b; this.tx = x; this.ty = y; b.vx = b.vy = 0; };
  World.prototype.moveDrag = function (x, y) { this.tx = x; this.ty = y; };
  World.prototype.endDrag = function (vx, vy) {
    var b = this.drag; this.drag = null; if (!b) return;
    var sp = Math.hypot(vx, vy), cap = this.R * 3; if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
    b.vx = vx; b.vy = vy;
  };

  // keep a body inside the Pac-Man shape: inside the circle, outside the mouth wedge, clear of the two mouth edges
  World.prototype.confine = function (b) {
    var cx = this.cx, cy = this.cy, R = this.R, th = this.theta, r = b.r;
    var dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = -1; dy = 0; d = 1e-6; b.x = cx - 1e-6; }
    var maxd = R - r - RIM;
    if (maxd < 0) maxd = 0;
    if (d > maxd) { b.x = cx + dx / d * maxd; b.y = cy + dy / d * maxd; dx = b.x - cx; dy = b.y - cy; d = maxd; if (d < 1e-6) return; }
    var ct = Math.cos(th), st = Math.sin(th);
    var ang = Math.atan2(dy, dx), inWedge = Math.abs(ang) < th;
    // upper edge: direction a, solid-side normal nA;  lower edge: direction b2, solid-side normal nB
    var ax = ct, ay = -st, nax = -st, nay = -ct, bx = ct, by = st, nbx = -st, nby = ct;
    var tA = dx * ax + dy * ay, sA = dx * nax + dy * nay, tB = dx * bx + dy * by, sB = dx * nbx + dy * nby;
    var pad = r + 1.5;
    if (inWedge) {
      // push out of the mouth onto the nearer edge
      var useA = Math.abs(sA) < Math.abs(sB), t = useA ? tA : tB;
      if (t < 0) t = 0; if (t > R - RIM) t = R - RIM;
      if (useA) { b.x = cx + ax * t + nax * pad; b.y = cy + ay * t + nay * pad; }
      else { b.x = cx + bx * t + nbx * pad; b.y = cy + by * t + nby * pad; }
      return;
    }
    if (tA > 0 && tA < R && sA >= 0 && sA < pad) { b.x += nax * (pad - sA); b.y += nay * (pad - sA); }
    else if (tB > 0 && tB < R && sB >= 0 && sB < pad) { b.x += nbx * (pad - sB); b.y += nby * (pad - sB); }
    else if (tA <= 0 && tB <= 0 && d < pad) { b.x = cx + dx / d * pad; b.y = cy + dy / d * pad; }   // the notch vertex
  };

  World.prototype.collide = function () {
    var n = this.bodies.length, B = this.bodies, i, j, k, cell = Math.max(this.rmax * 2, 8);
    var x0 = this.cx - this.R - cell, y0 = this.cy - this.R - cell, cols = Math.ceil((2 * this.R + 3 * cell) / cell) + 1, rows = cols;
    if (!this.grid || this.grid.length < cols * rows) this.grid = new Int32Array(cols * rows);
    if (!this.next || this.next.length < n) this.next = new Int32Array(n + 64);
    var head = this.grid, next = this.next; head.fill(-1, 0, cols * rows);
    var ix = new Int32Array(n), iy = new Int32Array(n);
    for (i = 0; i < n; i++) {
      var cxi = Math.max(0, Math.min(cols - 1, Math.floor((B[i].x - x0) / cell))), cyi = Math.max(0, Math.min(rows - 1, Math.floor((B[i].y - y0) / cell)));
      ix[i] = cxi; iy[i] = cyi; next[i] = head[cyi * cols + cxi]; head[cyi * cols + cxi] = i;
    }
    for (var it = 0; it < ITER; it++) {
      for (i = 0; i < n; i++) {
        var a = B[i], ia = a === this.drag ? 0 : 1 / (a.r * a.r + 1);
        for (var gy = iy[i] - 1; gy <= iy[i] + 1; gy++) {
          if (gy < 0 || gy >= rows) continue;
          for (var gx = ix[i] - 1; gx <= ix[i] + 1; gx++) {
            if (gx < 0 || gx >= cols) continue;
            for (j = head[gy * cols + gx]; j >= 0; j = next[j]) {
              if (j <= i) continue;
              var c = B[j], dx = c.x - a.x, dy = c.y - a.y, rr = a.r + c.r + 0.4, d2 = dx * dx + dy * dy;
              if (d2 >= rr * rr) continue;
              var d = Math.sqrt(d2), nx, ny;
              if (d < 1e-6) { var ang = Math.random() * 6.283; nx = Math.cos(ang); ny = Math.sin(ang); d = 0; } else { nx = dx / d; ny = dy / d; }
              var ic = c === this.drag ? 0 : 1 / (c.r * c.r + 1), w = ia + ic; if (w === 0) continue;
              var o = (rr - d) * 0.9;
              a.x -= nx * o * ia / w; a.y -= ny * o * ia / w; c.x += nx * o * ic / w; c.y += ny * o * ic / w;
            }
          }
        }
      }
      for (k = 0; k < n; k++) this.confine(B[k]);
    }
  };

  World.prototype.step = function (dt) {
    var h = dt / SUB, B = this.bodies, n = B.length, i, s;
    var g = this.R * 2.6, soft = this.R * 0.14, drag = 2.6;
    for (i = 0; i < n; i++) { var bb = B[i]; if (bb.grow < 1) { bb.grow = Math.min(1, bb.grow + dt * 2.4); } }
    this.refit();
    for (s = 0; s < SUB; s++) {
      for (i = 0; i < n; i++) {
        var b = B[i]; b.px = b.x; b.py = b.y;
        if (b === this.drag) { b.x += (this.tx - b.x) * 0.5; b.y += (this.ty - b.y) * 0.5; continue; }
        var dx = this.gx - b.x, dy = this.gy - b.y, d = Math.hypot(dx, dy);
        if (d > 1e-6) { var a = g * Math.min(1, d / soft); b.vx += dx / d * a * h; b.vy += dy / d * a * h; }
        b.x += b.vx * h; b.y += b.vy * h;
      }
      this.collide();
      var damp = Math.max(0, 1 - drag * h), vmax = this.R * 3.5;
      for (i = 0; i < n; i++) {
        var q = B[i];
        if (q === this.drag) { q.vx = q.vy = 0; continue; }
        q.vx = (q.x - q.px) / h * damp; q.vy = (q.y - q.py) / h * damp;
        var sp = Math.hypot(q.vx, q.vy); if (sp > vmax) { q.vx *= vmax / sp; q.vy *= vmax / sp; }
      }
    }
  };

  var API = { World: World, FILL_CAP: FILL_CAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PMSwarm = API;
})(typeof window !== 'undefined' ? window : globalThis);
