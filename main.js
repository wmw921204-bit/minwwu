// Shared behaviour for the home page and case studies.
// Every feature checks that its elements exist, so pages only pay for what they use.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
// UI strings made here, in the page's language (see i18n.js)
const t = (en, zh) => (window.__i18n ? window.__i18n.t(en, zh) : en);

/* ---------- Smooth scrolling ---------- */
let lenis = null;
if (!reduceMotion && window.Lenis) {
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, touchMultiplier: 1.4 });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  window.__lenis = lenis;
  if (document.documentElement.classList.contains("is-loading")) lenis.stop();
}
function scrollToTarget(target) {
  // Full-screen sections land with their top rule at the very top, header tucked away
  const full = target !== 0 && target.hasAttribute("data-screen");
  if (lenis) lenis.scrollTo(target, { offset: target === 0 || full ? 0 : -88, duration: 1.4, onComplete: () => full && $(".topbar")?.classList.add("is-hidden") });
  else if (target === 0) scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  else target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
}
document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const id = link.getAttribute("href").slice(1);
  const target = id === "top" || id === "" ? 0 : document.getElementById(id);
  if (target === null) return;
  e.preventDefault();
  scrollToTarget(target);
  history.replaceState(null, "", `#${id}`);
});

/* ---------- Scroll-driven effects (one rAF per frame) ---------- */
const onScrollFns = [];
let ticking = false;
let lastY = scrollY;
let velocity = 0;
function runScrollFns() {
  ticking = false;
  const y = scrollY;
  velocity = lenis ? lenis.velocity : y - lastY;
  lastY = y;
  for (const fn of onScrollFns) fn(y);
}
function requestScrollFrame() {
  if (!ticking) { ticking = true; requestAnimationFrame(runScrollFns); }
}
if (lenis) lenis.on("scroll", requestScrollFrame);
else addEventListener("scroll", requestScrollFrame, { passive: true });
addEventListener("resize", requestScrollFrame);

/* ---------- Header: hide on scroll down, show on scroll up ---------- */
const topbar = $(".topbar");
if (topbar) {
  let prev = 0;
  onScrollFns.push((y) => {
    const menuOpen = $("#menu") && !$("#menu").hidden;
    const down = y > prev + 2;
    const up = y < prev - 2;
    if (y < 120 || up || menuOpen) topbar.classList.remove("is-hidden");
    else if (down) topbar.classList.add("is-hidden");
    topbar.classList.toggle("is-scrolled", y > 40);
    prev = y;
  });
}

/* ---------- Menu ---------- */
const menuBtn = $(".menu-btn");
const menu = $("#menu");
if (menuBtn && menu) {
  const setMenu = (open) => {
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? t("Close menu", "关闭菜单") : t("Open menu", "打开菜单"));
  };
  menuBtn.addEventListener("click", () => setMenu(menu.hidden));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
  document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest(".topbar")) setMenu(false); });
}

/* ---------- Reveal on enter ---------- */
const revealEls = $$(".reveal, .reveal-mask, .reveal-stagger, .reveal-lines, .wipe");
if (reduceMotion || !("IntersectionObserver" in window)) {
  revealEls.forEach((el) => el.classList.add("is-in"));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      io.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  revealEls.forEach((el) => io.observe(el));
}
// Stagger children of .reveal-stagger via a CSS custom property
$$(".reveal-stagger").forEach((group) => [...group.children].forEach((child, i) => child.style.setProperty("--i", i)));
// Chinese has no spaces, so it is cut into words (punctuation stays glued to the word before it) instead of split on whitespace
const cjk = /[\u3400-\u9fff]/;
const zhSeg = window.Intl && Intl.Segmenter ? new Intl.Segmenter("zh", { granularity: "word" }) : null;
function words(text) {
  text = text.trim();
  if (!cjk.test(text)) return text.split(/\s+/);
  // inline tags (<em>, <span>…) are reopened around every word inside them, so each word stays its own mask
  const out = [], open = [];
  for (const piece of text.split(/(<[^>]+>)/)) {
    if (!piece) continue;
    if (piece[0] === "<") { if (piece[1] === "/") open.pop(); else open.push(piece); continue; }
    const wrap = (w) => open.join("") + w + open.map((t) => `</${t.match(/^<(\w+)/)[1]}>`).reverse().join("");
    for (const { segment } of zhSeg ? zhSeg.segment(piece) : [...piece].map((segment) => ({ segment }))) {
      if (!segment.trim()) { if (out.length && out[out.length - 1] !== " ") out.push(" "); continue; }
      if (out.length && out[out.length - 1] !== " " && /^[\p{P}\p{S}]+$/u.test(segment)) out[out.length - 1] += wrap(segment);
      else out.push(wrap(segment));
    }
  }
  return out;
}
// Split .reveal-mask headings into lines-of-words that slide up from a mask
$$(".reveal-mask").forEach((el) => {
  if (el.dataset.split) return;
  el.dataset.split = "1";
  const parts = el.innerHTML.split(/<br\s*\/?>/i);
  let n = 0;
  // Chinese words sit flush; a space between Chinese and Latin stays a real space between the masks
  el.innerHTML = parts.map((part) => words(part).map((w) => w === " " ? " " :
    `<span class="m"><span class="m__in" style="--i:${n++}">${w}</span></span>`).join(cjk.test(part) ? "" : " ")).join("<br>");
});

/* ---------- Word-by-word highlight tied to scroll ---------- */
const wordBlocks = $$(".reveal-words");
for (const block of wordBlocks) {
  const txt = block.textContent;
  block.innerHTML = words(txt).map((w) => w === " " ? " " : `<span class="w">${w}</span>`).join(cjk.test(txt) ? "" : " ");
}
if (reduceMotion) wordBlocks.forEach((b) => $$(".w", b).forEach((w) => w.classList.add("on")));
else if (wordBlocks.length) {
  onScrollFns.push(() => {
    const vh = innerHeight;
    for (const block of wordBlocks) {
      const r = block.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const words = block.children;
      const lit = Math.round(clamp((vh * 0.85 - r.top) / (vh * 0.5)) * words.length);
      for (let i = 0; i < words.length; i++) words[i].classList.toggle("on", i < lit);
    }
  });
}

/* ---------- Parallax ---------- */
const parallaxEls = $$("[data-parallax]");
if (!reduceMotion && parallaxEls.length) {
  onScrollFns.push(() => {
    const vh = innerHeight;
    for (const el of parallaxEls) {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const offset = (r.top + r.height / 2 - vh / 2) * Number(el.dataset.parallax);
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    }
  });
}

/* ---------- Sticky stacks: earlier cards recede as the next one arrives ---------- */
$$("[data-stack]").forEach((stack) => {
  const cards = $$(":scope > *", stack);
  if (reduceMotion || cards.length < 2) return;
  onScrollFns.push(() => {
    for (let i = 0; i < cards.length - 1; i++) {
      const cur = cards[i].getBoundingClientRect();
      const next = cards[i + 1].getBoundingClientRect();
      const p = clamp(1 - (next.top - cur.top) / cur.height);
      const inner = cards[i].firstElementChild;
      inner.style.transform = `scale(${(1 - p * 0.08).toFixed(4)})`;
      inner.style.setProperty("--dim", (p * 0.6).toFixed(3));
      // Once the next card fully covers this one, stop painting it: eleven full-screen
      // layers kept alive at once blow Chrome's GPU budget and the later cards flicker
      const hide = p >= 1 && next.top <= 0 ? "hidden" : "";
      if (cards[i].style.visibility !== hide) cards[i].style.visibility = hide;
    }
  });
});

/* ---------- Marquee that reacts to scroll velocity ---------- */
$$(".marquee__track").forEach((track) => {
  if (reduceMotion) return;
  const dir = track.closest(".marquee--reverse") ? 1 : -1;
  let x = 0;
  let last = performance.now();
  let boost = 0;
  const loop = (now) => {
    const dt = Math.min(64, now - last) / 1000;
    last = now;
    boost += (Math.min(Math.abs(velocity), 60) * 6 - boost) * 0.08;
    const half = track.scrollWidth / 2;
    x += dir * (60 + boost) * dt;
    if (x <= -half) x += half;
    if (x > 0) x -= half;
    track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

/* ---------- Experience cards: auto-rotate with progress bar ---------- */
const xp = $(".xp");
if (xp) {
  const cards = [...xp.children];
  const bar = $(".xp__progress span");
  const delay = Number(xp.dataset.autoplay);
  let current = 0;
  let timer;
  let visible = false;
  const selectCard = (i) => {
    current = i;
    cards.forEach((c, j) => c.classList.toggle("is-active", j === i));
    clearTimeout(timer);
    if (reduceMotion || !visible) return;
    bar.classList.remove("run");
    void bar.offsetWidth;
    bar.style.animationDuration = `${delay}ms`;
    bar.classList.add("run");
    timer = setTimeout(() => selectCard((current + 1) % cards.length), delay);
  };
  cards.forEach((c, i) => {
    c.addEventListener("click", () => selectCard(i));
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCard(i); } });
  });
  // Only rotate while the cards are on screen
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) selectCard(current);
    else { clearTimeout(timer); bar.classList.remove("run"); }
  }, { threshold: 0.3 }).observe(xp);
}

/* ---------- Services: activate the row nearest the centre, or on hover ---------- */
const services = $$(".svc");
if (services.length) {
  const activate = (el) => services.forEach((s) => s.classList.toggle("is-active", s === el));
  if (matchMedia("(hover: hover)").matches) services.forEach((s) => s.addEventListener("mouseenter", () => activate(s)));
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) activate(entry.target);
  }, { rootMargin: "-45% 0px -45% 0px" });
  services.forEach((s) => io.observe(s));
}

/* ---------- Feature switcher (case studies) ---------- */
$$("[data-tabs]").forEach((tabs) => {
  const buttons = $$("[role=tab]", tabs);
  const panels = $$("[role=tabpanel]", tabs);
  const select = (i) => {
    buttons.forEach((b, j) => { b.setAttribute("aria-selected", String(i === j)); b.tabIndex = i === j ? 0 : -1; });
    panels.forEach((p, j) => p.classList.toggle("is-active", i === j));
  };
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => select(i));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = (i + d + buttons.length) % buttons.length;
      select(n);
      buttons[n].focus();
    });
  });
});

/* ---------- Count-up numbers ---------- */
const counters = $$("[data-count]");
if (counters.length) {
  const run = (el) => {
    const end = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const dec = Number(el.dataset.decimals) || 0;
    if (reduceMotion) { el.textContent = end.toFixed(dec) + suffix; return; }
    const start = performance.now();
    const dur = 1400;
    const step = (now) => {
      const t = clamp((now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = (end * eased).toFixed(dec) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { run(entry.target); io.unobserve(entry.target); }
  }, { threshold: 0.6 });
  counters.forEach((el) => io.observe(el));
}

/* ---------- Donut / bar charts animate in ---------- */
const charts = $$(".donut, .bar");
if (charts.length) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("is-in"); io.unobserve(entry.target); }
  }, { threshold: 0.5 });
  charts.forEach((el) => (reduceMotion ? el.classList.add("is-in") : io.observe(el)));
}

/* ---------- Drag-to-explore gallery ---------- */
$$(".gallery__track, [data-drag]").forEach((track) => {
  let down = false;
  let startX = 0;
  let startScroll = 0;
  let v = 0;
  let lastX = 0;
  let moved = false;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    down = true; moved = false;
    startX = lastX = e.clientX;
    startScroll = track.scrollLeft;
    v = 0;
    track.classList.add("is-dragging");
  });
  addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    v = e.clientX - lastX;
    lastX = e.clientX;
    track.scrollLeft = startScroll - dx;
  });
  addEventListener("pointerup", () => {
    if (!down) return;
    down = false;
    track.classList.remove("is-dragging");
    if (reduceMotion) return;
    const glide = () => {
      v *= 0.94;
      track.scrollLeft -= v;
      if (Math.abs(v) > 0.4) requestAnimationFrame(glide);
    };
    requestAnimationFrame(glide);
  });
  track.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
  track.addEventListener("dragstart", (e) => e.preventDefault());
});

/* ---------- Lazy-load videos, pause them off-screen ---------- */
const videoObserver = new IntersectionObserver((entries) => {
  for (const { target: v, isIntersecting } of entries) {
    if (isIntersecting) {
      const src = $("source[data-src]", v);
      if (src) { src.src = src.dataset.src; src.removeAttribute("data-src"); v.load(); }
      if (v.autoplay !== false && v.hasAttribute("autoplay") && !reduceMotion) v.play().catch(() => {});
    } else if (!v.controls) v.pause();
  }
}, { rootMargin: "200px" });
$$("video").forEach((v) => {
  if (reduceMotion) v.removeAttribute("autoplay");
  videoObserver.observe(v);
});

/* ---------- Contact form → visitor's mail app (static site, no backend) ---------- */
const form = $("#contact-form");
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const body = `${data.get("message")}\n\n— ${data.get("email")}${data.get("phone") ? ` / ${data.get("phone")}` : ""}`;
    location.href = `mailto:wmw921204@gmail.com?subject=${encodeURIComponent("Portfolio enquiry")}&body=${encodeURIComponent(body)}`;
    $(".form__note", form).textContent = t("Opening your email app… If nothing happens, write to wmw921204@gmail.com.", "正在打开邮件应用……如果没有反应，请直接写信到 wmw921204@gmail.com。");
  });
}

