"""
Motor de cálculo estructural — extraído íntegro de LosaCreer_v10.py
Toda la lógica de MotorEstructural, ResultadosLosa y calcular_losa()
permanece IDÉNTICA al original.
"""

import math
import numpy as np

VERSION = "10.2"
EMPRESA = "CRÉER Ingeniería"

# Constante gravitacional exacta (kgf/m² → kN/m)
G_KGF_TO_KN = 0.009807

# Mallas electrosoldadas comerciales Colombia (As en cm²/m)
def _as_barra(db_mm, sep_cm):
    """As en cm²/m para barra de diámetro db_mm @ sep_cm cm."""
    area = math.pi * (db_mm / 20.0) ** 2   # cm²
    return area / (sep_cm / 100.0)          # cm²/m

# Diámetros barras individuales (mm)
_BARRAS = {
    "#3": 9.525, "#4": 12.70, "#5": 15.875,
    "#6": 19.05, "#7": 22.225, "#8": 25.40,
}

def _build_barra_key(num, sep_cm):
    db = _BARRAS[num]
    As = _as_barra(db, sep_cm)
    return f"{num} (Ø{db:.2f}mm) c/{sep_cm}cm", {"As": round(As, 3), "diametro": db, "sep": sep_cm}

# Mallas electrosoldadas Colombia
MALLAS = {
    "M-084 (Ø4.0 c/15)": {"As": 0.84, "diametro": 4.0, "sep": 15},
    "M-106 (Ø4.5 c/15)": {"As": 1.06, "diametro": 4.5, "sep": 15},
    "M-131 (Ø5.0 c/15)": {"As": 1.31, "diametro": 5.0, "sep": 15},
    "M-158 (Ø5.5 c/15)": {"As": 1.58, "diametro": 5.5, "sep": 15},
    "M-188 (Ø6.0 c/15)": {"As": 1.88, "diametro": 6.0, "sep": 15},
    "M-221 (Ø6.5 c/15)": {"As": 2.21, "diametro": 6.5, "sep": 15},
    "M-257 (Ø7.0 c/15)": {"As": 2.57, "diametro": 7.0, "sep": 15},
    "M-295 (Ø7.5 c/15)": {"As": 2.95, "diametro": 7.5, "sep": 15},
    "M-335 (Ø8.0 c/15)": {"As": 3.35, "diametro": 8.0, "sep": 15},
    # Barras individuales — separaciones comunes
    **{k: v for num in _BARRAS for sep in [10,13,15,20,25] for k, v in [_build_barra_key(num, sep)]},
}

# Grafiles de refuerzo adicional
GRAFILES = {
    "Sin Grafil": {"As": 0.00, "diametro": 0, "sep": 0},
    "Grafil Ø4.0 c/15 (0.84)": {"As": 0.84, "diametro": 4.0, "sep": 15},
    "Grafil Ø4.5 c/15 (1.06)": {"As": 1.06, "diametro": 4.5, "sep": 15},
    "Grafil Ø5.0 c/15 (1.31)": {"As": 1.31, "diametro": 5.0, "sep": 15},
    "Grafil Ø5.5 c/15 (1.58)": {"As": 1.58, "diametro": 5.5, "sep": 15},
    "Grafil Ø6.0 c/15 (1.88)": {"As": 1.88, "diametro": 6.0, "sep": 15},
    "Grafil Ø6.5 c/15 (2.21)": {"As": 2.21, "diametro": 6.5, "sep": 15},
    "Grafil Ø7.0 c/15 (2.57)": {"As": 2.57, "diametro": 7.0, "sep": 15},
    # Barras individuales como grafil
    **{k: v for num in _BARRAS for sep in [10,13,15,20,25] for k, v in [_build_barra_key(num, sep)]},
}

# Casetones comerciales Colombia
CASETONES = {
    "Icopor 20×60×60 (h_cas=15)": {"h_cas": 15, "b_cas": 60, "l_cas": 60, "peso": 0.3},
    "Icopor 25×60×60 (h_cas=20)": {"h_cas": 20, "b_cas": 60, "l_cas": 60, "peso": 0.4},
    "Icopor 30×60×60 (h_cas=25)": {"h_cas": 25, "b_cas": 60, "l_cas": 60, "peso": 0.5},
    "Icopor 35×60×60 (h_cas=30)": {"h_cas": 30, "b_cas": 60, "l_cas": 60, "peso": 0.6},
    "Icopor 40×60×60 (h_cas=35)": {"h_cas": 35, "b_cas": 60, "l_cas": 60, "peso": 0.7},
    "Plástico 25×60×60 (h_cas=20)": {"h_cas": 20, "b_cas": 60, "l_cas": 60, "peso": 1.5},
    "Plástico 30×60×60 (h_cas=25)": {"h_cas": 25, "b_cas": 60, "l_cas": 60, "peso": 1.8},
    "Personalizado": {"h_cas": 0, "b_cas": 0, "l_cas": 0, "peso": 0},
}


