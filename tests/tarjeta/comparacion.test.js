// Pruebas de Tarjeta.htmlComparacion (web/src/tarjeta.js).
// Uso: node --test tests/tarjeta/comparacion.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const SRC = path.join(__dirname, "..", "..", "web", "src");
require(path.join(SRC, "tarjeta_capas.js"));
const Tarjeta = require(path.join(SRC, "tarjeta.js"));
const ayudante = require("./ayudante.js");
const { resumenManual } = ayudante;

const frase = (html) => (html.match(/<p class="tj-resumen">([\s\S]*?)<\/p>/) || [])[1];
const cuantas = (html) => (html.match(/<article class="tj-tarjeta/g) || []).length;

const sube = (cambios = {}) => resumenManual({ pendiente_decada: 0.3, veredicto: "muy", ...cambios });
const baja = (cambios = {}) => resumenManual({ antes: 21, hoy: 20.2, pendiente_decada: -0.3, veredicto: "si", caras: 6, p: 0.01, ...cambios });
const nada = (cambios = {}) => resumenManual({ veredicto: "no", p: 0.4, caras: 1, ...cambios });

test.describe("frase de la comparación", () => {
  test("tendencias opuestas: 'Depende del lugar: en uno sube y en otro baja'", () => {
    assert.equal(frase(Tarjeta.htmlComparacion([sube(), baja()], { capa: "temp" })), "Depende del lugar: en uno sube y en otro baja.");
  });
  test("las dos suben: 'En los dos lugares sube'", () => {
    assert.equal(frase(Tarjeta.htmlComparacion([sube(), sube({ veredicto: "si" })], { capa: "temp" })), "En los dos lugares sube.");
  });
  test("las dos bajan: 'En los dos lugares baja'", () => {
    assert.equal(frase(Tarjeta.htmlComparacion([baja(), baja()], { capa: "temp" })), "En los dos lugares baja.");
  });
  test("solo una es segura: 'Solo en uno de los dos lugares el cambio es seguro'", () => {
    assert.equal(frase(Tarjeta.htmlComparacion([sube(), nada()], { capa: "temp" })), "Solo en uno de los dos lugares el cambio es seguro.");
    assert.equal(frase(Tarjeta.htmlComparacion([nada(), baja()], { capa: "temp" })), "Solo en uno de los dos lugares el cambio es seguro.");
  });
  test("un indicio no cuenta como seguro", () => {
    assert.equal(frase(Tarjeta.htmlComparacion([sube(), nada({ veredicto: "indicio" })], { capa: "temp" })), "Solo en uno de los dos lugares el cambio es seguro.");
  });
  test("ninguna es segura: 'En ninguno de los dos lugares hay un cambio claro'", () => {
    assert.equal(frase(Tarjeta.htmlComparacion([nada(), nada()], { capa: "temp" })), "En ninguno de los dos lugares hay un cambio claro.");
  });
  test("un lugar sin datos cuenta como sin cambio seguro", () => {
    const h = Tarjeta.htmlComparacion([sube(), sube({ hoy: null })], { capa: "temp" });
    assert.equal(frase(h), "Solo en uno de los dos lugares el cambio es seguro.");
    assert.match(h, /Sin datos para este lugar/);
  });
  test("la frase se puede reemplazar con opciones.textos.comparacion, y se escapa", () => {
    const h = Tarjeta.htmlComparacion([sube(), baja()], { capa: "temp", textos: { comparacion: "Mira <esto>" } });
    assert.equal(frase(h), "Mira &lt;esto&gt;");
  });
  test("el texto de la comparación no se cuela dentro de las tarjetas", () => {
    const h = Tarjeta.htmlComparacion([sube(), baja()], { capa: "temp", textos: { comparacion: "FRASE-UNICA" } });
    assert.equal(h.split("FRASE-UNICA").length - 1, 1);
  });
});

test.describe("caso real", () => {
  test("Sahel vs. norte de México (suelo) da tendencias opuestas", () => {
    const sahel = ayudante.caso("sahel_suelo"), norte = ayudante.caso("nmx_suelo");
    const h = Tarjeta.htmlComparacion([sahel.resumen, norte.resumen], { capa: "suelo" });
    assert.equal(frase(h), "Depende del lugar: en uno sube y en otro baja.");
    assert.equal(cuantas(h), 2);
    assert.match(h, /Sahel, África/);
    assert.match(h, /Norte de México/);
    assert.match(h, /El suelo tiene más agua/);
    assert.match(h, /El suelo se está secando/);
    assert.ok(!/undefined|NaN|null|Infinity/.test(h));
  });
});

test.describe("estructura", () => {
  test("cada tarjeta es la misma que daría Tarjeta.html", () => {
    const a = sube({ lugar: "A" }), b = baja({ lugar: "B" });
    const h = Tarjeta.htmlComparacion([a, b], { capa: "temp", anioNacimiento: 2005 });
    assert.ok(h.includes(Tarjeta.html(a, { capa: "temp", anioNacimiento: 2005 })));
    assert.ok(h.includes(Tarjeta.html(b, { capa: "temp", anioNacimiento: 2005 })));
  });
  test("opciones.porTarjeta permite otra capa u otros textos en un lugar", () => {
    const h = Tarjeta.htmlComparacion([sube(), sube({ unidad: "mm/día", antes: 2, hoy: 2.2 })], {
      capa: "temp", porTarjeta: [{}, { capa: "lluvia", textos: { significa: "Texto propio" } }],
    });
    assert.match(h, /Temperatura del aire/);
    assert.match(h, /Lluvia del año/);
    assert.equal(h.split("Texto propio").length - 1, 1);
  });
  test("recibe más de 2 lugares", () => {
    const h = Tarjeta.htmlComparacion([sube(), sube(), baja()], { capa: "temp" });
    assert.equal(cuantas(h), 3);
    assert.equal(frase(h), "Depende del lugar: en unos sube y en otros baja.");
    assert.equal(frase(Tarjeta.htmlComparacion([sube(), sube(), sube()], { capa: "temp" })), "En todos los lugares sube.");
    assert.equal(frase(Tarjeta.htmlComparacion([sube(), nada(), sube()], { capa: "temp" })), "Solo en 2 de los 3 lugares el cambio es seguro.");
  });
  test("con un solo lugar no hay frase de comparación", () => {
    const h = Tarjeta.htmlComparacion([sube()], { capa: "temp" });
    assert.equal(frase(h), undefined);
    assert.equal(cuantas(h), 1);
  });
  test("sin lugares (o con algo que no es arreglo) muestra un mensaje y no se rompe", () => {
    for (const x of [[], null, undefined, "nada"]) assert.match(Tarjeta.htmlComparacion(x), /No hay lugares para comparar/);
  });
});
