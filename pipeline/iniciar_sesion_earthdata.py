"""Guarda tu sesión de NASA Earthdata (una sola vez) para que pipeline/descargar.py pueda bajar datos.

Uso (en una terminal normal, NO dentro del chat):
    python pipeline/iniciar_sesion_earthdata.py
Tu usuario y contraseña quedan en ~/.netrc (texto plano; nunca se sube a git).
"""
import getpass
import sys

print("=" * 60)
print(" Inicio de sesion NASA Earthdata  ·  Terra Detective")
print("=" * 60)
print(f"Python: {sys.executable}")
try:
    import earthaccess
except ImportError:
    print("\nERROR: falta la libreria earthaccess en este Python.")
    print("Instalala con:  python -m pip install earthaccess")
    input("\nPresiona Enter para cerrar...")
    sys.exit(1)

import os
usuario = input("\nUsuario de Earthdata: ").strip()
clave = getpass.getpass("Contrasena (no se ve al escribir): ")
os.environ["EARTHDATA_USERNAME"] = usuario
os.environ["EARTHDATA_PASSWORD"] = clave
try:
    auth = earthaccess.login(strategy="environment")
    ok = bool(auth and auth.authenticated)
except Exception as e:  # noqa: BLE001
    ok = False
    print(f"\nERROR al conectar con la NASA: {type(e).__name__}: {e}")
finally:
    os.environ.pop("EARTHDATA_PASSWORD", None)

if ok:
    # Guardar la sesión: Windows usa _netrc, Linux/Mac .netrc; se escriben ambos en tu carpeta de usuario.
    from pathlib import Path
    linea = f"machine urs.earthdata.nasa.gov login {usuario} password {clave}\n"
    for nombre in ("_netrc", ".netrc"):
        ruta = Path.home() / nombre
        ruta.write_text(linea, encoding="utf-8")
        try:
            ruta.chmod(0o600)
        except OSError:
            pass
        print(f"Sesion guardada en {ruta}")
clave = None

print("\n>>> SESION GUARDADA <<<" if ok else "\n>>> NO SE PUDO INICIAR SESION: revisa usuario/contrasena <<<")
input("\nPresiona Enter para cerrar...")