/* ---------- Local time in Savannah, GA ---------- */
const clock = $("#clock");
if (clock) {
  const tz = "America/New_York";
  const tzLabel = $("#tz");
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const zoneFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
  const tick = () => {
    const now = new Date();
    clock.textContent = timeFmt.format(now);
    tzLabel.textContent = `(${zoneFmt.formatToParts(now).find((p) => p.type === "timeZoneName").value})`;
  };
  tick();
  setInterval(tick, 1000);
}
const year = $("#year");
if (year) year.textContent = new Date().getFullYear();

/* ---------- Scenes: a pinned stage whose "beats" advance as you scroll ----------
   <section data-scene style="--beats:N"> … elements with data-beat="i" become .is-active in turn.
   The scene also exposes --p (0→1 over the whole scene) and --bp (0→1 within the current beat). */
function typeLine(el) {
  const text = el.dataset.text ?? el.textContent;
  el.dataset.text = text;
  cancelAnimationFrame(el._raf);
  if (reduceMotion) { el.textContent = text; return; }
  el.textContent = "";
  el.classList.add("is-typing");
  const start = performance.now();
  const speed = Number(el.dataset.type) || 22; // ms per character
  const step = (now) => {
    const n = Math.min(text.length, Math.floor((now - start) / speed));
    el.textContent = text.slice(0, n);
    if (n < text.length) el._raf = requestAnimationFrame(step);
    else el.classList.remove("is-typing");
  };
  el._raf = requestAnimationFrame(step);
}
$$("[data-scene]").forEach((scene) => {
  const beats = Number(getComputedStyle(scene).getPropertyValue("--beats")) || 1;
  const items = $$("[data-beat]", scene);
  const dots = $$("[data-goto]", scene);
  let current = -1;
  const activate = (i) => {
    if (i === current) return;
    current = i;
    scene.dataset.beat = i;
    items.forEach((el) => {
      const on = el.dataset.beat.split(",").map(Number).includes(i);
      if (on && !el.classList.contains("is-active") && el.hasAttribute("data-type")) typeLine(el);
      el.classList.toggle("is-active", on);
    });
    dots.forEach((d) => d.classList.toggle("is-active", Number(d.dataset.goto) === i));
  };
  const update = () => {
    const r = scene.getBoundingClientRect();
    const total = Math.max(1, r.height - innerHeight);
    const p = clamp(-r.top / total);
    const exact = p * beats;
    const i = Math.min(beats - 1, Math.floor(exact));
    scene.style.setProperty("--p", p.toFixed(4));
    // "rise": 0 while the scene scrolls in, 1 once ~35vh of the pinned scene has been scrolled (eased)
    const rise = clamp((innerHeight * 0.15 - r.top) / (innerHeight * 0.5));
    scene.style.setProperty("--rise", (1 - Math.pow(1 - rise, 3)).toFixed(4));
    if (scene.classList.contains("vn")) scene.classList.toggle("is-pinned", r.top <= 1 && r.bottom >= innerHeight - 1);
    document.body.classList.toggle("in-scene", $$(".vn.is-pinned").length > 0);
    scene.style.setProperty("--bp", clamp(exact - i).toFixed(4));
    activate(i);
  };
  dots.forEach((d) => d.addEventListener("click", () => {
    const top = scene.getBoundingClientRect().top + scrollY;
    const total = scene.offsetHeight - innerHeight;
    const y = top + total * ((Number(d.dataset.goto) + 0.15) / beats);
    if (lenis) lenis.scrollTo(y, { duration: 1.2 }); else scrollTo({ top: y, behavior: "smooth" });
  }));
  onScrollFns.push(update);
  update();
});

/* ---------- Zoom-out reveal tied to scroll ---------- */
$$("[data-zoom-reveal]").forEach((section) => {
  const img = $("img", section);
  if (reduceMotion) return;
  onScrollFns.push(() => {
    const r = section.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const p = clamp(-r.top / Math.max(1, r.height - innerHeight));
    const eased = 1 - Math.pow(1 - p, 3);
    img.style.transform = `scale(${(1.9 - 0.9 * eased).toFixed(4)})`;
    section.style.setProperty("--p", eased.toFixed(3));
  });
});

