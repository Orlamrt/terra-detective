// Imprime en JSON el resultado de web/src/stats.js para cada serie de muestra.
// Uso: node tests/paridad.js
const path = require("path");
const fs = require("fs");
const Stats = require(path.join(__dirname, "..", "web", "src", "stats.js"));
const series = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "muestras", "series_reales.json"), "utf8"));
const out = {};
for (const s of series) {
  const r = Stats.analizar(s.v, s.inicio);
  out[s.id] = { pendiente_decada: r.porDecada, ic: r.icDecada, p_t: r.pT, p_mk: r.pMK, sen_decada: r.sen * 10, r1: r.r1, veredicto: Stats.veredicto(r).clave };
}
process.stdout.write(JSON.stringify(out));
