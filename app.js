(() => {
  "use strict";

  const LS_SEEN = "gwb_seen_v1";
  const LS_HISTORY = "gwb_history_v1";

  const GRADES = [
    { min: 90, note: 1, name: "Sehr gut", color: "#2e7d32" },
    { min: 80, note: 2, name: "Gut", color: "#7cb342" },
    { min: 65, note: 3, name: "Befriedigend", color: "#f9a825" },
    { min: 50, note: 4, name: "Genügend", color: "#ef6c00" },
    { min: 0, note: 5, name: "Nicht genügend", color: "#c62828" },
  ];

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) n.append(c);
    return n;
  };
  const put = (parent, ...kids) => parent.append(...kids.flat().filter((c) => c != null && c !== false));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const load = (k, d) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const gradeFor = (pct) => GRADES.find((g) => pct >= g.min);
  const numFmt = (n) => n.toLocaleString("de-AT", { maximumFractionDigits: 3 });

  // ───────────── Quiz-Zustand ─────────────
  let state = null;

  // ───────────── Fragen vorbereiten ─────────────
  function materialize(src) {
    const base = src.type === "gen" ? src.make() : src;
    const q = { ...base, id: src.id, t: src.t, p: src.p, img: base.img ?? src.img };

    if (q.type === "mc") {
      const wrong = shuffle(q.w).slice(0, 3);
      q.options = shuffle([q.a, ...wrong]);
    } else if (q.type === "multi") {
      const nCorrect = Math.min(q.a.length, 2 + Math.floor(Math.random() * 3));
      const correct = shuffle(q.a).slice(0, nCorrect);
      const wrong = shuffle(q.w).slice(0, Math.max(2, Math.min(q.w.length, 6 - nCorrect)));
      q.correctSet = new Set(correct);
      q.options = shuffle([...correct, ...wrong]);
    } else if (q.type === "order") {
      q.items = q.pick ? q.items.slice(0, q.pick) : q.items.slice();
      do { q.current = shuffle(q.items); } while (q.items.length > 1 && q.current.every((x, i) => x === q.items[i]));
    } else if (q.type === "match") {
      let pairs = shuffle(q.pairs);
      if (q.pick) {
        // Möglichst unterschiedliche Lösungen wählen, damit die Zuordnung nicht trivial wird.
        const chosen = [], usedRight = new Set();
        for (const p of pairs) if (chosen.length < q.pick && !usedRight.has(p[1])) { chosen.push(p); usedRight.add(p[1]); }
        for (const p of pairs) if (chosen.length < q.pick && !chosen.includes(p)) chosen.push(p);
        pairs = chosen;
      }
      q.pairsUsed = pairs;
      q.rightOptions = shuffle([...new Set(pairs.map((p) => p[1]))]);
    }
    return q;
  }

  function selectQuestions(topics, count) {
    const seen = load(LS_SEEN, {});
    const byTopic = {};
    for (const q of QUESTIONS) {
      if (!topics.includes(q.t)) continue;
      (byTopic[q.t] ||= []).push(q);
    }
    for (const t in byTopic) {
      byTopic[t] = byTopic[t]
        .map((q) => ({ q, k: (seen[q.id] || 0) + Math.random() * 1.5 }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.q);
    }
    const chosen = [];
    const order = shuffle(Object.keys(byTopic));
    while (chosen.length < count && order.some((t) => byTopic[t].length)) {
      for (const t of order) {
        if (chosen.length >= count) break;
        if (byTopic[t].length) chosen.push(byTopic[t].shift());
      }
    }
    return shuffle(chosen);
  }

  // ───────────── Start-Bildschirm ─────────────
  function renderStart() {
    state = null;
    const app = $("#app");
    app.innerHTML = "";
    $("#topbar-progress").style.width = "0";
    $("#live-score").textContent = "";

    const topicBoxes = Object.entries(TOPICS).map(([key, t]) => {
      const n = QUESTIONS.filter((q) => q.t === key).length;
      return el("label", { class: "topic", style: `--c:${t.color}` },
        el("input", { type: "checkbox", value: key, checked: "" }),
        el("span", { class: "topic-name" }, t.name),
        el("span", { class: "topic-count" }, `${n} Fragen`));
    });

    const history = load(LS_HISTORY, []).slice(-5).reverse();

    put(app,
      el("section", { class: "card hero" },
        el("h1", {}, "GWB-Prüfungstrainer"),
        el("p", { class: "lead" },
          "Geographie und wirtschaftliche Bildung · 2. Klasse – basierend auf deinem Schulbuch „unterwegs“. ",
          "Jede Prüfung wird neu zusammengestellt: andere Fragen, andere Reihenfolge, andere Antwortmöglichkeiten und neu berechnete Rechenaufgaben."),
        el("h2", {}, "1. Themen wählen"),
        el("div", { class: "topics" }, topicBoxes),
        el("div", { class: "row-btns" },
          el("button", { class: "btn small ghost", onclick: () => toggleAll(true) }, "Alle auswählen"),
          el("button", { class: "btn small ghost", onclick: () => toggleAll(false) }, "Keine")),
        el("h2", {}, "2. Anzahl der Fragen"),
        el("div", { class: "counts" },
          [10, 15, 20, 30].map((n) => el("label", { class: "count" },
            el("input", { type: "radio", name: "count", value: n, checked: n === 15 ? "" : false }),
            el("span", {}, n)))),
        el("button", { class: "btn primary big", id: "start-btn", onclick: startQuiz }, "Prüfung starten ▶"),
        el("p", { class: "hint" }, "Tipp: Mit den Tasten 1–6 wählst du Antworten, mit Enter prüfst du bzw. gehst weiter.")),
      el("section", { class: "card" },
        el("h2", {}, "Notenschlüssel"),
        el("div", { class: "scale" }, GRADES.map((g, i) =>
          el("div", { class: "scale-item", style: `--c:${g.color}` },
            el("b", {}, g.note), el("span", {}, g.name),
            el("small", {}, i === 0 ? `ab ${g.min} %` : g.min === 0 ? `unter ${GRADES[i - 1].min} %` : `${g.min}–${GRADES[i - 1].min - 1} %`))))),
      history.length ? el("section", { class: "card" },
        el("h2", {}, "Deine letzten Versuche"),
        el("table", { class: "history" },
          el("tr", {}, el("th", {}, "Datum"), el("th", {}, "Punkte"), el("th", {}, "Prozent"), el("th", {}, "Note")),
          history.map((h) => el("tr", {},
            el("td", {}, new Date(h.date).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })),
            el("td", {}, `${numFmt(h.score)} / ${h.max}`),
            el("td", {}, `${h.pct} %`),
            el("td", {}, el("span", { class: "grade-pill", style: `--c:${gradeFor(h.pct).color}` }, `${gradeFor(h.pct).note} – ${gradeFor(h.pct).name}`))))),
        el("button", { class: "btn small ghost", onclick: () => { localStorage.removeItem(LS_HISTORY); localStorage.removeItem(LS_SEEN); renderStart(); } }, "Verlauf zurücksetzen")) : null,
    );
  }

  function toggleAll(on) {
    document.querySelectorAll(".topic input").forEach((c) => (c.checked = on));
  }

  function startQuiz(_, retryIds) {
    let selected;
    if (retryIds) {
      selected = shuffle(QUESTIONS.filter((q) => retryIds.includes(q.id)));
    } else {
      const topics = [...document.querySelectorAll(".topic input:checked")].map((c) => c.value);
      if (!topics.length) { alert("Bitte wähle mindestens ein Thema aus."); return; }
      const count = +document.querySelector("input[name=count]:checked").value;
      selected = selectQuestions(topics, count);
      state = { topics, count };
    }
    state = { ...(state || {}), questions: selected.map(materialize), idx: 0, results: [], start: Date.now(), retry: !!retryIds };
    renderQuestion();
  }

  // ───────────── Frage anzeigen ─────────────
  function renderQuestion() {
    const q = state.questions[state.idx];
    q.answered = false;
    q.user = q.type === "multi" ? new Set() : q.type === "match" ? {} : null;
    const app = $("#app");
    app.innerHTML = "";
    updateTopbar();

    const topic = TOPICS[q.t];
    const typeHint = {
      mc: "Wähle die richtige Antwort.",
      tf: "Ist die Aussage richtig oder falsch?",
      multi: "Mehrere Antworten können richtig sein – wähle alle richtigen.",
      order: "Bringe die Kärtchen mit ▲ ▼ in die richtige Reihenfolge.",
      match: "Ordne jedem Begriff das Passende zu.",
      input: "Gib das Ergebnis als Zahl ein.",
    }[q.type];

    const card = el("section", { class: "card question", style: `--c:${topic.color}` },
      el("div", { class: "q-meta" },
        el("span", { class: "badge" }, topic.name),
        el("span", { class: "q-num" }, `Frage ${state.idx + 1} von ${state.questions.length}`),
        el("span", { class: "page" }, `📖 Buch S. ${q.p}`)),
      el("h2", { class: "q-text" }, q.q),
      q.img ? el("figure", { class: "q-img" },
        el("img", { src: q.img, alt: "Abbildung aus dem Buch", onclick: () => zoom(q.img) }),
        el("figcaption", {}, "Abbildung aus dem Buch – zum Vergrößern anklicken")) : null,
      el("p", { class: "type-hint" }, typeHint),
      el("div", { class: "answer", id: "answer" }),
      el("div", { class: "feedback", id: "feedback" }),
      el("div", { class: "actions" },
        el("button", { class: "btn primary", id: "check-btn", onclick: check, disabled: "" }, "Antwort prüfen"),
        el("button", { class: "btn primary hidden", id: "next-btn", onclick: next },
          state.idx + 1 < state.questions.length ? "Nächste Frage ▶" : "Auswertung anzeigen ▶")));
    app.append(card);
    renderAnswerArea(q);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setReady(ready) {
    $("#check-btn").disabled = !ready;
  }

  function renderAnswerArea(q) {
    const box = $("#answer");
    box.innerHTML = "";

    if (q.type === "mc" || q.type === "tf") {
      const opts = q.type === "tf" ? ["Richtig", "Falsch"] : q.options;
      box.append(el("div", { class: "options" }, opts.map((o, i) =>
        el("button", { class: "option", "data-i": i, onclick: (e) => {
          if (q.answered) return;
          box.querySelectorAll(".option").forEach((b) => b.classList.remove("selected"));
          e.currentTarget.classList.add("selected");
          q.user = i;
          setReady(true);
        } }, el("span", { class: "key" }, i + 1), el("span", {}, o)))));
    } else if (q.type === "multi") {
      box.append(el("div", { class: "options" }, q.options.map((o, i) =>
        el("button", { class: "option multi", "data-i": i, onclick: (e) => {
          if (q.answered) return;
          e.currentTarget.classList.toggle("selected");
          q.user.has(i) ? q.user.delete(i) : q.user.add(i);
          setReady(q.user.size > 0);
        } }, el("span", { class: "key box" }, i + 1), el("span", {}, o)))));
    } else if (q.type === "input") {
      const inp = el("input", { type: "text", inputmode: "decimal", class: "num-input", placeholder: "Zahl eingeben", autocomplete: "off",
        oninput: (e) => { q.user = e.target.value; setReady(e.target.value.trim() !== ""); } });
      box.append(el("div", { class: "input-row" }, inp, q.unit ? el("span", { class: "unit" }, q.unit) : null));
      setTimeout(() => inp.focus(), 50);
    } else if (q.type === "match") {
      box.append(el("div", { class: "match" }, q.pairsUsed.map(([left], i) =>
        el("div", { class: "match-row", "data-i": i },
          el("div", { class: "match-left" }, left),
          el("select", { onchange: (e) => {
            q.user[i] = e.target.value;
            setReady(q.pairsUsed.every((_, j) => q.user[j]));
          } }, el("option", { value: "" }, "– bitte wählen –"), q.rightOptions.map((r) => el("option", { value: r }, r)))))));
    } else if (q.type === "order") {
      renderOrder(q);
      setReady(true);
    }
  }

  function renderOrder(q) {
    const box = $("#answer");
    box.innerHTML = "";
    box.append(el("ol", { class: "order" }, q.current.map((item, i) =>
      el("li", { class: "order-item" },
        el("span", { class: "order-pos" }, i + 1),
        el("span", { class: "order-text" }, item),
        el("span", { class: "order-btns" },
          el("button", { class: "mini", disabled: i === 0 || q.answered ? "" : false, title: "nach oben", onclick: () => move(q, i, -1) }, "▲"),
          el("button", { class: "mini", disabled: i === q.current.length - 1 || q.answered ? "" : false, title: "nach unten", onclick: () => move(q, i, 1) }, "▼"))))));
  }

  function move(q, i, d) {
    const j = i + d;
    [q.current[i], q.current[j]] = [q.current[j], q.current[i]];
    renderOrder(q);
  }

  // ───────────── Auswerten ─────────────
  function parseNum(s) {
    let t = String(s).trim().replace(/\s|€|km|cm|m\b/gi, "");
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    return parseFloat(t);
  }

  function check() {
    const q = state.questions[state.idx];
    if (q.answered) return;
    q.answered = true;
    let earned = 0, correctText = "", userText = "", details = null;
    const box = $("#answer");

    if (q.type === "mc") {
      const ci = q.options.indexOf(q.a);
      earned = q.user === ci ? 1 : 0;
      box.querySelectorAll(".option").forEach((b, i) => {
        b.disabled = true;
        if (i === ci) b.classList.add("correct");
        else if (i === q.user) b.classList.add("wrong");
      });
      correctText = q.a; userText = q.options[q.user];
    } else if (q.type === "tf") {
      const ci = q.a ? 0 : 1;
      earned = q.user === ci ? 1 : 0;
      box.querySelectorAll(".option").forEach((b, i) => {
        b.disabled = true;
        if (i === ci) b.classList.add("correct");
        else if (i === q.user) b.classList.add("wrong");
      });
      correctText = q.a ? "Richtig" : "Falsch"; userText = q.user === 0 ? "Richtig" : "Falsch";
    } else if (q.type === "multi") {
      let hits = 0, fails = 0;
      box.querySelectorAll(".option").forEach((b, i) => {
        b.disabled = true;
        const isC = q.correctSet.has(q.options[i]);
        const chosen = q.user.has(i);
        if (isC && chosen) { b.classList.add("correct"); hits++; }
        else if (isC && !chosen) b.classList.add("missed");
        else if (!isC && chosen) { b.classList.add("wrong"); fails++; }
      });
      earned = Math.max(0, (hits - fails) / q.correctSet.size);
      correctText = [...q.correctSet].join(" · ");
      userText = [...q.user].map((i) => q.options[i]).join(" · ");
    } else if (q.type === "input") {
      const v = parseNum(q.user);
      earned = Math.abs(v - q.a) <= (q.tol || 0) + 1e-9 ? 1 : 0;
      const inp = box.querySelector("input");
      inp.disabled = true;
      inp.classList.add(earned ? "correct" : "wrong");
      correctText = `${numFmt(q.a)}${q.unit ? " " + q.unit : ""}`;
      userText = `${q.user}${q.unit ? " " + q.unit : ""}`;
    } else if (q.type === "match") {
      let hits = 0;
      box.querySelectorAll(".match-row").forEach((row, i) => {
        const sel = row.querySelector("select");
        sel.disabled = true;
        const ok = q.user[i] === q.pairsUsed[i][1];
        if (ok) hits++;
        row.classList.add(ok ? "correct" : "wrong");
        if (!ok) row.append(el("div", { class: "match-fix" }, "✔ richtig: ", el("b", {}, q.pairsUsed[i][1])));
      });
      earned = hits / q.pairsUsed.length;
      correctText = q.pairsUsed.map(([l, r]) => `${l} → ${r}`).join(" · ");
      userText = q.pairsUsed.map(([l], i) => `${l} → ${q.user[i]}`).join(" · ");
      details = q.pairsUsed.map(([l, r], i) => ({ ok: q.user[i] === r, text: `${l} → ${q.user[i]}`, fix: r }));
    } else if (q.type === "order") {
      const hits = q.current.filter((x, i) => x === q.items[i]).length;
      earned = hits === q.items.length ? 1 : hits / q.items.length * 0.5;
      renderOrder(q);
      box.querySelectorAll(".order-item").forEach((li, i) => li.classList.add(q.current[i] === q.items[i] ? "correct" : "wrong"));
      if (hits !== q.items.length) {
        box.append(el("div", { class: "order-solution" },
          el("b", {}, "Richtige Reihenfolge:"),
          el("ol", {}, q.items.map((x) => el("li", {}, x)))));
      }
      correctText = q.items.map((x, i) => `${i + 1}. ${x}`).join(" · ");
      userText = q.current.map((x, i) => `${i + 1}. ${x}`).join(" · ");
      details = q.current.map((x, i) => ({ ok: x === q.items[i], text: `${i + 1}. ${x}`, fix: `${i + 1}. ${q.items[i]}` }));
    }

    earned = Math.round(earned * 100) / 100;
    const full = earned >= 1, none = earned === 0;
    state.results.push({ id: q.id, t: q.t, p: q.p, q: q.q, earned, correctText, userText, details, ex: q.ex, type: q.type });

    const fb = $("#feedback");
    fb.className = `feedback show ${full ? "ok" : none ? "bad" : "part"}`;
    fb.append(...[
      el("div", { class: "fb-head" }, full ? "✔ Richtig!" : none ? "✘ Leider falsch." : `◐ Teilweise richtig (${numFmt(earned)} von 1 Punkt)`),
      !full && (q.type === "mc" || q.type === "tf" || q.type === "input")
        ? el("div", { class: "fb-correct" }, "Richtige Antwort: ", el("b", {}, correctText)) : null,
      !full && q.type === "multi" ? el("div", { class: "fb-correct" }, "Richtig wären: ", el("b", {}, correctText)) : null,
      q.ex ? el("div", { class: "fb-ex" }, "💡 ", q.ex) : null,
      el("div", { class: "fb-page" }, `Nachlesen im Buch auf Seite ${q.p}.`)].filter(Boolean));

    $("#check-btn").classList.add("hidden");
    $("#next-btn").classList.remove("hidden");
    $("#next-btn").focus();
    updateTopbar();
  }

  function next() {
    if (state.idx + 1 < state.questions.length) {
      state.idx++;
      renderQuestion();
    } else {
      renderResult();
    }
  }

  function updateTopbar() {
    const done = state.results.length;
    const total = state.questions.length;
    const score = state.results.reduce((s, r) => s + r.earned, 0);
    $("#topbar-progress").style.width = `${(done / total) * 100}%`;
    $("#live-score").textContent = `Punkte: ${numFmt(Math.round(score * 100) / 100)} / ${done}  ·  Frage ${Math.min(state.idx + 1, total)}/${total}`;
  }

  // ───────────── Ergebnis ─────────────
  function renderResult() {
    const total = state.questions.length;
    const score = Math.round(state.results.reduce((s, r) => s + r.earned, 0) * 100) / 100;
    const pct = Math.round((score / total) * 100);
    const g = gradeFor(pct);
    const mins = Math.max(1, Math.round((Date.now() - state.start) / 60000));

    if (!state.retry) {
      const seen = load(LS_SEEN, {});
      state.results.forEach((r) => (seen[r.id] = (seen[r.id] || 0) + 1));
      save(LS_SEEN, seen);
      const hist = load(LS_HISTORY, []);
      hist.push({ date: Date.now(), score, max: total, pct });
      save(LS_HISTORY, hist.slice(-30));
    }

    const byTopic = {};
    for (const r of state.results) {
      const b = (byTopic[r.t] ||= { s: 0, n: 0 });
      b.s += r.earned; b.n++;
    }
    const wrong = state.results.filter((r) => r.earned < 1);

    const app = $("#app");
    app.innerHTML = "";
    $("#topbar-progress").style.width = "100%";
    $("#live-score").textContent = `Ergebnis: ${numFmt(score)} / ${total}`;

    const msg = {
      1: "Ausgezeichnet! Du bist bestens auf die Prüfung vorbereitet. 🎉",
      2: "Sehr ordentlich! Wiederhole noch die falschen Fragen, dann sitzt alles.",
      3: "Solide Basis – schau dir die Fehler unten genau an und lies die Buchseiten nach.",
      4: "Knapp geschafft. Wiederhole die Themen mit wenig Punkten.",
      5: "Noch nicht genug – keine Sorge! Lies die angegebenen Buchseiten nach und versuch es nochmal.",
    }[g.note];

    put(app,
      el("section", { class: "card result", style: `--c:${g.color}` },
        el("h1", {}, state.retry ? "Ergebnis der Fehler-Wiederholung" : "Dein Prüfungsergebnis"),
        el("div", { class: "result-grid" },
          el("div", { class: "grade-circle" }, el("span", { class: "grade-num" }, g.note), el("span", { class: "grade-name" }, g.name)),
          el("div", { class: "result-stats" },
            el("div", { class: "big-score" }, `${numFmt(score)} / ${total} Punkte`),
            el("div", { class: "pct-bar" }, el("div", { style: `width:${pct}%` })),
            el("div", {}, `${pct} % · ${total - wrong.length} von ${total} Fragen voll richtig · ca. ${mins} Min.`),
            el("p", { class: "msg" }, msg))),
        el("h2", {}, "Punkte nach Themen"),
        el("div", { class: "topic-stats" }, Object.entries(byTopic).map(([t, b]) => {
          const p = Math.round((b.s / b.n) * 100);
          return el("div", { class: "topic-stat", style: `--c:${TOPICS[t].color}` },
            el("span", {}, TOPICS[t].name),
            el("div", { class: "pct-bar small" }, el("div", { style: `width:${p}%` })),
            el("span", { class: "tp" }, `${numFmt(Math.round(b.s * 100) / 100)}/${b.n}`));
        })),
        el("div", { class: "actions center" },
          el("button", { class: "btn primary", onclick: () => { renderStart(); } }, "Neue Prüfung (andere Fragen)"),
          wrong.length ? el("button", { class: "btn", onclick: () => startQuiz(null, wrong.map((r) => r.id)) }, `Nur Fehler wiederholen (${wrong.length})`) : null)),
      wrong.length ? el("section", { class: "card" },
        el("h2", {}, "Verbesserung deiner Fehler"),
        wrong.map((r) => el("div", { class: "review" },
          el("div", { class: "review-q" }, el("span", { class: "badge", style: `--c:${TOPICS[r.t].color}` }, TOPICS[r.t].name), " ", r.q),
          r.details
            ? el("ul", { class: "review-details" }, r.details.map((d) => el("li", { class: d.ok ? "ok" : "bad" },
                d.ok ? "✔ " : "✘ ", el("span", {}, d.text), d.ok ? null : el("b", {}, `  → richtig: ${d.fix}`))))
            : [el("div", { class: "review-user" }, "Deine Antwort: ", el("span", {}, r.userText || "–")),
               el("div", { class: "review-correct" }, "Richtig: ", el("b", {}, r.correctText))],
          r.ex ? el("div", { class: "review-ex" }, "💡 ", r.ex) : null,
          el("div", { class: "review-page" }, `📖 Buch S. ${r.p} · ${numFmt(r.earned)} von 1 Punkt`)))) : null,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ───────────── Bild-Zoom ─────────────
  function zoom(src) {
    const ov = el("div", { class: "overlay", onclick: () => ov.remove() }, el("img", { src, alt: "" }), el("span", { class: "close" }, "✕"));
    document.body.append(ov);
  }

  // ───────────── Tastatur ─────────────
  document.addEventListener("keydown", (e) => {
    if (!state || !state.questions) return;
    if (document.querySelector(".overlay")) { if (e.key === "Escape") document.querySelector(".overlay").remove(); return; }
    const q = state.questions[state.idx];
    if (!q) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (!q.answered && !$("#check-btn").disabled) check();
      else if (q.answered) next();
      return;
    }
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && !q.answered) {
      const btn = document.querySelectorAll("#answer .option")[n - 1];
      if (btn) btn.click();
    }
  });

  $("#home-btn").addEventListener("click", () => {
    if (state && state.questions && state.results.length < state.questions.length &&
        !confirm("Prüfung wirklich abbrechen? Der Fortschritt geht verloren.")) return;
    renderStart();
  });

  renderStart();
})();