/* ---------- Chapter indicator for long case studies ---------- */
const chapterNav = $(".chapter");
if (chapterNav) {
  const chapters = $$("[data-chapter]");
  const label = $(".chapter__label", chapterNav);
  const num = $(".chapter__num", chapterNav);
  const bar = $(".chapter__bar span", chapterNav);
  const list = $(".chapter__list", chapterNav);
  const toggle = $(".chapter__toggle", chapterNav);
  list.innerHTML = chapters.map((c, i) => `<li><a href="#${c.id}"><span>${String(i + 1).padStart(2, "0")}</span>${c.dataset.chapter}</a></li>`).join("");
  const links = $$("a", list);
  let current = -1;
  onScrollFns.push((y) => {
    const doc = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${clamp(y / doc).toFixed(4)})`;
    let idx = -1;
    chapters.forEach((c, i) => { if (c.getBoundingClientRect().top < innerHeight * 0.5) idx = i; });
    chapterNav.classList.toggle("is-visible", idx >= 0 && $(".footer").getBoundingClientRect().top > innerHeight * 0.7);
    if (idx === current || idx < 0) return;
    current = idx;
    label.textContent = chapters[idx].dataset.chapter;
    num.textContent = `${String(idx + 1).padStart(2, "0")} / ${String(chapters.length).padStart(2, "0")}`;
    links.forEach((l, i) => l.classList.toggle("is-current", i === idx));
  });
  toggle.addEventListener("click", () => {
    const open = chapterNav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  list.addEventListener("click", (e) => { if (e.target.closest("a")) { chapterNav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("click", (e) => { if (!e.target.closest(".chapter")) { chapterNav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); } });
}

/* ---------- Pointer-follow glow on interactive rows ---------- */
$$("[data-glow]").forEach((el) => {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});

/* ---------- Deck: stacked sheets, click to deal the next one ---------- */
$$("[data-deck]").forEach((deck) => {
  const stage = $(".deck__stage", deck);
  const cards = $$("img", stage);
  const n = cards.length;
  const countEl = $(".deck__count b", deck);
  const labelEl = $(".deck__label", deck);
  const dotsEl = $(".deck__dots", deck);
  let cur = 0, busy = false;
  const dots = cards.map((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", c.dataset.label || t(`Sheet ${i + 1}`, `第 ${i + 1} 张`));
    b.addEventListener("click", () => go(i));
    dotsEl.append(b);
    return b;
  });
  // the stage takes the front sheet's ratio, capped so tall sheets still fit the screen
  const fit = () => {
    const c = cards[cur];
    const ar = c.getAttribute("width") / c.getAttribute("height");
    const room = deck.clientWidth - 2 * (parseFloat(getComputedStyle(deck).getPropertyValue("--gap")) || 0);
    const w = Math.min(room, +c.getAttribute("width"), 1200, innerHeight * 0.72 * ar);
    stage.style.width = `${w}px`;
    stage.style.height = `${w / ar}px`;
    stage.style.aspectRatio = "auto";
  };
  const paint = () => {
    cards.forEach((c, i) => c.style.setProperty("--k", (i - cur + n) % n));
    countEl.textContent = String(cur + 1).padStart(2, "0");
    labelEl.textContent = cards[cur].dataset.label || "";
    dots.forEach((d, i) => d.setAttribute("aria-current", String(i === cur)));
    fit();
  };
  const go = (to) => {
    to = (to + n) % n;
    if (busy || to === cur) return;
    const forward = to === (cur + 1) % n;
    const back = to === (cur - 1 + n) % n && !forward;
    if (reduceMotion || (!forward && !back)) { cur = to; paint(); return; }
    busy = true;
    if (forward) {
      // the front sheet slides away, then tucks in at the back of the pile
      const out = cards[cur];
      out.classList.add("is-out");
      setTimeout(() => {
        out.classList.remove("is-out");
        cur = to; paint();
        busy = false;
      }, 380);
    } else {
      // the bottom sheet jumps out to the side and slides back on top
      const inc = cards[to];
      inc.classList.add("no-anim", "is-out");
      inc.style.setProperty("--k", 0);
      inc.offsetWidth;
      inc.classList.remove("no-anim");
      cur = to;
      requestAnimationFrame(() => { inc.classList.remove("is-out"); paint(); });
      setTimeout(() => { busy = false; }, 420);
    }
  };
  // click the left third to go back, anywhere else for the next sheet
  const side = (e) => e.clientX - stage.getBoundingClientRect().left < stage.offsetWidth / 3 ? -1 : 1;
  stage.addEventListener("pointermove", (e) => { stage.dataset.cursor = side(e) < 0 ? "Prev" : "Next"; });
  stage.addEventListener("click", (e) => go(cur + (e.detail ? side(e) : 1)));
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
  });
  addEventListener("resize", fit);
  paint();
});

/* ---------- Hero film: muted loop by default, one tap to watch it with sound ---------- */
$$("[data-sound]").forEach((btn) => {
  const video = btn.closest(".c-hero__pin")?.querySelector("video");
  if (!video) return;
  const label = $(".c-hero__sound-label", btn);
  let started = false;
  const sync = () => {
    btn.setAttribute("aria-pressed", String(!video.muted));
    btn.classList.toggle("is-on", !video.muted);
    label.textContent = video.muted ? (started ? t("Sound off", "声音已关") : t("Watch with sound", "开声音看")) : t("Sound on", "声音已开");
  };
  btn.addEventListener("click", () => {
    if (!started) {
      // the first tap plays the film from the start, with sound and without looping
      started = true;
      video.currentTime = 0;
      video.loop = false;
      video.muted = false;
    } else video.muted = !video.muted;
    video.play().catch(() => {});
    sync();
  });
  video.addEventListener("ended", () => { video.loop = true; video.muted = true; started = false; video.play().catch(() => {}); sync(); });
  sync();
});

/* ---------- Relay diagram: the layer in the middle of the screen lights up ---------- */
$$("[data-relay]").forEach((relay) => {
  const rows = $$(".relay__list > li", relay);
  const set = (k) => { relay.dataset.active = k; };
  set(0);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) set(e.target.dataset.layer);
  }, { rootMargin: "-45% 0px -45% 0px" });
  rows.forEach((row) => {
    io.observe(row);
    row.addEventListener("pointerenter", () => set(row.dataset.layer));
    row.addEventListener("focus", () => set(row.dataset.layer));
  });
  $$(".relay__layer", relay).forEach((g) => g.addEventListener("pointerenter", () => set(g.dataset.layer)));
});

/* ---------- FINRA research: guess, constellation, forum, journey ---------- */
const inView = (el, fn, opts = { threshold: 0.35 }) => {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { fn(); io.disconnect(); } }), opts);
  io.observe(el);
};
$$("[data-bounce]").forEach((box) => {
  const dots = $$(".fin-bounce__grid i", box), num = $("[data-bounce-num]", box);
  // the top 62 leave row by row; the bottom 38 stay as a neat block
  const goneN = +(box.dataset.gone || 62), val = parseFloat(box.dataset.val || 62.2);
  const gone = new Set(dots.map((_, i) => i).slice(0, goneN));
  dots.forEach((d, i) => { if (gone.has(i)) d.style.setProperty("--d", (0.15 + Math.floor(i / 10) * 0.22 + (i % 10) * 0.025).toFixed(2) + "s"); });
  inView(box, () => {
    box.classList.add("is-in");
    dots.forEach((d, i) => d.classList.add(gone.has(i) ? "is-gone" : "is-stay"));
    const t0 = performance.now(), T = reduceMotion ? 1 : 2000;
    const tick = (t) => { const k = Math.max(0, Math.min(1, (t - t0) / T)), e = 1 - Math.pow(1 - k, 3); num.textContent = (val * e).toFixed(1); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, { threshold: 0.45 });
});
$$("[data-constellation]").forEach((sky) => {
  inView(sky, () => sky.classList.add("is-in"));
  const scope = sky.closest(".fin-orbit") || sky;
  const lines = $$(".fin-orb__spokes line", sky);
  const pick = (id) => {
    $$("[data-info]", scope).forEach((p) => p.classList.toggle("is-active", p.dataset.info === id));
    $$("[data-node]", sky).forEach((n) => n.classList.toggle("is-active", n.dataset.node === id));
    lines.forEach((l, i) => l.classList.toggle("is-hot", String(i) === id));
  };
  $$("[data-node]", sky).forEach((n) => {
    n.addEventListener("click", () => pick(n.dataset.node));
    n.addEventListener("mouseenter", () => pick(n.dataset.node));
  });
});
$$("[data-forum]").forEach((forum) => {
  const posts = $$("li", forum);
  let started = false;
  const start = () => {
    started = true;
    posts.forEach((li, i) => setTimeout(() => {
      li.classList.add("is-on");
      if (i === posts.length - 1) setTimeout(() => forum.classList.add("is-done"), 900);
    }, reduceMotion ? 0 : 500 + i * 1200));
  };
  const check = () => {
    if (started) return;
    const r = forum.getBoundingClientRect();
    if (r.top >= 60 && r.bottom <= innerHeight - 40) start();
  };
  onScrollFns.push(check);
  check();
});
/* ---------- FINRA jargon: cycle through terms, hover to pick ---------- */
$$("[data-jargon]").forEach((jg) => {
  const terms = $$("[data-term]", jg), defs = $$("[data-def]", jg);
  let k = -1, pausedUntil = 0, started = false;
  const pick = (i) => { k = i; terms.forEach((t, n) => t.classList.toggle("is-active", n === i)); defs.forEach((d, n) => d.classList.toggle("is-active", n === i)); };
  terms.forEach((t, i) => { const go = () => { pausedUntil = Date.now() + 8000; pick(i); }; t.addEventListener("mouseenter", go); t.addEventListener("click", go); t.addEventListener("focus", go); });
  inView(jg, () => { started = true; pick(0); }, { threshold: 0.5 });
  setInterval(() => {
    if (!started || Date.now() < pausedUntil || document.hidden) return;
    const r = jg.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    pick((k + 1) % terms.length);
  }, 2800);
});

$$("[data-journey]").forEach((jr) => {
  const line = $(".fin-jr__line", jr), dot = $(".fin-jr__dot", jr), wipe = $(".fin-jr__wipe", jr);
  const cols = $$("[data-stage]", jr), cards = $$("[data-card]", jr);
  const L = line.getTotalLength();
  const lenAtX = (x) => { let lo = 0, hi = L; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (line.getPointAtLength(m).x < x) lo = m; else hi = m; } return lo; };
  const stops = [150, 450, 750].map(lenAtX);
  let at = -1, pos = 0, revealed = 0, raf = 0;
  const mark = (k) => {
    if (k === at) return;
    at = k; jr.dataset.at = k;
    cols.forEach((c, i) => c.classList.toggle("is-active", i === k));
    cards.forEach((c, i) => c.classList.toggle("is-active", i === k));
  };
  const place = (l) => {
    pos = l;
    const p = line.getPointAtLength(l);
    dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y);
    revealed = Math.max(revealed, p.x + 4);
    wipe.setAttribute("width", Math.min(900, revealed));
    mark(l >= stops[2] - 2 ? 2 : l >= stops[1] - 2 ? 1 : 0);
  };
  const travel = (to, ms) => {
    cancelAnimationFrame(raf);
    const from = pos, t0 = performance.now();
    const step = (t) => {
      const k = Math.max(0, Math.min(1, (t - t0) / ms)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      place(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  place(0);
  inView(jr, () => {
    if (reduceMotion) { revealed = 900; place(stops[2]); jr.classList.add("is-run"); return; }
    // walk the whole journey once, pausing at each stage
    travel(stops[0], 700);
    setTimeout(() => travel(stops[1], 1500), 1500);
    setTimeout(() => travel(stops[2], 1500), 3600);
    setTimeout(() => { revealed = 900; wipe.setAttribute("width", 900); jr.classList.add("is-run"); }, 5200);
  });
  // keep moving through the stages on its own until someone clicks
  let idleUntil = 0;
  cols.forEach((c, i) => c.addEventListener("click", () => { idleUntil = Date.now() + 12000; travel(stops[i], 700); }));
  setInterval(() => {
    if (!jr.classList.contains("is-run") || Date.now() < idleUntil || document.hidden) return;
    const r = jr.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    travel(stops[(at + 1) % 3], at === 2 ? 1400 : 1100);
  }, 4200);
});

/* ---------- FINRA maze vs path: toggle the same task before and after ---------- */
$$("[data-maze]").forEach((mz) => {
  $$(".fin-mz__route", mz).forEach((p) => p.style.setProperty("--len", Math.ceil(p.getTotalLength()) + 1));
  const set = (mode) => {
    mz.dataset.mode = mode;
    mz.classList.remove("is-play"); void mz.offsetWidth; mz.classList.add("is-play");
    $$("[data-maze-to]", mz).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mazeTo === mode)));
    $$("[data-b]", mz).forEach((n) => { n.textContent = mode === "after" ? n.dataset.a : n.dataset.b; n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
  };
  let idleUntil = 0, started = false;
  $$("[data-maze-to]", mz).forEach((b) => b.addEventListener("click", () => { idleUntil = Date.now() + 15000; set(b.dataset.mazeTo); }));
  inView(mz, () => { started = true; set("before"); idleUntil = Date.now() + 6000; });
  setInterval(() => {
    if (!started || Date.now() < idleUntil || document.hidden) return;
    const r = mz.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    set(mz.dataset.mode === "before" ? "after" : "before");
    idleUntil = Date.now() + (mz.dataset.mode === "after" ? 5000 : 7000);
  }, 500);
});

/* ---------- FINRA usability chart: bars grow in view ---------- */
$$("[data-ut]").forEach((ut) => inView(ut, () => ut.classList.add("is-in"), { threshold: 0.3 }));

/* ---------- FINRA synthesis: 700 notes cluster into 110, 27 and 6 as you scroll ---------- */
$$("[data-affinity]").forEach((sec) => {
  const canvas = $("canvas", sec), ctx = canvas.getContext("2d");
  const num = $("[data-aff-num]", sec), label = $("[data-aff-label]", sec);
  const N = 700, COLORS = ["#ffd166", "#ff8fab", "#ffa76b", "#7cc8ff", "#8ee3a8", "#b9a3ff"];
  const STAGES = [
    ["700+", t("data points, from every interview, survey and forum post", "个数据点，来自每一场访谈、每一份问卷和每一条论坛帖子")],
    ["110", t("groups of related notes", "组相关的便利贴")],
    ["27", t("themes", "个主题")],
    ["6", t("problems to solve", "个要解决的问题")],
  ];
  let W = 0, H = 0, dpr = 1, centers = [], box = [0, 0, 1, 1];
  // Every note belongs to one group, theme and problem, nested in order
  const notes = Array.from({ length: N }, (_, i) => ({
    g: Math.floor((i * 110) / N), t: Math.floor((i * 27) / N), p: Math.floor((i * 6) / N),
    rx: Math.random(), ry: Math.random(), rot: (Math.random() - 0.5) * 0.5, seed: Math.random(),
  }));
  const rank = (key) => { const c = {}; return notes.map((n) => (c[n[key]] = (c[n[key]] || 0) + 1) - 1); };
  const rG = rank("g"), rT = rank("t"), rP = rank("p");
  const grid = (count, cols, x0, y0, x1, y1) => {
    const rows = Math.ceil(count / cols);
    return Array.from({ length: count }, (_, k) => [x0 + ((k % cols) + 0.5) * (x1 - x0) / cols, y0 + (Math.floor(k / cols) + 0.5) * (y1 - y0) / rows]);
  };
  const layout = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const narrow = W < 900;
    // the copy owns the left (or top on phones); notes live in the rest
    const line = $(".c-chapter", sec), top = line ? line.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top + 30 : H * 0.18;
    box = narrow ? [W * 0.04, Math.max(top, H * 0.4), W * 0.96, H * 0.97] : [W * 0.4, Math.max(top, H * 0.16), W * 0.97, H * 0.95];
    const [x0, y0, x1, y1] = box;
    centers = [
      null,
      grid(110, narrow ? 10 : 11, x0, y0, x1, y1),
      grid(27, narrow ? 5 : 6, x0, y0, x1, y1),
      grid(6, narrow ? 3 : 3, x0, y0, x1, y1 - (y1 - y0) * 0.12),
    ];
    // problem labels sit just under their cluster
    const rad = Math.min(box[2] - box[0], box[3] - box[1]) * 1.15 * 0.0098 * Math.sqrt(N / 6) + 10;
    $$(".fin-aff__tags li", sec).forEach((li, k) => { li.style.setProperty("--x", centers[3][k][0] + "px"); li.style.setProperty("--y", centers[3][k][1] + rad + "px"); });
  };
  const spiral = (k, gap) => { const a = k * 2.39996, d = gap * Math.sqrt(k); return [Math.cos(a) * d, Math.sin(a) * d]; };
  const posAt = (n, i, s) => {
    if (s === 0) return [box[0] + n.rx * (box[2] - box[0]), box[1] + n.ry * (box[3] - box[1])];
    const size = Math.min(box[2] - box[0], box[3] - box[1]) * 1.15;
    const [cx, cy] = s === 1 ? centers[1][n.g] : s === 2 ? centers[2][n.t] : centers[3][n.p];
    const [ox, oy] = s === 1 ? spiral(rG[i], size * 0.0085) : s === 2 ? spiral(rT[i], size * 0.0105) : spiral(rP[i], size * 0.0098);
    return [cx + ox, cy + oy];
  };
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  let lastStage = -1;
  const draw = (prog) => {
    // three transitions with pauses between them
    const s = Math.min(3, Math.max(0, (prog - 0.06) / 0.28));
    const a = Math.floor(Math.min(2.999, s)), f = ease(Math.min(1, (s - a) * 1.6));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sz = Math.max(5, Math.min(W, H) * 0.0115);
    notes.forEach((n, i) => {
      const [x0, y0] = posAt(n, i, a), [x1, y1] = posAt(n, i, a + 1);
      const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
      ctx.save(); ctx.translate(x, y); ctx.rotate(n.rot * (1 - Math.min(1, s / 3)));
      ctx.fillStyle = COLORS[n.p]; ctx.globalAlpha = 0.9;
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    });
    const stage = Math.round(s >= 2.999 ? 3 : a + (f > 0.5 ? 1 : 0));
    if (stage !== lastStage) {
      lastStage = stage;
      num.textContent = STAGES[stage][0]; label.textContent = STAGES[stage][1];
      sec.classList.toggle("is-final", stage === 3);
    }
  };
  const update = () => {
    const r = sec.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    draw(reduceMotion ? 1 : clamp(-r.top / Math.max(1, r.height - innerHeight)));
  };
  layout();
  addEventListener("resize", () => { layout(); lastStage = -1; update(); });
  onScrollFns.push(update);
  update();
});

/* ---------- Bandy: research numbers count up as their bars fill ---------- */
$$("[data-gap]").forEach((el) => {
  new IntersectionObserver((es, io) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.disconnect(); el.classList.add("is-in");
    $$("[data-to]", el).forEach((n) => {
      const to = +n.dataset.to, t0 = performance.now();
      const tick = (now) => { const k = Math.min(1, (now - t0) / 1400); n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + "%"; if (k < 1) requestAnimationFrame(tick); };
      reduceMotion ? (n.textContent = to + "%") : requestAnimationFrame(tick);
    });
  }), { threshold: 0.4 }).observe(el);
});

/* ---------- Bandy: the rules on a top-down view of the base ---------- */
$$("[data-rules]").forEach((rules) => {
  const svg = $("[data-rules-svg]", rules);
  const B = "../assets/projects/bandy/blocks/";
  const X0 = 170, Y0 = 110, CW = 90, CH = 83.3;
  const band = [[0, 0, "elf"], [2, 1, "monster"], [1, 2, "bubble"], [0, 3, "robot"], [2, 3, "electric"], [1, 5, "glitch"]];
  let cells = "", tiles = "", nums = "";
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) cells += `<rect class="r-cell" data-c="${c}" x="${X0 + c * CW + 6}" y="${Y0 + r * CH + 6}" width="${CW - 12}" height="${CH - 12}" rx="8"/>`;
  band.forEach(([r, c, h], i) => { tiles += `<image class="r-tile" data-c="${c}" style="--d:${i * 0.12}s" href="${B}hat-${h}.webp" x="${X0 + c * CW + 15}" y="${Y0 + r * CH + 12}" width="${CW - 30}" height="${CW - 30}"/>`; });
  for (let c = 0; c < 6; c++) nums += `<text class="r-num" data-c="${c}" x="${X0 + c * CW + CW / 2}" y="428">${c + 1}</text>`;
  svg.setAttribute("viewBox", "0 0 820 470");
  svg.innerHTML = `
    <g class="r-board" data-hl="board"><rect x="230" y="34" width="420" height="22" rx="8"/><text x="440" y="26">${t("SCENE BOARD · GENRE", "场景板 · 曲风")}</text></g>
    <rect x="90" y="66" width="700" height="338" rx="130" fill="#2a2a2e"/>
    <rect x="102" y="78" width="676" height="314" rx="120" fill="#3ec68f"/>
    <rect x="${X0 - 12}" y="${Y0 - 12}" width="${CW * 6 + 24}" height="${CH * 3 + 24}" rx="16" fill="#f3f1ec"/>
    <g data-hl="cols"><rect class="r-sweep" x="${X0}" y="${Y0}" width="${CW}" height="${CH * 3}" rx="10"/></g>
    ${cells}${tiles}
    <g class="r-time" data-hl="cols">${nums}<path d="M${X0} 448 H${X0 + CW * 6}" /><path d="M${X0 + CW * 6 - 12} 441 l12 7 -12 7"/><text x="${X0 + CW * 6 + 26}" y="453" style="text-anchor:start">${t("TIME", "时间")}</text></g>
    <g class="r-pitch" data-hl="rows"><text x="58" y="${Y0 + CH * 0.5 + 6}">${t("high", "高")}</text><text x="58" y="${Y0 + CH * 1.5 + 6}">${t("mid", "中")}</text><text x="58" y="${Y0 + CH * 2.5 + 6}">${t("low", "低")}</text><path d="M16 ${Y0 + 20} V${Y0 + CH * 3 - 20}"/><path d="M9 ${Y0 + 32} l7 -12 7 12"/><text x="16" y="${Y0 - 4}">${t("PITCH", "音高")}</text></g>
    <g class="r-stack" data-hl="stack"><circle cx="${X0 + 2 * CW + CW / 2}" cy="${Y0 + CH * 1.5}" r="44"/></g>`;
  // the playhead sweeps the columns; members in that column bounce
  let col = 0, on = false;
  const sweep = $(".r-sweep", svg);
  const step = () => {
    if (!on || document.hidden) return;
    sweep.setAttribute("x", X0 + col * CW);
    $$("[data-c]", svg).forEach((n) => n.classList.toggle("is-now", +n.dataset.c === col));
    col = (col + 1) % 6;
  };
  new IntersectionObserver((es) => es.forEach((e) => { on = e.isIntersecting; rules.classList.toggle("is-in", on); }), { threshold: 0.3 }).observe(rules);
  if (!reduceMotion) setInterval(step, 650);
  // hovering a rule points at its part of the map
  $$(".bd-rules__list li", rules).forEach((li, i) => {
    const key = ["stack", "cols", "rows", "board"][i];
    li.addEventListener("mouseenter", () => { rules.dataset.hl = key; });
    li.addEventListener("mouseleave", () => { delete rules.dataset.hl; });
  });
});

/* ---------- Bandy: a block that changes turns like a real cube (six faces, lit from above) ---------- */
window.__cubeTurn = (host, fromSrc, toSrc, dur = 560) => {
  if (reduceMotion || !host || !host.animate || !fromSrc || fromSrc === toSrc) return;
  const w = host.offsetWidth, h = w / 2, img = host.querySelector("img");
  const o = document.createElement("div");
  o.className = "cturn"; o.setAttribute("aria-hidden", "true");
  const face = (cls, tf, src, light) => `<i class="cturn__f ${cls}" style="transform:${tf} translateZ(${h}px);background-image:url('${src}');filter:brightness(${light})"></i>`;
  o.innerHTML = `<div class="cturn__c">${face("fr", "", fromSrc, 1)}${face("rt", "rotateY(90deg)", toSrc, 0.55)}${face("lf", "rotateY(-90deg)", fromSrc, 0.62)}${face("bk", "rotateY(180deg)", fromSrc, 0.5)}${face("tp", "rotateX(90deg)", fromSrc, 1.12)}${face("bt", "rotateX(-90deg)", fromSrc, 0.42)}</div>`;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.append(o);
  if (img) img.style.visibility = "hidden";
  const c = o.firstChild, ease = "cubic-bezier(.45,.05,.35,1)";
  c.animate([
    { transform: `translateZ(${-h}px) rotateX(0deg) rotateY(0deg)` },
    { transform: `translateZ(${-h}px) rotateY(-45deg)` },   // about the vertical axis only: a stacked block can't tip without hitting its neighbours
    { transform: `translateZ(${-h}px) rotateX(0deg) rotateY(-90deg)` },
  ], { duration: dur, easing: ease }).onfinish = () => { o.remove(); if (img) img.style.visibility = ""; };
  $(".fr", o).animate([{ filter: "brightness(1)" }, { filter: "brightness(.55)" }], { duration: dur, easing: ease });
  $(".rt", o).animate([{ filter: "brightness(.55)" }, { filter: "brightness(1)" }], { duration: dur, easing: ease });
};

/* ---------- Bandy: a band member that remixes itself; tap a block to change it ---------- */
$$("[data-builder]").forEach((sec) => {
  const data = JSON.parse(((window.__i18n && window.__i18n.zh && $("[data-builder-data-zh]", sec)) || $("[data-builder-data]", sec)).textContent);
  const base = "../assets/projects/bandy/blocks/";
  const state = { hat: 1, face: 2, outfit: 0 };
  const COLORS = ["#0e4a37", "#c0402a", "#5b47c9", "#e0b100", "#0b3a8c"];
  const notes = $(".bd-notes", sec);
  let pausedUntil = 0, order = 0;
  const burst = () => {
    if (reduceMotion) return;
    for (let i = 0; i < 4; i++) {
      const n = document.createElement("i");
      n.textContent = ["♪", "♫", "♩", "♬"][i % 4];
      n.style.setProperty("--dx", (Math.random() * 220 - 110) + "px");
      n.style.setProperty("--r", (Math.random() * 40 - 20) + "deg");
      n.style.setProperty("--n", COLORS[(Math.random() * COLORS.length) | 0]);
      n.style.animationDelay = i * 0.12 + "s";
      notes.appendChild(n);
      setTimeout(() => n.remove(), 2400);
    }
  };
  const show = (slot, animate) => {
    const i = state[slot], item = data[slot][i];
    const btn = $(`[data-slot="${slot}"]`, sec), img = $("img", btn), was = img.src;
    img.src = base + slot + "-" + item[0] + ".webp"; img.alt = item[1];
    if (animate) window.__cubeTurn(btn, was, img.src);
    const row = $(`[data-read="${slot}"]`, sec);
    $("b", row).textContent = item[1];
    $("span", row).textContent = slot === "outfit" ? t("Plays the " + item[1].toLowerCase() + ".", "乐队里的" + item[1] + "。") : item[2] + t(": ", "：") + item[3];
    $$(`[data-pick^="${slot}:"]`, sec).forEach((b) => b.classList.toggle("is-on", b.dataset.pick === slot + ":" + i));
    if (animate) {

      row.classList.add("is-new"); setTimeout(() => row.classList.remove("is-new"), 700);
      burst();
    }
  };
  ["hat", "face", "outfit"].forEach((s) => show(s));
  const next = (slot, user) => {
    state[slot] = (state[slot] + 1) % data[slot].length;
    show(slot, true);
    if (user) pausedUntil = Date.now() + 9000;
  };
  $$("[data-slot]", sec).forEach((b) => b.addEventListener("click", () => next(b.dataset.slot, true)));
  $$("[data-pick]", sec).forEach((b) => b.addEventListener("click", () => {
    const [slot, i] = b.dataset.pick.split(":"); state[slot] = Number(i); show(slot, true); pausedUntil = Date.now() + 9000;
  }));
  // remix one layer at a time while it's on screen
  let visible = false;
  new IntersectionObserver((es) => es.forEach((e) => { visible = e.isIntersecting; }), { threshold: 0.3 }).observe(sec);
  setInterval(() => {
    if (!visible || Date.now() < pausedUntil || document.hidden || reduceMotion) return;
    next(["hat", "face", "outfit"][order++ % 3]);
  }, 2200);
});

// a small helper: cycle through items while visible, pause after a click
const autoCycle = (root, count, show, every) => {
  let cur = 0, pausedUntil = 0, visible = false;
  new IntersectionObserver((es) => es.forEach((e) => { visible = e.isIntersecting; }), { threshold: 0.35 }).observe(root);
  setInterval(() => {
    if (!visible || Date.now() < pausedUntil || document.hidden || reduceMotion) return;
    cur = (cur + 1) % count; show(cur);
  }, every);
  return (i) => { cur = i; pausedUntil = Date.now() + 12000; show(i); };
};
$$("[data-xray]").forEach((x) => {
  // hover a part to see inside it; when nobody is pointing, it walks through the parts by itself
  const order = ["block", "pins", "base", "board"];
  const hots = $$("[data-xgo]", x), infos = $$("[data-xinfo]", x);
  let cur = 0, holdUntil = 0, hovering = false, visible = false;
  const show = (i) => {
    cur = i; const k = order[i]; x.dataset.at = k;
    hots.forEach((h) => h.classList.toggle("is-on", h.dataset.xgo === k));
    infos.forEach((p) => p.classList.toggle("is-on", p.dataset.xinfo === k));
  };
  show(0);
  hots.forEach((h) => {
    const go = () => { show(order.indexOf(h.dataset.xgo)); holdUntil = Date.now() + 6000; };
    h.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") go(); });
    h.addEventListener("click", go);
  });
  const fig = $(".bd-x__fig", x);
  fig.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hovering = true; });
  fig.addEventListener("pointerleave", () => { hovering = false; holdUntil = Date.now() + 2500; });
  new IntersectionObserver((es) => es.forEach((e) => { visible = e.isIntersecting; }), { threshold: 0.35 }).observe(x);
  setInterval(() => { if (visible && !hovering && Date.now() > holdUntil && !document.hidden && !reduceMotion) show((cur + 1) % order.length); }, 3600);
});

/* ---------- Prototype guide: follow the embedded app and explain each step ---------- */
$$("[data-proto-guide]").forEach((guide) => {
  const demo = guide.closest(".fin-demo") || guide.parentElement;
  const frame = $("[data-proto-frame]", demo.parentElement);
  const view = frame && frame.parentElement;
  const cfg = JSON.parse($("[data-proto-rules]", demo).textContent);
  const steps = $$("[data-step]", guide);
  const items = $$(".fin-guide__list li", guide);
  const count = $("[data-proto-count]", guide);
  const seen = new Set();
  let current = "";
  const show = (id) => {
    if (id === current) return;
    current = id;
    let group = 0;
    steps.forEach((s) => {
      const on = s.dataset.step === id;
      s.classList.toggle("is-active", on);
      if (on) group = Number(s.dataset.group);
    });
    seen.add(group);
    items.forEach((li, i) => { li.classList.toggle("is-active", i === group); li.classList.toggle("is-done", seen.has(i) && i !== group); });
    if (count) count.textContent = String(group + 1).padStart(2, "0");
  };
  const check = () => {
    let doc;
    try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc || !doc.body) return;
    const visible = (sel) => [...doc.querySelectorAll(sel)].some((el) => el.getClientRects().length);
    const hit = cfg.rules.find((r) => visible(r.sel));
    show(hit ? hit.id : cfg.fallback);
  };
  show(cfg.fallback);
  setInterval(check, 400);
  // The app is laid out at a fixed width (1440 desktop, or a 393 phone) and scaled to fit its frame
  const fit = () => { if (view) view.style.setProperty("--fs", (view.clientWidth / Number(view.dataset.protoW || 1440)).toFixed(4)); };
  fit();
  addEventListener("resize", fit);
  const restart = $("[data-proto-restart]", demo);
  if (restart) restart.addEventListener("click", () => { seen.clear(); current = ""; frame.src = frame.src; });
});

/* ---------- Prototypes: a veil that says what this is, lifted with one click ---------- */
$$('iframe[src*="/app/"]').forEach((frame) => {
  const box = frame.parentElement;
  if (!box || box.querySelector(".proto-veil")) return;
  if (getComputedStyle(box).position === "static") box.style.position = "relative";
  const veil = document.createElement("button");
  veil.type = "button";
  veil.className = "proto-veil";
  veil.setAttribute("aria-label", t(`Start the interactive prototype: ${frame.title || "prototype"}`, `开始体验交互原型：${frame.title || "原型"}`));
  veil.innerHTML = `<span class="proto-veil__tag">${t("Interactive prototype", "交互原型")}</span><span class="proto-veil__btn"><svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M2 1.5v13L13 8z" fill="currentColor"/></svg>${t("Click to try it", "点击试玩")}</span><span class="proto-veil__note">${box.closest(".fin-browser") ? t("Click around like the real site", "像真实网站一样随便点") : t("Tap around like a real app", "像真实 App 一样随便点")}</span>`;
  veil.addEventListener("click", () => {
    veil.classList.add("is-gone");
    setTimeout(() => { veil.remove(); try { frame.focus({ preventScroll: true }); } catch (e) {} }, 450);
  });
  box.append(veil);
});

