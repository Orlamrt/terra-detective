/**
 * Terra Detective · Tarjeta · la tarjeta sencilla, para todo público.
 *
 * Para qué sirve: convierte un `resumen` (calculado por la Tarea 2 con stats.js) en el HTML de la
 * tarjeta: antes → hoy, veredicto corto, "¿Es seguro?" con monedas, "¿Qué significa?" y
 * "Desde que naciste". No calcula tendencias ni descarga nada: solo convierte unidades y formatea.
 *
 * Agrega a `Tarjeta`:
 *   - Tarjeta.html(resumen, opciones)   → texto HTML de una tarjeta
 *   - Tarjeta.htmlComparacion(resumenes, opciones) → tarjetas lado a lado con una frase que las compara
 *   - Tarjeta.escapar(texto)            → escapa & < > " '
 *   - Tarjeta.anioGuardado([almacen])   → año de nacimiento guardado, o null
 *   - Tarjeta.guardarAnio(anio, [almacen]) → guarda el año; true si se pudo
 *   - Tarjeta.interno                   → piezas internas para animacion.js y las pruebas (no es API pública)
 *
 * Depende de: tarjeta_capas.js (Tarjeta.capa, Tarjeta.formato). No toca el DOM.
 */
(function (raiz) {
  "use strict";
  const Tarjeta = (raiz.Tarjeta = raiz.Tarjeta || {});
  if (!Tarjeta.formato || !Tarjeta.capa) throw new Error("tarjeta.js: carga primero tarjeta_capas.js");
  const F = Tarjeta.formato;

  /* ---------- utilidades ---------- */

  /**
   * Escapa un texto para meterlo en HTML.
   * @param {*} texto
   * @returns {string}
   * @example Tarjeta.escapar('<script>') // "&lt;script&gt;"
   */
  function escapar(texto) {
    return String(texto == null ? "" : texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const esNumero = (x) => typeof x === "number" && Number.isFinite(x);
  const esPeriodo = (p) => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]);
  const CLAVES = ["muy", "si", "indicio", "no"];

  /**
   * Clave del veredicto, venga como texto ("muy") o como objeto ({ clave, texto }) de Stats.veredicto.
   * PENDIENTE(contrato): una clave desconocida se trata como "no" (no seguro), por prudencia.
   * @param {string|{clave:string}} v
   * @returns {"muy"|"si"|"indicio"|"no"}
   */
  function claveVeredicto(v) {
    const k = v && typeof v === "object" ? v.clave : v;
    return CLAVES.includes(k) ? k : "no";
  }

  /** Une un número formateado con su unidad: "+0.9°", "21.4 %", "+3.2 W/m²" o solo el número. */
  function conUnidad(texto, u) {
    if (!u) return texto;
    return u === "°" ? texto + u : `${texto} ${u}`;
  }

  /** Convierte una diferencia (o una pendiente) con la función de la capa, sin el desplazamiento. */
  const convertirDiferencia = (cfg, d) => cfg.convertir(d) - cfg.convertir(0);

  /**
   * Prepara todo lo que la tarjeta necesita a partir del resumen. Devuelve `null` si faltan
   * los datos esenciales (antes, hoy, p). Lo reutiliza htmlComparacion.
   * @param {object} resumen
   * @param {object} [opciones]
   * @returns {object|null}
   */
  function preparar(resumen, opciones = {}) {
    const r = resumen || {};
    const cfg = Tarjeta.capa(opciones.capa, r.unidad);
    if (!esNumero(r.antes) || !esNumero(r.hoy) || !esNumero(r.p)) return { vacio: true, r, cfg };
    const clave = claveVeredicto(r.veredicto);
    const pend = esNumero(r.pendiente_decada) ? r.pendiente_decada : null;
    // PENDIENTE(contrato): si no llega pendiente_decada, la dirección sale de hoy − antes.
    const signo = pend !== null ? Math.sign(pend) : Math.sign(r.hoy - r.antes);
    const dir = signo > 0 ? "sube" : signo < 0 ? "baja" : null;
    const seguro = (clave === "muy" || clave === "si") && dir !== null;
    // PENDIENTE(contrato): si no llegan las caras, se calculan con p como acordamos (⌊−log₂ p⌋).
    const caras = Number.isInteger(r.caras) && r.caras >= 0 ? r.caras : Math.max(0, Math.floor(-Math.log2(Math.max(r.p, 1e-300))));
    const antes = cfg.convertir(r.antes), hoy = cfg.convertir(r.hoy);
    const tono = !seguro || cfg.subirEsCalor === null ? "neutro"
      : (cfg.subirEsCalor ? (dir === "sube" ? "calor" : "agua") : (dir === "sube" ? "agua" : "calor"));
    return { vacio: false, r, cfg, clave, dir, seguro, caras, antes, hoy, pend, tono };
  }

  /**
   * Texto del cambio según la capa: "+0.9°", "−8 %" o "2.7 puntos menos".
   * @param {number} d diferencia ya convertida a la unidad que se muestra
   * @param {number} base valor de referencia ya convertido (para el porcentaje)
   * @param {object} cfg configuración de la capa
   */
  function textoCambio(d, base, cfg) {
    if (cfg.cambioComo === "puntos") return F.puntos(d, cfg.decimales);
    if (cfg.cambioComo === "porcentaje" && esNumero(base) && base !== 0) return `${F.cambio((100 * d) / Math.abs(base), 0)} %`;
    // "absoluto", o porcentaje con base 0 (no se divide entre cero)
    return conUnidad(F.cambio(d, cfg.decimales), cfg.unidadCorta);
  }

  /** Signo de un número después de redondearlo como se mostraría (-0.04 con 1 decimal → 0). */
  const signoMostrado = (x, dec) => Math.sign(Number(x.toFixed(dec)));

  /**
   * Lo que va entre paréntesis junto al veredicto. Si hoy − antes apunta al lado contrario de la
   * tendencia (pasa cuando un año extremo pesa en un promedio de 10), se muestra la tendencia por
   * década, para no decir "Sube" con un número negativo al lado.
   */
  function deltaVeredicto(P) {
    const { cfg, antes, hoy, dir, pend } = P;
    const d = hoy - antes;
    const decimalesMostrados = cfg.cambioComo === "porcentaje" && antes !== 0 ? 0 : cfg.decimales;
    const base = cfg.cambioComo === "porcentaje" && antes !== 0 ? (100 * d) / Math.abs(antes) : d;
    const coincide = signoMostrado(base, decimalesMostrados) === (dir === "sube" ? 1 : -1);
    if (!P.seguro || coincide || pend === null) return textoCambio(d, antes, cfg);
    const porDecada = convertirDiferencia(cfg, pend);
    if (cfg.cambioComo === "puntos") return `${F.puntos(porDecada, cfg.decimales)} por década`;
    if (cfg.cambioComo === "porcentaje" && antes !== 0) return `${F.cambio((100 * porDecada) / Math.abs(antes), 1)} % por década`;
    return `${conUnidad(F.cambio(porDecada, cfg.decimales + 1), cfg.unidadCorta)} por década`;
  }

  /* ---------- iconos (SVG en línea) ---------- */

  const ICONOS = {
    sol: '<circle cx="12" cy="12" r="5.2" fill="currentColor"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M4.8 19.2l2.1-2.1M17.1 6.9l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    nube: '<path d="M7 15.5a4 4 0 0 1 .4-8 5 5 0 0 1 9.4 1.6A3.4 3.4 0 0 1 17 15.5z" fill="currentColor"/><path d="M8.5 18.2l-1 2.3M12.5 18.2l-1 2.3M16.5 18.2l-1 2.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    brote: '<path d="M11 21v-8.5C11 8 8 5.5 3.5 5.5 3.5 10 6.5 12.5 11 12.5" fill="currentColor"/><path d="M13 21v-6c0-4 2.6-6.5 7.5-6.5 0 4-2.6 6.5-7.5 6.5" fill="currentColor"/><rect x="5" y="20" width="14" height="2.2" rx="1" fill="currentColor"/>',
    hoja: '<path d="M20.5 3.5C11 3.5 4.5 8.5 4.5 15.5c0 1.6.4 3 1.1 4.1C9 12.8 13 10 17 8.5c-4.6 2.6-8 6.6-10.2 12 1.3.6 2.8 1 4.4 1 6.6 0 9.3-6.8 9.3-18z" fill="currentColor"/>',
    lupa: '<circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M14.6 14.6L21 21" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  };
  const icono = (id) => `<svg class="tj-icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONOS[id] || ICONOS.lupa}</svg>`;

  /* ---------- partes de la tarjeta ---------- */

  /** Texto de "¿Es seguro?" según las caras y el veredicto (misma lógica que monedasHTML del prototipo). */
  function textoMonedas(P) {
    const n = P.caras;
    if (!P.seguro) {
      const cierre = P.clave === "indicio" ? "<b>Hay una pista, pero todavía no es seguro.</b>" : "<b>No podemos asegurar que cambió.</b>";
      return n <= 1 ? `Como sacar <b>cara</b> al lanzar una moneda: pasa todo el tiempo. ${cierre}`
        : `Como sacar <b>${n} caras seguidas</b>: pasa seguido. ${cierre}`;
    }
    if (n > 10) return "Como sacar <b>más de 10 caras seguidas</b>. Eso casi nunca pasa por suerte: <b>el cambio es real.</b>";
    // PENDIENTE(contrato): un veredicto seguro con 0 o 1 cara no debería ocurrir; si llega, manda el veredicto.
    if (n <= 1) return "<b>Las pruebas dicen que el cambio es real.</b>";
    return `Como sacar <b>${n} caras seguidas</b>: pasa 1 vez de cada ${F.numero(2 ** n, 0)}. `
      + (P.clave === "muy" ? "<b>Es muy probable que el cambio sea real.</b>" : "<b>Probablemente es real, aunque con menos margen.</b>");
  }

  function monedasHTML(P, textos) {
    const on = Math.min(P.caras, 10);
    const etiqueta = P.caras > 10 ? "Más de 10 caras seguidas" : P.caras === 1 ? "1 cara" : `${P.caras} caras seguidas`;
    const fichas = Array.from({ length: 10 }, (_, i) => `<i class="tj-moneda${i < on ? " tj-on" : ""}"></i>`).join("");
    const txt = textos.seguro != null ? escapar(textos.seguro) : textoMonedas(P);
    return `<div class="tj-monedas" role="img" aria-label="${escapar(etiqueta)}">${fichas}</div><p>${txt}</p>`;
  }

  /**
   * "Desde que naciste". Devuelve "" si no aplica (sin año, nacido después de los datos o sin periodos).
   * cambio ≈ pendiente_decada / 10 × (año_fin − max(anioNacimiento, año_inicio))
   */
  function desdeHTML(P, opciones, textos) {
    const anio = opciones.anioNacimiento;
    if (!Number.isInteger(anio) || !esPeriodo(P.r.antes_periodo) || !esPeriodo(P.r.hoy_periodo)) return "";
    const inicio = P.r.antes_periodo[0], fin = P.r.hoy_periodo[1], desde = Math.max(anio, inicio);
    if (desde >= fin) return ""; // nació después (o el mismo año) del último dato: no hay nada que contar
    if (textos.desde != null) return `<p class="tj-desde">${escapar(textos.desde)}</p>`;
    const pre = anio < inicio ? `Desde ${inicio} (cuando empiezan estos datos)` : `Desde que naciste (${anio})`;
    if (!P.seguro || P.pend === null) return `<p class="tj-desde">${pre}: <b>sin cambio claro.</b></p>`;
    const d = convertirDiferencia(P.cfg, (P.pend / 10) * (fin - desde));
    const txt = textoCambio(d, P.antes, P.cfg);
    return `<p class="tj-desde">${pre}: ${P.cfg.cambioComo === "puntos" ? "" : "cambió "}<b>${txt}</b>.</p>`;
  }

  const avisoHTML = (r, textos) => r && r.ilustrativo === true
    ? `<p class="tj-aviso" role="note"><span aria-hidden="true">⚠ </span>${escapar(textos.aviso != null ? textos.aviso : "Datos de prueba, no reales.")}</p>` : "";

  function encabezadoHTML(r, cfg, textos, clase) {
    const lugar = typeof r.lugar === "string" && r.lugar ? `<b>${escapar(r.lugar)}</b>` : "";
    const variable = textos.variable != null ? textos.variable : cfg.variable;
    return `<div class="tj-lugar"><div>${lugar}${lugar ? " " : ""}<span>${escapar(variable)}</span></div><span class="tj-icono-caja ${clase}">${icono(cfg.icono)}</span></div>`;
  }

  function vaciaHTML(P, textos) {
    const variable = (textos.variable != null ? textos.variable : P.cfg.variable).toLowerCase();
    const frase = textos.sinDatos != null ? textos.sinDatos
      : `En este lugar no hay datos de ${variable}. Puede ser mar, hielo o una zona sin mediciones. Prueba con otro lugar o con otra capa.`;
    return `<article class="tj-tarjeta tj-vacia"><div class="tj-top tj-neutro">${encabezadoHTML(P.r, P.cfg, textos, "tj-neutro")}`
      + `<p class="tj-veredicto">Sin datos para este lugar</p></div>`
      + `<div class="tj-cuerpo"><p>${escapar(frase)}</p>${avisoHTML(P.r, textos)}</div></article>`;
  }

  /* ---------- API ---------- */

  /**
   * HTML de la tarjeta sencilla de un lugar.
   *
   * @param {object} resumen datos ya calculados con stats.js (ver docs/TARJETA.md):
   *   { antes, hoy, antes_periodo, hoy_periodo, unidad, pendiente_decada, ic95, p, veredicto, caras, lugar, ilustrativo }
   * @param {object} [opciones]
   * @param {string} [opciones.capa] "temp" | "lluvia" | "suelo" | "verdor" | otra (usa la configuración genérica)
   * @param {number} [opciones.anioNacimiento] para "Desde que naciste"
   * @param {object} [opciones.textos] reemplaza frases (texto plano, se escapa):
   *   variable, veredicto, seguro, significa, desde, sinDatos, aviso
   * @returns {string} HTML
   * @example
   * contenedor.innerHTML = Tarjeta.html(resumen, { capa: "temp", anioNacimiento: 2005 });
   */
  function html(resumen, opciones = {}) {
    const textos = (opciones && opciones.textos) || {};
    const P = preparar(resumen, opciones || {});
    if (P.vacio) return vaciaHTML(P, textos);
    const { r, cfg } = P;
    const dec = cfg.decimales;
    const per = (p) => { const t = F.periodo(p); return t ? ` (${t})` : ""; };
    // La unidad va pegada solo si es "°"; las demás llevan un espacio fino que no se corta ("1,008 mm").
    const unidadGrande = !cfg.unidadCorta ? "" : `<span>${cfg.unidadCorta === "°" ? "" : " "}${escapar(cfg.unidadCorta)}</span>`;
    const numeroGrande = (x) => `<b>${F.numero(x, dec)}${unidadGrande}</b>`;

    let veredicto;
    if (textos.veredicto != null) veredicto = escapar(textos.veredicto);
    else if (P.seguro) veredicto = `<span aria-hidden="true">${P.dir === "sube" ? "▲" : "▼"}</span> ${escapar(cfg.frases[P.dir])} <span class="tj-delta">(${escapar(deltaVeredicto(P))})</span>`;
    else veredicto = `<span aria-hidden="true">≈</span> Sin cambio claro <span class="tj-delta">(${escapar(textoCambio(P.hoy - P.antes, P.antes, cfg))}, puede ser suerte)</span>`;

    const significa = textos.significa != null ? textos.significa : P.seguro ? cfg.significa[P.dir] : cfg.significa.nada;

    return `<article class="tj-tarjeta tj-${P.tono}" data-veredicto="${P.clave}">`
      + `<div class="tj-top tj-${P.tono}">${encabezadoHTML(r, cfg, textos, "tj-" + P.tono)}`
      + `<div class="tj-num"><div><small>Antes${per(r.antes_periodo)}</small>${numeroGrande(P.antes)}</div>`
      + `<div class="tj-flecha" aria-hidden="true">→</div><div><small>Hoy${per(r.hoy_periodo)}</small>${numeroGrande(P.hoy)}</div></div>`
      + `<p class="tj-veredicto">${veredicto}</p></div>`
      + `<div class="tj-cuerpo"><section><h4>¿Es seguro?</h4>${monedasHTML(P, textos)}</section>`
      + (significa ? `<section><h4>¿Qué significa?</h4><p>${escapar(significa)}</p></section>` : "")
      + desdeHTML(P, opciones, textos) + avisoHTML(r, textos) + `</div></article>`;
  }

  /* ---------- comparación de lugares ---------- */

  /**
   * Frase que resume la comparación. Los lugares sin datos cuentan como "sin cambio seguro".
   * @param {Array<{seguro:boolean, dir:string|null}>} preparados
   * @returns {string}
   */
  function fraseComparacion(preparados) {
    const n = preparados.length;
    const seguros = preparados.filter((P) => P.seguro);
    const dos = n === 2;
    if (seguros.length === 0) return dos ? "En ninguno de los dos lugares hay un cambio claro." : "En ninguno de los lugares hay un cambio claro.";
    if (seguros.length < n) {
      if (seguros.length === 1) return dos ? "Solo en uno de los dos lugares el cambio es seguro." : `Solo en uno de los ${n} lugares el cambio es seguro.`;
      return `Solo en ${seguros.length} de los ${n} lugares el cambio es seguro.`;
    }
    const dirs = new Set(seguros.map((P) => P.dir));
    if (dirs.size > 1) return dos ? "Depende del lugar: en uno sube y en otro baja." : "Depende del lugar: en unos sube y en otros baja.";
    const dir = seguros[0].dir;
    return dos ? `En los dos lugares ${dir}.` : `En todos los lugares ${dir}.`;
  }

  /**
   * Varias tarjetas lado a lado con una frase arriba que las compara
   * ("Depende del lugar: en uno sube y en otro baja", "En los dos lugares sube"…).
   * Recibe un arreglo de cualquier largo; hoy se usa con 2.
   *
   * @param {object[]} resumenes un resumen por lugar (mismo formato que Tarjeta.html)
   * @param {object} [opciones] las mismas de Tarjeta.html, compartidas por todas las tarjetas, más:
   * @param {object[]} [opciones.porTarjeta] opciones de cada tarjeta (se mezclan encima de las compartidas),
   *   por ejemplo para usar otra capa o textos distintos en un lugar
   * @param {string} [opciones.textos.comparacion] reemplaza la frase de arriba (se escapa)
   * @returns {string} HTML
   * @example
   * contenedor.innerHTML = Tarjeta.htmlComparacion([resumenSahel, resumenNorte], { capa: "suelo" });
   */
  function htmlComparacion(resumenes, opciones = {}) {
    const op = opciones || {};
    const lista = Array.isArray(resumenes) ? resumenes : [];
    if (lista.length === 0) return `<div class="tj-comparacion"><p class="tj-resumen">No hay lugares para comparar.</p></div>`;
    const porTarjeta = Array.isArray(op.porTarjeta) ? op.porTarjeta : [];
    const compartidas = { ...op };
    delete compartidas.porTarjeta;
    const ops = lista.map((_, i) => {
      const propias = porTarjeta[i] || {};
      return { ...compartidas, ...propias, textos: { ...(compartidas.textos || {}), ...(propias.textos || {}) } };
    });
    const tarjetas = lista.map((r, i) => {
      const o = ops[i];
      delete o.textos.comparacion; // la frase de arriba no es un texto de la tarjeta
      return Tarjeta.html(r, o);
    });
    let frase = "";
    if (lista.length > 1) {
      const t = op.textos && op.textos.comparacion;
      frase = t != null ? escapar(t) : fraseComparacion(lista.map((r, i) => preparar(r, ops[i])));
    }
    return `<div class="tj-comparacion">${frase ? `<p class="tj-resumen">${frase}</p>` : ""}`
      + `<div class="tj-grid">${tarjetas.join("")}</div></div>`;
  }

  /* ---------- año de nacimiento (localStorage) ---------- */

  const CLAVE_ANIO = "terraAnio";
  const anioValido = (a) => Number.isInteger(a) && a >= 1900 && a <= 2100;
  const almacenPorDefecto = () => { try { return raiz.localStorage; } catch (e) { return undefined; } };

  /**
   * Año de nacimiento guardado en el navegador, o null si no hay (o si localStorage falla).
   * @param {Storage} [almacen] por defecto window.localStorage
   * @returns {number|null}
   */
  function anioGuardado(almacen = almacenPorDefecto()) {
    try {
      const a = parseInt(almacen.getItem(CLAVE_ANIO), 10);
      return anioValido(a) ? a : null;
    } catch (e) { return null; }
  }

  /**
   * Guarda el año de nacimiento. Nunca lanza error.
   * @param {number} anio entre 1900 y 2100
   * @param {Storage} [almacen] por defecto window.localStorage
   * @returns {boolean} true si se guardó
   */
  function guardarAnio(anio, almacen = almacenPorDefecto()) {
    if (!anioValido(anio)) return false;
    try { almacen.setItem(CLAVE_ANIO, String(anio)); return true; } catch (e) { return false; }
  }

  Tarjeta.html = html;
  Tarjeta.htmlComparacion = htmlComparacion;
  Tarjeta.escapar = escapar;
  Tarjeta.anioGuardado = anioGuardado;
  Tarjeta.guardarAnio = guardarAnio;
  Tarjeta.interno = Object.assign(Tarjeta.interno || {}, { preparar, claveVeredicto, textoCambio, conUnidad, convertirDiferencia });

  if (typeof module !== "undefined") module.exports = Tarjeta;
})(typeof window !== "undefined" ? window : globalThis);