class MotorEstructural:
    """
    Motor de análisis y diseño de losas en 1 dirección.
    Implementa el método de los tres momentos con envolventes
    de carga alternada según NSR-10 C.8.11.2.
    """

    @staticmethod
    def beta1(fc_mpa):
        if fc_mpa <= 28:
            return 0.85
        elif fc_mpa <= 55:
            return max(0.65, 0.85 - 0.05 * (fc_mpa - 28) / 7)
        else:
            return 0.65

    @staticmethod
    def as_min_losa(fy, b_cm, h_cm):
        if fy <= 420:
            return 0.0018 * b_cm * h_cm
        else:
            val1 = 0.0018 * (420.0 / fy) * b_cm * h_cm
            val2 = 0.0014 * b_cm * h_cm
            return max(val1, val2)

    @staticmethod
    def as_min_flexion(fc_mpa, fy_mpa, b_cm, d_cm):
        bw_mm = b_cm * 10
        d_mm = d_cm * 10
        val1 = (0.25 * math.sqrt(fc_mpa) / fy_mpa) * bw_mm * d_mm / 100
        val2 = (1.4 / fy_mpa) * bw_mm * d_mm / 100
        return max(val1, val2)

    @staticmethod
    def espesor_minimo(L_list_m, fy_mpa):
        factor_fy = 0.4 + fy_mpa / 700.0
        n = len(L_list_m)
        h_mins = []
        for i, L in enumerate(L_list_m):
            L_cm = L * 100
            if n == 1:
                h_min = L_cm / 20.0 * factor_fy
            elif i == 0 or i == n - 1:
                h_min = L_cm / 24.0 * factor_fy
            else:
                h_min = L_cm / 28.0 * factor_fy
            h_mins.append(h_min)
        return h_mins, max(h_mins)

    @staticmethod
    def verificar_fisuracion(fs_mpa, dc_mm, A_mm2):
        z = fs_mpa * (dc_mm * A_mm2) ** (1.0 / 3.0)
        z_perm_int = 31000.0
        z_perm_ext = 25000.0
        return z, z_perm_int, z_perm_ext, z <= z_perm_int, z <= z_perm_ext

    @staticmethod
    def esfuerzo_servicio(Ms_knm, As_cm2, d_cm, fc_mpa):
        if As_cm2 <= 0 or d_cm <= 0:
            return 0
        n_mod = 200000.0 / (4700.0 * math.sqrt(fc_mpa))
        b_mm = 1000.0
        As_mm2 = As_cm2 * 100.0
        d_mm = d_cm * 10.0
        a_c = b_mm / 2.0
        b_c = n_mod * As_mm2
        c_c = -n_mod * As_mm2 * d_mm
        disc = b_c**2 - 4 * a_c * c_c
        c_na = (-b_c + math.sqrt(max(0, disc))) / (2 * a_c)
        jd = d_mm - c_na / 3.0
        if jd <= 0:
            return 0
        Ms_Nmm = abs(Ms_knm) * 1e6
        fs = Ms_Nmm / (As_mm2 * jd)
        return fs

    @staticmethod
    def verificar_longitud_desarrollo(fc_mpa, fy_mpa, db_mm, recubrimiento_mm, es_superior=False):
        sqrt_fc = math.sqrt(fc_mpa)
        if db_mm <= 19:
            if es_superior:
                Ld = (fy_mpa * db_mm) / (1.7 * sqrt_fc)
            else:
                Ld = (fy_mpa * db_mm) / (2.1 * sqrt_fc)
        else:
            if es_superior:
                Ld = (fy_mpa * db_mm) / (1.4 * sqrt_fc)
            else:
                Ld = (fy_mpa * db_mm) / (1.7 * sqrt_fc)
        return max(Ld, 300.0)

    @staticmethod
    def verificar_geometria_aligerada(b_nervio_cm, s_nervio_cm, h_loseta_cm, h_total_cm):
        checks = {}
        b_cas_cm = s_nervio_cm - b_nervio_cm
        checks["bn >= 10 cm (C.8.13.2)"] = {
            "valor": f"{b_nervio_cm:.1f} cm", "limite": "10 cm",
            "cumple": b_nervio_cm >= 10.0
        }
        h_nervio = h_total_cm - h_loseta_cm
        checks["h_nervio <= 3.5*bn (C.8.13.3)"] = {
            "valor": f"{h_nervio:.1f} cm", "limite": f"{3.5 * b_nervio_cm:.1f} cm",
            "cumple": h_nervio <= 3.5 * b_nervio_cm
        }
        checks["Claro libre <= 75 cm (C.8.13.4)"] = {
            "valor": f"{b_cas_cm:.1f} cm", "limite": "75 cm",
            "cumple": b_cas_cm <= 75.0
        }
        e_min_1 = b_cas_cm / 12.0
        e_min_2 = 4.0
        e_min = max(e_min_1, e_min_2)
        checks[f"Loseta >= max(L_libre/12, 4cm) (C.8.13.5)"] = {
            "valor": f"{h_loseta_cm:.1f} cm",
            "limite": f"{e_min:.1f} cm",
            "cumple": h_loseta_cm >= e_min
        }
        return checks

    @staticmethod
    def ie_promediada(Ie_extremo1, Ie_centro, Ie_extremo2, n_vanos, idx_vano):
        if n_vanos == 1:
            return Ie_centro
        elif idx_vano == 0:
            return 0.85 * Ie_centro + 0.15 * Ie_extremo2
        elif idx_vano == n_vanos - 1:
            return 0.85 * Ie_centro + 0.15 * Ie_extremo1
        else:
            return 0.70 * Ie_centro + 0.15 * (Ie_extremo1 + Ie_extremo2)

    @staticmethod
    def resolver_tres_momentos(L_list, w_list):
        n_vanos = len(L_list)
        if n_vanos == 1:
            return [0.0, 0.0]
        n_eq = n_vanos - 1
        A = np.zeros((n_eq, n_eq))
        B = np.zeros(n_eq)
        for i in range(n_eq):
            L_izq = L_list[i]
            L_der = L_list[i + 1] if (i + 1) < n_vanos else L_list[i]
            w_izq = w_list[i]
            w_der = w_list[i + 1] if (i + 1) < n_vanos else w_list[i]
            A[i, i] = 2.0 * (L_izq + L_der)
            if i > 0:
                A[i, i - 1] = L_izq
            if i < n_eq - 1:
                A[i, i + 1] = L_der
            B[i] = -(w_izq * L_izq**3 / 4.0 + w_der * L_der**3 / 4.0)
        try:
            m_internos = np.linalg.solve(A, B)
        except np.linalg.LinAlgError:
            m_internos = np.zeros(n_eq)
        return [0.0] + list(m_internos) + [0.0]

    @staticmethod
    def generar_patrones_carga(n_vanos, wd_kn, wl_kn):
        patrones = []
        w_full = [1.2 * wd_kn + 1.6 * wl_kn] * n_vanos
        patrones.append(("1.2D+1.6L (todos)", w_full))
        w_14d = [1.4 * wd_kn] * n_vanos
        patrones.append(("1.4D (todos)", w_14d))
        if n_vanos >= 2:
            w_alt_par = []
            for i in range(n_vanos):
                if i % 2 == 0:
                    w_alt_par.append(1.2 * wd_kn + 1.6 * wl_kn)
                else:
                    w_alt_par.append(1.2 * wd_kn)
            patrones.append(("Alternado pares", w_alt_par))
            w_alt_imp = []
            for i in range(n_vanos):
                if i % 2 == 1:
                    w_alt_imp.append(1.2 * wd_kn + 1.6 * wl_kn)
                else:
                    w_alt_imp.append(1.2 * wd_kn)
            patrones.append(("Alternado impares", w_alt_imp))
            for j in range(n_vanos - 1):
                w_adj = [1.2 * wd_kn] * n_vanos
                w_adj[j] = 1.2 * wd_kn + 1.6 * wl_kn
                w_adj[j + 1] = 1.2 * wd_kn + 1.6 * wl_kn
                patrones.append((f"Adyacentes {j+1}-{j+2}", w_adj))
        return patrones

    @staticmethod
    def calcular_diagramas_vano(L, Mi, Md, w):
        n_pts = 200
        x = np.linspace(0, L, n_pts)
        Vi = (Md - Mi) / L + w * L / 2.0
        Vx = Vi - w * x
        Mx = Mi + Vi * x - 0.5 * w * x**2
        return x, Mx, Vx, Vi

    @staticmethod
    def calcular_envolvente(L_list, patrones):
        n_pts = 200
        n_vanos = len(L_list)
        x_global = []
        x_off = 0
        for i, L in enumerate(L_list):
            x_vano = np.linspace(0, L, n_pts)
            x_global.extend(x_vano + x_off)
            x_off += L
        x_global = np.array(x_global)
        M_all = []
        V_all = []
        for nombre, w_list in patrones:
            M_apoyos = MotorEstructural.resolver_tres_momentos(L_list, w_list)
            m_patron = []
            v_patron = []
            for i in range(n_vanos):
                _, Mx, Vx, _ = MotorEstructural.calcular_diagramas_vano(
                    L_list[i], M_apoyos[i], M_apoyos[i+1], w_list[i])
                m_patron.extend(Mx)
                v_patron.extend(Vx)
            M_all.append(m_patron)
            V_all.append(v_patron)
        M_all = np.array(M_all)
        V_all = np.array(V_all)
        M_env_max = np.max(M_all, axis=0)
        M_env_min = np.min(M_all, axis=0)
        V_env_max = np.max(V_all, axis=0)
        V_env_min = np.min(V_all, axis=0)
        return x_global, M_env_max, M_env_min, V_env_max, V_env_min

    @staticmethod
    def calcular_deflexion_vano(L, Mi, Md, w, Ec_kpa, Ie_m4):
        n_pts = 200
        x = np.linspace(0, L, n_pts)
        Vi = (Md - Mi) / L + w * L / 2.0
        EI = Ec_kpa * Ie_m4
        if EI < 1e-10:
            return x, np.zeros_like(x)
        C1 = -(Mi * L / 2.0 + Vi * L**2 / 6.0 - w * L**3 / 24.0)
        delta = (Mi * x**2 / 2.0 + Vi * x**3 / 6.0 - w * x**4 / 24.0 + C1 * x) / EI
        delta_mm = delta * 1000.0
        return x, delta_mm

    @staticmethod
    def inercia_efectiva_branson(Mcr, Ma, Ig, Icr):
        if abs(Ma) < 1e-12 or abs(Ma) <= abs(Mcr):
            return Ig
        ratio = (Mcr / abs(Ma)) ** 3
        Ie = ratio * Ig + (1.0 - ratio) * Icr
        return min(Ie, Ig)

    @staticmethod
    def lambda_delta(xi, rho_prima):
        return xi / (1.0 + 50.0 * rho_prima)


