"""
FastAPI backend — EnginePro Losas Web · CRÉER Ingeniería
Incluye: cálculo, exportación Word mejorada, registro de descargas con email
"""
import os
import re
import tempfile
import datetime
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field
from typing import List, Optional

from .motor import (
    calcular_losa, resultado_a_dict,
    MALLAS, GRAFILES, CASETONES, VERSION, EMPRESA,
    MotorEstructural, ResultadosLosa
)

app = FastAPI(title="EnginePro Losas · CRÉER Ingeniería", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

# ─── Email config — usar variables de entorno en producción ───
SMTP_HOST = os.getenv("SMTP_HOST", "mail.creeringenieria.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "info@creeringenieria.com")
SMTP_PASS = os.getenv("SMTP_PASS", "")          # Set in Render env vars
ADMIN_EMAIL = "info@creeringenieria.com"

# ─── Logger para emails ───
_log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
os.makedirs(_log_dir, exist_ok=True)
_email_logger = logging.getLogger("enginepro.email")
_email_logger.setLevel(logging.DEBUG)
_fh = logging.FileHandler(os.path.join(_log_dir, "email.log"), encoding="utf-8")
_fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
_email_logger.addHandler(_fh)

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


# ─── Models ───
class DatosEntrada(BaseModel):
    tipo_losa: str = "Maciza"
    luces: List[float] = Field(default=[4.0])
    h: float = 15.0
    fc: float = 21.0
    fy: float = 420.0
    cv: float = 180.0
    cm_adic: float = 150.0
    malla_sup: str = "M-084 (Ø4.0 c/15)"
    grafil_sup: str = "Sin Grafil"
    malla_inf: str = "M-131 (Ø5.0 c/15)"
    grafil_inf: str = "Sin Grafil"
    b_nervio: Optional[float] = 10.0
    s_nervio: Optional[float] = 70.0
    h_loseta: Optional[float] = 5.0
    nombre_caseton: Optional[str] = ""
    peso_caseton: Optional[float] = 0.5


class DatosProyecto(BaseModel):
    nombre: str = EMPRESA
    matricula: str = "Profesional Especializado"
    proyecto: str = "Proyecto Estructural"
    ubicacion: str = "Colombia"
    fecha: str = ""


class ExportRequest(BaseModel):
    entrada: DatosEntrada
    proyecto: DatosProyecto


class RegistroDescarga(BaseModel):
    nombre: str
    empresa: str
    correo: str
    pais: str = "Colombia"
    proyecto: str = ""
    matricula: str = ""
    entrada: DatosEntrada


# ─── Email helper ───
def _sanitize_html(s: str) -> str:
    """Escapa caracteres HTML para evitar inyecciones en el correo."""
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;"))


def enviar_email_registro(reg: RegistroDescarga):
    """Envía correo al admin con los datos del usuario que descargó."""
    # Validación estricta
    if not reg.nombre or not reg.nombre.strip():
        _email_logger.warning("Registro rechazado: nombre vacío")
        return
    if not reg.correo or not _EMAIL_RE.match(reg.correo.strip()):
        _email_logger.warning(f"Registro rechazado: correo inválido '{reg.correo}'")
        return
    if not reg.empresa or not reg.empresa.strip():
        _email_logger.warning("Registro rechazado: empresa vacía")
        return

    if not SMTP_PASS:
        _email_logger.warning(
            f"SMTP_PASS no configurado — registro NO enviado. "
            f"Datos: {reg.nombre} / {reg.correo} / {reg.empresa}"
        )
        return

    try:
        fecha_hora = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
        luces_str = " + ".join([f"{L:.2f}m" for L in reg.entrada.luces])

        # Sanitizar inputs contra inyección HTML
        s_nombre = _sanitize_html(reg.nombre.strip())
        s_empresa = _sanitize_html(reg.empresa.strip())
        s_correo = _sanitize_html(reg.correo.strip())
        s_pais = _sanitize_html(reg.pais.strip() if reg.pais else "—")
        s_proyecto = _sanitize_html(reg.proyecto.strip()) if reg.proyecto else "—"
        s_matricula = _sanitize_html(reg.matricula.strip()) if reg.matricula else "—"

        msg_admin = MIMEMultipart("alternative")
        msg_admin["From"] = SMTP_USER
        msg_admin["To"] = ADMIN_EMAIL
        msg_admin["Subject"] = f"[EnginePro] Nueva descarga — {s_nombre} · {fecha_hora}"

        html_admin = f"""
        <html><body style="font-family:Arial,sans-serif;background:#f4f4f8;padding:20px">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
            <div style="background:#1A1A2E;padding:20px 28px;border-bottom:4px solid #E03030">
                <h2 style="color:#fff;margin:0;font-size:1.2rem">EnginePro Losas — Nueva Descarga</h2>
                <p style="color:#8A90A8;margin:4px 0 0;font-size:0.85rem">{fecha_hora}</p>
            </div>
            <div style="padding:24px 28px">
                <table style="width:100%;border-collapse:collapse;font-size:0.92rem">
                    <tr><td style="color:#555;padding:6px 0;width:140px"><b>Nombre:</b></td><td style="color:#1A1A2E">{s_nombre}</td></tr>
                    <tr><td style="color:#555;padding:6px 0"><b>Empresa:</b></td><td style="color:#1A1A2E">{s_empresa}</td></tr>
                    <tr><td style="color:#555;padding:6px 0"><b>Correo:</b></td><td><a href="mailto:{reg.correo.strip()}" style="color:#E03030">{s_correo}</a></td></tr>
                    <tr><td style="color:#555;padding:6px 0"><b>Pais:</b></td><td style="color:#1A1A2E">{s_pais}</td></tr>
                    <tr><td style="color:#555;padding:6px 0"><b>Proyecto:</b></td><td style="color:#1A1A2E">{s_proyecto}</td></tr>
                    <tr><td style="color:#555;padding:6px 0"><b>Matricula:</b></td><td style="color:#1A1A2E">{s_matricula}</td></tr>
                </table>
                <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
                <h3 style="color:#1A1A2E;font-size:0.95rem;margin:0 0 10px">Parametros calculados</h3>
                <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
                    <tr><td style="color:#555;padding:4px 0;width:140px">Luces:</td><td style="font-family:monospace">{luces_str}</td></tr>
                    <tr><td style="color:#555;padding:4px 0">h / f'c / fy:</td><td style="font-family:monospace">{reg.entrada.h} cm / {reg.entrada.fc} MPa / {reg.entrada.fy} MPa</td></tr>
                    <tr><td style="color:#555;padding:4px 0">CV / CM adic:</td><td style="font-family:monospace">{reg.entrada.cv} / {reg.entrada.cm_adic} kgf/m2</td></tr>
                    <tr><td style="color:#555;padding:4px 0">Malla inf / sup:</td><td style="font-family:monospace">{_sanitize_html(reg.entrada.malla_inf)} / {_sanitize_html(reg.entrada.malla_sup)}</td></tr>
                </table>
            </div>
            <div style="background:#f8f9fc;padding:12px 28px;font-size:0.78rem;color:#999">
                EnginePro Losas v{VERSION} — CREER Ingenieria — creeringenieria.com
            </div>
        </div>
        </body></html>
        """
        msg_admin.attach(MIMEText(html_admin, "html"))

        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_USER, ADMIN_EMAIL, msg_admin.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_USER, ADMIN_EMAIL, msg_admin.as_string())

        _email_logger.info(f"OK — {reg.correo.strip()} — {s_nombre} — {s_empresa}")
    except smtplib.SMTPAuthenticationError as e:
        _email_logger.error(f"SMTP AUTH FAILED: {e.smtp_code} {e.smtp_error} — host={SMTP_HOST}:{SMTP_PORT}")
    except smtplib.SMTPConnectError as e:
        _email_logger.error(f"SMTP CONNECT FAILED: {e} — host={SMTP_HOST}:{SMTP_PORT}")
    except smtplib.SMTPException as e:
        _email_logger.error(f"SMTP ERROR: {type(e).__name__}: {e}")
    except Exception as e:
        _email_logger.error(f"UNEXPECTED ERROR: {type(e).__name__}: {e}")


# ─── Catálogos ───
@app.get("/api/catalogos")
def get_catalogos():
    return {
        "mallas": list(MALLAS.keys()),
        "grafiles": list(GRAFILES.keys()),
        "version": VERSION,
        "empresa": EMPRESA,
    }


# ─── Cálculo ───
@app.post("/api/calcular")
def api_calcular(datos: DatosEntrada):
    try:
        # Force Maciza
        entrada = datos.model_dump()
        entrada["tipo_losa"] = "Maciza"
        R = calcular_losa(entrada)
        return resultado_a_dict(R)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Registro descarga + email ───
@app.post("/api/registrar_descarga")
async def api_registrar(reg: RegistroDescarga, background: BackgroundTasks):
    """Registra la descarga y envía email al admin en background."""
    try:
        background.add_task(enviar_email_registro, reg)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Exportar Word ───
@app.post("/api/exportar_word")
def api_exportar_word(req: ExportRequest, background: BackgroundTasks):
    try:
        from .exportar_word import MemoriaWord
        entrada = req.entrada.model_dump()
        entrada["tipo_losa"] = "Maciza"
        R = calcular_losa(entrada)
        proy = req.proyecto.model_dump()
        if not proy.get("fecha"):
            proy["fecha"] = datetime.date.today().strftime("%d/%m/%Y")

        tmpfile = tempfile.NamedTemporaryFile(suffix=".docx", delete=False, prefix="EnginePro_")
        tmpfile.close()

        gen = MemoriaWord()
        gen.generar(R, tmpfile.name, proy)

        # Limpiar archivo temporal después de enviar la respuesta
        def _cleanup(path):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
        background.add_task(_cleanup, tmpfile.name)

        return FileResponse(
            tmpfile.name,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"Memoria_Losa_CREER_{datetime.date.today().strftime('%Y%m%d')}.docx",
        )
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─── Frontend (condicional — en Render el frontend va en cPanel) ───
_css_dir = os.path.join(FRONTEND_DIR, "css")
_js_dir = os.path.join(FRONTEND_DIR, "js")
if os.path.isdir(_css_dir):
    app.mount("/css", StaticFiles(directory=_css_dir), name="css")
if os.path.isdir(_js_dir):
    app.mount("/js", StaticFiles(directory=_js_dir), name="js")


def _find_logo():
    """Busca el logo en todas las ubicaciones posibles (V2 o V3)."""
    names = ["logo_creer_V3.png", "logo_creer_V2.png", "logo-creer-v2.png"]
    dirs = [
        FRONTEND_DIR,
        os.path.join(FRONTEND_DIR, "images"),
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    ]
    for d in dirs:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return p
    return None


@app.get("/images/logo-creer-v2.png")
@app.get("/logo_creer_V2.png")
@app.get("/logo_creer_V3.png")
def get_logo():
    p = _find_logo()
    if p:
        return FileResponse(p, media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo not found")


@app.get("/robots.txt")
def robots_txt():
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "Allow: /css/\n"
        "Allow: /js/\n"
        "Allow: /images/\n"
        "Disallow: /api/\n"
        f"Sitemap: https://creeringenieria.com/sitemap.xml\n"
    )
    return HTMLResponse(content=content, media_type="text/plain")


@app.get("/sitemap.xml")
def sitemap_xml():
    today = datetime.date.today().strftime("%Y-%m-%d")
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://creeringenieria.com/herramientas/losas/</loc>
    <lastmod>{today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>"""
    return HTMLResponse(content=xml, media_type="application/xml")


@app.get("/")
def index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"app": "EnginePro Losas API", "version": VERSION, "empresa": EMPRESA,
            "status": "ok", "docs": "/docs"}
