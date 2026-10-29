/* SIMLAF — cookie-free visit statistics (Umami).

   Shipped and loaded only while data/site.json names an Umami website ID. This file
   adds Umami's script itself, after its own safeguards are in place, so if this file
   fails to load, nothing is counted at all (it fails closed). It does three things:

   1. simlafBeforeSend (Umami's data-before-send hook): every address sent keeps only
      utm_source, utm_medium, utm_campaign, utm_content and utm_term, and drops the
      #fragment; an outside referrer is cut to its address without query. Under Global
      Privacy Control, Do Not Track or the visitor's "Don't count my visits", Umami's
      script is not even loaded (and Umami itself checks Do Not Track and the opt-out).
   2. The funnel events below, one name each, never carrying anything a visitor types.
      Definitions: simlaf-launch/growth/UTM.md (section "Funnel events").
   3. The "Don't count my visits" button on the privacy page.

   Another script on the site records an allowed event with:
     document.dispatchEvent(new CustomEvent("simlaf:track",
       { detail: { name: "blind-share", data: { channel: "copy" } } }));
   With analytics off nobody listens, so the call is harmless. Do not use Umami's
   data-umami-event attributes on links or buttons: Umami's click handler then stops
   the element's own listeners. */
(function () {
  "use strict";

  var EVENTS = {
    "clip-play": 1,       // sound turned on in one of our OFF/ON clips
    "blind-start": 1,     // first use of the blind listening test on this page view
    "blind-complete": 1,  // answers revealed after both questions were answered
    "blind-share": 1,     // the result shared (sent by the blind test page itself)
    "store-note": 1,      // a Buy or Trial click while the store is not open yet
    "notify-click": 1,    // a "Notify me" button that jumps to the notify form
    "email-request-click": 1, // a mail-client link click, not a subscriber
    "signup-attempt": 1,  // a provider-hosted form submission, not an accepted subscription
    "signup": 1,          // the email service accepted a sign-up (site.js resets the form only then)
    "free-download": 1,   // a Spectral Free download link clicked (a click, not a finished download)
    "checkout-click": 1   // a click out to the Polar checkout
  };
  var OPT_KEY = "umami.disabled";   // Umami's own opt-out setting: its script sends nothing while it is set

  function optedOut() {
    try { return !!window.localStorage.getItem(OPT_KEY); } catch (e) { return false; }
  }

  // ---- 1. what leaves the browser ------------------------------------------
  var KEEP = /^utm_(source|medium|campaign|content|term)$/;
  function keepUtm(u) {
    try {
      var url = new URL(u, location.href), kept = [];
      url.searchParams.forEach(function (v, k) {
        if (KEEP.test(k)) kept.push(encodeURIComponent(k) + "=" + encodeURIComponent(v.slice(0, 100)));
      });
      url.search = kept.length ? "?" + kept.join("&") : "";
      url.hash = "";
      return url.toString();
    } catch (e) { return String(u).split(/[?#]/)[0]; }
  }
  function bareReferrer(r) {
    if (!r) return r;
    if (r.charAt(0) === "/") return r.split(/[?#]/)[0];          // a page of this site
    try { var u = new URL(r); return u.origin + u.pathname; } catch (e) { return ""; }
  }
  window.simlafBeforeSend = function (type, payload) {
    if (navigator.globalPrivacyControl === true || optedOut()) return false;
    if (!payload) return payload;
    if (payload.url) payload.url = keepUtm(payload.url);
    if ("referrer" in payload) payload.referrer = bareReferrer(payload.referrer);
    return payload;
  };

  // ---- 2. funnel events ----------------------------------------------------
  var queue = [];
  function ready() { return window.umami && typeof window.umami.track === "function"; }
  function send(name, data) {
    if (!EVENTS[name]) return;
    if (ready()) window.umami.track(name, data);
    else if (queue.length < 10) queue.push([name, data]);
  }
  // Load Umami only now, with the settings the build put on this file's own tag.
  var me = document.currentScript;
  var dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.msDoNotTrack === "1";
  if (me && me.getAttribute("data-website-id") && !dnt && navigator.globalPrivacyControl !== true && !optedOut()) {
    var tag = document.createElement("script");
    tag.defer = true;
    tag.src = me.getAttribute("data-umami-src");
    tag.setAttribute("data-website-id", me.getAttribute("data-website-id"));
    tag.setAttribute("data-domains", me.getAttribute("data-domains") || "simlaf.com");
    tag.setAttribute("data-do-not-track", "true");
    tag.setAttribute("data-before-send", "simlafBeforeSend");
    tag.addEventListener("load", function () {
      while (queue.length && ready()) { var q = queue.shift(); window.umami.track(q[0], q[1]); }
    });
    tag.addEventListener("error", function () { queue = []; });   // blocked: nothing is counted, nothing breaks
    document.head.appendChild(tag);
  }
  document.addEventListener("simlaf:track", function (e) {
    var d = e.detail || {};
    send(d.name, d.data);
  });

  function clipName(frame) {
    var src = frame && frame.querySelector("video source");
    var s = src ? src.getAttribute("src") || "" : "";
    return s.split("/").pop().replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
  }
  function linkId(href) {
    try { return new URL(href, location.href).pathname.split("/").filter(Boolean).pop() || ""; } catch (e) { return ""; }
  }

  var blindStarted = false;
  // Capture phase: runs before the page's own handlers, so a button's state is read as it was
  // when the visitor pressed it, and nothing the page does to the click can hide it from us.
  document.addEventListener("click", function (e) {
    var t = e.target, el;
    if (!t || !t.closest) return;

    if ((el = t.closest("[data-clip-sound]"))) {
      if (el.getAttribute("aria-pressed") !== "true") send("clip-play", { clip: clipName(el.closest(".clip__frame")) });
      return;
    }

    var abx = t.closest("#abx");
    if (abx) {
      var test = (abx.querySelector(".abx__title") || {}).textContent || "";
      if ((el = t.closest(".abx__reveal"))) {
        if (!el.disabled) send("blind-complete", { test: test.slice(0, 80) });
      } else if (!blindStarted && t.closest("button")) {
        blindStarted = true;
        send("blind-start", { test: test.slice(0, 80) });
      }
      return;
    }

    var a = t.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (a.hasAttribute("data-email-request")) {
      send("email-request-click", { list: a.getAttribute("data-email-request") });
    } else if (/^#(buy|trial)-/.test(href)) {
      send("store-note", { kind: href.indexOf("#trial-") === 0 ? "trial" : "buy", product: href.replace(/^#(buy|trial)-/, "") });
    } else if (/(^|\/|\.html)#notify$/.test(href)) {
      send("notify-click");
    } else if (/(^|\/\/)([a-z0-9-]+\.)*polar\.sh\//i.test(href)) {
      send("checkout-click", { link: linkId(href) });
    } else if (/\.(pkg|dmg|zip|exe)(\?|#|$)/i.test(href) || a.hasAttribute("data-free-download")) {
      send("free-download", { file: linkId(href).slice(0, 60) });
    }
  }, true);

  // site.js resets a sign-up form only after the email service answered OK, so a reset is a real sign-up.
  // While the endpoint is still a placeholder, nothing is sent and nothing is counted.
  document.addEventListener("reset", function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches("form[data-signup]")) return;
    var list = form.querySelector('input[name="list"]');
    send("signup", { list: list ? list.value.slice(0, 60) : "" });
  }, true);

  // ---- 3. "Don't count my visits" (privacy page) ---------------------------
  var btn = document.querySelector("[data-analytics-optout]");
  if (btn) {
    var row = btn.closest("[hidden]"); if (row) row.hidden = false;   // shown only when this file runs
    var status = document.querySelector("[data-analytics-status]");
    var show = function () {
      var off = optedOut();
      btn.textContent = off ? "Count my visits again" : "Don’t count my visits";
      btn.setAttribute("aria-pressed", off ? "true" : "false");
      if (status) status.textContent = off ? "This browser is not counted on this website." : "";
    };
    btn.addEventListener("click", function () {
      try {
        if (optedOut()) window.localStorage.removeItem(OPT_KEY);
        else window.localStorage.setItem(OPT_KEY, "1");
      } catch (err) {
        if (status) status.textContent = "Your browser blocked saving this choice. Turning on Do Not Track or Global Privacy Control works too.";
        return;
      }
      show();
    });
    show();
  }
})();
