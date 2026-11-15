"""Asegura que las páginas de web/prototipos/ tengan documento HTML completo con UTF-8
(necesario fuera de claude.ai, p. ej. GitHub Pages). El globo (web/index.html + web/src/globo.js)
se edita directamente: ya no se genera desde una plantilla.

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


if __name__ == "__main__":
    for p in (W / "prototipos").glob("*.html"):
        p.write_text(documento(p.read_text(encoding="utf-8")), encoding="utf-8", newline="\n")
    print("listo:", ", ".join(str(p.relative_to(W)) for p in sorted((W / "prototipos").glob("*.html"))))
