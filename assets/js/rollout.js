/* Carry public campaign slugs through the product journey and Polar checkout.
   No cookies or visitor identifiers; no form values or arbitrary query keys. */
(function () {
  "use strict";
  var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  function blocked() {
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return true;
    try { return !!localStorage.getItem("umami.disabled"); } catch (_) { return true; }
  }
  function campaign(search) {
    var input = new URLSearchParams(search), out = {};
    keys.forEach(function (key) {
      var value = input.get(key) || "";
      if (/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) out[key] = value;
    });
    return out;
  }
  function destination(href, base, tags) {
    if (!href || href.charAt(0) === "#" || /^(mailto:|tel:)/i.test(href)) return href;
    try {
      var origin = new URL(base), url = new URL(href, base);
      var internal = url.origin === origin.origin && /\/(catalogue|whole-studio|products\/[^/]+|free|listen|prices|start|de\/start|pt-br\/start)(\.html)?\/?$/.test(url.pathname);
      var checkout = url.protocol === "https:" && (url.hostname === "buy.polar.sh" || (url.hostname === "polar.sh" && url.pathname.indexOf("/checkout/") === 0));
      if (!internal && !checkout) return href;
      keys.forEach(function (key) { if (tags[key] && !url.searchParams.has(key)) url.searchParams.set(key, tags[key]); });
      return url.href;
    } catch (_) { return href; }
  }
  window.SimlafRollout = { campaign: campaign, destination: destination };
  if (blocked()) return;
  var tags = campaign(location.search);
  document.querySelectorAll("a[href]").forEach(function (link) { link.setAttribute("href", destination(link.getAttribute("href"), location.href, tags)); });
  document.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest("a[href]");
    if (link) link.setAttribute("href", destination(link.getAttribute("href"), location.href, tags));
  }, true);
})();