/* ---------- RECO demo: size the embedded phone to the screen ---------- */
$$(".reco-device--app").forEach((dev) => {
  const fit = () => dev.style.setProperty("--dev-s", (dev.getBoundingClientRect().height / 900).toFixed(4));
  fit();
  addEventListener("resize", fit);
});

/* ---------- RECO demo: switch the embedded app to a real in-browser AI ---------- */
$$("[data-reco-ai]").forEach((box) => {
  const demo = box.closest(".reco-demo") || document;
  const frame = $("iframe", demo);
  const btn = $(".reco-ai__btn", box), note = $(".reco-ai__note", box), bar = $(".reco-ai__bar", box);
  const tag = $("[data-reco-mode]", demo);
  if (!frame) return;
  if (!("gpu" in navigator)) {
    btn.disabled = true;
    note.textContent = t("Your browser doesn’t support WebGPU, so the simulated BoKnee stays on. Try desktop Chrome or Edge for the real model.", "你的浏览器不支持 WebGPU，所以继续使用模拟版 BoKnee。想体验真实模型，请用电脑版 Chrome 或 Edge。");
  }
  const send = (type) => frame.contentWindow?.postMessage({ source: "reco-page", type }, "*");
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = t("Loading…", "加载中…");
    bar.hidden = false;
    note.textContent = t("Downloading the model to your browser. You can keep chatting with the simulated BoKnee meanwhile.", "正在把模型下载到你的浏览器。等待期间可以继续和模拟版 BoKnee 聊天。");
    send("enable-ai");
  });
  addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow || e.data?.source !== "reco-app") return;
    const d = e.data;
    if (d.type === "ai-progress") {
      bar.firstElementChild.style.width = `${Math.round((d.progress || 0) * 100)}%`;
      btn.textContent = `${t("Loading…", "加载中…")} ${Math.round((d.progress || 0) * 100)}%`;
    } else if (d.type === "ai-ready") {
      bar.hidden = true;
      btn.textContent = t("Real AI on", "真实 AI 已开启");
      btn.classList.add("is-on");
      note.textContent = t("BoKnee now answers with Llama 3.2 1B, running on your device. Replies are generated live, so they won’t match the video word for word.", "BoKnee 现在由运行在你设备上的 Llama 3.2 1B 回答。回复是实时生成的，所以不会和视频里一字不差。");
      if (tag) { tag.textContent = t("Try it here · real AI, on your device", "在这里试试 · 真实 AI，跑在你的设备上"); tag.classList.add("reco-tag--live"); }
    } else if (d.type === "ai-error") {
      bar.hidden = true;
      btn.disabled = false;
      btn.textContent = t("Try again", "再试一次");
      note.textContent = t(`Couldn’t start the real model (${d.message}). The simulated BoKnee is still on.`, `真实模型没能启动（${d.message}）。模拟版 BoKnee 仍然可用。`);
    }
  });
});

