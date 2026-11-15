// Pruebas de la lógica pura de la animación (Tarjeta.animacion.puro, web/src/animacion.js).
// Uso: node --test tests/tarjeta/animacion_puro.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const SRC = path.join(__dirname, "..", "..", "web", "src");
require(path.join(SRC, "tarjeta_capas.js"));
require(path.join(SRC, "tarjeta.js"));
const Tarjeta = require(path.join(SRC, "animacion.js"));
const ayudante = require("./ayudante.js");
const { Stats } = ayudante;
const P = Tarjeta.animacion.puro;

/** Serie mensual sintética y determinista (sin Math.random): estaciones + tendencia + ruido fijo. */
function sintetica(meses, inicio, { tendenciaAnual = 0.03, base = 20, huecos = [] } = {}) {
  let semilla = 12345;
  const ruido = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);
  const valores = Array.from({ length: meses }, (_, i) => base + 3 * Math.sin((2 * Math.PI * i) / 12) + (tendenciaAnual * i) / 12 + 0.4 * ruido());
  for (const h of huecos) valores[h] = null;
  return { valores, inicio };
}
const vista = (series, cfg = Tarjeta.capa("temp"), etiquetas) => {
  const lista = Array.isArray(series) ? series : [series];
  return P.prepararVista(lista, lista.map((s) => Stats.analizar(s.valores, s.inicio)), cfg, etiquetas);
};
const SVG_ROTO = /NaN|undefined|null|Infinity/;
function svgValido(svg, nombre) {
  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${nombre}: no empieza con <svg> o no termina con </svg>`);
  assert.ok(!SVG_ROTO.test(svg), `${nombre}: contiene ${svg.match(SVG_ROTO)?.[0]}`);
  for (const etiqueta of ["svg", "g", "text", "defs", "clipPath"]) {
    const abre = (svg.match(new RegExp(`<${etiqueta}[\\s>]`, "g")) || []).length;
    const cierra = (svg.match(new RegExp(`</${etiqueta}>`, "g")) || []).length;
    assert.equal(abre, cierra, `${nombre}: <${etiqueta}> sin cerrar`);
  }
}

test.describe("estadoEn", () => {
  const fin0 = P.PASOS[0].dur, total = P.duracionTotal();
  test("en 0 ms empieza el paso 1 sin nada dibujado", () => {
    const s = P.estadoEn(0);
    assert.equal(s.i, 0);
    assert.equal(s.dibujo, 0);
    assert.equal(s.linea, 0);
    assert.equal(s.terminado, false);
  });
  test("al final del paso 1 la serie está completa y sigue en el paso 1", () => {
    const s = P.estadoEn(fin0);
    assert.equal(s.i, 0);
    assert.equal(s.dibujo, 1);
    assert.equal(s.puntos, 0);
  });
  test("durante la pausa del paso 1 no cambia nada", () => {
    assert.deepEqual(P.estadoEn(fin0 + P.PAUSA / 2), P.estadoEn(fin0));
  });
  test("al terminar la pausa empieza el paso 2", () => {
    const s = P.estadoEn(fin0 + P.PAUSA);
    assert.equal(s.i, 1);
    assert.equal(s.dibujo, 1);
    assert.equal(s.desvanecer, 0);
  });
  test("cada paso empieza donde dice inicioDePaso", () => {
    for (let i = 0; i < P.PASOS.length; i++) {
      assert.equal(P.estadoEn(P.inicioDePaso(i)).i, i);
      assert.equal(P.estadoEn(P.inicioDePaso(i) + P.PASOS[i].dur).p, 1);
    }
  });
  test("los efectos llegan a 1 en orden: dibujo, puntos, línea, fantasmas", () => {
    const s3 = P.estadoEn(P.inicioDePaso(2) + P.PASOS[2].dur);
    assert.equal(s3.dibujo, 1); assert.equal(s3.puntos, 1); assert.equal(s3.linea, 1); assert.equal(s3.fantasmas, 0);
    assert.equal(P.estadoEn(P.inicioDePaso(3) + P.PASOS[3].dur).fantasmas, 1);
  });
  test("el veredicto aparece solo en el último paso", () => {
    assert.equal(P.estadoEn(P.inicioDePaso(3)).veredicto, false);
    assert.equal(P.estadoEn(P.inicioDePaso(4)).veredicto, true);
  });
  test("después del final queda en el último paso y terminado", () => {
    for (const ms of [total, total + 1, total * 10]) {
      const s = P.estadoEn(ms);
      assert.equal(s.i, P.PASOS.length - 1);
      assert.equal(s.terminado, true);
      assert.equal(s.fantasmas, 1);
    }
  });
  test("un tiempo negativo o inválido cuenta como 0", () => {
    assert.deepEqual(P.estadoEn(-500), P.estadoEn(0));
    assert.deepEqual(P.estadoEn(NaN), P.estadoEn(0));
  });
  test("acepta pasos y pausa distintos", () => {
    const pasos = [{ dur: 100 }, { dur: 100 }];
    assert.equal(P.estadoEn(150, pasos, 0).i, 1);
    assert.equal(P.estadoEn(150, pasos, 100).i, 0);
    assert.equal(P.duracionTotal(pasos, 10), 220);
  });
});

test.describe("ticks", () => {
  test("da valores redondos dentro del rango", () => {
    assert.deepEqual(P.ticks(0, 10), [0, 2, 4, 6, 8, 10]);
    assert.deepEqual(P.ticks(0.21, 0.49), [0.3, 0.4]); // paso mínimo 0.056 → el redondo siguiente es 0.1
    assert.deepEqual(P.ticks(0.2, 0.5, 6), [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]);
  });
  for (const [lo, hi] of [[0.21, 0.49], [-3.7, 12.2], [880, 1340], [18.1, 23.9], [-0.004, 0.003], [1e-5, 3e-5]]) {
    test(`[${lo}, ${hi}]: marcas dentro del rango, con pasos de 1, 2, 2.5 o 5 × 10ⁿ y sin decimales basura`, () => {
      const t = P.ticks(lo, hi);
      assert.ok(t.length >= 2 && t.length <= 12, `cantidad ${t.length}`);
      for (const v of t) assert.ok(v >= lo - 1e-12 && v <= hi + 1e-12, `${v} fuera de rango`);
      const paso = t[1] - t[0], mag = Math.pow(10, Math.floor(Math.log10(paso)));
      assert.ok([1, 2, 2.5, 5, 10].some((m) => Math.abs(paso / mag - m) < 1e-6), `paso ${paso}`);
      for (const v of t) assert.ok(String(v).length < 12, `decimales basura en ${v}`);
    });
  }
  test("un rango vacío o inválido no se rompe", () => {
    assert.deepEqual(P.ticks(5, 5), [5]);
    assert.deepEqual(P.ticks(NaN, 1), []);
    assert.deepEqual(P.ticks(3, 1), [3]);
  });
});

test.describe("prepararVista", () => {
  test("una serie de 312 meses desde 2000-01", () => {
    const [v] = vista(sintetica(312, "2000-01"));
    assert.equal(v.mens.length, 312);
    assert.equal(v.anual.length, 26);
    assert.ok(v.mens[0].t > 2000 && v.mens[0].t < 2000.1);
    assert.ok(v.mens.at(-1).t > 2025.9 && v.mens.at(-1).t < 2026);
    assert.equal(v.comparacion, false);
    assert.equal(v.fantasmas.length, 21);
    assert.ok(v.fantasmas[0] < v.b && v.fantasmas.at(-1) > v.b);
  });
  test("una serie de 528 meses desde 1982-01", () => {
    const [v] = vista(sintetica(528, "1982-01"));
    assert.equal(v.mens.length, 528);
    assert.equal(v.anual[0].t, 1982.5);
    assert.equal(v.anual.at(-1).t, 2025.5);
  });
  test("una serie con huecos (null) solo usa los meses con datos", () => {
    const huecos = [0, 1, 2, 50, 51, 200, 311];
    const [v] = vista(sintetica(312, "2000-01", { huecos }));
    assert.equal(v.mens.length, 312 - huecos.length);
    assert.ok(v.mens.every((p) => Number.isFinite(p.v)));
    assert.equal(v.anual.filter((a) => !a.completo).length, 4); // 2000, 2004, 2016 y 2025 quedan incompletos
  });
  test("convierte a la unidad de la capa: lluvia en mm al año", () => {
    const s = sintetica(120, "2000-01", { base: 2 });
    const [v] = vista(s, Tarjeta.capa("lluvia"));
    assert.ok(Math.abs(v.mens[0].v - s.valores[0] * 365.25) < 1e-9);
  });
  test("en comparación, cada serie va en % respecto a su propio promedio", () => {
    const vs = vista([sintetica(312, "2000-01", { base: 20 }), sintetica(312, "2000-01", { base: 400, tendenciaAnual: -1 })], Tarjeta.capa("suelo"), ["A", "B"]);
    assert.equal(vs.length, 2);
    for (const v of vs) {
      assert.equal(v.comparacion, true);
      assert.equal(v.porcentaje, true);
      const media = v.mens.reduce((s, p) => s + p.v, 0) / v.mens.length;
      assert.ok(Math.abs(media) < 0.5, `promedio ${media} no está cerca de 0 %`);
    }
    assert.notEqual(vs[0].color, vs[1].color);
    assert.equal(vs[1].etiqueta, "B");
  });
  test("si llegan más series que MAX_SERIES, se usan las primeras", () => {
    const s = sintetica(120, "2000-01");
    assert.equal(vista([s, s, s]).length, P.MAX_SERIES);
  });
  test("una serie sin datos da una vista vacía sin romperse", () => {
    const [v] = P.prepararVista([{ valores: [], inicio: "2000-01" }], [{}], Tarjeta.capa("temp"));
    assert.deepEqual(v.mens, []);
    assert.deepEqual(v.anual, []);
  });
});

test.describe("dominio", () => {
  for (const [nombre, series] of [["una serie", [sintetica(312, "2000-01")]], ["comparación", [sintetica(312, "2000-01"), sintetica(528, "1982-01", { tendenciaAnual: -0.05 })]]]) {
    test(`${nombre}: contiene todos los puntos y las líneas fantasma`, () => {
      const vs = vista(series);
      const dm = P.dominio(vs, "mens"), da = P.dominio(vs, "anual");
      for (const v of vs) {
        for (const p of v.mens) { assert.ok(p.v >= dm.lo && p.v <= dm.hi); assert.ok(p.t >= dm.t0 && p.t <= dm.t1); }
        for (const p of v.anual) assert.ok(p.v >= da.lo && p.v <= da.hi);
        for (const b of v.fantasmas) for (const t of [v.mens[0].t, v.mens.at(-1).t]) {
          const y = v.nivel(t, b);
          assert.ok(y >= da.lo && y <= da.hi, `fantasma ${y} fuera de [${da.lo}, ${da.hi}]`);
        }
      }
    });
  }
  test("el rango anual es más angosto que el mensual (se quitan las estaciones)", () => {
    const vs = vista(sintetica(312, "2000-01"));
    const dm = P.dominio(vs, "mens"), da = P.dominio(vs, "anual");
    assert.ok(da.hi - da.lo < dm.hi - dm.lo);
  });
  test("sin datos devuelve un rango finito", () => {
    const d = P.dominio([], "mens");
    assert.ok([d.lo, d.hi, d.t0, d.t1].every(Number.isFinite));
    assert.ok(d.hi > d.lo && d.t1 > d.t0);
  });
});

test.describe("construirSVG", () => {
  const medidas = { idClip: "tj-prueba-1", etiquetaEje: "°C", unidadCorta: "°", decimales: 1, descripcion: "Temperatura <prueba>" };
  const dominios = (vs) => ({ mens: P.dominio(vs, "mens"), anual: P.dominio(vs, "anual") });
  const instantes = [0, 1000, P.inicioDePaso(1) + 500, P.inicioDePaso(2) + 1300, P.inicioDePaso(3) + 1500, P.duracionTotal()];

  test("una serie: SVG válido y sin NaN en cada instante", () => {
    const vs = vista(sintetica(312, "2000-01"));
    for (const ms of instantes) svgValido(P.construirSVG(P.estadoEn(ms), vs, dominios(vs), medidas), `ms=${ms}`);
  });
  test("comparación: SVG válido, con las etiquetas de los lugares escapadas", () => {
    const vs = vista([sintetica(312, "2000-01"), sintetica(528, "1982-01", { tendenciaAnual: -0.05 })], Tarjeta.capa("suelo"), ["Sahel", "<b>Norte</b>"]);
    const svg = P.construirSVG(P.estadoEn(P.duracionTotal()), vs, dominios(vs), { ...medidas, etiquetaEje: "% respecto a su promedio" });
    svgValido(svg, "comparación");
    assert.ok(svg.includes("&lt;b&gt;Norte&lt;/b&gt;"));
    assert.ok(!svg.includes("<b>"));
  });
  test("las 10 series reales dan SVG válido al final", () => {
    for (const c of ayudante.casos()) {
      const cfg = Tarjeta.capa(c.capa, c.resumen.unidad);
      const vs = P.prepararVista([c.serie], [c.analisis], cfg);
      svgValido(P.construirSVG(P.estadoEn(P.duracionTotal()), vs, dominios(vs), { ...medidas, unidadCorta: cfg.unidadCorta }), c.id);
    }
  });
  test("usa el id de recorte que se le pasa (para que dos animaciones no choquen)", () => {
    const vs = vista(sintetica(120, "2000-01"));
    const svg = P.construirSVG(P.estadoEn(1000), vs, dominios(vs), { idClip: "tj-otra-7" });
    assert.ok(svg.includes('<clipPath id="tj-otra-7">') && svg.includes("url(#tj-otra-7)"));
  });
  test("el texto alternativo se escapa", () => {
    const vs = vista(sintetica(120, "2000-01"));
    assert.ok(P.construirSVG(P.estadoEn(0), vs, dominios(vs), medidas).includes('aria-label="Temperatura &lt;prueba&gt;"'));
  });
  test("en el paso 1 se ve el año que se va dibujando; al final, la tendencia con sus valores", () => {
    const vs = vista(sintetica(312, "2000-01"));
    assert.match(P.construirSVG(P.estadoEn(1800), vs, dominios(vs), medidas), />20\d\d<\/text>/);
    const fin = P.construirSVG(P.estadoEn(P.duracionTotal()), vs, dominios(vs), medidas);
    assert.match(fin, /stroke-width="3.2"/);
    assert.match(fin, /\d°<\/text>/);
  });
  test("sin datos muestra un mensaje en vez de romperse", () => {
    const vs = P.prepararVista([{ valores: [], inicio: "2000-01" }], [{}], Tarjeta.capa("temp"));
    const svg = P.construirSVG(P.estadoEn(0), vs, dominios(vs), medidas);
    svgValido(svg, "vacío");
    assert.match(svg, /No hay datos suficientes/);
  });
});

test.describe("textosPasos", () => {
  test("una serie: 5 textos con los números del análisis convertidos", () => {
    const c = ayudante.caso("mor_temp"), cfg = Tarjeta.capa("temp");
    const vs = P.prepararVista([c.serie], [c.analisis], cfg);
    const t = P.textosPasos({ vistas: vs, analisis: [c.analisis], veredictos: [Stats.veredicto(c.analisis)], cfg, lugares: ["Morelos"] });
    assert.equal(t.length, 5);
    assert.match(t[0], /^Estos son 321 meses de temperatura del aire en Morelos \(2000–2026\)/);
    assert.match(t[2], /\+0\.58 °C por década/);
    assert.match(t[3], /Todas apuntan hacia arriba/);
    assert.match(t[4], /aumenta y el cambio es real/);
    for (const x of t) assert.ok(!SVG_ROTO.test(x), x);
  });
  test("comparación: habla de los dos lugares y de direcciones opuestas", () => {
    const a = ayudante.caso("sahel_suelo"), b = ayudante.caso("nmx_suelo"), cfg = Tarjeta.capa("suelo");
    const vs = P.prepararVista([a.serie, b.serie], [a.analisis, b.analisis], cfg, ["el Sahel", "el norte de México"]);
    const t = P.textosPasos({ vistas: vs, analisis: [a.analisis, b.analisis], veredictos: [Stats.veredicto(a.analisis), Stats.veredicto(b.analisis)], cfg, lugares: ["el Sahel", "el norte de México"] });
    assert.match(t[2], /el Sahel sube \+[\d.]+ % por década; el norte de México baja −[\d.]+ % por década/);
    assert.match(t[4], /En el Sahel, agua en el suelo aumenta/);
    assert.match(t[4], /En el norte de México, agua en el suelo disminuye/);
  });
  test("una serie no significativa dice cuántos años harían falta", () => {
    const c = ayudante.caso("mor_lluvia"), cfg = Tarjeta.capa("lluvia");
    const vs = P.prepararVista([c.serie], [c.analisis], cfg);
    const t = P.textosPasos({ vistas: vs, analisis: [c.analisis], veredictos: [Stats.veredicto(c.analisis)], cfg });
    assert.match(t[4], /^No hay una tendencia clara en lluvia del año; harían falta unos \d+ años de datos/);
    assert.match(t[3], /Unas suben y otras bajan/);
  });
  test("sin datos no se rompe", () => {
    const t = P.textosPasos({ vistas: [], analisis: [], veredictos: [], cfg: Tarjeta.capa("temp") });
    assert.equal(t.length, 5);
  });
});
