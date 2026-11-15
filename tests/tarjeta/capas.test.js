// Pruebas de web/src/tarjeta_capas.js: configuración por capa y formato de números.
// Uso: node --test tests/tarjeta/capas.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const Tarjeta = require(path.join(__dirname, "..", "..", "web", "src", "tarjeta_capas.js"));
const ayudante = require("./ayudante.js");

const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} no es ≈ ${b}`);

/** Una configuración completa y válida, para pruebas de registrarCapa. */
function configNieve(id) {
  return {
    id, variable: "Cobertura de nieve", icono: "nube", convertir: (v) => v * 100,
    unidadCorta: "%", unidadLarga: "% del terreno con nieve", decimales: 0, cambioComo: "puntos", subirEsCalor: false,
    frases: { sube: "Hay más nieve", baja: "Hay menos nieve" },
    significa: { sube: "Más nieve.", baja: "Menos nieve.", nada: "Sin cambio claro." },
  };
}

test.describe("capas registradas", () => {
  for (const id of ["temp", "lluvia", "suelo", "verdor"]) {
    test(`la capa ${id} tiene todos los campos con el tipo correcto`, () => {
      const c = Tarjeta.capa(id);
      for (const campo of Tarjeta.camposCapa) assert.ok(c[campo] !== undefined, `falta ${campo}`);
      assert.equal(c.id, id);
      assert.equal(typeof c.convertir, "function");
      assert.ok(Number.isInteger(c.decimales));
      for (const k of ["sube", "baja"]) assert.ok(c.frases[k].length > 0);
      for (const k of ["sube", "baja", "nada"]) assert.ok(c.significa[k].length > 0);
      assert.notEqual(c.generica, true);
    });
  }

  test("la lluvia pasa de mm/día a mm al año: 0.1 → 36.525", () => cerca(Tarjeta.capa("lluvia").convertir(0.1), 36.525));
  test("el suelo pasa de m³/m³ a %: 0.25 → 25", () => cerca(Tarjeta.capa("suelo").convertir(0.25), 25));
  test("la temperatura queda igual en °C", () => assert.equal(Tarjeta.capa("temp").convertir(21.4), 21.4));
  test("el verdor queda igual y usa 2 decimales", () => {
    const c = Tarjeta.capa("verdor");
    assert.equal(c.convertir(0.42), 0.42);
    assert.equal(c.decimales, 2);
  });
  test("el suelo muestra el cambio en puntos y la lluvia en porcentaje", () => {
    assert.equal(Tarjeta.capa("suelo").cambioComo, "puntos");
    assert.equal(Tarjeta.capa("lluvia").cambioComo, "porcentaje");
    assert.equal(Tarjeta.capa("temp").cambioComo, "absoluto");
  });
  test("las configuraciones registradas no se pueden modificar por accidente", () => {
    const c = Tarjeta.capa("temp");
    assert.ok(Object.isFrozen(c) && Object.isFrozen(c.frases) && Object.isFrozen(c.significa));
  });
});

test.describe("configuración genérica", () => {
  test("una capa desconocida devuelve una configuración genérica con la unidad del resumen", () => {
    const c = Tarjeta.capa("ozono", "DU");
    assert.equal(c.generica, true);
    assert.equal(c.unidadCorta, "DU");
    assert.equal(c.unidadLarga, "DU");
    assert.equal(c.cambioComo, "absoluto");
    assert.equal(c.convertir(300), 300);
    assert.equal(c.variable, "Ozono");
    assert.equal(c.subirEsCalor, null);
  });
  test("sin id ni unidad, la configuración genérica no tiene undefined", () => {
    const c = Tarjeta.capa(undefined);
    assert.equal(c.unidadCorta, "");
    assert.equal(c.variable, "Variable");
    for (const k of ["sube", "baja", "nada"]) assert.equal(typeof c.significa[k], "string");
  });
  test("pedir una capa desconocida no la registra", () => {
    Tarjeta.capa("capa_fantasma", "x");
    assert.equal(Object.prototype.hasOwnProperty.call(Tarjeta.capas, "capa_fantasma"), false);
  });
});

test.describe("registrarCapa", () => {
  test("una capa nueva se registra y se puede pedir sin tocar el resto", () => {
    const c = Tarjeta.registrarCapa(configNieve("nieve_prueba_1"));
    assert.equal(Tarjeta.capa("nieve_prueba_1"), c);
    assert.equal(Tarjeta.capa("nieve_prueba_1").convertir(0.3), 30);
    assert.equal(Tarjeta.capa("temp").variable, "Temperatura del aire");
  });
  for (const campo of ["variable", "convertir", "decimales", "frases", "significa", "subirEsCalor"]) {
    test(`si falta "${campo}", el error dice cuál falta`, () => {
      const c = configNieve("nieve_falta_" + campo);
      delete c[campo];
      assert.throws(() => Tarjeta.registrarCapa(c), new RegExp(`"${campo}"`));
    });
  }
  test('si falta "significa.nada", el error lo nombra', () => {
    const c = configNieve("nieve_sin_nada");
    delete c.significa.nada;
    assert.throws(() => Tarjeta.registrarCapa(c), /"significa\.nada"/);
  });
  test("un valor de cambioComo desconocido se rechaza", () => {
    assert.throws(() => Tarjeta.registrarCapa({ ...configNieve("nieve_mal"), cambioComo: "relativo" }), /"cambioComo"/);
  });
  test("una configuración con error no queda registrada", () => {
    const c = configNieve("nieve_rota");
    delete c.frases;
    assert.throws(() => Tarjeta.registrarCapa(c));
    assert.equal(Tarjeta.capa("nieve_rota").generica, true);
  });
});

test.describe("formato", () => {
  const F = Tarjeta.formato;
  test("los números usan formato es-MX", () => {
    assert.equal(F.numero(1234.56, 1), "1,234.6");
    assert.equal(F.numero(0.2, 2), "0.20");
    assert.equal(F.numero(920, 0), "920");
  });
  test("nunca muestra -0", () => {
    assert.equal(F.numero(-0.04, 1), "0.0");
    assert.equal(F.numero(-0, 0), "0");
    assert.equal(F.cambio(-0.04, 1), "0.0");
    assert.equal(F.puntos(-0.04, 1), "sin cambio");
  });
  test("nunca muestra NaN ni Infinity", () => {
    for (const x of [NaN, Infinity, -Infinity, null, undefined, "3"]) {
      for (const f of [F.numero, F.cambio, F.puntos]) {
        const t = f(x, 1);
        assert.equal(t, "—");
      }
    }
  });
  test("el cambio lleva signo + o el menos tipográfico", () => {
    assert.equal(F.cambio(0.94, 1), "+0.9");
    assert.equal(F.cambio(-2.95, 1), "−3.0");
    assert.equal(F.cambio(-3, 0), "−3");
  });
  test("los puntos se escriben en palabras, con singular y plural", () => {
    assert.equal(F.puntos(-2.7, 1), "2.7 puntos menos");
    assert.equal(F.puntos(1, 0), "1 punto más");
    assert.equal(F.puntos(3.04, 0), "3 puntos más");
  });
  test('el periodo [2000, 2009] se escribe "2000–09"', () => assert.equal(F.periodo([2000, 2009]), "2000–09"));
  test("un periodo que cruza de siglo se escribe completo", () => assert.equal(F.periodo([1998, 2007]), "1998–2007"));
  test("un periodo de un solo año se escribe una vez", () => assert.equal(F.periodo([2020, 2020]), "2020"));
  test("un periodo inválido da texto vacío", () => {
    for (const p of [undefined, null, [], [2000], [2000, null], "2000-2009"]) assert.equal(F.periodo(p), "");
  });
});

test.describe("ayudante de pruebas", () => {
  test("arma un resumen con números finitos para las 10 series reales", () => {
    const todos = ayudante.casos();
    assert.equal(todos.length, 10);
    for (const c of todos) {
      for (const k of ["antes", "hoy", "pendiente_decada", "p", "caras"]) assert.ok(Number.isFinite(c.resumen[k]), `${c.id}.${k}`);
      assert.ok(c.resumen.ic95.every(Number.isFinite), `${c.id}.ic95`);
      assert.ok(Number.isInteger(c.resumen.antes_periodo[0]) && Number.isInteger(c.resumen.hoy_periodo[1]));
    }
  });
  test("la lluvia de Morelos (mm/mes) se pasa a mm/día usando los días de cada mes", () => {
    assert.equal(ayudante.diasDelMes("2000-01", 1), 29); // febrero de 2000, bisiesto
    assert.equal(ayudante.diasDelMes("2001-01", 1), 28);
    const c = ayudante.caso("mor_lluvia");
    const original = ayudante.SERIES.find((s) => s.id === "mor_lluvia").v[0];
    cerca(c.serie.valores[0], original / 31);
  });
  test("el suelo de muestra viene en m³/m³, como la capa real (fracción entre 0 y 1)", () => {
    const c = ayudante.caso("nmx_suelo");
    assert.ok(c.resumen.antes > 0 && c.resumen.antes < 1);
  });
});
