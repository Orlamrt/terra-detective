"""Arma web/index.html (globo) desde la plantilla y asegura que todas las páginas de web/
tengan documento HTML completo con codificación UTF-8 (necesario fuera de claude.ai, p. ej. GitHub Pages).

Uso: python web/construir.py
"""
import pathlib

W = pathlib.Path(__file__).resolve().parent
RAIZ = W.parent
CABECERA = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n')
PIE = "\n</body>\n</html>\n"


def documento(cuerpo: str) -> str:
    return cuerpo if cuerpo.lstrip().lower().startswith("<!doctype") else CABECERA + cuerpo + PIE


def construir_globo():
    t = (W / "plantillas" / "mundo_plantilla.html").read_text(encoding="utf-8")
    t = t.replace("/*STATS*/", (W / "src" / "stats.js").read_text(encoding="utf-8").replace("if (typeof module", "if (false && typeof module"))
    t = t.replace("/*LAND*/", (W / "src" / "land-110m.json").read_text(encoding="utf-8"))
    t = t.replace("/*DATOS*/", (RAIZ / "data" / "muestras" / "series_reales.json").read_text(encoding="utf-8"))
    (W / "index.html").write_text(documento(t), encoding="utf-8")


if __name__ == "__main__":
    construir_globo()
    for p in (W / "prototipos").glob("*.html"):
        p.write_text(documento(p.read_text(encoding="utf-8")), encoding="utf-8")
    print("listo:", ", ".join(str(p.relative_to(W)) for p in [W / "index.html", *sorted((W / "prototipos").glob("*.html"))]))
