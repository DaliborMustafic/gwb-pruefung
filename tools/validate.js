// Prüft den Fragenkatalog: node tools/validate.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "questions.js"), "utf8") + "\nthis.Q = QUESTIONS; this.T = TOPICS;", ctx);

const errors = [];
const ids = new Set();
const fail = (id, msg) => errors.push(`${id}: ${msg}`);

function checkOne(id, q) {
  if (!q.q) fail(id, "kein Fragetext");
  if (q.img && !fs.existsSync(path.join(__dirname, "..", q.img))) fail(id, `Bild fehlt: ${q.img}`);
  switch (q.type) {
    case "mc":
      if (!q.a || !Array.isArray(q.w) || q.w.length < 1) fail(id, "mc braucht a und w");
      if (q.w.includes(q.a)) fail(id, `richtige Antwort im Falsch-Pool: ${q.a}`);
      if (new Set(q.w).size !== q.w.length) fail(id, "doppelte falsche Antworten");
      break;
    case "tf":
      if (typeof q.a !== "boolean") fail(id, "tf braucht boolean a");
      break;
    case "multi":
      if (q.a.length < 2 || q.w.length < 1) fail(id, "multi zu wenige Optionen");
      if (q.a.some((x) => q.w.includes(x))) fail(id, "multi Überschneidung");
      break;
    case "order":
      if (q.items.length < 3) fail(id, "order zu wenige items");
      break;
    case "match":
      if (q.pairs.length < 3) fail(id, "match zu wenige Paare");
      break;
    case "input":
      if (typeof q.a !== "number" || Number.isNaN(q.a)) fail(id, "input braucht Zahl");
      break;
    default:
      fail(id, `unbekannter Typ ${q.type}`);
  }
}

for (const q of ctx.Q) {
  if (ids.has(q.id)) fail(q.id, "doppelte ID");
  ids.add(q.id);
  if (!ctx.T[q.t]) fail(q.id, `unbekanntes Thema ${q.t}`);
  if (!q.p) fail(q.id, "keine Seitenzahl");
  if (q.type === "gen") {
    for (let i = 0; i < 200; i++) checkOne(q.id, { img: q.img, ...q.make() });
  } else checkOne(q.id, q);
}

const perTopic = {};
for (const q of ctx.Q) perTopic[q.t] = (perTopic[q.t] || 0) + 1;
console.log("Fragen gesamt:", ctx.Q.length, "| Generatoren:", ctx.Q.filter((q) => q.type === "gen").length);
console.log(perTopic);
console.log([...new Set(errors)].join("\n") || "Keine Fehler gefunden.");
process.exit(errors.length ? 1 : 0);
