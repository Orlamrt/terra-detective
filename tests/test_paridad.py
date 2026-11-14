"""La web (stats.js) y el pipeline (tendencias.py) deben dar el mismo resultado.

Uso: python -m pytest tests/  (requiere Node.js en el PATH)
"""
import json
import pathlib
import subprocess
import sys

import pytest

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "pipeline"))
from tendencias import analizar  # noqa: E402

SERIES = json.loads((RAIZ / "data" / "muestras" / "series_reales.json").read_text(encoding="utf-8"))
JS = json.loads(subprocess.run(["node", str(RAIZ / "tests" / "paridad.js")], capture_output=True, text=True, check=True).stdout)


@pytest.mark.parametrize("serie", SERIES, ids=[s["id"] for s in SERIES])
def test_misma_tendencia(serie):
    py, js = analizar(serie["v"], serie["inicio"]), JS[serie["id"]]
    assert py.pendiente_decada == pytest.approx(js["pendiente_decada"], rel=1e-9)
    assert py.ic95_decada[0] == pytest.approx(js["ic"][0], rel=1e-4)
    assert py.ic95_decada[1] == pytest.approx(js["ic"][1], rel=1e-4)
    assert py.p_t == pytest.approx(js["p_t"], rel=1e-3, abs=1e-12)
    assert py.p_mk == pytest.approx(js["p_mk"], rel=1e-3, abs=1e-6)
    assert py.sen_decada == pytest.approx(js["sen_decada"], rel=1e-9)
    assert py.veredicto == js["veredicto"]
