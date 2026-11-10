// Chomper sound: all effects are synthesized with WebAudio (no sample files). Original melodies are not used.
(function () {
  'use strict';
  var ctx = null, master = null, muted = false, wakaFlip = false, loop = null, loopMode = 'off';
  try { muted = localStorage.getItem('chomper-muted') === '1'; } catch (e) {}

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ensure()) return;
    var t0 = ctx.currentTime + (when || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  var A = {
    unlock: ensure,
    setMuted: function (m) { muted = m; try { localStorage.setItem('chomper-muted', m ? '1' : '0'); } catch (e) {} if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted: function () { return muted; },
    play: function (name) {
      if (muted) return;
      var i;
      if (name === 'dot') { wakaFlip = !wakaFlip; tone(wakaFlip ? 330 : 440, 0.07, 'triangle', 0.22, 0, wakaFlip ? 220 : 560); }
      else if (name === 'pellet') { tone(160, 0.2, 'square', 0.12, 0, 90); }
      else if (name === 'ghost') { tone(220, 0.32, 'sawtooth', 0.14, 0, 1500); }
      else if (name === 'fruit') { tone(660, 0.09, 'square', 0.14); tone(990, 0.14, 'square', 0.14, 0.09); }
      else if (name === 'extralife') { [523, 659, 784, 1047, 1319].forEach(function (f, k) { tone(f, 0.1, 'square', 0.12, k * 0.08); }); }
      else if (name === 'death') { for (i = 0; i < 9; i++) tone(900 - i * 80, 0.16, 'sawtooth', 0.13, 1.0 + i * 0.12, 520 - i * 50); tone(300, 0.1, 'square', 0.14, 2.3, 60); }
      else if (name === 'ready') { [392, 494, 587, 784, 587, 494, 392, 330, 392, 494, 659, 784].forEach(function (f, k) { tone(f, 0.11, 'square', 0.1, k * 0.13); tone(f / 2, 0.11, 'triangle', 0.1, k * 0.13); }); }
      else if (name === 'clear') { [523, 659, 784, 1047].forEach(function (f, k) { tone(f, 0.12, 'square', 0.12, k * 0.09); }); }
      else if (name === 'click') { tone(880, 0.05, 'square', 0.08); }
      else if (name === 'submit') { [784, 988, 1175, 1568].forEach(function (f, k) { tone(f, 0.1, 'square', 0.12, k * 0.07); }); }
    },
    // looping background sound: 'siren' (pitch rises as dots run out), 'fright', 'eyes', 'off'
    loop: function (mode, pitch) {
      if (muted || !ctx) mode = 'off';
      if (mode === 'off') { if (loop) { try { loop.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); loop.o.stop(ctx.currentTime + 0.2); } catch (e) {} loop = null; loopMode = 'off'; } return; }
      if (!loop || loopMode !== mode) {
        A.loop('off');
        var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = mode === 'siren' ? 'triangle' : 'square'; g.gain.value = mode === 'siren' ? 0.07 : 0.05;
        lfo.frequency.value = mode === 'fright' ? 9 : mode === 'eyes' ? 12 : 2.2; lg.gain.value = mode === 'fright' ? 60 : mode === 'eyes' ? 120 : 90;
        lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(master); o.start(); lfo.start();
        loop = { o: o, g: g, lfo: lfo, lg: lg }; loopMode = mode;
        var stop = o.stop.bind(o); o.stop = function (t) { stop(t); try { lfo.stop(t); } catch (e) {} };
      }
      var base = mode === 'siren' ? 330 + (pitch || 0) * 170 : mode === 'fright' ? 170 : 520;
      loop.o.frequency.setTargetAtTime(base, ctx.currentTime, 0.05);
    }
  };
  window.PMAudio = A;
})();
