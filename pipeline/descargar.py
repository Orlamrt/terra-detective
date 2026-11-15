"""Tarea 1 · Descarga de mapas mensuales globales de la NASA, reducidos a celdas de 2°×2°.

Usa el servicio OPeNDAP en la nube de NASA Earthdata (opendap.earthdata.nasa.gov) para bajar
solo la variable necesaria de cada archivo mensual (KB en vez de decenas de MB).

Requisito (una vez):  python pipeline/iniciar_sesion_earthdata.py
Uso:                  python pipeline/descargar.py temp --desde 2000 --hasta 2025
Salida:               data/crudos/<capa>_2deg.nc   (no se sube a git)
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import io
import pathlib
import time
import urllib.parse

import numpy as np

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CRUDOS = RAIZ / "data" / "crudos"
RES = 2.0

CAPAS = {
    "temp": dict(short_name="M2TMNXSLV", version="5.12.4", var="T2M",
                 ce="/T2M[0][0:1:360][0:1:575];/lat[0:1:360];/lon[0:1:575]", orden=("lat", "lon"),
                 conv=lambda x: x - 273.15, unidad="°C",
                 titulo="Temperatura del aire", fuente="MERRA-2 (NASA GMAO), temperatura del aire a 2 m (M2TMNXSLV)"),
    "lluvia": dict(short_name="GPM_3IMERGM", version="07", var="precipitation",
                   ce="/Grid/precipitation[0][0:4:3599][0:4:1799];/Grid/lon[0:4:3599];/Grid/lat[0:4:1799]", orden=("lon", "lat"),
                   conv=lambda x: x * 24, unidad="mm/día",
                   titulo="Lluvia", fuente="GPM IMERG Final mensual v07 (satélites), precipitación"),
    "suelo": dict(short_name="GLDAS_NOAH10_M", version="2.1", var="SoilMoi0_10cm_inst",
                  ce="/SoilMoi0_10cm_inst[0][0:1:149][0:1:359];/lat[0:1:149];/lon[0:1:359]", orden=("lat", "lon"),
                  conv=lambda x: x / 100.0, unidad="m³/m³",   # kg/m² en 0–10 cm -> fracción volumétrica (÷100 mm)
                  titulo="Humedad del suelo (0–10 cm)", fuente="GLDAS-2.1 Noah 1°, humedad del suelo 0–10 cm"),
}


def url_opendap(granulo) -> str:
    for u in granulo["umm"].get("RelatedUrls", []):
        if u.get("Subtype") == "OPENDAP DATA":
            return u["URL"]
    raise RuntimeError("el archivo no tiene enlace OPeNDAP")


def bajar_mes(sesion, url: str, ce: str, intentos=4) -> bytes:
    q = url + ".dap.nc4?dap4.ce=" + urllib.parse.quote(ce, safe="")
    for k in range(intentos):
        try:
            r = sesion.get(q, timeout=180)
            if r.status_code == 200 and r.content[:4] in (b"\x89HDF", b"CDF\x01", b"CDF\x02"):
                return r.content
            err = f"HTTP {r.status_code}"
        except Exception as e:  # noqa: BLE001
            err = repr(e)
        time.sleep(3 * (k + 1))
    raise RuntimeError(f"no se pudo bajar {url}: {err}")


def a_rejilla(contenido: bytes, cfg) -> np.ndarray:
    import xarray as xr
    abrir = (lambda **k: xr.open_dataset(io.BytesIO(contenido), engine="h5netcdf", **k)) if contenido[:4] == b"\x89HDF" \
        else (lambda **k: xr.open_dataset(io.BytesIO(contenido), **k))
    ds = abrir()
    if cfg["var"] not in ds.data_vars:          # GPM guarda los datos dentro del grupo "Grid"
        ds = abrir(group=cfg.get("grupo", "Grid"))
    nombre = next(v for v in ds.data_vars if v.split("/")[-1] == cfg["var"])
    da = ds[nombre].squeeze(drop=True)
    lat = next(d for d in da.dims if "lat" in d.lower())
    lon = next(d for d in da.dims if "lon" in d.lower())
    da = da.transpose(lat, lon)
    v = cfg["conv"](da.values.astype("float64"))
    la = np.asarray(ds[lat].values if lat in ds else da[lat].values, dtype=float)
    lo = np.asarray(ds[lon].values if lon in ds else da[lon].values, dtype=float)
    lo = ((lo + 180) % 360) - 180
    nl, nn = int(180 / RES), int(360 / RES)
    il = np.clip(((la + 90) // RES).astype(int), 0, nl - 1)
    jn = np.clip(((lo + 180) // RES).astype(int), 0, nn - 1)
    suma = np.zeros((nl, nn)); cuenta = np.zeros((nl, nn))
    ok = np.isfinite(v)
    I, J = np.meshgrid(il, jn, indexing="ij")
    np.add.at(suma, (I[ok], J[ok]), v[ok]); np.add.at(cuenta, (I[ok], J[ok]), 1)
    with np.errstate(invalid="ignore"):
        return np.where(cuenta > 0, suma / cuenta, np.nan).astype("float32")


def descargar(capa: str, desde: int, hasta: int, hilos: int = 6) -> pathlib.Path:
    import earthaccess
    import xarray as xr
    cfg = CAPAS[capa]
    earthaccess.login(strategy="netrc")
    sesion = earthaccess.get_requests_https_session()
    granulos = earthaccess.search_data(short_name=cfg["short_name"], version=cfg["version"],
                                       temporal=(f"{desde}-01-01", f"{hasta}-12-31"))
    granulos = sorted(granulos, key=lambda g: g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"])
    fechas = [g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:7] for g in granulos]
    print(f"{capa}: {len(granulos)} meses ({fechas[0]} a {fechas[-1]})", flush=True)
    meses = [None] * len(granulos)
    t0 = time.time()
    with cf.ThreadPoolExecutor(hilos) as ex:
        futuros = {ex.submit(bajar_mes, sesion, url_opendap(g), cfg["ce"]): i for i, g in enumerate(granulos)}
        for n, f in enumerate(cf.as_completed(futuros), 1):
            meses[futuros[f]] = a_rejilla(f.result(), cfg)
            if n % 24 == 0 or n == len(granulos):
                print(f"  {n}/{len(granulos)} meses · {time.time() - t0:.0f} s", flush=True)
    esperado = pd_meses(fechas[0], len(fechas))
    if fechas != esperado:
        raise RuntimeError("faltan meses o hay duplicados en la serie")
    lats = -90 + RES / 2 + RES * np.arange(int(180 / RES)); lons = -180 + RES / 2 + RES * np.arange(int(360 / RES))
    cubo = xr.DataArray(np.stack(meses), dims=("mes", "lat", "lon"), coords={"lat": lats, "lon": lons},
                        attrs={"inicio": fechas[0], "unidad": cfg["unidad"], "fuente": cfg["fuente"], "titulo": cfg["titulo"]})
    CRUDOS.mkdir(parents=True, exist_ok=True)
    salida = CRUDOS / f"{capa}_2deg.nc"
    cubo.to_netcdf(salida)
    return salida


def pd_meses(inicio: str, n: int) -> list[str]:
    y, m = map(int, inicio.split("-"))
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}"); m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("capa", choices=CAPAS)
    ap.add_argument("--desde", type=int, default=2000)
    ap.add_argument("--hasta", type=int, default=2025)
    ap.add_argument("--hilos", type=int, default=6)
    a = ap.parse_args()
    print(descargar(a.capa, a.desde, a.hasta, a.hilos))
