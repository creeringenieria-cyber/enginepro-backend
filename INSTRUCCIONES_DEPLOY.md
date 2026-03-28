# EnginePro Losas — CRÉER Ingeniería
## Guía de despliegue completa

---

## ESTRUCTURA DE ARCHIVOS

```
web_app/
├── backend/
│   ├── __init__.py
│   ├── main.py          ← API FastAPI + endpoint email
│   ├── motor.py         ← Motor de cálculo NSR-10 (no tocar)
│   └── exportar_word.py ← Memoria Word mejorada
├── frontend/
│   ├── index.html       ← App web
│   ├── logo_creer_V3.png
│   ├── css/style.css    ← Diseño 2026
│   └── js/app.js        ← Three.js 3D + Plotly premium
├── requirements.txt
├── render.yaml
└── run_web.py
```

---

## PASO 1 — SUBIR EL BACKEND A RENDER.COM (gratis)

Render.com aloja tu API Python gratis con SSL incluido.

1. Ve a https://render.com y crea cuenta (gratis)
2. Sube tu carpeta `web_app/` a un repositorio en GitHub/GitLab
   - Asegúrate de incluir todos los archivos
3. En Render → "New Web Service" → conecta tu repo
4. Configuración:
   - **Runtime:** Python 3
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `uvicorn web_app.backend.main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free (512 MB RAM — suficiente)
5. En "Environment Variables" agrega:
   ```
   SMTP_HOST = mail.creeringenieria.com
   SMTP_PORT = 587
   SMTP_USER = info@creeringenieria.com
   SMTP_PASS = [tu contraseña de correo]
   ```
6. Deploy → Render te da una URL tipo:
   `https://enginepro-losas-creer.onrender.com`
   **Guarda esta URL.**

⚠️ El plan free "duerme" después de 15min sin tráfico.
   Para evitarlo, usa UptimeRobot (gratis) que hace ping cada 10min.

---

## PASO 2 — CONFIGURAR TU cPANEL (creeringenieria.com)

Tu sitio web va en cPanel. El frontend (HTML/CSS/JS) va ahí,
y llama al backend en Render mediante la variable API_BASE_URL.

### 2.1 — Subir archivos del frontend

1. Entra a cPanel → File Manager
2. Ve a `public_html/` (o la carpeta de tu subdominio)
3. **Opción A — En la raíz del sitio:**
   Sube los archivos de `frontend/` directamente en `public_html/`
   
4. **Opción B — En una subcarpeta (recomendado):**
   Crea `public_html/losas/` y sube ahí los archivos de `frontend/`
   Acceso: `https://creeringenieria.com/losas/`

5. Estructura final en cPanel:
   ```
   public_html/losas/
   ├── index.html
   ├── logo_creer_V3.png
   ├── css/
   │   └── style.css
   └── js/
       └── app.js
   ```

### 2.2 — Conectar frontend con backend de Render

Abre `js/app.js` y en la primera línea cambia:
```javascript
const API_BASE = window.API_BASE_URL || '';
```

En tu `index.html`, ANTES de `<script src="js/app.js"></script>` agrega:
```html
<script>
  window.API_BASE_URL = 'https://TU-APP.onrender.com';
</script>
```

Reemplaza `TU-APP.onrender.com` con la URL real de Render.

### 2.3 — Configurar CORS (si hay problemas)

Si el browser bloquea las peticiones, en cPanel → `.htaccess` agrega:
```apache
Header always set Access-Control-Allow-Origin "*"
Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
Header always set Access-Control-Allow-Headers "Content-Type"
```

---

## PASO 3 — CONFIGURAR EL CORREO SMTP

Para que te lleguen los datos de quien descarga:

1. En cPanel → Email Accounts → verifica que `info@creeringenieria.com` existe
2. En cPanel → Email → Configure Mail Client → anota:
   - SMTP Host (ej: `mail.creeringenieria.com`)
   - SMTP Port: `587` (STARTTLS) o `465` (SSL)
3. Pon esa contraseña en Render → Environment Variables → `SMTP_PASS`

Cada vez que alguien descargue la memoria, recibirás un correo HTML
con todos sus datos: nombre, empresa, correo, país, proyecto y los
parámetros que calculó.

---

## PASO 4 — PROBAR LOCALMENTE (opcional)

```bash
cd /ruta/a/tu/proyecto
pip install -r requirements.txt
python run_web.py
# Abre: http://localhost:8000
```

---

## RESUMEN RÁPIDO

| Qué | Dónde | Costo |
|-----|-------|-------|
| Backend Python (API) | Render.com | Gratis |
| Frontend (HTML/CSS/JS) | cPanel creeringenieria.com | Ya tienes hosting |
| Dominio | creeringenieria.com | Ya tienes |
| Correos | cPanel email | Ya tienes |
| SSL | Render (automático) + tu cPanel | Incluido |

**Tiempo estimado de configuración: 30-45 minutos**

---

## CONTACTO TÉCNICO

Para soporte: info@creeringenieria.com
Herramienta: EnginePro Losas v10.1 — CRÉER Ingeniería
