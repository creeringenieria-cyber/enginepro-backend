"""
Motor de optimización económica para losas macizas.

Itera sobre espesor h (múltiplos de 1 cm) y catálogos comerciales de mallas
sup/inf buscando el diseño que minimiza la función de costo (concreto + acero)
sujeto a cumplir TODOS los estados límite NSR-10 / ACI 318.

Estrategia (greedy, segura):
  1. h barre desde el h_min NSR-10 (redondeado hacia arriba al cm) hasta
     h_min + `extra_cm` (por defecto 15 cm).
  2. Para cada h se recorre malla_inf en orden ascendente de As. El primer
     malla_inf que — junto a un malla_sup mínimo válido — hace cumplir todos
     los chequeos es el óptimo para ese h (aumentar As_inf solo encarece).
  3. Para n_vanos > 1, malla_sup también se barre en orden ascendente con
     early-exit al primer cumplimiento.
  4. Entre todos los h que tuvieron un diseño cumpliente se selecciona el de
     menor costo total.
"""

import math
from copy import deepcopy

from .motor import (
    MALLAS, GRAFILES,
    MotorEstructural,
    calcular_losa,
)

# ── Precios por defecto (COP). Configurables desde el request. ──
PRECIO_CONCRETO_M3_DEFAULT = 450_000.0
PRECIO_ACERO_KG_DEFAULT = 4_800.0

DENSIDAD_ACERO = 7850.0   # kg/m³
FACTOR_DESPERDICIO_ACERO = 1.15  # 15 % por traslapos / mermas
GRAFIL_FIJO = "Sin Grafil"

# Recorte de extra sobre el h mínimo (cm). 15 cm cubre ampliamente el rango útil.
EXTRA_CM_DEFAULT = 15


def _peso_acero_kg_por_m2(as_sup_cm2_m, as_inf_cm2_m):
    """
    Peso de acero en kg/m² de losa considerando ambas capas.
    As viene en cm²/m (área por metro de ancho en una franja unitaria de 1 m),
    por lo que As·1 m² = As cm² = As·1e-4 m² de sección de acero por m² de losa.
    Peso = A·ρ·factor_desperdicio.
    """
    as_total_m2 = (as_sup_cm2_m + as_inf_cm2_m) * 1.0e-4  # m²/m²
    return as_total_m2 * DENSIDAD_ACERO * FACTOR_DESPERDICIO_ACERO


def calcular_costo(h_cm, as_sup, as_inf, area_losa_m2,
                   precio_concreto_m3=PRECIO_CONCRETO_M3_DEFAULT,
                   precio_acero_kg=PRECIO_ACERO_KG_DEFAULT):
    """
    Función de costo total del diseño (concreto + acero).
    Retorna dict con desglose.
    """
    vol_concreto = area_losa_m2 * (h_cm / 100.0)
    peso_acero_m2 = _peso_acero_kg_por_m2(as_sup, as_inf)
    peso_acero = peso_acero_m2 * area_losa_m2

    costo_concreto = vol_concreto * precio_concreto_m3
    costo_acero = peso_acero * precio_acero_kg
    costo_total = costo_concreto + costo_acero

    return {
        "vol_concreto_m3": round(vol_concreto, 3),
        "peso_acero_kg": round(peso_acero, 2),
        "peso_acero_kg_m2": round(peso_acero_m2, 2),
        "costo_concreto": round(costo_concreto, 0),
        "costo_acero": round(costo_acero, 0),
        "costo_total": round(costo_total, 0),
    }


def _mallas_ordenadas():
    """Lista de mallas ordenadas por As ascendente [(nombre, dict), ...]."""
    return sorted(MALLAS.items(), key=lambda kv: kv[1]["As"])


def _h_min_constructivo(luces, fy):
    """Retorna el h mínimo NSR-10 redondeado hacia arriba al cm."""
    _, hmin = MotorEstructural.espesor_minimo(luces, fy)
    return max(5, int(math.ceil(hmin)))


def _area_losa(luces, ancho_tributario_m=1.0):
    """Área total de la franja de análisis (sum(L) × b)."""
    return float(sum(luces)) * ancho_tributario_m


