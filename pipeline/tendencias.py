"""Tendencia y significancia de una serie mensual.

Espejo exacto de web/src/stats.js: cualquier cambio aquí debe hacerse también allá
(tests/test_paridad.py lo verifica).

Método
- Anomalías: valor menos el promedio de su mes (quita el ciclo estacional).
- Regresión lineal de las anomalías contra el tiempo (años decimales).
- Autocorrelación lag-1 de los residuos -> tamaño efectivo n_ef = n(1-r1)/(1+r1) (Santer et al. 2000).
- Prueba t de dos colas con n_ef-2 grados de libertad e IC 95 %.
- Mann-Kendall estacional (Hirsch et al. 1982) sin corrección por empates + pendiente de Sen estacional.
- Años necesarios para detectar la tendencia (Weatherhead et al. 1998).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy import stats as sps


@dataclass
class Resultado:
    pendiente_anual: float
    pendiente_decada: float
    ic95_decada: tuple[float, float]
    p_t: float
    p_mk: float
    sen_decada: float
    r1: float
    n: int
    n_efectivo: float
    media: float
    anios: float
    anios_necesarios: float
    veredicto: str  # "muy" | "si" | "indicio" | "no"
    anual: list[dict] = field(default_factory=list)


def analizar(valores, inicio: str) -> Resultado:
    """valores: lista mensual (None/NaN = faltante); inicio: 'AAAA-MM'."""
    y0, m0 = map(int, inicio.split("-"))
    pts = []
    for i, v in enumerate(valores):
        if v is None or not np.isfinite(v):
            continue
        k = m0 - 1 + i
        m, y = k % 12, y0 + k // 12
        pts.append((y, m, y + (m + 0.5) / 12, float(v)))
    if len(pts) < 36:
        raise ValueError("se necesitan al menos 3 años de datos")
    ys, ms, ts, vs = (np.array(c) for c in zip(*pts))
    ms = ms.astype(int)
    clim = np.array([vs[ms == m].mean() for m in range(12)])
    an = vs - clim[ms]
    n = len(an)
    tm, am = ts.mean(), an.mean()
    sxx = ((ts - tm) ** 2).sum()
    b = ((ts - tm) * (an - am)).sum() / sxx
    a0 = am - b * tm
    res = an - (a0 + b * ts)
    r1 = float(np.corrcoef(res[:-1], res[1:])[0, 1])
    n_ef = max(3.0, n * (1 - r1) / (1 + r1))
    se = math.sqrt((res ** 2).sum() / (n_ef - 2) / sxx)
    p_t = float(2 * sps.t.sf(abs(b / se), n_ef - 2))
    tc = float(sps.t.ppf(0.975, n_ef - 2))

    S = V = 0.0
    pendientes = []
    for m in range(12):
        sel = ms == m
        xv, xy = vs[sel], ys[sel]
        k = len(xv)
        for i in range(k - 1):
            d = xv[i + 1:] - xv[i]
            S += np.sign(d).sum()
            pendientes.extend(d / (xy[i + 1:] - xy[i]))
        V += k * (k - 1) * (2 * k + 5) / 18
    z = (S - 1) / math.sqrt(V) if S > 0 else (S + 1) / math.sqrt(V) if S < 0 else 0.0
    p_mk = float(2 * sps.norm.sf(abs(z)))
    sen = float(np.median(pendientes))

    sigma = math.sqrt((res ** 2).mean())
    anios = n / 12
    nec = ((3.3 * sigma / abs(b)) * math.sqrt((1 + r1) / (1 - r1))) ** (2 / 3) if b != 0 else math.inf

    if p_t < 0.01 and p_mk < 0.01:
        ver = "muy"
    elif p_t < 0.05 and p_mk < 0.05:
        ver = "si"
    elif min(p_t, p_mk) < 0.10:
        ver = "indicio"
    else:
        ver = "no"

    anual = []
    for y in sorted(set(ys.astype(int))):
        sel = ys == y
        anual.append({"y": int(y), "v": float(vs[sel].mean()), "completo": int(sel.sum()) == 12})

    return Resultado(b, b * 10, ((b - tc * se) * 10, (b + tc * se) * 10), p_t, p_mk, sen * 10, r1, n, n_ef,
                     float(vs.mean()), anios, nec, ver, anual)
