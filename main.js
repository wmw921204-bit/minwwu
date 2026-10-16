const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Menu
const menuBtn = document.querySelector(".menu-btn");
const menu = document.getElementById("menu");
function setMenu(open) {
  menu.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}
menuBtn.addEventListener("click", () => setMenu(menu.hidden));
menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest(".topbar")) setMenu(false); });

// Fade-up reveal
const revealObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-in");
      revealObserver.unobserve(entry.target);
    }
  }
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 0.12}s`;
  revealObserver.observe(el);
});

// Word-by-word highlight tied to scroll position
const wordBlocks = [...document.querySelectorAll(".reveal-words")];
for (const block of wordBlocks) {
  block.innerHTML = block.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
}
function paintWords() {
  const vh = innerHeight;
  for (const block of wordBlocks) {
    const words = block.querySelectorAll(".w");
    const r = block.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.45)));
    const lit = Math.round(progress * words.length);
    words.forEach((w, i) => w.classList.toggle("on", i < lit));
  }
}
if (reduceMotion) wordBlocks.forEach((b) => b.querySelectorAll(".w").forEach((w) => w.classList.add("on")));
else { addEventListener("scroll", paintWords, { passive: true }); paintWords(); }

// Experience cards: auto-rotate with progress bar, click to select
const xp = document.querySelector(".xp");
const cards = [...xp.children];
const bar = document.querySelector(".xp__progress span");
const delay = Number(xp.dataset.autoplay);
let current = 0;
let timer;
function selectCard(i) {
  current = i;
  cards.forEach((c, j) => c.classList.toggle("is-active", j === i));
  if (reduceMotion) return;
  bar.classList.remove("run");
  void bar.offsetWidth;
  bar.style.animationDuration = `${delay}ms`;
  bar.classList.add("run");
  clearTimeout(timer);
  timer = setTimeout(() => selectCard((current + 1) % cards.length), delay);
}
cards.forEach((c, i) => c.addEventListener("click", () => selectCard(i)));
selectCard(0);

// Services: activate the row nearest the viewport centre, or on hover
const services = [...document.querySelectorAll(".svc")];
function activateService(el) { services.forEach((s) => s.classList.toggle("is-active", s === el)); }
services.forEach((s) => s.addEventListener("mouseenter", () => activateService(s)));
const svcObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) activateService(entry.target);
}, { rootMargin: "-45% 0px -45% 0px" });
services.forEach((s) => svcObserver.observe(s));

// Lazy-load decorative videos and pause them off-screen
const videoObserver = new IntersectionObserver((entries) => {
  for (const { target: v, isIntersecting } of entries) {
    if (isIntersecting) {
      const src = v.querySelector("source[data-src]");
      if (src) { src.src = src.dataset.src; src.removeAttribute("data-src"); v.load(); }
      if (!reduceMotion) v.play().catch(() => {});
    } else v.pause();
  }
}, { rootMargin: "200px" });
document.querySelectorAll("video").forEach((v) => {
  if (reduceMotion) v.removeAttribute("autoplay");
  videoObserver.observe(v);
});

// Contact form → opens the visitor's mail app (static site, no backend)
const form = document.getElementById("contact-form");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const body = `${data.get("message")}\n\n— ${data.get("email")}${data.get("phone") ? ` / ${data.get("phone")}` : ""}`;
  location.href = `mailto:wmw921204@gmail.com?subject=${encodeURIComponent("Portfolio enquiry")}&body=${encodeURIComponent(body)}`;
  form.querySelector(".form__note").textContent = "Opening your email app… If nothing happens, write to wmw921204@gmail.com.";
});

// Local time in Savannah, GA
const tz = "America/New_York";
const clock = document.getElementById("clock");
const tzLabel = document.getElementById("tz");
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
const zoneFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
function tick() {
  const now = new Date();
  clock.textContent = timeFmt.format(now);
  tzLabel.textContent = `(${zoneFmt.formatToParts(now).find((p) => p.type === "timeZoneName").value})`;
}
tick();
setInterval(tick, 1000);
document.getElementById("year").textContent = new Date().getFullYear();
