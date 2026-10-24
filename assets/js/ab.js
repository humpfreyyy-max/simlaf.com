/* SIMLAF OFF/ON player: both versions play together, perfectly in step, and the switch only
   moves the volume between them (a 12 ms crossfade), so the playback position never jumps.
   The audio downloads on the first tap, never before. Without Web Audio, the two files are
   offered as plain links instead. */
(function () {
  "use strict";
  var players = document.querySelectorAll("[data-ab]");
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!players.length || !AC || !window.fetch) return;
  var ctx = null, current = null;
  if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch (e) { /* older browsers */ } }

  function decode(buf) {
    return new Promise(function (ok, fail) {
      var p = ctx.decodeAudioData(buf, ok, fail);
      if (p && p.then) p.then(ok, fail);
    });
  }
  // Where the music starts in a decoded file: some decoders keep the encoder's few ms of lead-in.
  function lead(buffer) {
    var ch = buffer.getChannelData(0), max = Math.min(ch.length, Math.floor(buffer.sampleRate * 0.3));
    for (var i = 0; i < max; i++) if (Math.abs(ch[i]) > 0.0005) return i / buffer.sampleRate;
    return 0;
  }

  Array.prototype.forEach.call(players, function (el) {
    el.classList.add("ab--ready");
    var playBtn = el.querySelector("[data-ab-play]");
    var label = el.querySelector("[data-ab-label]");
    var stateEl = el.querySelector("[data-ab-state]");
    var sides = el.querySelectorAll("[data-ab-side]");
    var seconds = parseFloat(el.getAttribute("data-seconds")) || 0;
    var side = "off", buffers = null, loading = null, nodes = null;
    var api = { stop: stop };

    function render(note) {
      var playing = !!nodes;
      playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
      label.textContent = playing ? "Pause" : "Play";
      Array.prototype.forEach.call(sides, function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-ab-side") === side ? "true" : "false");
      });
      stateEl.textContent = note || (playing ? "Playing: " + side : "");
    }

    function load() {
      if (buffers) return Promise.resolve(buffers);
      if (loading) return loading;
      render("Loading");
      loading = Promise.all(["off", "on"].map(function (k) {
        return fetch(el.getAttribute("data-" + k)).then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.arrayBuffer();
        }).then(decode);
      })).then(function (b) {
        buffers = { off: b[0], on: b[1] };
        return buffers;
      }, function (err) {
        loading = null;
        el.classList.remove("ab--ready");          // show the plain links instead
        throw err;
      });
      return loading;
    }

    function start() {
      if (current && current !== api) current.stop();
      current = api;
      var t = ctx.currentTime + 0.06;
      var from = Math.min(lead(buffers.off), lead(buffers.on));
      var len = seconds || buffers.off.duration;
      if (from + len > Math.min(buffers.off.duration, buffers.on.duration) + 0.005) from = 0;
      nodes = {};
      ["off", "on"].forEach(function (k) {
        var src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = buffers[k];
        src.loop = true;
        src.loopStart = from;
        src.loopEnd = from + len;
        g.gain.value = k === side ? 1 : 0;
        src.connect(g);
        g.connect(ctx.destination);
        src.start(t, from);
        nodes[k] = { src: src, gain: g };
      });
      render();
    }

    function stop() {
      if (!nodes) return;
      var now = ctx.currentTime, n = nodes;
      nodes = null;
      ["off", "on"].forEach(function (k) {
        n[k].gain.gain.cancelScheduledValues(now);
        n[k].gain.gain.setValueAtTime(n[k].gain.gain.value, now);
        n[k].gain.gain.linearRampToValueAtTime(0, now + 0.03);
        n[k].src.stop(now + 0.04);
      });
      if (current === api) current = null;
      render();
    }

    function ensureContext() {
      ctx = ctx || new AC();
      if (ctx.state === "suspended") ctx.resume();
    }

    function play() {
      ensureContext();                              // inside the tap, so phones allow sound
      load().then(start, function () { render("Could not load the audio"); });
    }

    function setSide(k) {
      side = k;
      if (nodes) {
        var now = ctx.currentTime;
        ["off", "on"].forEach(function (s) {
          var g = nodes[s].gain.gain;
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(s === side ? 1 : 0, now + 0.012);
        });
        render();
      } else {
        render();
        play();
      }
    }

    playBtn.addEventListener("click", function () { if (nodes) stop(); else play(); });
    Array.prototype.forEach.call(sides, function (b) {
      b.addEventListener("click", function () { setSide(b.getAttribute("data-ab-side")); });
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
  });
})();
