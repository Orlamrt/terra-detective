"""Las pruebas de la tarjeta y la animación (tests/tarjeta/*.test.js) corren con Node desde pytest.

Así el CI, que ya corre `python -m pytest tests/ -q`, también las corre sin tocar los workflows.

Uso: python -m pytest tests/  (requiere Node.js en el PATH)
     node --test tests/tarjeta/*.test.js  (directo, sin pytest)
"""
import pathlib
import shutil
import subprocess

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ARCHIVOS = sorted((RAIZ / "tests" / "tarjeta").glob("*.test.js"))


def test_hay_pruebas_de_la_tarjeta():
    assert ARCHIVOS, "no se encontraron archivos tests/tarjeta/*.test.js"


def test_pruebas_node_de_la_tarjeta():
    # Sin Node la prueba falla (no se salta en silencio), igual que test_paridad.py.
    assert shutil.which("node"), "se necesita Node.js en el PATH para correr tests/tarjeta/*.test.js"
    # Se pasan los archivos uno por uno (no la carpeta), como en el CI.
    r = subprocess.run(["node", "--test", *map(str, ARCHIVOS)], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, f"fallaron las pruebas de Node:\n{r.stdout}\n{r.stderr}"
