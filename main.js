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
const revealEls = $$(".reveal, .reveal-mask, .reveal-stagger, .reveal-lines");
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
    if (reduceMotion) { el.textContent = end + suffix; return; }
    const start = performance.now();
    const dur = 1400;
    const step = (now) => {
      const t = clamp((now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = Math.round(end * eased) + suffix;
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
$$(".gallery__track").forEach((track) => {
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

/* ---------- Scrollytelling: steps drive a sticky stage (camera zoom + hotspots) ---------- */
$$("[data-scrolly]").forEach((scrolly) => {
  const steps = $$("[data-step]", scrolly);
  const stage = $("[data-stage]", scrolly);
  const spots = $$("[data-spot]", scrolly);
  const count = $("[data-scrolly-count]", scrolly);
  const show = (i) => {
    const step = steps[i];
    steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
    spots.forEach((s) => s.classList.toggle("is-active", Number(s.dataset.spot) === i));
    stage.style.setProperty("--x", `${step.dataset.x}%`);
    stage.style.setProperty("--y", `${step.dataset.y}%`);
    stage.style.setProperty("--s", step.dataset.s);
    stage.dataset.active = i;
    if (count) count.textContent = String(i + 1).padStart(2, "0");
  };
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) show(steps.indexOf(entry.target));
  }, {
    // On narrow screens the sticky stage covers the top half, so watch the lower part of the viewport
    rootMargin: matchMedia("(max-width: 1024px)").matches ? "-72% 0px -24% 0px" : "-48% 0px -48% 0px",
  });
  steps.forEach((s) => io.observe(s));
  // Hotspots and steps are also clickable
  spots.forEach((spot) => spot.addEventListener("click", () => scrollToTarget(steps[Number(spot.dataset.spot)])));
  show(0);
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

/* ---------- Custom cursor label over projects and galleries ---------- */
if (!reduceMotion && matchMedia("(hover: hover) and (pointer: fine)").matches && $("[data-cursor]")) {
  const cursor = document.createElement("div");
  cursor.className = "cursor";
  cursor.setAttribute("aria-hidden", "true");
  document.body.append(cursor);
  let tx = 0, ty = 0, cx = 0, cy = 0;
  addEventListener("pointermove", (e) => {
    tx = e.clientX; ty = e.clientY;
    const host = e.target.closest("[data-cursor]");
    cursor.classList.toggle("is-on", !!host);
    if (host) cursor.textContent = host.dataset.cursor;
  });
  document.addEventListener("pointerleave", () => cursor.classList.remove("is-on"));
  const follow = () => {
    cx += (tx - cx) * 0.18;
    cy += (ty - cy) * 0.18;
    cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
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

document.documentElement.classList.add("js-ready");
requestScrollFrame();
