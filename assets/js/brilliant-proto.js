/* Brilliant redesign prototype: one small app, rebuilt in Brilliant's current look.
   data-bp="demo"    plays a scripted walk-through for the feature tour (driven by the scene's data-beat)
   data-bp="explore" is the same app for visitors to click around freely */
(() => {
  const t = (en, zh) => (window.__i18n ? window.__i18n.t(en, zh) : en);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const W = 1280, H = 720;

  // ---------- pieces ----------
  const star = `<svg viewBox="0 0 24 24" class="bp-ico"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor"/></svg>`;
  const cal = `<svg viewBox="0 0 24 24" class="bp-ico"><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const close = `<svg viewBox="0 0 24 24" class="bp-ico"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const check = `<svg viewBox="0 0 24 24" class="bp-ico"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const lock = `<svg viewBox="0 0 24 24" class="bp-ico"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`;
  const koji = (c = "") => `<svg viewBox="0 0 120 120" class="bp-koji ${c}"><use href="#koji-mini"/></svg>`;
  // the same isometric block as the iteration route, in Brilliant's lesson colours
  const block = (c = "") => `<svg viewBox="0 0 120 100" class="bp-block ${c}"><polygon class="l1" points="24,56 60,76.8 60,88.8 24,68"/><polygon class="r1" points="60,76.8 96,56 96,68 60,88.8"/><polygon class="t1" points="60,35.2 96,56 60,76.8 24,56"/><polygon class="l2" points="38,42 60,54.7 60,64.7 38,52"/><polygon class="r2" points="60,54.7 82,42 82,52 60,64.7"/><polygon class="t2" points="60,29.3 82,42 60,54.7 38,42"/><path class="plus" d="M53 42h14M60 38v8"/></svg>`;
  const ASSET = (document.querySelector('script[src*="brilliant-proto"]')?.src || "").replace(/js\/brilliant-proto\.js.*$/, "projects/brilliant/proto/");
  const bolt = `<svg viewBox="0 0 24 24" class="bp-ico"><path d="M13.5 2.5 5.5 13.5h6l-1 8 8-11h-6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const boltFill = `<svg viewBox="0 0 24 24" class="bp-ico"><path d="M13.5 2.5 5.5 13.5h6l-1 8 8-11h-6z" fill="currentColor"/></svg>`;
  const house = `<svg viewBox="0 0 24 24" class="bp-ico"><path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const cards = `<svg viewBox="0 0 24 24" class="bp-ico"><rect x="4" y="7" width="12" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const plus = `<svg viewBox="0 0 24 24" class="bp-ico"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  const expand = `<svg viewBox="0 0 24 24" class="bp-ico"><path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const shield = `<svg viewBox="0 0 48 48" class="bp-shield"><path d="M24 3 42 10v14c0 11-8 18-18 21C14 42 6 35 6 24V10z" fill="#4c4c4c"/><path d="M24 8 37 13v11c0 8-6 13.5-13 16-7-2.5-13-8-13-16V13z" fill="#999"/><path d="M27 14l-9 12h6l-3 9 9-12h-6z" fill="#fff"/></svg>`;
  const lessonsIco = `<svg viewBox="0 0 24 24" class="bp-ico"><ellipse cx="12" cy="10" rx="8" ry="4.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M4 10v3.5c0 2.5 3.6 4.5 8 4.5s8-2 8-4.5V10" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`;
  const practiceIco = `<svg viewBox="0 0 24 24" class="bp-ico"><path d="M5 11l8-8 3 3-8 8zM11 19l8-8 3 3-8 8z" fill="currentColor" transform="scale(.85) translate(1 1)"/><path d="M9 15l6-6" stroke="currentColor" stroke-width="2.4"/></svg>`;
  const week = [t("W", "三"), t("Th", "四"), t("F", "五"), t("S", "六"), t("Su", "日")];
  // the lesson path: blocks zig-zag on Brilliant's 30° grid, joined by one-bend tracks
  const nodes = [[150, 150], [240, 262], [330, 374], [240, 486]];
  const badge = [222, 52];
  const leg = ([x1, y1], [x2, y2]) => {
    const dx = x2 - x1, dy = y2 - y1, s = 0.577, a = (dy / s + Math.abs(dx)) / 2, b = (dy / s - Math.abs(dx)) / 2;
    const mid = b > 0 ? ` L${(x1 - Math.sign(dx || 1) * b).toFixed(1)} ${(y1 + s * b).toFixed(1)}` : "";
    return `M${x1} ${y1}${mid} L${x2} ${y2}`;
  };
  const centre = ([x, y]) => [x + 50, y + 44];
  const trail = [leg([badge[0] + 22, badge[1] + 20], centre(nodes[0])), ...nodes.slice(1).map((n, i) => leg(centre(nodes[i]), centre(n)))];
  const days = [t("M", "一"), t("T", "二"), t("W", "三"), t("T", "四"), t("F", "五"), t("S", "六"), t("S", "日")];

  const tile = (act, label, art) => `<button class="bp-tile" data-act="${act}"><span class="bp-tile__art">${art}</span><b>${label}</b></button>`;
  const artOverview = `<svg viewBox="0 0 48 48"><rect x="8" y="10" width="32" height="24" rx="4" fill="#5570f6"/><rect x="12" y="14" width="14" height="3" rx="1.5" fill="#fff"/><rect x="12" y="20" width="22" height="3" rx="1.5" fill="#c9d1ff"/><rect x="12" y="26" width="18" height="3" rx="1.5" fill="#c9d1ff"/><path d="M18 34l-4 8M30 34l4 8" stroke="#3c4bcc" stroke-width="3" stroke-linecap="round"/></svg>`;
  const artReview = `<svg viewBox="0 0 48 48"><rect x="10" y="8" width="28" height="34" rx="4" fill="#ffc93c"/><rect x="17" y="5" width="14" height="7" rx="3" fill="#e0a400"/><path d="M16 22l3 3 6-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="16" y="31" width="16" height="3" rx="1.5" fill="#fff"/></svg>`;
  const artNotes = `<svg viewBox="0 0 48 48"><rect x="11" y="7" width="26" height="34" rx="3" fill="#9b7bff"/><rect x="11" y="7" width="6" height="34" rx="2" fill="#7454e6"/><rect x="21" y="15" width="11" height="3" rx="1.5" fill="#fff"/><rect x="21" y="21" width="9" height="3" rx="1.5" fill="#e0d6ff"/></svg>`;

  const goals = [
    ["daily", t("Finish 1 lesson before 9 am", "早上 9 点前完成 1 节课"), 10],
    ["daily", t("Practise 10 problems", "练习 10 道题"), 10],
    ["daily", t("Review 3 mistakes", "复习 3 道错题"), 15],
    ["weekly", t("5 lessons with no mistakes", "5 节课零失误"), 50],
    ["weekly", t("Finish one course", "完成一门课程"), 50],
  ];
  const path = [
    [t("Finding Unknowns", "寻找未知数"), "now", "is-now"],
    [t("Practice Finding Unknowns", "练习：寻找未知数"), "next", "is-practice"],
    [t("Equations With Unknowns", "含未知数的方程"), "next", ""],
    [t("Practice Equations With Unknowns", "练习：含未知数的方程"), "next", "is-practice"],
  ];

  const app = () => `
  <div class="bp__stage">
    <header class="bp-nav">
      <b class="bp-logo">Brilliant</b>
      <nav class="bp-tabs"><button data-act="screen:home" data-tab="home">${house}${t("Home", "首页")}</button><button data-act="screen:course" data-tab="course">${cards}${t("Courses", "课程")}</button></nav>
      <div class="bp-nav__right">
        <button class="bp-qa" data-act="qa">Q &amp; A</button>
        <span class="bp-premium">${t("Go Premium", "升级高级版")}</span>
        <span class="bp-streakpill"><b data-streak>2</b>${bolt}</span>
        <span class="bp-menu"><i></i><i></i><i></i></span>
      </div>
    </header>

    <section class="bp-screen" data-screen="home">
      <div class="bp-home">
        <div class="bp-home__left">
          <h2 class="bp-hello">${t("Welcome, John!", "欢迎你，John！")}</h2>
          <div class="bp-card bp-streak">
            <div class="bp-streak__top"><b data-streak>2</b>${bolt}<button class="bp-calbtn" data-act="panel:calendar" aria-label="calendar">${cal}</button></div>
            <ol class="bp-week">${week.map((d, i) => `<li class="${i < 2 ? "is-done" : i === 2 ? "is-today" : ""}" ${i === 2 ? 'data-act="streak"' : ""}><i>${boltFill}</i><span>${d}</span></li>`).join("")}</ol>
            <p class="bp-streak__plan" data-plan></p>
          </div>
          <div class="bp-card bp-league">
            <div class="bp-league__head">${shield}<div><b>${t("Lithium league", "锂联赛")}</b><small>${t("Top 15 advance · 2 days left", "前 15 名晋级 · 还剩 2 天")}</small></div><span class="bp-league__x">${expand}</span></div>
            <ol>${[["20", "Jaya H", 70, "#b689ff,#874de5"], ["22", t("You", "你"), 55, "#9d62ff,#9d62ff"], ["23", "Janiya M", 50, "#ff8585,#ffb6b6"]].map(([r, n, x, c], i) => `<li class="${i === 1 ? "is-me" : ""}"><b>${r}</b><i style="background:linear-gradient(160deg,${c})">${n[0]}</i><span>${n}</span><em>${i === 1 ? `<b data-xp>${x}</b>` : x} XP</em></li>`).join("")}</ol>
          </div>
        </div>
        <div class="bp-home__right">
          <button class="bp-coursecard" data-act="screen:course">
            <span class="bp-coursecard__tag">${t("Foundational math", "基础数学")}</span>
            <span class="bp-coursecard__name">${t("Solving Equations", "解方程")}</span>
            <span class="bp-coursecard__art"><svg viewBox="0 0 400 260" class="bp-coursecard__grid"><g fill="none" stroke="#c9d3ff" stroke-width="3" stroke-linejoin="round"><path d="M40 150 200 58l160 92-160 92z" opacity=".55"/><path d="M90 150 200 87l110 63-110 63z"/></g><g fill="#e6ebff"><path d="M70 60l34-19 34 19-34 19z"/><path d="M262 214l34-19 34 19-34 19z"/></g></svg><span class="bp-coursecard__glow"></span>${block("is-now")}${koji("bp-coursecard__koji")}</span>
            <span class="bp-coursecard__pill">${t("Finding Unknowns", "寻找未知数")}</span>
          </button>
          <div class="bp-carousel">${["course-equations", "cat-basic-algebra", "cat-algebra", "cat-adv-algebra"].map((n, i) => `<span class="${i === 0 ? "is-on" : ""}"><img src="${ASSET}${n}.png" alt=""></span>`).join("")}</div>
        </div>
      </div>
    </section>

    <section class="bp-screen" data-screen="course">
      <div class="bp-coursepage">
        <div class="bp-coursepage__left">
          <div class="bp-card bp-cinfo">
            <img src="${ASSET}course-equations.png" alt="" class="bp-cinfo__icon">
            <h3>${t("Solving Equations", "解方程")}</h3>
            <p>${t("Start your algebra journey here with an introduction to variables and equations.", "从变量和方程开始你的代数之旅。")}</p>
            <div class="bp-cinfo__meta"><span>${lessonsIco}${t("70 Lessons", "70 节课")}</span><span>${practiceIco}${t("185 Practice", "185 道练习")}</span><button class="bp-cinfo__cal" data-act="panel:calendar" aria-label="calendar">${plus}${cal}</button></div>
          </div>
          <div class="bp-log">
            <h3>${t("Learning log", "学习日志")}</h3>
            <div class="bp-log__tiles">${tile("panel:overview", t("Overview", "概览"), artOverview)}${tile("review:goals", t("In Review", "复习"), artReview)}${tile("review:notes", t("Notebook", "笔记"), artNotes)}</div>
          </div>
        </div>
        <div class="bp-path">
          <svg class="bp-path__bg" viewBox="0 0 520 620"><g fill="none" stroke="#ececec" stroke-width="2.5" stroke-linejoin="round"><path d="M40 20l60 35-60 35 60 35-60 35"/><path d="M470 120l-60 35 60 35-60 35 60 35"/><path d="M30 380l60 35-60 35 60 35"/><path d="M480 420l-50 29 50 29-50 29"/></g></svg>
          <svg class="bp-path__line" viewBox="0 0 520 620"><path class="is-lit" d="${trail[0]}"/>${trail.slice(1).map((d) => `<path d="${d}"/>`).join("")}</svg>
          <span class="bp-badge" style="left:${badge[0]}px;top:${badge[1]}px"><small>LEVEL</small><b>1</b></span>
          ${path.map(([n, s, kind], i) => `<div class="bp-node is-${s}" style="left:${nodes[i][0]}px;top:${nodes[i][1]}px" ${i === 0 ? 'data-act="screen:lesson"' : ""}>${block(kind)}<b>${n}</b></div>`).join("")}
          <span class="bp-path__koji" style="left:${nodes[0][0]}px;top:${nodes[0][1]}px">${koji()}</span>
        </div>
      </div>
    </section>

    <section class="bp-screen" data-screen="lesson">
      <div class="bp-lesson">
        <div class="bp-lesson__bar"><button class="bp-iconbtn" data-act="screen:course" aria-label="close">${close}</button><div class="bp-progress"><i style="--w:12%"></i></div><button class="bp-qa" data-act="chat">Q &amp; A</button><span class="bp-lesson__streak"><b data-streak>2</b>${boltFill}</span></div>
        <div class="bp-lesson__body">
          <div class="bp-q">
            <h3>${t("What’s the weight of one triangle?", "一个三角形有多重？")}</h3>
            <svg viewBox="0 0 260 170" class="bp-scale"><g fill="#f0a35a" stroke="#d98536" stroke-width="2" stroke-linejoin="round">${[[115, 10], [100, 44], [130, 44], [85, 78], [115, 78], [145, 78]].map(([x, y]) => `<polygon points="${x},${y + 32} ${x + 15},${y} ${x + 30},${y + 32}"/>`).join("")}</g><rect x="50" y="113" width="160" height="7" rx="3.5" fill="#b3b3b3"/><path d="M118 120h24v8h-24z" fill="#999"/><path d="M62 128h136l14 34H48z" fill="#4c4c4c"/><path d="M62 128h136l3 8H59z" fill="#666"/><rect x="88" y="138" width="84" height="18" rx="3" fill="#111"/><text x="130" y="152" text-anchor="middle" font-size="13" fill="#fff" font-family="ui-monospace,monospace">24</text></svg>
            <div class="bp-opts">${[2, 4, 6, 8].map((n) => `<button data-act="answer" data-n="${n}">${n}</button>`).join("")}</div>
            <button class="bp-check" data-act="checkans">${t("Check", "检查")}</button>
          </div>
          <aside class="bp-chat">
            <header>${koji()}<b>Koji</b><button class="bp-iconbtn" data-act="chatclose" aria-label="close">${close}</button></header>
            <ol class="bp-chat__log"><li class="bp-m bp-m--koji"><span class="bp-m__who">${koji()}Koji</span>${t("Hi John! Stuck? Ask me anything about this problem.", "嗨 John！卡住了吗？关于这道题随便问我。")}</li></ol>
            <div class="bp-chat__chips"><button data-act="ask" data-q="0">${t("Give me a hint", "给我一点提示")}</button><button data-act="ask" data-q="1">${t("What is algebra?", "什么是代数？")}</button><button data-act="ask" data-q="2">${t("Explain in detail", "详细讲讲")}</button></div>
            <div class="bp-chat__input"><span>${t("Type here…", "在这里输入…")}</span><i>${plus}</i></div>
          </aside>
        </div>
      </div>
    </section>

    <div class="bp-shade" data-act="closepanel"></div>

    <section class="bp-panel" data-panel="overview">
      <header><h3>${t("Overview", "概览")}</h3><button class="bp-iconbtn" data-act="closepanel" aria-label="close">${close}</button></header>
      <p class="bp-panel__lede">${t("You’ll learn to undo operations, balance both sides and solve for x in one and two steps.", "你会学到如何逆运算、保持两边平衡，并用一步或两步解出 x。")}</p>
      <div class="bp-pretest">
        <div><b>${t("Knowledge pre-test", "知识预测试")}</b><span>${t("5 quick questions to find your starting point", "5 道小题，找到你的起点")}</span></div>
        <ol class="bp-pretest__dots">${"<li></li>".repeat(5)}</ol>
        <button class="bp-btn bp-btn--green" data-act="pretest">${t("Start pre-test", "开始预测试")}</button>
      </div>
      <ul class="bp-lessons">${path.slice(0, 4).map(([n], i) => `<li><span>${i + 1}</span><b>${n}</b><i class="bp-info" data-act="tip" tabindex="0">i<em>${[t("Spot the unknown in a picture puzzle.", "在图形谜题里找出未知数。"), t("Drag weights to balance the scale.", "拖动砝码让天平平衡。"), t("Write the puzzle as an equation.", "把谜题写成方程。"), t("Mixed practice, no timer.", "综合练习，不计时。")][i]}</em></i></li>`).join("")}</ul>
    </section>

    <section class="bp-panel" data-panel="review">
      <header><h3>${t("In review", "复习")}</h3><button class="bp-iconbtn" data-act="closepanel" aria-label="close">${close}</button></header>
      <nav class="bp-seg"><button data-act="tab:goals" data-seg="goals">${t("My goals", "我的目标")}</button><button data-act="tab:mistakes" data-seg="mistakes">${t("Mistakes", "错题")}</button><button data-act="tab:notes" data-seg="notes">${t("Notebook", "笔记")}</button></nav>
      <div class="bp-tab" data-tabbody="goals">
        <div class="bp-week-xp">${[30, 55, 20, 70, 45, 0, 0].map((h, i) => `<i style="--h:${h}%"><span>${days[i]}</span></i>`).join("")}</div>
        <ul class="bp-goals">${goals.map(([k, g, xp], i) => `<li data-act="goal" data-reward="${xp}" class="${i === 1 ? "" : ""}"><i>${check}</i><div><b>${g}</b><small>${k === "daily" ? t("Daily", "每日") : t("Weekly", "每周")}</small></div><em>+${xp} XP</em></li>`).join("")}</ul>
      </div>
      <div class="bp-tab" data-tabbody="mistakes">
        <p class="bp-mis__count">1 / 3</p>
        <h4>${t("Which value of x makes 3x + 4 = 19?", "x 等于多少时 3x + 4 = 19？")}</h4>
        <p class="bp-mis__was">${t("Last time you chose 7", "上次你选了 7")}</p>
        <div class="bp-opts bp-opts--mis">${[3, 5, 7, 15].map((n) => `<button data-act="fix" data-n="${n}" class="${n === 7 ? "was" : ""}">${n}</button>`).join("")}</div>
        <button class="bp-explain" data-act="explain">${t("Show explanation", "查看解析")}</button>
        <p class="bp-explain__body">${t("Take 4 from both sides: 3x = 15. Then divide by 3: x = 5.", "两边同时减 4：3x = 15，再除以 3：x = 5。")}</p>
      </div>
      <div class="bp-tab" data-tabbody="notes">
        <div class="bp-notes">${[[t("Balance both sides", "两边要平衡"), t("Whatever you do to one side, do to the other.", "对一边做什么，另一边也要做。")], [t("Undo in reverse", "倒着撤销"), t("Undo + and − first, then × and ÷.", "先撤销加减，再撤销乘除。")], [t("Check by plugging in", "代回去检查"), t("Put x back in and see if both sides match.", "把 x 代回去，看两边是否相等。")]].map(([h, p], i) => `<article style="--r:${[-2, 1.5, -1][i]}deg"><b>${h}</b><p>${p}</p></article>`).join("")}</div>
      </div>
    </section>

    <section class="bp-panel bp-panel--cal" data-panel="calendar">
      <header><h3>${t("Plan a study time", "安排学习时间")}</h3><button class="bp-iconbtn" data-act="closepanel" aria-label="close">${close}</button></header>
      <div class="bp-cal">
        <p class="bp-cal__m">${t("March", "三月")}</p>
        <div class="bp-cal__grid">${days.map((d) => `<span class="bp-cal__dow">${d}</span>`).join("")}${Array.from({ length: 31 }, (_, i) => `<button data-act="day" data-d="${i + 1}" class="${i + 1 < 5 ? "past" : ""}${i + 1 === 5 ? " today" : ""}${[3, 4].includes(i + 1) ? " studied" : ""}">${i + 1}</button>`).join("")}</div>
      </div>
      <div class="bp-cal__side">
        <p class="bp-kicker">${t("Time", "时间")}</p>
        <div class="bp-times">${["8:00", "9:00", "12:30", "19:00", "21:00"].map((h) => `<button data-act="time" data-h="${h}">${h}</button>`).join("")}</div>
        <p class="bp-kicker">${t("Remind me by", "提醒方式")}</p>
        <div class="bp-remind"><button data-act="remind" class="is-on">${t("Email", "邮件")}</button><button data-act="remind">${t("Phone", "手机")}</button></div>
        <button class="bp-btn bp-btn--green" data-act="savecal">${t("Add to calendar", "加入日历")}</button>
      </div>
    </section>

    <p class="bp-toast">${koji()}<span data-toast></span></p>
    <span class="bp-float" aria-hidden="true"></span>
    <span class="bp-cursor" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3l14 8-6.2 1.6L10 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></span>
  </div>`;

  const answers = [
    t("Six triangles weigh 24 together. If they all weigh the same, what do you divide 24 by?", "六个三角形一共 24。如果每个一样重，24 应该除以几？"),
    t("Algebra is maths with letters for the numbers you don’t know yet, so you can solve for them.", "代数就是用字母代替还不知道的数，然后把它解出来。"),
    t("Call one triangle x. Six of them make 24, so 6x = 24. Divide both sides by 6 and you get x = 4.", "把一个三角形记作 x。六个是 24，所以 6x = 24。两边除以 6，就得到 x = 4。"),
  ];

  // ---------- one prototype ----------
  function Proto(root) {
    root.innerHTML = app();
    const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)];
    const stage = $(".bp__stage"), cursor = $(".bp-cursor");
    const st = { streak: 2, xp: 55, day: 0, time: "", mode: root.dataset.bp };
    const fit = () => root.style.setProperty("--bps", root.clientWidth / W);
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    fit();

    const toast = (msg) => {
      $("[data-toast]").textContent = msg;
      const el = $(".bp-toast");
      el.classList.remove("is-on"); void el.offsetWidth; el.classList.add("is-on");
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("is-on"), 2600);
    };
    const setXP = (v, from) => {
      st.xp = v;
      $$("[data-xp]").forEach((b) => { b.textContent = v; b.parentElement.classList.remove("is-bump"); void b.offsetWidth; b.parentElement.classList.add("is-bump"); });
      if (from) {
        const f = $(".bp-float"), r = rel(from);
        f.textContent = `+${v - (st.prevXP ?? v)} XP`;
        f.style.left = `${r.x}px`; f.style.top = `${r.y}px`;
        f.classList.remove("is-on"); void f.offsetWidth; f.classList.add("is-on");
      }
    };
    const setStreak = (v) => { st.streak = v; $$("[data-streak]").forEach((b) => (b.textContent = v)); };
    // element centre in stage coordinates (the stage is scaled)
    const rel = (el) => {
      const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / W;
      return { x: (r.left + r.width / 2 - s.left) / k, y: (r.top + r.height / 2 - s.top) / k };
    };

    const screen = (name) => {
      root.dataset.screen = name;
      $$(".bp-tabs button").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === (name === "lesson" ? "course" : name)));
      if (name !== "lesson") root.classList.remove("chat-open");
    };
    const panel = (name) => { root.dataset.panel = name || ""; };
    const tab = (name) => { root.dataset.tab = name; $$(".bp-seg button").forEach((b) => b.classList.toggle("is-on", b.dataset.seg === name)); };

    const acts = {
      screen: (el, v) => { panel(""); screen(v); },
      panel: (el, v) => panel(v),
      review: (el, v) => { if (root.dataset.screen === "lesson") screen("course"); tab(v); panel("review"); },
      closepanel: () => panel(""),
      tab: (el, v) => tab(v),
      streak: (el) => {
        if (el.classList.contains("is-done")) return;
        el.classList.remove("is-today"); el.classList.add("is-done");
        setStreak(st.streak + 1); toast(t("3-day streak! See you tomorrow.", "连续 3 天！明天见。"));
      },
      qa: () => { panel(""); screen("lesson"); root.classList.add("chat-open"); },
      goal: (el) => {
        if (el.classList.contains("is-done")) return;
        el.classList.add("is-done"); st.prevXP = st.xp; setXP(st.xp + Number(el.dataset.reward), el.querySelector("em"));
      },
      fix: (el) => {
        $$(".bp-opts--mis button").forEach((b) => b.classList.remove("is-wrong"));
        if (el.dataset.n === "5") { el.classList.add("is-right"); root.classList.add("mis-done"); toast(t("Fixed! One mistake cleared.", "改对了！清掉一道错题。")); }
        else el.classList.add("is-wrong");
      },
      explain: () => root.classList.toggle("explain-open"),
      tip: (el) => { $$(".bp-info").forEach((i) => i !== el && i.classList.remove("is-on")); el.classList.toggle("is-on"); },
      pretest: async () => {
        const dots = $$(".bp-pretest__dots li");
        for (const d of dots) { d.classList.add("is-on"); await wait(220); }
        toast(t("You can skip the first 2 lessons.", "你可以跳过前 2 节课。"));
      },
      day: (el) => {
        if (el.classList.contains("past")) return;
        $$(".bp-cal__grid button").forEach((b) => b.classList.remove("is-on")); el.classList.add("is-on"); st.day = el.dataset.d;
      },
      time: (el) => { $$(".bp-times button").forEach((b) => b.classList.remove("is-on")); el.classList.add("is-on"); st.time = el.dataset.h; },
      remind: (el) => el.classList.toggle("is-on"),
      savecal: () => {
        if (!st.day || !st.time) return toast(t("Pick a day and a time first.", "先选好日期和时间。"));
        panel("");
        $("[data-plan]").textContent = t(`Next lesson: March ${st.day}, ${st.time}`, `下一节课：3 月 ${st.day} 日 ${st.time}`);
        $$(`.bp-cal__grid button[data-d="${st.day}"]`).forEach((b) => b.classList.add("planned"));
        toast(t(`Booked March ${st.day} at ${st.time}. I’ll remind you!`, `已约 3 月 ${st.day} 日 ${st.time}，我会提醒你！`));
      },
      answer: (el) => { $$(".bp-q .bp-opts button").forEach((b) => b.classList.remove("is-on", "is-right", "is-wrong")); el.classList.add("is-on"); },
      checkans: () => {
        const on = $(".bp-q .bp-opts .is-on");
        if (!on) return toast(t("Pick an answer first.", "先选一个答案。"));
        on.classList.add(on.dataset.n === "4" ? "is-right" : "is-wrong");
        if (on.dataset.n === "4") { st.prevXP = st.xp; setXP(st.xp + 10, on); }
        else toast(t("Not quite. Ask Koji for a hint?", "不太对。要不要问问 Koji？"));
      },
      chat: () => root.classList.add("chat-open"),
      chatclose: () => root.classList.remove("chat-open"),
      ask: async (el) => {
        const log = $(".bp-chat__log");
        const me = document.createElement("li"); me.className = "bp-m bp-m--me"; me.textContent = el.textContent; log.append(me);
        el.disabled = true;
        const k = document.createElement("li"); k.className = "bp-m bp-m--koji is-typing"; k.innerHTML = "<i></i><i></i><i></i>"; log.append(k);
        log.scrollTop = log.scrollHeight;
        await wait(reduce ? 0 : 900);
        const text = answers[el.dataset.q]; k.classList.remove("is-typing"); k.textContent = "";
        for (let i = 1; i <= text.length; i += reduce ? text.length : 2) { k.textContent = text.slice(0, i); log.scrollTop = log.scrollHeight; await wait(14); }
        k.textContent = text;
      },
    };
    const run = (el) => {
      if (!el) return;
      const [name, v] = el.dataset.act.split(":");
      acts[name]?.(el, v);
    };
    const onClick = (e) => {
      const el = e.target.closest("[data-act]");
      if (el && root.contains(el)) run(el);
    };
    if (st.mode === "explore") root.addEventListener("click", onClick);
    const destroy = () => { ro.disconnect(); root.removeEventListener("click", onClick); };

    screen("home"); tab("goals"); panel("");
    return { root, $, $$, run, screen, panel, tab, rel, cursor, st, setXP, setStreak, toast, destroy };
  }

  // ---------- the scripted tour ----------
  // each beat: put the app in a starting state, then move a pointer around and click things, on a loop
  const scripts = [
    async (p, go) => { p.screen("home"); await go(".bp-week li.is-today"); await go(".bp-carousel span:nth-child(2)", false); await go(".bp-coursecard", false); },
    async (p, go, alive) => {
      p.screen("course");
      const els = p.$$(".bp-node"), k = p.$(".bp-path__koji"), segs = p.$$(".bp-path__line path");
      for (let i = 0; i < 3 && alive(); i++) {
        els.forEach((n, j) => { n.classList.toggle("is-done", j < i); n.classList.toggle("is-now", j === i); });
        segs.forEach((g, j) => g.classList.toggle("is-lit", j <= i));
        k.style.left = `${nodes[i][0]}px`; k.style.top = `${nodes[i][1]}px`;
        await wait(1200);
      }
      await go(".bp-node.is-now", false);
    },
    async (p, go) => { p.screen("course"); await go('.bp-tile[data-act="panel:overview"]'); await go(".bp-lessons li:nth-child(2) .bp-info"); await go(".bp-pretest .bp-btn"); },
    async (p, go) => { p.screen("course"); p.tab("goals"); await go('.bp-tile[data-act="review:goals"]'); await go(".bp-goals li:nth-child(2)"); await go(".bp-goals li:nth-child(4)"); },
    async (p, go) => { p.screen("course"); p.tab("mistakes"); p.panel("review"); await wait(500); await go('.bp-opts--mis [data-n="3"]'); await go('.bp-opts--mis [data-n="5"]'); await go(".bp-explain"); },
    async (p, go) => { p.screen("home"); await go(".bp-calbtn"); await go('.bp-cal__grid [data-d="7"]'); await go('.bp-times [data-h="9:00"]'); await go(".bp-cal__side .bp-btn--green"); },
    async (p, go) => { p.screen("lesson"); await go('.bp-q .bp-opts [data-n="6"]'); await go(".bp-lesson .bp-qa"); await go('.bp-chat__chips [data-q="0"]'); await wait(2600); await go('.bp-q .bp-opts [data-n="4"]'); await go(".bp-check"); },
  ];

  function Demo(root) {
    const scene = root.closest("[data-scene]");
    let p = Proto(root), token = 0, beat = -1, visible = false;
    const play = async (b) => {
      const my = ++token;
      const alive = () => my === token && visible;
      while (alive()) {
        p.destroy(); p = Proto(root); root.classList.remove("chat-open", "mis-done", "explain-open");
        const c = p.cursor;
        c.style.transition = "none"; c.style.transform = `translate(${W * 0.62}px, ${H * 0.86}px)`; c.classList.add("is-on");
        await wait(60);
        c.style.transition = "";
        // move the pointer to an element, then optionally click it
        const go = async (sel, click = true) => {
          if (!alive()) throw 0;
          await wait(reduce ? 0 : 650);
          const el = p.$(sel); if (!el || !alive()) throw 0;
          const r = p.rel(el);
          c.style.transform = `translate(${r.x}px, ${r.y}px)`;
          await wait(reduce ? 0 : 850);
          if (!alive()) throw 0;
          if (click) { c.classList.remove("is-press"); void c.offsetWidth; c.classList.add("is-press"); p.run(el); }
          else el.classList.add("is-hover");
          await wait(reduce ? 0 : 450);
          if (!click) el.classList.remove("is-hover");
        };
        try { await scripts[b](p, go, alive); await wait(2400); } catch (e) { return; }
      }
    };
    const sync = () => {
      const b = Number(scene.dataset.beat) || 0;
      if (b === beat && token) return;
      beat = b;
      if (visible) play(b);
    };
    new MutationObserver(sync).observe(scene, { attributes: true, attributeFilter: ["data-beat"] });
    new IntersectionObserver(([e]) => {
      const was = visible; visible = e.isIntersecting;
      if (visible && !was) { beat = -1; sync(); }
      if (!visible) token++;
    }, { threshold: 0.3 }).observe(root);
  }

  document.querySelectorAll("[data-bp]").forEach((root) => (root.dataset.bp === "demo" ? Demo(root) : Proto(root)));
})();
