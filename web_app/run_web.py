"""Arranca el servidor localmente para pruebas (alternativa a start.bat).

Ejecútalo desde la carpeta web_app:  python run_web.py
"""
import os
import sys
import uvicorn

# Hace importable el paquete `backend` sin importar desde dónde se invoque.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
