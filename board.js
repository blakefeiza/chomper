// Chomper leaderboard: Supabase REST (daily + all-time) with a localStorage fallback, plus the board UI.
(function () {
  'use strict';
  var CFG = window.CHOMPER_CONFIG || {};
  var CLOUD = !!(CFG.supabaseUrl && CFG.anonKey) && !/[?&]local=1/.test(location.search);   // ?local=1 forces local mode (testing)
  var TABLE = CFG.table || 'chomper_scores';
  var LIMIT = 25, SHOWN = 10;
  var LS_ROWS = 'chomper-local-scores', LS_NAME = 'chomper-name', LS_BEST = 'chomper-best';
  var $ = function (id) { return document.getElementById(id); };
  var state = { tab: 'today', data: { today: null, all: null }, you: null, loading: false, error: false };

  // ---------- data layer ----------
  function utcMidnight() { var d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // Publishable keys (sb_publishable_...) are not JWTs: send them as apikey only. Legacy anon keys (JWTs) also go in Authorization.
  function hdrs(extra) {
    var h = { apikey: CFG.anonKey };
    if (CFG.anonKey.indexOf('sb_') !== 0) h.Authorization = 'Bearer ' + CFG.anonKey;
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function cloudFetch(scope, limit) {
    var q = '?select=id,name,score,level,created_at&order=score.desc,created_at.asc&limit=' + (limit || LIMIT);
    if (scope === 'today') q += '&created_at=gte.' + utcMidnight().toISOString();
    return fetch(CFG.supabaseUrl + '/rest/v1/' + TABLE + q, { headers: hdrs({ Prefer: 'count=exact' }) })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var cr = r.headers.get('content-range') || '', total = parseInt(cr.split('/')[1], 10);
        return r.json().then(function (rows) { return { rows: rows, total: isFinite(total) ? total : rows.length }; });
      });
  }
  function localFetch(scope, limit) {
    var all = lsGet(LS_ROWS, []).slice().sort(function (a, b) { return b.score - a.score || (a.created_at < b.created_at ? -1 : 1); });
    if (scope === 'today') { var m = utcMidnight().toISOString(); all = all.filter(function (r) { return r.created_at >= m; }); }
    return Promise.resolve({ rows: all.slice(0, limit || LIMIT), total: all.length });
  }
  function fetchScope(scope, limit) { return CLOUD ? cloudFetch(scope, limit) : localFetch(scope, limit); }

  function submitScore(name, score, level) {
    if (CLOUD) {
      return fetch(CFG.supabaseUrl + '/rest/v1/' + TABLE, {
        method: 'POST',
        headers: hdrs({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ name: name, score: score, level: level })
      }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (a) { return a[0]; });
    }
    var rows = lsGet(LS_ROWS, []), row = { id: 'l' + Date.now(), name: name, score: score, level: level, created_at: new Date().toISOString() };
    rows.push(row); lsSet(LS_ROWS, rows); return Promise.resolve(row);
  }

  var BAD = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'dick', 'cock', 'bitch', 'whore', 'rape', 'nazi', 'slut', 'twat', 'pussy', 'asshole'];
  function cleanName(s) {
    s = String(s || '').toUpperCase().replace(/[^A-Z0-9 _\-.]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10);
    var norm = s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/[^a-z]/g, '');
    for (var i = 0; i < BAD.length; i++) if (norm.indexOf(BAD[i]) >= 0) return null;
    return s;
  }

  // ---------- small helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function ago(iso) {
    var s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago'; return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  var iconCache = {};
  function icon(kind, a, b) {
    var key = kind + a + b; if (iconCache[key]) return iconCache[key];
    var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d'); x.translate(32, 32); x.scale(64 / 18, 64 / 18);
    if (kind === 'pac') PMRender.drawPac(x, 0, 0, 3, 0.55, 1);
    else if (kind === 'ghost') PMRender.drawGhost(x, { id: a, x: 0, y: 0, dir: b || 3, state: 'active', fright: false, anim: 0 }, 0, false, 0);
    else if (kind === 'fruit') { x.setTransform(1, 0, 0, 1, 0, 0); x.translate(32, 32); x.scale(64 / 14, 64 / 14); PMRender.drawFruit(x, a, 0, 0, 1); }
    return (iconCache[key] = c.toDataURL());
  }
  function fruitFor(level) { return PM.FRUITS[Math.min(Math.max(level || 1, 1), 13) - 1].name; }

  // ---------- rendering ----------
  function rankClass(i) { return i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''; }

  function render() {
    var d = state.data[state.tab], el = $('boardBody');
    var isToday = state.tab === 'today';
    $('tabThumb').style.transform = 'translateX(' + (isToday ? 0 : 100) + '%)';
    $('tabToday').classList.toggle('on', isToday); $('tabAll').classList.toggle('on', !isToday);
    $('resetRow').style.visibility = isToday ? 'visible' : 'hidden';
    if (!d) {
      el.innerHTML = state.error ? '<div class="empty"><div class="emoji">!</div><p>Could not reach the leaderboard.</p><button class="ghostbtn" id="retry">Try again</button></div>'
        : '<div class="skeleton">' + new Array(8).join('<i></i>') + '</div>';
      var rb = $('retry'); if (rb) rb.onclick = function () { refresh(); };
      return;
    }
    var rows = d.rows, top = rows.length ? rows[0].score : 0;
    $('stGames').textContent = fmt(d.total);
    $('stTop').textContent = rows.length ? fmt(top) : '-';
    var best = lsGet(LS_BEST, 0); $('stBest').textContent = best ? fmt(best) : '-';
    $('gamesLabel').textContent = isToday ? 'GAMES TODAY' : 'GAMES PLAYED';
    if (!rows.length) {
      el.innerHTML = '<div class="empty"><img class="bob" src="' + icon('pac') + '" alt=""><p>' + (isToday ? 'No scores yet today.' : 'The board is empty.') + '</p><p class="sub">Be the first on the board.</p></div>';
      return;
    }
    var html = '', podium = rows.slice(0, 3), order = [1, 0, 2], i;
    html += '<div class="podium">';
    order.forEach(function (idx) {
      var r = podium[idx];
      if (!r) { html += '<div class="pod open ' + rankClass(idx) + '"><div class="rk">' + (idx + 1) + '</div><div class="q">?</div><div class="nm">UP FOR GRABS</div></div>'; return; }
      var you = state.you && state.you.id === r.id;
      html += '<div class="pod ' + rankClass(idx) + (you ? ' you' : '') + '" style="--d:' + (idx === 0 ? 0 : idx === 1 ? 120 : 240) + 'ms">' +
        (idx === 0 ? '<div class="crown">&#9819;</div>' : '') +
        '<img class="av" src="' + (idx === 0 ? icon('pac') : icon('ghost', idx === 1 ? 1 : 2)) + '" alt="">' +
        '<div class="rk">' + (idx + 1) + '</div><div class="nm" title="' + esc(r.name) + '">' + esc(r.name) + '</div>' +
        '<div class="sc" data-n="' + r.score + '">' + fmt(r.score) + '</div>' +
        '<div class="meta"><img src="' + icon('fruit', fruitFor(r.level)) + '" alt="">L' + r.level + ' &middot; ' + ago(r.created_at) + '</div></div>';
    });
    html += '</div><ol class="rows">';
    for (i = 3; i < Math.min(rows.length, SHOWN); i++) {
      var r2 = rows[i], you2 = state.you && state.you.id === r2.id, w = Math.max(4, Math.round(r2.score / top * 100));
      html += '<li class="row' + (you2 ? ' you' : '') + '" style="--i:' + (i - 3) + ';--w:' + w + '%;--c:' + PMRender.GHOST_COLORS[i % 4] + '">' +
        '<span class="bar"></span><span class="n">' + (i + 1) + '</span><img class="av" src="' + icon('ghost', i % 4) + '" alt="">' +
        '<span class="nm">' + esc(r2.name) + '</span><span class="lv"><img src="' + icon('fruit', fruitFor(r2.level)) + '" alt="">' + r2.level + '</span>' +
        '<span class="sc">' + fmt(r2.score) + '</span></li>';
    }
    html += '</ol>';
    // where does the player stand?
    if (state.you && !rows.some(function (r) { return r.id === state.you.id; }) && state.you.score > 0) {
      var beat = rows[Math.min(rows.length, SHOWN) - 1], need = beat ? beat.score - state.you.score : 0;
      html += '<div class="chase">Your last run: <b>' + fmt(state.you.score) + '</b>' + (rows.length >= SHOWN && need > 0 ? ' &middot; ' + fmt(need + 10) + ' more to reach the top ' + SHOWN : '') + '</div>';
    } else if (rows.length >= 1 && lsGet(LS_BEST, 0) > 0 && !(state.you)) {
      var mine = lsGet(LS_BEST, 0), ahead = null;
      for (i = rows.length - 1; i >= 0; i--) if (rows[i].score > mine) { ahead = rows[i]; break; }
      if (ahead) html += '<div class="chase">Next target: <b>' + esc(ahead.name) + '</b> &middot; ' + fmt(ahead.score - mine + 10) + ' points ahead of your best</div>';
    }
    el.innerHTML = html;
    countUp(el.querySelectorAll('.pod .sc'));
  }

  function countUp(nodes) {
    [].forEach.call(nodes, function (n) {
      var to = +n.getAttribute('data-n'), t0 = performance.now(), dur = 700;
      (function f(t) { var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); n.textContent = fmt(Math.round(to * e)); if (p < 1) requestAnimationFrame(f); })(t0);
    });
  }

  function refresh() {
    state.error = false;
    var scope = state.tab;
    if (!state.data[scope]) render();
    return Promise.all([fetchScope('today'), fetchScope('all')]).then(function (r) {
      state.data.today = r[0]; state.data.all = r[1]; state.error = false; render();
      if (window.PMBoard && PMBoard.onUpdate) PMBoard.onUpdate();
    }).catch(function () { state.error = true; if (!state.data[state.tab]) render(); });
  }

  function setTab(t) { if (state.tab === t) return; state.tab = t; try { window.PMAudio && PMAudio.play('click'); } catch (e) {} render(); }

  function tickCountdown() {
    var n = new Date(), next = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1), s = Math.max(0, Math.floor((next - n.getTime()) / 1000));
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    $('resetIn').textContent = p(Math.floor(s / 3600)) + ':' + p(Math.floor(s % 3600 / 60)) + ':' + p(s % 60);
    if (s === 0 || (s === 86399)) refresh();
  }

  // ---------- rank preview + entry overlay ----------
  function rankOf(scope, score) {
    var d = state.data[scope]; if (!d) return null;
    var n = 1; d.rows.forEach(function (r) { if (r.score >= score) n++; });
    return n > LIMIT && d.total >= LIMIT ? null : n;
  }

  function confetti(host, n) {
    var cols = ['#ffe100', '#ff2a2a', '#ffb8ff', '#19f0ff', '#ffb851', '#ffffff'], i;
    for (i = 0; i < n; i++) {
      var p = document.createElement('i'); p.className = 'cf';
      p.style.cssText = 'left:' + (Math.random() * 100) + '%;background:' + cols[i % cols.length] + ';--dx:' + ((Math.random() - 0.5) * 220) + 'px;--r:' + (Math.random() * 720) + 'deg;animation-delay:' + (Math.random() * 0.35) + 's;animation-duration:' + (1.1 + Math.random() * 1.1) + 's';
      host.appendChild(p); setTimeout(function (el) { return function () { el.remove(); }; }(p), 2800);
    }
  }

  function showEntry(run, done) {
    var ov = $('overlay'), score = run.score, level = run.level, submitted = false;
    var best = lsGet(LS_BEST, 0), isBest = score > best; if (isBest) lsSet(LS_BEST, score);
    var last = (function () { try { return localStorage.getItem(LS_NAME) || ''; } catch (e) { return ''; } })();
    var rt = rankOf('today', score), ra = rankOf('all', score);
    var rankLine = score <= 0 ? '' : (rt ? 'Good for <b>#' + rt + ' today</b>' : 'Outside today\'s top ' + LIMIT) + (ra && ra <= 10 ? ' and <b>#' + ra + ' all time</b>' : '');
    ov.innerHTML = '<div class="card entry"><div class="go">GAME OVER</div>' +
      '<div class="big">' + fmt(score) + '</div><div class="sub">Level ' + level + (isBest && best > 0 ? ' &middot; <b class="pb">new personal best</b>' : '') + '</div>' +
      (rankLine ? '<div class="rankline">' + rankLine + '</div>' : '') +
      (score > 0 ? '<label class="lab" for="nameIn">Enter your name</label><input id="nameIn" maxlength="10" autocomplete="off" spellcheck="false" placeholder="PLAYER" value="' + esc(last) + '">' +
        '<div class="err" id="nameErr"></div><div class="btns"><button class="btn primary" id="subBtn">Submit score</button><button class="btn" id="skipBtn">Skip</button></div>' :
        '<div class="btns"><button class="btn primary" id="skipBtn">Play again</button></div>') + '</div>';
    ov.classList.add('on');
    var nameIn = $('nameIn'), skip = $('skipBtn'), sub = $('subBtn');
    function close(again) { ov.classList.remove('on'); setTimeout(function () { ov.innerHTML = ''; }, 250); done(again); }
    function doSubmit() {
      if (submitted) return; var nm = cleanName(nameIn.value);
      if (!nm) { $('nameErr').textContent = nameIn.value.trim() ? 'Pick a different name.' : 'Enter a name first.'; nameIn.focus(); return; }
      submitted = true; sub.disabled = true; sub.textContent = 'Saving...'; try { localStorage.setItem(LS_NAME, nm); } catch (e) {}
      submitScore(nm, score, level).then(function (row) {
        state.you = { id: row.id, score: score, name: nm };
        try { PMAudio.play('submit'); } catch (e) {}
        state.tab = (rankOf('today', score) || 99) <= 10 || !CLOUD ? 'today' : state.tab;
        return refresh().then(function () {
          var rt2 = null, d = state.data.today; if (d) d.rows.forEach(function (r, i) { if (r.id === row.id) rt2 = i + 1; });
          ov.querySelector('.entry').innerHTML = '<div class="go ok">SCORE SUBMITTED</div><div class="big">' + fmt(score) + '</div>' +
            '<div class="sub">' + (rt2 ? 'You are <b>#' + rt2 + '</b> on today\'s board' : 'Saved to the board') + '</div><div class="btns"><button class="btn primary" id="againBtn">Play again</button><button class="btn" id="swarmBtn">Watch it drop in</button></div>';
          confetti(ov, rt2 && rt2 <= 3 ? 90 : 40);
          $('againBtn').onclick = function () { close(true); }; $('swarmBtn').onclick = function () { close(false); document.dispatchEvent(new CustomEvent('chomp:swarm')); }; setTimeout(function () { var b = $('againBtn'); if (b) b.focus(); }, 450);
        });
      }).catch(function () { submitted = false; sub.disabled = false; sub.textContent = 'Submit score'; $('nameErr').textContent = 'Could not save. Check your connection and try again.'; });
    }
    if (sub) sub.onclick = doSubmit; skip.onclick = function () { close(score <= 0); };
    if (nameIn) { nameIn.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); doSubmit(); } }); setTimeout(function () { nameIn.focus(); nameIn.select(); }, 60); }
    else skip.focus();
  }

  function init() {
    $('tabToday').onclick = function () { setTab('today'); };
    $('tabAll').onclick = function () { setTab('all'); };
    $('modeChip').textContent = CLOUD ? 'LIVE' : 'LOCAL'; $('modeChip').className = 'chip ' + (CLOUD ? 'live' : 'local');
    $('modeChip').title = CLOUD ? 'Scores are shared with everyone' : 'Scores are saved in this browser only';
    tickCountdown(); setInterval(tickCountdown, 1000);
    render(); refresh();
    setInterval(function () { if (!document.hidden) refresh(); }, 60000);
  }

  window.PMBoard = {
    init: init, refresh: refresh, showEntry: showEntry, onUpdate: null, cloud: CLOUD,
    swarm: function (limit) { return fetchScope('all', limit); }, youId: function () { return state.you ? state.you.id : null; },
    highScore: function () { var a = state.data.all && state.data.all.rows[0]; return Math.max(a ? a.score : 0, lsGet(LS_BEST, 0)); },
    clearYou: function () { state.you = null; render(); }
  };
})();
