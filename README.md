# Terra Detective 🌍🕵️

**NASA Space Apps Challenge 2026 · [Be an Earth System Trend Detective!](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/)**

Un planeta interactivo para descubrir **qué está cambiando, dónde, cuánto y si el cambio es real**, con datos de satélites y modelos de la NASA.

1. Un globo pintado por tendencias (rojo sube, azul baja; puntos donde el cambio es seguro) que se aplana en mapa al tocar un lugar.
2. Una tarjeta para todo público: antes → hoy, la certeza explicada con monedas, qué significa y cuánto cambió desde que naciste.
3. La prueba completa para quien la quiera: animación en 5 pasos con regresión, intervalo de confianza 95 % y Mann-Kendall.
4. Un Detective con IA que responde preguntas en lenguaje natural y mueve el mapa.

## Estado

| Parte | Estado |
|---|---|
| Estadística (`stats.js` ↔ `tendencias.py`) | ✅ Lista, con test de paridad sobre 10 series reales |
| Series reales de muestra (Morelos, Sahel, norte de México) | ✅ `data/muestras/` (NASA Giovanni: FLDAS, GPM IMERG) |
| Prototipos web | ✅ `web/index.html` (globo) y `web/prototipos/` |
| Capas globales reales | ⏳ Tarea 1 (`pipeline/`) — el globo usa un patrón **ilustrativo** mientras tanto |
| Detective con IA integrado al globo | ⏳ Tarea 4 |

## Cómo correrlo

```bash
# Web (cualquier servidor estático)
python -m http.server 8000 -d web      # abrir http://localhost:8000

# Pipeline de datos (Tarea 1)
pip install -r pipeline/requirements.txt
python -c "import earthaccess; earthaccess.login(strategy='interactive', persist=True)"   # una vez
python pipeline/descargar.py temp && python pipeline/exportar.py temp

# Tests
python -m pytest tests/      # requiere Node.js
```

## Estructura

```
docs/        CONTRATO_DATOS.md (formato que une todo) · TAREAS.md (reparto en 5)
pipeline/    descarga NASA, tendencias, exportación
data/        muestras/ (series reales) · capas/ y series/ (salida del pipeline)
web/         index.html (globo) · src/ (stats.js, mapa base) · prototipos/ · plantillas/
notebooks/   Colab: análisis de Morelos y Detective de tendencias
tests/       paridad estadística JS ↔ Python
```

## Método

Anomalías mensuales (sin ciclo estacional) → regresión lineal con prueba *t* corregida por autocorrelación (Santer et al., 2000), IC 95 %, Mann-Kendall estacional (Hirsch et al., 1982) y pendiente de Sen; años necesarios para detectar la tendencia (Weatherhead et al., 1998). Datos: NASA GES DISC Giovanni, MERRA-2, GPM IMERG, GLDAS, FLDAS, MODIS.

## Equipo

Ver [`docs/TAREAS.md`](docs/TAREAS.md).
