// Language: a saved choice wins, otherwise Chinese for visitors in a Chinese-speaking time zone.
// Pages stay written in English; each page's zh dictionary swaps the text in before main.js animates it.
(() => {
  const root = document.documentElement;
  const zones = /^(Asia\/(Shanghai|Chongqing|Chungking|Harbin|Urumqi|Kashgar|Hong_Kong|Macau|Taipei)|PRC|ROC)$/;
  let lang = null;
  try { lang = localStorage.getItem("lang"); } catch (e) {}
  if (lang !== "zh" && lang !== "en") {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    lang = zones.test(tz) ? "zh" : "en";
  }
  root.lang = lang === "zh" ? "zh-CN" : "en";
  root.classList.add(`lang-${lang}`);

  // Keys are a short FNV-1a hash of the English text, so dictionaries stay small and a changed sentence just falls back to English
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const hash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  };
  const ATTRS = ["alt", "aria-label", "title", "placeholder", "data-chapter", "data-label", "data-tag"];
  const SKIP = "script, style, noscript, [data-i18n-skip]";
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && /[A-Za-z]/.test(n.nodeValue));

  // A <wbr> after every Chinese word (punctuation stays with the word before it)
  const seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter("zh", { granularity: "word" }) : null;
  const wordBreaks = (el) => {
    if (!seg) return;
    const nodes = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) if (/[㐀-鿿]/.test(tw.currentNode.nodeValue)) nodes.push(tw.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      const parts = [...seg.segment(node.nodeValue)].map((s) => s.segment);
      parts.forEach((p, i) => {
        frag.append(p);
        const next = parts[i + 1];
        if (next && !/^[\p{P}\s]/u.test(next) && !/\s$/.test(p)) frag.append(document.createElement("wbr"));
      });
      node.replaceWith(frag);
    }
  };

  const apply = (dict) => {
    if (lang !== "zh" || !dict) return;
    const look = (s) => dict[hash(norm(s))];
    const walk = (el) => {
      for (const child of el.children) {
        if (child.matches(SKIP)) continue;
        if (hasText(child)) {
          const zh = look(child.textContent);
          if (zh !== undefined) {
            child.innerHTML = zh;
            // short lines (headings, taglines) balance, so none ends on a single stranded character,
            // and only break between words, never inside one
            if (child.textContent.length <= 48) {
              child.style.textWrap = "balance";
              if (!child.matches(".reveal-mask, .reveal-words")) { wordBreaks(child); child.style.wordBreak = "keep-all"; }
            }
            continue;
          }
        }
        walk(child);
      }
    };
    walk(document.body);
    for (const el of document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(","))) {
      if (el.closest(SKIP)) continue;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && /[A-Za-z]/.test(v)) { const zh = look(v); if (zh !== undefined) el.setAttribute(a, zh); }
      }
    }
    const t = look(document.title);
    if (t !== undefined) document.title = t;
    for (const m of document.querySelectorAll('meta[name="description"], meta[property^="og:"][property$="title"], meta[property="og:description"]')) {
      const zh = look(m.content || "");
      if (zh !== undefined) m.content = zh;
    }
  };

  const set = (next) => {
    try { localStorage.setItem("lang", next); } catch (e) {}
    location.reload();
  };
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".lang-btn");
    if (btn) set(lang === "zh" ? "en" : "zh");
  });

  window.__i18n = { lang, zh: lang === "zh", hash, norm, apply, set, t: (en, zh) => (lang === "zh" ? zh : en) };
})();