class ResultadosLosa:
    def __init__(self):
        self.tipo_losa = ""
        self.L_list = []
        self.h = 0; self.fc = 0; self.fy = 0
        self.cv = 0; self.cm_adic = 0
        self.b_nervio = 0; self.s_nervio = 0; self.h_loseta = 0; self.h_caseton = 0
        self.nombre_caseton = ""
        self.pp_concreto = 0; self.pp_caseton = 0; self.pp_total = 0
        self.wd_serv = 0; self.wl_serv = 0; self.wu_max = 0
        self.wd_kn = 0; self.wl_kn = 0
        self.d = 0; self.b_diseno = 0
        self.Ec = 0; self.Ig = 0; self.Icr = 0; self.Mcr = 0
        self.beta1 = 0
        self.as_sup = 0; self.as_inf = 0
        self.as_min_temp = 0; self.as_min_flex = 0
        self.malla_sup = ""; self.grafil_sup = ""
        self.malla_inf = ""; self.grafil_inf = ""
        self.mu_neg = 0; self.mu_pos = 0
        self.phi_mn_neg = 0; self.phi_mn_pos = 0
        self.et_neg = 0; self.et_pos = 0
        self.cumple_neg = False; self.cumple_pos = False
        self.vu_max = 0; self.phi_vc = 0; self.cumple_cortante = False
        self.delta_D_mm = 0; self.delta_DL_mm = 0
        self.delta_L_mm = 0; self.delta_LP_mm = 0
        self.perm_L = 0; self.perm_LP = 0
        self.lambda_lp = 0
        self.cumple_delta_L = False; self.cumple_delta_LP = False
        self.h_min_req = 0; self.cumple_h_min = False
        self.cumple_as_min_sup = False; self.cumple_as_min_inf = False
        self.fs_pos = 0; self.fs_neg = 0
        self.z_pos = 0; self.z_neg = 0
        self.z_perm = 31000.0
        self.cumple_fisura_pos = True; self.cumple_fisura_neg = True
        self.Ld_sup = 0; self.Ld_inf = 0
        self.Ld_disponible_sup = 0; self.Ld_disponible_inf = 0
        self.cumple_Ld_sup = True; self.cumple_Ld_inf = True
        self.checks_geometria = {}
        self.cumple_geometria = True
        self.vu_a_d = 0
        self.rho_max = 0; self.rho_provisto = 0; self.cumple_rho_max = True
        self.x_global = None
        self.M_env_max = None; self.M_env_min = None
        self.V_env_max = None; self.V_env_min = None
        self.delta_x = None; self.delta_DL_x = None
        self.delta_D_x = None; self.delta_LP_x = None
        self.patrones = []
        self.estado = "FALLA"
        self.verificaciones = {}

    def evaluar_estado(self):
        self.verificaciones = {
            "Flexion negativa (phiMn >= Mu-)": self.cumple_neg,
            "Flexion positiva (phiMn >= Mu+)": self.cumple_pos,
            "Cortante (phiVc >= Vu)": self.cumple_cortante,
            "Deflexion viva (dL <= L/360)": self.cumple_delta_L,
            "Deflexion largo plazo (dLP <= L/480)": self.cumple_delta_LP,
            "As min. superior": self.cumple_as_min_sup,
            "As min. inferior": self.cumple_as_min_inf,
            "Espesor minimo (Tabla C.9.5a)": self.cumple_h_min,
            "Fisuracion positiva (z <= 31000)": self.cumple_fisura_pos,
            "Fisuracion negativa (z <= 31000)": self.cumple_fisura_neg,
            "Cuantia maxima (rho <= 0.75*rho_b)": self.cumple_rho_max,
        }
        if self.tipo_losa != "Maciza":
            self.verificaciones["Geometria aligerada (C.8.13)"] = self.cumple_geometria
        self.estado = "CUMPLE" if all(self.verificaciones.values()) else "NO CUMPLE"


