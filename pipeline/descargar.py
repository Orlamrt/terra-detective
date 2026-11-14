"""Tarea 1 · Descarga de mapas mensuales globales de la NASA y reducción a celdas de 2°.

Requisito: sesión de NASA Earthdata guardada una vez en tu equipo:
    python -c "import earthaccess; earthaccess.login(strategy='interactive', persist=True)"

Uso:
    python pipeline/descargar.py temp --desde 2000 --hasta 2025
Salida: data/crudos/<capa>_2deg.nc  (no se sube a git)

ESTADO: esqueleto sin probar contra los servidores (falta la sesión Earthdata).
La primera persona que lo corra debe confirmar nombres de variables y unidades.
"""
from __future__ import annotations

import argparse
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CRUDOS = RAIZ / "data" / "crudos"

CAPAS = {
    # capa: producto NASA, versión, variable, conversión a unidades amigables
    "temp":   dict(short_name="M2TMNXSLV", version="5.12.4", var="T2M", unidad="°C", conv=lambda x: x - 273.15,
                   fuente="MERRA-2 (NASA GMAO), temperatura del aire a 2 m"),
    "lluvia": dict(short_name="GPM_3IMERGM", version="07", var="precipitation", unidad="mm/día", conv=lambda x: x * 24,
                   fuente="GPM IMERG Final mensual (satélites)"),
    "suelo":  dict(short_name="GLDAS_NOAH10_M", version="2.1", var="SoilMoi0_10cm_inst", unidad="kg/m²", conv=lambda x: x,
                   fuente="GLDAS-2.1 Noah, humedad del suelo 0–10 cm"),
    "verdor": dict(short_name="MOD13C2", version="061", var="CMG 0.05 Deg Monthly NDVI", unidad="NDVI", conv=lambda x: x,
                   fuente="MODIS Terra MOD13C2, índice de vegetación"),
}
RES = 2.0  # grados por celda


def descargar(capa: str, desde: int, hasta: int) -> pathlib.Path:
    import earthaccess
    import numpy as np
    import xarray as xr

    cfg = CAPAS[capa]
    earthaccess.login(strategy="netrc")
    granulos = earthaccess.search_data(short_name=cfg["short_name"], version=cfg["version"],
                                       temporal=(f"{desde}-01-01", f"{hasta}-12-31"))
    print(f"{capa}: {len(granulos)} archivos mensuales")
    archivos = earthaccess.open(granulos)
    meses = []
    for f in archivos:
        ds = xr.open_dataset(f)
        da = ds[cfg["var"]].squeeze()
        # nombres de coordenadas varían por producto
        lat = next(c for c in da.dims if c.lower().startswith("lat") or c.lower() == "y")
        lon = next(c for c in da.dims if c.lower().startswith("lon") or c.lower() == "x")
        da = da.rename({lat: "lat", lon: "lon"}).transpose("lat", "lon")
        bins_lat = np.arange(-90, 90 + RES, RES)
        bins_lon = np.arange(-180, 180 + RES, RES)
        g = (da.groupby_bins("lat", bins_lat).mean().groupby_bins("lon", bins_lon).mean())
        meses.append(cfg["conv"](g.values.astype("float32")))
    cubo = xr.DataArray(np.stack(meses), dims=("mes", "lat", "lon"),
                        coords={"lat": bins_lat[:-1] + RES / 2, "lon": bins_lon[:-1] + RES / 2},
                        attrs={"inicio": f"{desde}-01", "unidad": cfg["unidad"], "fuente": cfg["fuente"]})
    CRUDOS.mkdir(parents=True, exist_ok=True)
    salida = CRUDOS / f"{capa}_2deg.nc"
    cubo.to_netcdf(salida)
    return salida


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("capa", choices=CAPAS)
    ap.add_argument("--desde", type=int, default=2000)
    ap.add_argument("--hasta", type=int, default=2025)
    a = ap.parse_args()
    print(descargar(a.capa, a.desde, a.hasta))