/* ---------- Flipbook: a printed document you page through like a book ---------- */
$$("[data-flip]").forEach((flip) => {
  const book = $(".flip__book", flip);
  const n = +flip.dataset.pages;
  const base = flip.dataset.base;
  const [pw, ph] = (flip.dataset.size || "1600x1236").split("x");
  const pad = (i) => String(i).padStart(2, "0");
  const leaves = [];
  const imgs = [];
  for (let k = 0; k < Math.ceil(n / 2); k++) {
    const leaf = document.createElement("div");
    leaf.className = "flip__leaf";
    [2 * k + 1, 2 * k + 2].forEach((p, side) => {
      const face = document.createElement("div");
      face.className = `flip__face flip__face--${side ? "back" : "front"}`;
      if (p <= n) {
        const img = document.createElement("img");
        img.dataset.src = `${base}${pad(p)}.webp`;
        img.alt = `${flip.dataset.title || "Page"} — page ${p}`;
        img.dataset.label = t(`Page ${p} / ${n}`, `第 ${p} / ${n} 页`);
        img.width = pw; img.height = ph;
        img.decoding = "async";
        face.append(img);
        imgs[p] = img;
      }
      leaf.append(face);
    });
    book.append(leaf);
    leaves.push(leaf);
  }
  const L = leaves.length;
  const prevBtn = $(".flip__prev", flip), nextBtn = $(".flip__next", flip);
  const count = $(".flip__count", flip), range = $(".flip__range", flip);
  if (range) { range.max = L; }
  let cur = 0;
  // only fetch the pages around the open spread
  const load = () => {
    for (let p = Math.max(1, 2 * cur - 4); p <= Math.min(n, 2 * cur + 5); p++) {
      const img = imgs[p];
      if (img && !img.src) img.src = img.dataset.src;
    }
  };
  const paint = (moving = -1) => {
    leaves.forEach((leaf, k) => {
      const flipped = k < cur;
      leaf.classList.toggle("is-flipped", flipped);
      leaf.style.zIndex = k === moving ? L + 2 : flipped ? k + 1 : L - k;
    });
    flip.classList.toggle("is-start", cur === 0);
    flip.classList.toggle("is-end", cur === L);
    if (prevBtn) prevBtn.disabled = cur === 0;
    if (nextBtn) nextBtn.disabled = cur === L;
    if (range) range.value = cur;
    if (count) count.textContent = cur === 0 ? t("Cover", "封面") : cur === L ? t("Back cover", "封底") : t(`Pages ${2 * cur}–${Math.min(n, 2 * cur + 1)} / ${n}`, `第 ${2 * cur}–${Math.min(n, 2 * cur + 1)} / ${n} 页`);
    load();
  };
  let timer = 0;
  const go = (to) => {
    to = Math.max(0, Math.min(L, to));
    if (to === cur) return;
    // the leaf that turns rides above the others for the length of the turn
    const moving = to > cur ? cur : cur - 1;
    const jump = Math.abs(to - cur) > 1;
    cur = to;
    paint(jump ? -1 : moving);
    clearTimeout(timer);
    timer = setTimeout(() => paint(), 1000);
  };
  // drag a page over like a real one: the turning leaf follows the pointer, then settles
  let drag = null, dragged = false;
  book.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const leaf = e.target.closest(".flip__leaf");
    const k = leaves.indexOf(leaf);
    if (k !== cur && k !== cur - 1) return;
    drag = { leaf, k, fwd: k === cur, x0: e.clientX, w: leaf.offsetWidth, p: 0, id: e.pointerId };
    dragged = false;
  });
  addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!dragged && Math.abs(dx) < 6) return;
    if (!dragged) {
      dragged = true;
      drag.leaf.classList.add("is-dragging");
      drag.leaf.style.zIndex = L + 2;
      book.classList.add("is-dragging");
    }
    // a full turn is about one and a half page widths of travel
    drag.p = clamp((drag.fwd ? -dx : dx) / (drag.w * 1.5));
    const angle = drag.fwd ? -180 * drag.p : -180 * (1 - drag.p);
    drag.leaf.style.transform = `rotateY(${angle.toFixed(1)}deg)`;
    drag.leaf.style.setProperty("--bend", Math.sin(Math.PI * drag.p).toFixed(3));
  });
  const release = () => {
    if (!drag) return;
    const { leaf, fwd, p } = drag;
    drag = null;
    if (!dragged) return;
    leaf.classList.remove("is-dragging");
    book.classList.remove("is-dragging");
    leaf.style.transform = "";
    leaf.style.removeProperty("--bend");
    if (p > 0.3) go(cur + (fwd ? 1 : -1));
    else paint();
    setTimeout(() => { dragged = false; }, 50);
  };
  addEventListener("pointerup", release);
  addEventListener("pointercancel", release);
  leaves.forEach((leaf, k) => leaf.addEventListener("click", () => { if (!dragged) go(k < cur ? cur - 1 : cur + 1); }));
  // a small "Drag" label: pages can be pulled over
  book.dataset.cursorSize = "sm";
  book.dataset.cursor = "Drag";
  prevBtn?.addEventListener("click", () => go(cur - 1));
  nextBtn?.addEventListener("click", () => go(cur + 1));
  range?.addEventListener("input", () => go(+range.value));
  flip.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
  });
  $(".flip__zoom", flip)?.addEventListener("click", () => {
    const p = cur === L ? n : 2 * cur + 1 <= n ? 2 * cur + 1 : 2 * cur;
    window.__lightbox?.open(imgs[p]);
  });
  paint();
});

/* ---------- Lightbox: every showcase image opens full-screen and zooms ---------- */
(() => {
  const main = $(".case main") || $(".case");
  if (!main) return;
  // backgrounds, icons and the hero stay decorative
  // interactive pieces (buttons, Bandy blocks, demos) keep their own clicks
  const skip = ".c-hero, .vn__bg, .cine, .site-header, header, footer, .c-next, [aria-hidden='true'], button, [data-nozoom], [data-band], [data-builder], [data-rules], [data-xray], .bd-start";
  const zoomable = (img) => !img.closest(skip) && !/icon-|logo/.test(img.src) && (+img.getAttribute("width") || 999) >= 300;
  const imgs = $$("img", main).filter(zoomable);
  if (!imgs.length) return;

  const groupOf = (img) => {
    const own = "[data-deck], [data-flip], .gallery__track, [data-drag]";
    const box = img.closest(own) || img.closest("section") || main;
    return $$("img", box).filter(zoomable).filter((i) => box.matches(own) || !i.closest(own));
  };

  const lb = document.createElement("div");
  lb.className = "lb";
  lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-modal", "true");
  lb.setAttribute("aria-label", t("Image viewer", "图片查看器"));
  lb.innerHTML = `
    <div class="lb__stage"><img class="lb__img" alt=""></div>
    <button class="lb__btn lb__close" type="button" aria-label="Close">✕</button>
    <button class="lb__btn lb__prev" type="button" aria-label="${t("Previous image", "上一张")}">←</button>
    <button class="lb__btn lb__next" type="button" aria-label="${t("Next image", "下一张")}">→</button>
    <div class="lb__bar"><span class="lb__count"></span><span class="lb__cap"></span><span class="lb__hint">${t("Click or scroll to zoom", "点击或滚动缩放")}</span></div>`;
  document.body.append(lb);
  const stage = $(".lb__stage", lb), view = $(".lb__img", lb);
  let group = [], idx = 0, scale = 1, tx = 0, ty = 0, lastFocus = null;

  const apply = (anim = true) => {
    view.style.transition = anim ? "" : "none";
    view.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    lb.classList.toggle("is-zoomed", scale > 1.01);
  };
  // keep the zoomed image covering the screen instead of drifting off it
  const clampPan = () => {
    const w = view.offsetWidth * scale, h = view.offsetHeight * scale;
    const mx = Math.max(0, (w - innerWidth) / 2), my = Math.max(0, (h - innerHeight) / 2);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  };
  const maxScale = () => Math.max(2.5, (view.naturalWidth || 0) / Math.max(1, view.offsetWidth));
  const zoomAt = (next, cx, cy) => {
    next = Math.min(maxScale(), Math.max(1, next));
    // zoom around the pointer: keep the point under it fixed
    const ox = cx - innerWidth / 2, oy = cy - innerHeight / 2;
    tx = ox - (ox - tx) * (next / scale);
    ty = oy - (oy - ty) * (next / scale);
    scale = next;
    if (scale === 1) { tx = 0; ty = 0; }
    clampPan();
  };

  const show = (i) => {
    idx = (i + group.length) % group.length;
    const src = group[idx];
    scale = 1; tx = 0; ty = 0; apply(false);
    view.src = src.currentSrc || src.src || src.dataset.src;
    view.alt = src.alt || "";
    $(".lb__cap", lb).textContent = src.dataset.label || src.alt || "";
    $(".lb__count", lb).textContent = group.length > 1 ? `${String(idx + 1).padStart(2, "0")} / ${String(group.length).padStart(2, "0")}` : "";
    lb.classList.toggle("is-single", group.length < 2);
  };
  const open = (img) => {
    group = groupOf(img);
    // an image that isn't part of the page's showcase (a poster in an explorer) opens on its own
    if (!group.includes(img)) group = [img];
    lastFocus = document.activeElement;
    show(Math.max(0, group.indexOf(img)));
    lb.classList.add("is-open");
    document.documentElement.classList.add("lb-open");
    window.__lenis?.stop();
    $(".lb__close", lb).focus({ preventScroll: true });
  };
  const close = () => {
    lb.classList.remove("is-open");
    document.documentElement.classList.remove("lb-open");
    window.__lenis?.start();
    lastFocus?.focus?.({ preventScroll: true });
  };
  window.__lightbox = { open };

  $(".lb__close", lb).addEventListener("click", close);
  $(".lb__prev", lb).addEventListener("click", () => show(idx - 1));
  $(".lb__next", lb).addEventListener("click", () => show(idx + 1));
  addEventListener("keydown", (e) => {
    if (!lb.classList.contains("is-open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") show(idx + 1);
    else if (e.key === "ArrowLeft") show(idx - 1);
    else if (e.key === "+" || e.key === "=") { zoomAt(scale * 1.5, innerWidth / 2, innerHeight / 2); apply(); }
    else if (e.key === "-") { zoomAt(scale / 1.5, innerWidth / 2, innerHeight / 2); apply(); }
    else return;
    e.preventDefault();
  });
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(scale * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
    apply(false);
  }, { passive: false });

  // pointers: tap toggles zoom, drag pans, two fingers pinch; tapping the dark backdrop closes
  const pts = new Map();
  let start = null, pinch = null, moved = false;
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    start = { x: e.clientX, y: e.clientY, tx, ty, onImg: e.target === view };
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale };
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      zoomAt(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      moved = true; apply(false); return;
    }
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if (scale > 1 && moved) { tx = start.tx + dx; ty = start.ty + dy; clampPan(); apply(false); }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size || moved) return;
    if (!start.onImg) { close(); return; }
    if (scale > 1.01) { scale = 1; tx = 0; ty = 0; }
    else zoomAt(Math.min(maxScale(), 2.5), e.clientX, e.clientY);
    apply();
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); pinch = null; });
  addEventListener("resize", () => { if (lb.classList.contains("is-open")) { clampPan(); apply(false); } });

  // hook the page images up
  // in drag galleries a real drag only scrolls (the drag handler swallows that click); a still click opens that image
  const dragBox = ".gallery__track, [data-drag]";
  imgs.forEach((img) => {
    if (img.closest("[data-deck], [data-flip]")) return; // decks and books open from their own button
    if (img.closest("[data-drag]")) return; // a single long picture you drag through opens from its Enlarge button
    img.classList.add("is-zoomable");
    if (img.closest(dragBox)) img.dataset.cursor = "Drag";
    else if (!img.closest("[data-cursor]")) img.dataset.cursor = "View";
    img.addEventListener("click", (e) => { e.preventDefault(); open(img); });
  });
  $$(dragBox).forEach((el) => { if (!el.dataset.cursor) el.dataset.cursor = "Drag"; });
  $$("[data-drag]").forEach((box) => {
    const img = $("img", box);
    if (!img) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gallery__zoom";
    btn.setAttribute("aria-label", t("Enlarge the picture", "放大图片"));
    btn.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${t("Enlarge", "放大")}</span>`;
    btn.addEventListener("click", () => open(img));
    const bar = document.createElement("div"); bar.className = "gallery__bar wrap"; bar.append(btn);
    box.after(bar);
  });
  $$("[data-deck]").forEach((deck) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "deck__zoom";
    btn.setAttribute("aria-label", t("Enlarge this sheet", "放大这张"));
    btn.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${t("Enlarge", "放大")}</span>`;
    btn.addEventListener("click", () => {
      const front = $$("img", deck).find((i) => i.style.getPropertyValue("--k").trim() === "0") || $("img", deck);
      open(front);
    });
    $(".deck__bar", deck).append(btn);
  });
})();

