/* SIMLAF — the panel behaves like metal, and the meter behaves like a meter.

   Two pieces, both physical rather than decorative:

   1. The specular highlight. Brushed metal under a key light does not hold a fixed gradient; the
      bright band moves with the viewer. The pointer stands in for the viewer, so the highlight
      tracks it. One rAF per frame, two custom properties, no layout.

   2. A real VU meter. Not a CSS transition on a width — a VU is a defined instrument, and the
      definition is its ballistics (IEC 60268-17 / ANSI C16.5): driven with a step that reads 0 VU,
      the needle reaches 99% of deflection in 300 ms and overshoots by 1 to 1.5%. That is a damped
      second-order system, so this integrates one:

          theta'' = wn^2 * (x - theta) - 2*zeta*wn*theta'

      with zeta = 0.81 and wn = 13.423 rad/s. Those two constants were not guessed: the same
      integrator was stepped offline and wn solved for until the step response reached 99% at
      300.0 ms with 1.30% overshoot. A first guess of 18.9 gave 213 ms, which is not a VU. Those
      two numbers are what makes a VU a VU; anything else is a bar that moves.

   Everything here is an addition. With JavaScript off the panel still has its static highlight and
   the meter is simply absent. prefers-reduced-motion stops the needle and the tracking. */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------- specular -- */
  var panels = document.querySelectorAll("[data-specular]");
  if (panels.length && !reduce && window.matchMedia("(pointer: fine)").matches) {
    var pending = false, px = 0, py = 0, target = null;
    var paint = function () {
      pending = false;
      if (!target) return;
      var r = target.getBoundingClientRect();
      var x = ((px - r.left) / r.width) * 100;
      var y = ((py - r.top) / r.height) * 100;
      target.style.setProperty("--lx", x.toFixed(1) + "%");
      target.style.setProperty("--ly", y.toFixed(1) + "%");
    };
    Array.prototype.forEach.call(panels, function (panel) {
      panel.addEventListener("pointermove", function (ev) {
        px = ev.clientX; py = ev.clientY; target = panel;
        if (!pending) { pending = true; requestAnimationFrame(paint); }
      });
      // the light returns to where the key light actually is when the hand leaves
      panel.addEventListener("pointerleave", function () {
        panel.style.removeProperty("--lx");
        panel.style.removeProperty("--ly");
      });
    });
  }

  /* --------------------------------------------------------------------- VU -- */
  var ZETA = 0.81;          // overshoot ~1.2%
  var WN = 13.423;          // rad/s: solved, not guessed — 99% at 300.0 ms, 1.30% overshoot
  var MIN_DB = -20, MAX_DB = 3;

  function Needle() { this.theta = 0; this.vel = 0; }
  Needle.prototype.step = function (target, dt) {
    // integrated in sub-steps so a dropped frame cannot make the needle unstable
    var n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n, i;
    for (i = 0; i < n; i++) {
      var acc = WN * WN * (target - this.theta) - 2 * ZETA * WN * this.vel;
      this.vel += acc * h;
      this.theta += this.vel * h;
    }
    return this.theta;
  };

  /* A programme-like envelope. It is NOT a live meter and the caption says so: it exists to show
     the ballistics, so it is deterministic and repeatable rather than random. */
  function programme(t) {
    var bar = t * (112 / 60) / 4;                       // 112 bpm, four beats to the bar
    var beat = (bar * 4) % 1;
    var hit = Math.exp(-beat * 7) * (((bar * 4) | 0) % 4 === 0 ? 1 : 0.72);
    var sustain = 0.34 + 0.12 * Math.sin(t * 0.7) + 0.06 * Math.sin(t * 2.3);
    var phrase = 0.82 + 0.18 * Math.sin(t * 0.21);
    return Math.min(1, (sustain + hit * 0.55) * phrase);
  }

  var meters = document.querySelectorAll("[data-vu]");
  Array.prototype.forEach.call(meters, function (el) {
    var canvas = el.querySelector("canvas");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var needle = new Needle();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;

    function size() {
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener("resize", size);

    // the scale, in dB, where a real VU puts its marks
    var MARKS = [-20, -10, -7, -5, -3, -1, 0, 1, 2, 3];
    var pivotX, pivotY, radius;

    function geometry() { pivotX = w / 2; pivotY = h * 1.12; radius = h * 0.86; }

    function angleFor(frac) { return (-50 + frac * 100) * Math.PI / 180; }

    function draw(theta) {
      if (!w) { size(); if (!w) return; }
      geometry();
      ctx.clearRect(0, 0, w, h);

      // the face: aged ivory behind glass, as a VU actually is
      ctx.fillStyle = "#E6DFCD";
      ctx.fillRect(0, 0, w, h);
      var sheen = ctx.createLinearGradient(0, 0, w * 0.6, h);
      sheen.addColorStop(0, "rgba(255,255,255,.5)");
      sheen.addColorStop(0.5, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);

      // the arc, black to 0 VU and oxblood above it, which is the convention
      var i, a, frac;
      ctx.lineWidth = Math.max(1.5, h * 0.028);
      for (i = 0; i < 2; i++) {
        var from = i ? dbFrac(0) : dbFrac(MIN_DB), to = i ? dbFrac(MAX_DB) : dbFrac(0);
        ctx.beginPath();
        ctx.strokeStyle = i ? "#A8302A" : "#2C2A26";
        ctx.arc(pivotX, pivotY, radius * 0.97, angleFor(from) - Math.PI / 2, angleFor(to) - Math.PI / 2);
        ctx.stroke();
      }

      // the marks and their numbers
      ctx.fillStyle = "#2C2A26";
      ctx.font = (h * 0.13).toFixed(0) + "px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      for (i = 0; i < MARKS.length; i++) {
        frac = dbFrac(MARKS[i]); a = angleFor(frac) - Math.PI / 2;
        var x1 = pivotX + Math.cos(a) * radius * 0.97, y1 = pivotY + Math.sin(a) * radius * 0.97;
        var x2 = pivotX + Math.cos(a) * radius * 0.88, y2 = pivotY + Math.sin(a) * radius * 0.88;
        ctx.strokeStyle = MARKS[i] >= 0 ? "#A8302A" : "#2C2A26";
        ctx.lineWidth = Math.max(1, h * 0.016);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (MARKS[i] === -20 || MARKS[i] === -10 || MARKS[i] === -5 || MARKS[i] === 0 || MARKS[i] === 3) {
          var tx = pivotX + Math.cos(a) * radius * 0.78, ty = pivotY + Math.sin(a) * radius * 0.78;
          ctx.fillStyle = MARKS[i] >= 0 ? "#A8302A" : "#2C2A26";
          ctx.fillText(MARKS[i] > 0 ? "+" + MARKS[i] : String(MARKS[i]), tx, ty + h * 0.045);
        }
      }
      ctx.fillStyle = "#6B6659";
      ctx.font = (h * 0.11).toFixed(0) + "px 'Share Tech Mono', monospace";
      ctx.fillText("VU", pivotX, h * 0.80);

      // the needle, with its shadow on the face below it
      a = angleFor(Math.max(0, Math.min(1.04, theta))) - Math.PI / 2;
      var nx = pivotX + Math.cos(a) * radius * 0.94, ny = pivotY + Math.sin(a) * radius * 0.94;
      ctx.strokeStyle = "rgba(40,36,30,.22)"; ctx.lineWidth = Math.max(1.6, h * 0.03);
      ctx.beginPath(); ctx.moveTo(pivotX + 1.5, pivotY + 2); ctx.lineTo(nx + 1.5, ny + 2); ctx.stroke();
      ctx.strokeStyle = "#1E1C18"; ctx.lineWidth = Math.max(1.2, h * 0.022);
      ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(nx, ny); ctx.stroke();
    }

    // A moving-coil meter deflects with VOLTAGE, not with decibels, so the scale is linear in
    // amplitude: the bottom of the range is compressed and the top is spread. Spacing the marks
    // evenly in dB — which the first version did — puts the crowding at the wrong end and is the
    // give-away that a meter was drawn rather than modelled. 0 VU lands at ~69% of the arc here,
    // which is where it sits on a real face.
    var A_MIN = Math.pow(10, MIN_DB / 20), A_MAX = Math.pow(10, MAX_DB / 20);
    function dbFrac(db) { return (Math.pow(10, db / 20) - A_MIN) / (A_MAX - A_MIN); }

    // Paint once immediately, before anything schedules a frame. A canvas that waits for an
    // observer shows the element's background colour and nothing else, which is exactly what the
    // first build of this did — it looked like a finished ivory face and was an empty canvas.
    draw(dbFrac(-6));

    // a steady reading when motion is not wanted: the needle rests below 0 VU
    if (reduce) return;

    var t0 = null, last = null, running = false;
    function frame(now) {
      if (t0 === null) { t0 = now; last = now; }
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      var t = (now - t0) / 1000;
      var level = dbFrac(20 * Math.log(Math.max(1e-4, programme(t))) / Math.LN10);
      draw(needle.step(level, dt));
      if (running) requestAnimationFrame(frame);
    }

    // it only runs while it is on screen; a meter nobody can see is wasted battery
    var start = function () { if (!running) { running = true; last = null; t0 = null; requestAnimationFrame(frame); } };
    var stop = function () { running = false; };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0.2 }).observe(el);
    } else { start(); }
  });
})();
