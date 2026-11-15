// Pruebas de Tarjeta.html (web/src/tarjeta.js).
// Uso: node --test tests/tarjeta/tarjeta.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const SRC = path.join(__dirname, "..", "..", "web", "src");
require(path.join(SRC, "tarjeta_capas.js"));
const Tarjeta = require(path.join(SRC, "tarjeta.js"));
const ayudante = require("./ayudante.js");
const { resumenManual } = ayudante;

/** Texto visible (sin etiquetas, con entidades básicas resueltas). */
const texto = (html) => html.replace(/<\/?(b|span|i)\b[^>]*>/g, "").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** Lo que va en el veredicto corto. */
const veredicto = (html) => texto(html.match(/<p class="tj-veredicto">([\s\S]*?)<\/p>/)[1]);
const PROHIBIDO = /undefined|NaN|null|Infinity|(^|[^\w–])-0(?![\d])/;

function sinTextosRotos(html, nombre) {
  const t = texto(html);
  assert.ok(!PROHIBIDO.test(t), `${nombre}: texto roto → ${t.match(PROHIBIDO)?.[0]} en «${t}»`);
  assert.ok(!PROHIBIDO.test(html.replace(/class="[^"]*"/g, "")), `${nombre}: valor roto en el HTML`);
}

test.describe("las 10 series reales", () => {
  for (const c of ayudante.casos()) {
    test(`${c.id} (${c.capa}): sin undefined, NaN, null, -0 ni Infinity`, () => {
      for (const anioNacimiento of [undefined, 1975, 2005, 2030]) {
        sinTextosRotos(Tarjeta.html(c.resumen, { capa: c.capa, anioNacimiento }), `${c.id}/${anioNacimiento}`);
      }
    });
  }
  test("la temperatura de Morelos sube y es segura, en °", () => {
    const c = ayudante.caso("mor_temp");
    const h = Tarjeta.html(c.resumen, { capa: c.capa });
    assert.match(veredicto(h), /^▲ Más calor que antes \(\+0\.9°\)$/);
    assert.match(texto(h), /Antes \(2000–09\) 20\.4°/);
    assert.match(texto(h), /Hoy \(2016–25\) 21\.2°/);
    assert.match(h, /tj-calor/);
  });
  test("el suelo del norte de México baja y es seguro, con el cambio en puntos", () => {
    const c = ayudante.caso("nmx_suelo");
    const v = veredicto(Tarjeta.html(c.resumen, { capa: c.capa }));
    assert.match(v, /^▼ El suelo se está secando \(2\.3 puntos menos\)$/);
    assert.ok(!v.includes("%"), "el cambio del suelo no debe ir en %");
  });
  test("la lluvia de Morelos no es segura: 'sin cambio claro', en mm al año y en %", () => {
    const c = ayudante.caso("mor_lluvia");
    const h = Tarjeta.html(c.resumen, { capa: c.capa });
    assert.match(veredicto(h), /^≈ Sin cambio claro \(\+11 %, puede ser suerte\)$/);
    assert.match(texto(h), /Antes \(2000–09\) 1,008 mm/); // 2.760 mm/día × 365.25
    assert.ok(h.includes("1,008<span> mm</span>"), "la unidad lleva un espacio fino que no se corta");
    assert.ok(h.includes("20") && !/\d<span> °/.test(Tarjeta.html(ayudante.caso("mor_temp").resumen, { capa: "temp" })), "los grados van pegados");
    assert.match(h, /tj-neutro/);
  });
  test("el suelo de Morelos es solo un indicio: lo dice y no lo da por seguro", () => {
    const c = ayudante.caso("mor_suelo");
    const t = texto(Tarjeta.html(c.resumen, { capa: c.capa }));
    assert.match(t, /Hay una pista, pero todavía no es seguro/);
    assert.match(t, /Sin cambio claro/);
  });
  test("una serie sin capa registrada usa la configuración genérica con su unidad", () => {
    const c = ayudante.caso("mor_rad");
    const t = texto(Tarjeta.html(c.resumen, { capa: c.capa }));
    assert.match(t, /251\.7 W\/m²/);
    assert.match(t, /Mor rad/);
  });
});

test.describe("veredicto y monedas", () => {
  test("sube y seguro: flecha hacia arriba, frase de la capa y tono cálido", () => {
    const h = Tarjeta.html(resumenManual(), { capa: "temp" });
    assert.equal(veredicto(h), "▲ Más calor que antes (+0.9°)");
    assert.match(h, /data-veredicto="muy"/);
  });
  test("baja y seguro: flecha hacia abajo", () => {
    const h = Tarjeta.html(resumenManual({ antes: 21, hoy: 20.2, pendiente_decada: -0.3, ic95: [-0.4, -0.2] }), { capa: "temp" });
    assert.equal(veredicto(h), "▼ Más fresco que antes (−0.8°)");
    assert.match(h, /tj-agua/);
  });
  test("si no es seguro, la tarjeta dice 'sin cambio claro'", () => {
    const h = Tarjeta.html(resumenManual({ veredicto: "no", p: 0.4, caras: 1 }), { capa: "temp" });
    assert.match(veredicto(h), /^≈ Sin cambio claro \(\+0\.9°, puede ser suerte\)$/);
    assert.match(texto(h), /No podemos asegurar que cambió/);
    assert.match(texto(h), new RegExp(Tarjeta.capa("temp").significa.nada));
  });
  test("con 0 caras ninguna moneda se enciende y se explica como una sola cara", () => {
    const h = Tarjeta.html(resumenManual({ veredicto: "no", p: 0.9, caras: 0 }), { capa: "temp" });
    assert.equal((h.match(/tj-on/g) || []).length, 0);
    assert.match(texto(h), /Como sacar cara al lanzar una moneda/);
  });
  test("con más de 10 caras se encienden las 10 monedas y dice 'más de 10'", () => {
    const h = Tarjeta.html(resumenManual({ caras: 39, p: 1e-12 }), { capa: "temp" });
    assert.equal((h.match(/tj-on/g) || []).length, 10);
    assert.match(texto(h), /más de 10 caras seguidas/);
    assert.match(h, /aria-label="Más de 10 caras seguidas"/);
  });
  test("entre 2 y 10 caras dice 1 vez de cada 2ⁿ", () => {
    const t = texto(Tarjeta.html(resumenManual({ veredicto: "si", p: 0.02, caras: 5 }), { capa: "temp" }));
    assert.match(t, /5 caras seguidas: pasa 1 vez de cada 32/);
    assert.match(t, /Probablemente es real/);
  });
  test("10 caras: 1 vez de cada 1,024, en formato es-MX", () => {
    assert.match(texto(Tarjeta.html(resumenManual({ caras: 10 }), { capa: "temp" })), /1 vez de cada 1,024/);
  });
  test("si faltan las caras, se calculan con p", () => {
    const h = Tarjeta.html(resumenManual({ caras: undefined, p: 0.02, veredicto: "si" }), { capa: "temp" });
    assert.match(texto(h), /5 caras seguidas/);
  });
  test("el veredicto puede llegar como texto o como objeto de Stats.veredicto", () => {
    const comoTexto = Tarjeta.html(resumenManual({ veredicto: "si" }), { capa: "temp" });
    const comoObjeto = Tarjeta.html(resumenManual({ veredicto: { clave: "si", texto: "Significativa", p: 0.02 } }), { capa: "temp" });
    assert.equal(comoTexto, comoObjeto);
    const indicio = Tarjeta.html(resumenManual({ veredicto: { clave: "indicio", texto: "Indicio" } }), { capa: "temp" });
    assert.match(veredicto(indicio), /Sin cambio claro/);
  });
  test("un veredicto desconocido no se da por seguro", () => {
    assert.match(veredicto(Tarjeta.html(resumenManual({ veredicto: "quizas" }), { capa: "temp" })), /Sin cambio claro/);
  });
});

test.describe("si la tendencia y hoy − antes tienen signos distintos", () => {
  // Pasa cuando un año extremo pesa en un promedio de 10 años: la regresión sube pero el promedio reciente es menor.
  const casos = [
    { capa: "temp", r: { antes: 21.0, hoy: 20.9, pendiente_decada: 0.2 }, dir: "▲", esperado: "+0.20° por década" },
    { capa: "suelo", r: { antes: 25.0, hoy: 25.4, pendiente_decada: -0.5, unidad: "kg/m²" }, dir: "▼", esperado: "0.5 puntos menos por década" },
    { capa: "lluvia", r: { antes: 2.0, hoy: 1.98, pendiente_decada: 0.05, unidad: "mm/día" }, dir: "▲", esperado: "+2.5 % por década" },
  ];
  for (const c of casos) {
    test(`${c.capa}: no dice '${c.dir}' con un número del signo contrario; muestra la tendencia por década`, () => {
      const v = veredicto(Tarjeta.html(resumenManual(c.r), { capa: c.capa }));
      assert.ok(v.startsWith(c.dir), v);
      assert.ok(v.includes(`(${c.esperado})`), v);
      if (c.dir === "▲") assert.ok(!/\(−|menos/.test(v), v);
      else assert.ok(!/\(\+|más/.test(v), v);
    });
  }
  test("si hoy − antes redondea a cero, también se muestra la tendencia por década", () => {
    const v = veredicto(Tarjeta.html(resumenManual({ antes: 21.0, hoy: 21.02, pendiente_decada: 0.2 }), { capa: "temp" }));
    assert.equal(v, "▲ Más calor que antes (+0.20° por década)");
  });
});

test.describe("datos faltantes y avisos", () => {
  test("si antes, hoy o p son null (por ejemplo, suelo en el mar), muestra 'Sin datos para este lugar'", () => {
    for (const campo of ["antes", "hoy", "p"]) {
      const h = Tarjeta.html(resumenManual({ [campo]: null, lugar: "Golfo de California" }), { capa: "suelo" });
      assert.match(texto(h), /Sin datos para este lugar/);
      assert.match(texto(h), /no hay datos de agua en el suelo/);
      sinTextosRotos(h, campo);
    }
  });
  test("un resumen null o vacío también da 'Sin datos' sin romperse", () => {
    for (const r of [null, undefined, {}]) {
      const h = Tarjeta.html(r, { capa: "temp" });
      assert.match(texto(h), /Sin datos para este lugar/);
      sinTextosRotos(h, String(r));
    }
  });
  test("sin opciones no se rompe (usa la configuración genérica)", () => {
    sinTextosRotos(Tarjeta.html(resumenManual()), "sin opciones");
  });
  test("si los datos son ilustrativos, muestra 'Datos de prueba, no reales'", () => {
    assert.match(texto(Tarjeta.html(resumenManual({ ilustrativo: true }), { capa: "temp" })), /Datos de prueba, no reales/);
    assert.match(texto(Tarjeta.html(resumenManual({ ilustrativo: true, hoy: null }), { capa: "temp" })), /Datos de prueba, no reales/);
    assert.ok(!/Datos de prueba/.test(Tarjeta.html(resumenManual(), { capa: "temp" })));
  });
  test("sin periodos ni lugar, la tarjeta se muestra sin esas partes", () => {
    const h = Tarjeta.html(resumenManual({ antes_periodo: undefined, hoy_periodo: null, lugar: undefined }), { capa: "temp", anioNacimiento: 2005 });
    assert.match(texto(h), /Antes 20\.1° → Hoy 21\.0°/);
    assert.ok(!/Desde/.test(texto(h)));
    sinTextosRotos(h, "sin opcionales");
  });
  test("si antes es 0 y la capa usa porcentaje, muestra el cambio absoluto (no divide entre cero)", () => {
    const h = Tarjeta.html(resumenManual({ antes: 0, hoy: 0.5, pendiente_decada: 0.2, unidad: "mm/día" }), { capa: "lluvia" });
    assert.match(veredicto(h), /\(\+183 mm\)/);
    sinTextosRotos(h, "antes 0");
  });
  test("el verdor usa 2 decimales y no tiene unidad pegada al número", () => {
    const t = texto(Tarjeta.html(resumenManual({ antes: 0.4123, hoy: 0.4567, pendiente_decada: 0.02, unidad: "NDVI" }), { capa: "verdor" }));
    assert.match(t, /Antes \(2000–09\) 0\.41 → Hoy \(2016–25\) 0\.46/);
    assert.match(t, /Más verde que antes \(\+0\.04\)/);
  });
});

test.describe("seguridad del texto", () => {
  test("un lugar con <script> se escapa", () => {
    const h = Tarjeta.html(resumenManual({ lugar: '<script>alert("x")</script>' }), { capa: "temp" });
    assert.ok(!h.includes("<script>"));
    assert.match(h, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  });
  test("escapar cubre & < > \" '", () => assert.equal(Tarjeta.escapar(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;"));
  test("escapar con null o undefined da texto vacío", () => {
    assert.equal(Tarjeta.escapar(null), "");
    assert.equal(Tarjeta.escapar(undefined), "");
  });
});

test.describe("desde que naciste", () => {
  const r = resumenManual(); // 2000–2025, +0.35 por década
  test("nacido antes del inicio de los datos: 'Desde 2000 (cuando empiezan estos datos)'", () => {
    assert.match(texto(Tarjeta.html(r, { capa: "temp", anioNacimiento: 1980 })), /Desde 2000 \(cuando empiezan estos datos\): cambió \+0\.9°\./);
  });
  test("nacido dentro del periodo: usa su año", () => {
    // 0.35 / 10 × (2025 − 2005) = 0.7
    assert.match(texto(Tarjeta.html(r, { capa: "temp", anioNacimiento: 2005 })), /Desde que naciste \(2005\): cambió \+0\.7°\./);
  });
  test("nacido después del último año: no se muestra", () => {
    assert.ok(!/Desde/.test(texto(Tarjeta.html(r, { capa: "temp", anioNacimiento: 2026 }))));
  });
  test("sin año de nacimiento: no se muestra", () => {
    assert.ok(!/Desde/.test(texto(Tarjeta.html(r, { capa: "temp" }))));
  });
  test("si no es seguro: 'sin cambio claro'", () => {
    assert.match(texto(Tarjeta.html(resumenManual({ veredicto: "no" }), { capa: "temp", anioNacimiento: 2005 })), /Desde que naciste \(2005\): sin cambio claro\./);
  });
  test("en el suelo se dice en puntos", () => {
    const h = Tarjeta.html(resumenManual({ antes: 28, hoy: 25, pendiente_decada: -1.2, unidad: "kg/m²" }), { capa: "suelo", anioNacimiento: 2005 });
    assert.match(texto(h), /Desde que naciste \(2005\): 2\.4 puntos menos\./);
  });
});

test.describe("textos reemplazados", () => {
  test("opciones.textos reemplaza las frases", () => {
    const textos = { variable: "Calorcito", veredicto: "Sí, hace más calor", seguro: "Es real.", significa: "Toma agua.", desde: "Mucho.", aviso: "Prueba." };
    const t = texto(Tarjeta.html(resumenManual({ ilustrativo: true }), { capa: "temp", anioNacimiento: 2005, textos }));
    for (const v of Object.values(textos)) assert.ok(t.includes(v), `falta «${v}» en «${t}»`);
  });
  test("los textos reemplazados también se escapan", () => {
    const h = Tarjeta.html(resumenManual(), { capa: "temp", textos: { significa: "<img src=x onerror=alert(1)>", veredicto: "<b>hola</b>" } });
    assert.ok(!h.includes("<img"));
    assert.ok(!h.includes("<b>hola</b>"));
    assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
  test("el texto de 'sin datos' se puede reemplazar y se escapa", () => {
    const h = Tarjeta.html(resumenManual({ hoy: null }), { capa: "suelo", textos: { sinDatos: "Aquí es mar <3" } });
    assert.match(h, /Aquí es mar &lt;3/);
  });
});

test.describe("año de nacimiento guardado", () => {
  const almacen = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  test("guarda y lee el año con la clave terraAnio", () => {
    const a = almacen();
    assert.equal(Tarjeta.guardarAnio(2005, a), true);
    assert.equal(a.m.get("terraAnio"), "2005");
    assert.equal(Tarjeta.anioGuardado(a), 2005);
  });
  test("sin año guardado devuelve null", () => assert.equal(Tarjeta.anioGuardado(almacen()), null));
  test("un año inválido no se guarda", () => {
    const a = almacen();
    for (const x of [1800, 2200, 2005.5, "2005", NaN]) assert.equal(Tarjeta.guardarAnio(x, a), false);
    assert.equal(a.m.size, 0);
  });
  test("si localStorage lanza error, no pasa nada", () => {
    const roto = { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("bloqueado"); } };
    assert.equal(Tarjeta.anioGuardado(roto), null);
    assert.equal(Tarjeta.guardarAnio(2005, roto), false);
    assert.equal(Tarjeta.anioGuardado(undefined), null);
    assert.equal(Tarjeta.guardarAnio(2005, undefined), false);
  });
});