/* ---------- Cursor: one dot that stands in for the system pointer and grows into a label ---------- */
const CURSOR_ZH = { View: "查看", Drag: "拖动", Next: "下一张", Prev: "上一张", Play: "播放", Open: "打开" };
// a small inverting dot everywhere; over links it swells, over [data-cursor] (View, Drag, Next…) it grows and fills
// with colour, showing the label. One element, so nothing ever floats in from somewhere else.
if (!reduceMotion && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const dot = document.createElement("div");
  dot.className = "dot-cursor is-hidden";
  dot.setAttribute("aria-hidden", "true");
  dot.innerHTML = "<span></span>";
  const text = dot.firstChild;
  document.body.append(dot);
  const root = document.documentElement;
  root.classList.add("has-dot");
  let x = -100, y = -100, cx = x, cy = y, seen = false, away = true, label = null, leaveT = 0;
  const setLabel = (host) => {
    clearTimeout(leaveT); leaveT = 0;
    if (host) {
      const label = t(host.dataset.cursor, CURSOR_ZH[host.dataset.cursor] || host.dataset.cursor);
      if (text.textContent !== label) text.textContent = label;
      // links can tint it (e.g. "Next" takes the next project's colour)
      const cs = getComputedStyle(host);
      dot.style.setProperty("--cursor-bg", cs.getPropertyValue("--next-bg").trim() || "");
      dot.style.setProperty("--cursor-fg", cs.getPropertyValue("--next-fg").trim() || "");
      dot.classList.toggle("is-sm", host.dataset.cursorSize === "sm");
      dot.classList.toggle("is-wide", host.dataset.cursor.length > 6);
      dot.classList.add("is-label");
    } else dot.classList.remove("is-label", "is-sm", "is-wide");
    label = host;
  };
  // what's under the pointer decides the look; run on every move, on enter/leave of elements, and while the page scrolls
  const update = (t) => {
    if (!t || !t.closest) return;
    const host = t.closest("[data-cursor]");
    if (host) setLabel(host);
    // crossing the small gaps in a grid: hold the label a moment so it doesn't blink
    // in a narrow gap of a grid (another label target within reach) hold it briefly; anywhere else let go at once
    else if (label) {
      const near = [[30, 0], [-30, 0], [0, 30], [0, -30]].some(([dx, dy]) => { const e = document.elementFromPoint(x + dx, y + dy); return e && e.closest && e.closest("[data-cursor]"); });
      if (!near) setLabel(null);
      else if (!leaveT) leaveT = setTimeout(() => { leaveT = 0; setLabel(null); }, 120);
    }
    // big display type gets the home-page treatment: a large circle that inverts the letters under it
    const big = !host && !!t.closest(".ch, .c-hero__marquee, .c-head, .c-next__title, .reco-demo__title, .c-title, h1, h2:not(.c-kicker)");
    dot.classList.toggle("is-xl", big);
    dot.classList.toggle("is-big", !host && !big && !!t.closest("a, button, label, select, summary, [role=button], .play__chips li, [data-talk] .talk__box"));
    dot.classList.toggle("is-off", !!t.closest("input, textarea, iframe, [contenteditable]"));
  };
  const at = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    x = e.clientX; y = e.clientY; away = false;
    if (!seen) { cx = x; cy = y; seen = true; }
    update(e.target);
  };
  // a new page can't know where the pointer is until it moves, so carry the last spot over from the previous page
  try {
    const last = JSON.parse(sessionStorage.getItem("dot-xy") || "null");
    if (last && last.w === innerWidth) { x = cx = last.x; y = cy = last.y; seen = true; away = false; requestAnimationFrame(() => update(document.elementFromPoint(x, y))); }
  } catch (e) {}
  const save = () => { try { if (seen) sessionStorage.setItem("dot-xy", JSON.stringify({ x, y, w: innerWidth })); } catch (e) {} };
  addEventListener("pagehide", save);
  addEventListener("pointerdown", save, { passive: true });
  addEventListener("pointermove", at, { passive: true });
  // fires without any movement when the page loads or the layout shifts under a still pointer
  addEventListener("pointerover", at, { passive: true });
  addEventListener("mouseover", at, { passive: true });
  // scrolling moves the page under a still pointer: re-read what's under it each frame, no wiggle needed
  let scrollQ = false;
  const reread = () => { scrollQ = false; if (seen && !away) update(document.elementFromPoint(x, y)); };
  addEventListener("scroll", () => { if (!scrollQ) { scrollQ = true; requestAnimationFrame(reread); } }, { passive: true });
  addEventListener("wheel", () => { if (!scrollQ) { scrollQ = true; requestAnimationFrame(reread); } }, { passive: true });
  document.addEventListener("pointerleave", () => { away = true; });
  addEventListener("blur", () => { away = true; });
  const loop = () => {
    cx += (x - cx) * 0.38; cy += (y - cy) * 0.38;
    dot.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
    if (away !== dot.classList.contains("is-hidden")) dot.classList.toggle("is-hidden", away);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ---------- Magnetic buttons ---------- */
if (!reduceMotion && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  $$(".pill, .menu-btn").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) * 0.18;
      const dy = (e.clientY - r.top - r.height / 2) * 0.28;
      el.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
    });
    el.addEventListener("pointerleave", () => { el.style.translate = ""; });
  });
}

/* ---------- Background preloading: while the visitor reads, fetch what comes next ----------
   1. This page's lazy images, in reading order, three at a time.
   2. Its off-screen videos and the embedded prototype, as low-priority prefetches.
   3. The next project (or, on the home page, every project): page, hero poster, then hero video.
   Skipped on data-saver and 2G connections. */
(() => {
  const conn = navigator.connection || {};
  if (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || "")) return;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  const root = location.pathname.includes("/projects/") ? "../" : "";
  const HERO = {
    fitfido: ["hero-poster.webp?v=4", "hero.mp4?v=5"], brilliant: ["hero-poster.webp", "hero.mp4"], swifthome: ["hero-poster.webp?v=3", "hero.mp4?v=4"],
    safedining: ["hero-poster.webp", "hero.mp4?v=5"], reco: ["hero-poster.webp?v=2", "hero.mp4?v=13"], moment: ["hero-poster.webp", "hero.mp4?v=2"], zenbloom: ["hero-poster.webp?v=4", "hero.mp4?v=4"],
    finra: [], kohler: ["hero-poster.webp", "hero.mp4"], vipshop: ["hero-poster.webp"], bandy: ["hero-poster.webp?v=7", "hero.mp4?v=7"],
  };
  const done = new Set();
  const prefetch = (href, as) => {
    if (!href || done.has(href)) return; done.add(href);
    const l = document.createElement("link"); l.rel = "prefetch"; l.href = href; if (as) l.as = as;
    document.head.append(l);
  };
  const warmProject = (slug, withVideo) => {
    const h = HERO[slug]; if (!h) return;
    prefetch(`${root}projects/${slug}.html`, "document");
    if (h[0]) prefetch(`${root}assets/projects/${slug}/${h[0]}`, "image");
    if (withVideo && h[1]) prefetch(`${root}assets/projects/${slug}/${h[1]}`, "video");
  };
  const slugOf = (a) => ((a.getAttribute("href") || "").match(/([a-z]+)\.html/) || [])[1];

  const nextSteps = () => {
    // off-screen videos and embedded prototypes on this page
    $$("video source[data-src]").forEach((s) => prefetch(s.dataset.src, "video"));
    $$("iframe[data-proto-frame][loading=lazy]").forEach((f) => { f.loading = "eager"; });
    // the next project, or every project from the home page
    const next = $(".c-next");
    if (next) warmProject(slugOf(next), true);
    else $$('a[href*="projects/"]').map(slugOf).filter((s, i, a) => s && a.indexOf(s) === i).forEach((s, i) => warmProject(s, i < 2));
  };
  // hovering or touching a project link warms its hero video right away
  document.addEventListener("pointerover", (e) => { const a = e.target.closest && e.target.closest('a[href*=".html"]'); const s = a && slugOf(a); if (s && HERO[s]) warmProject(s, true); }, { passive: true });
  document.addEventListener("touchstart", (e) => { const a = e.target.closest && e.target.closest('a[href*=".html"]'); const s = a && slugOf(a); if (s && HERO[s]) warmProject(s, true); }, { passive: true });

  const start = () => idle(() => {
    const imgs = $$('img[loading="lazy"]');
    let i = 0, active = 0, finished = false;
    const pump = () => {
      while (active < 3 && i < imgs.length) {
        const im = imgs[i++];
        if (im.complete && im.naturalWidth) continue;
        active++;
        const settle = () => { active--; pump(); };
        im.addEventListener("load", settle, { once: true }); im.addEventListener("error", settle, { once: true });
        im.loading = "eager";
      }
      if (!finished && i >= imgs.length && active === 0) { finished = true; idle(nextSteps, { timeout: 3000 }); }
    };
    pump();
  }, { timeout: 2500 });
  if (document.readyState === "complete") start(); else addEventListener("load", start, { once: true });
})();

/* ---------- Poster explorer: each note zooms the poster to the part it explains ---------- */
$$("[data-poster]").forEach((box) => {
  const tabs = $$(".px-tab", box), sets = $$(".px-set", box), views = $$(".px-view", box);
  let cur = 0;
  const focus = (n) => {
    const view = views[cur], canvas = $(".px-canvas", view);
    const note = n ? $(`.px-note[data-n="${n}"]`, sets[cur]) : null;
    $$(".px-note", sets[cur]).forEach((el) => el.classList.toggle("is-on", el === note));
    $$(".px-note", sets[cur]).forEach((el) => el.setAttribute("aria-pressed", el === note));
    $$(".px-pin", view).forEach((el) => el.classList.toggle("is-on", el.dataset.n === String(n)));
    box.classList.toggle("is-zoomed", !!note);
    // a note marked data-live zooms into its part of the poster, which then comes alive as the interactive version
    box.classList.toggle("is-live", !!note && note.hasAttribute("data-live"));
    if (!note) { canvas.style.transform = ""; canvas.style.setProperty("--s", 1); return; }
    const [x, y, w, h] = note.dataset.box.split(",").map(Number);
    // zoom only as far as the whole area still fits, centred on it
    const s = Math.min(3.2, Math.max(1, 0.96 / Math.max(w, h)));
    const tx = Math.min(0, Math.max(1 - s, 0.5 - (x + w / 2) * s));
    const ty = Math.min(0, Math.max(1 - s, 0.5 - (y + h / 2) * s));
    canvas.style.setProperty("--s", s);
    canvas.style.transform = `translate(${(tx * 100).toFixed(2)}%, ${(ty * 100).toFixed(2)}%) scale(${s.toFixed(3)})`;
  };
  const show = (k) => {
    focus(null);
    cur = k;
    tabs.forEach((t, i) => t.setAttribute("aria-selected", i === k));
    sets.forEach((el, i) => { el.hidden = i !== k; });
    views.forEach((v, i) => v.classList.toggle("is-active", i === k));
  };
  tabs.forEach((t, i) => t.addEventListener("click", () => show(i)));
  $$(".px-note", box).forEach((el) => el.addEventListener("click", () => focus(el.classList.contains("is-on") ? null : el.dataset.n)));
  $$(".px-pin", box).forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); focus(el.dataset.n); }));
  $(".px-reset", box).addEventListener("click", () => focus(null));
  $(".px-full", box)?.addEventListener("click", (e) => { e.stopPropagation(); window.__lightbox?.open($("img", views[cur])); });
  // clicking the whole poster jumps to the note whose area was clicked; clicking a zoomed poster steps back out
  views.forEach((v) => v.addEventListener("click", (e) => {
    if (box.classList.contains("is-zoomed")) return focus(null);
    const r = v.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const hit = $$(".px-note", sets[cur]).map((el) => [el, el.dataset.box.split(",").map(Number)])
      .filter(([, [x, y, w, h]]) => px >= x && px <= x + w && py >= y && py <= y + h)
      .sort((a, b) => a[1][2] * a[1][3] - b[1][2] * b[1][3])[0];
    if (hit) focus(hit[0].dataset.n);
  }));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && box.classList.contains("is-zoomed")) focus(null); });
});

// the sticky note on the workshops tab lands at the far end of its own label, whatever the language
$$(".ti__fly").forEach((el) => {
  const btn = el.closest("button");
  const set = () => el.style.setProperty("--land", `${btn.offsetWidth - 34}px`);
  set();
  btn.addEventListener("mouseenter", set);
});

// research folders: switching tabs drops the whole folder a touch and lifts the new sheet out, tab and body together
$$(".sd-research [data-tabs]").forEach((sw) => {
  sw.addEventListener("click", (e) => {
    if (!e.target.closest('[role="tab"]')) return;
    sw.classList.remove("is-swap");
    void sw.offsetWidth;
    sw.classList.add("is-swap");
  });
  sw.addEventListener("animationend", (e) => { if (e.target.matches(".switcher__stage")) sw.classList.remove("is-swap"); });
});

