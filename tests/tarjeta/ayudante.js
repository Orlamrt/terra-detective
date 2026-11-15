/**
 * Ayudante SOLO PARA PRUEBAS de la tarjeta (no va en web/src/).
 *
 * Arma un `resumen` desde data/muestras/series_reales.json con web/src/stats.js,
 * igual que lo hará la Tarea 2:
 *   - antes / hoy: promedio de los primeros y últimos 10 años completos (en la unidad original de la capa),
 *   - p: el mayor de pT y pMK,
 *   - caras: ⌊−log₂ p⌋.
 *
 * Las series de muestra vienen de Giovanni y no siempre están en la unidad que usará cada capa,
 * así que aquí se adaptan (ver MAPEO). Las series que no corresponden a ninguna de las 4 capas
 * se pasan con su propio id como capa: así prueban la configuración genérica con unidades reales.
 */
const path = require("path");
const fs = require("fs");

const RAIZ = path.join(__dirname, "..", "..");
const Stats = require(path.join(RAIZ, "web", "src", "stats.js"));
const SERIES = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "muestras", "series_reales.json"), "utf8"));

/** Días del mes `i` contado desde `inicio` ("AAAA-MM"). */
function diasDelMes(inicio, i) {
  const [y0, m0] = inicio.split("-").map(Number);
  const k = m0 - 1 + i, y = y0 + Math.floor(k / 12), m = k % 12;
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

const mismo = (v) => v;

// OJO: el ×100 del suelo NO es una conversión física. Las muestras son humedad de 10–40 cm en m³/m³
// (FLDAS) y la capa real será kg/m² en 0–10 cm (GLDAS). Multiplicar por 100 solo da números del
// mismo orden que los reales (≈ 10–40 kg/m²) para que las pruebas usen valores realistas.
const sueloAproximado = (v, i, inicio) => v * 100;
const mmMesAmmDia = (v, i, inicio) => v / diasDelMes(inicio, i);

const MAPEO = {
  mor_temp:     { capa: "temp",   unidad: "°C",     adaptar: mismo },
  mor_lluvia:   { capa: "lluvia", unidad: "mm/día", adaptar: mmMesAmmDia },
  sahel_lluvia: { capa: "lluvia", unidad: "mm/día", adaptar: mismo },
  mor_suelo:    { capa: "suelo",  unidad: "kg/m²",  adaptar: sueloAproximado },
  sahel_suelo:  { capa: "suelo",  unidad: "kg/m²",  adaptar: sueloAproximado },
  nmx_suelo:    { capa: "suelo",  unidad: "kg/m²",  adaptar: sueloAproximado },
  // Sin capa propia: se usan con su id para probar la configuración genérica.
  mor_tsuelo:   { capa: "mor_tsuelo", adaptar: mismo },
  mor_et:       { capa: "mor_et",     adaptar: mismo },
  mor_hum:      { capa: "mor_hum",    adaptar: mismo },
  mor_rad:      { capa: "mor_rad",    adaptar: mismo },
};

const promedio = (a) => a.reduce((s, x) => s + x.v, 0) / a.length;

/**
 * Prepara una serie de muestra: valores adaptados, análisis de stats.js y el resumen.
 * @param {string} id id de data/muestras/series_reales.json
 * @returns {{ id, capa, serie: { valores, inicio }, analisis, resumen }}
 */
function caso(id) {
  const s = SERIES.find((x) => x.id === id);
  if (!s) throw new Error(`ayudante: no existe la serie ${id}`);
  const m = MAPEO[id];
  const valores = s.v.map((v, i) => (v == null ? null : m.adaptar(v, i, s.inicio)));
  const r = Stats.analizar(valores, s.inicio);
  const v = Stats.veredicto(r);
  const anios = r.anual.filter((a) => a.completo);
  const k = Math.min(10, Math.floor(anios.length / 2)), A = anios.slice(0, k), B = anios.slice(-k);
  const p = Math.max(r.pT, r.pMK);
  const resumen = {
    antes: promedio(A), hoy: promedio(B),
    antes_periodo: [A[0].y, A.at(-1).y], hoy_periodo: [B[0].y, B.at(-1).y],
    unidad: m.unidad || s.unidad,
    pendiente_decada: r.porDecada, ic95: r.icDecada, p,
    veredicto: v.clave, caras: Math.max(0, Math.floor(-Math.log2(Math.max(p, 1e-300)))),
    lugar: s.region, ilustrativo: false,
  };
  return { id, capa: m.capa, serie: { valores, inicio: s.inicio }, analisis: r, resumen };
}

/** Los 10 casos reales. */
const casos = () => SERIES.map((s) => caso(s.id));

/**
 * Un resumen hecho a mano para casos especiales; `cambios` reemplaza campos.
 * @param {object} [cambios]
 */
function resumenManual(cambios = {}) {
  return {
    antes: 20.1, hoy: 21.0, antes_periodo: [2000, 2009], hoy_periodo: [2016, 2025], unidad: "°C",
    pendiente_decada: 0.35, ic95: [0.21, 0.49], p: 0.0004, veredicto: "muy", caras: 11,
    lugar: "Morelos, México", ilustrativo: false, ...cambios,
  };
}

module.exports = { SERIES, MAPEO, Stats, caso, casos, resumenManual, diasDelMes };
