/* SIMLAF — same-origin proxy for visit counting (Cloudflare Pages Function).
 *
 * WHY THIS EXISTS. Umami's tracker is third-party JavaScript with full access to
 * every page. From 27 Nov those pages carry Polar checkout links, and a
 * compromised analytics script could rewrite one to another seller's checkout --
 * which no content security policy can stop once the script is allowed to run.
 * Serving the script from our own origin means script-src is 'self' alone: an
 * outside host can no longer execute anything here.
 *
 * It does nothing on GitHub Pages. Cloudflare Pages runs functions/ and GitHub
 * Pages ignores the folder, so this file is inert until the move and the site
 * keeps loading Umami directly in the meantime (data/site.json decides which).
 *
 * WHAT UMAMI ACTUALLY DOES, read from its own script on 31 Oct 2026 rather than
 * assumed -- the minified source computes:
 *
 *     E = <data-host-url attribute>
 *     P = `${(E || "https://gateway.umami.is").replace(/\/$/,"")}/api/send`
 *
 * So the send endpoint is HARDCODED to gateway.umami.is and is NOT derived from
 * the script's own src. Serving the script from our origin alone would change
 * nothing about where the data goes. The override is data-host-url, which we set
 * to "/stats" so the tracker posts to /stats/api/send -- root-relative, so it is
 * correct from every page and carries no domain to go stale.
 *
 * THE TRAP THIS HANDLES. A proxy hides the visitor from the thing being proxied.
 * Umami reads the client IP for country and for counting a visitor once, and the
 * User-Agent for browser, OS and device. Without forwarding them every visitor
 * arrives as the same anonymous Cloudflare machine, the figures stay plausible
 * and are quietly wrong -- the same shape of failure as a tracker that loads but
 * never sends. Both are forwarded below.
 *
 * NOT YET VERIFIED. This cannot run until the site is on Cloudflare Pages; it is
 * written now so the move is a switch rather than a project. The checklist that
 * must pass on the day it goes live is in docs/CLOUDFLARE_MOVE.md -- and the test
 * is that a real visit appears in the Umami dashboard with the right country and
 * browser, not that the request returns 200.
 */

const SCRIPT_ORIGIN = "https://cloud.umami.is";      // where the tracker is served from
const SEND_ORIGIN = "https://gateway.umami.is";      // where the tracker posts, per its own source
const SCRIPT_CACHE = 3600;                           // seconds; short, so vendor fixes still reach us

export async function onRequest(context) {
  const { request, params } = context;
  const path = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");

  // ---- the tracker itself ------------------------------------------------
  if (path === "script.js") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const upstream = await fetch(SCRIPT_ORIGIN + "/script.js", {
      method: "GET",
      headers: { "User-Agent": request.headers.get("User-Agent") || "" },
      cf: { cacheTtl: SCRIPT_CACHE, cacheEverything: true },
    });
    if (!upstream.ok) {
      // Fail closed and say nothing is counted, exactly as track.js does: an
      // empty script is harmless, a broken one is not.
      return new Response("/* analytics unavailable */", {
        status: 200,
        headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": `public, max-age=${SCRIPT_CACHE}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // ---- the beacon --------------------------------------------------------
  if (path === "api/send") {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    }
    // The visitor's own address and browser, or every visit looks like one
    // machine in one country. CF-Connecting-IP is set by Cloudflare and cannot
    // be spoofed by the client; any X-Forwarded-For the client sent is dropped.
    const headers = new Headers({
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      "User-Agent": request.headers.get("User-Agent") || "",
      "X-Forwarded-For": request.headers.get("CF-Connecting-IP") || "",
      "Accept-Language": request.headers.get("Accept-Language") || "",
    });
    let upstream;
    try {
      upstream = await fetch(SEND_ORIGIN + "/api/send", {
        method: "POST",
        headers,
        body: request.body,
      });
    } catch (e) {
      return new Response("", { status: 204 });            // never let counting break a page
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "text/plain" },
    });
  }

  return new Response("Not found", { status: 404 });
}
