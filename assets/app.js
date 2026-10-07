/* Online Course in Dental Traumatology — static single-page player.
   Content: content/course.json · answer key: content/key.json · settings: config.js */
(function () {
  "use strict";
  const CFG = window.COURSE_CONFIG || {};
  const app = document.getElementById("app");
  const REVIEW = new URLSearchParams(location.search).has("review");
  let COURSE = null, KEY = {};

  // ---------- storage (per-browser convenience only) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("dtc:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("dtc:" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const answers = store.get("answers", {});
  const seen = store.get("seen", {});
  const saveAnswer = (id, v) => { answers[id] = v; store.set("answers", answers); };
  const markSeen = (id) => { if (!seen[id]) { seen[id] = 1; store.set("seen", seen); } };

  // ---------- tiny, safe markdown ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function inline(s) {
    let t = esc(s);
    t = t.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
         .replace(/&lt;sup&gt;([\s\S]*?)&lt;\/sup&gt;/g, "<sup>$1</sup>")
         .replace(/&lt;sub&gt;([\s\S]*?)&lt;\/sub&gt;/g, "<sub>$1</sub>")
         .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
         .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
         .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }
  function md(src) {
    if (!src) return "";
    const lines = String(src).replace(/\r/g, "").split("\n");
    let html = "", list = null, para = [];
    const flushP = () => { if (para.length) { html += "<p>" + para.map(inline).join("<br>") + "</p>"; para = []; } };
    const flushL = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const l = raw.trimEnd();
      let m;
      if (!l.trim()) { flushP(); flushL(); continue; }
      if ((m = l.match(/^#{1,4}\s+(.*)$/))) { flushP(); flushL(); html += `<h3>${inline(m[1])}</h3>`; continue; }
      if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) { flushP(); if (list !== "ul") { flushL(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = l.match(/^\s*(\d+)[.)]\s+(.*)$/))) { flushP(); if (list !== "ol") { flushL(); html += `<ol start="${m[1]}">`; list = "ol"; } html += `<li>${inline(m[2])}</li>`; continue; }
      flushL(); para.push(l.trim());
    }
    flushP(); flushL();
    return `<div class="md">${html}</div>`;
  }

  // ---------- helpers ----------
  const h = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; };
  const lessonById = (n) => COURSE.lessons.find((l) => String(l.n) === String(n));
  const progress = (L) => { const s = L.slides.length || 1; return L.slides.filter((x) => seen[x.id]).length / s; };

  function figure(img, slideId) {
    const vid = CFG.videos && CFG.videos[slideId];
    if (img.video && vid) {
      return `<figure><video controls preload="metadata" poster="${esc(img.src)}" src="${esc(vid)}" style="max-width:100%;border-radius:8px"></video>${img.caption ? `<figcaption>${inline(img.caption)}</figcaption>` : ""}</figure>`;
    }
    const alt = img.caption || (img.kind === "radiograph" ? "Radiograph" : img.kind === "clinical" ? "Clinical photograph" : "Illustration");
    return `<figure>${img.video ? '<span class="video-ph">' : ""}<img loading="lazy" src="${esc(img.src)}" alt="${esc(alt)}">${img.video ? "</span>" : ""}` +
      `${img.caption ? `<figcaption>${inline(img.caption)}</figcaption>` : ""}` +
      `${img.video ? '<div class="note">Video — to be added from the original course files</div>' : ""}</figure>`;
  }
  const figures = (s) => (s.images || []).filter((i) => i.kind !== "logo" || true).map((i) => figure(i, s.id)).join("");

  // ---------- quiz ----------
  const QUIZ = ["quiz_single", "quiz_multi", "true_false"];
  function keyFor(id) {
    const k = KEY[id];
    if (!k || k.correct == null || (Array.isArray(k.correct) && !k.correct.length)) return null;
    if (k.approved || REVIEW) return k;
    return null;
  }
  function feedbackHtml(ok, k) {
    const why = k.explanation ? `<div class="why">${inline(k.explanation)}${k.source ? ` <em>(${inline(k.source)})</em>` : ""}</div>` : "";
    const tag = !k.approved ? ' <span class="note">proposed — awaiting author review</span>' : "";
    return `<div class="feedback ${ok ? "ok" : "no"}"><strong>${ok ? "That's correct!" : "Not quite."}</strong>${tag}${why}</div>`;
  }

  function renderChoice(s, el) {
    const multi = s.type === "quiz_multi" || s.multi;
    const opts = s.options || [];
    const prev = answers[s.id];
    let sel = new Set(prev ? prev.value : []);
    const box = h(`<div><div class="q">${inline(s.question || s.title || "")}</div>
      <div class="hint">${multi ? "You can select more than one answer." : "Select the best response."}</div>
      <div class="opts ${multi ? "multi" : ""}" role="${multi ? "group" : "radiogroup"}"></div>
      <button class="btn check">Check answer</button><div class="fb"></div></div>`);
    const wrap = box.querySelector(".opts");
    opts.forEach((o, i) => {
      const b = h(`<button type="button" class="opt" role="${multi ? "checkbox" : "radio"}"><span class="box"></span><span>${inline(o)}</span></button>`);
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
    function lock() {
      box.dataset.locked = 1;
      btns().forEach((b) => (b.disabled = true));
      box.querySelector(".check").hidden = true;
      const k = keyFor(s.id), fb = box.querySelector(".fb");
      if (k) {
        const right = new Set(k.correct);
        btns().forEach((b, i) => { if (right.has(i)) b.classList.add("right"); else if (sel.has(i)) b.classList.add("wrong"); });
        const ok = right.size === sel.size && [...sel].every((i) => right.has(i));
        fb.innerHTML = feedbackHtml(ok, k);
      } else {
        fb.innerHTML = `<div class="feedback info">Answer recorded.</div>`;
      }
    }
    box.querySelector(".check").onclick = () => {
      saveAnswer(s.id, { value: [...sel], labels: [...sel].map((i) => opts[i]) });
      lock();
    };
    paint();
    if (prev) lock();
    el.appendChild(box);
  }

  // statements judged True / False one by one (swipe cards / drag-to-category in the original app)
  function renderStatements(s, el) {
    const k = keyFor(s.id);
    const prev = (answers[s.id] && answers[s.id].value) || {};
    el.appendChild(h(`<div class="q">${inline(s.question || s.title || "True or false?")}</div>`));
    (s.statements || []).forEach((st, i) => {
      const card = h(`<div class="tf-card"><p>${inline(st)}</p><div class="tf-btns">
        <button type="button" class="opt" data-v="T">True</button><button type="button" class="opt" data-v="F">False</button></div><div class="fb"></div></div>`);
      const show = (v) => {
        card.querySelectorAll(".opt").forEach((b) => { b.disabled = true; b.classList.toggle("sel", b.dataset.v === v); });
        if (k && k.correct && k.correct[i]) {
          const ok = k.correct[i] === v;
          card.querySelector(`[data-v="${k.correct[i]}"]`).classList.add("right");
          if (!ok) card.querySelector(`[data-v="${v}"]`).classList.add("wrong");
          const ex = k.explanations && k.explanations[i];
          card.querySelector(".fb").innerHTML = feedbackHtml(ok, { ...k, explanation: ex || "" });
        }
      };
      card.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
        const cur = (answers[s.id] && answers[s.id].value) || {};
        cur[i] = b.dataset.v; saveAnswer(s.id, { value: cur }); show(b.dataset.v);
      }));
      if (prev[i]) show(prev[i]);
      el.appendChild(card);
    });
  }

  function renderSlider(s, el) {
    const v = answers[s.id] ? answers[s.id].value : null;
    const min = s.min ?? 0, max = s.max ?? 5;
    const box = h(`<div><div class="q">${inline(s.question || s.title)}</div><div class="likert">
      <input type="range" min="${min}" max="${max}" step="1" value="${v ?? Math.round((min + max) / 2)}" aria-label="Rating">
      <div class="ends"><span>${min} — ${esc(s.min_label || "")}</span><output>${v ?? "–"}</output><span>${esc(s.max_label || "")} — ${max}</span></div></div></div>`);
    const r = box.querySelector("input"), out = box.querySelector("output");
    r.oninput = () => { out.textContent = r.value; saveAnswer(s.id, { value: +r.value }); };
    el.appendChild(box);
  }

  function renderFreeText(s, el) {
    const box = h(`<div><div class="q">${inline(s.question || s.title)}</div><textarea aria-label="Your response"></textarea></div>`);
    const t = box.querySelector("textarea");
    t.value = (answers[s.id] && answers[s.id].value) || "";
    t.oninput = () => saveAnswer(s.id, { value: t.value });
    el.appendChild(box);
  }

  function renderNumber(s, el) {
    const prev = answers[s.id];
    const box = h(`<div><div class="q">${inline(s.question || s.title)}</div>
      <div class="tf-btns" style="align-items:center"><input type="number" inputmode="numeric" min="0" style="width:8em;padding:10px;border:1.5px solid var(--line);border-radius:10px;font:inherit;background:var(--surface);color:var(--ink)" aria-label="Your answer">
      <span class="hint">${esc(s.unit || "")}</span><button class="btn check">Check answer</button></div><div class="fb"></div></div>`);
    const inp = box.querySelector("input"), btn = box.querySelector(".check");
    function lock(v) {
      inp.value = v; inp.disabled = true; btn.hidden = true;
      const k = keyFor(s.id), fb = box.querySelector(".fb");
      fb.innerHTML = k ? feedbackHtml(+v === +k.correct, { ...k, explanation: (+v === +k.correct ? "" : `Answer: ${k.correct}. `) + (k.explanation || "") }) : `<div class="feedback info">Answer recorded.</div>`;
    }
    btn.onclick = () => { if (inp.value === "") return; saveAnswer(s.id, { value: +inp.value }); lock(inp.value); };
    if (prev) lock(prev.value);
    el.appendChild(box);
  }

  // rank options: tap in order of preference
  function renderOrdering(s, el) {
    const opts = s.options || [];
    let order = (answers[s.id] && answers[s.id].value) || [];
    const box = h(`<div><div class="q">${inline(s.question || s.title)}</div>
      <div class="hint">Tap the options in order (first = most preferable). Leave out any that are not suitable.</div>
      <div class="opts"></div><div class="tf-btns"><button class="btn ghost undo">Clear</button><button class="btn check">Check answer</button></div><div class="fb"></div></div>`);
    const wrap = box.querySelector(".opts");
    opts.forEach((o, i) => {
      const b = h(`<button type="button" class="opt"><span class="box" style="border-radius:6px;display:grid;place-items:center;font-size:.8rem"></span><span>${inline(o)}</span></button>`);
      b.onclick = () => { if (box.dataset.locked || order.includes(i)) return; order.push(i); paint(); };
      wrap.appendChild(b);
    });
    function paint() { [...wrap.children].forEach((b, i) => { const r = order.indexOf(i); b.classList.toggle("sel", r >= 0); b.querySelector(".box").textContent = r >= 0 ? r + 1 : ""; }); }
    function lock() {
      box.dataset.locked = 1; box.querySelector(".tf-btns").hidden = true;
      [...wrap.children].forEach((b) => (b.disabled = true));
      const k = keyFor(s.id), fb = box.querySelector(".fb");
      if (k) {
        const ok = JSON.stringify(order) === JSON.stringify(k.correct);
        fb.innerHTML = feedbackHtml(ok, { ...k, explanation: `Correct order: ${k.correct.map((i) => opts[i]).join(" > ")}. ` + (k.explanation || "") });
      } else fb.innerHTML = `<div class="feedback info">Answer recorded.</div>`;
    }
    box.querySelector(".undo").onclick = () => { order = []; paint(); };
    box.querySelector(".check").onclick = () => { if (!order.length) return; saveAnswer(s.id, { value: order, labels: order.map((i) => opts[i]) }); lock(); };
    paint(); if (answers[s.id]) lock();
    el.appendChild(box);
  }

  function renderMatching(s, el) {
    const terms = s.terms || [], opts = s.options || [];
    const prev = (answers[s.id] && answers[s.id].value) || [];
    const box = h(`<div><div class="q">${inline(s.title || "Match each term with its definition")}</div><div class="hint">${s.groups ? "Choose one answer for each item." : "Choose the matching definition for each term."}</div></div>`);
    const sels = terms.map((t, i) => {
      const row = h(`<div class="tf-card"><p>${inline(t)}</p><select style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:10px;font:inherit;background:var(--surface);color:var(--ink)">
        <option value="">— select —</option>${(s.groups ? s.groups[i] : opts).map((o, j) => `<option value="${j}">${esc(o)}</option>`).join("")}</select><div class="fb"></div></div>`);
      box.appendChild(row); const sel = row.querySelector("select"); if (prev[i] != null) sel.value = prev[i]; return sel;
    });
    const btn = h(`<button class="btn">Check answers</button>`); box.appendChild(btn);
    function lock() {
      btn.hidden = true; sels.forEach((x) => (x.disabled = true));
      const k = keyFor(s.id);
      sels.forEach((x, i) => {
        const fb = x.parentElement.querySelector(".fb");
        if (!k) { fb.innerHTML = ""; return; }
        const ok = +x.value === k.correct[i];
        fb.innerHTML = feedbackHtml(ok, { ...k, explanation: ok ? "" : (s.groups ? s.groups[i] : opts)[k.correct[i]] });
      });
      if (!k) box.insertAdjacentHTML("beforeend", `<div class="feedback info">Answers recorded.</div>`);
    }
    btn.onclick = () => { if (sels.some((x) => x.value === "")) return; saveAnswer(s.id, { value: sels.map((x) => +x.value) }); lock(); };
    if (prev.length) lock();
    el.appendChild(box);
  }

  function renderBlanks(s, el) {
    const parts = String(s.question).split(/_+/);
    const prev = (answers[s.id] && answers[s.id].value) || [];
    const html = parts.map((p, i) => inline(p) + (i < parts.length - 1 ? `<input data-i="${i}" inputmode="numeric" size="3" style="width:3.5em;margin:0 4px;padding:4px 6px;border:1.5px solid var(--line);border-radius:6px;font:inherit;background:var(--surface);color:var(--ink)" aria-label="Blank ${i + 1}">` : "")).join("");
    const box = h(`<div><div class="hint">Fill in the missing numbers.</div><p class="q" style="line-height:2.2">${html}</p><button class="btn">Check answer</button><div class="fb"></div></div>`);
    const inps = [...box.querySelectorAll("input")], btn = box.querySelector("button");
    inps.forEach((x, i) => { if (prev[i] != null) x.value = prev[i]; });
    function lock() {
      btn.hidden = true; inps.forEach((x) => (x.disabled = true));
      const k = keyFor(s.id), fb = box.querySelector(".fb");
      if (k) {
        const ok = inps.every((x, i) => String(x.value).trim() === String(k.correct[i]));
        inps.forEach((x, i) => (x.style.borderColor = String(x.value).trim() === String(k.correct[i]) ? "var(--accent)" : "var(--bad)"));
        fb.innerHTML = feedbackHtml(ok, { ...k, explanation: (ok ? "" : `Answer: ${k.correct.join(", ")}. `) + (k.explanation || "") });
      } else fb.innerHTML = `<div class="feedback info">Answer recorded.</div>`;
    }
    btn.onclick = () => { saveAnswer(s.id, { value: inps.map((x) => x.value.trim()) }); lock(); };
    if (prev.length) lock();
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
      const payload = {
        participant: participant(), lesson: L.n, lesson_title: L.title, sent_at: new Date().toISOString(),
        answers: Object.fromEntries(L.slides.filter((s) => answers[s.id]).map((s) => [s.id, answers[s.id]]))
      };
      b.disabled = true; msg.textContent = "Sending…";
      try {
        await fetch(CFG.submitEndpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        const s = store.get("sent", {}); s[L.n] = payload.sent_at; store.set("sent", s);
        msg.textContent = "Thank you — your answers were sent.";
      } catch (e) { msg.textContent = "Could not send (are you offline?). Please try again."; b.disabled = false; }
    };
  }

  // ---------- views ----------
  function viewHome() {
    document.title = COURSE.title;
    const items = COURSE.lessons.map((L) => {
      const p = progress(L);
      return `<li><a class="lesson-card ${p >= 1 ? "done" : ""}" href="#/lesson/${L.n}/1">
        <span class="lesson-num">${L.n}</span>
        <span class="lesson-meta"><strong>${inline(L.title)}</strong><small>${L.slides.length} slides${p > 0 && p < 1 ? " · in progress" : p >= 1 ? " · completed" : ""}</small>
        <span class="bar"><i style="width:${Math.round(p * 100)}%"></i></span></span></a></li>`;
    }).join("");
    const next = COURSE.lessons.find((L) => progress(L) < 1) || COURSE.lessons[0];
    app.innerHTML = `<section class="hero"><h1>${inline(COURSE.title)}</h1><p>${inline(COURSE.subtitle || "")}</p>
      <a class="btn" href="#/lesson/${next.n}/1">${Object.keys(seen).length ? "Continue" : "Start the course"}</a></section>
      <ol class="lessons">${items}</ol>`;
  }

  function viewAbout() {
    document.title = "About — " + COURSE.title;
    app.innerHTML = `<article class="slide about">${md(COURSE.about || "")}
      ${CFG.contactEmail ? `<p>Questions: <a href="mailto:${esc(CFG.contactEmail)}">${esc(CFG.contactEmail)}</a></p>` : ""}
      <p class="hint">Your progress and answers are kept only in this browser. Clearing site data resets them.</p>
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
    markSeen(s.id);
    document.title = `${L.title} (${k}/${L.slides.length}) — ${COURSE.title}`;
    const intro = s.type === "intro" || s.type === "outro";
    app.innerHTML = `<div class="crumbs"><span><a href="#/">Lessons</a> › Lesson ${L.n}: ${inline(L.title)}${s.section && s.section.toLowerCase() !== L.title.toLowerCase() ? " › " + inline(s.section) : ""}</span>
      <span class="counter">${k} / ${L.slides.length}</span></div>
      <article class="slide ${intro ? "intro" : ""}" id="slide"></article>
      <div class="pager">
        ${k > 1 ? `<a class="btn ghost" href="#/lesson/${L.n}/${k - 1}">← Back</a>` : `<a class="btn ghost" href="#/">← Lessons</a>`}
        ${k < L.slides.length ? `<a class="btn" href="#/lesson/${L.n}/${k + 1}">Continue →</a>`
          : lessonById(+L.n + 1) ? `<a class="btn" href="#/lesson/${+L.n + 1}/1">Next lesson →</a>` : `<a class="btn" href="#/">Finish</a>`}
      </div>`;
    const el = document.getElementById("slide");
    if (s.title && !QUIZ.includes(s.type) && !["slider", "free_text", "number", "ordering", "statements", "matching", "blanks"].includes(s.type)) el.insertAdjacentHTML("beforeend", `<h2>${inline(s.title)}</h2>`);
    if (s.body) el.insertAdjacentHTML("beforeend", md(s.body));

    if (QUIZ.includes(s.type)) { el.insertAdjacentHTML("beforeend", figures(s)); renderChoice(s, el); }
    else if (s.type === "statements") { renderStatements(s, el); el.insertAdjacentHTML("beforeend", figures(s)); }
    else if (s.type === "slider") renderSlider(s, el);
    else if (s.type === "number") renderNumber(s, el);
    else if (s.type === "matching") renderMatching(s, el);
    else if (s.type === "blanks") renderBlanks(s, el);
    else if (s.type === "ordering") renderOrdering(s, el);
    else if (s.type === "free_text") renderFreeText(s, el);
    else if (s.type === "carousel" && (s.items || []).length) {
      const car = h(`<div class="carousel"></div>`);
      s.items.forEach((it, i) => car.appendChild(h(`<div class="car-panel ${i ? "" : "on"}">${it.heading ? `<h3>${inline(it.heading)}</h3>` : ""}${(it.images || []).map((im) => figure(im, s.id)).join("")}${md(it.body)}</div>`)));
      const nav = h(`<div class="car-nav"><button class="btn ghost" aria-label="Previous">‹</button><div class="dots"></div><button class="btn ghost" aria-label="Next">›</button></div>`);
      const panels = [...car.children], dots = nav.querySelector(".dots");
      let cur = 0;
      const go = (i) => { cur = (i + panels.length) % panels.length; panels.forEach((p, j) => p.classList.toggle("on", j === cur)); [...dots.children].forEach((d, j) => d.classList.toggle("on", j === cur)); };
      panels.forEach((_, i) => { const d = h(`<button aria-label="Panel ${i + 1}"></button>`); d.onclick = () => go(i); dots.appendChild(d); });
      nav.firstElementChild.onclick = () => go(cur - 1); nav.lastElementChild.onclick = () => go(cur + 1);
      el.appendChild(car); el.appendChild(nav); go(0);
      el.insertAdjacentHTML("beforeend", figures(s));
    } else {
      el.insertAdjacentHTML("beforeend", figures(s));
      (s.items || []).forEach((it) => el.insertAdjacentHTML("beforeend",
        `<details class="acc"><summary>${inline(it.heading)}</summary>${(it.images || []).map((im) => figure(im, s.id)).join("")}${md(it.body)}</details>`));
    }
    if (s.missing) el.insertAdjacentHTML("beforeend", `<p class="note">This interactive activity could not be recovered from the old platform and will be added from the original course files.</p>`);
    if (k === L.slides.length) { el.insertAdjacentHTML("beforeend", submitCard(L)); wireSubmit(L); }
    app.focus({ preventScroll: true }); window.scrollTo(0, 0);
  }

  function route() {
    const p = location.hash.replace(/^#\/?/, "").split("/");
    if (p[0] === "lesson") viewSlide(p[1], +p[2] || 1);
    else if (p[0] === "about") viewAbout();
    else viewHome();
  }

  document.addEventListener("keydown", (e) => {
    if (/INPUT|TEXTAREA/.test((e.target || {}).tagName)) return;
    const p = location.hash.split("/");
    if (p[1] !== "lesson") return;
    if (e.key === "ArrowRight") { const a = document.querySelector(".pager .btn:last-child"); if (a) a.click(); }
    if (e.key === "ArrowLeft") { const a = document.querySelector(".pager .btn:first-child"); if (a) a.click(); }
  });

  if (REVIEW) document.getElementById("review-banner").hidden = false;
  Promise.all([
    fetch("content/course.json").then((r) => r.json()),
    fetch("content/key.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  ]).then(([c, k]) => { COURSE = c; KEY = k; window.addEventListener("hashchange", route); route(); })
    .catch(() => { app.innerHTML = "<p>Could not load the course content.</p>"; });
})();
