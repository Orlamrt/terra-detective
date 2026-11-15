"""Tarea 1 · Anomalía de cada año por celda, para pintar el mapa año por año.

Lee data/crudos/<capa>_2deg.nc (salida de descargar.py) y escribe data/capas/<capa>_anual.json
(formato en docs/CONTRATO_DATOS.md §1b).

Anomalía del año = promedio de sus 12 meses − promedio de todos los años completos de la celda.
Solo se usan años con los 12 meses; los valores se guardan como enteros (valor / escala) para
que el archivo pese poco.

Uso: python pipeline/anual.py temp lluvia suelo
"""
from __future__ import annotations

import json
import pathlib
import sys

import numpy as np

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ESCALA = {"°C": 0.01, "mm/día": 0.001, "m³/m³": 0.0001}   # resolución guardada por unidad


def anual(capa: str) -> pathlib.Path:
    import xarray as xr
    da = xr.open_dataarray(RAIZ / "data" / "crudos" / f"{capa}_2deg.nc")
    cubo = da.values.astype("float64")                      # (mes, lat, lon)
    y0, m0 = map(int, da.attrs["inicio"].split("-"))
    if m0 != 1:
        raise ValueError("la serie debe empezar en enero")
    nmes, nlat, nlon = cubo.shape
    nanios = nmes // 12                                     # solo años completos
    porAnio = cubo[: nanios * 12].reshape(nanios, 12, nlat, nlon)
    completo = np.isfinite(porAnio).all(axis=1)             # (año, lat, lon)
    media_anual = np.where(completo, porAnio.mean(axis=1), np.nan)
    base = np.nanmean(media_anual, axis=0)                  # promedio de los años completos de cada celda
    anom = media_anual - base
    anios = list(range(y0, y0 + nanios))
    unidad = da.attrs["unidad"]; esc = ESCALA.get(unidad, 0.01)
    filas = []
    for a in range(nanios):
        plano = anom[a].reshape(-1)                         # índice k = i·nlon + j (i de sur a norte, como el contrato)
        filas.append([None if not np.isfinite(v) else int(round(v / esc)) for v in plano])
    finitos = np.abs(anom[np.isfinite(anom)])
    tope = float(np.percentile(finitos, 95)) if finitos.size else 1.0
    t_centro = y0 + nmes / 24                               # tiempo medio de los meses (para proyectar la tendencia)
    doc = {"version": 1, "capa": capa, "unidad": unidad, "base": [anios[0], anios[-1]], "anios": anios,
           "escala": esc, "tope": round(tope, 4), "t_centro": round(t_centro, 4),
           "rejilla": {"res": float(da.lat[1] - da.lat[0]), "lat0": float(da.lat[0] - (da.lat[1] - da.lat[0]) / 2),
                       "lon0": float(da.lon[0] - (da.lon[1] - da.lon[0]) / 2), "nlat": nlat, "nlon": nlon},
           "anomalia": filas}
    salida = RAIZ / "data" / "capas" / f"{capa}_anual.json"
    salida.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"{capa}: {len(anios)} años ({anios[0]}–{anios[-1]}), tope ±{tope:.3g} {unidad}, {salida.stat().st_size / 1e6:.1f} MB")
    return salida


if __name__ == "__main__":
    for c in sys.argv[1:] or ["temp", "lluvia", "suelo"]:
        anual(c)
