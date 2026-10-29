/* SIMLAF — small site behaviours: the phone menu, the email forms, the
   flagship gallery, our clips, the catalogue filter, the mobile buy bar and
   a gentle reveal. Everything works without this file; it only adds. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasIO = "IntersectionObserver" in window;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  // ---- phone menu --------------------------------------------------------
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    var setOpen = function (open) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });
  }

  // ---- keep the current product tab in view in the rail ------------------
  var current = document.querySelector(".rail__tab[aria-current]");
  if (current && current.parentNode) {
    var rail = current.parentNode;
    rail.scrollLeft = Math.max(0, current.offsetLeft - rail.clientWidth / 2 + current.clientWidth / 2);
  }

  // ---- email forms ---------------------------------------------------------
  // Every sign-up form posts to the single endpoint in data/links.json.
  // While that endpoint is still a placeholder (starts with "#"), the form
  // does not send anything and says so plainly.
  each(document.querySelectorAll("form[data-signup]"), function (form) {
    var status = form.querySelector(".form__status");
    var say = function (text, ok) {
      if (!status) return;
      status.textContent = text;
      status.classList.toggle("is-ok", !!ok);
    };

    form.addEventListener("submit", function (e) {
      var email = form.querySelector("input[type=email]");
      if (email && !email.checkValidity()) {
        e.preventDefault();
        say("Please enter a valid email address.");
        email.focus();
        return;
      }
      var trap = form.querySelector(".hp input");
      if (trap && trap.value) { e.preventDefault(); return; }

      var action = form.getAttribute("action") || "";
      if (action.charAt(0) === "#") {
        e.preventDefault();
        var who = email && email.value ? email.value : "";
        var mail = "mailto:hello@simlaf.com?subject=" + encodeURIComponent("Tell me first") +
                   "&body=" + encodeURIComponent("Please tell me when the SIMLAF store opens." + (who ? "\n\nMy email: " + who : ""));
        if (status) {
          status.innerHTML = "";
          status.appendChild(document.createTextNode("Our list opens with the store. Until then, "));
          var a = document.createElement("a"); a.href = mail; a.textContent = "email hello@simlaf.com";
          status.appendChild(a);
          status.appendChild(document.createTextNode(" and we will tell you first."));
          status.classList.add("is-ok");
        }
        return;
      }

      // Kit's published HTML form posts to its own confirmation page.
      // A submitted request is not counted as an accepted subscription.
      if (form.hasAttribute("data-native-signup")) {
        say("Opening the secure sign-up page…");
        document.dispatchEvent(new CustomEvent("simlaf:track", { detail: { name: "signup-attempt", data: { list: (form.querySelector("[name=list]") || {}).value || "" } } }));
        return;
      }

      // Real endpoint: send in the background where possible, so the visitor stays on the page.
      if (window.fetch && window.FormData) {
        e.preventDefault();
        var button = form.querySelector("button[type=submit]");
        if (button) button.disabled = true;
        say("Sending…");
        fetch(action, { method: "POST", body: new FormData(form), headers: { "Accept": "application/json" } })
          .then(function (res) {
            if (!res.ok) throw new Error(String(res.status));
            form.reset();
            say(form.getAttribute("data-success") || "Thank you. Check your inbox.", true);
          })
          .catch(function () {
            say("That did not go through. Please try again in a moment.");
          })
          .then(function () { if (button) button.disabled = false; });
      }
    });
  });

  // ---- reveal on scroll ----------------------------------------------------
  // Content is visible without this. Only blocks still below the fold get a
  // soft resting state (dimmed, not hidden) and settle in as they arrive.
  if (hasIO && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    var vh = window.innerHeight || 800;
    each(document.querySelectorAll("[data-reveal]"), function (el) {
      if (el.getBoundingClientRect().top > vh * 0.92) {
        el.classList.add("rv");
        io.observe(el);
      }
    });
  }

  // ---- slow light: the orbs drift only while their section is on screen ------
  var orbSets = document.querySelectorAll("[data-orbs]");
  if (orbSets.length && hasIO && !reduce) {
    var oio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle("is-paused", !en.isIntersecting); });
    });
    each(orbSets, function (o) { oio.observe(o); });   // the first callback pauses every set that starts off screen
  } else {
    each(orbSets, function (o) { o.classList.add("is-paused"); });
  }

  // ---- photographs: a slow parallax inside their frames, only while in view ----
  var pxEls = document.querySelectorAll("[data-parallax]");
  if (pxEls.length && hasIO && !reduce && window.requestAnimationFrame) {
    var inView = [];
    var queued = false;
    var applyPx = function () {
      queued = false;
      var vh = window.innerHeight || 800;
      inView.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var c = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.setProperty("--py", Math.max(-30, Math.min(30, c * -36)).toFixed(1) + "px");
      });
    };
    var queuePx = function () { if (!queued) { queued = true; window.requestAnimationFrame(applyPx); } };
    var pio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var i = inView.indexOf(en.target);
        if (en.isIntersecting && i < 0) inView.push(en.target);
        if (!en.isIntersecting && i >= 0) inView.splice(i, 1);
      });
      queuePx();
    });
    each(pxEls, function (el) { pio.observe(el); });
    window.addEventListener("scroll", queuePx, { passive: true });
    window.addEventListener("resize", queuePx);
  }

  // ---- flagship gallery: drag with a mouse, swipe on touch, arrow buttons ---
  each(document.querySelectorAll("[data-gallery]"), function (gal) {
    var section = gal.closest("section") || document;
    var prev = section.querySelector("[data-gal-prev]");
    var next = section.querySelector("[data-gal-next]");
    var bar = section.querySelector("[data-gal-progress]");
    var step = function () {
      var s = gal.querySelector(".slide");
      return s ? s.getBoundingClientRect().width + 24 : gal.clientWidth * 0.8;
    };
    var go = function (dir) {
      gal.scrollBy({ left: dir * step(), behavior: reduce ? "auto" : "smooth" });
    };
    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });
    gal.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { go(1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { go(-1); e.preventDefault(); }
    });

    var update = function () {
      if (!bar) return;
      var max = gal.scrollWidth - gal.clientWidth;
      var visible = gal.clientWidth / gal.scrollWidth;
      var p = max > 0 ? gal.scrollLeft / max : 0;
      bar.style.width = (Math.max(visible, 0.08) * 100).toFixed(1) + "%";
      bar.style.left = (p * (1 - Math.max(visible, 0.08)) * 100).toFixed(1) + "%";
    };
    gal.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();

    // mouse drag (touch and pens scroll natively)
    var down = false, moved = false, startX = 0, startLeft = 0;
    gal.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startLeft = gal.scrollLeft;
    });
    window.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 5) { moved = true; gal.classList.add("is-dragging"); }
      if (moved) { gal.scrollLeft = startLeft - dx; e.preventDefault(); }
    });
    window.addEventListener("pointerup", function () {
      if (!down) return;
      down = false;
      if (moved) {
        gal.classList.remove("is-dragging");
        // let snapping settle on the nearest slide
        var s = step();
        gal.scrollTo({ left: Math.round(gal.scrollLeft / s) * s, behavior: reduce ? "auto" : "smooth" });
      }
    });
    gal.addEventListener("click", function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
    gal.addEventListener("dragstart", function (e) { e.preventDefault(); });
  });

  // ---- our clips: muted loops that play while in view; sound on request ----
  each(document.querySelectorAll("video[data-clip]"), function (v) {
    var frame = v.closest(".clip__frame");
    var ui = frame && frame.querySelector(".clip__ui");
    var playBtn = ui && ui.querySelector("[data-clip-play]");
    var soundBtn = ui && ui.querySelector("[data-clip-sound]");
    v.removeAttribute("controls");
    v.muted = true;
    if (ui) ui.hidden = false;
    var wanted = !reduce;   // with reduced motion, nothing plays until asked

    var setPlayLabel = function () {
      if (!playBtn) return;
      var playing = !v.paused;
      playBtn.textContent = playing ? "Pause" : "Play";
      playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
    };
    var play = function () {
      if (v.preload !== "auto") v.preload = "auto";
      var p = v.play();
      if (p && p.catch) p.catch(function () { setPlayLabel(); });
    };
    v.addEventListener("play", setPlayLabel);
    v.addEventListener("pause", setPlayLabel);

    if (playBtn) playBtn.addEventListener("click", function () {
      if (v.paused) { wanted = true; play(); } else { wanted = false; v.pause(); }
    });
    if (soundBtn) soundBtn.addEventListener("click", function () {
      v.muted = !v.muted;
      soundBtn.textContent = v.muted ? "Sound on" : "Sound off";
      soundBtn.setAttribute("aria-pressed", v.muted ? "false" : "true");
      if (!v.muted) {
        // only one clip speaks at a time
        each(document.querySelectorAll("video[data-clip]"), function (o) {
          if (o !== v && !o.muted) {
            o.muted = true;
            var b = o.closest(".clip__frame").querySelector("[data-clip-sound]");
            if (b) { b.textContent = "Sound on"; b.setAttribute("aria-pressed", "false"); }
          }
        });
        wanted = true; play();
      }
    });

    if (hasIO) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.intersectionRatio >= 0.35) { if (wanted) play(); }
          else if (!v.paused) v.pause();
        });
      }, { threshold: [0, 0.35, 0.7] }).observe(v);
    } else if (wanted) {
      play();
    }
    setPlayLabel();
  });

  // ---- catalogue filter ------------------------------------------------------
  var filters = document.querySelectorAll("[data-filter]");
  if (filters.length) {
    var groups = document.querySelectorAll("[data-cat-group]");
    each(filters, function (f) {
      f.addEventListener("click", function (e) {
        e.preventDefault();
        var want = f.getAttribute("data-filter");
        each(filters, function (o) { o.setAttribute("aria-pressed", o === f ? "true" : "false"); });
        each(groups, function (g) {
          var cats = (g.getAttribute("data-cat-group") || "").split(" ");
          g.hidden = !(want === "all" || cats.indexOf(want) !== -1);
        });
      });
    });
  }

  // ---- mobile buy bar: steps aside while the main buy box is on screen -------
  var bar = document.querySelector("[data-buybar]");
  var box = document.getElementById("buy") || document.getElementById("notify");
  if (bar && box && hasIO) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { bar.classList.toggle("is-hidden", en.isIntersecting); });
    }).observe(box);
  }

  // ---- store not open yet ---------------------------------------------------
  // Buy and Trial links stay placeholders ("#buy-…", "#trial-…") until the store opens.
  // A click explains that plainly instead of doing nothing.
  var storeNote = null;
  function openStoreNote(kind, slug) {
    if (!storeNote) {
      storeNote = document.createElement("div");
      storeNote.className = "storenote";
      storeNote.setAttribute("role", "dialog");
      storeNote.setAttribute("aria-modal", "true");
      storeNote.setAttribute("aria-labelledby", "storenote-title");
      storeNote.innerHTML =
        '<div class="storenote__card">' +
        '<p class="storenote__kicker">SIMLAF store</p>' +
        '<h2 id="storenote-title" class="storenote__title"></h2>' +
        '<p class="storenote__text" data-storenote-text></p>' +
        '<p class="storenote__text" data-storenote-first>Want to be first? <a href="mailto:hello@simlaf.com?subject=' + encodeURIComponent("Tell me first") +
        '">Email hello@simlaf.com</a> and we will write the day it opens.</p>' +
        '<button type="button" class="btn btn--primary storenote__close">Close</button></div>';
      document.body.appendChild(storeNote);
      storeNote.addEventListener("click", function (e) {
        if (e.target === storeNote || e.target.classList.contains("storenote__close")) closeStoreNote();
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeStoreNote(); });
    }
    // While The Whole Studio is on pre-order, the build marks <body> with data-preorder (its address),
    // data-preorder-line and data-preorder-day, and the note sends visitors there.
    var pre = document.body.getAttribute("data-preorder");
    var title = storeNote.querySelector(".storenote__title");
    var text = storeNote.querySelector("[data-storenote-text]");
    var link = storeNote.querySelector("[data-storenote-pre]");
    var first = storeNote.querySelector("[data-storenote-first]");
    if (first) first.hidden = !!pre;
    if (pre) {
      title.textContent = kind === "trial"
        ? "Trials open on " + document.body.getAttribute("data-preorder-day") + "."
        : "Not on sale yet.";
      text.textContent = kind === "trial"
        ? "Free 14-day trials start when the products ship. Nothing is charged for a trial. " + document.body.getAttribute("data-preorder-line")
        : ((" " + (document.body.getAttribute("data-preorder-later") || "") + " ").indexOf(" " + slug + " ") >= 0
            ? "This product has no release date yet. It comes with The Whole Studio at no extra cost when it is released. "
            : "Everything else goes on sale on " + document.body.getAttribute("data-preorder-day") + ". ")
          + document.body.getAttribute("data-preorder-line");
      if (!link) {
        link = document.createElement("a");
        link.className = "btn btn--ghost";
        link.setAttribute("data-storenote-pre", "");
        link.textContent = "See the pre-order";
        storeNote.querySelector(".storenote__close").insertAdjacentElement("beforebegin", link);
        link.addEventListener("click", closeStoreNote);
      }
      link.href = pre;
    } else {
      // the build puts the real opening date on <html data-store-opens>
      var opens = root.getAttribute("data-store-opens");
      title.textContent = opens ? "The store opens " + opens + "." : "The store opens soon.";
      text.textContent = kind === "trial"
        ? "Free 14-day trials start the day the store opens. Nothing is charged for a trial."
        : "Payments are not open yet, so nothing has been charged.";
    }
    storeNote.classList.add("is-open");
    var btn = storeNote.querySelector(".storenote__close"); if (btn) btn.focus();
  }
  function closeStoreNote() { if (storeNote) storeNote.classList.remove("is-open"); }
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#buy-"], a[href^="#trial-"]') : null;
    if (!a) return;
    e.preventDefault();
    var href = a.getAttribute("href");
    openStoreNote(href.indexOf("#trial-") === 0 ? "trial" : "buy", href.replace(/^#(buy|trial)-/, ""));
  });
})();
