// Shared behaviour for the home page and case studies.
// Every feature checks that its elements exist, so pages only pay for what they use.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

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
  if (lenis) lenis.scrollTo(target, { offset: target === 0 ? 0 : -88, duration: 1.4 });
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
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
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
// Split .reveal-mask headings into lines-of-words that slide up from a mask
$$(".reveal-mask").forEach((el) => {
  if (el.dataset.split) return;
  el.dataset.split = "1";
  const parts = el.innerHTML.split(/<br\s*\/?>/i);
  let n = 0;
  el.innerHTML = parts.map((part) => part.trim().split(/\s+/).map((w) =>
    `<span class="m"><span class="m__in" style="--i:${n++}">${w}</span></span>`).join(" ")).join("<br>");
});

/* ---------- Word-by-word highlight tied to scroll ---------- */
const wordBlocks = $$(".reveal-words");
for (const block of wordBlocks) {
  block.innerHTML = block.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
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
    $(".form__note", form).textContent = "Opening your email app… If nothing happens, write to wmw921204@gmail.com.";
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
  const speed = 22; // ms per character
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
    b.setAttribute("aria-label", c.dataset.label || `Sheet ${i + 1}`);
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
    label.textContent = video.muted ? (started ? "Sound off" : "Watch with sound") : "Sound on";
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
    ["700+", "data points, from every interview, survey and forum post"],
    ["110", "groups of related notes"],
    ["27", "themes"],
    ["6", "problems to solve"],
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
    <g class="r-board" data-hl="board"><rect x="230" y="34" width="420" height="22" rx="8"/><text x="440" y="26">SCENE BOARD · GENRE</text></g>
    <rect x="90" y="66" width="700" height="338" rx="130" fill="#2a2a2e"/>
    <rect x="102" y="78" width="676" height="314" rx="120" fill="#3ec68f"/>
    <rect x="${X0 - 12}" y="${Y0 - 12}" width="${CW * 6 + 24}" height="${CH * 3 + 24}" rx="16" fill="#f3f1ec"/>
    <g data-hl="cols"><rect class="r-sweep" x="${X0}" y="${Y0}" width="${CW}" height="${CH * 3}" rx="10"/></g>
    ${cells}${tiles}
    <g class="r-time" data-hl="cols">${nums}<path d="M${X0} 448 H${X0 + CW * 6}" /><path d="M${X0 + CW * 6 - 12} 441 l12 7 -12 7"/><text x="${X0 + CW * 6 + 26}" y="453" style="text-anchor:start">TIME</text></g>
    <g class="r-pitch" data-hl="rows"><text x="58" y="${Y0 + CH * 0.5 + 6}">high</text><text x="58" y="${Y0 + CH * 1.5 + 6}">mid</text><text x="58" y="${Y0 + CH * 2.5 + 6}">low</text><path d="M16 ${Y0 + 20} V${Y0 + CH * 3 - 20}"/><path d="M9 ${Y0 + 32} l7 -12 7 12"/><text x="16" y="${Y0 - 4}">PITCH</text></g>
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
  const data = JSON.parse($("[data-builder-data]", sec).textContent);
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
    $("span", row).textContent = slot === "outfit" ? "Plays the " + item[1].toLowerCase() + "." : item[2] + ": " + item[3];
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
  veil.setAttribute("aria-label", `Start the interactive prototype: ${frame.title || "prototype"}`);
  veil.innerHTML = `<span class="proto-veil__tag">Interactive prototype</span><span class="proto-veil__btn"><svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M2 1.5v13L13 8z" fill="currentColor"/></svg>Click to try it</span><span class="proto-veil__note">${box.closest(".fin-browser") ? "Click around like the real site" : "Tap around like a real app"}</span>`;
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
    note.textContent = "Your browser doesn’t support WebGPU, so the simulated BoKnee stays on. Try desktop Chrome or Edge for the real model.";
  }
  const send = (type) => frame.contentWindow?.postMessage({ source: "reco-page", type }, "*");
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Loading…";
    bar.hidden = false;
    note.textContent = "Downloading the model to your browser. You can keep chatting with the simulated BoKnee meanwhile.";
    send("enable-ai");
  });
  addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow || e.data?.source !== "reco-app") return;
    const d = e.data;
    if (d.type === "ai-progress") {
      bar.firstElementChild.style.width = `${Math.round((d.progress || 0) * 100)}%`;
      btn.textContent = `Loading… ${Math.round((d.progress || 0) * 100)}%`;
    } else if (d.type === "ai-ready") {
      bar.hidden = true;
      btn.textContent = "Real AI on";
      btn.classList.add("is-on");
      note.textContent = "BoKnee now answers with Llama 3.2 1B, running on your device. Replies are generated live, so they won’t match the video word for word.";
      if (tag) { tag.textContent = "Try it here · real AI, on your device"; tag.classList.add("reco-tag--live"); }
    } else if (d.type === "ai-error") {
      bar.hidden = true;
      btn.disabled = false;
      btn.textContent = "Try again";
      note.textContent = `Couldn’t start the real model (${d.message}). The simulated BoKnee is still on.`;
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
        img.dataset.label = `Page ${p} / ${n}`;
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
    if (count) count.textContent = cur === 0 ? "Cover" : cur === L ? "Back cover" : `Pages ${2 * cur}–${Math.min(n, 2 * cur + 1)} / ${n}`;
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
  lb.setAttribute("aria-label", "Image viewer");
  lb.innerHTML = `
    <div class="lb__stage"><img class="lb__img" alt=""></div>
    <button class="lb__btn lb__close" type="button" aria-label="Close">✕</button>
    <button class="lb__btn lb__prev" type="button" aria-label="Previous image">←</button>
    <button class="lb__btn lb__next" type="button" aria-label="Next image">→</button>
    <div class="lb__bar"><span class="lb__count"></span><span class="lb__cap"></span><span class="lb__hint">Click or scroll to zoom</span></div>`;
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
  $$(dragBox).forEach((t) => { if (!t.dataset.cursor) t.dataset.cursor = "Drag"; });
  $$("[data-drag]").forEach((box) => {
    const img = $("img", box);
    if (!img) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gallery__zoom";
    btn.setAttribute("aria-label", "Enlarge the picture");
    btn.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Enlarge</span>`;
    btn.addEventListener("click", () => open(img));
    const bar = document.createElement("div"); bar.className = "gallery__bar wrap"; bar.append(btn);
    box.after(bar);
  });
  $$("[data-deck]").forEach((deck) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "deck__zoom";
    btn.setAttribute("aria-label", "Enlarge this sheet");
    btn.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Enlarge</span>`;
    btn.addEventListener("click", () => {
      const front = $$("img", deck).find((i) => i.style.getPropertyValue("--k").trim() === "0") || $("img", deck);
      open(front);
    });
    $(".deck__bar", deck).append(btn);
  });
})();

/* ---------- Cursor: one dot that stands in for the system pointer and grows into a label ---------- */
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
      if (text.textContent !== host.dataset.cursor) text.textContent = host.dataset.cursor;
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
    fitfido: ["hero-poster.webp?v=4", "hero.mp4?v=4"], brilliant: ["hero-poster.webp", "hero.mp4"], swifthome: ["hero-poster.webp?v=3", "hero.mp4?v=3"],
    safedining: ["hero-poster.webp", "hero.mp4?v=2"], reco: ["hero-poster.webp?v=2", "hero.mp4?v=13"], zenbloom: ["hero-poster.webp?v=4", "hero.mp4?v=4"],
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

document.documentElement.classList.add("js-ready");
requestScrollFrame();