// interview photo: the interviewee answers in turn, one theme at a time; the theme chips pick a line
$$("[data-talk]").forEach((talk) => {
  const panel = talk.closest(".switcher__panel");
  const lines = $$(".rs-talk__a", talk), chips = $$(".rs-themes [data-say]", panel);
  let cur = 0, timer = 0;
  const say = (k) => {
    cur = k;
    lines.forEach((el, i) => el.classList.toggle("is-on", i === k));
    chips.forEach((el, i) => el.classList.toggle("is-on", i === k));
  };
  // the lines only start turning once the photo is properly on screen, and begin from the first one
  let seen = false, visible = false;
  const loop = () => { clearInterval(timer); if (!reduceMotion) timer = setInterval(() => { if (visible && panel.classList.contains("is-active")) say((cur + 1) % lines.length); }, 3600); };
  chips.forEach((el, i) => el.addEventListener("click", () => { say(i); loop(); }));
  talk.addEventListener("mouseenter", () => clearInterval(timer));
  talk.addEventListener("mouseleave", loop);
  say(0);
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && !seen) { seen = true; say(0); loop(); }
  }, { threshold: 0.6 }).observe(talk);
});

// journey map: Agnes's dinner out, played through on the poster itself. She and her friend meet, pick a place,
// talk to the host, sit, order, wait, eat, find the allergen and leave a review, while the poster's own people
// act out their parts around them. The stage on show is in full colour; the rest waits, faint and still.
// One clock drives everything, so hovering a stage runs the story back or forward to it.
$$("[data-jm]").forEach((box) => {
  const START = [0, 7, 14, 27, 35, 50, 64], END = 80;
  const SEEK = [5, 11, 20, 31, 42.5, 57.6, 70];
  const view = $(".jm-view", box), pan = $(".jm-pan", box);
  const tabs = $$(".jm-stage", box), bars = $$(".jm-bar", box), says = $$(".jm-say", box);
  const wipes = $$(".jm-wipe", box);
  const els = $$(".jm-el", box).map((g) => ({ g, s: +g.dataset.s, i: +g.dataset.i }));
  const partsOf = (g) => Object.fromEntries($$(".jm-part", g).map((p) => [p.dataset.p, { g: p, o: p.dataset.o.split(",").map(Number) }]));
  const figs = $$(".jm-fig", box).map((g) => ({ g, n: g.dataset.fig, s: +g.dataset.s, mv: $(".jm-mv", g), w: +$("image", g).getAttribute("width"), h: +$("image", g).getAttribute("height"), parts: partsOf(g) }));
  const cast = Object.fromEntries($$(".jm-cast", box).map((g) => [g.dataset.c, { g, in: $(".jm-cast__in", g), anger: $(".jm-anger", g), alarm: $(".jm-alarm", g), poses: Object.fromEntries($$(".jm-pose", g).map((p) => [p.dataset.pose, { g: p, parts: partsOf(p) }])) }]));
  const table = $(".jm-table", box);
  const labels = $$(".jm-label", box).map((el) => Object.assign(el, { _t: +el.dataset.t }));
  const fx = Object.fromEntries($$(".jm-x", box).map((g) => [g.dataset.fx, g]));
  const k01 = (v) => clamp(v, 0, 1);
  const smooth = (v) => { v = k01(v); return v * v * (3 - 2 * v); };
  const sin = Math.sin;
  const stageAt = (t) => { let s = 0; START.forEach((v, i) => { if (t >= v) s = i; }); return s; };
  const endOf = (s) => (s + 1 < START.length ? START[s + 1] : END);
  const SC = 0.4; // cast drawing scale, poster pixels per image pixel

  // ---- the story cast: where they stand [t, x, y], which drawing they are in, and which way they face ----
  const WAY = {
    agnes: [[0, 40, 1460], [0.3, 40, 1460], [3.3, 230, 1332], [14, 230, 1332], [17.6, 900, 1185], [23.6, 900, 1185], [24.3, 1000, 1060], [25.4, 1300, 1040], [26.1, 1455, 1065], [27.1, 1470, 1245], [27.3, 1488, 1250],
      [62, 1488, 1250], [62.3, 1520, 1225], [63.3, 1600, 1040], [64, 1740, 890], [66.6, 2660, 640], [END, 2660, 640]],
    friend: [[0, -60, 1520], [1.5, -60, 1520], [4.5, 142, 1392], [14.4, 142, 1392], [18.2, 822, 1228], [23.9, 822, 1228], [24.6, 960, 1080], [25.8, 1250, 1030], [26.9, 1640, 1035], [27.8, 1680, 1215], [28, 1685, 1222],
      [62.8, 1685, 1222], [63.9, 1700, 1050], [64.6, 1820, 880], [68, 2560, 712], [END, 2560, 712]],
    // the host waves them in and steps out of their way
    host: [[0, 1150, 1100], [22.9, 1150, 1100], [24, 1060, 1260], [END, 1060, 1260]],
    // the waitress: down to their table, up to the pass with the order, back down with the plate
    waitress: [[0, 1557, 858], [27.4, 1557, 858], [29.8, 1560, 1100], [34.8, 1560, 1100], [38.2, 1420, 760], [50.4, 1420, 760], [53, 1560, 1100], [END, 1560, 1100]],
    // the chef: behind the pass, to the stove, back with the plate
    chef: [[0, 1495, 662], [43.4, 1495, 662], [45.2, 1645, 560], [48, 1645, 560], [49.4, 1495, 662], [END, 1495, 662]],
    // the supplier carries the crate in from the label photo to the store
    supplier: [[0, 2275, 560], [40.7, 2275, 560], [43.2, 2045, 588], [END, 2045, 588]],
  };
  const POSE = {
    agnes: [[0, "a-walk"], [3.3, "a-talk"], [7.6, "a-phone"], [14, "a-walk"], [17.6, "a-talk"], [23.6, "a-walk"], [26.1, "a-front"], [27.2, "a-menu"], [54.2, "a-eat"], [56.5, "a-recoil"], [62, "a-walk"], [66.7, "a-review"]],
    friend: [[0, "f-walk"], [4.5, "f-talk"], [14.4, "f-walk"], [18.2, "f-talk"], [23.9, "f-walk"], [26.9, "f-front"], [27.9, "f-sit"], [62.8, "f-walk"], [68.1, "f-talk"]],
    host: [[0, "host"]],
    waitress: [[0, "w-write"], [27.4, "w-walk"], [29.8, "w-write"], [34.8, "w-back"], [41.2, "w-write"], [49.2, "w-back"], [50.4, "w-carry"], [53.6, "w-write"], [57.4, "w-sorry"]],
    chef: [[0, "k-stand"], [43.4, "k-back"], [45.2, "k-cook"], [48, "k-carry"], [50.4, "k-stand"]],
    supplier: [[0, "supplier"]],
  };
  // 1 = as drawn, -1 = mirrored; a turn takes a quarter second
  const FACE = {
    agnes: [[0, 1], [17.6, -1], [23.6, 1]],
    friend: [[0, 1], [4.5, -1], [14.4, 1], [18.2, -1], [23.9, 1], [68.1, -1]],
    host: [[0, 1]],
    waitress: [[0, 1], [34.8, -1], [38.2, 1], [50.4, -1], [53, 1]],
    chef: [[0, 1]],
    supplier: [[0, 1]],
  };
  const SHOW = { agnes: [0, END], friend: [1.4, END], host: [13.4, 30.5], waitress: [0, END], chef: [0, END], supplier: [40.6, 50.4] };
  // the waitress and the chef belong to the poster: faint until their part of the story, faint again after it
  const LIT = { waitress: [27, 66], chef: [38, 51.5] };
  const pathAt = (P, t) => {
    for (let i = 0; i < P.length - 1; i++) {
      const [t0, x0, y0] = P[i], [t1, x1, y1] = P[i + 1];
      if (t <= t1) { const f = k01((t - t0) / (t1 - t0 || 1)); const jump = t1 - t0 < 0.2; const moving = !jump && (x1 !== x0 || y1 !== y0) && f > 0 && f < 1; return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, moving, ease: moving ? Math.min(1, f * 5, (1 - f) * 5) : 0 }; }
    }
    const l = P[P.length - 1]; return { x: l[1], y: l[2], moving: false, ease: 0 };
  };
  // the drawing in use, the one before it and how far the cross-fade between them has got
  const poseAt = (list, t) => { let k = list[0][1], prev = k, at = -9; for (const [a, n] of list) if (t >= a) { prev = k; k = n; at = a; } return { k, prev, f: smooth((t - at) / 0.3) }; };
  const faceAt = (list, t) => { let v = list[0][1], prev = v, at = -9; for (const [a, n] of list) if (t >= a) { prev = v; v = n; at = a; } return prev + (v - prev) * smooth((t - at) / 0.25); };

  // ---- the poster's own people: their acting, l = seconds into their stage ----
  // people glide along their path in their stride pose, rising and settling once per step
  const bob = (at, amp) => (sin(t * 4.6) ** 2) * amp * at.ease;
  const react = () => smooth((t - 56.9) / 0.3) * (1 - smooth((t - 60.6) / 0.5));
  const ACT = {
    hand: { mv: (l) => [0, sin(l * 3) * 3, sin(l * 1.5) * 2.5] },
    bar: { tender: (l) => -3 - sin(l * 2.2) * 3, guest: (l) => sin(l * 1.6) * 2 },
    // the waitress passes the order on, then the chef takes it in
    // the family at the next table turns to look when Agnes recoils
    group: { waitress: (l) => sin(l * 6) * 1.6, kid: (l) => Math.max(0, sin(l * 3.2)) * 4 * (1 - react()) - 12 * react(), man: (l) => Math.max(0, sin(l * 2.7 + 1)) * 3.5 * (1 - react()) - 10 * react() },
    waiter: { arm: (l) => { const q = k01((l - 5) / 1.2) * (1 - k01((l - 8) / 1)); return -9 * q + sin(l * 2) * 1.2; } },
    rate: { her: (l) => sin(l * 3.1) * 2.6, him: (l) => sin(l * 2.2 + 2) * 2.2 },
  };
  const node = (x, y, ox, oy) => [(x - ox) / 1.158, (y - oy) / 1.158];
  const MOVED = {};
  // the cooks and store staff drawn into the poster itself, which speech should not cover
  const DRAWN = [[1590, 450, 1650, 535], [1740, 505, 1795, 590], [1910, 385, 1970, 495], [1985, 415, 2040, 515]];

  // ---- the poster's emotion curve, lit up to where Agnes is ----
  const mood = $(".jm-mood", box), mdot = $(".jm-mood__dot", box), mhalo = $(".jm-mood__halo", box), mgrad = $("#jm-mood-g", box);
  const MP = mood.dataset.pts.split(" | ").map((run) => run.split(" ").map((v) => v.split(",").map(Number)));
  const MOOD = [[0, 87], [4, 160], [7, 280], [11, 440], [13.4, 580], [14, 637], [14.3, 750], [17.6, 890], [22, 1096], [27, 1240], [31, 1440], [35, 1600], [38.4, 1690], [47, 1956], [50, 2100], [54.4, 2220], [57.4, 2470], [63.6, 2507], [64, 2590], [72, 2800], [END, 2860]];
  const moodX = (t) => { for (let i = 0; i < MOOD.length - 1; i++) { const [t0, x0] = MOOD[i], [t1, x1] = MOOD[i + 1]; if (t <= t1) return x0 + (x1 - x0) * smooth((t - t0) / (t1 - t0)); } return MOOD[MOOD.length - 1][1]; };
  const drawMood = () => {
    const mx = moodX(t);
    // everything left of the dot shows the poster's curve and its colour; the rest is still blank road
    mgrad.setAttribute("x1", mx - 26); mgrad.setAttribute("x2", mx + 4);
    let at = MP[0][0];
    for (const run of MP) {
      if (mx < run[0][0]) break;
      at = run[run.length - 1];
      for (let i = 1; i < run.length; i++) if (run[i][0] >= mx) { const [xa, ya] = run[i - 1], [xb, yb] = run[i]; at = [mx, ya + ((yb - ya) * (mx - xa)) / (xb - xa || 1)]; break; }
      if (at[0] === mx) break;
    }
    for (const c of [mdot, mhalo]) { c.setAttribute("cx", at[0]); c.setAttribute("cy", at[1]); }
    // the low point throbs
    const low = t > 56.6 && t < 62 ? 1 : 0;
    mhalo.setAttribute("r", 16 + (low ? 10 + sin(t * 9) * 6 : sin(t * 3) * 3));
    mood.dataset.low = low;
  };

  const svg = $(".jm-svg", box), counter = $(".jm-counter", box), fxStart = $(".jm-x", box);
  for (const F of figs) { const v = F.g.getAttribute("transform").match(/matrix\(([^)]+)\)/)[1].split(/[ ,]+/).map(Number); F.y = v[5] + v[3] * F.h; }
  let order = "";
  const sortDepth = () => {
    const list = figs.map((F) => [F.g, F.y]).concat([[table, 1200], [counter, 740]], Object.values(cast).map((C) => [C.g, C.y]));
    list.sort((a, b) => a[1] - b[1]);
    const key = list.map((e) => e[1].toFixed(0)).join();
    if (key === order) return;
    order = key;
    for (const [el] of list) svg.insertBefore(el, fxStart);
  };
  const bodyRects = () => {
    const pr = pan.getBoundingClientRect(), list = [];
    // measure the drawing in use, not the whole group, which also holds the hidden marks above their heads
    for (const C of Object.values(cast)) if (+C.g.style.opacity > 0.3) { const P = Object.values(C.poses).find((q) => q.g.style.display !== "none" && +q.g.style.opacity > 0.5); list.push((P ? P.g : C.g).getBoundingClientRect()); }
    for (const F of figs) if (F.g.style.display !== "none" && +F.g.style.opacity > 0.5) list.push(F.mv.getBoundingClientRect());
    const sc = pr.width / 3036;
    // the cooks and store staff drawn into the poster itself
    return list.map((r) => [r.left - pr.left + r.width * 0.18, r.top - pr.top + r.height * 0.06, r.right - pr.left - r.width * 0.18, r.bottom - pr.top]).concat(DRAWN.map((q) => q.map((v) => v * sc)));
  };

  let t = 0, last = performance.now(), hold = null, hover = false, raf = 0, live = false, cur = -1;
  const render = () => {
    const st = stageAt(t);
    pan.style.opacity = t > END - 0.9 ? 1 - (t - (END - 0.9)) / 0.9 : 1;
    for (const r of wipes) r.setAttribute("width", 3100);
    const focus = (s, d = 0) => smooth((t - START[s] - d) / 0.8) * (1 - smooth((t - endOf(s) + (s === START.length - 1 ? -9 : 0)) / 0.8));
    for (const e of els) e.g.style.opacity = focus(e.s, e.i * 0.15);
    drawMood();
    for (const el of labels) el.style.opacity = smooth((t - el._t) / 0.6);
    for (const F of figs) {
      const M = MOVED[F.n];
      if (/^(couple|reader|board|boh)$/.test(F.n)) { F.g.style.display = "none"; continue; }
      if (F.n === "tray") { F.g.style.opacity = 0.26; continue; }
      if (M) {
        const lit = smooth((t - M.lit[0]) / 0.5) * (1 - smooth((t - M.lit[1]) / 0.6));
        F.g.style.opacity = M.gone && t > M.gone ? 1 - smooth((t - M.gone) / 0.4)
          : M.appear && t < M.appear ? 0.26 * (1 - smooth((t - M.appear + 0.3) / 0.3))
          : M.appear ? 0.26 + 0.74 * lit * smooth((t - M.appear) / 0.4) : 0.26 + 0.74 * lit;
        const home = M.appear ? t < M.appear : t < M.way[0][0];
        const at = home ? { x: M.home[0], y: M.home[1], ease: 0 } : pathAt(M.way, t), [dx, dy] = node(at.x, at.y, M.home[0], M.home[1]);
        const sx = faceAt(M.face, t);
        const hop = M.hop && t > M.hop && t < M.hop + 0.35 ? sin(((t - M.hop) / 0.35) * Math.PI) * 10 : 0;
        const bow = M.bow ? -8 * smooth((t - M.bow[0]) / 0.4) * (1 - smooth((t - M.bow[1] + 0.4) / 0.4)) : 0;
        F.mv.setAttribute("transform", `translate(${dx} ${dy - bob(at, 3) - hop}) translate(${F.w / 2} ${F.h}) rotate(${bow}) scale(${sx} 1) translate(${-F.w / 2} ${-F.h})`);
        const P = F.parts;
        if (P.pen) P.pen.g.setAttribute("transform", t > M.pen[0] && t < M.pen[1] ? `rotate(${sin(t * 13) * 4} ${P.pen.o})` : "");
        continue;
      }
      F.g.style.opacity = 0.26 + 0.74 * focus(F.s, 0.2);
      const l = clamp(t - START[F.s], 0, endOf(F.s) - START[F.s]);
      const A = ACT[F.n] || {};
      const [dx, dy, r] = A.mv ? A.mv(l) : [0, 0, 0];
      F.mv.setAttribute("transform", dx || dy || r ? `translate(${dx} ${dy}) rotate(${r || 0} ${F.w / 2} ${F.h})` : "");
      for (const [pn, P] of Object.entries(F.parts)) { const v = A[pn] ? A[pn](l) : 0; P.g.setAttribute("transform", v ? `rotate(${v} ${P.o[0]} ${P.o[1]})` : ""); }
    }
    // the table is theirs from the moment they sit down
    table.style.opacity = 0.26 + 0.74 * smooth((t - 26.6) / 0.6) * (1 - smooth((t - 63) / 0.6));
    // the story cast
    for (const [who, C] of Object.entries(cast)) {
      const [s0, s1] = SHOW[who];
      const vis = t > s0 && t < s1;
      const L = LIT[who];
      C.g.style.opacity = !vis ? 0 : L ? 0.26 + 0.74 * smooth((t - L[0]) / 0.5) * (1 - smooth((t - L[1]) / 0.6)) : smooth((t - s0) / 0.4) * smooth((s1 - t) / 0.4);
      const at = pathAt(WAY[who], t), p = poseAt(POSE[who], t);
      C.y = at.y;
      // storming out: faster, leaning into it
      const mad = who === "agnes" && t > 62 && t < 66.8;
      C.g.setAttribute("transform", `translate(${at.x} ${at.y - bob(at, mad ? 10 : 7)}) scale(${SC})`);
      for (const [pk, P] of Object.entries(C.poses)) {
        const o = pk === p.k ? p.f : pk === p.prev && p.f < 1 ? 1 - p.f : 0;
        P.g.style.display = o > 0 ? "" : "none";
        P.g.style.opacity = o;
      }
      const sx = faceAt(FACE[who], t);
      // a small shake when she finds the allergen
      const shake = who === "agnes" && t > 56.5 && t < 57.9 ? sin(t * 60) * 4 : 0;
      C.in.setAttribute("transform", `translate(${shake} 0) scale(${sx} 1)${mad ? " rotate(4)" : ""}`);
      // the waitress starts when Agnes recoils
      if (C.alarm) { const q = smooth((t - 56.9) / 0.2) * (1 - smooth((t - 59) / 0.4)); C.alarm.style.opacity = q; C.in.setAttribute("transform", `translate(0 ${t > 57 && t < 57.35 ? -sin(((t - 57) / 0.35) * Math.PI) * 30 : 0}) scale(${sx} 1)`); }
      if (C.anger) { C.anger.style.opacity = t > 62.1 && t < 67.4 ? smooth((t - 62.1) / 0.3) * (1 - smooth((t - 67) / 0.4)) : 0; C.anger.setAttribute("transform", `translate(105 -470) scale(${1.4 + sin(t * 7) * 0.15})`); }
    }
    sortDepth();
    // speech, pinned above whoever is talking and kept inside the picture
    const pw = pan.getBoundingClientRect().width, sc = pw / 3036, ph = pan.getBoundingClientRect().height;
    let bodies = null;
    const placed = [];
    // lines already on screen keep their spot; new ones are placed around them
    for (const el of [...says].sort((a, b) => !!b._off - !!a._off)) {
      const t0 = +el.dataset.t0, t1 = +el.dataset.t1, on = t > t0 && t < t1;
      el.style.opacity = on ? smooth((t - t0) / 0.25) * smooth((t1 - t) / 0.25) : 0;
      if (!on) { el._off = null; continue; }
      const w = el.dataset.who;
      let x, y;
      if (MOVED[w]) { const a = pathAt(MOVED[w].way, t); x = a.x; y = a.y - 270; }
      else { const a = pathAt(WAY[w], t); x = a.x; y = a.y - (/menu|eat|recoil|f-sit/.test(poseAt(POSE[w], t).k) ? 195 : 232); }
      const bw = el.offsetWidth, bh = el.offsetHeight;
      const place = (dx, dy) => [clamp(x * sc + dx, bw / 2 + 8, pw - bw / 2 - 8), clamp(y * sc - dy, bh + 12, ph)];
      if (!el._off) {
        // when a line starts, try spots beside and above the speaker and keep the one that hides the fewest people
        // ...and that does not land on another line already showing
        bodies = bodies || bodyRects();
        const hit = (l, tp, r, bt, list, w) => { let c = 0; for (const [a, b, cc, d] of list) c += Math.max(0, Math.min(r, cc) - Math.max(l, a)) * Math.max(0, Math.min(bt, d) - Math.max(tp, b)) * w; return c; };
        let best = Infinity;
        for (const dy of [0, 30, 60, 95, 130]) for (const f of [0, -0.18, 0.18, -0.34, 0.34]) {
          const [qx, qy] = place(f * bw, dy), l = qx - bw / 2, r = qx + bw / 2, tp = qy - bh - 8;
          const cost = (Math.abs(f) * 0.25 + (dy / bh) * 0.12) * bw * bh + hit(l, tp, r, qy + 8, bodies, 4) + hit(l - 6, tp - 6, r + 6, qy + 14, placed, 4);
          if (cost < best) { best = cost; el._off = [f * bw, dy]; }
        }
      }
      const [px, py] = place(el._off[0], el._off[1]);
      placed.push([px - bw / 2, py - bh - 8, px + bw / 2, py + 8]);
      el.style.setProperty("--tail", `${clamp(x * sc - px, -bw / 2 + 18, bw / 2 - 18)}px`);
      el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
    }
    const L = (s) => t - START[s];
    if (fx.ring) { const q = (t % 1.4) / 1.4; fx.ring.style.opacity = st === 4 && L(4) > 3.6 ? 1 - q : 0; fx.ring.setAttribute("transform", `translate(2034 900) scale(${0.7 + q * 1.3}) translate(-2034 -900)`); }
    if (fx.huh) fx.huh.style.opacity = react();
    // she gives them one star
    if (fx.stars) $$("path", fx.stars).forEach((s, i) => { s.style.opacity = t > 69 && t < END ? (i === 0 ? smooth((t - 69) / 0.4) : 0.16) : 0; });
    if (st !== cur) { cur = st; tabs.forEach((b, i) => b.classList.toggle("is-on", i === st)); box.dataset.stage = st; }
    bars.forEach((b, i) => { b.style.transform = `scaleX(${k01((t - START[i]) / (endOf(i) - START[i]))})`; });
    // on a narrow screen the poster is wider than the view, so the view follows the action
    const over = pan.offsetWidth - view.clientWidth, ax = t > 38 && t < 51 ? 1750 : pathAt(WAY.agnes, t).x;
    pan.style.transform = over > 2 ? `translateX(${-clamp((ax / 3036) * pan.offsetWidth - view.clientWidth * 0.5, 0, over)}px)` : "";
  };
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    // a clicked stage: run back or forward to it, then play on from there
    if (hold != null) { const gap = hold - t; t += Math.sign(gap) * Math.min(Math.abs(gap), dt * Math.max(5, Math.abs(gap) * 2.5)); if (Math.abs(hold - t) < 0.01) hold = null; }
    else if (!hover) { t += dt; if (t > END) t = 0; }
    render();
    raf = live ? requestAnimationFrame(frame) : 0;
  };
  box.__seek = (v) => { t = v; render(); };
  tabs.forEach((b, i) => b.addEventListener("click", () => { hold = SEEK[i]; }));
  view.addEventListener("pointerenter", () => { hover = true; });
  view.addEventListener("pointerleave", () => { hover = false; });
  addEventListener("resize", () => render());
  if (reduceMotion) { t = SEEK[5]; render(); return; }
  render();
  new IntersectionObserver(([en]) => {
    live = en.isIntersecting;
    if (live && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }, { threshold: 0.6 }).observe(view);
});