def optimizar_losa(entrada_base,
                   precio_concreto_m3=PRECIO_CONCRETO_M3_DEFAULT,
                   precio_acero_kg=PRECIO_ACERO_KG_DEFAULT,
                   extra_cm=EXTRA_CM_DEFAULT,
                   historial_completo=False):
    """
    Ejecuta la optimización.

    entrada_base: dict con todas las claves que espera calcular_losa (luces,
                  fc, fy, cv, cm_adic, tipo_losa='Maciza'). h, malla_sup,
                  malla_inf serán sobrescritos por el optimizador.
    precio_*:     precios unitarios (COP).
    extra_cm:     máximo incremento sobre h_min para explorar.
    historial_completo: si True, devuelve todas las combinaciones explorada
                  (útil para tabla en la memoria de cálculo).

    Retorna: dict con {mejor, historial, explorados, h_min_nsr}.
    """
    if entrada_base.get("tipo_losa", "Maciza") != "Maciza":
        raise ValueError("El optimizador actual solo soporta tipo_losa='Maciza'.")

    luces = entrada_base["luces"]
    fy = entrada_base["fy"]
    n_vanos = len(luces)

    h_min_nsr = _h_min_constructivo(luces, fy)
    h_range = list(range(h_min_nsr, h_min_nsr + extra_cm + 1))

    mallas = _mallas_ordenadas()
    # Para n_vanos==1 no hay momento negativo: usamos siempre la malla más
    # liviana como malla_sup (no participa en costo crítico y satisface
    # cualquier check de temperatura).
    malla_min_name = mallas[0][0]

    area = _area_losa(luces)

    historial = []
    mejor = None
    explorados = 0

    for h in h_range:
        encontrado_h = None

        for malla_inf_name, malla_inf_data in mallas:
            # Para n_vanos>1 necesitamos también barrer malla_sup; para single
            # span fijamos la mínima.
            if n_vanos > 1:
                sup_candidatas = mallas
            else:
                sup_candidatas = [(malla_min_name, mallas[0][1])]

            diseño_ok = None

            for malla_sup_name, malla_sup_data in sup_candidatas:
                intento = deepcopy(entrada_base)
                intento["tipo_losa"] = "Maciza"
                intento["h"] = float(h)
                intento["malla_sup"] = malla_sup_name
                intento["grafil_sup"] = GRAFIL_FIJO
                intento["malla_inf"] = malla_inf_name
                intento["grafil_inf"] = GRAFIL_FIJO

                try:
                    R = calcular_losa(intento)
                except Exception:
                    continue

                explorados += 1
                as_sup = malla_sup_data["As"]
                as_inf = malla_inf_data["As"]
                costo = calcular_costo(h, as_sup, as_inf, area,
                                       precio_concreto_m3, precio_acero_kg)

                registro = {
                    "h": h,
                    "malla_sup": malla_sup_name,
                    "malla_inf": malla_inf_name,
                    "as_sup": as_sup,
                    "as_inf": as_inf,
                    "estado": R.estado,
                    "costo_total": costo["costo_total"],
                    "vol_concreto_m3": costo["vol_concreto_m3"],
                    "peso_acero_kg": costo["peso_acero_kg"],
                }
                if historial_completo:
                    historial.append(registro)

                if R.estado == "CUMPLE":
                    diseño_ok = {
                        "h": h,
                        "malla_sup": malla_sup_name,
                        "malla_inf": malla_inf_name,
                        "grafil_sup": GRAFIL_FIJO,
                        "grafil_inf": GRAFIL_FIJO,
                        "as_sup": as_sup,
                        "as_inf": as_inf,
                        "costo": costo,
                    }
                    if not historial_completo:
                        historial.append(registro)
                    break   # smallest malla_sup hallada → no seguir

            if diseño_ok is not None:
                encontrado_h = diseño_ok
                break   # smallest malla_inf hallada → no seguir para este h

        if encontrado_h is not None:
            if mejor is None or encontrado_h["costo"]["costo_total"] < mejor["costo"]["costo_total"]:
                mejor = encontrado_h

    if mejor is None:
        return {
            "ok": False,
            "mensaje": (
                f"No se encontró un diseño cumpliente en el rango h∈[{h_range[0]}, "
                f"{h_range[-1]}] cm con las mallas del catálogo. "
                "Revisa luces, cargas o materiales."
            ),
            "h_min_nsr": h_min_nsr,
            "explorados": explorados,
            "historial": historial,
        }

    # Recalcular el diseño óptimo completo para devolver todo el payload de
    # resultados (diagramas, verificaciones, arrays para el 3D, etc.).
    entrada_final = deepcopy(entrada_base)
    entrada_final["tipo_losa"] = "Maciza"
    entrada_final["h"] = float(mejor["h"])
    entrada_final["malla_sup"] = mejor["malla_sup"]
    entrada_final["grafil_sup"] = mejor["grafil_sup"]
    entrada_final["malla_inf"] = mejor["malla_inf"]
    entrada_final["grafil_inf"] = mejor["grafil_inf"]

    return {
        "ok": True,
        "mejor": mejor,
        "entrada_final": entrada_final,
        "h_min_nsr": h_min_nsr,
        "h_range": [h_range[0], h_range[-1]],
        "explorados": explorados,
        "historial": historial,
        "precios": {
            "concreto_m3": precio_concreto_m3,
            "acero_kg": precio_acero_kg,
            "factor_desperdicio_acero": FACTOR_DESPERDICIO_ACERO,
        },
        "area_losa_m2": area,
    }
