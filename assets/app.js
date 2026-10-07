/* Online Course in Dental Traumatology — static single-page player.
   Content: content/course.json · answer key: content/key.json · settings: config.js */
(function () {
  "use strict";
  const CFG = window.COURSE_CONFIG || {};
  const app = document.getElementById("app");
  const REVIEW = new URLSearchParams(location.search).has("review");
  const POINTS = 1000;
  let COURSE = null, KEY = {};

  // ---------- storage (per-browser convenience only) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("dtc:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("dtc:" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const answers = store.get("answers", {});
  // answers saved by the first version of the site (before answer checking) have no "ok" field: forget them
  if (store.get("format", 0) < 2) {
    Object.keys(answers).forEach((id) => { const v = answers[id]; if (v && !("ok" in v) && !("points" in v) && typeof v.value !== "number" && typeof v.value !== "string") delete answers[id]; });
    store.set("answers", answers); store.set("format", 2);
  }
  const seen = store.get("seen", {});
  const saveAnswer = (id, v) => { answers[id] = v; store.set("answers", answers); updateScore(); };
  const markSeen = (id) => { if (!seen[id]) { seen[id] = 1; store.set("seen", seen); } };
  // points belong to a lesson: slide ids look like "L4-S8"
  const lessonScore = (n) => Object.entries(answers).reduce((a, [id, v]) => a + (id.startsWith(`L${n}-`) && v && v.points ? v.points : 0), 0);
  const currentLesson = () => { const p = location.hash.split("/"); return p[1] === "lesson" ? p[2] : null; };

  // ---------- tiny, safe markdown ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function inline(s) {
    let t = esc(s);
    t = t.replace(/&lt;(u|sup|sub|strong|em|b|i)&gt;([\s\S]*?)&lt;\/\1&gt;/g, "<$1>$2</$1>")
         .replace(/&lt;br\s*\/?&gt;/g, "<br>")
         .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
         .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
         .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }
  function table(rows) {
    const cells = (r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    return `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
      body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") + "</tbody></table>";
  }
  // imgFn(n) → html for {{img:n}} tokens
  function md(src, imgFn) {
    if (!src) return "";
    const lines = String(src).replace(/\r/g, "").split("\n");
    let html = "", list = null, para = [];
    const flushP = () => { if (para.length) { html += "<p>" + para.map(inline).join("<br>") + "</p>"; para = []; } };
    const flushL = () => { if (list) { html += `</${list}>`; list = null; } };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trimEnd();
      let m;
      if (!l.trim()) { flushP(); flushL(); continue; }
      if ((m = l.match(/^\s*\{\{img:(\d+)\}\}\s*$/))) { flushP(); flushL(); html += imgFn ? imgFn(+m[1]) : ""; continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        flushP(); flushL(); const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
        i--; html += table(rows); continue;
      }
      if ((m = l.match(/^#{1,4}\s+(.*)$/))) { flushP(); flushL(); html += `<h3>${inline(m[1])}</h3>`; continue; }
      if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) { flushP(); if (list !== "ul") { flushL(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = l.match(/^\s*(\d+)[.)]\s+(.*)$/))) { flushP(); if (list !== "ol") { flushL(); html += `<ol start="${m[1]}">`; list = "ol"; } html += `<li>${inline(m[2])}</li>`; continue; }
      flushL(); para.push(l.trim());
    }
    flushP(); flushL();
    return `<div class="md">${html}</div>`.replace(/\{\{img:(\d+)\}\}/g, (_, n) => (imgFn ? imgFn(+n) : ""));
  }

  // ---------- helpers ----------
  const h = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };
  const lessonById = (n) => COURSE.lessons.find((l) => String(l.n) === String(n));
  const progress = (L) => { const s = L.slides.length || 1; return L.slides.filter((x) => seen[x.id]).length / s; };
  const fmt = (n) => n.toLocaleString("en-GB");
  function toast(msg) {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const t = h(`<div class="toast" role="status">${msg}</div>`); document.body.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  }
  function updateScore() {
    const el = document.getElementById("score"), pill = el && el.closest(".score-pill");
    if (!el) return;
    const n = currentLesson();
    pill.hidden = !n || !lessonPoints(n);
    if (n) { el.textContent = fmt(lessonScore(n)); pill.title = `Your score in lesson ${n}`; }
  }
  // lessons with scored questions
  const lessonPoints = (n) => { const L = COURSE && lessonById(n); return L ? L.slides.some((s) => ANSWER_TYPES.includes(s.type) && KEY[s.id]) : false; };

  function figure(img, slideId) {
    const vid = CFG.videos && CFG.videos[slideId];
    const alt = img.alt || img.caption || (img.kind === "radiograph" ? "Radiograph" : img.kind === "clinical" ? "Clinical photograph" : "Illustration");
    const cap = img.caption ? `<figcaption>${inline(img.caption)}</figcaption>` : "";
    if (img.video && vid) return `<figure><video controls preload="metadata" poster="${esc(img.src)}" src="${esc(vid)}" style="max-width:100%;border-radius:12px"></video>${cap}</figure>`;
    return `<figure>${img.video ? '<span class="video-ph">' : ""}<img loading="lazy" src="${esc(img.src)}" alt="${esc(alt)}" data-zoom>${img.video ? "</span>" : ""}${cap}` +
      `${img.video ? '<div class="note">Video — to be added from the original course files</div>' : ""}</figure>`;
  }
  // images not placed inline with {{img:n}}
  function restImages(list, used, sid) {
    const rest = (list || []).filter((_, i) => !used.has(i));
    if (!rest.length) return "";
    const inner = rest.map((i) => figure(i, sid)).join("");
    return rest.length > 1 && rest.every((i) => !i.caption) ? `<div class="gallery">${inner}</div>` : inner;
  }
  function richText(text, imgs, sid) {
    const used = new Set();
    const html = md(text, (n) => { if (!imgs || !imgs[n]) return ""; used.add(n); return figure(imgs[n], sid); });
    return { html, used };
  }

  // ---------- answer key ----------
  const ANSWER_TYPES = ["quiz_single", "quiz_multi", "true_false", "statements", "number", "ordering", "matching", "blanks"];
  function keyFor(s) {
    const k = KEY[s.id];
    if (!k || k.correct == null || (Array.isArray(k.correct) && !k.correct.length)) return null;
    const lesson = +s.id.split("-")[0].slice(1);
    if ((CFG.hideAnswersInLessons || []).includes(lesson) && !REVIEW) return null;
    return k.approved || REVIEW ? k : null;
  }
  function feedbackHtml(ok, k, extra) {
    const why = [extra, k.explanation ? inline(k.explanation) : ""].filter(Boolean).join(" ");
    return `<div class="feedback ${ok ? "ok" : "no"}" role="status"><div class="head">${ok ? "✓ That's correct!" : "✕ Not quite."}${ok ? `<span class="points">+${fmt(POINTS)}</span>` : ""}</div>` +
      `${why ? `<div class="why">${why}</div>` : ""}${k.source ? `<span class="src">Source: ${inline(k.source)}</span>` : ""}</div>`;
  }
  const record = (s, value, ok, extra) => { saveAnswer(s.id, { value, ok, points: ok ? POINTS : 0, ...(extra || {}) }); retryButton(s); };
  // "Try again": forget this question's answer and redraw the slide
  function retryButton(s) {
    const el = document.getElementById("slide");
    if (!el || !answers[s.id] || el.querySelector(".retry")) return;
    const b = h(`<button type="button" class="btn ghost retry" style="margin-top:14px">↻ Try again</button>`);
    b.onclick = () => { delete answers[s.id]; store.set("answers", answers); updateScore(); route(); };
    const res = el.querySelector(".result-card, .submit-card");
    res ? res.before(b) : el.appendChild(b);
  }

  // ---------- choice questions ----------
  function renderChoice(s, el) {
    const multi = s.type === "quiz_multi" || s.multi;
    const opts = s.options || [];
    const prev = answers[s.id];
    let sel = new Set(prev ? prev.value : []);
    const box = h(`<div><div class="q-kind">${multi ? "Select all that apply" : "Select the best response"}</div><div class="q">${inline(s.question || s.title || "")}</div>
      <div class="qimg"></div><div class="opts ${multi ? "multi" : ""}" role="${multi ? "group" : "radiogroup"}"></div>
      <button class="btn check">Check answer</button><div class="fb"></div></div>`);
    box.querySelector(".qimg").innerHTML = (s.images || []).filter((i) => i.option == null).map((i) => figure(i, s.id)).join("");
    const optImgs = (s.images || []).filter((i) => i.option != null);
    const wrap = box.querySelector(".opts");
    opts.forEach((o, i) => {
      const im = optImgs.find((x) => x.option === i);
      const b = h(`<button type="button" class="opt" role="${multi ? "checkbox" : "radio"}"><span class="box"></span><span>${inline(o)}${im ? `<img class="opt-img" src="${esc(im.src)}" alt="${esc(im.alt || o)}">` : ""}</span></button>`);
      b.onclick = () => {
        if (box.dataset.locked) return;
        if (multi) { sel.has(i) ? sel.delete(i) : sel.add(i); } else { sel = new Set([i]); }
        paint();
      };
      wrap.appendChild(b);
    });
    const btns = () => [...wrap.children];
    function paint() {
      btns().forEach((b, i) => { b.classList.toggle("sel", sel.has(i)); b.setAttribute("aria-checked", sel.has(i)); });
      box.querySelector(".check").disabled = sel.size === 0 || !!box.dataset.locked;
    }
    function lock(fresh) {
      box.dataset.locked = 1;
      btns().forEach((b) => (b.disabled = true));
      box.querySelector(".check").hidden = true;
      const k = keyFor(s), fb = box.querySelector(".fb");
      if (k) {
        const right = new Set(k.correct);
        btns().forEach((b, i) => { b.classList.remove("sel"); if (right.has(i)) b.classList.add("right"); else if (sel.has(i)) b.classList.add("wrong"); });
        const ok = right.size === sel.size && [...sel].every((i) => right.has(i));
        if (fresh) record(s, [...sel], ok, { labels: [...sel].map((i) => opts[i]) });
        fb.innerHTML = feedbackHtml(ok, k);
      } else {
        if (fresh) record(s, [...sel], null, { labels: [...sel].map((i) => opts[i]) });
        fb.innerHTML = `<div class="feedback info">Answer saved.</div>`;
      }
    }
    box.querySelector(".check").onclick = () => lock(true);
    paint();
    if (prev) lock(false);
    el.appendChild(box);
  }

  // ---------- true/false: swipe stack (several statements) ----------
  function renderSwipe(s, el) {
    const st = s.statements || [];
    const k = keyFor(s);
    const prev = (answers[s.id] && answers[s.id].value) || {};
    const box = h(`<div><div class="q-kind">True or false?</div>${s.question ? `<div class="q">${inline(s.question)}</div>` : s.body ? "" : `<div class="q">Swipe the true statements to the right and the false statements to the left.</div>`}
      <div class="swipe-wrap"><div class="swipe-side l">FALSE</div><div class="swipe-side r">TRUE</div><div class="swipe-stage"></div></div>
      <div class="swipe-btns"><button class="f" type="button">← False</button><button class="t" type="button">True →</button></div>
      <div class="swipe-progress"></div><div class="swipe-log"></div><div class="summary"></div></div>`);
    const stage = box.querySelector(".swipe-stage"), log = box.querySelector(".swipe-log");
    const state = { ...prev };
    let idx = st.findIndex((_, i) => state[i] == null); if (idx < 0) idx = st.length;

    function logRow(i, v) {
      const right = k && k.correct ? k.correct[i] : null;
      const ok = right ? right === v : null;
      const ex = k && k.explanations && k.explanations[i];
      log.appendChild(h(`<div class="row ${ok === false ? "no" : ok ? "ok" : ""}"><span class="tag">${v === "T" ? "TRUE" : "FALSE"}</span>
        <div>${inline(st[i])}${ok === false ? `<small>✕ This statement is ${right === "T" ? "true" : "false"}.${ex ? " " + inline(ex) : ""}</small>` : ok ? `<small>✓ Correct${ex ? " — " + inline(ex) : ""}</small>` : ""}</div></div>`));
      return ok;
    }
    function finish() {
      setTimeout(() => retryButton(s), 0);
      box.querySelector(".swipe-btns").hidden = true; stage.parentElement.hidden = true;
      box.querySelector(".swipe-progress").textContent = "";
      if (k && k.correct) {
        const n = st.filter((_, i) => state[i] === k.correct[i]).length;
        box.querySelector(".summary").innerHTML = `You got <b>${n} / ${st.length}</b> right.` + (k.explanation ? `<div class="feedback info" style="text-align:left">${inline(k.explanation)}</div>` : "");
      }
    }
    function draw() {
      stage.innerHTML = "";
      box.querySelector(".swipe-progress").textContent = idx < st.length ? `Card ${idx + 1} of ${st.length}` : "";
      for (let j = Math.min(st.length - 1, idx + 2); j >= idx; j--) {
        const c = h(`<div class="swipe-card ${j === idx + 1 ? "behind" : j === idx + 2 ? "behind2" : ""}"><span class="stamp t">TRUE</span><span class="stamp f">FALSE</span><div>${inline(st[j])}</div></div>`);
        stage.appendChild(c);
        if (j === idx) drag(c);
      }
    }
    function decide(v, card) {
      const i = idx; state[i] = v;
      if (card) { card.style.transform = `translateX(${v === "T" ? 140 : -140}%) rotate(${v === "T" ? 18 : -18}deg)`; card.style.opacity = 0; }
      const ok = logRow(i, v);
      if (ok) toast(`+${fmt(POINTS)}`);
      const pts = k && k.correct ? st.filter((_, j) => state[j] != null && state[j] === k.correct[j]).length * POINTS : 0;
      saveAnswer(s.id, { value: { ...state }, points: pts, ok: k && k.correct ? st.every((_, j) => state[j] === k.correct[j]) : null });
      idx++;
      setTimeout(() => (idx < st.length ? draw() : finish()), card ? 260 : 0);
    }
    function drag(card) {
      let x0 = null, dx = 0;
      const t = card.querySelector(".stamp.t"), f = card.querySelector(".stamp.f");
      card.addEventListener("pointerdown", (e) => { x0 = e.clientX; card.setPointerCapture(e.pointerId); card.classList.add("drag"); });
      card.addEventListener("pointermove", (e) => {
        if (x0 == null) return; dx = e.clientX - x0;
        card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
        t.style.opacity = Math.max(0, Math.min(1, dx / 90)); f.style.opacity = Math.max(0, Math.min(1, -dx / 90));
      });
      const up = () => {
        if (x0 == null) return; x0 = null; card.classList.remove("drag");
        if (Math.abs(dx) > 90) decide(dx > 0 ? "T" : "F", card);
        else { card.style.transform = ""; t.style.opacity = f.style.opacity = 0; }
        dx = 0;
      };
      card.addEventListener("pointerup", up); card.addEventListener("pointercancel", up);
    }
    box.querySelector(".swipe-btns .t").onclick = () => idx < st.length && decide("T", stage.lastElementChild);
    box.querySelector(".swipe-btns .f").onclick = () => idx < st.length && decide("F", stage.lastElementChild);
    st.forEach((_, i) => { if (state[i] != null && i < idx) logRow(i, state[i]); });
    el.appendChild(box);
    idx < st.length ? draw() : finish();
  }

  // ---------- true/false: drag one statement into a category ----------
  function renderDragCategory(s, el) {
    const stmt = (s.statements || [])[0] || "";
    const k = keyFor(s);
    const prev = answers[s.id] && answers[s.id].value;
    const box = h(`<div><div class="q-kind">Drag to the correct category</div><div class="q">${inline(s.question || "Is the following statement true or false?")}</div>
      <div class="qimg"></div>
      <div class="dz-wrap"><div class="dz true-z" data-v="T">TRUE</div><div class="chip">${inline(stmt)}</div><div class="dz false-z" data-v="F">FALSE</div></div>
      <div class="hint dz-hint" style="text-align:center;margin-top:8px">Drag the card — or tap TRUE / FALSE.</div><div class="fb"></div></div>`);
    box.querySelector(".qimg").innerHTML = (s.images || []).map((i) => figure(i, s.id)).join("");
    const chip = box.querySelector(".chip"), zones = [...box.querySelectorAll(".dz")];
    function done(v, fresh) {
      const z = zones.find((x) => x.dataset.v === v);
      z.classList.add("hit");
      chip.style.transform = ""; chip.classList.remove("drag");
      chip.style.boxShadow = "none"; chip.style.cursor = "default";
      z.insertAdjacentElement(v === "T" ? "afterend" : "beforebegin", chip);
      box.querySelector(".dz-hint").hidden = true;
      const right = k && k.correct ? k.correct[0] : null;
      const ok = right ? right === v : null;
      if (fresh) { record(s, { 0: v }, ok); if (ok) toast(`+${fmt(POINTS)}`); }
      box.querySelector(".fb").innerHTML = right ? feedbackHtml(ok, k, ok ? "" : `This statement is <b>${right === "T" ? "true" : "false"}</b>.`) : `<div class="feedback info">Answer saved.</div>`;
      zones.forEach((x) => (x.onclick = null)); box.dataset.locked = 1;
    }
    let x0 = null, y0;
    chip.addEventListener("pointerdown", (e) => { if (box.dataset.locked) return; x0 = e.clientX; y0 = e.clientY; chip.setPointerCapture(e.pointerId); chip.classList.add("drag"); });
    chip.addEventListener("pointermove", (e) => {
      if (x0 == null) return;
      chip.style.transform = `translate(${e.clientX - x0}px,${e.clientY - y0}px) rotate(${(e.clientX - x0) / 30}deg)`;
      zones.forEach((z) => { const r = z.getBoundingClientRect(); z.classList.toggle("over", e.clientY > r.top - 10 && e.clientY < r.bottom + 10); });
    });
    const up = () => {
      if (x0 == null) return; x0 = null; chip.classList.remove("drag");
      const z = zones.find((z) => z.classList.contains("over")); zones.forEach((q) => q.classList.remove("over"));
      if (z) done(z.dataset.v, true); else { chip.classList.add("back"); chip.style.transform = ""; setTimeout(() => chip.classList.remove("back"), 260); }
    };
    chip.addEventListener("pointerup", up); chip.addEventListener("pointercancel", up);
    zones.forEach((z) => (z.onclick = () => done(z.dataset.v, true)));
    el.appendChild(box);
    if (prev && prev[0]) done(prev[0], false);
  }

  // ---------- matching (tap a term, then its definition) ----------
  const PAIR_COLORS = ["#2f5d9a", "#0d8a74", "#b5651d", "#8e44ad", "#c0392b", "#2c3e50"];
  function renderMatching(s, el) {
    if (s.groups) return renderGroups(s, el);
    const terms = s.terms || [];
    const opts = s.options || [];
    const prev = answers[s.id] && answers[s.id].value;
    let pairs = prev ? [...prev] : terms.map(() => null), pick = null;
    const box = h(`<div><div class="q-kind">Match the pairs</div><div class="q">${inline(s.question || "Match each term with its definition")}</div>
      <div class="hint">Tap a term, then tap its definition.</div>
      <div class="match"><div class="match-col terms"></div><div class="match-col defs"></div></div>
      <div class="btn-row" style="margin-top:14px"><button class="btn check" disabled>Check answers</button><button class="btn ghost reset">Clear</button></div><div class="fb"></div></div>`);
    const tc = box.querySelector(".terms"), dc = box.querySelector(".defs");
    const tEls = terms.map((t, i) => { const b = h(`<button type="button" class="mitem term">${inline(t)}</button>`); b.onclick = () => { if (box.dataset.locked) return; pick = i; paint(); }; tc.appendChild(b); return b; });
    const dEls = opts.map((o, j) => { const b = h(`<button type="button" class="mitem">${inline(o)}</button>`); b.onclick = () => {
      if (box.dataset.locked || pick == null) return; pairs = pairs.map((p) => (p === j ? null : p)); pairs[pick] = j; pick = pairs.indexOf(null) >= 0 ? pairs.indexOf(null) : null; paint(); }; dc.appendChild(b); return b; });
    function paint() {
      tEls.forEach((b, i) => { b.classList.toggle("pick", pick === i); const old = b.querySelector(".badge"); if (old) old.remove();
        if (pairs[i] != null) b.appendChild(h(`<span class="badge" style="background:${PAIR_COLORS[i % 6]}">${i + 1}</span>`)); });
      dEls.forEach((b, j) => { const old = b.querySelector(".badge"); if (old) old.remove(); const i = pairs.indexOf(j);
        if (i >= 0) b.appendChild(h(`<span class="badge" style="background:${PAIR_COLORS[i % 6]}">${i + 1}</span>`)); });
      box.querySelector(".check").disabled = pairs.some((p) => p == null) || !!box.dataset.locked;
    }
    function lock(fresh) {
      box.dataset.locked = 1; box.querySelector(".btn-row").hidden = true; tEls.forEach((b) => b.classList.remove("pick"));
      const k = keyFor(s);
      if (!k) { if (fresh) record(s, pairs, null); box.querySelector(".fb").innerHTML = `<div class="feedback info">Answers saved.</div>`; return; }
      let n = 0;
      tEls.forEach((b, i) => { const ok = pairs[i] === k.correct[i]; n += ok; b.classList.add(ok ? "right" : "wrong");
        if (!ok) b.appendChild(h(`<small>→ ${inline(opts[k.correct[i]])}</small>`)); });
      if (fresh) record(s, pairs, n === terms.length);
      box.querySelector(".fb").innerHTML = feedbackHtml(n === terms.length, k, `${n} of ${terms.length} pairs correct.`);
    }
    box.querySelector(".reset").onclick = () => { pairs = terms.map(() => null); pick = 0; paint(); };
    box.querySelector(".check").onclick = () => lock(true);
    pick = prev ? null : 0; paint(); if (prev) lock(false);
    el.appendChild(box);
  }
  // one choice per item (e.g. splinting time for each injury)
  function renderGroups(s, el) {
    const prev = (answers[s.id] && answers[s.id].value) || [];
    const sel = s.terms.map((_, i) => (prev[i] != null ? prev[i] : null));
    const box = h(`<div><div class="q-kind">Choose one answer for each</div><div class="q">${inline(s.question || s.title || "")}</div><div class="groups"></div>
      <button class="btn check" disabled>Check answers</button><div class="fb"></div></div>`);
    const g = box.querySelector(".groups");
    const rows = s.terms.map((t, i) => {
      const row = h(`<div style="margin:16px 0"><div style="font-weight:700;margin-bottom:6px">${inline(t)}</div><div class="opts" style="margin:6px 0"></div></div>`);
      s.groups[i].forEach((o, j) => { const b = h(`<button type="button" class="opt"><span class="box"></span><span>${inline(o)}</span></button>`);
        b.onclick = () => { if (box.dataset.locked) return; sel[i] = j; paint(); }; row.querySelector(".opts").appendChild(b); });
      g.appendChild(row); return row;
    });
    function paint() { rows.forEach((r, i) => [...r.querySelectorAll(".opt")].forEach((b, j) => b.classList.toggle("sel", sel[i] === j)));
      box.querySelector(".check").disabled = sel.some((x) => x == null) || !!box.dataset.locked; }
    function lock(fresh) {
      box.dataset.locked = 1; box.querySelector(".check").hidden = true;
      const k = keyFor(s); let n = 0;
      rows.forEach((r, i) => [...r.querySelectorAll(".opt")].forEach((b, j) => { b.disabled = true;
        if (k) { b.classList.remove("sel"); if (k.correct[i] === j) b.classList.add("right"); else if (sel[i] === j) b.classList.add("wrong"); } }));
      if (k) n = sel.filter((x, i) => x === k.correct[i]).length;
      if (fresh) record(s, sel, k ? n === sel.length : null);
      box.querySelector(".fb").innerHTML = k ? feedbackHtml(n === sel.length, k) : `<div class="feedback info">Answers saved.</div>`;
    }
    box.querySelector(".check").onclick = () => lock(true);
    paint(); if (prev.length) lock(false);
    el.appendChild(box);
  }

  // ---------- ordering (tap in order) ----------
  function renderOrdering(s, el) {
    const opts = s.options || [];
    let order = (answers[s.id] && answers[s.id].value) || [];
    const box = h(`<div><div class="q-kind">Put the items in the correct order</div><div class="q">${inline(s.question || s.title)}</div>
      <div class="hint">Tap the options in order (1 = most preferable). Leave out any that are not suitable.</div>
      <div class="order-list"></div><div class="btn-row"><button class="btn check">Check answer</button><button class="btn ghost undo">Clear</button></div><div class="fb"></div></div>`);
    const wrap = box.querySelector(".order-list");
    opts.forEach((o, i) => {
      const b = h(`<button type="button" class="order-item"><span class="rank"></span><span>${inline(o)}</span></button>`);
      b.onclick = () => { if (box.dataset.locked) return; const p = order.indexOf(i); p >= 0 ? order.splice(p, 1) : order.push(i); paint(); };
      wrap.appendChild(b);
    });
    function paint() { [...wrap.children].forEach((b, i) => { const r = order.indexOf(i); b.classList.toggle("sel", r >= 0); b.querySelector(".rank").textContent = r >= 0 ? r + 1 : ""; });
      box.querySelector(".check").disabled = !order.length; }
    function lock(fresh) {
      box.dataset.locked = 1; box.querySelector(".btn-row").hidden = true;
      [...wrap.children].forEach((b) => (b.disabled = true));
      const k = keyFor(s), fb = box.querySelector(".fb");
      if (k) {
        const ok = JSON.stringify(order) === JSON.stringify(k.correct);
        if (fresh) record(s, order, ok, { labels: order.map((i) => opts[i]) });
        fb.innerHTML = feedbackHtml(ok, k, ok ? "" : `Correct order: <b>${k.correct.map((i) => esc(opts[i])).join(" › ")}</b>.`);
      } else { if (fresh) record(s, order, null); fb.innerHTML = `<div class="feedback info">Answer saved.</div>`; }
    }
    box.querySelector(".undo").onclick = () => { order = []; paint(); };
    box.querySelector(".check").onclick = () => lock(true);
    paint(); if (answers[s.id]) lock(false);
    el.appendChild(box);
  }

  // ---------- number ----------
  function renderNumber(s, el) {
    const prev = answers[s.id];
    const box = h(`<div><div class="q-kind">Enter a number</div><div class="q">${inline(s.question || s.title)}</div>
      <div class="num-row"><div class="stepper"><button type="button" aria-label="Decrease">−</button><input type="number" inputmode="numeric" min="0" value="0" aria-label="Your answer"><button type="button" aria-label="Increase">+</button></div>
      <span class="hint" style="margin:0">${esc(s.unit || "")}</span><button class="btn check">Check answer</button></div><div class="fb"></div></div>`);
    const inp = box.querySelector("input"), [dn, upb] = box.querySelectorAll(".stepper button");
    dn.onclick = () => (inp.value = Math.max(0, (+inp.value || 0) - 5)); upb.onclick = () => (inp.value = (+inp.value || 0) + 5);
    function lock(v, fresh) {
      inp.value = v; inp.disabled = dn.disabled = upb.disabled = true; box.querySelector(".check").hidden = true;
      const k = keyFor(s), fb = box.querySelector(".fb");
      if (k) { const ok = +v === +k.correct; if (fresh) record(s, +v, ok); fb.innerHTML = feedbackHtml(ok, k, ok ? "" : `Answer: <b>${esc(k.correct)}</b> ${esc(s.unit || "")}.`); }
      else { if (fresh) record(s, +v, null); fb.innerHTML = `<div class="feedback info">Answer saved.</div>`; }
    }
    box.querySelector(".check").onclick = () => lock(inp.value || 0, true);
    if (prev) lock(prev.value, false);
    el.appendChild(box);
  }

  // ---------- fill the blanks ----------
  function renderBlanks(s, el) {
    const parts = String(s.question).split(/_+/);
    const prev = (answers[s.id] && answers[s.id].value) || [];
    const html = parts.map((p, i) => inline(p) + (i < parts.length - 1 ? `<input class="blank" data-i="${i}" inputmode="numeric" aria-label="Blank ${i + 1}">` : "")).join("");
    const box = h(`<div><div class="q-kind">Fill in the missing numbers</div><p class="q" style="line-height:2.3">${html}</p><button class="btn check">Check answer</button><div class="fb"></div></div>`);
    const inps = [...box.querySelectorAll("input")];
    inps.forEach((x, i) => { if (prev[i] != null) x.value = prev[i]; });
    const norm = (v) => String(v).trim().toLowerCase();
    function lock(fresh) {
      box.querySelector(".check").hidden = true; inps.forEach((x) => (x.disabled = true));
      const k = keyFor(s), fb = box.querySelector(".fb");
      const vals = inps.map((x) => x.value.trim());
      if (k) {
        const accept = (i) => [k.correct[i]].concat((k.accept || [])[i] || []).map(norm);
        const oks = vals.map((v, i) => accept(i).includes(norm(v)));
        inps.forEach((x, i) => x.classList.add(oks[i] ? "ok" : "no"));
        const ok = oks.every(Boolean);
        if (fresh) record(s, vals, ok);
        fb.innerHTML = feedbackHtml(ok, k, ok ? "" : `Answer: <b>${k.correct.map(esc).join(", ")}</b>.`);
      } else { if (fresh) record(s, vals, null); fb.innerHTML = `<div class="feedback info">Answer saved.</div>`; }
    }
    box.querySelector(".check").onclick = () => lock(true);
    if (prev.length) lock(false);
    el.appendChild(box);
  }

  // ---------- rating + free text ----------
  function renderSlider(s, el) {
    const v = answers[s.id] ? answers[s.id].value : null;
    const min = s.min ?? 0, max = s.max ?? 5;
    const box = h(`<div><div class="q-kind">Your opinion</div><div class="q">${inline(s.question || s.title)}</div><div class="likert">
      <div class="scale" role="radiogroup">${Array.from({ length: max - min + 1 }, (_, i) => `<button type="button" role="radio" data-v="${min + i}">${min + i}</button>`).join("")}</div>
      <div class="ends"><span>${esc(s.min_label || "")}</span><span>${esc(s.max_label || "")}</span></div></div></div>`);
    const bs = [...box.querySelectorAll(".scale button")];
    const paint = (x) => bs.forEach((b) => { b.classList.toggle("on", +b.dataset.v === x); b.setAttribute("aria-checked", +b.dataset.v === x); });
    bs.forEach((b) => (b.onclick = () => { saveAnswer(s.id, { value: +b.dataset.v }); paint(+b.dataset.v); }));
    if (v != null) paint(v);
    el.appendChild(box);
  }
  function renderFreeText(s, el) {
    const box = h(`<div><div class="q-kind">Your comments</div><div class="q">${inline(s.question || s.title)}</div><textarea aria-label="Your response" placeholder="Type your response…"></textarea><div class="hint">Saved automatically in this browser.</div></div>`);
    const t = box.querySelector("textarea");
    t.value = (answers[s.id] && answers[s.id].value) || "";
    t.oninput = () => saveAnswer(s.id, { value: t.value });
    el.appendChild(box);
  }

  // ---------- submission (consented, anonymous) ----------
  function participant() {
    let p = store.get("pid", null);
    if (!p) { p = "P-" + Math.random().toString(36).slice(2, 8).toUpperCase(); store.set("pid", p); }
    return p;
  }
  function submitCard(L) {
    if (!CFG.submitEndpoint || !(CFG.collectLessons || []).includes(L.n)) return "";
    const sent = store.get("sent", {})[L.n];
    return `<div class="submit-card" id="submit-card">
      <strong>Help us evaluate this course</strong>
      <p>You can send your answers for this lesson anonymously to the course team. No name or e-mail is collected; your answers are linked only to the random code <code>${participant()}</code>, which lets the team compare the baseline and final quizzes.</p>
      <label><input type="checkbox" id="consent"> I agree to my anonymous answers being used for teaching evaluation and research by the course team.</label>
      <button class="btn" id="send" disabled>${sent ? "Sent ✓ — send again" : "Send my answers"}</button> <span id="send-msg" class="hint"></span>
    </div>`;
  }
  function wireSubmit(L) {
    const c = document.getElementById("consent"); if (!c) return;
    const b = document.getElementById("send"), msg = document.getElementById("send-msg");
    c.onchange = () => (b.disabled = !c.checked);
    b.onclick = async () => {
      const payload = { participant: participant(), lesson: L.n, lesson_title: L.title, sent_at: new Date().toISOString(),
        answers: Object.fromEntries(L.slides.filter((s) => answers[s.id]).map((s) => [s.id, answers[s.id]])) };
      b.disabled = true; msg.textContent = "Sending…";
      try {
        await fetch(CFG.submitEndpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        const s = store.get("sent", {}); s[L.n] = payload.sent_at; store.set("sent", s);
        msg.textContent = "Thank you — your answers were sent.";
      } catch (e) { msg.textContent = "Could not send (are you offline?). Please try again."; b.disabled = false; }
    };
  }
  function resultCard(L) {
    const qs = L.slides.filter((s) => ANSWER_TYPES.includes(s.type) && keyFor(s));
    if (qs.length < 2) return "";
    const done = qs.filter((s) => answers[s.id]);
    const right = done.filter((s) => answers[s.id].ok).length;
    return `<div class="result-card"><div class="hint" style="margin:0">Your result in this lesson</div><div class="big">${right} / ${qs.length}</div>
      <div class="hint" style="margin:0">${done.length < qs.length ? `${qs.length - done.length} question(s) not answered yet` : right === qs.length ? "Perfect score!" : "Review the questions you missed."}</div></div>`;
  }

  // ---------- chrome ----------
  function frame(L, current) {
    const side = L ? `<aside class="side"><h4>Lessons</h4>${COURSE.lessons.map((x) =>
      `<a href="#/lesson/${x.n}/1" class="${x.n === L.n ? "on" : ""} ${progress(x) >= 1 ? "done" : ""}"><span class="n">${progress(x) >= 1 ? "✓" : x.n}</span><span>${inline(x.title)}</span></a>`).join("")}</aside>` : "";
    document.getElementById("shell").className = "shell" + (L ? " with-side" : "");
    document.getElementById("side-slot").outerHTML = `<div id="side-slot">${side}</div>`;
    document.getElementById("side-slot").style.display = L ? "" : "none";
    document.getElementById("lesson-progress").innerHTML = L ? `<i style="width:${Math.round((current / L.slides.length) * 100)}%"></i>` : "";
  }

  // ---------- views ----------
  function viewHome() {
    frame(null); document.getElementById("pager").innerHTML = "";
    document.title = COURSE.title;
    const items = COURSE.lessons.map((L) => {
      const p = progress(L);
      return `<li><a class="lesson-card ${p >= 1 ? "done" : ""}" href="#/lesson/${L.n}/1">
        <span class="lesson-num">${p >= 1 ? "✓" : L.n}</span>
        <span class="lesson-meta"><strong>${inline(L.title)}</strong><small>${L.slides.length} slides${p > 0 && p < 1 ? " · in progress" : p >= 1 ? " · completed" : ""}${lessonScore(L.n) ? ` · <span style="color:var(--gold);font-weight:700">★ ${fmt(lessonScore(L.n))}</span>` : ""}</small>
        <span class="bar"><i style="width:${Math.round(p * 100)}%"></i></span></span></a></li>`;
    }).join("");
    const next = COURSE.lessons.find((L) => progress(L) < 1) || COURSE.lessons[0];
    app.innerHTML = `<section class="hero"><div class="eyebrow">Dublin Dental University Hospital · Trinity College Dublin</div>
      <h1>${inline(COURSE.title)}</h1><p>${inline(COURSE.subtitle || "")}</p>
      <a class="btn" href="#/lesson/${next.n}/1">${Object.keys(seen).length ? "Continue learning →" : "Start the course →"}</a>
      <svg class="hero-tooth" viewBox="0 0 64 64" aria-hidden="true"><path d="M20 10c-8 0-12 6-11 15 1 8 4 12 5 21 1 7 5 9 8 3 3-8 4-13 10-13s7 5 10 13c3 6 7 4 8-3 1-9 4-13 5-21 1-9-3-15-11-15-6 0-8 3-12 3s-6-3-12-3z" fill="#fff"/></svg></section>
      <div class="section-title">Lessons</div><ol class="lessons">${items}</ol>`;
  }

  function viewAbout() {
    frame(null); document.getElementById("pager").innerHTML = "";
    document.title = "About — " + COURSE.title;
    app.innerHTML = `<article class="slide about">${md(COURSE.about || "")}
      ${CFG.contactEmail ? `<p>Questions: <a href="mailto:${esc(CFG.contactEmail)}">${esc(CFG.contactEmail)}</a></p>` : ""}
      <p class="hint">Your progress, answers and score are kept only in this browser. Clearing site data resets them.</p>
      <button class="btn ghost" id="reset">Reset my progress</button></article>`;
    document.getElementById("reset").onclick = () => {
      if (confirm("Reset all progress and answers stored in this browser?")) {
        ["answers", "seen", "sent", "pid"].forEach((k) => { try { localStorage.removeItem("dtc:" + k); } catch (e) {} });
        location.hash = "#/"; location.reload();
      }
    };
  }

  function viewSlide(n, k) {
    const L = lessonById(n);
    if (!L) return viewHome();
    k = Math.min(Math.max(1, k | 0), L.slides.length);
    const s = L.slides[k - 1];
    markSeen(s.id); frame(L, k);
    document.title = `${L.title} (${k}/${L.slides.length}) — ${COURSE.title}`;
    const intro = s.type === "intro";
    const nextL = lessonById(+L.n + 1);
    app.innerHTML = `<div class="crumbs"><span><a href="#/">Lessons</a> › Lesson ${L.n} · ${inline(L.title)}</span><span class="counter">${k} / ${L.slides.length}</span></div>
      <article class="slide ${intro ? "intro" : ""}" id="slide"></article>`;
    document.getElementById("pager").innerHTML = `<div class="pager-in">
        ${k > 1 ? `<a class="btn ghost" href="#/lesson/${L.n}/${k - 1}">← Back</a>` : `<a class="btn ghost" href="#/">← Lessons</a>`}
        <span class="pager-mid">Lesson ${L.n} · ${esc(L.title)}</span>
        ${k < L.slides.length ? `<a class="btn" id="next" href="#/lesson/${L.n}/${k + 1}">Continue →</a>`
          : nextL ? `<a class="btn" id="next" href="#/lesson/${nextL.n}/1">Next lesson →</a>` : `<a class="btn" id="next" href="#/">Finish ✓</a>`}</div>`;
    const el = document.getElementById("slide");
    if (intro && k === 1) el.insertAdjacentHTML("beforeend", `<span class="kicker">Lesson ${L.n}</span>`);
    const isQ = ANSWER_TYPES.includes(s.type) || ["slider", "free_text"].includes(s.type);
    if (s.title && !isQ) el.insertAdjacentHTML("beforeend", `<h2>${inline(s.title)}</h2>`);
    const rt = richText(s.body, s.images, s.id);
    if (s.body) el.insertAdjacentHTML("beforeend", rt.html);
    const leftovers = { ...s, images: (s.images || []).filter((_, i) => !rt.used.has(i)) };

    if (["quiz_single", "quiz_multi", "true_false"].includes(s.type)) renderChoice(leftovers, el);
    else if (s.type === "statements") (s.statements || []).length > 1 ? renderSwipe(s, el) : renderDragCategory(leftovers, el);
    else if (s.type === "slider") renderSlider(s, el);
    else if (s.type === "number") renderNumber(s, el);
    else if (s.type === "ordering") renderOrdering(s, el);
    else if (s.type === "matching") renderMatching(s, el);
    else if (s.type === "blanks") renderBlanks(s, el);
    else if (s.type === "free_text") renderFreeText(s, el);
    else if (s.type === "carousel" && (s.items || []).length) {
      const car = h(`<div class="carousel"><div class="car-track"></div></div>`), track = car.firstElementChild;
      s.items.forEach((it) => {
        const r = richText(it.body, it.images, s.id);
        track.appendChild(h(`<div class="car-panel">${it.heading && it.heading !== s.title ? `<h3 style="color:var(--brand);margin:.2em 0 .4em">${inline(it.heading)}</h3>` : ""}${restImages(it.images, r.used, s.id)}${r.html}</div>`));
      });
      const nav = h(`<div class="car-nav"><button class="icon-btn" aria-label="Previous">‹</button><div class="dots"></div><button class="icon-btn" aria-label="Next">›</button></div>`);
      const panels = [...track.children], dots = nav.querySelector(".dots");
      let cur = 0;
      const go = (i) => { cur = Math.max(0, Math.min(panels.length - 1, i)); track.style.transform = `translateX(${-100 * cur}%)`;
        car.style.height = panels[cur].offsetHeight + "px";
        [...dots.children].forEach((d, j) => d.classList.toggle("on", j === cur)); nav.firstElementChild.disabled = cur === 0; nav.lastElementChild.disabled = cur === panels.length - 1; };
      panels.forEach((_, i) => { const d = h(`<button aria-label="Panel ${i + 1}"></button>`); d.onclick = () => go(i); dots.appendChild(d); });
      nav.firstElementChild.onclick = () => go(cur - 1); nav.lastElementChild.onclick = () => go(cur + 1);
      let sx = null; track.addEventListener("pointerdown", (e) => (sx = e.clientX));
      track.addEventListener("pointerup", (e) => { if (sx != null && Math.abs(e.clientX - sx) > 50) go(cur + (e.clientX < sx ? 1 : -1)); sx = null; });
      el.appendChild(car); if (panels.length > 1) el.appendChild(nav); go(0);
      car.querySelectorAll("img").forEach((im) => im.addEventListener("load", () => go(cur)));
      window.addEventListener("resize", () => go(cur), { once: true });
      el.insertAdjacentHTML("beforeend", restImages(s.images, rt.used, s.id));
    } else {
      el.insertAdjacentHTML("beforeend", restImages(s.images, rt.used, s.id));
      (s.items || []).forEach((it) => {
        const r = richText(it.body, it.images, s.id);
        el.insertAdjacentHTML("beforeend", `<details class="acc"><summary>${inline(it.heading)}</summary><div class="acc-body">${restImages(it.images, r.used, s.id)}${r.html}</div></details>`);
      });
    }
    if (ANSWER_TYPES.includes(s.type) && answers[s.id]) retryButton(s);
    if (s.missing) el.insertAdjacentHTML("beforeend", `<p class="note">This interactive activity could not be recovered from the old platform and will be added from the original course files.</p>`);
    if (k === L.slides.length) { el.insertAdjacentHTML("beforeend", resultCard(L) + submitCard(L)); wireSubmit(L); }
    app.focus({ preventScroll: true }); window.scrollTo(0, 0);
  }

  function route() {
    const p = location.hash.replace(/^#\/?/, "").split("/");
    if (p[0] === "lesson") viewSlide(p[1], +p[2] || 1);
    else if (p[0] === "about") viewAbout();
    else viewHome();
    updateScore();
  }

  document.addEventListener("click", (e) => {
    const img = e.target.closest("img[data-zoom]");
    if (!img) return;
    const lb = h(`<div class="lightbox" role="dialog" aria-label="Image"><img src="${img.src}" alt="${esc(img.alt)}"></div>`);
    lb.onclick = () => lb.remove(); document.body.appendChild(lb);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".lightbox").forEach((x) => x.remove());
    if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName)) return;
    if (!location.hash.startsWith("#/lesson")) return;
    if (e.key === "ArrowRight") { const a = document.getElementById("next"); if (a) a.click(); }
    if (e.key === "ArrowLeft") { const a = document.querySelector(".pager-in .btn.ghost"); if (a) a.click(); }
  });

  if (REVIEW) document.getElementById("review-banner").hidden = false;
  Promise.all([
    fetch("content/course.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("content/key.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  ]).then(([c, k]) => { COURSE = c; KEY = k; window.addEventListener("hashchange", route); route(); })
    .catch(() => { app.innerHTML = "<p>Could not load the course content.</p>"; });
})();
