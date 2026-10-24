/* SIMLAF — /blind-test: the share card, drawn in the visitor's browser and never uploaded.
   Loaded by blind-test.js only when a result is shown, so the first view stays light.
   window.SIMLAFCard.draw({ canvas, k, n, verdict: [line, odds], seed, run, rand }) resolves to a JPEG blob. */
(function () {
  "use strict";

  var CREAM = "#F4EFE6", SOFT = "#C3BAAC", LABEL = "#9C9284", AMBER = "#FFB84D", EMBER = "#FF7A3D", INK = "#140f08";

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var faces = ['800 100px "Syne"', 'italic 400 100px "Instrument Serif"', '500 30px "IBM Plex Mono"', '400 30px "IBM Plex Sans"'];
    return Promise.race([
      Promise.all(faces.map(function (f) { return document.fonts.load(f).catch(function () {}); })),
      new Promise(function (r) { setTimeout(r, 1800); })
    ]);
  }
  function spaced(g, s, x, y, track) {
    if ("letterSpacing" in g) { g.letterSpacing = track + "px"; g.fillText(s, x, y); g.letterSpacing = "0px"; return; }
    for (var i = 0; i < s.length; i++) { g.fillText(s[i], x, y); x += g.measureText(s[i]).width + track; }
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function glow(g, x, y, r, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,184,77," + a + ")");
    gr.addColorStop(0.45, "rgba(255,122,61," + (a * 0.42) + ")");
    gr.addColorStop(1, "rgba(255,122,61,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 1080, 1350);
  }
  function mark(g, x, y, s) {               // the SIMLAF mark: three meter bars, amber to ember (favicon geometry, 64-unit box)
    var u = s / 64, gr = g.createLinearGradient(0, y + 14 * u, 0, y + 48 * u);
    gr.addColorStop(0, AMBER); gr.addColorStop(1, EMBER);
    g.fillStyle = gr;
    [[17, 31, 17], [28.5, 14, 34], [40, 23, 25]].forEach(function (b) { roundRect(g, x + b[0] * u, y + b[1] * u, 7 * u, b[2] * u, 1.5 * u); g.fill(); });
  }
  function wrap(g, text, x, y, max, lh) {
    var words = text.split(" "), line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (g.measureText(test).width > max && line) { g.fillText(line, x, y); y += lh; line = w; } else line = test;
    });
    if (line) g.fillText(line, x, y);
    return y;
  }

  function draw(o) {
    var c = o.canvas, g = c.getContext("2d"), W = 1080, H = 1350, k = o.k, n = o.n, v = o.verdict, seed = o.seed, run = o.run;
    return fontsReady().then(function () {
      g.fillStyle = "#0b0a08"; g.fillRect(0, 0, W, H);
      glow(g, 820, 330, 760, 0.3);
      glow(g, 160, 1240, 640, 0.14);
      var r = o.rand;                              // a quiet spectrum along the foot, the same for the same set
      for (var x = 0; x < W; x += 10) {
        var hh = 30 + r() * 210 * (0.55 + 0.45 * Math.sin(x / 150));
        g.fillStyle = "rgba(255,184,77," + (0.035 + r() * 0.07).toFixed(3) + ")";
        g.fillRect(x, H - hh, 6, hh);
      }
      var vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78);
      vg.addColorStop(0, "rgba(11,10,8,0)"); vg.addColorStop(1, "rgba(11,10,8,.75)");
      g.fillStyle = vg; g.fillRect(0, 0, W, H);

      mark(g, 72, 84, 84);
      g.fillStyle = CREAM; g.font = '800 50px "Syne", "Arial Black", sans-serif'; g.textBaseline = "alphabetic";
      spaced(g, "SIMLAF", 150, 142, 8);
      g.fillStyle = AMBER; g.font = '500 25px "IBM Plex Mono", ui-monospace, monospace';
      spaced(g, "BLIND LISTENING TEST · A/B/X", 92, 252, 4);
      g.fillStyle = CREAM; g.font = 'italic 400 124px "Instrument Serif", Georgia, serif';
      g.fillText("Can you hear it?", 86, 392);

      g.font = '800 360px "Syne", "Arial Black", sans-serif';
      var ks = String(k), kw = g.measureText(ks).width;
      g.fillText(ks, 76, 752);
      g.fillStyle = AMBER; g.font = 'italic 400 150px "Instrument Serif", Georgia, serif';
      g.fillText("of " + n, 76 + kw + 34, 752);

      g.fillStyle = CREAM; g.font = 'italic 400 62px "Instrument Serif", Georgia, serif';
      g.fillText(v[0], 90, 864);
      g.fillStyle = SOFT; g.font = '400 30px "IBM Plex Sans", system-ui, sans-serif';
      wrap(g, v[1], 92, 926, 896, 42);

      var gap = 18, tw = Math.min(150, (896 - gap * (n - 1)) / n), y = 1050;
      run.forEach(function (t, i) {
        var tx = 92 + i * (tw + gap);
        roundRect(g, tx, y, tw, 92, 16);
        if (t.right) { g.fillStyle = AMBER; g.fill(); }
        else { g.lineWidth = 2; g.strokeStyle = "rgba(244,239,230,.38)"; g.stroke(); }
        g.lineWidth = 6; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath();
        var cx = tx + tw / 2, cy = y + 46;
        if (t.right) { g.strokeStyle = INK; g.moveTo(cx - 18, cy + 1); g.lineTo(cx - 5, cy + 14); g.lineTo(cx + 20, cy - 13); }
        else { g.strokeStyle = "rgba(244,239,230,.6)"; g.moveTo(cx - 13, cy - 13); g.lineTo(cx + 13, cy + 13); g.moveTo(cx + 13, cy - 13); g.lineTo(cx - 13, cy + 13); }
        g.stroke();
        g.fillStyle = LABEL; g.font = '500 17px "IBM Plex Mono", ui-monospace, monospace'; g.textAlign = "center";
        g.fillText(t.pair.short.toUpperCase(), cx, y + 124, tw + gap - 4);
        g.fillStyle = "rgba(244,239,230,.42)"; g.font = '400 15px "IBM Plex Mono", ui-monospace, monospace';
        g.fillText(t.pair.level.toUpperCase(), cx, y + 147, tw + gap - 4);
        g.textAlign = "left";
      });

      g.fillStyle = AMBER; g.font = '500 30px "IBM Plex Mono", ui-monospace, monospace';
      g.fillText("simlaf.com/blind-test?c=" + seed, 92, 1270);
      g.fillStyle = LABEL; g.font = '400 19px "IBM Plex Mono", ui-monospace, monospace';
      spaced(g, "SAME TRIALS · LOUDNESS MATCHED · OUR OWN PROCESSORS, OFF VS ON", 92, 1308, 1.2);

      return new Promise(function (resolve) {
        if (!c.toBlob) { resolve(null); return; }
        c.toBlob(resolve, "image/jpeg", 0.9);
      });
    });
  }
  window.SIMLAFCard = { draw: draw };
})();
