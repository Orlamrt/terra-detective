"""Tarea 1 · Del cubo mensual (mes, lat, lon) al formato del contrato (docs/CONTRATO_DATOS.md).

Uso:
    python pipeline/exportar.py temp          # lee data/crudos/temp_2deg.nc
    python pipeline/exportar.py --demo        # genera una capa sintética para probar la web
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib

import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from tendencias import analizar  # noqa: E402

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data"
NIVEL = {"muy": 2, "si": 1, "indicio": 0, "no": 0}
TESELA = 10  # grados por archivo de series


def r(x, d=4):
    return None if x is None or not math.isfinite(x) else round(float(x), d)


def exportar(capa: str, cubo: np.ndarray, lats: np.ndarray, lons: np.ndarray, inicio: str, meta: dict, ilustrativo=False):
    nmes, nlat, nlon = cubo.shape
    res = float(lats[1] - lats[0])
    pend, sig, pval, media = [], [], [], []
    teselas: dict[str, dict] = {}
    for i in range(nlat):
        for j in range(nlon):
            serie = cubo[:, i, j]
            ok = np.isfinite(serie).sum() >= 36
            if ok:
                try:
                    R = analizar(serie.tolist(), inicio)
                except (ValueError, ZeroDivisionError, FloatingPointError):
                    ok = False
            if not ok:
                pend.append(None); sig.append(None); pval.append(None); media.append(None)
                continue
            pend.append(r(R.pendiente_decada)); sig.append(NIVEL[R.veredicto])
            pval.append(r(max(R.p_t, R.p_mk), 6)); media.append(r(R.media))
            clave = f"{int((lats[i] + 90) // TESELA)}_{int((lons[j] + 180) // TESELA)}"
            teselas.setdefault(clave, {})[f"{i}_{j}"] = [r(v, 3) for v in serie]
    doc = {"version": 1, "capa": capa, **meta, "ilustrativo": ilustrativo, "inicio": inicio, "meses": nmes,
           "rejilla": {"res": res, "lat0": float(lats[0] - res / 2), "lon0": float(lons[0] - res / 2), "nlat": nlat, "nlon": nlon},
           "pendiente_decada": pend, "significancia": sig, "p": pval, "media": media}
    (SALIDA / "capas").mkdir(parents=True, exist_ok=True)
    (SALIDA / "capas" / f"{capa}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    d = SALIDA / "series" / capa
    d.mkdir(parents=True, exist_ok=True)
    for clave, celdas in teselas.items():
        (d / f"{clave}.json").write_text(json.dumps({"capa": capa, "inicio": inicio, "celdas": celdas}, separators=(",", ":")), encoding="utf-8")
    print(f"{capa}: {sum(p is not None for p in pend)} celdas con datos, {len(teselas)} teselas")


def demo():
    """Capa sintética pequeña (marcada ilustrativo=true) para que la web se pruebe sin descargas."""
    rng = np.random.default_rng(0)
    lats = np.arange(-89, 90, 2.0); lons = np.arange(-179, 180, 2.0)
    meses = 26 * 12
    t = np.arange(meses) / 12
    ciclo = np.sin(2 * np.pi * np.arange(meses) / 12)[:, None, None]
    tend = (0.02 + 0.03 * np.clip((lats[:, None] - 20) / 70, 0, 1)) * np.ones((1, len(lons)))
    cubo = 15 + 8 * ciclo + tend[None] * t[:, None, None] + rng.normal(0, .6, (meses, len(lats), len(lons)))
    exportar("demo_temp", cubo.astype("float32"), lats, lons, "2000-01",
             {"titulo": "Temperatura (DEMO sintética)", "unidad": "°C", "fuente": "Generado por exportar.py --demo"}, ilustrativo=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("capa", nargs="?")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.demo:
        demo()
    else:
        import xarray as xr
        da = xr.open_dataarray(RAIZ / "data" / "crudos" / f"{a.capa}_2deg.nc")
        exportar(a.capa, da.values, da.lat.values, da.lon.values, da.attrs["inicio"],
                 {"titulo": da.attrs.get("titulo", a.capa), "unidad": da.attrs["unidad"], "fuente": da.attrs["fuente"]})
