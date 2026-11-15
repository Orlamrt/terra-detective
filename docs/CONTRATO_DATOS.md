# Contrato de datos y funciones

Este documento es lo único que las 5 tareas deben respetar para trabajar en paralelo.
Cambiarlo requiere un PR revisado por las personas de las tareas afectadas.

## 1. Capa de tendencias · `data/capas/<capa>.json`

Un archivo por variable: `temp`, `lluvia`, `suelo`, `verdor`. Lo produce la **Tarea 1** (`pipeline/exportar.py`) y lo leen las **Tareas 2, 3 y 4**.

```json
{
  "version": 1,
  "capa": "temp",
  "titulo": "Temperatura del aire",
  "unidad": "°C",
  "fuente": "MERRA-2 (NASA GMAO), temperatura del aire a 2 m",
  "ilustrativo": false,
  "inicio": "2000-01",
  "meses": 312,
  "rejilla": { "res": 2, "lat0": -90, "lon0": -180, "nlat": 90, "nlon": 180 },
  "pendiente_decada": [0.21, 0.19, null, "..."],
  "significancia":    [2, 1, null, "..."],
  "p":                [0.0004, 0.03, null, "..."],
  "media":            [14.2, 13.9, null, "..."]
}
```

| Campo | Significado |
|---|---|
| `rejilla` | Celdas de `res` grados. La celda `(i, j)` cubre latitudes `lat0 + i·res` a `lat0 + (i+1)·res` y longitudes `lon0 + j·res` a `lon0 + (j+1)·res`. `i` va de sur a norte, `j` de oeste a este. |
| arreglos | Longitud `nlat·nlon`, índice `k = i·nlon + j`. `null` = sin datos (océano en capas de tierra, o menos de 3 años válidos). |
| `pendiente_decada` | Cambio por década en `unidad` (regresión de anomalías). |
| `significancia` | `2` muy significativa (p<0.01 en t y Mann-Kendall), `1` significativa (p<0.05 en ambas), `0` no concluyente. |
| `p` | El mayor de los dos p-valores (el usado para las monedas: caras = ⌊−log₂ p⌋). |
| `ilustrativo` | `true` si son datos de prueba. La web **debe** mostrar un aviso visible cuando es `true`. |

### Unidades por capa (obligatorias)

El campo `unidad` de cada capa y los valores de `data/series/` vienen **siempre** en estas unidades. La conversión a lo que ve la persona (mm al año, %, etc.) la hace la web.

| Capa | Producto NASA | `unidad` | Rango típico | Para mostrar |
|---|---|---|---|---|
| `temp` | MERRA-2 T2M | `°C` | −50 a 35 | tal cual |
| `lluvia` | GPM IMERG mensual v07 | `mm/día` | 0 a 20 | × 365.25 → mm al año |
| `suelo` | GLDAS-2.1 Noah, 0–10 cm | `m³/m³` | 0.02 a 0.5 | × 100 → % de agua en el suelo |
| `verdor` | MODIS MOD13C2 | `NDVI` | −0.2 a 1 | tal cual |

`pendiente_decada` está en la misma `unidad` por década. Si una capa cambia de unidad, se actualiza esta tabla en el mismo PR.

## 2. Series por celda · `data/series/<capa>/<ti>_<tj>.json`

Teselas de 10°×10° para que la web descargue solo lo que necesita al hacer clic.
`ti = floor((lat + 90) / 10)`, `tj = floor((lon + 180) / 10)`.

```json
{ "capa": "temp", "inicio": "2000-01", "celdas": { "54_40": [12.1, 12.9, "...312 valores mensuales"] } }
```

La clave de cada celda es `"i_j"` (los índices de la rejilla). Con esa serie, `web/src/stats.js` recalcula todo lo de la tarjeta y la animación.

## 3. Estadística compartida

- `pipeline/tendencias.py` (Python) y `web/src/stats.js` (navegador) implementan **el mismo método**.
- `tests/test_paridad.py` falla si dan resultados distintos. Si cambias uno, cambia el otro en el mismo PR.

## 4. Funciones de la página que usa el Detective (Tarea 4)

La Tarea 2 expone en `window.Terra` (la Tarea 4 solo las llama):

| Función | Qué hace | Devuelve |
|---|---|---|
| `Terra.capas()` | Lista de capas disponibles | `[{id, titulo, unidad, ilustrativo}]` |
| `Terra.elegirCapa(id)` | Cambia la capa del mapa | `true/false` |
| `Terra.irA(lon, lat)` | Aplana el globo y hace zoom al lugar; abre la tarjeta | `Promise<{lon, lat, celda}>` |
| `Terra.resumen(lon, lat, capa?)` | Datos de la tarjeta sin mover el mapa | `Promise<{antes, hoy, unidad, pendiente_decada, ic95, p, veredicto, caras}>` |
| `Terra.volverAlGlobo()` | Regresa a la vista de globo | `void` |

Eventos (`window.addEventListener`): `terra:lugar` (cuando el usuario elige un lugar) y `terra:capa` (cuando cambia la capa), con el detalle en `event.detail`.

## 5. Componentes de la tarjeta (Tarea 3)

`web/src/tarjeta.js` exporta `Tarjeta.html(resumen, opciones)` y `Tarjeta.animacion(contenedor, serie, opciones)`. Reciben datos ya calculados con `stats.js`; no descargan nada.
