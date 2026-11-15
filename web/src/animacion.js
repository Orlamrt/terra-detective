/**
 * Terra Detective · Tarjeta · la prueba detallada: animación de 5 pasos.
 *
 * Para qué sirve: muestra cómo se descubre una tendencia en 5 pasos (la evidencia, quitar las
 * estaciones, la tendencia, ¿pudo ser casualidad?, veredicto) a partir de una serie mensual.
 *
 * Está separada en dos partes:
 *   - Lógica pura (sin DOM), en Tarjeta.animacion.puro: prepara los datos, calcula el estado de
 *     cada instante y construye el SVG como texto. Se prueba en Node.
 *   - Capa delgada de DOM (Tarjeta.animacion): crea los controles en un contenedor y en cada
 *     cuadro llama a la lógica pura. Cada instancia guarda su propio estado.
 *
 * Agrega a `Tarjeta`:
 *   - Tarjeta.animacion(contenedor, serie, opciones) → controlador
 *   - Tarjeta.animacion.puro  → { PASOS, PAUSA, MAX_SERIES, prepararVista, dominio, ticks, estadoEn,
 *                                 duracionTotal, inicioDePaso, construirSVG, textosPasos }
 *
 * Depende de: tarjeta_capas.js (Tarjeta.capa, Tarjeta.formato), tarjeta.js (Tarjeta.escapar,
 * Tarjeta.interno) y de stats.js (el `Stats` global, o `opciones.stats`).
 * Ojo: stats.js declara `const Stats` en el nivel superior; en el navegador eso es una variable
 * global pero NO una propiedad de window, por eso se busca con `typeof Stats`.
 */