def calcular_losa(datos_entrada):
    """
    Función maestra que ejecuta TODO el cálculo.
    datos_entrada: diccionario con todos los inputs.
    Retorna: objeto ResultadosLosa.
    """
    R = ResultadosLosa()
    ME = MotorEstructural()

    R.tipo_losa = datos_entrada["tipo_losa"]
    R.L_list = datos_entrada["luces"]
    n_vanos = len(R.L_list)
    L_max = max(R.L_list)

    R.h = datos_entrada["h"]
    R.fc = datos_entrada["fc"]
    R.fy = datos_entrada["fy"]
    R.cv = datos_entrada["cv"]
    R.cm_adic = datos_entrada["cm_adic"]

    R.malla_sup = datos_entrada["malla_sup"]
    R.grafil_sup = datos_entrada["grafil_sup"]
    R.malla_inf = datos_entrada["malla_inf"]
    R.grafil_inf = datos_entrada["grafil_inf"]

    R.as_sup = MALLAS[R.malla_sup]["As"] + GRAFILES[R.grafil_sup]["As"]
    R.as_inf = MALLAS[R.malla_inf]["As"] + GRAFILES[R.grafil_inf]["As"]

    R.beta1 = ME.beta1(R.fc)
    R.Ec = 4700.0 * math.sqrt(R.fc)
    Ec_kpa = R.Ec * 1000.0

    rec = 2.5
    R.d = R.h - 3.0

    if R.tipo_losa == "Maciza":
        R.b_diseno = 100.0
        R.b_nervio = 100.0
        R.s_nervio = 100.0
        R.h_loseta = R.h
        R.h_caseton = 0.0
        R.pp_concreto = 2400.0 * (R.h / 100.0)
        R.pp_caseton = 0.0
        R.pp_total = R.pp_concreto
        b_m = 1.0; h_m = R.h / 100.0; d_m = R.d / 100.0
        R.Ig = b_m * h_m**3 / 12.0
        yt = h_m / 2.0
        fr_kpa = 0.62 * math.sqrt(R.fc) * 1000.0
        R.Mcr = fr_kpa * R.Ig / yt
        n_mod = 200000.0 / (4700.0 * math.sqrt(R.fc))
        As_m2 = R.as_inf / 10000.0
        rho = As_m2 / (b_m * d_m)
        k = math.sqrt(2.0 * rho * n_mod + (rho * n_mod)**2) - rho * n_mod
        kd = k * d_m
        R.Icr = b_m * kd**3 / 3.0 + n_mod * As_m2 * (d_m - kd)**2
    else:
        R.b_nervio = datos_entrada["b_nervio"]
        R.s_nervio = datos_entrada["s_nervio"]
        R.h_loseta = datos_entrada["h_loseta"]
        R.h_caseton = R.h - R.h_loseta
        R.nombre_caseton = datos_entrada.get("nombre_caseton", "")
        b_cas = R.s_nervio - R.b_nervio
        vol_solido = R.h / 100.0
        vol_caseton = (b_cas / 100.0) * (R.h_caseton / 100.0) * (1.0 / (R.s_nervio / 100.0))
        vol_concreto = vol_solido - vol_caseton
        R.pp_concreto = vol_concreto * 2400.0
        peso_cas_data = datos_entrada.get("peso_caseton", 0.5)
        n_cas_por_m2 = 1.0 / ((R.s_nervio / 100.0) * (b_cas / 100.0 + 0.001))
        R.pp_caseton = peso_cas_data * n_cas_por_m2 if peso_cas_data > 0 else 5.0
        R.pp_total = R.pp_concreto + R.pp_caseton
        R.b_diseno = R.b_nervio
        b_m = 1.0
        bw_m = R.b_nervio / 100.0 / (R.s_nervio / 100.0)
        bf = R.s_nervio / 100.0
        bw = R.b_nervio / 100.0
        hf = R.h_loseta / 100.0
        hw = R.h_caseton / 100.0
        h_total = R.h / 100.0
        A_ala = bf * hf
        A_alma = bw * hw
        y_ala = hf / 2.0
        y_alma = hf + hw / 2.0
        A_total = A_ala + A_alma
        yc = (A_ala * y_ala + A_alma * y_alma) / A_total
        I_ala = bf * hf**3 / 12.0 + A_ala * (yc - y_ala)**2
        I_alma = bw * hw**3 / 12.0 + A_alma * (yc - y_alma)**2
        Ig_nervio = I_ala + I_alma
        R.Ig = Ig_nervio / (R.s_nervio / 100.0)
        yt = max(yc, h_total - yc)
        fr_kpa = 0.62 * math.sqrt(R.fc) * 1000.0
        R.Mcr = fr_kpa * Ig_nervio / yt / (R.s_nervio / 100.0)
        d_m = R.d / 100.0
        n_mod = 200000.0 / (4700.0 * math.sqrt(R.fc))
        As_n_m2 = R.as_inf * (R.s_nervio / 100.0) / 10000.0
        a_coef = bf / 2.0
        b_coef = n_mod * As_n_m2
        c_coef = -n_mod * As_n_m2 * d_m
        disc = b_coef**2 - 4 * a_coef * c_coef
        c_na = (-b_coef + math.sqrt(max(0, disc))) / (2 * a_coef)
        if c_na <= hf:
            Icr_nervio = bf * c_na**3 / 3.0 + n_mod * As_n_m2 * (d_m - c_na)**2
        else:
            a_coef2 = bw / 2.0
            b_coef2 = (bf - bw) * hf + n_mod * As_n_m2
            c_coef2 = -(bf - bw) * hf**2 / 2.0 - n_mod * As_n_m2 * d_m
            disc2 = b_coef2**2 - 4 * a_coef2 * c_coef2
            c_na = (-b_coef2 + math.sqrt(max(0, disc2))) / (2 * a_coef2)
            Icr_nervio = (bw * c_na**3 / 3.0
                         + (bf - bw) * hf**3 / 12.0
                         + (bf - bw) * hf * (c_na - hf/2.0)**2
                         + n_mod * As_n_m2 * (d_m - c_na)**2)
        R.Icr = Icr_nervio / (R.s_nervio / 100.0)

    R.wd_serv = R.pp_total + R.cm_adic
    R.wl_serv = R.cv
    R.wd_kn = R.wd_serv * G_KGF_TO_KN
    R.wl_kn = R.wl_serv * G_KGF_TO_KN
    R.wu_max = 1.2 * R.wd_kn + 1.6 * R.wl_kn

    as_min_total = ME.as_min_losa(R.fy, 100.0, R.h)
    R.as_min_temp = as_min_total / 2.0
    R.cumple_as_min_sup = R.as_sup >= R.as_min_temp if n_vanos > 1 else True
    R.cumple_as_min_inf = R.as_inf >= R.as_min_temp

    h_mins, R.h_min_req = ME.espesor_minimo(R.L_list, R.fy)
    R.cumple_h_min = R.h >= R.h_min_req

    R.patrones = ME.generar_patrones_carga(n_vanos, R.wd_kn, R.wl_kn)
    x_g, M_max, M_min, V_max, V_min = ME.calcular_envolvente(R.L_list, R.patrones)
    R.x_global = x_g
    R.M_env_max = M_max
    R.M_env_min = M_min
    R.V_env_max = V_max
    R.V_env_min = V_min

    R.mu_pos = float(np.max(M_max))
    R.mu_neg = float(abs(np.min(M_min)))
    R.vu_max = float(max(np.max(np.abs(V_max)), np.max(np.abs(V_min))))

    def chequeo_flexion_rect(As_cm2, Mu_knm, b_cm, d_cm, fc, fy, beta1_val):
        if As_cm2 <= 0:
            return 0, 0, Mu_knm <= 0
        As_mm2 = As_cm2 * 100.0
        b_mm = b_cm * 10.0
        d_mm = d_cm * 10.0
        a_mm = (As_mm2 * fy) / (0.85 * fc * b_mm)
        c_mm = a_mm / beta1_val
        phi_mn = 0.9 * As_mm2 * fy * (d_mm - a_mm / 2.0) / 1e6
        et = 0.003 * (d_mm - c_mm) / c_mm if c_mm > 0 else 99
        cumple = (phi_mn >= abs(Mu_knm)) and (et >= 0.005)
        return phi_mn, et, cumple

    b_neg = 100.0
    R.phi_mn_neg, R.et_neg, R.cumple_neg = chequeo_flexion_rect(
        R.as_sup, R.mu_neg, b_neg, R.d, R.fc, R.fy, R.beta1)
    if n_vanos == 1:
        R.cumple_neg = True
        R.phi_mn_neg = 0
        R.mu_neg = 0

    if R.tipo_losa == "Maciza":
        R.phi_mn_pos, R.et_pos, R.cumple_pos = chequeo_flexion_rect(
            R.as_inf, R.mu_pos, 100.0, R.d, R.fc, R.fy, R.beta1)
    else:
        As_mm2 = R.as_inf * 100.0
        bf_mm = 1000.0
        bw_mm = (R.b_nervio / R.s_nervio) * 1000.0
        hf_mm = R.h_loseta * 10.0
        d_mm = R.d * 10.0
        a_mm = (As_mm2 * R.fy) / (0.85 * R.fc * bf_mm)
        if a_mm <= hf_mm:
            c_mm = a_mm / R.beta1
            phi_mn = 0.9 * As_mm2 * R.fy * (d_mm - a_mm / 2.0) / 1e6
        else:
            Asf = 0.85 * R.fc * (bf_mm - bw_mm) * hf_mm / R.fy
            Asw = As_mm2 - Asf
            aw = (Asw * R.fy) / (0.85 * R.fc * bw_mm)
            c_mm = aw / R.beta1
            Mn_f = Asf * R.fy * (d_mm - hf_mm / 2.0)
            Mn_w = Asw * R.fy * (d_mm - aw / 2.0)
            phi_mn = 0.9 * (Mn_f + Mn_w) / 1e6
        et = 0.003 * (d_mm - c_mm) / c_mm if c_mm > 0 else 99
        R.phi_mn_pos = phi_mn
        R.et_pos = et
        R.cumple_pos = (phi_mn >= R.mu_pos) and (et >= 0.005)

    d_mm = R.d * 10.0
    if R.tipo_losa == "Maciza":
        bw_mm = 1000.0
        factor_alig = 1.0
    else:
        bw_mm = (R.b_nervio / R.s_nervio) * 1000.0
        factor_alig = 1.1
    Vc = 0.17 * math.sqrt(R.fc) * bw_mm * d_mm / 1000.0
    R.phi_vc = 0.75 * Vc * factor_alig

    vu_at_d_list = []
    for i in range(n_vanos):
        L_i = R.L_list[i]
        d_m_val = R.d / 100.0
        frac_d = d_m_val / L_i if L_i > 0 else 0
        n_pts_env = 200
        idx_izq = min(int(frac_d * n_pts_env), n_pts_env - 1)
        idx_der = max(n_pts_env - 1 - int(frac_d * n_pts_env), 0)
        offset = i * n_pts_env
        if offset + idx_izq < len(R.V_env_max):
            vu_at_d_list.append(abs(R.V_env_max[offset + idx_izq]))
            vu_at_d_list.append(abs(R.V_env_min[offset + idx_izq]))
        if offset + idx_der < len(R.V_env_max):
            vu_at_d_list.append(abs(R.V_env_max[offset + idx_der]))
            vu_at_d_list.append(abs(R.V_env_min[offset + idx_der]))
    R.vu_a_d = max(vu_at_d_list) if vu_at_d_list else R.vu_max
    R.vu_max = R.vu_a_d
    R.cumple_cortante = R.phi_vc >= R.vu_max

    rho_b = (0.85 * R.beta1 * R.fc / R.fy) * (600.0 / (600.0 + R.fy))
    R.rho_max = 0.75 * rho_b
    rho_prov_pos = (R.as_inf / 10000.0) / (1.0 * R.d / 100.0)
    rho_prov_neg = (R.as_sup / 10000.0) / (1.0 * R.d / 100.0)
    R.rho_provisto = max(rho_prov_pos, rho_prov_neg)
    R.cumple_rho_max = R.rho_provisto <= R.rho_max

    ws_serv_kn = (R.wd_serv + R.cv) * G_KGF_TO_KN
    M_apoyos_serv = ME.resolver_tres_momentos(R.L_list, [ws_serv_kn] * n_vanos)
    ms_pos_max = 0
    ms_neg_max = 0
    for i in range(n_vanos):
        _, Mx_s, _, _ = ME.calcular_diagramas_vano(
            R.L_list[i], M_apoyos_serv[i], M_apoyos_serv[i+1], ws_serv_kn)
        ms_pos_max = max(ms_pos_max, float(np.max(Mx_s)))
        ms_neg_max = max(ms_neg_max, float(abs(np.min(Mx_s))))
    R.fs_pos = ME.esfuerzo_servicio(ms_pos_max, R.as_inf, R.d, R.fc)
    db_inf = MALLAS[R.malla_inf]["diametro"]
    db_sup = MALLAS[R.malla_sup]["diametro"]
    # dc = recubrimiento libre + db/2  (NSR-10 C.10.6.4 / ACI 318 R10.6)
    rec_mm = 25.0   # recubrimiento libre en mm
    dc_inf = rec_mm + db_inf / 2.0
    dc_sup = rec_mm + db_sup / 2.0
    s_barra_inf = MALLAS[R.malla_inf]["sep"] * 10.0
    A_pos = 2.0 * dc_inf * s_barra_inf
    R.z_pos, _, _, R.cumple_fisura_pos, _ = ME.verificar_fisuracion(R.fs_pos, dc_inf, A_pos)
    if n_vanos > 1 and R.as_sup > 0:
        R.fs_neg = ME.esfuerzo_servicio(ms_neg_max, R.as_sup, R.d, R.fc)
        s_barra_sup = MALLAS[R.malla_sup]["sep"] * 10.0
        A_neg = 2.0 * dc_sup * s_barra_sup
        R.z_neg, _, _, R.cumple_fisura_neg, _ = ME.verificar_fisuracion(R.fs_neg, dc_sup, A_neg)
    else:
        R.cumple_fisura_neg = True

    R.Ld_inf = ME.verificar_longitud_desarrollo(R.fc, R.fy, db_inf, dc_inf, es_superior=False)
    R.Ld_sup = ME.verificar_longitud_desarrollo(R.fc, R.fy, db_sup, dc_sup, es_superior=True)
    L_min = min(R.L_list)
    R.Ld_disponible_sup = L_min * 1000.0 / 4.0
    R.Ld_disponible_inf = L_min * 1000.0 / 4.0
    R.cumple_Ld_sup = R.Ld_disponible_sup >= R.Ld_sup
    R.cumple_Ld_inf = R.Ld_disponible_inf >= R.Ld_inf

    if R.tipo_losa != "Maciza":
        R.checks_geometria = ME.verificar_geometria_aligerada(
            R.b_nervio, R.s_nervio, R.h_loseta, R.h)
        R.cumple_geometria = all(c["cumple"] for c in R.checks_geometria.values())
    else:
        R.cumple_geometria = True

    ws_total_kn = (R.wd_serv + R.cv) * G_KGF_TO_KN
    M_apoyos_D = ME.resolver_tres_momentos(R.L_list, [R.wd_kn] * n_vanos)
    M_apoyos_DL = ME.resolver_tres_momentos(R.L_list, [ws_total_kn] * n_vanos)
    max_delta_D = 0; max_delta_DL = 0
    delta_D_all = []; delta_DL_all = []
    for i in range(n_vanos):
        L_i = R.L_list[i]
        _, Mx_DL, _, _ = ME.calcular_diagramas_vano(
            L_i, M_apoyos_DL[i], M_apoyos_DL[i+1], ws_total_kn)
        Ma_centro = float(np.max(np.abs(Mx_DL)))
        Ie_centro = ME.inercia_efectiva_branson(R.Mcr, Ma_centro, R.Ig, R.Icr)
        Ma_ext1 = abs(M_apoyos_DL[i]) if abs(M_apoyos_DL[i]) > 1e-10 else 1e-10
        Ma_ext2 = abs(M_apoyos_DL[i+1]) if abs(M_apoyos_DL[i+1]) > 1e-10 else 1e-10
        Ie_ext1 = ME.inercia_efectiva_branson(R.Mcr, Ma_ext1, R.Ig, R.Icr)
        Ie_ext2 = ME.inercia_efectiva_branson(R.Mcr, Ma_ext2, R.Ig, R.Icr)
        Ie = ME.ie_promediada(Ie_ext1, Ie_centro, Ie_ext2, n_vanos, i)
        x_d, delta_D = ME.calcular_deflexion_vano(
            L_i, M_apoyos_D[i], M_apoyos_D[i+1], R.wd_kn, Ec_kpa, Ie)
        max_delta_D = max(max_delta_D, float(np.max(np.abs(delta_D))))
        delta_D_all.extend(delta_D)
        x_dl, delta_DL = ME.calcular_deflexion_vano(
            L_i, M_apoyos_DL[i], M_apoyos_DL[i+1], ws_total_kn, Ec_kpa, Ie)
        max_delta_DL = max(max_delta_DL, float(np.max(np.abs(delta_DL))))
        delta_DL_all.extend(delta_DL)

    R.delta_D_mm = max_delta_D
    R.delta_DL_mm = max_delta_DL
    R.delta_L_mm = R.delta_DL_mm - R.delta_D_mm
    rho_prima = 0.0
    R.lambda_lp = ME.lambda_delta(2.0, rho_prima)
    R.delta_LP_mm = R.lambda_lp * R.delta_D_mm + R.delta_L_mm
    R.delta_D_x = np.array(delta_D_all) if delta_D_all else np.zeros(1)
    R.delta_DL_x = np.array(delta_DL_all) if delta_DL_all else np.zeros(1)
    if len(R.delta_D_x) == len(R.delta_DL_x):
        R.delta_LP_x = R.lambda_lp * R.delta_D_x + (R.delta_DL_x - R.delta_D_x)
    else:
        R.delta_LP_x = R.delta_DL_x.copy()

    R.perm_L = L_max * 1000.0 / 360.0
    R.perm_LP = L_max * 1000.0 / 480.0
    R.cumple_delta_L = R.delta_L_mm <= R.perm_L
    R.cumple_delta_LP = R.delta_LP_mm <= R.perm_LP

    R.evaluar_estado()
    return R


