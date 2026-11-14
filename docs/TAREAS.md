# Reparto de tareas · Terra Detective (NASA Space Apps 2026)

Reto: **Be an Earth System Trend Detective!** Plazo: menos de 24 h.
Regla de oro: todo pasa por PR a `main`; la **Tarea 5** revisa y fusiona. El formato de datos y funciones está en [`CONTRATO_DATOS.md`](CONTRATO_DATOS.md).

| # | Tarea | Responsable | Rama | Produce | Consume |
|---|---|---|---|---|---|
| 1 | Datos y pipeline NASA | Persona 1 | `tarea-1-datos` | `data/capas/*.json`, `data/series/**` | Earthdata |
| 2 | Globo y mapa | Persona 2 | `tarea-2-globo` | `web/src/globo.js`, `window.Terra` | capas + series |
| 3 | Tarjeta y prueba detallada | Persona 3 | `tarea-3-tarjeta` | `web/src/tarjeta.js`, `animacion.js` | `stats.js` + series |
| 4 | Detective con IA | Persona 4 | `tarea-4-detective` | `web/src/detective.js` | `window.Terra` |
| 5 | Calidad, ciencia y entrega | Persona 5 | `tarea-5-entrega` | tests, README, demo, entrega | todo |

---

## Tarea 1 · Datos y pipeline NASA — Persona 1
**Objetivo:** las 4 capas reales del mundo, 2000–2025, en el formato del contrato.
- [ ] Guardar sesión Earthdata (`earthaccess.login(strategy='interactive', persist=True)`), nunca subir `.netrc`.
- [ ] Correr `pipeline/descargar.py temp` y confirmar nombre de variable, unidades y que el cubo sea (mes, 90, 180).
- [ ] Lo mismo para `lluvia` (GPM IMERG, 1998→, usar 2000–2025) y `suelo` (GLDAS 2.1).
- [ ] `pipeline/exportar.py <capa>` → revisar que `data/capas/<capa>.json` pese < 2 MB.
- [ ] `verdor` (MODIS MOD13C2) solo si sobra tiempo: archivos pesados.
- [ ] Mientras no haya datos reales: `python pipeline/exportar.py --demo` genera `demo_temp` (marcada `ilustrativo: true`).
**Listo cuando:** las 3 primeras capas están en `main` y los tests pasan.

## Tarea 2 · Globo y mapa — Persona 2
**Objetivo:** el globo que se aplana, pintado con las capas reales.
- [ ] Partir de `web/index.html` (prototipo) y separar el código en `web/src/globo.js`.
- [ ] Leer `data/capas/<capa>.json` y pintar por celda (`pendiente_decada` → color, `significancia` → puntos).
- [ ] Clic → celda `(i, j)` → descargar la tesela de `data/series/` y emitir `terra:lugar`.
- [ ] Exponer `window.Terra` según el contrato (sección 4).
- [ ] Aviso visible si la capa es `ilustrativo: true`.
- [ ] Rendimiento: 16 200 celdas a ≥ 30 fps al girar (pintar en un canvas fuera de pantalla y reutilizar).
- [ ] Probar en celular (arrastrar, tocar, botón "Volver al globo").
**Listo cuando:** se puede tocar cualquier lugar del mundo y la tarjeta recibe su serie.

## Tarea 3 · Tarjeta y prueba detallada — Persona 3
**Objetivo:** la tarjeta sencilla y la animación de 5 pasos como componentes reutilizables.
- [ ] Extraer de `web/prototipos/detective.html` la tarjeta (antes → hoy, monedas, qué significa, desde que naciste) a `web/src/tarjeta.js`.
- [ ] Extraer la animación de 5 pasos a `web/src/animacion.js`.
- [ ] Que funcionen con cualquier serie del contrato (unidades, °C vs %, mm, NDVI).
- [ ] Textos de "¿Qué significa?" por capa, revisados por la Tarea 5.
- [ ] Si cambias `stats.js`, cambia `pipeline/tendencias.py` en el mismo PR (test de paridad).
**Listo cuando:** la Tarea 2 muestra la tarjeta y la animación de cualquier celda.

## Tarea 4 · Detective con IA — Persona 4
**Objetivo:** preguntar en lenguaje natural y que el Detective mueva el mapa y explique.
- [ ] Pasar el chat de `web/prototipos/detective.html` a `web/src/detective.js`.
- [ ] Herramientas para la IA: `Terra.irA`, `Terra.elegirCapa`, `Terra.resumen` (no tocar el mapa directamente).
- [ ] Prompt: usar solo los números que devuelve `Terra.resumen`; nunca inventar cifras.
- [ ] Modo sin IA: palabras clave → capa + lugar (lista de lugares conocidos con coordenadas).
- [ ] Preguntas sugeridas que lleven a casos con tendencias opuestas (Sahel vs. norte de México).
**Listo cuando:** "¿se está secando el norte de México?" mueve el mapa, abre la tarjeta y responde.

## Tarea 5 · Calidad, ciencia y entrega — Persona 5
**Objetivo:** que funcione, que sea correcto y que se entregue a tiempo.
- [ ] Revisar y fusionar PRs; mantener `main` siempre funcionando.
- [ ] `python -m pytest tests/` en cada PR (paridad estadística JS ↔ Python).
- [ ] Revisión científica: textos, referencias (Santer 2000, Hirsch 1982, Weatherhead 1998, fuentes NASA) y avisos de datos ilustrativos.
- [ ] Prueba con 3–5 personas sin formación técnica: "¿qué te dice esta tarjeta?". Anotar y pasar ajustes a las Tareas 2–3.
- [ ] Accesibilidad: contraste, teclado, textos alternativos.
- [ ] Publicar `web/` en GitHub Pages.
- [ ] Video demo (≤ 30 s–1 min) y página del proyecto en Space Apps.
**Listo cuando:** el proyecto está entregado en spaceappschallenge.org.

---

## Hitos

| Horas | Hito | Quién |
|---|---|---|
| 0–2 | Todos clonan, crean su rama y leen el contrato | Todos |
| 2–12 | Capas reales (1) · globo conectado (2) · componentes (3) · chat con herramientas (4) · tests y pruebas de usuario (5) | Cada tarea |
| 12–20 | Integración en `main` con datos reales | 2 coordina, 5 revisa |
| 20–24 | Correcciones, video, publicación y entrega | 5 coordina |
