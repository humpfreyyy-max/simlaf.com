/* SIMLAF catalogue: instant search, filters, sort and the three-question finder.
   Every product is already in the page; this file only narrows, orders and points.
   The filters live in the address (?q=…&cat=…), so a filtered list can be shared. */
(function () {
  "use strict";
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var form = document.querySelector("[data-catf]");
  var grid = document.querySelector("[data-catx-grid]");
  if (!form || !grid) return;

  var items = Array.prototype.slice.call(grid.children);
  var bySlug = {};
  items.forEach(function (li) { bySlug[li.getAttribute("data-slug")] = li; });
  var count = document.querySelector("[data-catx-count]");
  var countAll = count ? count.textContent : "";
  var empty = document.querySelector("[data-catx-empty]");
  var onBadge = document.querySelector("[data-catf-on]");
  var box = form.querySelector(".catf__box");
  var q = document.getElementById("q");
  var sortSel = document.querySelector('select[name="sort"]');

  // Words people type, mapped to the words our own product copy uses.
  var SYN = {
    vocal: ["vocal", "sibil", "de-ess", "pitch"], vocals: ["vocal", "sibil", "de-ess", "pitch"], voice: ["vocal"], singer: ["vocal"],
    sibilance: ["de-ess", "sibil"], harsh: ["harsh", "resonan"], harshness: ["harsh", "resonan"],
    "808": ["808", "sub-octave", "virtual bass"], bass: ["bass", "sub-octave", "808"], sub: ["sub-octave", "808"],
    guitar: ["guitar"], amp: ["amp"], piano: ["piano"], keys: ["keys", "piano"], synth: ["synth", "resynthesis"],
    drum: ["drum", "kit", "transient", "beat"], drums: ["drum", "kit", "transient", "beat"], beat: ["beat", "drum", "808"],
    master: ["master", "loudness"], mastering: ["master", "loudness"], loud: ["loud", "limit"], loudness: ["loud", "limit"],
    mix: ["mix", "bus", "console"], reverb: ["reverb"], room: ["reverb", "room"], echo: ["delay", "echo"],
    latency: ["latency"], zero: ["zero"], pitch: ["pitch", "tun"], tuning: ["pitch", "tun"],
    width: ["stereo", "width", "imager"], wide: ["stereo", "width"], stereo: ["stereo"],
    saturation: ["saturat", "drive", "tape", "colour"], distortion: ["drive", "saturat", "fuzz"], warm: ["saturat", "tape", "analogue", "valve"],
    analog: ["analogue"], lofi: ["lo-fi"], "lo-fi": ["lo-fi"], free: ["free"], eq: ["eq"], compressor: ["compress"], compression: ["compress"]
  };

  function terms(text) {
    return (text || "").toLowerCase().replace(/[^\w\s\-.]/g, " ").split(/\s+/).filter(Boolean).map(function (t) {
      var alts = SYN[t] || (t.length > 3 && t.slice(-1) === "s" && SYN[t.slice(0, -1)]) || [t];
      if (!SYN[t] && t.length > 3 && t.slice(-1) === "s") alts = alts.concat([t.slice(0, -1)]);
      return alts;
    });
  }

  function val(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "all";
  }
  function vals(name) {
    var out = [];
    each(form.querySelectorAll('input[name="' + name + '"]:checked'), function (el) { out.push(el.value); });
    return out;
  }

  function apply(sync) {
    var want = terms(q ? q.value : ""), cat = val("cat"), type = val("type"), price = val("price");
    var fmts = vals("fmt"), zero = vals("zero").length > 0, sort = sortSel ? sortSel.value : "featured";
    var shown = [];
    items.forEach(function (li) {
      var d = li.dataset, text = " " + (d.q || ""), ok = true;
      for (var i = 0; ok && i < want.length; i++) {          // every word must start a word in the product's own copy
        ok = want[i].some(function (a) { return text.indexOf(" " + a) !== -1 || (a.length > 3 && text.indexOf(a) !== -1); });
      }
      if (ok && cat !== "all") ok = cat === "coming" ? d.status === "coming" : d.cat === cat;
      if (ok && type !== "all") ok = d.type === type;
      if (ok && price !== "all") ok = d.price === price;
      if (ok && zero) ok = d.zero === "1";
      if (ok && fmts.length) {
        var have = (d.formats || "").split(" ");
        ok = fmts.every(function (f) { return have.indexOf(f) !== -1; });
      }
      li.hidden = !ok;
      if (ok) shown.push(li);
    });

    var key = {
      featured: function (li) { return +li.dataset.order; },
      "price-asc": function (li) { return (+li.dataset.price || 1e6) * 1000 + +li.dataset.order; },
      "price-desc": function (li) { return -(+li.dataset.price) * 1000 + +li.dataset.order; },
      name: null
    }[sort];
    var ordered = items.slice().sort(key ? function (a, b) { return key(a) - key(b); }
      : function (a, b) { return a.dataset.name < b.dataset.name ? -1 : a.dataset.name > b.dataset.name ? 1 : 0; });
    ordered.forEach(function (li) { grid.appendChild(li); });

    var active = (want.length ? 1 : 0) + (cat !== "all") + (type !== "all") + (price !== "all") + (zero ? 1 : 0) + fmts.length;
    if (count) {
      count.textContent = active ? "Showing " + shown.length + " of " + items.length : countAll;
    }
    if (onBadge) onBadge.textContent = active ? active + " on" : "";
    if (empty) empty.hidden = shown.length > 0;

    if (sync && window.history && history.replaceState) {
      var p = new URLSearchParams();
      if (q && q.value.trim()) p.set("q", q.value.trim());
      if (cat !== "all") p.set("cat", cat);
      if (type !== "all") p.set("type", type);
      if (price !== "all") p.set("price", price);
      if (zero) p.set("zero", "1");
      if (fmts.length) p.set("fmt", fmts.join(","));
      if (sort !== "featured") p.set("sort", sort);
      var s = p.toString();
      history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
    }
  }

  // Start from the address: ?q=…&cat=…, or a link such as /catalogue#cat-amps or /catalogue#q.
  var params = new URLSearchParams(location.search);
  if (q && params.get("q")) q.value = params.get("q");
  function check(name, value) {
    var el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }
  if (params.get("cat")) check("cat", params.get("cat"));
  if (params.get("type")) check("type", params.get("type"));
  if (params.get("price")) check("price", params.get("price"));
  if (params.get("zero")) check("zero", "1");
  (params.get("fmt") || "").split(",").forEach(function (f) { if (f) check("fmt", f); });
  if (sortSel && params.get("sort")) sortSel.value = params.get("sort");
  var hash = location.hash.slice(1);
  if (/^cat-/.test(hash)) {
    var radio = document.getElementById(hash);
    if (radio) {
      radio.checked = true;
      var browse = document.getElementById("browse");
      if (browse) setTimeout(function () { browse.scrollIntoView(); }, 0);
    }
  }
  // On a phone the filters start folded, unless the address already set some.
  if (box && window.matchMedia("(max-width: 900px)").matches && !/^cat-/.test(hash) &&
      !["cat", "type", "price", "zero", "fmt"].some(function (k) { return params.get(k); })) box.open = false;
  apply(false);
  if (hash === "q" && q) q.focus();

  var timer = null;
  form.addEventListener("change", function () { apply(true); });
  if (q) q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { apply(true); }, 90); });
  if (sortSel) sortSel.addEventListener("change", function () { apply(true); });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    apply(true);
    if (q) q.blur();
    var browse = document.getElementById("browse");
    if (browse && window.matchMedia("(max-width: 900px)").matches) browse.scrollIntoView({ behavior: "smooth" });
  });
  form.addEventListener("reset", function () { setTimeout(function () { apply(true); }, 0); });

  // ---- the finder -----------------------------------------------------------
  var ff = document.querySelector("[data-finder]");
  var out = document.querySelector("[data-finder-out]");
  var raw = document.getElementById("finder-data");
  if (!ff || !out || !raw) return;
  var data = JSON.parse(raw.textContent);
  var money = function (n) { return "$" + n.toLocaleString("en-US"); };
  var esc = function (s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; };
  var text = function (li, sel) { var el = li.querySelector(sel); return el ? el.textContent.trim() : ""; };

  ff.addEventListener("submit", function (e) {
    e.preventDefault();
    answer(true);
  });
  // A shared answer: /catalogue?job=vocals&need=fix&budget=one#finder
  if (params.get("job")) {
    ["job", "need", "budget"].forEach(function (k) {
      var el = ff.querySelector('input[name="' + k + '"][value="' + params.get(k) + '"]');
      if (el) el.checked = true;
    });
    answer(false);
  }
  function answer(byHand) {
    var job = (ff.querySelector('input[name="job"]:checked') || {}).value;
    var need = data.needs[(ff.querySelector('input[name="need"]:checked') || {}).value] || {};
    var budget = (ff.querySelector('input[name="budget"]:checked') || {}).value || "one";
    out.hidden = false;
    if (!job) {
      out.innerHTML = '<p class="finder__msg">First, pick what you are working on.</p>';
      var first = ff.querySelector('input[name="job"]');
      if (first) first.focus();
      return;
    }
    var picks = (data.jobs[job] || []).map(function (slug, i, all) {
      var li = bySlug[slug];
      if (!li || li.dataset.status === "coming") return null;
      var score = all.length - i;
      if (need.zero && li.dataset.zero === "1") score += 3;
      if (need.cats && need.cats.indexOf(li.dataset.cat) !== -1) score += 3;
      if (li.dataset.status !== "launch") score -= 5;            // no release date yet: never the first answer
      return { li: li, score: score, i: i };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score || a.i - b.i; }).slice(0, 3);

    var o = data.offers, sum = 0, nFx = 0, nFlag = 0, nLater = 0;
    var cards = picks.map(function (pk, n) {
      var li = pk.li, d = li.dataset, launch = d.status === "launch";
      if (launch) sum += +d.price; else nLater++;
      if (d.type === "fx") nFx++;
      if (d.type === "flagship" && launch) nFlag++;
      var a = li.querySelector("a.card");
      var lat = text(li, ".lat");
      return '<li><a class="fpick" href="' + a.getAttribute("href") + '">' +
        '<span class="fpick__n">' + (n === 0 ? "Best fit" : "Also fits") + "</span>" +
        '<h3 class="fpick__name">' + esc(text(li, ".card__name")) + "</h3>" +
        '<p class="fpick__line">' + esc(text(li, ".card__line")) + "</p>" +
        '<span class="fpick__foot"><b>' + esc(launch ? money(+d.price) : "When released") + "</b>" +
        (lat ? "<span>Latency " + esc(lat) + "</span>" : "") + "</span></a></li>";
    }).join("");

    var lines = [], buttons = [];
    var top = picks[0] && picks[0].li;
    var topName = top ? text(top, ".card__name") : "";
    var studio = "<b>" + esc(o.studio.name) + "</b> has all " + o.studio.count + " products at launch for " + money(o.studio.price) + ".";
    if (budget === "one" && top) {
      lines.push("Start with <b>" + esc(topName) + "</b>" + (top.dataset.status === "launch" ? ", " + money(+top.dataset.price) : "") +
        ". Try it free for " + o.trial_days + " days first; a trial never turns into a purchase by itself.");
      if (sum) lines.push("All three on their own: " + money(sum) + " at single prices. " + studio);
      buttons.push('<a class="btn btn--primary" href="' + top.querySelector("a.card").getAttribute("href") + '">See ' + esc(topName) + "</a>");
    } else if (budget === "few") {
      if (nFx === picks.length && picks.length) {
        lines.push("All three are SIMLAF FX effects: " + money(sum) + " at single prices. The <b>" + esc(o.suite.name) +
          "</b> has all " + o.suite.count + " effects for " + money(o.suite.price) + ".");
        buttons.push('<a class="btn btn--primary" href="' + o.suite.url + '">See the ' + esc(o.suite.name) + "</a>");
      } else if (nFlag === picks.length && picks.length && !o.pack.fixed) {
        lines.push("All three are flagships: " + money(sum) + " at single prices. The <b>" + esc(o.pack.name) + "</b> is any " +
          o.pack.choose + " flagships for " + money(o.pack.price) + ". For " + money(o.studio.price - o.pack.price) +
          " more, " + esc(o.studio.name) + " has all " + o.studio.count + ".");
        buttons.push('<a class="btn btn--primary" href="' + o.studio.url + '">See ' + esc(o.studio.name) + "</a>");
        buttons.push('<a class="btn btn--ghost" href="' + o.pack.url + '#compare">Compare with the ' + esc(o.pack.name) + "</a>");
      } else {
        lines.push("These three on their own: " + money(sum) + " at single prices" + (nLater ? ", plus one that has no release date yet" : "") + ".");
      }
      if (buttons.length < 2) {
        lines.push("Or everything: " + studio);
        if (!buttons.length) buttons.push('<a class="btn btn--primary" href="' + o.studio.url + '">See ' + esc(o.studio.name) + "</a>");
        else buttons.push('<a class="btn btn--ghost" href="' + o.studio.url + '">See ' + esc(o.studio.name) + "</a>");
      }
    } else {
      lines.push(studio + " These three are in it" + (sum ? " (" + money(sum) + " at single prices)" : "") + ", with SIMLAF 2 when it ships.");
      buttons.push('<a class="btn btn--primary" href="' + o.studio.buy + '">Buy ' + esc(o.studio.name) + " · " + money(o.studio.price) + "</a>");
      buttons.push('<a class="btn btn--ghost" href="' + o.studio.url + '">What is in it</a>');
    }
    if (o.platforms) lines.push('<span class="finder__plat">' + esc(o.platforms) + "</span>");
    var storeline = document.querySelector("#bundles .storeline");
    out.innerHTML = '<ul class="finder__picks">' + cards + "</ul>" +
      '<div class="finder__offer tone-dark"><p>' + lines.join("</p><p>") + '</p><div class="btn-row">' + buttons.join("") + "</div>" +
      (storeline ? storeline.outerHTML : "") + "</div>";
    if (byHand) {
      out.focus({ preventScroll: true });
      out.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
})();
