/* SIMLAF — blind A/B/X listening test.
   Reads the tests embedded in the page (from data/listen.json). For each round
   the two clips are shuffled into A and B, X is one of them at random, and the
   labels stay hidden until the listener has answered both questions. */
(function () {
  "use strict";

  var dataEl = document.getElementById("listen-data");
  var root = document.getElementById("abx");
  if (!dataEl || !root) return;

  var data;
  try { data = JSON.parse(dataEl.textContent || "{}"); } catch (e) { data = {}; }
  var base = root.getAttribute("data-base") || "";
  var tests = (data.tests || []).filter(function (t) {
    return t && t.clips && t.clips.length === 2 && t.clips[0].src && t.clips[1].src;
  });
  if (!tests.length) return; // the empty state in the page stays as it is

  var $ = function (sel) { return root.querySelector(sel); };
  var empty = $(".abx__empty");
  var player = $(".abx__player");
  if (empty) empty.hidden = true;
  player.hidden = false;

  var listEl = $(".abx__tests");
  var titleEl = $(".abx__title");
  var descEl = $(".abx__desc");
  var keys = { A: $("[data-key=A]"), B: $("[data-key=B]"), X: $("[data-key=X]") };
  var playBtn = $(".abx__play");
  var bar = $(".abx__progress i");
  var timeEl = $(".abx__time");
  var xChoices = $(".abx__choices--x");
  var whichChoices = $(".abx__choices--which");
  var whichQ = $(".abx__which-q");
  var revealBtn = $(".abx__reveal");
  var againBtn = $(".abx__again");
  var result = $(".abx__result");
  var scoreEl = $(".abx__score");

  var score = { right: 0, total: 0 };
  var round = null;
  var audio = { A: new Audio(), B: new Audio() };
  var active = null;   // "A" | "B" | "X"
  var raf = 0;

  audio.A.preload = audio.B.preload = "none";
  audio.A.loop = audio.B.loop = true;

  function fmt(t) {
    if (!isFinite(t)) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function targetIndex(test) {
    for (var i = 0; i < 2; i++) if (test.clips[i].is_simlaf) return i;
    return 0;
  }

  function elFor(key) { return key === "X" ? audio[round.x] : audio[key]; }

  function stopAll() {
    audio.A.pause(); audio.B.pause();
    cancelAnimationFrame(raf);
    playBtn.textContent = "Play";
    playBtn.setAttribute("aria-label", "Play");
  }

  function tick() {
    var el = active ? elFor(active) : null;
    if (el && el.duration) {
      bar.style.width = (100 * el.currentTime / el.duration).toFixed(2) + "%";
      timeEl.textContent = fmt(el.currentTime) + " / " + fmt(el.duration);
    }
    raf = requestAnimationFrame(tick);
  }

  function select(key) {
    var prev = active ? elFor(active) : null;
    var t = prev ? prev.currentTime : 0;
    active = key;
    Object.keys(keys).forEach(function (k) { keys[k].setAttribute("aria-pressed", k === key ? "true" : "false"); });
    var next = elFor(key);
    if (prev && prev !== next) prev.pause();
    if (next.preload !== "auto") next.preload = "auto";
    try { next.currentTime = t; } catch (e) { /* not seekable yet */ }
    play();
  }

  function play() {
    if (!active) { select("A"); return; }
    var el = elFor(active);
    var other = el === audio.A ? audio.B : audio.A;
    other.pause();
    var p = el.play();
    if (p && p.catch) p.catch(function () { stopAll(); });
    playBtn.textContent = "Pause";
    playBtn.setAttribute("aria-label", "Pause");
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function toggle() {
    var el = active ? elFor(active) : null;
    if (el && !el.paused) stopAll(); else play();
  }

  function setChoice(group, value) {
    Array.prototype.forEach.call(group.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-value") === value ? "true" : "false");
    });
  }

  function updateReveal() {
    revealBtn.disabled = !(round.xGuess && round.whichGuess) || round.revealed;
  }

  function start(i) {
    stopAll();
    var test = tests[i];
    var order = Math.random() < 0.5 ? [0, 1] : [1, 0];
    round = {
      index: i, test: test, order: order,
      x: Math.random() < 0.5 ? "A" : "B",
      xGuess: null, whichGuess: null, revealed: false
    };
    audio.A.src = base + test.clips[order[0]].src;
    audio.B.src = base + test.clips[order[1]].src;
    audio.A.preload = audio.B.preload = "none";
    active = null;
    Object.keys(keys).forEach(function (k) { keys[k].setAttribute("aria-pressed", "false"); });
    bar.style.width = "0";
    timeEl.textContent = "0:00 / 0:00";

    titleEl.textContent = test.title || "Listening test";
    descEl.textContent = test.description || "";
    var target = test.clips[targetIndex(test)].label;
    whichQ.textContent = "2 · " + (test.question || ("Which one is " + target + "?"));
    setChoice(xChoices, null);
    setChoice(whichChoices, null);
    result.hidden = true;
    againBtn.hidden = true;
    updateReveal();

    Array.prototype.forEach.call(listEl.querySelectorAll("button"), function (b, j) {
      b.setAttribute("aria-pressed", j === i ? "true" : "false");
    });
  }

  function reveal() {
    if (round.revealed) return;
    round.revealed = true;
    stopAll();
    var t = round.test;
    var labelA = t.clips[round.order[0]].label;
    var labelB = t.clips[round.order[1]].label;
    var targetKey = round.order[0] === targetIndex(t) ? "A" : "B";
    var xRight = round.xGuess === round.x;
    var whichRight = round.whichGuess === targetKey;
    score.total += 2;
    score.right += (xRight ? 1 : 0) + (whichRight ? 1 : 0);

    result.innerHTML = "";
    var lines = [
      ["A was " + labelA + ". B was " + labelB + ".", ""],
      ["X was " + round.x + ". You said " + round.xGuess + ".", xRight ? "right" : "wrong"],
      [t.clips[targetIndex(t)].label + " was " + targetKey + ". You picked " + round.whichGuess + ".", whichRight ? "right" : "wrong"]
    ];
    lines.forEach(function (l) {
      var p = document.createElement("p");
      p.textContent = l[0];
      if (l[1]) {
        var s = document.createElement("strong");
        s.className = l[1];
        s.textContent = l[1] === "right" ? "  Correct." : "  Not this time.";
        p.appendChild(s);
      }
      result.appendChild(p);
    });
    result.hidden = false;
    againBtn.hidden = false;
    scoreEl.textContent = "Session score: " + score.right + " / " + score.total;
    updateReveal();
  }

  // test list
  tests.forEach(function (t, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = t.title || ("Test " + (i + 1));
    b.addEventListener("click", function () { start(i); });
    listEl.appendChild(b);
  });
  if (tests.length < 2) listEl.hidden = true;

  Object.keys(keys).forEach(function (k) {
    keys[k].addEventListener("click", function () { select(k); });
  });
  playBtn.addEventListener("click", toggle);

  xChoices.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-value]");
    if (!b || round.revealed) return;
    round.xGuess = b.getAttribute("data-value");
    setChoice(xChoices, round.xGuess);
    updateReveal();
  });
  whichChoices.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-value]");
    if (!b || round.revealed) return;
    round.whichGuess = b.getAttribute("data-value");
    setChoice(whichChoices, round.whichGuess);
    updateReveal();
  });
  revealBtn.addEventListener("click", reveal);
  againBtn.addEventListener("click", function () { start(round.index); });

  root.addEventListener("keydown", function (e) {
    if (e.target.closest("input, textarea")) return;
    if (e.key === " " && e.target.closest("button")) return; // the button handles its own space
    var k = e.key.toUpperCase();
    if (k === "A" || k === "B" || k === "X") { select(k); e.preventDefault(); }
    else if (e.key === " ") { toggle(); e.preventDefault(); }
  });

  start(0);
})();