def resultado_a_dict(R):
    """Convierte ResultadosLosa a dict serializable para JSON."""
    # Datos de patrones individuales para la animación
    patrones_data = []
    ME = MotorEstructural()
    n_pts = 200
    for nombre, w_list in R.patrones:
        M_apoyos = ME.resolver_tres_momentos(R.L_list, w_list)
        m_patron = []
        v_patron = []
        for i in range(len(R.L_list)):
            _, Mx, Vx, _ = ME.calcular_diagramas_vano(
                R.L_list[i], M_apoyos[i], M_apoyos[i+1], w_list[i])
            m_patron.extend(Mx.tolist())
            v_patron.extend(Vx.tolist())
        patrones_data.append({
            "nombre": nombre,
            "w_list": w_list,
            "M": m_patron,
            "V": v_patron,
        })

    return _sanitize({
        "tipo_losa": R.tipo_losa,
        "L_list": R.L_list,
        "h": R.h, "fc": R.fc, "fy": R.fy,
        "cv": R.cv, "cm_adic": R.cm_adic,
        "b_nervio": R.b_nervio, "s_nervio": R.s_nervio,
        "h_loseta": R.h_loseta, "h_caseton": R.h_caseton,
        "nombre_caseton": R.nombre_caseton,
        "d": R.d, "b_diseno": R.b_diseno,
        "pp_concreto": round(R.pp_concreto, 2),
        "pp_caseton": round(R.pp_caseton, 2),
        "pp_total": round(R.pp_total, 2),
        "wd_serv": round(R.wd_serv, 2),
        "wl_serv": round(R.wl_serv, 2),
        "wu_max": round(R.wu_max, 4),
        "wd_kn": round(R.wd_kn, 4),
        "wl_kn": round(R.wl_kn, 4),
        "Ec": round(R.Ec, 2),
        "Ig": R.Ig, "Icr": R.Icr, "Mcr": round(R.Mcr, 4),
        "beta1": R.beta1,
        "as_sup": R.as_sup, "as_inf": R.as_inf,
        "as_min_temp": round(R.as_min_temp, 4),
        "malla_sup": R.malla_sup, "grafil_sup": R.grafil_sup,
        "malla_inf": R.malla_inf, "grafil_inf": R.grafil_inf,
        "db_malla_sup": MALLAS[R.malla_sup]["diametro"],
        "db_malla_inf": MALLAS[R.malla_inf]["diametro"],
        "db_grafil_sup": GRAFILES[R.grafil_sup]["diametro"],
        "db_grafil_inf": GRAFILES[R.grafil_inf]["diametro"],
        "sep_malla_sup": MALLAS[R.malla_sup]["sep"],
        "sep_malla_inf": MALLAS[R.malla_inf]["sep"],
        "sep_grafil_sup": GRAFILES[R.grafil_sup]["sep"],
        "sep_grafil_inf": GRAFILES[R.grafil_inf]["sep"],
        "mu_neg": round(R.mu_neg, 4), "mu_pos": round(R.mu_pos, 4),
        "phi_mn_neg": round(R.phi_mn_neg, 4), "phi_mn_pos": round(R.phi_mn_pos, 4),
        "et_neg": round(R.et_neg, 6), "et_pos": round(R.et_pos, 6),
        "cumple_neg": R.cumple_neg, "cumple_pos": R.cumple_pos,
        "vu_max": round(R.vu_max, 4), "phi_vc": round(R.phi_vc, 4),
        "cumple_cortante": R.cumple_cortante,
        "delta_D_mm": round(R.delta_D_mm, 4),
        "delta_DL_mm": round(R.delta_DL_mm, 4),
        "delta_L_mm": round(R.delta_L_mm, 4),
        "delta_LP_mm": round(R.delta_LP_mm, 4),
        "perm_L": round(R.perm_L, 4),
        "perm_LP": round(R.perm_LP, 4),
        "lambda_lp": round(R.lambda_lp, 4),
        "cumple_delta_L": R.cumple_delta_L,
        "cumple_delta_LP": R.cumple_delta_LP,
        "h_min_req": round(R.h_min_req, 4),
        "cumple_h_min": R.cumple_h_min,
        "cumple_as_min_sup": R.cumple_as_min_sup,
        "cumple_as_min_inf": R.cumple_as_min_inf,
        "fs_pos": round(R.fs_pos, 2), "fs_neg": round(R.fs_neg, 2),
        "z_pos": round(R.z_pos, 2), "z_neg": round(R.z_neg, 2),
        "cumple_fisura_pos": R.cumple_fisura_pos,
        "cumple_fisura_neg": R.cumple_fisura_neg,
        "rho_max": round(R.rho_max, 6),
        "rho_provisto": round(R.rho_provisto, 6),
        "cumple_rho_max": R.cumple_rho_max,
        "checks_geometria": R.checks_geometria,
        "cumple_geometria": R.cumple_geometria,
        "estado": R.estado,
        "verificaciones": R.verificaciones,
        # Arrays para gráficas (decimados a 100 pts para JSON liviano)
        "x_global": _decimate(R.x_global),
        "M_env_max": _decimate(R.M_env_max),
        "M_env_min": _decimate(R.M_env_min),
        "V_env_max": _decimate(R.V_env_max),
        "V_env_min": _decimate(R.V_env_min),
        "delta_DL_x": _decimate(R.delta_DL_x),
        "delta_D_x": _decimate(R.delta_D_x),
        "delta_LP_x": _decimate(R.delta_LP_x) if R.delta_LP_x is not None else [],
        # Patrones individuales para animación
        "patrones": patrones_data,
    })


def _sanitize(obj):
    """Recursively convert numpy types to Python natives for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return [_sanitize(v) for v in obj.tolist()]
    return obj


def _decimate(arr, target=400):
    """Reduce array to target points for JSON transfer."""
    if arr is None:
        return []
    a = np.array(arr)
    if len(a) <= target:
        return [round(float(v), 6) for v in a]
    step = max(1, len(a) // target)
    return [round(float(v), 6) for v in a[::step]]
