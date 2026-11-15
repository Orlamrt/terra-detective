"""Las pruebas del Detective (tests/detective.js) corren con Node desde pytest, como las de la tarjeta.

Uso: python -m pytest tests/   (requiere Node.js en el PATH)
     node --test tests/detective.js
"""
import pathlib
import shutil
import subprocess

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def test_pruebas_node_del_detective():
    assert shutil.which("node"), "se necesita Node.js en el PATH para correr tests/detective.js"
    r = subprocess.run(["node", "--test", str(RAIZ / "tests" / "detective.js")], cwd=RAIZ,
                       capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, f"fallaron las pruebas del Detective:\n{r.stdout}\n{r.stderr}"
