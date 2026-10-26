// Homepage-only interactions. Loaded before main.js; each block checks for its elements.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const onScreen = (el, cb) => new IntersectionObserver(([e]) => cb(e.isIntersecting)).observe(el);

  /* ---------- Intro loader: counts real loading progress, scrambles the name, then the columns lift away ---------- */
  const root = document.documentElement;
  const loader = $(".loader");
  if (loader && root.classList.contains("intro")) {
    const name = $(".loader__name", loader);
    const finalName = name ? name.textContent : "";
    const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>";
    const t0 = performance.now();
    const minTime = 1700;
    // things worth waiting for, each with a time limit so the intro never hangs
    const heroImg = $(".hero__photo img");
    const tasks = [
      document.fonts ? document.fonts.ready : Promise.resolve(),
      heroImg ? (heroImg.decode ? heroImg.decode().catch(() => {}) : Promise.resolve()) : Promise.resolve(),
      new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r, { once: true }))),
    ];
    let done = 0;
    tasks.forEach((t) => Promise.race([t, new Promise((r) => setTimeout(r, 3500))]).then(() => done++));
    let shown = 0;
    const frame = (now) => {
      const elapsed = now - t0;
      // never run ahead of real loading, never finish before the minimum time
      const target = Math.min(done / tasks.length, elapsed / minTime);
      shown += (target - shown) * 0.12;
      if (target === 1 && 1 - shown < 0.004) shown = 1;
      loader.style.setProperty("--lp", shown.toFixed(3));
      // name resolves left to right as progress grows
      const solved = Math.floor(shown * finalName.length * 1.15);
      if (name) name.textContent = [...finalName].map((c, i) => (c === " " || i < solved ? c : glyphs[(Math.random() * glyphs.length) | 0])).join("");
      if (shown < 1) return requestAnimationFrame(frame);
      if (name) name.textContent = finalName;
      loader.classList.add("is-drawn");
      setTimeout(() => {
        loader.classList.add("is-out");
        setTimeout(() => {
          root.classList.remove("is-loading");
          window.__lenis?.start();
          try { sessionStorage.setItem("introSeen", "1"); } catch (e) {}
        }, 350);
        setTimeout(() => root.classList.remove("intro"), 1500);
      }, 1000);
    };
    requestAnimationFrame(frame);

    // interactive dot field: dots glow near the cursor and ripples roll out from where it moves or clicks
    const cv = $(".loader__field", loader);
    const ctx = cv.getContext("2d");
    const gap = 26;
    let W = 0, H = 0, dpr = 1, dots = [];
    const size = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      for (let y = gap / 2; y < H; y += gap) for (let x = gap / 2; x < W; x += gap) dots.push(x, y);
    };
    size();
    addEventListener("resize", size);
    const ripples = [];
    const addRipple = (x, y, power = 1) => { ripples.push({ x, y, t: performance.now(), power }); if (ripples.length > 14) ripples.shift(); };
    let mx = -999, my = -999, lx = 0, ly = 0;
    loader.addEventListener("pointermove", (e) => {
      mx = e.clientX; my = e.clientY;
      if (Math.hypot(mx - lx, my - ly) > 70) { addRipple(mx, my, 0.6); lx = mx; ly = my; }
    });
    loader.addEventListener("pointerdown", (e) => addRipple(e.clientX, e.clientY, 1.6));
    loader.addEventListener("pointerleave", () => { mx = my = -999; });
    // ambient ripples from the centre so it feels alive without a mouse
    addRipple(W / 2, H * 0.46, 1.2);
    const ambient = setInterval(() => addRipple(W / 2, H * 0.46, 0.9), 1400);
    const speed = 0.55, band = 70, life = 2600;
    const draw = (now) => {
      if (!root.classList.contains("intro")) { clearInterval(ambient); return; }
      ctx.clearRect(0, 0, W, H);
      for (let i = ripples.length - 1; i >= 0; i--) if (now - ripples[i].t > life) ripples.splice(i, 1);
      for (let i = 0; i < dots.length; i += 2) {
        let x = dots[i], y = dots[i + 1], glow = 0, dx = 0, dy = 0;
        for (const r of ripples) {
          const age = now - r.t, rad = age * speed;
          const ddx = x - r.x, ddy = y - r.y, d = Math.hypot(ddx, ddy) || 1;
          const off = d - rad;
          if (off > -band && off < band) {
            const k = Math.cos((off / band) * Math.PI * 0.5) * (1 - age / life) * r.power;
            dx += (ddx / d) * k * 7; dy += (ddy / d) * k * 7; glow = Math.max(glow, k);
          }
        }
        const md = Math.hypot(x - mx, y - my);
        const near = md < 150 ? 1 - md / 150 : 0;
        const a = 0.08 + glow * 0.38 + near * 0.42;
        const rad = 1 + glow * 1.4 + near * 1.8;
        const hot = Math.max(glow, near);
        ctx.fillStyle = hot > 0.15 ? `rgba(222,101,54,${Math.min(0.7, a).toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x + dx, y + dy, rad, 0, 6.283); ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  } else {
    root.classList.remove("is-loading", "intro");
  }

  /* ---------- Greeting that types through languages ---------- */
  const hello = $(".hello");
  if (hello && !reduce) {
    const words = hello.dataset.words.split(",");
    let w = 0;
    const type = (text, i, dir) => {
      hello.textContent = text.slice(0, i);
      if (dir > 0 && i < text.length) return setTimeout(() => type(text, i + 1, 1), 90);
      if (dir > 0) return setTimeout(() => type(text, i - 1, -1), 1900);
      if (i > 0) return setTimeout(() => type(text, i - 1, -1), 45);
      w = (w + 1) % words.length;
      setTimeout(() => type(words[w], 1, 1), 250);
    };
    setTimeout(() => type(words[0], words[0].length, 1), 2600);
  }

  /* ---------- Name letters: lift toward the cursor, flip on click, burst of W's ---------- */
  const title = $("[data-play]");
  if (title) {
    const letters = [];
    $$(".line__in", title).forEach((line) => {
      line.setAttribute("aria-hidden", "true");
      line.innerHTML = [...line.textContent].map((c) => `<span class="ch">${c}</span>`).join("");
      letters.push(...$$(".ch", line));
    });
    const state = letters.map(() => ({ y: 0, s: 1, ty: 0, ts: 1 }));
    let px = -9999, py = -9999, running = false;
    const tick = () => {
      let moving = false;
      letters.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
        const f = Math.max(0, 1 - d / 220);
        const st = state[i];
        st.ty = -f * 26; st.ts = 1 + f * 0.1;
        st.y = lerp(st.y, st.ty, 0.18); st.s = lerp(st.s, st.ts, 0.18);
        if (Math.abs(st.y - st.ty) > 0.05) moving = true;
        el.style.translate = `0 ${st.y.toFixed(2)}px`;
        el.style.scale = st.s.toFixed(3);
      });
      running = moving || px > -9999;
      if (running) requestAnimationFrame(tick);
    };
    if (finePointer && !reduce) {
      const hero = title.closest(".hero");
      hero.addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; if (!running) { running = true; requestAnimationFrame(tick); } });
      hero.addEventListener("pointerleave", () => { px = py = -9999; });
    }
    // click a letter: it flips; every click also throws a few little W's
    const logo = $(".brand img")?.getAttribute("src") || "assets/img/logo.webp";
    title.addEventListener("click", (e) => {
      const ch = e.target.closest(".ch");
      if (ch && !reduce) { ch.classList.remove("flip"); void ch.offsetWidth; ch.classList.add("flip"); }
      if (reduce) return;
      for (let i = 0; i < 7; i++) {
        const w = document.createElement("img");
        w.src = logo; w.alt = ""; w.className = "burst";
        w.style.left = `${e.clientX}px`; w.style.top = `${e.clientY}px`;
        w.style.setProperty("--dx", `${(Math.random() - 0.5) * 320}px`);
        w.style.setProperty("--dy", `${-120 - Math.random() * 180}px`);
        w.style.setProperty("--r", `${(Math.random() - 0.5) * 540}deg`);
        document.body.append(w);
        w.addEventListener("animationend", () => w.remove());
      }
    });
  }

  /* ---------- Portrait tilts toward the pointer with a moving glare ---------- */
  const tilt = $("[data-tilt]");
  if (tilt && finePointer && !reduce) {
    const inner = $(".hero__tilt", tilt);
    let rx = 0, ry = 0, tx = 0, ty = 0, gx = 50, gy = 50, raf = 0;
    const loop = () => {
      rx = lerp(rx, tx, 0.12); ry = lerp(ry, ty, 0.12);
      inner.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      inner.style.setProperty("--gx", `${gx}%`); inner.style.setProperty("--gy", `${gy}%`);
      raf = Math.abs(rx - tx) + Math.abs(ry - ty) > 0.02 ? requestAnimationFrame(loop) : 0;
    };
    tilt.addEventListener("pointermove", (e) => {
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      tx = (0.5 - y) * 12; ty = (x - 0.5) * 14; gx = x * 100; gy = y * 100;
      tilt.classList.add("is-tilting");
      if (!raf) raf = requestAnimationFrame(loop);
    });
    tilt.addEventListener("pointerleave", () => { tx = ty = 0; tilt.classList.remove("is-tilting"); if (!raf) raf = requestAnimationFrame(loop); });
  }

  /* ---------- About: a dialogue that types line by line, then offers choices ---------- */
  const talk = $("[data-talk]");
  if (talk) {
    const lines = $$(".talk__lines li", talk).map((li) => li.textContent);
    const out = $(".talk__line", talk);
    const next = $(".talk__next", talk);
    let i = -1, typing = 0, timer = 0, started = false;
    const finish = () => { cancelAnimationFrame(typing); typing = 0; out.textContent = lines[i]; out.classList.remove("is-typing"); };
    const show = (n) => {
      i = n;
      clearTimeout(timer);
      talk.classList.toggle("is-last", i === lines.length - 1);
      if (reduce) { out.textContent = lines[i]; return; }
      const text = lines[i];
      const t0 = performance.now();
      out.classList.add("is-typing");
      const step = (now) => {
        const k = Math.min(text.length, Math.floor((now - t0) / 24));
        out.textContent = text.slice(0, k);
        if (k < text.length) typing = requestAnimationFrame(step);
        else { typing = 0; out.classList.remove("is-typing"); if (i < lines.length - 1) timer = setTimeout(advance, 2600); }
      };
      typing = requestAnimationFrame(step);
    };
    const advance = () => {
      if (typing) return finish();
      if (i < lines.length - 1) show(i + 1);
    };
    next.addEventListener("click", advance);
    $(".talk__box", talk).addEventListener("click", (e) => { if (!e.target.closest("a, button")) advance(); });
    onScreen(talk, (v) => { if (v && !started) { started = true; setTimeout(() => show(0), 400); } });
  }

  /* ---------- Services: an image card follows the cursor over each row ---------- */
  const rows = $$(".svc");
  if (rows.length && finePointer && !reduce) {
    document.body.classList.add("has-preview");
    const card = document.createElement("div");
    card.className = "preview";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = "<img alt=''><img alt=''>";
    document.body.append(card);
    const [a, b] = $$("img", card);
    let x = 0, y = 0, tx = 0, ty = 0, vx = 0, raf = 0, flip = 0, swap = 0;
    const loop = () => {
      const nx = lerp(x, tx, 0.14); vx = nx - x; x = nx; y = lerp(y, ty, 0.14);
      card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${Math.max(-12, Math.min(12, vx * 0.6)).toFixed(2)}deg)`;
      raf = requestAnimationFrame(loop);
    };
    rows.forEach((row) => {
      const imgs = $$(".svc__imgs img", row).map((im) => im.currentSrc || im.src);
      row.addEventListener("pointerenter", (e) => {
        a.src = imgs[0]; b.src = imgs[1] || imgs[0];
        x = tx = e.clientX; y = ty = e.clientY;
        card.classList.add("is-on");
        if (!raf) raf = requestAnimationFrame(loop);
        clearInterval(swap);
        swap = setInterval(() => card.classList.toggle("is-alt", (flip = !flip)), 1300);
      });
      row.addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; });
      row.addEventListener("pointerleave", () => { card.classList.remove("is-on"); clearInterval(swap); cancelAnimationFrame(raf); raf = 0; });
    });
  }

  /* ---------- Approach: heart circle leans toward the cursor ---------- */
  const heart = $(".circle--media");
  if (heart && finePointer && !reduce) {
    const grid = heart.parentElement;
    grid.addEventListener("pointermove", (e) => {
      const r = heart.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      heart.style.translate = `${(dx * 28).toFixed(1)}px ${(dy * 28).toFixed(1)}px`;
    });
    grid.addEventListener("pointerleave", () => { heart.style.translate = ""; });
  }

  /* ---------- Skills playground (matter.js): drag and toss ---------- */
  const play = $("[data-play-skills]");
  if (play && window.Matter && !reduce) {
    const { Engine, Runner, Bodies, Body, Composite, Constraint } = Matter;
    const chips = $$(".play__chips li", play);
    const engine = Engine.create({ gravity: { y: 1 } });
    const runner = Runner.create();
    let walls = [], bodies = [], built = false, running = false;
    const buildWalls = () => {
      Composite.remove(engine.world, walls);
      const w = play.clientWidth, h = play.clientHeight, t = 200;
      walls = [
        Bodies.rectangle(w / 2, h + t / 2, w * 3, t, { isStatic: true }),
        Bodies.rectangle(-t / 2, h / 2, t, h * 4, { isStatic: true }),
        Bodies.rectangle(w + t / 2, h / 2, t, h * 4, { isStatic: true }),
      ];
      Composite.add(engine.world, walls);
    };
    const build = () => {
      built = true;
      play.classList.add("is-live");
      buildWalls();
      const w = play.clientWidth;
      bodies = chips.map((el, i) => {
        const bw = el.offsetWidth, bh = el.offsetHeight;
        const body = Bodies.rectangle(40 + Math.random() * (w - 80), -60 - i * 70, bw, bh, {
          chamfer: { radius: bh / 2 }, restitution: 0.45, friction: 0.08, frictionAir: 0.012, density: 0.002,
          angle: (Math.random() - 0.5) * 0.8,
        });
        body.el = el; body.w = bw; body.h = bh;
        return body;
      });
      Composite.add(engine.world, bodies);
      Matter.Events.on(engine, "afterUpdate", () => {
        for (const b of bodies) {
          b.el.style.transform = `translate3d(${(b.position.x - b.w / 2).toFixed(1)}px, ${(b.position.y - b.h / 2).toFixed(1)}px, 0) rotate(${b.angle.toFixed(3)}rad)`;
        }
      });
    };
    // drag: only when the pointer starts on a chip, so the page still scrolls on touch
    let drag = null;
    const local = (e) => { const r = play.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    play.addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".play__chips li");
      if (!el || !built) return;
      const body = bodies.find((b) => b.el === el);
      const p = local(e);
      drag = Constraint.create({ pointA: p, bodyB: body, pointB: { x: p.x - body.position.x, y: p.y - body.position.y }, stiffness: 0.12, damping: 0.08, length: 0 });
      Composite.add(engine.world, drag);
      el.classList.add("is-grabbed");
      el.setPointerCapture(e.pointerId);
    });
    play.addEventListener("pointermove", (e) => { if (drag) drag.pointA = local(e); });
    const release = () => {
      if (!drag) return;
      drag.bodyB.el.classList.remove("is-grabbed");
      Composite.remove(engine.world, drag);
      drag = null;
    };
    play.addEventListener("pointerup", release);
    play.addEventListener("pointercancel", release);
    $(".play__shake", play).addEventListener("click", () => {
      for (const b of bodies) Body.applyForce(b, b.position, { x: (Math.random() - 0.5) * 0.06 * b.mass, y: -(0.05 + Math.random() * 0.05) * b.mass });
    });
    addEventListener("resize", () => { if (built) buildWalls(); });
    onScreen(play, (v) => {
      if (v && !built) build();
      if (v && !running) { Runner.run(runner, engine); running = true; }
      if (!v && running) { Runner.stop(runner); running = false; }
    });
  }

  /* ---------- "Connect": letters scatter away from the cursor ---------- */
  const word = $("[data-scatter]");
  if (word && finePointer && !reduce) {
    word.innerHTML = [...word.textContent].map((c) => `<span>${c}</span>`).join("");
    const spans = $$("span", word);
    const host = word.parentElement;
    host.addEventListener("pointermove", (e) => {
      for (const s of spans) {
        const r = s.getBoundingClientRect();
        const dx = r.left + r.width / 2 - e.clientX, dy = r.top + r.height / 2 - e.clientY;
        const d = Math.hypot(dx, dy), f = Math.max(0, 1 - d / 260);
        s.style.translate = `${((dx / (d || 1)) * f * 60).toFixed(1)}px ${((dy / (d || 1)) * f * 60).toFixed(1)}px`;
        s.style.rotate = `${(dx / (d || 1)) * f * 14}deg`;
      }
    });
    host.addEventListener("pointerleave", () => spans.forEach((s) => { s.style.translate = ""; s.style.rotate = ""; }));
  }

  // the cursor dot lives in main.js so every page has it
})();
