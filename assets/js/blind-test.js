/* SIMLAF — /blind-test, "Can you hear it?": a blind A/B/X listening test.
   A run is a seeded list of trials, so ?c=<seed> gives a friend the same trials in the same order.
   Audio: A, B and X are three looping sources started at the same instant from decoded buffers,
   each through its own gain; switching is a 12 ms linear crossfade between gains, so the place in
   the loop is kept to the sample and nothing clicks. X has its own source, so a switch to X sounds
   the same whether X is A or B. Nothing is fetched until the visitor starts. Answers and scores are
   never sent: the only things counted (and only while the site's cookie-free counting is on) are
   the funnel events blind-start, blind-complete and blind-share, defined in growth/UTM.md and sent
   through assets/js/track.js. With counting off nobody listens and the calls do nothing. */
(function () {
  "use strict";

  var root = document.querySelector("[data-bt]");
  var dataEl = document.getElementById("bt-data");
  if (!root || !dataEl) return;
  var D;
  try { D = JSON.parse(dataEl.textContent || "{}"); } catch (err) { return; }
  if (!D.pairs || !D.pairs.length) return;

  var $ = function (sel) { return root.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  var views = { intro: $("[data-view=intro]"), trial: $("[data-view=trial]"), result: $("[data-view=result]") };
  var el = {
    start: $("[data-start]"), status: $("[data-status]"), challenge: $("[data-challenge]"),
    count: $("[data-count]"), dots: $("[data-dots]"), title: $("[data-title]"), meta: $("[data-meta]"),
    keys: $$("[data-src]"), xlabel: $("[data-xlabel]"), play: $("[data-play]"), playLabel: $("[data-play-label]"),
    wave: $("[data-wave]"), head: $("[data-head]"), now: $("[data-now]"),
    choices: $$("[data-answer]"), lock: $("[data-lock]"), feedback: $("[data-feedback]"),
    score: $("[data-score]"), verdict: $("[data-verdict]"), odds: $("[data-odds]"), list: $("[data-list]"),
    again: $("[data-again]"), fresh: $("[data-new]"), card: $("[data-card]"),
    native: $("[data-native]"), x: $("[data-x]"), reddit: $("[data-reddit]"), whatsapp: $("[data-whatsapp]"),
    copy: $("[data-copy]"), save: $("[data-save]"), copied: $("[data-copied]")
  };
  var N = Math.min(D.perRun || 6, D.pairs.length);
  var AC = window.AudioContext || window.webkitAudioContext;

  // ---------------------------------------------------------------- seeds and runs
  var SEED_RE = /^[a-z0-9]{4,12}$/;
  function newSeed() {
    var a = new Uint32Array(2);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return (a[0].toString(36) + a[1].toString(36) + "000000").slice(0, 6);
  }
  function hash(str) {                      // xmur3: a 32-bit seed from a string
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rng(seed) {                      // mulberry32
    var a = hash(seed);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function coin() {                          // X is drawn fresh for every visitor and every run, never from the seed,
    var a = new Uint8Array(1);               // so a shared link fixes the trials but nobody can pass on the answers
    (window.crypto || window.msCrypto).getRandomValues(a);
    return a[0] < 128;
  }
  function makeRun(seed) {
    var r = rng(seed), order = D.pairs.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
    return order.slice(0, N).map(function (i) { return { pair: D.pairs[i], xIsB: coin(), answer: null, right: null }; });
  }

  var params = new URLSearchParams(window.location.search);
  var asked = (params.get("c") || "").toLowerCase();
  var challenged = SEED_RE.test(asked);
  var seed = challenged ? asked : newSeed();
  if (challenged) el.challenge.hidden = false;

  var started = false;
  function track(name, data) {
    try { document.dispatchEvent(new CustomEvent("simlaf:track", { detail: { name: name, data: data } })); } catch (err) { /* old browser */ }
  }

  // ---------------------------------------------------------------- audio
  var ctx = null, master = null, gains = {}, ramps = {}, sources = [];
  var bufs = null, loopDur = 0, playing = false, startAt = 0, offset = 0, current = "a", raf = 0;
  var FADE = 0.012;
  var canFlac = (function () { var a = document.createElement("audio"); return !!(a.canPlayType && a.canPlayType("audio/flac").replace(/no/, "")); })();
  var useAac = !canFlac || !!(navigator.connection && navigator.connection.saveData);
  var cache = {};

  function ensureContext() {
    if (!AC) return false;
    if (!ctx) {
      try { ctx = new AC({ latencyHint: "interactive" }); } catch (err) { ctx = new AC(); }
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      ramps.master = { v0: 0, v1: 0, t0: 0, t1: 0 };
      ["a", "b", "x"].forEach(function (k) {
        var g = ctx.createGain();
        g.gain.value = k === current ? 1 : 0;
        g.connect(master);
        gains[k] = g;
        ramps[k] = { v0: g.gain.value, v1: g.gain.value, t0: 0, t1: 0 };
      });
    }
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (err) { /* older browsers */ }
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    try {                                   // a silent sample inside the tap unlocks audio on phones
      var s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start(0);
    } catch (err) { /* nothing to unlock */ }
    return true;
  }

  function valueAt(r, t) {
    if (t >= r.t1) return r.v1;
    if (t <= r.t0) return r.v0;
    return r.v0 + (r.v1 - r.v0) * (t - r.t0) / (r.t1 - r.t0);
  }
  function rampTo(param, r, v, t, fade) {   // our own record of each ramp, so a switch mid-ramp starts where it really is
    var from = valueAt(r, t);
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    if (fade > 0) param.linearRampToValueAtTime(v, t + fade);
    r.v0 = from; r.v1 = v; r.t0 = t; r.t1 = t + fade;
  }
  function route(k, t, fade) {
    ["a", "b", "x"].forEach(function (n) { rampTo(gains[n].gain, ramps[n], n === k ? 1 : 0, t, fade); });
  }

  function decode(ab) {
    return new Promise(function (resolve, reject) {
      var p = ctx.decodeAudioData(ab, resolve, reject);
      if (p && p.catch) p.catch(reject);
    });
  }
  function fetchDecode(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }).then(decode);
  }
  function loadPair(pair) {                 // both versions in the same format, always: FLAC, or AAC for both
    if (cache[pair.id]) return cache[pair.id];
    var attempt = function (kind) {
      return Promise.all([fetchDecode(pair.off[kind]), fetchDecode(pair.on[kind])]).then(function (b) {
        return { a: b[0], b: b[1], kind: kind };
      });
    };
    var p = (useAac ? attempt("aac") : attempt("flac").catch(function () { useAac = true; return attempt("aac"); }));
    p.catch(function () { delete cache[pair.id]; });
    cache[pair.id] = p;
    return p;
  }

  function position(t) { return loopDur ? (((t - startAt) % loopDur) + loopDur) % loopDur : 0; }

  function play() {
    if (!bufs || playing || !ensureContext()) return;
    var t = ctx.currentTime + 0.03, trial = run[idx], from = offset % loopDur;
    sources = ["a", "b", "x"].map(function (k) {
      var s = ctx.createBufferSource();
      s.buffer = k === "a" ? bufs.a : k === "b" ? bufs.b : (trial.xIsB ? bufs.b : bufs.a);
      s.loop = true;
      s.loopStart = 0;
      s.loopEnd = loopDur;
      s.connect(gains[k]);
      s.start(t, from);
      return s;
    });
    route(current, t, 0);
    rampTo(master.gain, ramps.master, 1, t, FADE);
    startAt = t - from;
    playing = true;
    paintTransport();
    tick();
  }
  function stop() {
    if (!playing) return;
    var t = ctx.currentTime;
    rampTo(master.gain, ramps.master, 0, t, FADE);
    sources.forEach(function (s) { try { s.stop(t + FADE + 0.01); } catch (err) { /* already stopped */ } });
    offset = position(t + FADE);
    sources = [];
    playing = false;
    cancelAnimationFrame(raf);
    paintTransport();
  }
  function toggle() { if (playing) stop(); else play(); }
  function select(k) {
    current = k;
    if (ctx && playing) route(k, ctx.currentTime, FADE);
    el.keys.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-src") === k)); });
    if (!playing) play();
    paintTransport();
  }

  // ---------------------------------------------------------------- the waveform strip (from A only, so it tells nothing about X)
  function drawWave() {
    var c = el.wave, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(200, Math.round(c.clientWidth * dpr)), h = Math.max(40, Math.round(c.clientHeight * dpr));
    c.width = w; c.height = h;
    var g = c.getContext("2d");
    g.clearRect(0, 0, w, h);
    if (!bufs) return;
    var L = bufs.a.getChannelData(0), R = bufs.a.numberOfChannels > 1 ? bufs.a.getChannelData(1) : L;
    var bar = 3 * dpr, gap = 2 * dpr, cols = Math.floor(w / (bar + gap)), step = Math.floor(L.length / cols), peaks = [], top = 0;
    for (var i = 0; i < cols; i++) {
      var m = 0;
      for (var j = i * step, e = j + step; j < e; j += 16) { var v = Math.abs(L[j] + R[j]); if (v > m) m = v; }
      peaks.push(m);
      if (m > top) top = m;
    }
    g.fillStyle = "rgba(244, 239, 230, .34)";
    for (i = 0; i < cols; i++) {
      var ph = Math.max(2 * dpr, (peaks[i] / (top || 1)) * (h - 8 * dpr));
      g.fillRect(i * (bar + gap), (h - ph) / 2, bar, ph);
    }
  }
  function tick() {
    if (!playing) return;
    var x = (position(ctx.currentTime) / loopDur) * el.wave.clientWidth;
    el.head.style.transform = "translateX(" + x.toFixed(1) + "px)";
    raf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- the run
  var run = [], idx = 0, locked = false, ready = false;

  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
  }
  function mb(n) { return (n / 1048576).toFixed(1) + " MB"; }
  function paintTransport() {
    el.play.classList.toggle("is-on", playing);
    el.playLabel.textContent = playing ? "Stop" : "Play";
    if (!ready) return;
    var p = run[idx].pair, name = { a: "A, " + p.short + " off", b: "B, " + p.short + " on", x: "X" }[current];
    if (locked && current === "x") name = "X, which was " + (run[idx].xIsB ? "B, on" : "A, off");
    el.now.textContent = playing ? "Hearing " + name + ". Switch any time: you keep your place in the loop."
                                 : "Stopped on " + name + ". Press Play, or 1, 2 or X.";
  }
  function paintDots() {
    el.dots.innerHTML = "";
    run.forEach(function (t, i) {
      var li = document.createElement("li");
      if (t.right === true) li.className = "is-right";
      else if (t.right === false) li.className = "is-wrong";
      else if (i === idx) li.className = "is-now";
      el.dots.appendChild(li);
    });
  }
  function setBusy(busy) {
    el.keys.concat([el.play]).forEach(function (b) { b.disabled = busy; });
  }

  function enterTrial(i) {
    stop();
    idx = i; locked = false; ready = false; bufs = null; offset = 0; current = "a";
    var t = run[i], p = t.pair;
    el.count.textContent = "Trial " + (i + 1) + " of " + run.length + " · " + p.level;
    paintDots();
    el.title.textContent = p.processor;
    el.meta.textContent = p.material + ", played by " + p.madeWith + ". A is " + p.short + " off. B is " + p.short + " on, " + p.setting + ".";
    el.keys.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-src") === "a")); });
    el.xlabel.textContent = "Off or on?";
    el.choices.forEach(function (b) { b.setAttribute("aria-pressed", "false"); b.disabled = false; b.classList.remove("is-right", "is-wrong"); });
    el.lock.disabled = true;
    el.lock.textContent = "Lock in";
    el.feedback.innerHTML = "";
    el.head.style.transform = "translateX(0)";
    setBusy(true);
    var bytes = useAac ? p.off.aacBytes + p.on.aacBytes : p.off.bytes + p.on.bytes;
    el.now.textContent = "Loading the audio (" + mb(bytes) + ")…";
    show("trial");
    el.title.focus({ preventScroll: true });
    if (views.trial.getBoundingClientRect().top < 0) root.scrollIntoView({ behavior: "smooth", block: "start" });
    drawWave();
    loadPair(p).then(function (r) {
      if (run[idx] !== t) return;
      bufs = r;
      loopDur = Math.min(r.a.duration, r.b.duration);
      ready = true;
      setBusy(false);
      drawWave();
      el.now.textContent = "Ready" + (r.kind === "aac" ? " (AAC audio)" : " (lossless audio)") + ". Press Play, or 1, 2 or X.";
      if (run[i + 1]) loadPair(run[i + 1].pair);   // the next trial loads while this one plays
      else loadCardLib().catch(function () {});    // on the last trial, the share card's code
    }).catch(function () {
      if (run[idx] !== t) return;
      el.now.textContent = "The audio didn't load. Check your connection, then press Play to try again.";
      el.play.disabled = false;
      el.play.onclick = function () { el.play.onclick = null; enterTrial(idx); };
    });
  }

  function choose(k) {
    if (locked || !run.length) return;
    run[idx].answer = k;
    el.choices.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-answer") === k)); });
    el.lock.disabled = false;
    el.lock.focus({ preventScroll: true });
  }

  function lockOrNext() {
    var t = run[idx];
    if (!t) return;
    if (!locked) {
      if (!t.answer) return;
      locked = true;
      t.right = (t.answer === "b") === t.xIsB;
      var was = t.xIsB ? "B" : "A", state = t.xIsB ? "on" : "off";
      el.choices.forEach(function (b) {
        var v = b.getAttribute("data-answer");
        b.disabled = true;
        if (v === t.answer) b.classList.add(t.right ? "is-right" : "is-wrong");
      });
      el.xlabel.textContent = "Was " + was + " · " + state;
      el.feedback.innerHTML = t.right
        ? '<span class="right">Right.</span> X was ' + was + ": " + t.pair.short + " " + state + "."
        : '<span class="wrong">Not this one.</span> X was ' + was + ": " + t.pair.short + " " + state + ".";
      el.lock.textContent = idx < run.length - 1 ? "Next trial" : "See my score";
      paintDots();
      paintTransport();
      return;
    }
    if (idx < run.length - 1) enterTrial(idx + 1);
    else finish();
  }

  // ---------------------------------------------------------------- the result
  function comb(n, k) { var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
  function upper(k, n) { var s = 0; for (var i = k; i <= n; i++) s += comb(n, i); return s / Math.pow(2, n); }
  function lower(k, n) { var s = 0; for (var i = 0; i <= k; i++) s += comb(n, i); return s / Math.pow(2, n); }
  function often(p) { return p > 0.5 ? "about " + Math.round(p * 100) + "% of the time" : "about 1 time in " + Math.round(1 / p); }

  function verdictFor(k, n) {
    var up = upper(k, n), low = lower(k, n);
    if (k === n) return ["You can hear it.", "Pure guessing gets all " + n + " right " + often(up) + "."];
    if (up <= 0.11) return ["You can very likely hear it.", "Pure guessing gets " + k + " or more of " + n + " right " + often(up) + "."];
    if (up <= 0.35) return ["Maybe. Run it again to be sure.", "Pure guessing gets " + k + " or more of " + n + " right " + often(up) + ", so this could still be luck."];
    if (k * 2 >= n) return ["Coin-flip territory.", "Pure guessing gets " + k + " or more of " + n + " right " + often(up) + ". Gain-matched, some of these are hard. Try again on headphones."];
    if (low <= 0.11) return ["Backwards, probably.", "Pure guessing gets this few right only " + often(low) + ". A score this low usually means you hear the difference but mixed up which was which."];
    return ["Below a coin flip.", "Pure guessing averages " + (n / 2) + " of " + n + ". Try again, ideally on headphones."];
  }

  function shareUrl() { return D.url + "?c=" + seed; }

  function finish() {
    stop();
    var k = run.filter(function (t) { return t.right; }).length, n = run.length, v = verdictFor(k, n);
    el.score.innerHTML = k + " <em>of</em> " + n;
    el.verdict.textContent = v[0];
    el.odds.textContent = v[1] + " These odds are for this run only. We don't collect answers, so there is no average to compare with.";
    el.list.innerHTML = "";
    run.forEach(function (t) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="' + (t.right ? "mark-r" : "mark-w") + '" aria-hidden="true">' + (t.right ? "✓" : "✗") + "</span>"
        + '<span><a class="bt__plink"></a> · <span></span></span><small></small>';
      var a = li.querySelector("a");
      a.textContent = t.pair.short;
      a.href = t.pair.href;
      li.querySelector("span span").textContent = t.pair.material.toLowerCase() + " · " + t.pair.level.toLowerCase();
      li.querySelector("small").textContent = (t.right ? "right" : "missed") + ", X was " + (t.xIsB ? "on" : "off");
      el.list.appendChild(li);
    });
    show("result");
    try { window.history.replaceState(null, "", window.location.pathname + "?c=" + seed + "#test"); } catch (err) { /* file:// */ }
    el.score.focus({ preventScroll: true });
    root.scrollIntoView({ behavior: "smooth", block: "start" });
    setShare(k, n, v);
    drawCard(k, n, v);
    track("blind-complete", { test: "blind-test" });
  }

  function setShare(k, n) {
    var url = shareUrl(), enc = encodeURIComponent;
    var text = k + "/" + n + " on a loudness-matched blind A/B/X. Same " + n + " trials, beat me:";
    el.x.href = "https://twitter.com/intent/tweet?text=" + enc(text) + "&url=" + enc(url);
    el.reddit.href = "https://www.reddit.com/submit?url=" + enc(url);   // the title is the visitor's own words, never a template
    el.whatsapp.href = "https://wa.me/?text=" + enc(text + " " + url);
    el.copied.textContent = "";
    if (navigator.share) {
      el.native.hidden = false;
      el.native.onclick = function () {
        var payload = { title: "Can you hear it?", text: text, url: url };
        cardFile().then(function (file) {
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) payload.files = [file];
          return navigator.share(payload);
        }).then(function () { track("blind-share", { channel: "native" }); }).catch(function () { /* closed the sheet */ });
      };
    }
  }

  el.copy.addEventListener("click", function () {
    var url = shareUrl();
    var done = function () { el.copied.textContent = "Copied: " + url.replace(/^https:\/\//, ""); track("blind-share", { channel: "copy" }); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { el.copied.textContent = url; });
    } else {
      el.copied.textContent = url;
    }
  });

  // ---------------------------------------------------------------- the share card (assets/js/blind-test-card.js, loaded on first result)
  var cardBlob = null, cardUrl = "", cardLib = null;
  function loadCardLib() {
    if (window.SIMLAFCard) return Promise.resolve(window.SIMLAFCard);
    if (!cardLib) cardLib = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = D.cardJs;
      s.onload = function () { resolve(window.SIMLAFCard); };
      s.onerror = function () { cardLib = null; reject(new Error("card")); };
      document.head.appendChild(s);
    });
    return cardLib;
  }
  function drawCard(k, n, v) {
    el.card.setAttribute("aria-label", "Share card: " + k + " of " + n + " right on the SIMLAF blind listening test. " + v[0] + " " + v[1]);
    return loadCardLib().then(function (lib) {
      return lib.draw({ canvas: el.card, k: k, n: n, verdict: v, seed: seed, run: run, rand: rng(seed + ":card") });
    }).then(function (blob) {
      cardBlob = blob;
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = blob ? URL.createObjectURL(blob) : "";
      if (cardUrl) el.save.href = cardUrl;
      return blob;
    }).catch(function () { el.save.hidden = true; return null; });
  }
  function cardFile() {
    return Promise.resolve(cardBlob).then(function (b) {
      try { return b ? new File([b], "simlaf-blind-test.jpg", { type: "image/jpeg" }) : null; } catch (err) { return null; }
    });
  }

  // ---------------------------------------------------------------- controls
  function begin(newRun) {
    if (!AC || !window.fetch || !window.Promise) {
      el.status.textContent = "This browser can't play the test audio. A current version of any major browser can.";
      return;
    }
    ensureContext();
    if (newRun) { seed = newSeed(); challenged = false; el.challenge.hidden = true; }
    run = makeRun(seed);
    if (!started) { started = true; track("blind-start", { test: "blind-test" }); }
    enterTrial(0);
  }
  el.start.addEventListener("click", function () { begin(false); });
  el.again.addEventListener("click", function () { begin(false); });
  el.fresh.addEventListener("click", function () { begin(true); });
  el.keys.forEach(function (b) { b.addEventListener("click", function () { select(b.getAttribute("data-src")); }); });
  el.play.addEventListener("click", function () { if (!el.play.onclick) toggle(); });
  el.choices.forEach(function (b) { b.addEventListener("click", function () { choose(b.getAttribute("data-answer")); }); });
  el.lock.addEventListener("click", lockOrNext);
  [["x", el.x], ["reddit", el.reddit], ["whatsapp", el.whatsapp], ["save", el.save]].forEach(function (c) {
    c[1].addEventListener("click", function () { track("blind-share", { channel: c[0] }); });
  });

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || views.trial.hidden) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    var key = (e.key || "").toLowerCase();
    if (key === "1") select("a");
    else if (key === "2") select("b");
    else if (key === "x") select("x");
    else if (key === "a") choose("a");
    else if (key === "b") choose("b");
    else if (key === " " || key === "spacebar") { if (tag === "A" || !ready) return; toggle(); }
    else if (key === "enter") { if (tag === "BUTTON" || tag === "A") return; lockOrNext(); }
    else return;
    e.preventDefault();
  });

  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (!views.trial.hidden) drawWave(); }, 150);
  });
})();
