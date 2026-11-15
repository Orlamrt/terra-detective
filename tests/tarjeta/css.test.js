// Comprueba que la tarjeta y la animación solo usan clases con el prefijo "tj-",
// que tarjeta.css las define y que los colores llevan valor de respaldo.
// Uso: node --test tests/tarjeta/css.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const SRC = path.join(__dirname, "..", "..", "web", "src");
require(path.join(SRC, "tarjeta_capas.js"));
require(path.join(SRC, "tarjeta.js"));
const Tarjeta = require(path.join(SRC, "animacion.js"));
const ayudante = require("./ayudante.js");

const CSS = fs.readFileSync(path.join(SRC, "tarjeta.css"), "utf8");
/** CSS sin comentarios ni declaraciones: solo los selectores. */
const selectores = CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{[^{}]*\}/g, "{}");
const clasesCSS = new Set([...selectores.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

/** Clases que aparecen en un HTML generado. */
const clasesDe = (html) => new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean)));

function htmlDeMuestra() {
  const c = ayudante.caso("nmx_suelo"), t = ayudante.caso("mor_temp");
  const partes = [
    Tarjeta.html(c.resumen, { capa: "suelo", anioNacimiento: 2005 }),
    Tarjeta.html(t.resumen, { capa: "temp" }),
    Tarjeta.html(ayudante.resumenManual({ veredicto: "no", ilustrativo: true }), { capa: "lluvia" }),
    Tarjeta.html(ayudante.resumenManual({ hoy: null }), { capa: "suelo" }),
    Tarjeta.htmlComparacion([c.resumen, t.resumen], { capa: "suelo" }),
  ];
  // la animación, con un contenedor mínimo
  const el = () => ({ setAttribute() {}, removeAttribute() {}, textContent: "", innerHTML: "" });
  const hijos = {};
  const cont = { innerHTML: "", querySelector: (s) => (hijos[s] ||= el()), querySelectorAll: () => [], addEventListener() {} };
  Tarjeta.animacion(cont, t.serie, { capa: "temp", stats: ayudante.Stats, reducirMovimiento: true });
  partes.push(cont.innerHTML, hijos['[data-tj="lienzo"]'].innerHTML);
  return partes.join("");
}

test("tarjeta.css solo define clases con el prefijo tj-", () => {
  const sinPrefijo = [...clasesCSS].filter((c) => !c.startsWith("tj-"));
  assert.deepEqual(sinPrefijo, []);
});

test("el HTML de la tarjeta, la comparación y la animación solo usa clases tj-", () => {
  const sinPrefijo = [...clasesDe(htmlDeMuestra())].filter((c) => !c.startsWith("tj-"));
  assert.deepEqual(sinPrefijo, []);
});

test("toda clase que usan los componentes tiene estilo en tarjeta.css", () => {
  const faltan = [...clasesDe(htmlDeMuestra())].filter((c) => !clasesCSS.has(c));
  assert.deepEqual(faltan, []);
});

test("cada variable de la página se usa con un valor de respaldo", () => {
  const sinRespaldo = [...CSS.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]).filter((v) => !v.startsWith("--tj-"));
  assert.deepEqual(sinRespaldo, [], "usa var(--x, respaldo) para las variables de la página");
});

test("respeta prefers-reduced-motion y marca el foco del teclado", () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(CSS, /:focus-visible/);
});
