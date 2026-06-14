# EnginePro Losas v11 "HYPERION" — CRÉER Ingeniería
## Cómo correrla en tu PC y cómo desplegarla

---

## ▶ CORRER LOCALMENTE (lo más fácil — antes de subirla)

**Doble clic en `start.bat`.**

La primera vez crea el entorno e instala dependencias (1–2 min). Las siguientes
veces arranca al instante. Abre solo el navegador en `http://localhost:8000`.
Para detener: cierra la ventana negra (o Ctrl+C).

> Requiere Python 3.10+ (tienes 3.12). El `.bat` lo busca automáticamente.

Alternativa por consola (si prefieres):
```bat
cd C:\Users\jogyA\Downloads\web_app
backend\.venv\Scripts\python -m uvicorn backend.main:app --app-dir . --port 8000
```

---

## ESTRUCTURA

```
web_app/
├── backend/
│   ├── main.py          ← API FastAPI (cálculo, optimizar, catálogos, registro email)
│   ├── motor.py         ← Motor de cálculo NSR-10 (intacto, verificado)
│   └── optimizador.py   ← Barrido de costo mínimo
├── frontend/
│   ├── index.html       ← App (tema HYPERION, SEO completo, footer)
│   ├── css/style.css    ← Tema HYPERION (vidrio sobre cosmos, acento cyan)
│   └── js/
│       ├── app.js       ← Visor 3D (Three r146 + OrbitControls) + Plotly + flujo
│       └── memoria.js   ← Memoria 100% en el navegador: preview HTML + Word .docx
├── requirements.txt     ← fastapi, uvicorn, numpy, resend (ligero)
├── render.yaml
├── run_web.py
└── start.bat            ← arranque local en 1 clic
```

> La memoria (Word) se genera **en el navegador** con la librería `docx` — el backend
> ya **no usa matplotlib ni python-docx**, así que el deploy es mucho más liviano.

---

## DESPLIEGUE EN RENDER.COM (gratis)

1. Sube el **contenido de `web_app/`** a GitHub (que `backend/`, `frontend/`,
   `requirements.txt` queden en la **raíz** del repo).
2. Render → New Web Service → conecta el repo:
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free
3. Environment Variables: `RESEND_API_KEY = <tu key de resend.com>`
   (solo para el correo de registro; si no la pones, la app funciona igual, solo
   no envía el aviso de descarga).
4. Deploy → URL tipo `https://enginepro-losas-creer.onrender.com`.

> El free tier "duerme" tras 15 min sin tráfico → usa UptimeRobot pinggeando
> `https://TU-URL.onrender.com/health` cada 10 min.

### Frontend en cPanel (si lo sirves desde creeringenieria.com)
Sube `index.html`, `css/style.css`, `js/app.js`, `js/memoria.js` a
`public_html/herramientas/losas/`. En `index.html`, `window.API_BASE_URL` ya
apunta al backend de Render en producción (ajústalo si tu URL cambia).

---

## QUÉ CAMBIÓ EN v11 (HYPERION)

- **Tema HYPERION** igual a DESPIECE Studio: cosmos vivo de fondo, vidrio, acento cyan.
- **Visor 3D** con `OrbitControls`: **auto-giro** (se detiene al tocar), **suelo circular**
  con anillo cyan (adiós al cuadrado), más grande, conserva los reflejos/ACES y los mapas de calor.
- **Memoria nueva** estilo CRÉER (navy/teal): primero pide los datos, luego abre una
  **previsualización HTML** y desde ahí descargas el **Word (.docx)** cuando quieras.
- **Word: tablas a ancho completo** = ancho del texto justificado (FIX del problema de
  despiece donde las tablas salían más angostas que el texto).
- La memoria incluye **imágenes del visor 3D** (momento, cortante, deflexión), los
  diagramas, la sección y el **paso a paso** de cada verificación.
- Backend **más liviano**: se quitó matplotlib / python-docx / Pillow.

---

## CONTACTO
info@creeringenieria.com · +57 301 699 3350 — CRÉER Ingeniería