(function (raiz) {
  "use strict";
  const Tarjeta = (raiz.Tarjeta = raiz.Tarjeta || {});
  if (!Tarjeta.formato || !Tarjeta.escapar) throw new Error("animacion.js: carga primero tarjeta_capas.js y tarjeta.js");
  const F = Tarjeta.formato, esc = Tarjeta.escapar;

  /* ---------- constantes ---------- */

  /** Los 5 pasos y cuánto dura cada uno (ms), como en el prototipo. */
  const PASOS = Object.freeze([
    Object.freeze({ t: "La evidencia", dur: 3600 }),
    Object.freeze({ t: "Quitamos las estaciones", dur: 3200 }),
    Object.freeze({ t: "Trazamos la tendencia", dur: 2600 }),
    Object.freeze({ t: "¿Y si fue casualidad?", dur: 3000 }),
    Object.freeze({ t: "Veredicto", dur: 1200 }),
  ]);
  /** Pausa al final de cada paso para leer el texto (ms). */
  const PAUSA = 2200;
  /** Máximo de series en una misma gráfica (por legibilidad). Cambiarlo aquí basta. */
  const MAX_SERIES = 2;
  /** Cuántas líneas fantasma (tendencias posibles) se dibujan, de −1.96 a +1.96 errores estándar. */
  const N_FANTASMAS = 21;

  const COLOR = {
    warm: "var(--warm, #c2341f)", cool: "var(--cool, #2d6ab3)", accent: "var(--accent, #0e6e6b)",
    line: "var(--line, #d3dce0)", muted: "var(--muted, #5b6b73)", mark: "var(--mark, #d9a21b)",
    surface: "var(--surface, #ffffff)", ink: "var(--ink, #14222b)", ghost: "var(--ghost, rgba(20,34,43,.16))",
  };

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const finito = (x) => typeof x === "number" && Number.isFinite(x);
  const n1 = (x) => (Math.round(x * 10) / 10).toString(); // coordenadas SVG con 1 decimal

  /* ---------- datos ---------- */

  /**
   * Prepara lo que se dibuja de cada serie, ya en la unidad que se muestra.
   * Con una serie, los valores van convertidos con la capa. Con dos (comparación), cada valor se
   * muestra como % arriba o abajo del promedio de su propia serie, para ponerlas en la misma escala.
   *
   * @param {Array<{valores:number[], inicio:string}>} series 1 o 2 series (si llegan más, se usan las primeras MAX_SERIES)
   * @param {object[]} analisis resultado de Stats.analizar de cada serie, en el mismo orden
   * @param {object} configCapa configuración de Tarjeta.capa(...)
   * @param {string[]} [etiquetas] nombre de cada lugar (para la comparación)
   * @returns {object[]} una vista por serie: { k, comparacion, color, colorLinea, mens, anual, fantasmas, b, se, nivel(t, b), etiqueta }
   */
  function prepararVista(series, analisis, configCapa, etiquetas = []) {
    const lista = (Array.isArray(series) ? series : [series]).slice(0, MAX_SERIES);
    const comp = lista.length > 1;
    const cfg = configCapa || Tarjeta.capa(null, "");
    return lista.map((_, k) => {
      const r = analisis[k] || {};
      const conv = (v) => cfg.convertir(v);
      const base = conv(r.meanAll);
      // Comparación: % respecto al promedio. Si el promedio es 0 no se puede dividir: se usa la anomalía.
      const porcentaje = comp && finito(base) && base !== 0;
      const tr = (v) => (!comp ? conv(v) : porcentaje ? ((conv(v) - base) / Math.abs(base)) * 100 : conv(v) - base);
      const b = finito(r.b) ? r.b : 0, se = finito(r.se) ? r.se : 0, tm = finito(r.tm) ? r.tm : 0;
      const nivel = (t, bb = b) => tr(r.meanAll + bb * (t - tm));
      const mens = (r.pts || []).map((p) => ({ t: p.t, v: tr(p.v) })).filter((p) => finito(p.t) && finito(p.v));
      const anual = (r.anual || []).map((a) => ({ t: a.y + 0.5, v: tr(a.v), completo: !!a.completo })).filter((p) => finito(p.v));
      const fantasmas = Array.from({ length: N_FANTASMAS }, (_, i) => b + (-1.96 + (i * 3.92) / (N_FANTASMAS - 1)) * se);
      const color = comp ? (k ? COLOR.warm : COLOR.cool) : COLOR.warm;
      return {
        k, comparacion: comp, porcentaje, color, colorLinea: comp ? color : COLOR.accent,
        mens, anual, fantasmas, b, se, nivel, etiqueta: typeof etiquetas[k] === "string" ? etiquetas[k] : "",
      };
    });
  }

  /**
   * Rango de la gráfica. En modo "mens" cubre la serie mensual; en "anual" cubre los promedios
   * anuales y todas las líneas fantasma. Siempre devuelve números finitos.
   * @param {object[]} vistas de prepararVista
   * @param {"mens"|"anual"} modo
   * @returns {{lo:number, hi:number, t0:number, t1:number}}
   */
  function dominio(vistas, modo) {
    let lo = Infinity, hi = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const v of vistas) {
      if (!v.mens.length) continue;
      for (const p of modo === "mens" ? v.mens : v.anual) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
      t0 = Math.min(t0, v.mens[0].t); t1 = Math.max(t1, v.mens[v.mens.length - 1].t);
      if (modo !== "mens") {
        for (const b of [v.fantasmas[0], v.fantasmas[v.fantasmas.length - 1], v.b]) {
          for (const t of [v.mens[0].t, v.mens[v.mens.length - 1].t]) { const y = v.nivel(t, b); if (finito(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } }
        }
      }
    }
    if (!finito(lo) || !finito(hi)) { lo = 0; hi = 1; }
    if (!finito(t0) || !finito(t1)) { t0 = 0; t1 = 1; }
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
    let a = Math.floor(t0), z = Math.ceil(t1);
    if (z <= a) z = a + 1;
    return { lo: lo - pad, hi: hi + pad, t0: a, t1: z };
  }

  /**
   * Valores "redondos" para el eje (pasos de 1, 2, 2.5 o 5 × 10ⁿ) dentro de [lo, hi].
   * @param {number} lo
   * @param {number} hi
   * @param {number} [n=5] cuántas divisiones, aproximadamente
   * @returns {number[]}
   */
  function ticks(lo, hi, n = 5) {
    if (!finito(lo) || !finito(hi)) return [];
    if (!(hi > lo)) return [lo];
    const paso0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(paso0)));
    const paso = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= paso0 - 1e-12);
    const out = [];
    for (let i = Math.ceil(lo / paso - 1e-9); i * paso <= hi + 1e-9 && out.length < 50; i++) out.push(Number((i * paso).toPrecision(12)));
    return out;
  }

  /* ---------- tiempo ---------- */

  /** Duración total de la animación (ms), contando la pausa de cada paso. */
  const duracionTotal = (pasos = PASOS, pausa = PAUSA) => pasos.reduce((s, p) => s + p.dur + pausa, 0);

  /** Instante (ms) en que empieza el paso `i`. */
  const inicioDePaso = (i, pasos = PASOS, pausa = PAUSA) => pasos.slice(0, i).reduce((s, p) => s + p.dur + pausa, 0);

  /**
   * Estado de la animación en el instante `ms`: qué paso se ve y cuánto ha avanzado cada efecto (0 a 1).
   * @param {number} ms tiempo desde el inicio
   * @param {Array<{dur:number}>} [pasos=PASOS]
   * @param {number} [pausaEntrePasos=PAUSA]
   * @returns {{i:number, p:number, dibujo:number, desvanecer:number, escala:number, puntos:number, linea:number, fantasmas:number, veredicto:boolean, terminado:boolean}}
   */
  function estadoEn(ms, pasos = PASOS, pausaEntrePasos = PAUSA) {
    const t = finito(ms) ? Math.max(0, ms) : 0;
    const total = duracionTotal(pasos, pausaEntrePasos);
    let acc = 0, i = 0, p = 1;
    for (; i < pasos.length; i++) {
      const d = pasos[i].dur + pausaEntrePasos;
      if (t < acc + d) { p = clamp((t - acc) / pasos[i].dur); break; }
      acc += d;
    }
    if (i >= pasos.length) { i = pasos.length - 1; p = 1; }
    const en = (n, f) => (i < n ? 0 : i > n ? 1 : f(p));
    return {
      i, p,
      dibujo: en(0, ease),
      desvanecer: en(1, (q) => ease(clamp(q * 2))),
      escala: en(1, (q) => ease(clamp((q - 0.15) / 0.5))),
      puntos: en(1, (q) => clamp((q - 0.35) / 0.6)),
      linea: en(2, ease),
      fantasmas: en(3, ease),
      veredicto: i >= pasos.length - 1,
      terminado: t >= total,
    };
  }

  /* ---------- dibujo ---------- */

  /** Etiqueta con fondo, como `lbl` del prototipo. */
  function etiquetaSVG(x, y, texto, ancla, opacidad, color = COLOR.ink) {
    const w = texto.length * 7.2 + 12, xx = ancla === "start" ? x : x - w;
    return `<g opacity="${n1(opacidad)}"><rect x="${n1(xx)}" y="${n1(y - 24)}" width="${n1(w)}" height="20" rx="4" fill="${COLOR.surface}" stroke="${COLOR.line}"/>`
      + `<text x="${n1(xx + 6)}" y="${n1(y - 10)}" fill="${color}" font-weight="500">${esc(texto)}</text></g>`;
  }

  /** Decimales para los números del eje según el paso entre marcas. */
  function decimalesEje(marcas) {
    if (marcas.length < 2) return 1;
    const paso = Math.abs(marcas[1] - marcas[0]);
    for (let d = 0; d < 4; d++) if (Math.abs(Number(paso.toFixed(d)) - paso) < 1e-9) return d;
    return 4;
  }

  /**
   * Construye el SVG de un instante como texto.
   * @param {object} estado de estadoEn
   * @param {object[]} vistas de prepararVista
   * @param {{mens:object, anual:object}} dominios dominio(vistas, "mens") y dominio(vistas, "anual")
   * @param {object} [medidas]
   * @param {number} [medidas.ancho=800]
   * @param {number} [medidas.alto=360]
   * @param {string} [medidas.idClip] id único del recorte (obligatorio si hay varias animaciones en la página)
   * @param {string} [medidas.etiquetaEje] texto arriba del eje vertical (la unidad)
   * @param {string} [medidas.unidadCorta] unidad junto a los valores de la tendencia
   * @param {number} [medidas.decimales=1] decimales de los valores de la tendencia
   * @param {string} [medidas.descripcion] texto alternativo de la gráfica
   * @returns {string} `<svg>…</svg>`
   */
  function construirSVG(estado, vistas, dominios, medidas = {}) {
    const W = medidas.ancho || 800, H = medidas.alto || 360, M = { l: 58, r: 22, t: 20, b: 34 };
    const id = esc(medidas.idClip || "tj-area");
    const dec = Number.isInteger(medidas.decimales) ? medidas.decimales : 1;
    const valor = (v) => `${F.numero(v, dec)}${medidas.unidadCorta ? (medidas.unidadCorta === "°" ? "" : " ") + medidas.unidadCorta : ""}`;
    const abre = `<svg class="tj-grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(medidas.descripcion || "Gráfica de la serie y su tendencia")}">`;
    const comp = vistas.length > 1;
    if (!vistas.some((v) => v.mens.length > 1)) {
      return `${abre}<text class="tj-eje" x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${COLOR.muted}">No hay datos suficientes para dibujar esta serie.</text></svg>`;
    }
    const st = estado, dm = dominios.mens, da = dominios.anual, k = st.escala;
    const lo = dm.lo + (da.lo - dm.lo) * k, hi = dm.hi + (da.hi - dm.hi) * k, t0 = dm.t0, t1 = dm.t1;
    const X = (t) => M.l + ((t - t0) / (t1 - t0)) * (W - M.l - M.r);
    const Y = (v) => H - M.b - ((v - lo) / (hi - lo)) * (H - M.t - M.b);
    let g = `<defs><clipPath id="${id}"><rect x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}"/></clipPath></defs>`;

    // ejes
    const marcas = ticks(lo, hi), dEje = decimalesEje(marcas);
    for (const v of marcas) {
      g += `<line x1="${M.l}" x2="${W - M.r}" y1="${n1(Y(v))}" y2="${n1(Y(v))}" stroke="${COLOR.line}"/>`
        + `<text class="tj-eje" x="${M.l - 8}" y="${n1(Y(v) + 4)}" text-anchor="end">${F.numero(v, dEje)}</text>`;
    }
    const pasoAnios = t1 - t0 > 30 ? 10 : t1 - t0 > 6 ? 5 : 1;
    for (let y = Math.ceil(t0 / pasoAnios) * pasoAnios; y <= t1; y += pasoAnios) {
      g += `<line x1="${n1(X(y))}" x2="${n1(X(y))}" y1="${M.t}" y2="${H - M.b}" stroke="${COLOR.line}" stroke-dasharray="2 4"/>`
        + `<text class="tj-eje" x="${n1(X(y))}" y="${H - 12}" text-anchor="middle">${y}</text>`;
    }
    if (comp && lo < 0 && hi > 0) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${n1(Y(0))}" y2="${n1(Y(0))}" stroke="${COLOR.muted}"/>`;
    g += `<text class="tj-eje" x="${M.l}" y="12" text-anchor="start">${esc(medidas.etiquetaEje || "")}</text>`;

    // año que se va dibujando (paso 1)
    if (st.dibujo > 0 && st.dibujo < 1) {
      const tt = t0 + (t1 - t0) * st.dibujo;
      g += `<text x="${W - M.r - 6}" y="${M.t + 44}" text-anchor="end" font-size="46" font-weight="700" fill="${COLOR.ghost}">${Math.floor(tt)}</text>`;
    }

    for (const v of vistas) {
      if (v.mens.length < 2) continue;
      const ta = v.mens[0].t, tb = v.mens[v.mens.length - 1].t;
      // fantasmas (paso 4): amarillas si apuntan al lado contrario de la tendencia
      if (st.fantasmas > 0) {
        v.fantasmas.forEach((b, i) => {
          const op = clamp(st.fantasmas * 1.4 - (i / v.fantasmas.length) * 0.4);
          const opuesta = Math.sign(b) !== Math.sign(v.b);
          g += `<line x1="${n1(X(ta))}" y1="${n1(Y(v.nivel(ta, b)))}" x2="${n1(X(tb))}" y2="${n1(Y(v.nivel(tb, b)))}" stroke="${opuesta ? COLOR.mark : COLOR.ghost}" stroke-width="${opuesta ? 1.6 : 1.2}" opacity="${n1(op)}"/>`;
        });
      }
      // serie mensual (paso 1), que se desvanece en el paso 2
      const corte = t0 + (t1 - t0) * st.dibujo, pts = v.mens.filter((p) => p.t <= corte);
      if (pts.length > 1) {
        g += `<polyline fill="none" stroke="${v.color}" stroke-width="1.1" stroke-linejoin="round" clip-path="url(#${id})" opacity="${n1(1 - 0.9 * st.desvanecer)}" points="${pts.map((p) => `${n1(X(p.t))},${n1(Y(p.v))}`).join(" ")}"/>`;
      }
      // promedios anuales (paso 2); los años incompletos van huecos
      if (st.puntos > 0) {
        v.anual.slice(0, Math.round(st.puntos * v.anual.length)).forEach((a) => {
          g += `<circle cx="${n1(X(a.t))}" cy="${n1(Y(a.v))}" r="${a.completo ? 4.2 : 3.4}" fill="${a.completo ? v.color : COLOR.surface}" stroke="${v.color}" stroke-width="1.5"/>`;
        });
      }
      // tendencia (paso 3)
      if (st.linea > 0) {
        const tf = ta + (tb - ta) * st.linea;
        g += `<line x1="${n1(X(ta))}" y1="${n1(Y(v.nivel(ta)))}" x2="${n1(X(tf))}" y2="${n1(Y(v.nivel(tf)))}" stroke="${v.colorLinea}" stroke-width="3.2" stroke-linecap="round"/>`;
        if (!comp) {
          g += `<circle cx="${n1(X(ta))}" cy="${n1(Y(v.nivel(ta)))}" r="5" fill="${v.colorLinea}"/>` + etiquetaSVG(X(ta) + 8, Y(v.nivel(ta)), valor(v.nivel(ta)), "start", st.linea);
          if (st.linea >= 1) g += `<circle cx="${n1(X(tb))}" cy="${n1(Y(v.nivel(tb)))}" r="5" fill="${v.colorLinea}"/>` + etiquetaSVG(X(tb) - 8, Y(v.nivel(tb)), valor(v.nivel(tb)), "end", 1);
        } else if (st.linea >= 1 && v.etiqueta) {
          g += etiquetaSVG(X(tb) - 8, Y(v.nivel(tb)) + (v.b > 0 ? -14 : 18), v.etiqueta, "end", 1, v.colorLinea);
        }
      }
    }
    return `${abre}${g}</svg>`;
  }

  /* ---------- textos de los pasos ---------- */

  function fraseAzar(p) {
    if (p < 0.001) return "un patrón así saldría por casualidad menos de 1 vez en 1,000";
    if (p < 0.01) return `un patrón así saldría por casualidad unas ${Math.max(1, Math.round(p * 1000))} veces en 1,000`;
    return `un patrón así saldría por casualidad unas ${Math.round(p * 100)} veces de cada 100`;
  }

  function fraseVeredicto(lugar, variable, r, v) {
    const en = lugar ? `En ${lugar}, ` : "";
    const dir = r.b > 0 ? "aumenta" : "disminuye";
    const p = Math.max(r.pT, r.pMK);
    if (v.clave === "muy" || v.clave === "si") return `${en}${variable} ${dir} y el cambio es real: ${fraseAzar(p)}.`;
    if (v.clave === "indicio") return `${lugar ? `En ${lugar} hay` : "Hay"} una pista de que ${variable} ${dir}, pero todavía no es concluyente.`;
    const anios = Math.round(r.aniosNecesarios);
    const cuanto = finito(anios) && anios > 0 && anios < 1000 ? `; harían falta unos ${anios} años de datos para detectarla si sigue así` : "";
    return `${lugar ? `En ${lugar} no` : "No"} hay una tendencia clara en ${variable}${cuanto}.`;
  }

  /**
   * Textos por defecto de los 5 pasos (se pueden reemplazar con opciones.textos).
   * Todos los números salen del análisis, convertidos con la capa.
   * @param {object} datos
   * @param {object[]} datos.vistas de prepararVista
   * @param {object[]} datos.analisis de Stats.analizar
   * @param {object[]} datos.veredictos de Stats.veredicto ({ clave })
   * @param {object} datos.cfg configuración de la capa
   * @param {string[]} [datos.lugares]
   * @returns {string[]} 5 textos (texto plano; quien los muestra los escapa)
   */
  function textosPasos({ vistas, analisis, veredictos, cfg, lugares = [] }) {
    const variable = cfg.variable.toLowerCase();
    const r1 = analisis[0] || {}, l1 = lugares[0] || "";
    if (!vistas.length || !vistas[0].mens.length) return PASOS.map(() => "No hay datos suficientes para esta serie.");
    const periodo = (r) => (r.inicio && r.fin ? ` (${r.inicio.y}–${r.fin.y})` : "");
    const unidad = cfg.unidadLarga ? ` ${cfg.unidadLarga}` : "";
    if (vistas.length === 1) {
      const v = vistas[0], ta = v.mens[0].t, tb = v.mens[v.mens.length - 1].t;
      const porDecada = cfg.convertir(r1.porDecada) - cfg.convertir(0);
      const todas = r1.ic && (r1.ic[0] > 0 || r1.ic[1] < 0);
      return [
        `Estos son ${r1.n} meses de ${variable}${l1 ? ` en ${l1}` : ""}${periodo(r1)}. La línea sube y baja cada año: eso son las estaciones, no la tendencia.`,
        "Quitamos las estaciones: cada punto es el promedio de un año. Así comparamos años completos y vemos si los recientes son distintos a los primeros.",
        `La línea de tendencia resume todos los puntos: empieza en ${F.numero(v.nivel(ta), cfg.decimales)}${unidad} y termina en ${F.numero(v.nivel(tb), cfg.decimales)}${unidad}. Eso es ${cfg.cambioComo === "puntos" ? F.puntos(porDecada, cfg.decimales + 1) : F.cambio(porDecada, cfg.decimales + 1) + unidad} por década.`,
        todas ? `Cada línea gris es una tendencia posible según los datos. Todas apuntan ${r1.b > 0 ? "hacia arriba" : "hacia abajo"}: la dirección del cambio es clara.`
          : "Cada línea gris es una tendencia posible según los datos. Unas suben y otras bajan: con estos años aún no podemos asegurar hacia dónde va.",
        fraseVeredicto(l1, variable, r1, veredictos[0] || { clave: "no" }),
      ];
    }
    const dir = (k) => {
      const r = analisis[k], v = vistas[k], ta = v.mens[0].t;
      const porDecada = v.nivel(ta + 10) - v.nivel(ta); // ya en % respecto a su promedio
      return `${lugares[k] || `el lugar ${k + 1}`} ${r.b > 0 ? "sube" : "baja"} ${F.cambio(porDecada, 1)}${v.porcentaje ? " %" : ""} por década`;
    };
    return [
      `Comparamos ${variable} en dos lugares. Para ponerlos en la misma escala, cada valor se muestra como % por encima o por debajo de su propio promedio.`,
      "Quitamos las estaciones: cada punto es el promedio de un año en cada lugar.",
      `Trazamos una tendencia para cada lugar: ${dir(0)}; ${dir(1)}.`,
      "Las líneas grises muestran las tendencias posibles de cada lugar. Si los dos abanicos no se cruzan con el cero, las direcciones son reales.",
      vistas.map((_, k) => fraseVeredicto(lugares[k] || "", variable, analisis[k], veredictos[k] || { clave: "no" })).join(" "),
    ];
  }

  /* ---------- capa delgada de DOM y controlador ---------- */

  // Contador para ids de recorte únicos (no es global: vive dentro de este módulo).
  let siguienteId = 1;

  /**
   * El motor de stats.js. `const Stats` de un script clásico es global pero no cuelga de window,
   * así que se busca por nombre; en Node (módulo) no existe y `typeof` evita el error.
   */
  function statsGlobal() {
    if (raiz.Stats) return raiz.Stats;
    // eslint-disable-next-line no-undef
    return typeof Stats !== "undefined" ? Stats : undefined;
  }

  /** Preferencia del sistema "reducir movimiento"; si no se puede leer, false. */
  function prefiereMenosMovimiento() {
    try { return !!(raiz.matchMedia && raiz.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
  }

  /** Crea el evento `tarjeta:paso`; si no hay CustomEvent (navegadores muy viejos), un objeto equivalente. */
  function eventoPaso(paso) {
    const C = raiz.CustomEvent;
    if (typeof C === "function") return new C("tarjeta:paso", { detail: { paso }, bubbles: true });
    return { type: "tarjeta:paso", detail: { paso } };
  }

  const TEXTO_BOTON = { inicio: "▶ Ver cómo lo descubrió", pausa: "⏸ Pausa", continuar: "▶ Continuar", repetir: "⟲ Repetir" };

  function plantilla() {
    const pasos = PASOS.map((p, i) => `<button type="button" class="tj-anim-paso" data-tj-accion="paso" data-tj-paso="${i}"><b aria-hidden="true">${i + 1}</b>${esc(p.t)}</button>`).join("");
    return `<div class="tj-anim">`
      + `<div class="tj-anim-lienzo" data-tj="lienzo"></div>`
      + `<div class="tj-anim-pasos" role="group" aria-label="Pasos de la prueba">${pasos}</div>`
      + `<div class="tj-anim-narra"><div class="tj-anim-textos" aria-live="polite"><p class="tj-anim-titulo" data-tj="titulo"></p><p class="tj-anim-texto" data-tj="texto"></p></div>`
      + `<button type="button" class="tj-anim-play" data-tj-accion="play" data-tj="play">${TEXTO_BOTON.inicio}</button></div>`
      + `</div>`;
  }

  /**
   * Animación de 5 pasos dentro de `contenedor`. Cada llamada crea una instancia independiente,
   * con su propio estado: puede haber varias en la misma página.
   *
   * Al crearse muestra la gráfica completa (último paso). `reproducir()` la anima desde el inicio.
   * Al terminar cada paso, el contenedor emite `tarjeta:paso` con `{ paso }` en `detail`.
   *
   * @param {Element} contenedor elemento donde se dibuja (se reemplaza su contenido)
   * @param {{valores:number[], inicio:string}|Array<{valores:number[], inicio:string}>} serie una serie, o hasta 2 para comparar
   * @param {object} [opciones]
   * @param {string} [opciones.capa] "temp" | "lluvia" | "suelo" | "verdor" | otra (configuración genérica)
   * @param {string} [opciones.unidad] unidad original (se usa si la capa no está registrada)
   * @param {string|string[]} [opciones.lugar] nombre del lugar, o uno por serie
   * @param {string[]} [opciones.textos] texto de cada paso (reemplaza los de por defecto; los vacíos se ignoran)
   * @param {object|object[]} [opciones.analisis] resultado de Stats.analizar de cada serie, si ya se tiene
   * @param {object} [opciones.stats] motor estadístico (por defecto el `Stats` global de stats.js)
   * @param {function} [opciones.programar] por defecto requestAnimationFrame
   * @param {function} [opciones.cancelar] por defecto cancelAnimationFrame
   * @param {function} [opciones.ahora] por defecto performance.now
   * @param {boolean} [opciones.reducirMovimiento] por defecto lee prefers-reduced-motion
   * @param {string} [opciones.id] prefijo para ids internos (por defecto uno único)
   * @returns {{reproducir:function():void, pausar:function():void, irAPaso:function(number):void,
   *            estado:function():{paso:number, corriendo:boolean, terminado:boolean}, destruir:function():void}}
   * @example
   * const anim = Tarjeta.animacion(document.querySelector("#prueba"), { valores, inicio: "2000-01" },
   *   { capa: "temp", lugar: "Morelos" });
   * anim.reproducir();
   * // al cambiar de lugar:
   * anim.destruir();
   */
  function animacion(contenedor, serie, opciones = {}) {
    if (!contenedor || typeof contenedor.querySelector !== "function") throw new Error("Tarjeta.animacion: falta un contenedor (un elemento del DOM)");
    const op = opciones || {};
    const lista = (Array.isArray(serie) ? serie : [serie]).filter((s) => s && Array.isArray(s.valores)).slice(0, MAX_SERIES);
    if (!lista.length) throw new Error("Tarjeta.animacion: falta la serie ({ valores, inicio })");
    const stats = op.stats || statsGlobal();
    if (!stats || typeof stats.veredicto !== "function") throw new Error("Tarjeta.animacion: necesita stats.js (cárgalo antes) u opciones.stats");
    const dados = Array.isArray(op.analisis) ? op.analisis : op.analisis ? [op.analisis] : [];
    const analisis = lista.map((s, k) => dados[k] || stats.analizar(s.valores, s.inicio));
    const veredictos = analisis.map((r) => (r && r.pts && r.pts.length ? stats.veredicto(r) : { clave: "no" }));

    const programar = op.programar || ((f) => raiz.requestAnimationFrame(f));
    const cancelar = op.cancelar || ((h) => raiz.cancelAnimationFrame(h));
    const ahora = op.ahora || (() => raiz.performance.now());
    const reducir = typeof op.reducirMovimiento === "boolean" ? op.reducirMovimiento : prefiereMenosMovimiento();

    const cfg = Tarjeta.capa(op.capa, op.unidad);
    const lugares = (Array.isArray(op.lugar) ? op.lugar : [op.lugar]).map((l) => (typeof l === "string" ? l : ""));
    const vistas = prepararVista(lista, analisis, cfg, lugares);
    const comp = vistas.length > 1;
    const dominios = { mens: dominio(vistas, "mens"), anual: dominio(vistas, "anual") };
    const prefijo = typeof op.id === "string" && op.id ? op.id : `tj-anim-${siguienteId++}`;
    const variable = cfg.variable.toLowerCase();
    const medidas = {
      idClip: `${prefijo}-area`,
      etiquetaEje: comp ? "% respecto a su promedio" : cfg.unidadLarga,
      unidadCorta: comp ? "" : cfg.unidadCorta,
      decimales: cfg.decimales,
      descripcion: comp ? `Gráfica de ${variable}: ${lugares.filter(Boolean).join(" y ") || "dos lugares"}`
        : `Gráfica de ${variable}${lugares[0] ? ` en ${lugares[0]}` : ""} y su tendencia`,
    };
    const textos = textosPasos({ vistas, analisis, veredictos, cfg, lugares });
    if (Array.isArray(op.textos)) op.textos.slice(0, PASOS.length).forEach((t, i) => { if (typeof t === "string" && t.trim()) textos[i] = t; });

    const total = duracionTotal();
    let tAcum = total, t0 = 0, corriendo = false, cuadro = null, pasoActual = -1, ultimoEmitido = -1, destruido = false;

    contenedor.innerHTML = plantilla();
    const el = {
      lienzo: contenedor.querySelector('[data-tj="lienzo"]'),
      titulo: contenedor.querySelector('[data-tj="titulo"]'),
      texto: contenedor.querySelector('[data-tj="texto"]'),
      play: contenedor.querySelector('[data-tj="play"]'),
      pasos: Array.from(contenedor.querySelectorAll("[data-tj-paso]")),
    };

    const boton = (t) => { el.play.textContent = t; };
    boton(TEXTO_BOTON.inicio);

    /** Paso más alto que ya terminó de dibujarse en el instante `ms` (−1 si ninguno). */
    function pasoCompleto(ms) {
      let k = -1;
      for (let i = 0; i < PASOS.length; i++) if (ms >= inicioDePaso(i) + PASOS[i].dur) k = i;
      return k;
    }

    function mostrarPaso(i) {
      el.titulo.textContent = `Paso ${i + 1} de ${PASOS.length} · ${PASOS[i].t}`;
      el.texto.textContent = textos[i] || "";
      el.pasos.forEach((b, k) => {
        const hecho = k < i || (k === i && i === PASOS.length - 1);
        b.setAttribute("data-estado", hecho ? "hecho" : k === i ? "activo" : "");
        if (k === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
    }

    function pintar(ms, emitir = true) {
      const st = estadoEn(ms);
      el.lienzo.innerHTML = construirSVG(st, vistas, dominios, medidas);
      if (st.i !== pasoActual) { pasoActual = st.i; mostrarPaso(st.i); }
      const completo = pasoCompleto(ms);
      if (!emitir || completo < ultimoEmitido) { ultimoEmitido = completo; return; }
      while (ultimoEmitido < completo) {
        ultimoEmitido++;
        if (typeof contenedor.dispatchEvent === "function") contenedor.dispatchEvent(eventoPaso(ultimoEmitido));
      }
    }

    function tick() {
      cuadro = null;
      if (destruido || !corriendo) return;
      const ms = tAcum + (ahora() - t0);
      if (ms >= total) {
        corriendo = false; tAcum = total; pintar(total); boton(TEXTO_BOTON.repetir);
        return;
      }
      pintar(ms);
      cuadro = programar(tick);
    }

    function reproducir() {
      if (destruido || corriendo) return;
      if (tAcum >= total) { tAcum = 0; ultimoEmitido = -1; }
      if (reducir) { tAcum = total; pintar(total); boton(TEXTO_BOTON.repetir); return; }
      corriendo = true; t0 = ahora(); boton(TEXTO_BOTON.pausa);
      pintar(tAcum);
      cuadro = programar(tick);
    }

    function pausar() {
      if (destruido || !corriendo) return;
      if (cuadro !== null) { cancelar(cuadro); cuadro = null; }
      tAcum = Math.min(total, tAcum + (ahora() - t0));
      corriendo = false; boton(TEXTO_BOTON.continuar);
    }

    function irAPaso(i) {
      if (destruido) return;
      const n = Math.max(0, Math.min(PASOS.length - 1, Math.round(Number(i)) || 0));
      pausar();
      tAcum = n === PASOS.length - 1 ? total : inicioDePaso(n) + PASOS[n].dur;
      pintar(tAcum);
      boton(n === PASOS.length - 1 ? TEXTO_BOTON.repetir : TEXTO_BOTON.continuar);
    }

    function estado() {
      const ms = corriendo ? Math.min(total, tAcum + (ahora() - t0)) : tAcum;
      return { paso: estadoEn(ms).i, corriendo, terminado: ms >= total };
    }

    function alHacerClic(e) {
      const b = e && e.target && typeof e.target.closest === "function" ? e.target.closest("[data-tj-accion]") : null;
      if (!b || (typeof contenedor.contains === "function" && !contenedor.contains(b))) return;
      const accion = b.getAttribute("data-tj-accion");
      if (accion === "play") { if (corriendo) pausar(); else reproducir(); }
      else if (accion === "paso") irAPaso(Number(b.getAttribute("data-tj-paso")));
    }

    function destruir() {
      if (destruido) return;
      if (cuadro !== null) { cancelar(cuadro); cuadro = null; }
      corriendo = false; destruido = true;
      if (typeof contenedor.removeEventListener === "function") contenedor.removeEventListener("click", alHacerClic);
      contenedor.innerHTML = "";
    }

    if (typeof contenedor.addEventListener === "function") contenedor.addEventListener("click", alHacerClic);
    pintar(total, false); // vista inicial: la gráfica completa, sin emitir eventos

    return { reproducir, pausar, irAPaso, estado, destruir };
  }

  animacion.puro = Object.freeze({
    PASOS, PAUSA, MAX_SERIES, prepararVista, dominio, ticks, estadoEn, duracionTotal, inicioDePaso, construirSVG, textosPasos,
  });
  Tarjeta.animacion = animacion;

  if (typeof module !== "undefined") module.exports = Tarjeta;
})(typeof window !== "undefined" ? window : globalThis);
