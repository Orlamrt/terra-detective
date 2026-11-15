// Pruebas del controlador de la animación (Tarjeta.animacion, web/src/animacion.js),
// con un contenedor falso (sin navegador) y un reloj falso (sin tiempo real).
// Uso: node --test tests/tarjeta/animacion_control.test.js
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

/* ---------- versiones falsas ---------- */

/** Elemento mínimo: guarda atributos, texto y HTML. */
class ElementoFalso {
  constructor(attrs = {}) { this.attrs = { ...attrs }; this.textContent = ""; this.innerHTML = ""; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  closest() { return this; }
}

/** Contenedor mínimo: lo que usa la capa de DOM (innerHTML, querySelector(All), eventos). */
class ContenedorFalso {
  constructor() { this._html = ""; this.hijos = {}; this.pasos = []; this.oyentes = {}; this.eventos = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = v; this.hijos = {};
    const n = (v.match(/data-tj-paso="/g) || []).length;
    this.pasos = Array.from({ length: n }, (_, i) => new ElementoFalso({ "data-tj-accion": "paso", "data-tj-paso": String(i) }));
  }
  querySelector(sel) {
    if (!this._html) return null;
    if (sel === '[data-tj="play"]') return (this.hijos[sel] ||= new ElementoFalso({ "data-tj-accion": "play" }));
    return (this.hijos[sel] ||= new ElementoFalso());
  }
  querySelectorAll(sel) { return sel === "[data-tj-paso]" ? this.pasos : []; }
  contains(el) { return el === this.hijos['[data-tj="play"]'] || this.pasos.includes(el); }
  addEventListener(tipo, f) { (this.oyentes[tipo] ||= []).push(f); }
  removeEventListener(tipo, f) { this.oyentes[tipo] = (this.oyentes[tipo] || []).filter((g) => g !== f); }
  dispatchEvent(e) { this.eventos.push(e); return true; }
  clic(el) { for (const f of this.oyentes.click || []) f({ target: el }); }
  // atajos para las pruebas
  get svg() { return this.hijos['[data-tj="lienzo"]'].innerHTML; }
  get titulo() { return this.hijos['[data-tj="titulo"]'].textContent; }
  get texto() { return this.hijos['[data-tj="texto"]'].textContent; }
  get boton() { return this.hijos['[data-tj="play"]']; }
  get pasosEmitidos() { return this.eventos.filter((e) => e.type === "tarjeta:paso").map((e) => e.detail.paso); }
}

/** Reloj falso: `programar` guarda la función y `avanzar(ms)` la ejecuta cuadro a cuadro. */
function relojFalso() {
  let ahora = 1000, siguiente = 1;
  const pendientes = new Map();
  const r = {
    llamadas: 0,
    ahora: () => ahora,
    programar: (f) => { r.llamadas++; const id = siguiente++; pendientes.set(id, f); return id; },
    cancelar: (id) => { pendientes.delete(id); },
    pendientes: () => pendientes.size,
    /** Avanza el tiempo en cuadros de 16 ms, como un navegador a 60 fps. */
    avanzar(ms, paso = 16) {
      const fin = ahora + ms;
      while (ahora < fin) {
        ahora = Math.min(fin, ahora + paso);
        const ahoraMismo = [...pendientes.entries()];
        pendientes.clear();
        for (const [, f] of ahoraMismo) f(ahora);
      }
    },
  };
  return r;
}

const SERIE = ayudante.caso("mor_temp");
function crear({ reloj = relojFalso(), contenedor = new ContenedorFalso(), ...extra } = {}) {
  const anim = Tarjeta.animacion(contenedor, SERIE.serie, {
    capa: "temp", lugar: "Morelos", stats: Stats, analisis: SERIE.analisis,
    programar: reloj.programar, cancelar: reloj.cancelar, ahora: reloj.ahora, reducirMovimiento: false, ...extra,
  });
  return { anim, reloj, c: contenedor };
}
const TOTAL = P.duracionTotal();

/* ---------- pruebas ---------- */

test.describe("al crearse", () => {
  test("muestra la gráfica completa, el último paso y el botón para empezar, sin emitir eventos", () => {
    const { anim, c, reloj } = crear();
    assert.deepEqual(anim.estado(), { paso: 4, corriendo: false, terminado: true });
    assert.ok(c.svg.startsWith("<svg") && !/NaN|undefined/.test(c.svg));
    assert.equal(c.titulo, "Paso 5 de 5 · Veredicto");
    assert.equal(c.boton.textContent, "▶ Ver cómo lo descubrió");
    assert.deepEqual(c.pasosEmitidos, []);
    assert.equal(reloj.llamadas, 0, "no debe programar cuadros si no se reproduce");
  });
  test("crea los 5 botones de paso y el botón de reproducir", () => {
    const { c } = crear();
    assert.equal(c.pasos.length, 5);
    assert.match(c.innerHTML, /data-tj-accion="play"/);
    assert.match(c.innerHTML, /class="tj-anim"/);
  });
  test("sin contenedor o sin serie lanza un error claro", () => {
    assert.throws(() => Tarjeta.animacion(null, SERIE.serie, { stats: Stats }), /falta un contenedor/);
    assert.throws(() => Tarjeta.animacion(new ContenedorFalso(), null, { stats: Stats }), /falta la serie/);
  });
  test("sin stats.js lanza un error claro", () => {
    assert.throws(() => Tarjeta.animacion(new ContenedorFalso(), SERIE.serie, { stats: null }), /necesita stats\.js/);
  });
  test("en el navegador encuentra el Stats global de stats.js, aunque no cuelgue de window", () => {
    // Como en la página: scripts clásicos que comparten el ámbito global. `const Stats` no crea window.Stats.
    const vm = require("vm"), fs = require("fs");
    const ctx = { console, Math, Date, JSON, Number, String, Array, Object, Error, Set, Map };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of ["stats.js", "tarjeta_capas.js", "tarjeta.js", "animacion.js"]) {
      vm.runInContext(fs.readFileSync(path.join(SRC, f), "utf8"), ctx, { filename: f });
    }
    assert.equal(ctx.Stats, undefined, "stats.js no debería crear window.Stats");
    assert.equal(Object.keys(ctx).filter((k) => /^[A-Z]/.test(k) && !["Math", "Date", "JSON", "Number", "String", "Array", "Object", "Error", "Set", "Map"].includes(k)).join(), "Tarjeta",
      "el único global nuevo es Tarjeta");
    const c = new ContenedorFalso(), reloj = relojFalso();
    const anim = ctx.Tarjeta.animacion(c, SERIE.serie, { capa: "temp", programar: reloj.programar, cancelar: reloj.cancelar, ahora: reloj.ahora, reducirMovimiento: false });
    assert.ok(c.svg.includes("<polyline"));
    assert.equal(anim.estado().paso, 4);
  });
  test("si no recibe el análisis, lo calcula con stats", () => {
    const { c } = crear({ analisis: undefined });
    assert.ok(c.svg.includes("<polyline"));
  });
});

test.describe("reproducir", () => {
  test("avanza los pasos en orden y emite tarjeta:paso al terminar cada uno", () => {
    const { anim, reloj, c } = crear();
    anim.reproducir();
    assert.deepEqual(anim.estado(), { paso: 0, corriendo: true, terminado: false });
    assert.equal(c.boton.textContent, "⏸ Pausa");
    const vistos = [];
    for (let t = 0; t < TOTAL + 500; t += 250) { reloj.avanzar(250); const p = anim.estado().paso; if (vistos.at(-1) !== p) vistos.push(p); }
    assert.deepEqual(vistos, [0, 1, 2, 3, 4]);
    assert.deepEqual(c.pasosEmitidos, [0, 1, 2, 3, 4]);
    assert.deepEqual(anim.estado(), { paso: 4, corriendo: false, terminado: true });
    assert.equal(c.boton.textContent, "⟲ Repetir");
  });
  test("el evento lleva el paso en detail", () => {
    const { anim, reloj, c } = crear();
    anim.reproducir();
    reloj.avanzar(P.PASOS[0].dur + 20);
    assert.equal(c.eventos[0].type, "tarjeta:paso");
    assert.deepEqual(c.eventos[0].detail, { paso: 0 });
  });
  test("el texto del paso cambia con el paso", () => {
    const { anim, reloj, c } = crear();
    anim.reproducir();
    assert.equal(c.titulo, "Paso 1 de 5 · La evidencia");
    assert.match(c.texto, /^Estos son 321 meses de temperatura del aire en Morelos/);
    reloj.avanzar(P.inicioDePaso(2) + 10);
    assert.equal(c.titulo, "Paso 3 de 5 · Trazamos la tendencia");
    assert.equal(c.pasos[2].getAttribute("aria-current"), "step");
    assert.equal(c.pasos[0].getAttribute("data-estado"), "hecho");
    assert.equal(c.pasos[3].getAttribute("data-estado"), "");
  });
  test("al terminar no programa más cuadros", () => {
    const { anim, reloj } = crear();
    anim.reproducir();
    reloj.avanzar(TOTAL + 1000);
    assert.equal(reloj.pendientes(), 0);
    const antes = reloj.llamadas;
    reloj.avanzar(5000);
    assert.equal(reloj.llamadas, antes);
  });
  test("después de terminar, reproducir vuelve a empezar desde el paso 1", () => {
    const { anim, reloj, c } = crear();
    anim.reproducir(); reloj.avanzar(TOTAL + 100);
    anim.reproducir();
    assert.equal(anim.estado().paso, 0);
    reloj.avanzar(TOTAL + 100);
    assert.deepEqual(c.pasosEmitidos, [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  });
  test("llamar a reproducir dos veces no duplica los cuadros", () => {
    const { anim, reloj } = crear();
    anim.reproducir(); anim.reproducir();
    assert.equal(reloj.pendientes(), 1);
  });
});

test.describe("pausar", () => {
  test("pausar y volver a reproducir continúa donde iba", () => {
    const { anim, reloj, c } = crear();
    anim.reproducir();
    reloj.avanzar(P.inicioDePaso(1) + 500);
    anim.pausar();
    assert.deepEqual(anim.estado(), { paso: 1, corriendo: false, terminado: false });
    assert.equal(c.boton.textContent, "▶ Continuar");
    const svgPausado = c.svg;
    reloj.avanzar(60000); // pasa mucho tiempo en pausa
    assert.equal(anim.estado().paso, 1);
    assert.equal(c.svg, svgPausado, "en pausa la gráfica no cambia");
    assert.equal(reloj.pendientes(), 0);
    anim.reproducir();
    reloj.avanzar(P.inicioDePaso(2) - P.inicioDePaso(1)); // lo que faltaba (más) para llegar al paso 3
    assert.equal(anim.estado().paso, 2);
  });
  test("pausar sin estar reproduciendo no hace nada", () => {
    const { anim, c } = crear();
    anim.pausar();
    assert.equal(c.boton.textContent, "▶ Ver cómo lo descubrió");
  });
});

test.describe("irAPaso", () => {
  test("irAPaso(3) salta al paso 4 y lo muestra completo", () => {
    const { anim, c } = crear();
    anim.irAPaso(3);
    assert.deepEqual(anim.estado(), { paso: 3, corriendo: false, terminado: false });
    assert.equal(c.titulo, "Paso 4 de 5 · ¿Y si fue casualidad?");
    assert.equal(c.boton.textContent, "▶ Continuar");
    // ya se ven las 21 líneas fantasma (grises: en Morelos todas apuntan hacia arriba)
    assert.ok((c.svg.match(/stroke="var\(--ghost/g) || []).length >= 21);
    assert.ok(!c.svg.includes("var(--mark"), "ninguna tendencia posible apunta al lado contrario");
  });
  test("irAPaso durante la reproducción la detiene", () => {
    const { anim, reloj } = crear();
    anim.reproducir(); reloj.avanzar(500);
    anim.irAPaso(2);
    assert.equal(anim.estado().corriendo, false);
    assert.equal(reloj.pendientes(), 0);
  });
  test("irAPaso al último paso queda terminado", () => {
    const { anim, c } = crear();
    anim.irAPaso(0);
    anim.irAPaso(4);
    assert.deepEqual(anim.estado(), { paso: 4, corriendo: false, terminado: true });
    assert.equal(c.boton.textContent, "⟲ Repetir");
  });
  test("un paso fuera de rango se ajusta al más cercano", () => {
    const { anim } = crear();
    anim.irAPaso(-3); assert.equal(anim.estado().paso, 0);
    anim.irAPaso(99); assert.equal(anim.estado().paso, 4);
    anim.irAPaso("x"); assert.equal(anim.estado().paso, 0);
  });
  test("ir hacia atrás no emite eventos; avanzar desde ahí emite los pasos nuevos", () => {
    const { anim, reloj, c } = crear();
    anim.irAPaso(1);
    assert.deepEqual(c.pasosEmitidos, []);
    anim.reproducir();
    reloj.avanzar(P.inicioDePaso(3) + P.PASOS[3].dur - P.inicioDePaso(1) - P.PASOS[1].dur + 20);
    assert.deepEqual(c.pasosEmitidos, [2, 3]);
  });
});

test.describe("clics y teclado", () => {
  test("el botón de reproducir alterna entre reproducir y pausar", () => {
    const { anim, reloj, c } = crear();
    c.clic(c.boton);
    assert.equal(anim.estado().corriendo, true);
    reloj.avanzar(300);
    c.clic(c.boton);
    assert.equal(anim.estado().corriendo, false);
  });
  test("un botón de paso lleva a ese paso (los botones nativos también responden a Enter y Espacio)", () => {
    const { anim, c } = crear();
    c.clic(c.pasos[2]);
    assert.equal(anim.estado().paso, 2);
  });
  test("los clics fuera de sus controles se ignoran", () => {
    const { anim, c } = crear();
    c.clic(new ElementoFalso({ "data-tj-accion": "play" })); // no es de este contenedor
    c.clic(null);
    assert.equal(anim.estado().corriendo, false);
  });
});

test.describe("movimiento reducido", () => {
  test("con movimiento reducido, reproducir salta directo al final", () => {
    const { anim, reloj, c } = crear({ reducirMovimiento: true });
    anim.reproducir();
    assert.deepEqual(anim.estado(), { paso: 4, corriendo: false, terminado: true });
    assert.equal(reloj.llamadas, 0);
    assert.equal(c.boton.textContent, "⟲ Repetir");
    assert.deepEqual(c.pasosEmitidos, [0, 1, 2, 3, 4]);
  });
  test("con movimiento reducido desde el paso 1, solo emite los pasos que faltaban", () => {
    const { anim, reloj, c } = crear({ reducirMovimiento: true });
    anim.irAPaso(0);
    anim.reproducir();
    assert.equal(anim.estado().terminado, true);
    assert.equal(reloj.llamadas, 0);
    assert.deepEqual(c.pasosEmitidos, [1, 2, 3, 4]);
  });
});

test.describe("varias instancias", () => {
  test("dos animaciones no se afectan", () => {
    const reloj = relojFalso();
    const a = crear({ reloj }), b = crear({ reloj, lugar: "Otro lugar" });
    a.anim.reproducir();
    reloj.avanzar(P.inicioDePaso(2) + 100);
    assert.equal(a.anim.estado().paso, 2);
    assert.deepEqual(b.anim.estado(), { paso: 4, corriendo: false, terminado: true });
    assert.deepEqual(b.c.pasosEmitidos, []);
    b.anim.irAPaso(0);
    assert.equal(a.anim.estado().paso, 2);
    assert.equal(a.anim.estado().corriendo, true);
  });
  test("cada animación usa su propio id de recorte", () => {
    const a = crear(), b = crear();
    const id = (svg) => svg.match(/clipPath id="([^"]+)"/)[1];
    assert.notEqual(id(a.c.svg), id(b.c.svg));
  });
  test("comparación de dos series con un lugar por serie", () => {
    const sahel = ayudante.caso("sahel_suelo"), norte = ayudante.caso("nmx_suelo");
    const c = new ContenedorFalso();
    const anim = Tarjeta.animacion(c, [sahel.serie, norte.serie], { capa: "suelo", lugar: ["Sahel", "Norte de México"], stats: Stats, reducirMovimiento: true });
    anim.irAPaso(2);
    assert.match(c.texto, /Sahel sube .* Norte de México baja/);
    assert.match(c.svg, /% respecto a su promedio/);
    assert.match(c.svg, />Sahel<\/text>/);
  });
});

test.describe("textos", () => {
  test("opciones.textos reemplaza el texto de un paso; los vacíos se ignoran", () => {
    const { anim, c } = crear({ textos: ["Hola <b>", "", null] });
    anim.irAPaso(0);
    assert.equal(c.texto, "Hola <b>"); // va por textContent: el navegador no lo interpreta como HTML
    anim.irAPaso(1);
    assert.match(c.texto, /^Quitamos las estaciones/);
  });
});

test.describe("destruir", () => {
  test("cancela el cuadro pendiente, quita los eventos y vacía el contenedor", () => {
    const { anim, reloj, c } = crear();
    anim.reproducir(); reloj.avanzar(200);
    anim.destruir();
    assert.equal(reloj.pendientes(), 0);
    assert.equal(c.innerHTML, "");
    assert.equal((c.oyentes.click || []).length, 0);
  });
  test("después de destruir ningún método falla ni programa otro cuadro", () => {
    const { anim, reloj, c } = crear();
    anim.destruir();
    const antes = reloj.llamadas;
    assert.doesNotThrow(() => { anim.reproducir(); anim.pausar(); anim.irAPaso(2); anim.estado(); anim.destruir(); });
    reloj.avanzar(TOTAL);
    assert.equal(reloj.llamadas, antes);
    assert.equal(c.innerHTML, "");
    assert.deepEqual(c.pasosEmitidos, []);
  });
  test("un cuadro que ya estaba en camino no hace nada después de destruir", () => {
    const reloj = relojFalso();
    let guardado = null;
    const programar = (f) => { guardado = f; return reloj.programar(f); };
    const { anim, c } = crear({ reloj: { ...reloj, programar } });
    anim.reproducir();
    anim.destruir();
    assert.doesNotThrow(() => guardado());
    assert.equal(c.innerHTML, "");
  });
});
