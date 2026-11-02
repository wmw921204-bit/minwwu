// Page transition: leaving a page, a panel in the next page's colour rises with that project's
// logo (or its name, when it has none) settling in the middle; the next page opens under the same
// panel, which then lifts away.
// Loaded in <head> without defer so the cover is painted before the page. GSAP drives it when
// loaded; otherwise the Web Animations API does the same moves.
(function () {
  var root = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var base = new URL("../../", document.currentScript.src).href;

  // where each page goes: its colour, text colour and name
  var PAGES = {
    "": ["#111", "#fff", "Emma wu"],
    fitfido: ["#de6536", "#fff", "Fitfido"],
    brilliant: ["#cae210", "#111", "Brilliant.org"],
    swifthome: ["#885835", "#fff6ef", "SwiftHome"],
    safedining: ["#424d3d", "#faf7f0", "Safe Dining"],
    reco: ["#e8392d", "#fff", "Reco"],
    moment: ["#a9c97a", "#0c120e", "Moment"],
    zenbloom: ["#cea662", "#1a120b", "ZenBloom"],
    finra: ["#82cfff", "#041327", "FINRA"],
    kohler: ["#3fc1b5", "#04201d", "Kohler"],
    vipshop: ["#f448d8", "#1a0416", "Vipshop"],
    bandy: ["#5b47c9", "#fff", "Bandy"]
  };
  var svgUrl = function (s) { return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")'; };
  // logos drawn in the page's text colour: w is the width, r the width/height ratio;
  // svg logos carry their colours, mask logos are filled with the text colour
  var LOGOS = {
    // the site's own mw, its dot orange unless the panel is
    "": { w: "clamp(150px,16vw,260px)", r: 116 / 62, svg: function (c, f) {
      var d = /^#(de6536|e8392d)$/i.test(c) ? f : "#de6536";
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 11 116 62"><path d="M12 66 V48 Q12 34 24.5 34 Q37 34 37 48 V66 M37 48 Q37 34 49.5 34 Q62 34 62 48 V54 Q62 68 74 68 Q86 68 86 54 V40 M86 54 Q86 68 98 68 Q110 68 110 54 V40" fill="none" stroke="' + f +
        '" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="110" cy="22" r="7" fill="' + d + '"/></svg>';
    } },
    swifthome: { w: "clamp(240px,28vw,440px)", r: 460 / 120, svg: function (c, f) {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 0 460 120"><g transform="translate(3 -2)" fill="' + f + '"><path d="M22 94V60a16 16 0 0 1 32 0v34Z" opacity=".35"/><path d="M36 94V58a18 18 0 0 1 36 0v36Z" opacity=".65"/><path d="M52 94V56a20 20 0 0 1 40 0v38Z"/></g>' +
        '<text x="120" y="80" font-family="Poppins, \'Helvetica Neue\', Arial, sans-serif" font-size="56" letter-spacing="-1.7" fill="' + f + '"><tspan font-weight="600">swift</tspan><tspan font-weight="400">home</tspan></text></svg>';
    } },
    brilliant: { w: "clamp(260px,30vw,460px)", r: 114 / 27, mask: "brilliant/logo.svg" },
    moment: { w: "clamp(220px,24vw,380px)", r: 2, mask: "moment/logo-mask.png" },
    zenbloom: { w: "clamp(200px,22vw,340px)", r: 720 / 500, mask: "zenbloom/logo-mask.png" },
    // the client projects show the lockup with SCADpro, as on the presentation covers
    finra: { w: "clamp(220px,22vw,340px)", r: 688 / 354, mask: "finra/logo-scadpro.svg" },
    kohler: { w: "clamp(320px,38vw,600px)", r: 1382 / 148, mask: "kohler/logo-scadpro.svg" },
    vipshop: { w: "clamp(200px,20vw,300px)", r: 260 / 124, mask: "vipshop/logo.png" },
    // Bandy keeps its coloured blocks
    bandy: { w: "clamp(320px,36vw,560px)", r: 1120 / 320, img: "bandy/logo.png" }
  };
  var asset = function (p) { return base + "assets/projects/" + p; };
  // fetch a logo before it is needed, so the panel never shows an empty box
  var warm = {};
  var preload = function (key) {
    var l = LOGOS[key], p = l && (l.mask || l.img);
    if (p && !warm[p]) { warm[p] = 1; new Image().src = asset(p); }
  };
  var pageKey = function (path) { return (path.split("/").pop() || "").replace(/\.html$/, "").replace(/^index$/, ""); };
  var FONT = '"Overused Grotesk", Poppins, system-ui, sans-serif';
  var EASE = "cubic-bezier(.76,0,.24,1)";

  // the logo or name sits at the centre of the screen, on the panel and on the early cover alike
  var css = document.createElement("style");
  css.textContent =
    ".pt{position:fixed;inset:0;z-index:2147483645;pointer-events:none}" +
    ".pt.is-on{pointer-events:auto}" +
    ".pt__a,.pt__b{position:absolute;inset:0;clip-path:inset(100% 0 0 0)}" +
    ".pt__a{background:#de6536}" +
    ".pt__b{overflow:hidden;display:grid;place-items:center}" +
    ".pt__id,html.pt-in::before{text-align:center;white-space:nowrap;font:500 clamp(40px,7vw,112px)/1 " + FONT + ";letter-spacing:-.03em}" +
    ".pt__id{opacity:0}" +
    "html.pt-in::after{content:\"\";position:fixed;inset:0;z-index:2147483646;background:var(--pt-c)}" +
    "html.pt-in::before{content:var(--pt-n,\"\");position:fixed;left:50%;top:50%;translate:-50% -50%;z-index:2147483647;color:var(--pt-f)}";
  document.head.appendChild(css);
  // a logo box (size and paint) as CSS, or "" when the page has no logo
  var logoCss = function (key, c, f) {
    var l = LOGOS[key];
    if (!l) return "";
    var m = l.mask && 'url("' + asset(l.mask) + '") center/contain no-repeat';
    return "width:" + l.w + ";aspect-ratio:" + l.r + ";" + (m
      ? "background:" + f + ";-webkit-mask:" + m + ";mask:" + m
      : "background:" + (l.img ? 'url("' + asset(l.img) + '")' : svgUrl(l.svg(c, f))) + " center/contain no-repeat");
  };

  // arriving from a transition: cover the page right away, before anything paints
  var arrive = null;
  try {
    arrive = JSON.parse(sessionStorage.getItem("pt") || "null");
    sessionStorage.removeItem("pt");
  } catch (e) {}
  if (arrive && (Date.now() - arrive.t > 6000 || arrive.k !== pageKey(location.pathname))) arrive = null;
  if (arrive) {
    root.style.setProperty("--pt-c", arrive.c);
    root.style.setProperty("--pt-f", arrive.f);
    var logo = logoCss(arrive.k, arrive.c, arrive.f);
    if (logo) {
      var pre = document.createElement("style");
      pre.textContent = "html.pt-in::before{" + logo + "}";
      document.head.appendChild(pre);
    } else root.style.setProperty("--pt-n", '"' + arrive.n.replace(/["\\]/g, "") + '"');
    root.classList.add("pt-in");
    // never leave the page covered if something fails
    setTimeout(function () { root.classList.remove("pt-in"); }, 4000);
  }

  var el, a, b, id;
  function build() {
    if (el) return;
    el = document.createElement("div");
    el.className = "pt";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="pt__a"></div><div class="pt__b"><div class="pt__id"></div></div>';
    a = el.firstChild; b = el.lastChild; id = b.firstChild;
    document.body.appendChild(el);
  }
  function paint(key, c, f, n) {
    b.style.background = c;
    var logo = logoCss(key, c, f);
    id.style.cssText = logo || "color:" + f;
    id.textContent = logo ? "" : n;
  }

  // moves are written as CSS (clipPath, opacity, transform); GSAP gets y and scale
  var forGsap = function (v) {
    var o = Object.assign({}, v), m = /translateY\((-?\d+)px\) scale\(([\d.]+)\)/.exec(o.transform || "");
    if (m) { o.y = +m[1]; o.scale = +m[2]; delete o.transform; }
    return o;
  };
  var EASES = { inOut: ["power4.inOut", EASE], out: ["power3.out", "cubic-bezier(.22,1,.36,1)"] };
  function tween(node, from, to, dur, delay, ease) {
    ease = EASES[ease || "inOut"];
    if (window.gsap) return gsap.fromTo(node, forGsap(from), Object.assign({ duration: dur, delay: delay, ease: ease[0] }, forGsap(to)));
    return node.animate([from, to], { duration: dur * 1000, delay: delay * 1000, easing: ease[1], fill: "both" });
  }
  var whenDone = function (t, fn) { if (window.gsap) t.eventCallback("onComplete", fn); else t.onfinish = fn; };
  var CLOSED_LOW = "inset(100% 0% 0% 0%)", OPEN = "inset(0% 0% 0% 0%)", CLOSED_HIGH = "inset(0% 0% 100% 0%)";

  function lift() {
    build();
    paint(arrive.k, arrive.c, arrive.f, arrive.n);
    a.style.clipPath = CLOSED_LOW;
    b.style.clipPath = OPEN;
    id.style.opacity = 1;
    el.classList.add("is-on");
    root.classList.remove("pt-in");
    tween(id, { opacity: 1, transform: "translateY(0px) scale(1)" }, { opacity: 0, transform: "translateY(-60px) scale(1)" }, 0.5, 0.1);
    var t = tween(b, { clipPath: OPEN }, { clipPath: CLOSED_HIGH }, 0.8, 0.2);
    whenDone(t, function () { el.classList.remove("is-on"); });
  }
  if (arrive) {
    // deferred scripts (GSAP) have run by DOMContentLoaded
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lift); else lift();
  }

  function leave(url, link) {
    build();
    var key = pageKey(url.pathname);
    if (!PAGES[key]) key = "";
    var p = PAGES[key];
    // a link can set the colour itself (project cards, "Next project")
    var cs = getComputedStyle(link);
    var c = cs.getPropertyValue("--next-bg").trim() || p[0];
    var f = cs.getPropertyValue("--next-fg").trim() || p[1];
    paint(key, c, f, p[2]);
    try { sessionStorage.setItem("pt", JSON.stringify({ c: c, f: f, n: p[2], k: key, t: Date.now() })); } catch (e) {}
    el.classList.add("is-on");
    if (window.__lenis) window.__lenis.stop();
    tween(a, { clipPath: CLOSED_LOW }, { clipPath: OPEN }, 0.7, 0);
    tween(b, { clipPath: CLOSED_LOW }, { clipPath: OPEN }, 0.7, 0.12);
    var t = tween(id, { opacity: 0, transform: "translateY(50px) scale(0.92)" }, { opacity: 1, transform: "translateY(0px) scale(1)" }, 0.6, 0.45, "out");
    // go once the logo has landed; the timer covers a tab whose frames are paused
    var went = false, go = function () { if (!went) { went = true; location.href = url.href; } };
    whenDone(t, go);
    setTimeout(go, 2000);
  }

  var linkUrl = function (t) {
    var link = t && t.closest && t.closest("a[href]");
    if (!link) return null;
    var url = new URL(link.href, location.href);
    return url.origin === location.origin && /(\/|\.html)$/.test(url.pathname) && url.pathname !== location.pathname ? url : null;
  };
  // pointing at a link is enough notice to fetch its logo
  document.addEventListener("pointerover", function (e) { var url = linkUrl(e.target); if (url) preload(pageKey(url.pathname)); }, { passive: true });
  document.addEventListener("focusin", function (e) { var url = linkUrl(e.target); if (url) preload(pageKey(url.pathname)); });

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest && e.target.closest("a[href]");
    if (!link || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
    var url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/(\/|\.html)$/.test(url.pathname)) return;
    if (url.pathname === location.pathname) return; // same page: anchors scroll instead
    e.preventDefault();
    leave(url, link);
  });

  // coming back with the back button restores the page from cache: drop the cover
  addEventListener("pageshow", function (e) {
    if (!e.persisted || !el) return;
    var nodes = [a, b, id];
    if (window.gsap) gsap.killTweensOf(nodes);
    else nodes.forEach(function (n) { n.getAnimations().forEach(function (x) { x.cancel(); }); });
    a.style.clipPath = b.style.clipPath = CLOSED_LOW;
    el.classList.remove("is-on");
    if (window.__lenis) window.__lenis.start();
  });
})();
