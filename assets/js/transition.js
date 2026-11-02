// Page transition: leaving a page, a panel in the next page's colour rises with its name;
// the next page opens under the same panel, which then lifts away.
// Loaded in <head> without defer so the cover is painted before the page. GSAP drives it when
// loaded; otherwise the Web Animations API does the same moves.
(function () {
  var root = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
  var pageKey = function (path) { return (path.split("/").pop() || "").replace(/\.html$/, "").replace(/^index$/, ""); };
  var FONT = '"Overused Grotesk", Poppins, system-ui, sans-serif';
  var EASE = "cubic-bezier(.76,0,.24,1)";

  var css = document.createElement("style");
  css.textContent =
    ".pt{position:fixed;inset:0;z-index:2147483646;pointer-events:none}" +
    ".pt.is-on{pointer-events:auto}" +
    ".pt__a,.pt__b{position:absolute;inset:0;clip-path:inset(100% 0 0 0)}" +
    ".pt__a{background:#de6536}" +
    ".pt__b{display:grid;place-items:center;overflow:hidden}" +
    ".pt__name{font:500 clamp(40px,7vw,112px)/1 " + FONT + ";letter-spacing:-.03em;opacity:0}" +
    "html.pt-in::after{content:\"\";position:fixed;inset:0;z-index:2147483647;background:var(--pt-c)}";
  document.head.appendChild(css);

  // arriving from a transition: cover the page right away, before anything paints
  var arrive = null;
  try {
    arrive = JSON.parse(sessionStorage.getItem("pt") || "null");
    sessionStorage.removeItem("pt");
  } catch (e) {}
  if (arrive && (Date.now() - arrive.t > 6000 || arrive.k !== pageKey(location.pathname))) arrive = null;
  if (arrive) {
    root.style.setProperty("--pt-c", arrive.c);
    root.classList.add("pt-in");
    // never leave the page covered if something fails
    setTimeout(function () { root.classList.remove("pt-in"); }, 4000);
  }

  var el, a, b, name;
  function build() {
    if (el) return;
    el = document.createElement("div");
    el.className = "pt";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="pt__a"></div><div class="pt__b"><span class="pt__name"></span></div>';
    a = el.firstChild; b = el.lastChild; name = b.firstChild;
    document.body.appendChild(el);
  }
  function paint(c, f, n) { b.style.background = c; name.style.color = f; name.textContent = n; }

  // moves are written as CSS (clipPath, opacity, transform: translateY); GSAP gets y in pixels
  var forGsap = function (v) {
    var o = Object.assign({}, v), m = /translateY\((-?\d+)px\)/.exec(o.transform || "");
    if (m) { o.y = +m[1]; delete o.transform; }
    return o;
  };
  function tween(node, from, to, dur, delay) {
    if (window.gsap) return gsap.fromTo(node, forGsap(from), Object.assign({ duration: dur, delay: delay, ease: "power4.inOut" }, forGsap(to)));
    return node.animate([from, to], { duration: dur * 1000, delay: delay * 1000, easing: EASE, fill: "both" });
  }
  var CLOSED_LOW = "inset(100% 0% 0% 0%)", OPEN = "inset(0% 0% 0% 0%)", CLOSED_HIGH = "inset(0% 0% 100% 0%)";

  function lift() {
    build();
    paint(arrive.c, arrive.f, arrive.n);
    a.style.clipPath = CLOSED_LOW;
    b.style.clipPath = OPEN;
    name.style.opacity = 1;
    el.classList.add("is-on");
    root.classList.remove("pt-in");
    tween(name, { opacity: 1, transform: "translateY(0px)" }, { opacity: 0, transform: "translateY(-40px)" }, 0.45, 0.1);
    var t = tween(b, { clipPath: OPEN }, { clipPath: CLOSED_HIGH }, 0.8, 0.2);
    var done = function () { el.classList.remove("is-on"); };
    if (window.gsap) t.eventCallback("onComplete", done); else t.onfinish = done;
  }
  if (arrive) {
    // deferred scripts (GSAP) have run by DOMContentLoaded
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lift); else lift();
  }

  function leave(url, link) {
    build();
    var key = pageKey(url.pathname);
    var p = PAGES[key] || PAGES[""];
    // a link can set the colour itself (project cards, "Next project")
    var cs = getComputedStyle(link);
    var c = cs.getPropertyValue("--next-bg").trim() || p[0];
    var f = cs.getPropertyValue("--next-fg").trim() || p[1];
    paint(c, f, p[2]);
    try { sessionStorage.setItem("pt", JSON.stringify({ c: c, f: f, n: p[2], k: key, t: Date.now() })); } catch (e) {}
    el.classList.add("is-on");
    if (window.__lenis) window.__lenis.stop();
    tween(a, { clipPath: CLOSED_LOW }, { clipPath: OPEN }, 0.7, 0);
    tween(b, { clipPath: CLOSED_LOW }, { clipPath: OPEN }, 0.7, 0.12);
    var t = tween(name, { opacity: 0, transform: "translateY(60px)" }, { opacity: 1, transform: "translateY(0px)" }, 0.5, 0.45);
    // go once the name has landed; the timer covers a tab whose frames are paused
    var went = false, go = function () { if (!went) { went = true; location.href = url.href; } };
    if (window.gsap) t.eventCallback("onComplete", go); else t.onfinish = go;
    setTimeout(go, 1600);
  }

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
    if (window.gsap) gsap.killTweensOf([a, b, name]);
    else [a, b, name].forEach(function (n) { n.getAnimations().forEach(function (x) { x.cancel(); }); });
    a.style.clipPath = b.style.clipPath = CLOSED_LOW;
    name.style.opacity = 0;
    el.classList.remove("is-on");
    if (window.__lenis) window.__lenis.start();
  });
})();
