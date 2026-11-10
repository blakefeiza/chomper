// Score Swarm view: every submitted score is a ball (area ~ score) inside a giant Pac-Man. Drag, fling, hover, click.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var LIMIT = 600, REFRESH_MS = 30000;
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LEVELS = [
    { max: 1, color: '#4f6dff', label: 'L1', dark: false }, { max: 3, color: '#19d9ff', label: 'L2-3', dark: true },
    { max: 5, color: '#ff9be8', label: 'L4-5', dark: true }, { max: 8, color: '#ffb040', label: 'L6-8', dark: true },
    { max: 999, color: '#ff4a4a', label: 'L9+', dark: false }
  ];
  var GOLD = { color: '#ffd23f', dark: true };
  function levelStyle(l) { for (var i = 0; i < LEVELS.length; i++) if (l <= LEVELS[i].max) return LEVELS[i]; return LEVELS[LEVELS.length - 1]; }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function compact(n) { return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n); }
  function ago(iso) {
    var s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago'; return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mix(hex, t, to) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, m = function (v) { return Math.round(v + (to - v) * t); }; return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')'; }
  function utcMidnight() { var d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString(); }
  function rnFor(score) { return Math.max(0.027, 0.0155 + 0.063 * Math.sqrt(Math.min(6, score / 30000))); }   // floor keeps small scores visible   // ball radius as a fraction of the container radius

  var sprites = {};
  function sprite(color) {
    if (sprites[color]) return sprites[color];
    var c = document.createElement('canvas'); c.width = c.height = 160; var x = c.getContext('2d');
    var g = x.createRadialGradient(56, 46, 6, 80, 80, 78);
    g.addColorStop(0, mix(color, .55, 255)); g.addColorStop(.42, color); g.addColorStop(1, mix(color, .5, 0));
    x.fillStyle = g; x.beginPath(); x.arc(80, 80, 76, 0, 7); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 3; x.beginPath(); x.arc(80, 80, 73, 3.6, 5.1); x.stroke();
    x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 2; x.beginPath(); x.arc(80, 80, 76, 0, 7); x.stroke();
    return (sprites[color] = c);
  }

  var S = { world: null, ctx: null, w: 0, h: 0, dpr: 1, active: false, raf: 0, last: 0, acc: 0, rows: [], total: 0, ranks: {}, topId: null,
    hover: null, selected: null, queue: [], effects: [], loaded: false, midnight: utcMidnight(), pointer: { x: 0, y: 0, in: false }, down: null, trail: [], timer: 0, t: 0 };

  function geometry() {
    var wrap = $('swWrap'), r = wrap.getBoundingClientRect(), w = Math.max(200, Math.floor(r.width)), h = Math.max(200, Math.floor(r.height));
    S.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var cv = $('swCanvas'); cv.width = Math.round(w * S.dpr); cv.height = Math.round(h * S.dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    S.w = w; S.h = h;
    var R = Math.min(h * 0.45, w / 2.62), cx = w / 2 - R * 0.27, cy = h / 2;
    S.world.geometry(cx, cy, R);
  }

  function ensureBody(row, fresh) {
    var w = S.world, b = w.byId[row.id];
    if (b) return b;
    b = w.spawn(row.id, rnFor(row.score), row, REDUCED || !fresh);
    if (fresh && !REDUCED) S.effects.push({ x: b.x, y: b.y, t: 0, color: levelStyle(row.level).color, id: row.id });
    return b;
  }

  function sync(rows, total) {
    S.rows = rows; S.total = total; S.midnight = utcMidnight();
    S.ranks = {}; rows.forEach(function (r, i) { S.ranks[r.id] = i + 1; }); S.topId = rows.length ? rows[0].id : null;
    var ids = {}; rows.forEach(function (r) { ids[r.id] = r; });
    S.world.bodies.slice().forEach(function (b) { if (!ids[b.id]) { if (S.selected === b) S.selected = null; if (S.hover === b) S.hover = null; S.world.remove(b.id); } else b.data = ids[b.id]; });
    var fresh = S.loaded;       // after the first load, new rows pop in right away; the first load is staggered
    rows.forEach(function (r) { if (!S.world.byId[r.id]) { if (fresh) ensureBody(r, true); else S.queue.push(r); } });
    S.loaded = true; stats();
  }
  function stats() {
    var cap = S.total > LIMIT ? ' (top ' + LIMIT + ' shown)' : '';
    $('swCount').textContent = fmt(S.total) + (S.total === 1 ? ' score' : ' scores') + cap;
    var f = S.world.fillFraction(), pct = Math.min(100, Math.round(f * 100));
    $('swFillTxt').textContent = f >= 1 ? 'FULL' : pct + '% full';
    $('swFillBar').style.width = Math.min(100, f * 100) + '%';
    $('swEmpty').style.display = S.rows.length ? 'none' : 'flex';
    $('swHint').style.display = S.rows.length && S.rows.length < 30 ? 'block' : 'none';
  }

  function refresh() {
    return PMBoard.swarm(LIMIT).then(function (d) { sync(d.rows, d.total); }).catch(function () {});
  }

  // ---------- drawing ----------
  function drawShape(c, w) {
    var cx = w.cx, cy = w.cy, R = w.R, th = w.theta;
    c.save();
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + R * Math.cos(th), cy + R * Math.sin(th)); c.arc(cx, cy, R, th, Math.PI * 2 - th, false); c.closePath();
    var g = c.createRadialGradient(w.gx, w.gy, R * 0.1, w.gx, w.gy, R * 1.1);
    g.addColorStop(0, 'rgba(32,44,120,.55)'); g.addColorStop(1, 'rgba(8,12,44,.85)');
    c.fillStyle = g; c.fill();
    c.lineJoin = 'round'; c.shadowColor = 'rgba(255,225,0,.8)'; c.shadowBlur = 24; c.strokeStyle = '#ffe100'; c.lineWidth = Math.max(3, R * 0.014); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = 'rgba(255,225,0,.22)'; c.lineWidth = Math.max(8, R * 0.05); c.stroke();
    // the pellets Pac-Man is about to eat
    var pr = Math.max(3, R * 0.045), t = S.t;
    for (var i = 0; i < 3; i++) {
      var px = cx + R * (1.15 + i * 0.19), a = 0.45 + 0.4 * Math.sin(t * 3 - i * 0.9);
      c.globalAlpha = REDUCED ? 0.8 : a; c.fillStyle = '#ffd9c9'; c.shadowColor = 'rgba(255,217,201,.9)'; c.shadowBlur = 10; c.beginPath(); c.arc(px, cy, pr, 0, 7); c.fill();
    }
    c.restore();
  }

  function labelFor(b) {
    var r = b.r, s = b.data.score, txt = fmt(s);
    if (r < 11) return null;
    return { score: r < 24 || txt.length * r * 0.34 > r * 1.75 ? compact(s) : txt, name: r >= 34 ? b.data.name : null };
  }

  function draw() {
    var c = S.ctx, w = S.world, t = S.t, dpr = S.dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, S.w, S.h);
    drawShape(c, w);
    var bodies = w.bodies.slice().sort(function (a, b) { return b.r - a.r; }), i;   // small balls on top of big ones
    var youId = PMBoard.youId();
    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i], row = b.data, st = b.id === S.topId ? GOLD : levelStyle(row.level), r = b.r;
      if (r < 0.5) continue;
      var hot = b === S.hover || b === S.selected || b === w.drag, rr = r * (hot ? 1.05 : 1);
      c.drawImage(sprite(st.color), b.x - rr, b.y - rr, rr * 2, rr * 2);
      if (row.created_at >= S.midnight) {
        c.save(); c.globalAlpha = REDUCED ? 0.7 : 0.45 + 0.35 * Math.sin(t * 3 + (b.id % 7)); c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.4, r * 0.07);
        c.beginPath(); c.arc(b.x, b.y, rr + 1.8, 0, 7); c.stroke(); c.restore();
      }
      if (b.id === youId) { c.save(); c.shadowColor = '#ffe100'; c.shadowBlur = 16; c.strokeStyle = '#ffe100'; c.lineWidth = Math.max(2.4, r * 0.11); c.beginPath(); c.arc(b.x, b.y, rr + 3, 0, 7); c.stroke(); c.restore(); }
      if (hot) { c.save(); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.shadowColor = '#fff'; c.shadowBlur = 12; c.beginPath(); c.arc(b.x, b.y, rr + 1, 0, 7); c.stroke(); c.restore(); }
      var lb = labelFor(b);
      if (lb) {
        var fs = Math.max(8, Math.min(r * 0.52, 22)); c.font = '800 ' + fs + 'px ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI", system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = st.dark ? '#0b1030' : '#ffffff';
        if (!st.dark) { c.shadowColor = 'rgba(0,0,40,.55)'; c.shadowBlur = 3; }
        c.fillText(lb.score, b.x, b.y - (lb.name ? fs * 0.3 : 0));
        if (lb.name) { c.font = '700 ' + Math.max(7, fs * 0.5) + 'px -apple-system, "Segoe UI", system-ui, sans-serif'; c.globalAlpha = 0.85; c.fillText(lb.name.length > 9 ? lb.name.slice(0, 8) + '.' : lb.name, b.x, b.y + fs * 0.62); c.globalAlpha = 1; }
        c.shadowBlur = 0;
      }
    }
    var tb = S.topId != null ? w.byId[S.topId] : null;   // crown last, so smaller balls never cover it
    if (tb && tb.r > 14) { c.font = Math.max(12, tb.r * 0.6) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillStyle = '#ffd23f'; c.shadowColor = '#ffd23f'; c.shadowBlur = 8; c.fillText('\u265B', tb.x, tb.y - tb.r - 1); c.shadowBlur = 0; }
    // arrival bursts
    for (i = S.effects.length - 1; i >= 0; i--) {
      var e = S.effects[i], p = e.t, bd = w.byId[e.id];
      if (p >= 1) { S.effects.splice(i, 1); continue; }
      var ex = bd ? bd.x : e.x, ey = bd ? bd.y : e.y, rad = (bd ? bd.r : 10) + p * 46;
      c.save(); c.globalAlpha = (1 - p) * 0.9; c.strokeStyle = e.color; c.lineWidth = 3 * (1 - p) + 1; c.shadowColor = e.color; c.shadowBlur = 14; c.beginPath(); c.arc(ex, ey, rad, 0, 7); c.stroke(); c.restore();
    }
    tooltip();
  }

  // ---------- tooltip / card ----------
  function tooltip() {
    var tip = $('swTip'), w = S.world, b = w.drag ? null : (S.selected || S.hover);
    if (!b) { tip.classList.remove('on'); return; }
    var row = b.data, st = b.id === S.topId ? GOLD : levelStyle(row.level), rk = S.ranks[row.id];
    var key = row.id + '|' + (b === S.selected ? 1 : 0);
    if (tip._key !== key) {
      tip._key = key;
      tip.innerHTML = '<div class="tn"><i style="background:' + st.color + '"></i>' + esc(row.name) + (rk === 1 ? ' <span class="crown">&#9819;</span>' : '') + '</div>' +
        '<div class="ts">' + fmt(row.score) + '</div><div class="tm">Level ' + row.level + ' &middot; ' + ago(row.created_at) + (rk ? ' &middot; #' + rk + ' all time' : '') + '</div>' +
        (row.created_at >= S.midnight ? '<div class="tt">Played today</div>' : '');
    }
    var tw = tip.offsetWidth || 160, th = tip.offsetHeight || 80;
    var ax = b === S.selected ? b.x + b.r + 12 : S.pointer.x + 16, ay = b === S.selected ? b.y - th / 2 : S.pointer.y - th - 12;
    if (ax + tw > S.w - 6) ax = (b === S.selected ? b.x - b.r - 12 : S.pointer.x - 16) - tw;
    ax = Math.max(6, Math.min(S.w - tw - 6, ax)); ay = Math.max(6, Math.min(S.h - th - 6, ay));
    tip.style.transform = 'translate(' + Math.round(ax) + 'px,' + Math.round(ay) + 'px)'; tip.classList.add('on');
  }

  // ---------- loop ----------
  function frame(now) {
    if (!S.active) return; S.raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; S.acc += dt; S.t += dt;
    var n = 0; while (S.acc >= 1 / 60 && n++ < 3) { S.world.step(1 / 60); S.acc -= 1 / 60; }
    if (S.queue.length) { var k = REDUCED ? 40 : Math.max(1, Math.ceil(S.queue.length / 90)); while (k-- > 0 && S.queue.length) ensureBody(S.queue.shift(), false); stats(); }
    S.effects.forEach(function (e) { e.t += dt / 0.9; });
    if (S.down && S.world.drag) { S.trail.push({ t: now, x: S.pointer.x, y: S.pointer.y }); while (S.trail.length && now - S.trail[0].t > 120) S.trail.shift(); }
    draw();
  }

  // ---------- pointer ----------
  function pos(e) { var r = $('swCanvas').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onDown(e) {
    var p = pos(e); S.pointer.x = p.x; S.pointer.y = p.y; S.pointer.in = true;
    var b = S.world.pick(p.x, p.y);
    if (!b) { S.selected = null; return; }
    e.preventDefault(); $('swCanvas').setPointerCapture(e.pointerId);
    S.down = { x: p.x, y: p.y, t: performance.now(), moved: false, body: b }; S.trail = [];
    S.world.beginDrag(b, p.x, p.y); $('swCanvas').style.cursor = 'grabbing';
  }
  function onMove(e) {
    var p = pos(e); S.pointer.x = p.x; S.pointer.y = p.y; S.pointer.in = true;
    if (S.down) {
      if (Math.hypot(p.x - S.down.x, p.y - S.down.y) > 5) S.down.moved = true;
      S.world.moveDrag(p.x, p.y);
    } else {
      var b = S.world.pick(p.x, p.y); S.hover = b; $('swCanvas').style.cursor = b ? 'grab' : 'default';
    }
  }
  function onUp(e) {
    if (!S.down) return;
    var d = S.down, now = performance.now(), vx = 0, vy = 0;
    if (S.trail.length > 1) { var a = S.trail[0], z = S.trail[S.trail.length - 1], dtt = Math.max(16, z.t - a.t) / 1000; vx = (z.x - a.x) / dtt; vy = (z.y - a.y) / dtt; }
    S.world.endDrag(vx, vy);
    if (!d.moved && now - d.t < 500) S.selected = (S.selected === d.body) ? null : d.body;
    S.down = null; S.trail = []; $('swCanvas').style.cursor = 'grab';
    try { $('swCanvas').releasePointerCapture(e.pointerId); } catch (x) {}
  }
  function onLeave() { S.pointer.in = false; if (!S.down) S.hover = null; }

  // ---------- public ----------
  var inited = false;
  function init() {
    if (inited) return; inited = true;
    S.world = new PMSwarm.World(); S.ctx = $('swCanvas').getContext('2d');
    var cv = $('swCanvas'); cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp); cv.addEventListener('pointerleave', onLeave);
    if (window.ResizeObserver) new ResizeObserver(function () { if (S.active) geometry(); }).observe($('swWrap'));
    var lg = LEVELS.map(function (l) { return '<span><i style="background:' + l.color + '"></i>' + l.label + '</span>'; }).join('');
    $('swLegend').innerHTML = '<div class="lg-row"><b>Color</b>' + lg + '<span><i style="background:' + GOLD.color + '"></i>#1</span></div>' +
      '<div class="lg-row"><b>Size</b><span>bigger score, bigger ball</span><b>Ring</b><span><i class="ring"></i>played today</span></div>';
  }
  function show() {
    init(); S.active = true; geometry(); S.last = 0; S.acc = 0;
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(frame);
    refresh(); clearInterval(S.timer); S.timer = setInterval(function () { if (!document.hidden) refresh(); }, REFRESH_MS);
  }
  function hide() { S.active = false; cancelAnimationFrame(S.raf); clearInterval(S.timer); S.hover = null; $('swTip').classList.remove('on'); if (S.world && S.world.drag) { S.world.endDrag(0, 0); S.down = null; } }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { S.last = 0; } });

  window.PMSwarmView = { show: show, hide: hide, refresh: function () { if (S.active) return refresh(); }, state: S };
})();
