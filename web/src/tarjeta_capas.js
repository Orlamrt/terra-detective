/**
 * Terra Detective · Tarjeta · configuración por capa y formato de números.
 *
 * Para qué sirve: dice, para cada capa del mapa (temp, lluvia, suelo, verdor),
 * cómo convertir la unidad que llega del pipeline a la que ve la persona, con
 * cuántos decimales, cómo expresar el cambio y qué frases usar.
 *
 * Agrega a `Tarjeta`:
 *   - Tarjeta.capas          registro { id: configuración } (solo lectura)
 *   - Tarjeta.camposCapa     lista de campos obligatorios de una configuración
 *   - Tarjeta.registrarCapa  agrega o reemplaza una capa, validando sus campos
 *   - Tarjeta.capa           devuelve la configuración (o una genérica)
 *   - Tarjeta.formato        numero, cambio, puntos y periodo en formato es-MX
 *
 * Depende de: nada. Debe cargarse antes que tarjeta.js y animacion.js.
 * No toca el DOM. En Node se carga con `require` y comparte el objeto `Tarjeta`.
 */
(function (raiz) {
  "use strict";
  const Tarjeta = (raiz.Tarjeta = raiz.Tarjeta || {});

  /* ---------- formato de números (es-MX) ---------- */

  const MENOS = "−"; // signo menos tipográfico, como el prototipo
  const SIN_DATO = "—";

  /**
   * Redondea a `decimales` y convierte -0 en 0.
   * @param {number} x
   * @param {number} decimales
   * @returns {number}
   */
  function redondear(x, decimales) {
    const r = Number(x.toFixed(decimales));
    return r === 0 ? 0 : r;
  }

  /**
   * Formatea un número en es-MX con decimales fijos.
   * Nunca devuelve "-0", "NaN" ni "Infinity": si `x` no es un número finito, devuelve "—".
   * @param {number} x
   * @param {number} [decimales=1]
   * @returns {string}
   * @example Tarjeta.formato.numero(1234.56, 1) // "1,234.6"
   */
  function numero(x, decimales = 1) {
    if (typeof x !== "number" || !Number.isFinite(x)) return SIN_DATO;
    return redondear(x, decimales).toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }

  /**
   * Formatea un cambio con signo: "+0.9", "−3" o "0.0" (sin signo si redondea a cero).
   * @param {number} x
   * @param {number} [decimales=1]
   * @returns {string}
   * @example Tarjeta.formato.cambio(-2.95, 1) // "−3.0"
   */
  function cambio(x, decimales = 1) {
    if (typeof x !== "number" || !Number.isFinite(x)) return SIN_DATO;
    const r = redondear(x, decimales);
    return (r > 0 ? "+" : r < 0 ? MENOS : "") + numero(Math.abs(r), decimales);
  }

  /**
   * Formatea un cambio en puntos porcentuales: "3.0 puntos menos", "1 punto más", "sin cambio".
   * Se usa en capas que ya se muestran en % (el suelo), para no confundir con un cambio relativo.
   * @param {number} x diferencia en puntos
   * @param {number} [decimales=1]
   * @returns {string}
   * @example Tarjeta.formato.puntos(-2.7, 1) // "2.7 puntos menos"
   */
  function puntos(x, decimales = 1) {
    if (typeof x !== "number" || !Number.isFinite(x)) return SIN_DATO;
    const r = redondear(x, decimales);
    if (r === 0) return "sin cambio";
    const n = Math.abs(r);
    return `${numero(n, decimales)} ${n === 1 ? "punto" : "puntos"} ${r < 0 ? "menos" : "más"}`;
  }

  /**
   * Formatea un periodo de años: [2000, 2009] → "2000–09".
   * Si los años son de siglos distintos se escribe completo ("1998–2007"); si son iguales, uno solo.
   * Si el periodo no es válido devuelve "" (la tarjeta omite esa parte).
   * @param {[number, number]} periodo
   * @returns {string}
   * @example Tarjeta.formato.periodo([2000, 2009]) // "2000–09"
   */
  function periodo(periodo) {
    if (!Array.isArray(periodo) || periodo.length !== 2) return "";
    const [a, b] = periodo;
    if (!Number.isInteger(a) || !Number.isInteger(b)) return "";
    if (a === b) return String(a);
    const fin = Math.floor(a / 100) === Math.floor(b / 100) ? String(b).slice(-2) : String(b);
    return `${a}–${fin}`;
  }

  /* ---------- configuración por capa ---------- */

  const CAMPOS = ["id", "variable", "icono", "convertir", "unidadCorta", "unidadLarga", "decimales",
    "cambioComo", "subirEsCalor", "frases", "significa"];
  const ICONOS = ["sol", "nube", "brote", "hoja", "lupa"]; // "lupa" es el icono de la configuración genérica
  const CAMBIOS = ["absoluto", "porcentaje", "puntos"];

  // REVISAR(Tarea 5): texto cuando el cambio no es seguro.
  const NADA = "Con estos datos todavía no podemos decir que haya cambiado. Hay que seguir midiendo.";

  const registro = {};

  /** Congela un objeto y sus objetos internos (frases, significa). */
  function congelar(o) {
    for (const v of Object.values(o)) if (v && typeof v === "object") Object.freeze(v);
    return Object.freeze(o);
  }

  /**
   * Revisa que una configuración tenga todos los campos con el tipo correcto.
   * @param {object} c
   * @throws {Error} con el nombre del campo que falta o está mal
   */
  function validar(c) {
    if (!c || typeof c !== "object") throw new Error("registrarCapa: la configuración debe ser un objeto");
    for (const campo of CAMPOS) if (!(campo in c) || c[campo] === undefined) throw new Error(`registrarCapa: falta el campo "${campo}"`);
    const mal = (campo, como) => { throw new Error(`registrarCapa: el campo "${campo}" debe ser ${como}`); };
    if (typeof c.id !== "string" || !c.id) mal("id", "un texto no vacío");
    if (typeof c.variable !== "string" || !c.variable) mal("variable", "un texto no vacío");
    if (!ICONOS.includes(c.icono)) mal("icono", `uno de: ${ICONOS.join(", ")}`);
    if (typeof c.convertir !== "function") mal("convertir", "una función");
    if (typeof c.unidadCorta !== "string") mal("unidadCorta", "un texto (puede ser vacío)");
    if (typeof c.unidadLarga !== "string") mal("unidadLarga", "un texto (puede ser vacío)");
    if (!Number.isInteger(c.decimales) || c.decimales < 0 || c.decimales > 6) mal("decimales", "un entero de 0 a 6");
    if (!CAMBIOS.includes(c.cambioComo)) mal("cambioComo", `uno de: ${CAMBIOS.join(", ")}`);
    if (typeof c.subirEsCalor !== "boolean") mal("subirEsCalor", "true o false");
    for (const k of ["sube", "baja"]) if (!c.frases || typeof c.frases[k] !== "string") throw new Error(`registrarCapa: falta el campo "frases.${k}"`);
    for (const k of ["sube", "baja", "nada"]) if (!c.significa || typeof c.significa[k] !== "string") throw new Error(`registrarCapa: falta el campo "significa.${k}"`);
  }

  /**
   * Agrega (o reemplaza) una capa sin tocar el resto del código.
   * @param {object} config configuración con todos los campos de `Tarjeta.camposCapa`
   * @returns {object} la configuración registrada (congelada)
   * @throws {Error} si falta un campo; el mensaje dice cuál
   * @example
   * Tarjeta.registrarCapa({
   *   id: "nieve", variable: "Cobertura de nieve", icono: "nube",
   *   convertir: v => v * 100, unidadCorta: "%", unidadLarga: "% del terreno con nieve",
   *   decimales: 0, cambioComo: "puntos", subirEsCalor: false,
   *   frases: { sube: "Hay más nieve que antes", baja: "Hay menos nieve que antes" },
   *   significa: { sube: "…", baja: "…", nada: "…" }
   * });
   */
  function registrarCapa(config) {
    validar(config);
    const c = congelar({ ...config, frases: { ...config.frases }, significa: { ...config.significa } });
    registro[c.id] = c;
    return c;
  }

  /**
   * Configuración de una capa. Si la capa no está registrada devuelve una configuración
   * genérica (sin conversión, con la unidad que se le pase, cambio absoluto y textos neutros),
   * para que una capa futura se vea bien aunque nadie la haya registrado.
   * @param {string} id id de la capa ("temp", "lluvia", "suelo", "verdor", …)
   * @param {string} [unidad] unidad del resumen; solo se usa en la configuración genérica
   * @returns {object}
   */
  function capa(id, unidad) {
    if (typeof id === "string" && Object.prototype.hasOwnProperty.call(registro, id)) return registro[id];
    const u = typeof unidad === "string" ? unidad : "";
    const nombre = typeof id === "string" && id ? id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ") : "Variable";
    return congelar({
      id: typeof id === "string" ? id : "", generica: true, variable: nombre, icono: "lupa",
      convertir: v => v, unidadCorta: u, unidadLarga: u, decimales: 1, cambioComo: "absoluto",
      subirEsCalor: null, // sin tono cálido/frío: no sabemos qué significa subir
      frases: { sube: "Sube", baja: "Baja" },
      // REVISAR(Tarea 5): textos neutros para capas sin configuración.
      significa: {
        sube: "El aumento es real. Todavía no tenemos una explicación sencilla para esta variable.",
        baja: "La disminución es real. Todavía no tenemos una explicación sencilla para esta variable.",
        nada: NADA,
      },
    });
  }

  /* ---------- las 4 capas del proyecto ---------- */
  // Unidades de origen según pipeline/descargar.py.

  registrarCapa({
    id: "temp", variable: "Temperatura del aire", icono: "sol",
    convertir: v => v, // °C → °C
    unidadCorta: "°", unidadLarga: "°C", decimales: 1, cambioComo: "absoluto", subirEsCalor: true,
    frases: { sube: "Más calor que antes", baja: "Más fresco que antes" },
    // REVISAR(Tarea 5)
    significa: {
      sube: "Más días de calor, más riesgo de golpes de calor y más agua para regar.",
      baja: "Menos días de calor extremo. Plantas y cultivos pueden cambiar sus temporadas.",
      nada: NADA,
    },
  });

  registrarCapa({
    id: "lluvia", variable: "Lluvia del año", icono: "nube",
    convertir: v => v * 365.25, // mm/día → mm al año
    unidadCorta: "mm", unidadLarga: "mm al año", decimales: 0, cambioComo: "porcentaje", subirEsCalor: false,
    frases: { sube: "Llueve más que antes", baja: "Llueve menos que antes" },
    // REVISAR(Tarea 5)
    significa: {
      sube: "Más agua para cultivos y presas, y más riesgo de inundaciones.",
      baja: "Menos agua para cultivos, pastos y presas.",
      nada: "Por ahora no hay razón para cambiar planes por la lluvia. Hay que seguir midiendo varios años más.",
    },
  });

  registrarCapa({
    id: "suelo", variable: "Agua en el suelo", icono: "brote",
    // m³/m³ (fracción de volumen, ver docs/CONTRATO_DATOS.md) → %: 0.25 m³/m³ = 25 % de agua en el suelo.
    convertir: v => v * 100,
    unidadCorta: "%", unidadLarga: "% de agua en el suelo", decimales: 1,
    cambioComo: "puntos", // ya se muestra en %: el cambio va en puntos ("3 puntos menos"), no relativo
    subirEsCalor: false,
    frases: { sube: "El suelo tiene más agua", baja: "El suelo se está secando" },
    // REVISAR(Tarea 5)
    significa: {
      sube: "Más agua disponible para las raíces de plantas y cultivos.",
      baja: "Plantas y cultivos tienen menos agua: se necesita más riego que antes.",
      nada: NADA,
    },
  });

  registrarCapa({
    id: "verdor", variable: "Verdor de la vegetación", icono: "hoja",
    convertir: v => v, // NDVI (0 a 1, sin unidad)
    unidadCorta: "", unidadLarga: "de índice de verdor (NDVI)", decimales: 2, cambioComo: "absoluto",
    subirEsCalor: false, // "sube" = más verde: tono verde/frío
    frases: { sube: "Más verde que antes", baja: "Menos verde que antes" },
    // REVISAR(Tarea 5)
    significa: {
      sube: "Hay más vegetación o las plantas están más sanas que antes.",
      baja: "Hay menos vegetación o las plantas están más estresadas, por ejemplo por sequía, incendios o cambios en el uso del suelo.",
      nada: NADA,
    },
  });

  Tarjeta.capas = registro;
  Tarjeta.camposCapa = Object.freeze([...CAMPOS]);
  Tarjeta.registrarCapa = registrarCapa;
  Tarjeta.capa = capa;
  Tarjeta.formato = Object.freeze({ numero, cambio, puntos, periodo, SIN_DATO, MENOS });

  if (typeof module !== "undefined") module.exports = Tarjeta;
})(typeof window !== "undefined" ? window : globalThis);
