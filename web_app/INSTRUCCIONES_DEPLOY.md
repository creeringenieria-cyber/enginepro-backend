# EnginePro Losas v10.2 — CRÉER Ingeniería
## Guía de despliegue completa (corregida)

---

## ESTRUCTURA DE ARCHIVOS

```
web_app/
├── backend/
│   ├── __init__.py
│   ├── main.py          ← API FastAPI + email + robots.txt + sitemap.xml
│   ├── motor.py         ← Motor de cálculo NSR-10 (v10.2 corregido)
│   └── exportar_word.py ← Memoria Word mejorada
├── frontend/
│   ├── index.html       ← App web (SEO completo, H1, FAQPage, footer)
│   ├── logo_creer_V3.png
│   ├── css/style.css    ← Diseño 2026 + footer styles
│   └── js/app.js        ← Three.js 3D + Plotly (cortante ±φVc corregido)
├── cpanel_seo/
│   ├── robots.txt                ← SUBIR a public_html/ (raíz)
│   └── sitemap_herramientas.xml  ← SUBIR a public_html/ (raíz)
├── requirements.txt     ← (scipy eliminado — ahorra 80MB en Render)
├── render.yaml
└── run_web.py
```

⚠️ La carpeta `__pycache__/` NO se necesita. Python la genera automáticamente al ejecutar.

---

## PASO 1 — BACKEND EN RENDER.COM (gratis)

1. Sube la carpeta `web_app/` a GitHub/GitLab (sin `cpanel_seo/`)
2. En Render → "New Web Service" → conecta tu repo
3. Configuración:
   - **Runtime:** Python 3
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `uvicorn web_app.backend.main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free (512 MB RAM)
4. En "Environment Variables":
   ```
   SMTP_HOST = mail.creeringenieria.com
   SMTP_PORT = 587
   SMTP_USER = info@creeringenieria.com
   SMTP_PASS = [tu contraseña de correo]
   ```
5. Deploy → te da URL tipo `https://enginepro-losas-creer.onrender.com`

⚠️ El free tier "duerme" tras 15min sin tráfico → usa UptimeRobot (gratis) para ping cada 10min.

---

## PASO 2 — FRONTEND EN cPANEL (creeringenieria.com)

### 2.1 — Subir archivos del frontend

En cPanel → File Manager → `public_html/herramientas/losas/`:

```
public_html/herramientas/losas/
├── index.html
├── logo_creer_V3.png
├── css/
│   └── style.css
└── js/
    └── app.js
```

### 2.2 — SUBIR archivos SEO a la RAÍZ del sitio

Estos van en `public_html/` (la raíz de creeringenieria.com):

```
public_html/
├── robots.txt                  ← ver nota abajo
└── sitemap_herramientas.xml    ← sitemap de herramientas
```

**IMPORTANTE sobre robots.txt:**
- Si YA tienes un `robots.txt`, NO lo reemplaces
- Solo AGREGA esta línea al final de tu robots.txt existente:
  ```
  Sitemap: https://creeringenieria.com/sitemap_herramientas.xml
  ```
- Si NO tienes robots.txt, sube el que está en `cpanel_seo/robots.txt`

**IMPORTANTE sobre sitemap:**
- Si ya tienes un `sitemap.xml` principal, agrega este bloque dentro del `<urlset>`:
  ```xml
  <url>
    <loc>https://creeringenieria.com/herramientas/losas/</loc>
    <lastmod>2026-03-29</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  ```
- O sube `sitemap_herramientas.xml` como sitemap independiente

### 2.3 — Verificar la URL del backend

En `index.html` ya está configurado:
```html
<script>
  window.API_BASE_URL = 'https://enginepro-backend.onrender.com';
</script>
```
Cámbiala por tu URL real de Render si es diferente.

---

## PASO 3 — GOOGLE SEARCH CONSOLE (para que Google te ame)

1. Ve a https://search.google.com/search-console
2. Selecciona tu propiedad `creeringenieria.com`
3. **Sitemaps** → Agrega: `sitemap_herramientas.xml` → Enviar
4. **Inspección de URLs** → Pega `https://creeringenieria.com/herramientas/losas/`
   → "Solicitar indexación"
5. Espera 2-7 días para que Google indexe con los rich snippets (FAQ)

### Lo que Google ahora ve en tu herramienta:
- ✅ Schema SoftwareApplication (tipo: app de ingeniería, precio: gratis)
- ✅ Schema BreadcrumbList (Inicio > Herramientas > Losas)
- ✅ Schema FAQPage (4 preguntas → desplegables en Google)
- ✅ H1 con keywords: "Calculadora de Losas Macizas NSR-10"
- ✅ Footer E-E-A-T con COPNIA, teléfono, ciudades, email
- ✅ hreflang es-CO, geo.region CO-ANT
- ✅ Canonical URL correcta
- ✅ Open Graph + Twitter Cards

---

## PASO 4 — CORREO SMTP

1. En cPanel → Email Accounts → verifica que `info@creeringenieria.com` existe
2. Pon la contraseña en Render → Environment Variables → `SMTP_PASS`
3. Cada descarga te envía un correo HTML con datos del usuario

---

## PASO 5 — PROBAR LOCALMENTE (opcional)

```bash
cd /ruta/a/tu/proyecto
pip install -r requirements.txt
python run_web.py
# Abre: http://localhost:8000
```

---

## CHANGELOG v10.2 (corregida)

### Motor de cálculo (motor.py)
- VERSION sincronizada a "10.2"
- Constante g corregida: 0.009807 (antes 0.00981)
- Fisuración dc = recubrimiento + db/2 (antes dc=30mm hardcoded)

### Frontend (app.js)
- Gráfica cortante: ±φVc como trazas reales (antes shapes invisibles)
- Código duplicado renderSectionSVG eliminado

### Backend (main.py)
- Logo inteligente: busca V2 o V3 en múltiples rutas
- robots.txt y sitemap.xml como endpoints (para Render)

### SEO (index.html + style.css)
- H1 semántico con keywords
- FAQPage schema (4 preguntas → rich snippets)
- Footer E-E-A-T (empresa, COPNIA, contacto)
- noscript fallback
- theme-color, hreflang es-CO
- Scripts Plotly/Three.js con defer (mejora velocidad)
- Email consent reparado (sin Cloudflare obfuscation)
- preconnect a fonts.gstatic.com

### Otros
- scipy eliminado de requirements.txt (-80MB build)

---

## CONTACTO TÉCNICO

info@creeringenieria.com · +57 301 699 3350
EnginePro Losas v10.2 — CRÉER Ingeniería