// "see the original poster" opens the infographic in the lightbox
$$(".jw-poster").forEach((btn) => btn.addEventListener("click", () => {
  const img = btn.parentElement.querySelector(".jw-poster-img");
  if (img) window.__lightbox?.open(img);
}));

// ecosystem: the poster map with its corner cone made live; the level in focus lights up every circle on its ring
$$("[data-eco2]").forEach((box) => {
  const cone = $(".eco2-cone", box);
  let k = -1, hold = false, timer = 0;
  const set = (v) => { k = +v; box.dataset.active = v; if (cone) cone.dataset.active = v; };
  // a level is picked by clicking (or Enter), so passing the pointer over the map changes nothing
  const hover = (el, v) => {
    el.addEventListener("click", () => { hold = true; set(v); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hold = true; set(v); } });
  };
  if (cone) $$(".relay__layer", cone).forEach((g) => hover(g, g.dataset.layer));
  $$(".eco2-levels li", box).forEach((li) => hover(li, li.dataset.layer));
  $$(".eco2-rings circle", box).forEach((c) => hover(c, c.dataset.l));
  $$(".eco2-zone", box).forEach((z) => hover(z, z.dataset.l));
  box.addEventListener("pointerleave", () => { hold = false; });
  // left alone it walks micro, meso, macro in turn
  new IntersectionObserver(([en]) => {
    clearInterval(timer);
    if (!en.isIntersecting) return;
    if (k < 0) set(0);
    if (!reduceMotion) timer = setInterval(() => { if (!hold) set((k + 1) % 3); }, 3200);
  }, { threshold: 0.6 }).observe(box);
});

// opportunity slats: the one under the pointer or focus opens
$$("[data-opps]").forEach((list) => {
  const items = $$(".opp", list);
  const open = (el) => items.forEach((it) => it.classList.toggle("is-open", it === el));
  items.forEach((it) => {
    it.addEventListener("mouseenter", () => open(it));
    it.addEventListener("focus", () => open(it));
    it.addEventListener("click", () => open(it));
  });
});

document.documentElement.classList.add("js-ready");
requestScrollFrame();
