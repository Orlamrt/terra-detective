// Tarea 2 · Globo y mapa de Terra Detective.
// Lee data/capas/<capa>.json, pinta por celda (pendiente_decada → color, significancia → puntos),
// al tocar una celda descarga su tesela de data/series/ y emite `terra:lugar`.
// Expone window.Terra según docs/CONTRATO_DATOS.md (sección 4).
// Depende de: d3 v7, topojson v3 y src/stats.js (Stats).
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RAD = Math.PI / 180;
  const emitir = (tipo, detalle) => window.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));

  /* ---------- presentación por tipo de capa (colores y textos de la leyenda) ---------- */
  const ESTILO = {
    temp:   { nombre: "Temperatura", ico: "🌡️", L: "Se enfría", R: "Se calienta", pal: ["#2D5DA8", "#8DB2DF", "#F2EDE6", "#F0A07F", "#C2341F"] },
    lluvia: { nombre: "Lluvia", ico: "🌧️", L: "Más seco", R: "Más lluvioso", pal: ["#8C5A1E", "#D3B07A", "#F1EEE6", "#7FB6DE", "#1F5FAE"] },
    suelo:  { nombre: "Humedad del suelo", ico: "🌱", L: "Se seca", R: "Se humedece", pal: ["#7A4A14", "#CFA56C", "#F1EEE6", "#79C1B0", "#16776A"] },
    verdor: { nombre: "Verdor", ico: "🌿", L: "Menos verde", R: "Más verde", pal: ["#7A4A14", "#CFA56C", "#F1EEE6", "#8CC77A", "#2E7D32"] },
  };
  const IDS_CONOCIDOS = ["temp", "lluvia", "suelo", "verdor", "demo_temp"];
  const tipoDe = id => Object.keys(ESTILO).find(k => id === k || id.endsWith("_" + k)) || "temp";
  const NIVELES = 33;
  // Conversión para mostrar (docs/CONTRATO_DATOS.md, "Unidades por capa"): los datos vienen en la unidad de origen.
  const CONVERSION = { "mm/día": [365.25, "mm/año"], "mm/mes": [12, "mm/año"], "m³/m³": [100, "% de agua"] };
  const mostrar = unidad => { const c = CONVERSION[unidad]; return c ? { f: c[0], u: c[1] } : { f: 1, u: unidad || "" }; }; // colores discretos: permite agrupar celdas por color y pintar rápido

  /* ---------- casos con series reales de muestra (NASA Giovanni) ---------- */
  const LUGARES = {
    morelos: { nombre: "Morelos, México", lon: -99.07, lat: 18.74, bbox: [-99.5, 18.33, -98.63, 19.14], series: { temp: "mor_temp", lluvia: "mor_lluvia", suelo: "mor_suelo" } },
    sahel:   { nombre: "Sahel, África", lon: 2.5, lat: 14.5, bbox: [-15, 12, 20, 17], series: { suelo: "sahel_suelo", lluvia: "sahel_lluvia" } },
    nmx:     { nombre: "Norte de México", lon: -108, lat: 28.5, bbox: [-112, 26, -104, 31], series: { suelo: "nmx_suelo" } },
  };

  /* ---------- estado ---------- */
  let BASE = "data/";            // en GitHub Pages: data/ ; con `http.server -d web`: ../data/
  const CAPAS = {};              // id → { meta (json), tex, ... }
  let ORDEN = [];                // ids disponibles, en orden
  let capa = null;               // id de la capa activa
  let MUESTRAS = {};             // id → serie de muestra
  let land = null, grat = null, landMask = null;
  const teselas = new Map();     // "capa/ti_tj" → Promise<json|null>

  /* ---------- carga de datos ---------- */
  async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status + " " + url); return r.json(); }
  async function encontrarBase() {
    for (const b of ["data/", "../data/"]) { try { const r = await fetch(b + "muestras/series_reales.json"); if (r.ok) { BASE = b; return r.json(); } } catch (e) { /* sigue */ } }
    return [];
  }
  async function cargarCapas() {
    let ids = IDS_CONOCIDOS;
    try { const idx = await json(BASE + "capas/index.json"); if (Array.isArray(idx) && idx.length) ids = idx; } catch (e) { /* opcional */ }
    const docs = await Promise.all(ids.map(id => json(BASE + `capas/${id}.json`).catch(() => null)));
    docs.forEach((d, n) => { if (d && d.rejilla && Array.isArray(d.pendiente_decada)) registrarCapa(d.capa || ids[n], d); });
    // Las capas reales primero; la demo solo si no hay otra de su tipo
    ORDEN = Object.keys(CAPAS).sort((a, b) => CAPAS[a].meta.ilustrativo - CAPAS[b].meta.ilustrativo);
    if (!ORDEN.length) for (const t of ["temp", "lluvia", "suelo", "verdor"]) registrarCapa(t, capaRespaldo(t));
    if (!ORDEN.length) ORDEN = Object.keys(CAPAS);
  }
  function registrarCapa(id, meta) {
    const tipo = tipoDe(id);
    const vals = meta.pendiente_decada.filter(v => v != null && isFinite(v)).map(Math.abs).sort((a, b) => a - b);
    const lim = meta.respaldo ? 1 : (vals.length ? vals[Math.floor(vals.length * .95)] || vals.at(-1) : 1) || 1;
    CAPAS[id] = { id, tipo, meta, lim, estilo: ESTILO[tipo] };
  }
  // Sin capas en data/capas/: patrón ILUSTRATIVO del prototipo (no son datos) para que la página no quede vacía.
  function capaRespaldo(t) {
    const nlat = 90, nlon = 180, res = 2, P = [], S = [];
    for (let i = 0; i < nlat; i++) for (let j = 0; j < nlon; j++) {
      const lat = -90 + (i + .5) * res, lon = -180 + (j + .5) * res, r = RAD; let v;
      if (t === "temp") v = .25 + .55 * Math.max(0, (lat - 25) / 65) + .18 * Math.sin(lon * r * 2.3) * Math.cos(lat * r * 3) - .25 * Math.max(0, (-lat - 50) / 40);
      else if (t === "lluvia") v = .75 * Math.sin(lat * r * 4.2 + lon * r * 1.1) * Math.cos(lon * r * 1.6 + .5);
      else if (t === "suelo") v = .7 * Math.sin(lon * r * 2.1 + lat * r * 2.8 + 1) * Math.cos(lat * r * 2.2);
      else v = .35 + .45 * Math.sin(lon * r * 1.9 + 1.2) * Math.cos(lat * r * 3.1);
      v = Math.max(-1, Math.min(1, v));
      const tierra = t === "suelo" || t === "verdor";
      if (tierra && !esTierra(lon, lat)) { P.push(null); S.push(null); continue; }
      P.push(+v.toFixed(3)); S.push(Math.abs(v) > .6 ? 2 : Math.abs(v) > .45 ? 1 : 0);
    }
    return { version: 1, capa: t, titulo: ESTILO[t].nombre, unidad: "", fuente: "Patrón ilustrativo (sin datos)", ilustrativo: true, respaldo: true,
      inicio: "2000-01", meses: 0, rejilla: { res, lat0: -90, lon0: -180, nlat, nlon }, pendiente_decada: P, significancia: S, p: P.map(() => null), media: P.map(() => null) };
  }
  function esTierra(lon, lat) {
    if (!landMask) { // máscara equirectangular 360×180 dibujada una vez
      const c = document.createElement("canvas"); c.width = 360; c.height = 180;
      const g = c.getContext("2d"), p = d3.geoEquirectangular().scale(180 / Math.PI).translate([180, 90]);
      g.beginPath(); d3.geoPath(p, g)(land); g.fill();
      landMask = g.getImageData(0, 0, 360, 180).data;
    }
    const x = Math.min(359, Math.floor(lon + 180)), y = Math.min(179, Math.floor(90 - lat));
    return landMask[(y * 360 + x) * 4 + 3] > 100;
  }

  /* ---------- rejilla ---------- */
  function celdaDe(C, lon, lat) {
    const g = C.meta.rejilla;
    const i = Math.floor((lat - g.lat0) / g.res), j = Math.floor((((lon - g.lon0) % 360) + 360) % 360 / g.res);
    if (i < 0 || i >= g.nlat || j < 0 || j >= g.nlon) return null;
    const k = i * g.nlon + j;
    return { i, j, k, lat: g.lat0 + (i + .5) * g.res, lon: g.lon0 + (j + .5) * g.res,
      bbox: [g.lon0 + j * g.res, g.lat0 + i * g.res, g.lon0 + (j + 1) * g.res, g.lat0 + (i + 1) * g.res] };
  }
  const claveTesela = c => `${Math.floor((c.lat + 90) / 10)}_${Math.floor((c.lon + 180) / 10)}`;
  function serieDeCelda(id, c) {
    const C = CAPAS[id]; if (!C || C.meta.respaldo || C.meta.pendiente_decada[c.k] == null) return Promise.resolve(null);
    const url = `${BASE}series/${id}/${claveTesela(c)}.json`;
    if (!teselas.has(url)) teselas.set(url, json(url).catch(() => null));
    return teselas.get(url).then(t => t && t.celdas && t.celdas[`${c.i}_${c.j}`] ? { valores: t.celdas[`${c.i}_${c.j}`], inicio: t.inicio || C.meta.inicio } : null);
  }
  function lugarCercano(lon, lat) {
    for (const [k, L] of Object.entries(LUGARES)) { const b = L.bbox; if (lon >= b[0] - 1.5 && lon <= b[2] + 1.5 && lat >= b[1] - 1.5 && lat <= b[3] + 1.5) return k; }
    return null;
  }

  /* ---------- texturas (se pintan una vez por capa y se reutilizan en cada cuadro) ---------- */
  let COL = {}, OCEANO = [200, 217, 227];
  function rgb(color) { const c = document.createElement("canvas").getContext("2d"); c.fillStyle = color; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)]; }
  function colores() {
    COL = { ocean: css("--ocean"), line: css("--land-line"), grat: css("--grat"), ink: css("--ink"), surface: css("--surface"), accent: css("--accent"), mark: css("--mark") };
    OCEANO = rgb(COL.ocean);
    for (const C of Object.values(CAPAS)) C.tex = null;
  }
  const K = 4; // texeles por celda en la textura del globo (para hornear los puntos)
  function textura(C) {
    if (C.tex) return C.tex;
    const g = C.meta.rejilla, nlat = g.nlat, nlon = g.nlon;
    const escala = d3.scaleLinear().domain([-1, -.5, 0, .5, 1]).range(C.estilo.pal).clamp(true);
    const alfa = .88, tinta = rgb(COL.ink);
    const paleta = Array.from({ length: NIVELES }, (_, n) => { const c = rgb(escala(-1 + 2 * n / (NIVELES - 1))); return c.map((x, q) => Math.round(x * alfa + OCEANO[q] * (1 - alfa))); });
    const nivel = new Int16Array(nlat * nlon).fill(-1);
    // 1) textura plana: un píxel por celda, fila 0 = norte (para el mapa)
    const plano = document.createElement("canvas"); plano.width = nlon; plano.height = nlat;
    const pg = plano.getContext("2d"), pd = pg.createImageData(nlon, nlat);
    // 2) textura del globo: K×K texeles por celda con los puntos de significancia horneados
    const GW = nlon * K, GH = nlat * K, globo = new Uint8ClampedArray(GW * GH * 4);
    const sig = [[], [], []];
    for (let i = 0; i < nlat; i++) for (let j = 0; j < nlon; j++) {
      const k = i * nlon + j, v = C.meta.pendiente_decada[k];
      let c = OCEANO;
      if (v != null && isFinite(v)) { const n = Math.round((Math.max(-1, Math.min(1, v / C.lim)) + 1) / 2 * (NIVELES - 1)); nivel[k] = n; c = paleta[n]; }
      const fila = nlat - 1 - i, o = (fila * nlon + j) * 4;
      pd.data[o] = c[0]; pd.data[o + 1] = c[1]; pd.data[o + 2] = c[2]; pd.data[o + 3] = 255;
      const s = nivel[k] >= 0 ? C.meta.significancia[k] : null;
      if (s === 1 || s === 2) sig[s].push(k);
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
        const punto = (s === 2 || s === 1) && a === 1 && b === 1, w = s === 2 ? .6 : .32;
        const cc = punto ? c.map((x, q) => Math.round(x * (1 - w) + tinta[q] * w)) : c;
        const g2 = ((fila * K + a) * GW + j * K + b) * 4;
        globo[g2] = cc[0]; globo[g2 + 1] = cc[1]; globo[g2 + 2] = cc[2]; globo[g2 + 3] = 255;
      }
    }
    pg.putImageData(pd, 0, 0);
    C.tex = { plano, globo: new Uint32Array(globo.buffer), GW, GH, nivel, paleta: paleta.map(c => `rgb(${c})`), sig };
    return C.tex;
  }

  /* ---------- proyección globo ↔ mapa ---------- */
  const cv = $("cv"), ctx = cv.getContext("2d");
  const off = document.createElement("canvas"), offCtx = off.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  const mezcla = d3.geoProjectionMutator(t => (x, y) => { const a = d3.geoOrthographicRaw(x, y), b = d3.geoEquirectangularRaw(x, y); return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t]; });
  let tPlano = 0, rot = [60, -15], seleccion = null, girando = !reduce, volando = false;
  const proj = mezcla(0).precision(.5);
  const path = d3.geoPath(proj, ctx);
  const sGlobo = () => Math.min(W, H) / 2.15, sMapa = () => W / (70 * RAD);
  function configurar() {
    const t = tPlano, s = sGlobo() * (1 - t) + sMapa() * t, latc = seleccion ? seleccion.lat : 0;
    mezcla(t); proj.scale(s).rotate([rot[0], rot[1] * (1 - t), 0]).translate([W / 2, H / 2 + t * s * latc * RAD]).clipAngle(t < .999 ? 90 + t * 89 : null);
  }
  function tamanio() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); pedir(true); }

  // Globo (t = 0): proyección ortográfica inversa píxel por píxel sobre la textura horneada.
  let imgBuf = null;
  function rasterGlobo(T, paso) {
    const s = proj.scale(), [tx, ty] = proj.translate(), r = proj.rotate();
    const lam = r[0] * RAD, phi = r[1] * RAD, cP = Math.cos(phi), sP = Math.sin(phi);
    const x0 = Math.max(0, Math.floor((tx - s) / paso)), x1 = Math.min(Math.ceil(W / paso), Math.ceil((tx + s) / paso));
    const y0 = Math.max(0, Math.floor((ty - s) / paso)), y1 = Math.min(Math.ceil(H / paso), Math.ceil((ty + s) / paso));
    const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
    if (!imgBuf || imgBuf.width !== w || imgBuf.height !== h) { imgBuf = offCtx.createImageData(w, h); off.width = w; off.height = h; }
    const out = new Uint32Array(imgBuf.data.buffer), tex = T.globo, GW = T.GW, GH = T.GH, inv = 1 / s;
    const kx = GW / (2 * Math.PI), ky = GH / Math.PI;
    for (let py = 0; py < h; py++) {
      const y = (ty - (y0 + py + .5) * paso) * inv, y2 = y * y; let o = py * w;
      for (let px = 0; px < w; px++, o++) {
        const x = ((x0 + px + .5) * paso - tx) * inv, rr = x * x + y2;
        if (rr > 1) { out[o] = 0; continue; }
        const X = Math.sqrt(1 - rr);                       // punto en la esfera, marco de la vista
        const lon = Math.atan2(x, X * cP + y * sP) - lam;  // deshacer la rotación de d3
        const lat = Math.asin(Math.max(-1, Math.min(1, y * cP - X * sP)));
        let u = Math.floor((lon + Math.PI) * kx) % GW; if (u < 0) u += GW;
        let v = Math.floor((Math.PI / 2 - lat) * ky); if (v >= GH) v = GH - 1;
        out[o] = tex[v * GW + u];
      }
    }
    offCtx.putImageData(imgBuf, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, x0 * paso, y0 * paso, w * paso, h * paso);
  }
  // Mapa (t = 1): equirectangular = la textura plana escalada; se repite para cubrir el antimeridiano.
  function rasterMapa(C, T) {
    const g = C.meta.rejilla, s = proj.scale(), [tx, ty] = proj.translate();
    const x = tx + s * (g.lon0 + rot[0]) * RAD, ancho = s * 2 * Math.PI, yTop = ty - s * (g.lat0 + g.nlat * g.res) * RAD, alto = s * g.nlat * g.res * RAD;
    ctx.imageSmoothingEnabled = false;
    for (let n = -2; n <= 2; n++) { const xx = x + n * ancho; if (xx > W || xx + ancho < 0) continue; ctx.drawImage(T.plano, xx, yTop, ancho, alto); }
    // puntos de significancia como vectores (pocos: solo lo que se ve)
    const r = Math.max(1.2, Math.min(3.5, s * g.res * RAD * .12));
    ctx.fillStyle = COL.ink; ctx.globalAlpha = .55;
    for (const nv of [1, 2]) {
      ctx.beginPath(); const rr = nv === 2 ? r : r * .6;
      for (const k of T.sig[nv]) {
        const i = Math.floor(k / g.nlon), j = k % g.nlon;
        let lon = g.lon0 + (j + .5) * g.res + rot[0]; lon = ((lon + 180) % 360 + 360) % 360 - 180;
        const px = tx + s * lon * RAD, py = ty - s * (g.lat0 + (i + .5) * g.res) * RAD;
        if (px < -5 || px > W + 5 || py < -5 || py > H + 5) continue;
        ctx.moveTo(px + rr, py); ctx.arc(px, py, rr, 0, 7);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // Transición (0 < t < 1): cuadriláteros proyectados, agrupados por color (≈33 rellenos por cuadro).
  function vectorTransicion(C, T) {
    const g = C.meta.rejilla, nv = g.nlon + 1, nh = g.nlat + 1, n = nv * nh;
    if (!C.vert) { // vértices de la rejilla en cartesianas (una vez por capa)
      C.vert = { lon: new Float64Array(n), lat: new Float64Array(n) };
      for (let a = 0; a < nh; a++) for (let b = 0; b < nv; b++) { C.vert.lon[a * nv + b] = g.lon0 + b * g.res; C.vert.lat[a * nv + b] = Math.max(-89.999, Math.min(89.999, g.lat0 + a * g.res)); }
    }
    const X = C.px || (C.px = new Float32Array(n)), Y = C.py || (C.py = new Float32Array(n)), ok = C.ok || (C.ok = new Uint8Array(n));
    const r = proj.rotate(), c0 = [-r[0], -r[1]], lim = Math.cos((90 + tPlano * 89) * RAD);
    const cl = Math.cos(c0[1] * RAD), sl = Math.sin(c0[1] * RAD);
    for (let q = 0; q < n; q++) {
      const la = C.vert.lat[q] * RAD, dl = (C.vert.lon[q] - c0[0]) * RAD;
      const cosd = sl * Math.sin(la) + cl * Math.cos(la) * Math.cos(dl);
      if (cosd < lim) { ok[q] = 0; continue; }
      const p = proj([C.vert.lon[q], C.vert.lat[q]]); if (!p) { ok[q] = 0; continue; }
      X[q] = p[0]; Y[q] = p[1]; ok[q] = 1;
    }
    const maxDx = proj.scale() * 1.5, grupos = Array.from({ length: NIVELES }, () => new Path2D());
    const st = g.nlat * g.nlon > 6000 ? 2 : 1; // en la animación basta con cuadros de 2×2 celdas
    for (let i = 0; i < g.nlat; i += st) for (let j = 0; j < g.nlon; j += st) {
      const i2 = Math.min(g.nlat, i + st), j2 = Math.min(g.nlon, j + st);
      let lv = -1; for (let a = i; a < i2 && lv < 0; a++) for (let b = j; b < j2 && lv < 0; b++) lv = T.nivel[a * g.nlon + b];
      if (lv < 0) continue;
      const a = i * nv + j, b = i * nv + j2, c = i2 * nv + j2, d = i2 * nv + j;
      if (!(ok[a] && ok[b] && ok[c] && ok[d])) continue;
      if (Math.abs(X[b] - X[a]) > maxDx || Math.abs(X[c] - X[d]) > maxDx) continue;
      const P = grupos[lv]; P.moveTo(X[a], Y[a]); P.lineTo(X[b], Y[b]); P.lineTo(X[c], Y[c]); P.lineTo(X[d], Y[d]); P.closePath();
    }
    for (let lv = 0; lv < NIVELES; lv++) { ctx.fillStyle = T.paleta[lv]; ctx.fill(grupos[lv]); }
  }

  let ultimoMs = 0, pasoMov = 1, quieto = true;
  function dibujar() {
    if (!W || !land) return;
    const t0 = performance.now();
    configurar();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = COL.ocean; ctx.fill();
    const C = CAPAS[capa];
    if (C) {
      const T = textura(C);
      if (tPlano <= 0) rasterGlobo(T, quieto ? 1 : pasoMov);
      else if (tPlano >= 1) rasterMapa(C, T);
      else vectorTransicion(C, T);
    }
    ctx.beginPath(); path(grat); ctx.strokeStyle = COL.grat; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); path(land); ctx.strokeStyle = COL.line; ctx.lineWidth = .8; ctx.stroke();
    ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = "600 12px Inter, system-ui, sans-serif"; ctx.lineJoin = "round";
    for (const L of Object.values(LUGARES)) { const p = visible(L.lon, L.lat); if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 7); ctx.fillStyle = COL.surface; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = COL.accent; ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.lineWidth = 3; ctx.strokeStyle = COL.surface; ctx.strokeText(L.nombre, p[0] + 10, p[1] + 4); ctx.fillText(L.nombre, p[0] + 10, p[1] + 4); }
    if (seleccion && seleccion.bbox) { const b = seleccion.bbox;
      ctx.beginPath(); path({ type: "Polygon", coordinates: [[[b[0], b[1]], [b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]]]] }); ctx.strokeStyle = COL.mark; ctx.lineWidth = 2.5; ctx.stroke(); }
    ultimoMs = performance.now() - t0;
    if (!quieto && tPlano <= 0) pasoMov = ultimoMs > 22 ? Math.min(3, pasoMov + 1) : ultimoMs < 8 ? Math.max(1, pasoMov - 1) : pasoMov;
  }
  function visible(lon, lat) {
    if (tPlano < .5) { const d = d3.geoDistance([lon, lat], [-proj.rotate()[0], -proj.rotate()[1]]); if (d > Math.PI / 2 - .02) return null; }
    const p = proj([lon, lat]); return p && p[0] > -20 && p[0] < W + 20 && p[1] > -20 && p[1] < H + 20 ? p : null;
  }
  function invertir(x, y) {
    const P = tPlano > .5 ? d3.geoEquirectangular() : d3.geoOrthographic().clipAngle(90);
    return P.scale(proj.scale()).translate(proj.translate()).rotate(proj.rotate()).invert([x, y]);
  }

  // Bucle: dibuja solo cuando hace falta; al quedarse quieto, un último cuadro nítido.
  let sucio = true, tQuieto = 0;
  function pedir(nitido) { sucio = true; if (nitido) tQuieto = 0; }
  function bucle(now) {
    const moviendo = arr || volando || (girando && tPlano === 0);
    if (girando && tPlano === 0 && !arr && !volando) { rot[0] += .12; sucio = true; }
    if (moviendo) { quieto = false; tQuieto = now; }
    else if (!quieto && now - tQuieto > 120) { quieto = true; sucio = true; }
    if (sucio) { sucio = false; dibujar(); }
    requestAnimationFrame(bucle);
  }

  /* ---------- interacción ---------- */
  let arr = null, movido = false;
  cv.addEventListener("pointerdown", e => { if (volando) return; arr = { x: e.clientX, y: e.clientY, r: [...rot] }; movido = false; girando = false; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", e => { if (!arr) return; const dx = e.clientX - arr.x, dy = e.clientY - arr.y; if (Math.hypot(dx, dy) > 6) movido = true;
    const plano = tPlano > .5, k = plano ? 1 / RAD / proj.scale() : .25 * 1.6;
    rot = [arr.r[0] + dx * k, plano ? arr.r[1] : Math.max(-80, Math.min(80, arr.r[1] - dy * k))]; pedir(); });
  cv.addEventListener("pointerup", e => { const fueClic = arr && !movido; arr = null; if (!fueClic) return;
    const r = cv.getBoundingClientRect(), ll = invertir(e.clientX - r.left, e.clientY - r.top); if (!ll || !isFinite(ll[0])) return; elegir(ll[0], ll[1]); });
  cv.addEventListener("pointercancel", () => { arr = null; });
  // Teclado: flechas giran, Enter elige el centro de la vista
  cv.tabIndex = 0;
  cv.addEventListener("keydown", e => {
    const d = { ArrowLeft: [5, 0], ArrowRight: [-5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key];
    if (d) { e.preventDefault(); girando = false; rot = [rot[0] + d[0], Math.max(-80, Math.min(80, rot[1] + d[1]))]; pedir(true); }
    else if (e.key === "Enter") { e.preventDefault(); elegir(-rot[0], -rot[1]); }
    else if (e.key === "Escape") volverAlGlobo();
  });

  function volar(lon, lat, destinoT) {
    return new Promise(listo => {
      const r0 = [...rot], t0 = tPlano, dur = reduce ? 1 : 1300, ini = performance.now();
      let dl = ((-lon - r0[0]) % 360 + 540) % 360 - 180; // camino corto
      const r1 = [r0[0] + dl, -lat];
      volando = true; $("pista").hidden = true; $("volver").hidden = destinoT === 0;
      const paso = now => { const k = Math.min(1, (now - ini) / dur), e = d3.easeCubicInOut(k);
        rot = [r0[0] + (r1[0] - r0[0]) * e, r0[1] + (r1[1] - r0[1]) * e]; tPlano = t0 + (destinoT - t0) * e; pedir();
        if (k < 1) requestAnimationFrame(paso); else { tPlano = destinoT; volando = false; pedir(true); listo(); } };
      requestAnimationFrame(paso);
    });
  }

  /* ---------- elegir un lugar ---------- */
  let pedido = 0;
  function nombreLugar(lon, lat) { return `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? "E" : "O"}`; }
  async function datosDe(lon, lat, id) {
    const C = CAPAS[id]; if (!C) return null;
    const celda = celdaDe(C, lon, lat), clave = lugarCercano(lon, lat), L = clave ? LUGARES[clave] : null;
    let serie = celda ? await serieDeCelda(id, celda) : null, fuente = serie ? "capa" : null, nombre = L ? L.nombre : null;
    if (!serie && L && L.series[C.tipo] && MUESTRAS[L.series[C.tipo]]) { // respaldo: serie real de muestra
      const m = MUESTRAS[L.series[C.tipo]], aDia = m.unidad === "mm/mes" ? 12 / 365.25 : 1; // contrato: lluvia en mm/día
      serie = { valores: aDia === 1 ? m.v : m.v.map(x => x == null ? x : x * aDia), inicio: m.inicio, unidad: aDia === 1 ? m.unidad : "mm/día", fuente: m.fuente }; fuente = "muestra";
    }
    const ilus = fuente === "muestra" ? false : !!C.meta.ilustrativo;
    const resumen = serie ? resumir(serie, serie.unidad || C.meta.unidad, nombre || nombreLugar(lon, lat), ilus) : null;
    return { lon, lat, celda: celda && C.meta.pendiente_decada[celda.k] != null ? { i: celda.i, j: celda.j, k: celda.k, lon: celda.lon, lat: celda.lat } : (celda ? { i: celda.i, j: celda.j, k: celda.k, lon: celda.lon, lat: celda.lat, sinDatos: true } : null),
      capa: id, nombre: nombre || nombreLugar(lon, lat), lugar: clave, fuente, serie: serie ? serie.valores : null, inicio: serie ? serie.inicio : null,
      unidad: serie ? (serie.unidad || C.meta.unidad) : C.meta.unidad, fuenteDatos: serie ? (serie.fuente || C.meta.fuente) : C.meta.fuente,
      ilustrativo: ilus, resumen, bbox: L && fuente === "muestra" ? L.bbox : celda ? celda.bbox : null };
  }
  // Resumen en la unidad ORIGINAL de la capa (formato de docs/TARJETA.md); la conversión para mostrar la hace la tarjeta.
  function resumir(serie, unidad, lugar, ilustrativo) {
    let r; try { r = Stats.analizar(serie.valores, serie.inicio); } catch (e) { return null; }
    if (!r || !isFinite(r.b)) return null;
    const v = Stats.veredicto(r), media = a => a.reduce((s, x) => s + x.v, 0) / a.length;
    const anual = r.anual.filter(x => x.completo), k = Math.min(10, Math.floor(anual.length / 2)), A = anual.slice(0, k), B = anual.slice(-k);
    if (!k) return null;
    return { antes: media(A), hoy: media(B), antes_periodo: [A[0].y, A.at(-1).y], hoy_periodo: [B[0].y, B.at(-1).y], unidad,
      pendiente_decada: r.porDecada, ic95: r.icDecada, p: v.p, veredicto: v.clave, texto: v.texto,
      caras: Math.max(0, Math.floor(-Math.log2(Math.max(v.p, 1e-300)))), lugar, ilustrativo, analisis: r };
  }
  async function elegir(lon, lat, mover = true) {
    const n = ++pedido;
    seleccion = { lon, lat, bbox: null, cargando: true };
    mostrarTarjeta();
    const vuelo = mover ? volar(lon, lat, 1) : Promise.resolve();
    const d = await datosDe(lon, lat, capa);
    if (n !== pedido) return d;       // el usuario ya eligió otro lugar
    seleccion = { lon, lat, bbox: d && d.bbox, datos: d }; pedir(true);
    mostrarTarjeta();
    const { resumen, ...rest } = d || {};
    emitir("terra:lugar", { ...rest, resumen: resumen ? sinAnalisis(resumen) : null });
    await vuelo;
    return d;
  }
  const sinAnalisis = r => { const { analisis, ...x } = r; return x; };

  function volverAlGlobo() {
    if (tPlano === 0 && !seleccion) return;
    pedido++;
    volar(-rot[0], 15, 0).then(() => { seleccion = null; mostrarTarjeta(); girando = !reduce; pedir(true); });
    $("volver").hidden = true;
  }

  /* ---------- tarjeta (respaldo hasta que llegue web/src/tarjeta.js de la Tarea 3) ---------- */
  const fmt = (x, d) => x.toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
  const decimales = x => { const a = Math.abs(x); return a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= .01 ? 3 : 4; };
  const sig2 = x => { const a = Math.abs(x); return a === 0 ? 0 : Math.max(0, Math.min(5, 1 - Math.floor(Math.log10(a)))); }; // 2 cifras significativas
  function tarjetaHTML(d) {
    const R = d.resumen, C = CAPAS[d.capa], E = C.estilo;
    if (window.Tarjeta && typeof Tarjeta.html === "function") {
      let anio; try { anio = Tarjeta.anioGuardado ? Tarjeta.anioGuardado() : undefined; } catch (e) { /* sin almacenamiento */ }
      return Tarjeta.html(sinAnalisis(R), { capa: C.tipo, anioNacimiento: anio == null ? undefined : anio });
    }
    const seguro = R.veredicto === "muy" || R.veredicto === "si", sube = R.pendiente_decada > 0;
    const calor = C.tipo === "temp", tono = !seguro ? "" : (calor ? (sube ? "hot" : "wet") : (sube ? "wet" : "hot"));
    const col = tono === "hot" ? "var(--warm)" : tono === "wet" ? "var(--cool)" : "var(--muted)";
    const M = mostrar(R.unidad), antes = R.antes * M.f, hoy = R.hoy * M.f, pend = R.pendiente_decada * M.f;
    const dec = decimales(hoy), on = Math.min(10, R.caras), u = esc(M.u);
    const per = p => `${p[0]}–${String(p[1]).slice(2)}`;
    const mon = !seguro ? (R.caras <= 1 ? "Como sacar <b>cara</b> al lanzar una moneda: pasa todo el tiempo. <b>No podemos asegurar que cambió.</b>" : `Como sacar <b>${R.caras} caras seguidas</b>: pasa seguido. <b>No podemos asegurar que cambió.</b>`)
      : R.caras > 10 ? "Como sacar <b>más de 10 caras seguidas</b>: <b>el cambio es real.</b>" : `Como sacar <b>${R.caras} caras seguidas</b>: pasa 1 vez de cada ${2 ** R.caras}. <b>${R.veredicto === "muy" ? "Es muy probable que sea real." : "Probablemente es real, con menos margen."}</b>`;
    const etiqueta = d.ilustrativo ? "datos ilustrativos" : d.fuente === "muestra" ? "serie real de muestra NASA" : "datos NASA";
    return `<article class="tc"><div class="tc-top ${tono}"><div class="tc-lugar"><div><b>${esc(d.nombre)}</b><span>${esc(C.meta.titulo || E.nombre)} · ${etiqueta}</span></div></div>
      <div class="tc-num"><div><small>Antes (${per(R.antes_periodo)})</small><b>${fmt(antes, dec)}<span>${u}</span></b></div><div style="color:var(--muted);font-size:1.3rem;padding-bottom:4px">→</div><div><small>Hoy (${per(R.hoy_periodo)})</small><b>${fmt(hoy, dec)}<span>${u}</span></b></div></div>
      <div class="tc-ver" style="color:${col}">${seguro ? `${sube ? "▲ " + E.R : "▼ " + E.L}` : "≈ Sin cambio claro"} <span style="font-size:.8em;color:var(--muted)">${pend > 0 ? "+" : "−"}${fmt(Math.abs(pend), sig2(pend))} ${u} por década</span></div></div>
      <div class="tc-cuerpo"><div><h4>¿Es seguro?</h4><div class="monedas" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</div><p>${mon}</p></div>
      <p style="color:var(--muted);font-size:.78rem">Fuente: ${esc(d.fuenteDatos || "")}</p></div></article>`;
  }
  // Prueba detallada (animación de 5 pasos de la Tarea 3), si animacion.js está cargado.
  let anim = null;
  function prueba(d) {
    const caja = $("pruebaCaja"), cont = $("prueba");
    if (anim) { try { anim.destruir(); } catch (e) { /* ya destruida */ } anim = null; }
    const hay = !!(d && d.serie && d.resumen && caja && cont && window.Tarjeta && typeof Tarjeta.animacion === "function");
    if (caja) { caja.hidden = !hay; if (!hay) caja.open = false; }
    if (!hay) return;
    try { anim = Tarjeta.animacion(cont, { valores: d.serie, inicio: d.inicio }, { capa: CAPAS[d.capa].tipo, unidad: d.resumen.unidad, lugar: d.nombre, analisis: d.resumen.analisis }); }
    catch (e) { console.warn("[Terra] no se pudo crear la animación", e); caja.hidden = true; }
  }
  function mostrarTarjeta() {
    const el = $("tarjeta"); if (!el) return;
    prueba(seleccion && !seleccion.cargando ? seleccion.datos : null);
    if (!seleccion) { el.innerHTML = `<div class="vacio"><b style="font-family:var(--f-display);font-size:1.1rem">Elige un lugar del planeta</b><p>Toca cualquier punto del globo, o usa los botones de abajo a la derecha para ir a un caso con datos reales.</p></div>`; return; }
    if (seleccion.cargando) { el.innerHTML = `<div class="vacio"><span class="coords">${nombreLugar(seleccion.lon, seleccion.lat)}</span><p>Buscando la serie de este lugar…</p></div>`; return; }
    const d = seleccion.datos;
    if (d && d.resumen) { el.innerHTML = tarjetaHTML(d); return; }
    const C = CAPAS[capa];
    const motivo = C.meta.respaldo ? "Todavía no hay capas con datos de la NASA en <code>data/capas/</code>; el mapa muestra un patrón ilustrativo."
      : d && d.celda && d.celda.sinDatos ? "Esta celda no tiene datos en esta capa (por ejemplo, océano en una capa de tierra)." : "No se encontró la serie de esta celda.";
    el.innerHTML = `<div class="vacio"><b style="font-family:var(--f-display);font-size:1.1rem">${esc(d ? d.nombre : "Lugar elegido")}</b><span class="coords">${nombreLugar(seleccion.lon, seleccion.lat)} · celda de ${C.meta.rejilla.res}°</span><p>${motivo}</p><p style="color:var(--muted);font-size:.85rem">Prueba Morelos, Sahel o norte de México: tienen series reales de muestra.</p></div>`;
  }

  /* ---------- capas: botones, leyenda y aviso ---------- */
  function pintarCapas() {
    const C = CAPAS[capa], E = C.estilo, m = C.meta;
    $("capas").innerHTML = ORDEN.map(id => { const X = CAPAS[id]; return `<button class="capa" type="button" data-c="${esc(id)}" aria-pressed="${id === capa}"><span aria-hidden="true">${X.estilo.ico}</span>${esc(X.estilo.nombre)}${X.meta.ilustrativo ? " <small>ilustrativo</small>" : ""}</button>`; }).join("");
    $("leyT").textContent = (m.titulo || E.nombre) + (m.respaldo ? " · patrón ilustrativo" : "");
    const M = mostrar(m.unidad), u = M.u ? ` ${M.u}` : "", lim = C.lim * M.f;
    $("leyL").textContent = m.respaldo ? E.L : `${E.L} (−${fmt(lim, sig2(lim))}${u} por década)`;
    $("leyR").textContent = m.respaldo ? E.R : `${E.R} (+${fmt(lim, sig2(lim))}${u} por década)`;
    $("barra").style.background = `linear-gradient(90deg,${E.pal.join(",")})`;
    if ($("capaTag")) $("capaTag").textContent = E.nombre;
    const aviso = $("aviso");
    if (aviso) {
      aviso.hidden = !m.ilustrativo;
      aviso.innerHTML = m.respaldo ? "<b>Datos ilustrativos.</b> Aún no hay capas de la NASA en este sitio: los colores del mapa son un patrón de ejemplo, no mediciones. Morelos, Sahel y norte de México sí usan series reales."
        : `<b>Datos ilustrativos.</b> La capa «${esc(m.titulo || capa)}» es de prueba (${esc(m.fuente || "sin fuente")}); no representa mediciones reales.`;
    }
  }
  $("capas").addEventListener("click", e => { const b = e.target.closest(".capa"); if (b) elegirCapa(b.dataset.c); });
  function elegirCapa(id) {
    if (!CAPAS[id]) return false;
    if (id !== capa) {
      capa = id; pintarCapas(); pedir(true);
      const m = CAPAS[id].meta;
      emitir("terra:capa", { id, titulo: m.titulo, unidad: m.unidad, ilustrativo: !!m.ilustrativo });
      if (seleccion && !seleccion.cargando) elegir(seleccion.lon, seleccion.lat, false);
    }
    return true;
  }

  /* ---------- window.Terra (contrato, sección 4) ---------- */
  let listo;
  const preparado = new Promise(r => { listo = r; });
  window.Terra = {
    listo: preparado,
    capas: () => ORDEN.map(id => { const m = CAPAS[id].meta; return { id, titulo: m.titulo, unidad: m.unidad, ilustrativo: !!m.ilustrativo }; }),
    elegirCapa: id => elegirCapa(id),
    capaActual: () => capa,
    async irA(lon, lat) { await preparado; girando = false; const d = await elegir(+lon, +lat); return { lon: +lon, lat: +lat, celda: d ? d.celda : null }; },
    async resumen(lon, lat, id = capa) { await preparado; const d = await datosDe(+lon, +lat, id); return d && d.resumen ? sinAnalisis(d.resumen) : null; },
    async serie(lon, lat, id = capa) { await preparado; const d = await datosDe(+lon, +lat, id); return d && d.serie ? { valores: d.serie, inicio: d.inicio, unidad: d.unidad } : null; },
    volverAlGlobo,
    rendimiento: () => ({ ms: +ultimoMs.toFixed(2), paso: pasoMov }),
  };

  $("volver").onclick = volverAlGlobo;
  document.querySelectorAll("[data-ir]").forEach(b => b.onclick = () => { const L = LUGARES[b.dataset.ir]; girando = false; elegir(L.lon, L.lat); });

  /* ---------- arranque ---------- */
  (async () => {
    colores(); mostrarTarjeta();
    const [topo, muestras] = await Promise.all([json("src/land-110m.json"), encontrarBase()]);
    land = topojson.feature(topo, topo.objects.land); grat = d3.geoGraticule10();
    MUESTRAS = Object.fromEntries((muestras || []).map(m => [m.id, m]));
    await cargarCapas();
    capa = ORDEN[0];
    pintarCapas();
    new ResizeObserver(tamanio).observe(cv);
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { colores(); pedir(true); });
    new MutationObserver(() => { colores(); pedir(true); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    requestAnimationFrame(bucle);
    listo();
    emitir("terra:capa", { id: capa, titulo: CAPAS[capa].meta.titulo, unidad: CAPAS[capa].meta.unidad, ilustrativo: !!CAPAS[capa].meta.ilustrativo });
  })().catch(e => { console.error("[Terra] no se pudo iniciar el globo", e); const t = $("tarjeta"); if (t) t.innerHTML = `<div class="vacio"><b>No se pudo cargar el mapa.</b><p>${esc(e.message)}</p></div>`; });
})();