// MEMORIA DE CÁLCULO — Losa Maciza NSR-10 · CRÉER Ingeniería (v11)
// Misma filosofía que DESPIECE Studio: (1) PREVIEW HTML temático (Calibri Light,
// NAVY/TEAL) que se ve PERFECTO; (2) WORD REAL (.docx) descargable con la librería
// docx — el usuario edita en Word. Un único modelo de datos para ambos.
//
// FIX clave (queja del usuario en despiece): en Word las TABLAS quedaban más
// angostas que el texto justificado. Aquí toda tabla ocupa EXACTAMENTE el ancho
// útil de página (PW = ancho - margen_izq - margen_der) con layout FIXED y
// columnWidths que suman PW → tablas y texto alineados al milímetro.
//
//   window.openMemoriaLosa(R, proy, extras)       → ventana de preview HTML
//   window.exportMemoriaLosaWord(R, proy, extras) → descarga .docx
//
// extras = { screenshots3d:{moment,shear,defl}, charts:{moment,shear,deflection},
//            seccionSVG:string, optimizacion:obj|null }

(function () {
  // ── tema corporativo CRÉER (navy / teal) ──────────────────────────────────
  const C = { NAVY: "0D2137", TEAL: "00C2CB", GRAY: "F2F4F7", WHITE: "FFFFFF",
              TEXT: "1A1A2E", SUBTLE: "6B7280", LINE: "DDDDDD", SOFT: "EAF6F7",
              OKC: "1A8A91", FAILC: "C0392B" };
  const FONT = "Calibri Light", FONT_B = "Calibri";

  // ── formato ───────────────────────────────────────────────────────────────
  const f0 = (v) => (v == null || isNaN(v)) ? "—" : String(Math.round(v));
  const f1 = (v) => (v == null || isNaN(v)) ? "—" : (+v).toFixed(1);
  const f2 = (v) => (v == null || isNaN(v)) ? "—" : (+v).toFixed(2);
  const f3 = (v) => (v == null || isNaN(v)) ? "—" : (+v).toFixed(3);
  const fSci = (v) => (v == null || isNaN(v) || v === 0) ? "—" : (+v).toExponential(3);
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const okx = (b) => b ? "✓ CUMPLE" : "✗ NO CUMPLE";

  const today = () => new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });

  // ── extracción de datos derivados de R ────────────────────────────────────
  function model(R, proy) {
    const n = R.L_list.length;
    const Ltot = R.L_list.reduce((a, b) => a + b, 0);
    const rec = R.h - R.d; // cm hasta el centro del acero
    const a_pos = (R.as_inf * 100 * R.fy) / (0.85 * R.fc * 1000); // mm (bloque equiv.)
    const a_neg = (R.as_sup * 100 * R.fy) / (0.85 * R.fc * 1000);
    return {
      R, proy, n, Ltot, rec, a_pos, a_neg,
      luces_str: R.L_list.map(L => f2(L) + " m").join(" + "),
      empresa: proy.nombre || "CRÉER Ingeniería",
      ingeniero: proy.ingeniero || "",
      matricula: proy.matricula || "",
      proyecto: proy.proyecto || "Proyecto Estructural",
      ubicacion: proy.ubicacion || "Colombia",
      fecha: proy.fecha || today(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CONTENIDO (compartido HTML / Word): listas de cálculo paso a paso
  // ═══════════════════════════════════════════════════════════════════════════
  function flexPosLines(M) {
    const R = M.R;
    return [
      `Acero inferior dispuesto: ${R.malla_inf}${R.grafil_inf !== "Sin Grafil" ? " + " + R.grafil_inf : ""}`,
      `As,inf = ${f3(R.as_inf)} cm²/m       b = 100 cm (franja unitaria)   d = ${f1(R.d)} cm`,
      `a  = As·fy/(0.85·f'c·b) = ${f3(R.as_inf)}·${f0(R.fy)} / (0.85·${f0(R.fc)}·100) = ${f1(M.a_pos)} mm`,
      `φMn⁺ = 0.90·As·fy·(d − a/2) = ${f3(R.phi_mn_pos)} kN·m       (φ = 0.90)`,
      `εt = ${(R.et_pos).toFixed(5)}  ≥ 0.005  →  sección controlada por tracción ${R.et_pos >= 0.005 ? "✓" : "✗"}`,
      ``,
      `VERIFICACIÓN:  φMn⁺ = ${f3(R.phi_mn_pos)} kN·m  ≥  Mu⁺ = ${f3(R.mu_pos)} kN·m   →  ${okx(R.cumple_pos)}`,
    ];
  }
  function flexNegLines(M) {
    const R = M.R;
    if (M.n === 1) return [`Vano único simplemente apoyado: no hay momento negativo de continuidad.`];
    return [
      `Acero superior dispuesto: ${R.malla_sup}${R.grafil_sup !== "Sin Grafil" ? " + " + R.grafil_sup : ""}`,
      `As,sup = ${f3(R.as_sup)} cm²/m       b = 100 cm   d = ${f1(R.d)} cm`,
      `a  = As·fy/(0.85·f'c·b) = ${f3(R.as_sup)}·${f0(R.fy)} / (0.85·${f0(R.fc)}·100) = ${f1(M.a_neg)} mm`,
      `φMn⁻ = 0.90·As·fy·(d − a/2) = ${f3(R.phi_mn_neg)} kN·m       (φ = 0.90)`,
      `εt = ${(R.et_neg).toFixed(5)}  ≥ 0.005  →  ${R.et_neg >= 0.005 ? "✓" : "✗"}`,
      ``,
      `VERIFICACIÓN:  φMn⁻ = ${f3(R.phi_mn_neg)} kN·m  ≥  Mu⁻ = ${f3(R.mu_neg)} kN·m   →  ${okx(R.cumple_neg)}`,
    ];
  }
  function shearLines(M) {
    const R = M.R;
    return [
      `Cortante último de diseño a la cara/'d' del apoyo (envolvente alternada):  Vu = ${f3(R.vu_max)} kN`,
      `El concreto resiste el cortante (losa sin estribos, NSR-10 C.11.2.1):`,
      `Vc  = 0.17·√f'c·bw·d = 0.17·√${f0(R.fc)}·1000·${f1(R.d * 10)}/1000 = ${f3(R.phi_vc / 0.75)} kN`,
      `φVc = 0.75·Vc = ${f3(R.phi_vc)} kN       (φ = 0.75)`,
      ``,
      `VERIFICACIÓN:  φVc = ${f3(R.phi_vc)} kN  ≥  Vu = ${f3(R.vu_max)} kN   →  ${okx(R.cumple_cortante)}`,
    ];
  }
  function deflLines(M) {
    const R = M.R;
    const Lmax = Math.max(...R.L_list);
    return [
      `Rigidez y fisuración (método de la inercia efectiva de Branson, NSR-10 C.9.5):`,
      `Ec  = 4700·√f'c = 4700·√${f0(R.fc)} = ${f0(R.Ec)} MPa`,
      `Ig  = b·h³/12 = ${fSci(R.Ig)} m⁴/m        Icr (fisurada) = ${fSci(R.Icr)} m⁴/m`,
      `Mcr = fr·Ig/yt = ${f3(R.Mcr)} kN·m/m       (fr = 0.62·√f'c)`,
      ``,
      `Multiplicador de larga duración:  λΔ = ξ/(1+50ρ') = ${f2(R.lambda_lp)}   (ξ = 2.0, ≥ 5 años; ρ' = 0)`,
      `Δ inmediata D    = ${f3(R.delta_D_mm)} mm`,
      `Δ inmediata D+L  = ${f3(R.delta_DL_mm)} mm`,
      `Δ viva (D+L − D) = ${f3(R.delta_L_mm)} mm`,
      `Δ largo plazo    = λΔ·ΔD + ΔL = ${f3(R.delta_LP_mm)} mm`,
      ``,
      `VERIFICACIÓN viva:        ΔL  = ${f3(R.delta_L_mm)} mm  ≤  L/360 = ${f3(R.perm_L)} mm   →  ${okx(R.cumple_delta_L)}`,
      `VERIFICACIÓN largo plazo: ΔLP = ${f3(R.delta_LP_mm)} mm  ≤  L/480 = ${f3(R.perm_LP)} mm   →  ${okx(R.cumple_delta_LP)}`,
      `(luz de control L = ${f2(Lmax)} m)`,
    ];
  }
  function fisuraLines(M) {
    const R = M.R;
    const L = [
      `Control de fisuración por el índice z de Gergely-Lutz (NSR-10 C.10.6.4, z ≤ 31 000):`,
      `Esfuerzo de servicio acero inferior:  fs⁺ = ${f2(R.fs_pos)} MPa`,
      `z⁺ = fs·(dc·A)^(1/3) = ${f0(R.z_pos)}  ≤  31 000   →  ${okx(R.cumple_fisura_pos)}`,
    ];
    if (M.n > 1) {
      L.push(``);
      L.push(`Esfuerzo de servicio acero superior:  fs⁻ = ${f2(R.fs_neg)} MPa`);
      L.push(`z⁻ = ${f0(R.z_neg)}  ≤  31 000   →  ${okx(R.cumple_fisura_neg)}`);
    }
    return L;
  }
  function cuantiaLines(M) {
    const R = M.R;
    return [
      `Cuantía máxima a tracción (NSR-10 C.10.3.3):  ρ_max = 0.75·ρ_b = ${f3(R.rho_max * 100)} %`,
      `ρ provisto (mayor de las dos capas) = ${f3(R.rho_provisto * 100)} %`,
      ``,
      `VERIFICACIÓN:  ρ = ${f3(R.rho_provisto * 100)} %  ≤  ρ_max = ${f3(R.rho_max * 100)} %   →  ${okx(R.cumple_rho_max)}`,
    ];
  }
  function combLines(M) {
    const R = M.R;
    return [
      `U₁ = 1.2·D + 1.6·L = 1.2·${f3(R.wd_kn)} + 1.6·${f3(R.wl_kn)} = ${f3(R.wu_max)} kN/m`,
      `U₂ = 1.4·D = 1.4·${f3(R.wd_kn)} = ${f3(1.4 * R.wd_kn)} kN/m`,
      `Carga de diseño Wu = ${f3(R.wu_max)} kN/m   (gobierna U₁)`,
    ];
  }

  // filas de tablas (reutilizadas por HTML y Word) ───────────────────────────
  function materialesRows(M) {
    const R = M.R;
    return [
      ["Resistencia del concreto, f'c", `${f1(R.fc)} MPa`, "NSR-10 C.5"],
      ["Fluencia del refuerzo, fy", `${f1(R.fy)} MPa`, "NSR-10 C.3.5"],
      ["Módulo del concreto, Ec = 4700·√f'c", `${f0(R.Ec)} MPa`, "C.8.5.1"],
      ["Factor β₁", `${f3(R.beta1)}`, "C.10.2.7.3"],
      ["Peso unitario del concreto", "2 400 kgf/m³", "C.8.5"],
    ];
  }
  function geomRows(M) {
    const R = M.R;
    return [
      ["Tipo de losa", "Maciza en una dirección"],
      ["Número de vanos", `${M.n}  ( ${M.luces_str} )`],
      ["Longitud total", `${f2(M.Ltot)} m`],
      ["Espesor total, h", `${f1(R.h)} cm`],
      ["Altura útil, d", `${f1(R.d)} cm`],
      ["Recubrimiento al centro del acero", `${f1(M.rec)} cm`],
      ["Ancho de diseño, b", "100 cm (franja unitaria)"],
    ];
  }
  function cargasRows(M) {
    const R = M.R;
    return [
      ["Peso propio del concreto (2400·h)", `${f1(R.pp_concreto)} kgf/m²`, "D"],
      ["Carga muerta adicional (acabados, muros)", `${f1(R.cm_adic)} kgf/m²`, "D"],
      ["CARGA MUERTA TOTAL (D)", `${f1(R.wd_serv)} kgf/m²`, "—"],
      ["CARGA VIVA (L)", `${f1(R.wl_serv)} kgf/m²`, "L"],
    ];
  }
  function refuerzoRows(M) {
    const R = M.R;
    return [
      ["Superior (apoyos · M⁻)", R.malla_sup, R.grafil_sup, `${f3(R.as_sup)}`, `${f1(R.db_malla_sup)}`],
      ["Inferior (vanos · M⁺)", R.malla_inf, R.grafil_inf, `${f3(R.as_inf)}`, `${f1(R.db_malla_inf)}`],
    ];
  }
  function verifRows(M) {
    const R = M.R;
    return [
      ["Flexión positiva (φMn ≥ Mu⁺)", `${f3(R.phi_mn_pos)} kN·m`, `${f3(R.mu_pos)} kN·m`, R.cumple_pos],
      ["Flexión negativa (φMn ≥ Mu⁻)", `${f3(R.phi_mn_neg)} kN·m`, `${f3(R.mu_neg)} kN·m`, R.cumple_neg],
      ["Cortante a d (φVc ≥ Vu)", `${f3(R.phi_vc)} kN`, `${f3(R.vu_max)} kN`, R.cumple_cortante],
      ["Cuantía máxima (ρ ≤ 0.75·ρb)", `${f3(R.rho_provisto * 100)} %`, `${f3(R.rho_max * 100)} %`, R.cumple_rho_max],
      ["Fisuración + (z ≤ 31000)", `${f0(R.z_pos)}`, "31 000", R.cumple_fisura_pos],
      ["Fisuración − (z ≤ 31000)", `${f0(R.z_neg)}`, "31 000", R.cumple_fisura_neg],
      ["Deflexión viva (L/360)", `${f3(R.delta_L_mm)} mm`, `${f3(R.perm_L)} mm`, R.cumple_delta_L],
      ["Deflexión largo plazo (L/480)", `${f3(R.delta_LP_mm)} mm`, `${f3(R.perm_LP)} mm`, R.cumple_delta_LP],
      ["As mínimo superior", `${f3(R.as_sup)} cm²/m`, `${f3(R.as_min_temp)} cm²/m`, R.cumple_as_min_sup],
      ["As mínimo inferior", `${f3(R.as_inf)} cm²/m`, `${f3(R.as_min_temp)} cm²/m`, R.cumple_as_min_inf],
      ["Espesor mínimo (Tabla C.9.5a)", `${f1(R.h)} cm`, `${f2(R.h_min_req)} cm`, R.cumple_h_min],
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PREVIEW HTML (temático navy/teal)
  // ═══════════════════════════════════════════════════════════════════════════
  function tableHTML(headers, rows, opt) {
    opt = opt || {};
    const al = (a) => a === "r" ? "right" : a === "c" ? "center" : "left";
    let h = `<table class="ct ${opt.cls || ""}"><thead><tr>`;
    for (const c of headers) h += `<th style="text-align:${al(c.a || "c")}">${esc(c.t)}</th>`;
    h += "</tr></thead><tbody>";
    rows.forEach((r, ri) => {
      h += `<tr class="${ri % 2 ? "odd" : "even"}">`;
      r.forEach((cell, i) => {
        const o = (cell && typeof cell === "object") ? cell : { t: cell };
        const a = o.a || (headers[i] && headers[i].ca) || "r";
        let v = (o.t == null || o.t === "") ? "—" : esc(o.t);
        if (o.ok === true) v = `<span class="st-ok">CUMPLE</span>`;
        if (o.ok === false) v = `<span class="st-fail">NO CUMPLE</span>`;
        h += `<td style="text-align:${al(a)};${o.b ? "font-weight:700" : ""}">${v}</td>`;
      });
      h += "</tr>";
    });
    return h + "</tbody></table>";
  }
  const calcPre = (lines) => `<pre class="calc">${lines.map(esc).join("\n")}</pre>`;

  function buildHTML(R, proy, extras) {
    const M = model(R, proy);
    extras = extras || {};
    const ss = extras.screenshots3d || {}, ch = extras.charts || {};
    const opt = extras.optimizacion;
    const estadoOK = R.estado === "CUMPLE";

    const matsTbl = tableHTML(
      [{ t: "PARÁMETRO", a: "l", ca: "l" }, { t: "VALOR", a: "c", ca: "c" }, { t: "REFERENCIA", a: "l", ca: "l" }],
      materialesRows(M));
    const geomTbl = tableHTML(
      [{ t: "PARÁMETRO", a: "l", ca: "l" }, { t: "VALOR", a: "l", ca: "l" }],
      geomRows(M).map(r => [{ t: r[0], a: "l" }, { t: r[1], a: "l" }]));
    const cargasTbl = tableHTML(
      [{ t: "CARGA", a: "l", ca: "l" }, { t: "VALOR", a: "c", ca: "c" }, { t: "TIPO", a: "c", ca: "c" }],
      cargasRows(M).map(r => [{ t: r[0], a: "l", b: r[2] === "—" }, { t: r[1], a: "c" }, { t: r[2], a: "c" }]));
    const patTbl = tableHTML(
      [{ t: "#", a: "c", ca: "c" }, { t: "PATRÓN DE CARGA ALTERNADA — NSR-10 C.8.11.2", a: "l", ca: "l" }],
      (R.patrones || []).map((p, i) => [{ t: String(i + 1), a: "c" }, { t: p.nombre, a: "l" }]));
    const refTbl = tableHTML(
      [{ t: "POSICIÓN", a: "l", ca: "l" }, { t: "MALLA", a: "c", ca: "c" }, { t: "GRAFIL", a: "c", ca: "c" }, { t: "As (cm²/m)", a: "c", ca: "c" }, { t: "db (mm)", a: "c", ca: "c" }],
      refuerzoRows(M).map(r => [{ t: r[0], a: "l" }, { t: r[1], a: "c", b: true }, { t: r[2], a: "c" }, { t: r[3], a: "c" }, { t: r[4], a: "c" }]));
    const verifTbl = tableHTML(
      [{ t: "VERIFICACIÓN", a: "l", ca: "l" }, { t: "CALCULADO", a: "c", ca: "c" }, { t: "PERMISIBLE", a: "c", ca: "c" }, { t: "ESTADO", a: "c", ca: "c" }],
      verifRows(M).map(r => [{ t: r[0], a: "l" }, { t: r[1], a: "c" }, { t: r[2], a: "c" }, { ok: r[3], a: "c" }]));

    const imgBlock = (src, cap) => src ? `<div class="figc"><img src="${src}" alt="${esc(cap)}"><div class="cap">${esc(cap)}</div></div>` : "";
    const secImg = extras.seccionSVG ? `<div class="figc">${extras.seccionSVG}<div class="cap">Sección transversal y armado — losa maciza</div></div>` : "";

    let optHTML = "";
    if (opt && opt.mejor) {
      const m = opt.mejor, co = m.costo || {}, pr = opt.precios || {};
      const fcop = n => "$ " + Math.round(n || 0).toLocaleString("es-CO");
      optHTML = `<h2>11 · OPTIMIZACIÓN ECONÓMICA (Auto-Calcular)</h2>
        <p>El diseño se obtuvo por un barrido automático sobre el espesor constructivo (múltiplos de 1 cm) y las mallas comerciales, minimizando el costo total (concreto + acero) sujeto al cumplimiento simultáneo de los estados límite NSR-10.</p>
        ${tableHTML([{ t: "VARIABLE", a: "l", ca: "l" }, { t: "ÓPTIMO", a: "c", ca: "c" }], [
          [{ t: "Espesor h", a: "l" }, { t: m.h + " cm", a: "c", b: true }],
          [{ t: "Malla inferior", a: "l" }, { t: m.malla_inf, a: "c" }],
          [{ t: "Malla superior", a: "l" }, { t: m.malla_sup, a: "c" }],
          [{ t: "Volumen de concreto", a: "l" }, { t: f3(co.vol_concreto_m3) + " m³", a: "c" }],
          [{ t: "Peso de acero (c/desperdicio)", a: "l" }, { t: f1(co.peso_acero_kg) + " kg", a: "c" }],
          [{ t: "Precio concreto / acero", a: "l" }, { t: fcop(pr.concreto_m3) + " /m³ · " + fcop(pr.acero_kg) + " /kg", a: "c" }],
          [{ t: "COSTO TOTAL", a: "l", b: true }, { t: fcop(co.costo_total), a: "c", b: true }],
        ])}`;
    }

    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Memoria de cálculo — Losa Maciza · CRÉER Ingeniería</title>
<style>
  @page { size: letter; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family:"Calibri Light","Calibri","Segoe UI",sans-serif; font-size:11px; color:#${C.TEXT};
         background:#5a5a5a; margin:0; padding:0; line-height:1.5; text-align:justify; }
  .toolbar { position:sticky; top:0; z-index:20; background:#${C.NAVY}; color:#fff;
             display:flex; gap:10px; align-items:center; padding:9px 18px; }
  .toolbar .ttl { font-weight:700; letter-spacing:1px; }
  .toolbar button { font-family:inherit; font-size:12px; padding:8px 16px; cursor:pointer;
             background:#${C.TEAL}; color:#${C.NAVY}; font-weight:700; border:none; border-radius:4px; letter-spacing:.4px; margin-left:auto; }
  .toolbar button.alt { background:transparent; color:#fff; border:1px solid #4a6076; margin-left:0; font-weight:400; }
  .page { background:#fff; max-width:900px; margin:18px auto; padding:0 0 40px; box-shadow:0 8px 40px rgba(0,0,0,.4); }
  .wrap { padding:0 30px; }
  .band { background:#${C.NAVY}; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:20px 30px; }
  .band .logo { font-size:30px; font-weight:700; letter-spacing:.5px; }
  .band .logo span { color:#${C.TEAL}; font-weight:300; }
  .band .sub { font-size:11px; color:#B0C8D8; margin-top:3px; }
  .band .right { text-align:right; }
  .band .right .t1 { color:#${C.TEAL}; font-weight:700; font-size:12px; letter-spacing:1px; }
  .band .right .t2 { color:#B0C8D8; font-size:11px; margin-top:3px; }
  h2 { color:#${C.NAVY}; font-size:15px; letter-spacing:.4px; margin:24px 0 8px; padding:7px 12px;
       background:#${C.GRAY}; border-left:4px solid #${C.TEAL}; font-weight:700; text-align:left; }
  h3 { color:#${C.NAVY}; font-size:12.5px; margin:16px 0 5px; font-weight:700; text-align:left; border-bottom:1px solid #${C.LINE}; padding-bottom:3px; }
  p { margin:5px 0 9px; }
  table.ct { border-collapse:collapse; width:100%; margin:7px 0 11px; font-size:10px; }
  table.ct thead th { background:#${C.NAVY}; color:#fff; font-weight:700; padding:5px 7px; border:1px solid #${C.NAVY}; font-size:9.5px; letter-spacing:.3px; }
  table.ct td { border:1px solid #${C.LINE}; padding:4px 7px; }
  table.ct tr.even td { background:#fff; } table.ct tr.odd td { background:#${C.GRAY}; }
  pre.calc { font-family:"Consolas","Courier New",monospace; font-size:10px; line-height:1.55;
       background:#${C.SOFT}; border:1px solid #${C.TEAL}; border-radius:4px; padding:11px 14px; white-space:pre-wrap; text-align:left; margin:7px 0 11px; color:#${C.TEXT}; }
  .nota { font-size:9.5px; color:#${C.SUBTLE}; }
  .st-ok { color:#${C.OKC}; font-weight:700; }
  .st-fail { color:#${C.FAILC}; font-weight:700; }
  .figc { text-align:center; margin:12px 0; }
  .figc img, .figc svg { max-width:100%; height:auto; border:1px solid #${C.LINE}; border-radius:4px; }
  .cap { font-size:9.5px; color:#${C.SUBTLE}; margin-top:4px; font-style:italic; }
  .dictamen { text-align:center; font-weight:700; font-size:15px; margin:18px 0; padding:13px; border-radius:6px;
       border:2px solid ${estadoOK ? "#158042" : "#C02020"}; color:${estadoOK ? "#158042" : "#C02020"}; background:${estadoOK ? "#EAF7EF" : "#FDECEC"}; }
  .docfoot { border-top:2px solid #${C.TEAL}; margin:26px 30px 0; padding-top:8px; font-size:9.5px; color:#${C.SUBTLE}; text-align:center; }
  @media print { .toolbar { display:none; } body { background:#fff; } .page { box-shadow:none; margin:0; max-width:none; } .figc img, .figc svg { border:none; } }
</style></head>
<body>
<div class="toolbar">
  <span class="ttl">MEMORIA DE CÁLCULO · LOSA MACIZA</span>
  <button class="alt" onclick="window.print()">🖨 Imprimir</button>
  <button onclick="window.__memWord && window.__memWord()">⬇ DESCARGAR WORD (.docx)</button>
</div>
<div class="page">
<div class="band">
  <div><div class="logo">CRÉER<span> Ingeniería</span></div><div class="sub">Estudios y Diseños Integrales · BIM · Estructuras · NSR-10</div></div>
  <div class="right"><div class="t1">MEMORIA DE CÁLCULO ESTRUCTURAL</div><div class="t2">Losa maciza en una dirección · NSR-10 / ACI 318</div><div class="t2">${esc(M.fecha)}</div></div>
</div>
<div class="wrap">
  <h2>1 · ALCANCE Y CRITERIOS DE DISEÑO</h2>
  <p>La presente memoria documenta el diseño a flexión, cortante, control de deflexiones a largo plazo, fisuración y refuerzo mínimo de una <b>losa maciza en una dirección</b> de ${M.n} vano(s) continuo(s), según el Reglamento Colombiano de Construcción Sismo Resistente <b>NSR-10</b> (Título C, basado en ACI 318) y las disposiciones de carga alternada de C.8.11.2. El análisis se realiza por el <b>método de los Tres Momentos</b> (ecuación de Clapeyron) sobre la envolvente de patrones de carga.</p>
  ${tableHTML([{ t: "PROYECTO", a: "l", ca: "l" }, { t: "DATO", a: "l", ca: "l" }], [
    [{ t: "Proyecto", a: "l" }, { t: M.proyecto, a: "l" }],
    [{ t: "Empresa / Profesional", a: "l" }, { t: M.empresa + (M.ingeniero ? " — " + M.ingeniero : ""), a: "l" }],
    [{ t: "Matrícula / Título", a: "l" }, { t: M.matricula || "—", a: "l" }],
    [{ t: "Ubicación", a: "l" }, { t: M.ubicacion, a: "l" }],
    [{ t: "Fecha", a: "l" }, { t: M.fecha, a: "l" }],
  ])}

  <h2>2 · MATERIALES</h2>
  ${matsTbl}

  <h2>3 · GEOMETRÍA DE LA LOSA</h2>
  ${geomTbl}
  <h3>3.1 · Verificación de espesor mínimo — Tabla NSR-10 C.9.5(a)</h3>
  ${calcPre([
    `h_min = L/factor · (0.4 + fy/700) = ${f2(R.h_min_req)} cm`,
    `h provisto = ${f1(R.h)} cm  ≥  h_min = ${f2(R.h_min_req)} cm   →  ${okx(R.cumple_h_min)}`,
  ])}

  <h2>4 · ANÁLISIS DE CARGAS</h2>
  ${cargasTbl}
  <h3>4.1 · Combinaciones de carga — NSR-10 B.2.4</h3>
  ${calcPre(combLines(M))}

  <h2>5 · ANÁLISIS ESTRUCTURAL</h2>
  <p>Método de los Tres Momentos (Clapeyron) con envolventes de carga alternada (NSR-10 C.8.11.2). Se evaluaron los siguientes patrones:</p>
  ${patTbl}
  ${calcPre([
    `Momento último positivo máximo (envolvente):  Mu⁺ = ${f3(R.mu_pos)} kN·m`,
    `Momento último negativo máximo (envolvente):  Mu⁻ = ${f3(R.mu_neg)} kN·m`,
    `Cortante último máximo (a 'd' del apoyo):      Vu  = ${f3(R.vu_max)} kN`,
  ])}

  <h2>6 · REFUERZO PROVISTO</h2>
  ${refTbl}
  <p class="nota">As mínimo por temperatura y retracción (NSR-10 C.7.12.2.1, 0.0018·b·h): ${f3(R.as_min_temp)} cm²/m por cara.</p>

  <h2>7 · VERIFICACIONES PASO A PASO</h2>
  <h3>7.1 · Flexión positiva (vanos · M⁺) — NSR-10 C.10</h3>
  ${calcPre(flexPosLines(M))}
  <h3>7.2 · Flexión negativa (apoyos · M⁻) — NSR-10 C.10</h3>
  ${calcPre(flexNegLines(M))}
  <h3>7.3 · Cortante a 'd' del apoyo — NSR-10 C.11.2</h3>
  ${calcPre(shearLines(M))}
  <h3>7.4 · Deflexiones a largo plazo — NSR-10 C.9.5</h3>
  ${calcPre(deflLines(M))}
  <h3>7.5 · Control de fisuración — NSR-10 C.10.6.4</h3>
  ${calcPre(fisuraLines(M))}
  <h3>7.6 · Cuantía máxima — NSR-10 C.10.3.3</h3>
  ${calcPre(cuantiaLines(M))}

  <h2>8 · TABLA RESUMEN DE VERIFICACIONES NSR-10</h2>
  ${verifTbl}
  <div class="dictamen">${estadoOK ? "✔" : "✘"} DICTAMEN FINAL: EL DISEÑO ${esc(R.estado)} TODAS LAS VERIFICACIONES NSR-10 ${estadoOK ? "✔" : "✘"}</div>

  <h2>9 · DIAGRAMAS DE SOLICITACIONES</h2>
  ${imgBlock(ch.moment, "Envolvente de momentos flectores")}
  ${imgBlock(ch.shear, "Envolvente de cortantes con φVc")}
  ${imgBlock(ch.deflection, "Deflexiones (D+L y largo plazo)")}

  <h2>10 · SECCIÓN TRANSVERSAL Y ARMADO</h2>
  ${secImg || `<p class="nota">Sección no disponible.</p>`}

  ${(ss.moment || ss.shear || ss.defl) ? `<h2>11 · VISOR 3D — MAPAS DE CALOR</h2>
  <p>Modelo tridimensional con mapas de calor de demanda. Escala azul → magenta: menor → mayor exigencia. La deformada se muestra con escala exagerada para visibilidad.</p>
  ${imgBlock(ss.moment, "Demanda de momento |M| sobre el modelo 3D")}
  ${imgBlock(ss.shear, "Demanda de cortante |V| sobre el modelo 3D")}
  ${imgBlock(ss.defl, "Deformada largo plazo (escala exagerada)")}` : ""}

  ${optHTML}
</div>
<div class="docfoot">CRÉER Ingeniería · info@creeringenieria.com · www.creeringenieria.com — Memoria generada el ${esc(M.fecha)} · Unidades: kN, kN·m, mm, m, cm</div>
</div>
</body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WORD (.docx) — mismo contenido, tema CRÉER, tablas a ancho de página
  // ═══════════════════════════════════════════════════════════════════════════
  function dataURLtoU8(dataURL) {
    const b = atob(dataURL.split(",")[1]);
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  // Carga una imagen (dataURL) y resuelve sus dimensiones naturales.
  function imgInfo(dataURL) {
    return new Promise((res) => {
      if (!dataURL) return res(null);
      const im = new Image();
      im.onload = () => res({ dataURL, w: im.naturalWidth || 1000, h: im.naturalHeight || 500 });
      im.onerror = () => res(null);
      im.src = dataURL;
    });
  }
  // Rasteriza un SVG (string) a PNG dataURL para incrustarlo en Word.
  function svgToPng(svgStr, scale) {
    scale = scale || 2;
    return new Promise((res) => {
      if (!svgStr) return res(null);
      const im = new Image();
      im.onload = () => {
        const w = (im.naturalWidth || 460) * scale, h = (im.naturalHeight || 300) * scale;
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#0d1426"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(im, 0, 0, w, h);
        res({ dataURL: c.toDataURL("image/png"), w, h });
      };
      im.onerror = () => res(null);
      im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
    });
  }

  async function buildWord(R, proy, extras) {
    const M = model(R, proy);
    extras = extras || {};
    const X = window.docx;
    if (!X) throw new Error("librería docx no cargó (revisa la conexión)");
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
            AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
            Header, Footer, ImageRun, PageNumber, TableLayoutType } = X;

    // Página A4 (11906) con márgenes laterales de 1100 twips → ancho útil:
    const MARGIN = 1100;
    const PW = 11906 - MARGIN - MARGIN;   // 9706 — las tablas SIEMPRE ocupan esto.

    const noB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const noBorders = { top: noB, bottom: noB, left: noB, right: noB };
    const thin = { style: BorderStyle.SINGLE, size: 1, color: C.LINE };
    const thinB = { top: thin, bottom: thin, left: thin, right: thin };

    const run = (t, o = {}) => new TextRun({ text: String(t), font: o.bold ? FONT_B : FONT,
      size: o.size || 19, bold: !!o.bold, color: o.color || C.TEXT, italics: !!o.italic });
    const para = (kids, o = {}) => new Paragraph({
      alignment: o.align || (o.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT),
      spacing: { before: o.before || 0, after: o.after == null ? 100 : o.after },
      children: Array.isArray(kids) ? kids : [kids],
    });
    const cell = (kids, o = {}) => new TableCell({
      borders: o.borders || thinB,
      shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR } : undefined,
      margins: { top: 40, bottom: 40, left: 90, right: 90 },
      width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      columnSpan: o.span || undefined,
      children: Array.isArray(kids) ? kids : [kids],
    });

    // Tabla genérica — el ancho SIEMPRE suma PW (texto y tabla alineados).
    function table(headers, rows, widths) {
      const al = (a) => a === "l" ? AlignmentType.LEFT : a === "r" ? AlignmentType.RIGHT : AlignmentType.CENTER;
      const headFill = headers._teal ? C.TEAL : C.NAVY;
      const headColor = headers._teal ? C.NAVY : C.WHITE;
      const nc = headers.length;
      let w = (widths && widths.length === nc) ? widths.slice() : Array(nc).fill(Math.floor(PW / nc));
      const sum = w.reduce((a, b) => a + b, 0) || PW;
      w = w.map(x => Math.max(1, Math.round(x * PW / sum)));
      w[nc - 1] += PW - w.reduce((a, b) => a + b, 0);     // cuadrar suma exacta a PW
      const hrow = new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(para(run(h.t, { bold: true, color: headColor, size: 16 }), { align: al(h.a || "c"), after: 0 }),
          { fill: headFill, w: w[i], borders: { top: noB, bottom: noB, left: noB, right: noB } })),
      });
      const drows = rows.map((r, ri) => new TableRow({ children: r.map((c0, i) => {
        const o = (c0 && typeof c0 === "object") ? c0 : { t: c0 };
        let txt = o.t, color = undefined, bold = o.b;
        if (o.ok === true) { txt = "CUMPLE"; color = C.OKC; bold = true; }
        if (o.ok === false) { txt = "NO CUMPLE"; color = C.FAILC; bold = true; }
        return cell(para(run(txt == null || txt === "" ? "—" : txt, { bold, color, size: 16 }),
          { align: al(o.a || (headers[i] && headers[i].ca) || "r"), after: 0 }),
          { fill: ri % 2 ? C.GRAY : C.WHITE, w: w[i] });
      }) }));
      return new Table({ width: { size: PW, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, rows: [hrow, ...drows] });
    }
    const h2 = (t) => new Table({ width: { size: PW, type: WidthType.DXA }, columnWidths: [PW],
      rows: [new TableRow({ children: [cell(para(run(t, { bold: true, color: C.WHITE, size: 22 }), { after: 0 }), { fill: C.NAVY, borders: noBorders })] })] });
    const h3 = (t) => para(run(t, { bold: true, color: C.NAVY, size: 19 }), { before: 160, after: 50 });
    const tealB = { style: BorderStyle.SINGLE, size: 4, color: C.TEAL };
    const calcBlock = (lines) => new Paragraph({
      shading: { fill: C.SOFT, type: ShadingType.CLEAR },
      border: { top: tealB, bottom: tealB, left: tealB, right: tealB },
      spacing: { after: 130, before: 40 },
      children: lines.flatMap((l, k) => [new TextRun({ text: l, font: "Consolas", size: 17, color: C.TEXT, break: k ? 1 : 0 })]),
    });
    // Imagen centrada a ancho de página (PW twips → puntos = /20).
    async function imgPara(info, capt) {
      if (!info) return capt ? para(run("[imagen no disponible]", { italic: true, color: C.SUBTLE, size: 15 })) : null;
      const wPt = Math.min(470, PW / 20);
      const hPt = wPt * info.h / info.w;
      const kids = [new ImageRun({ data: dataURLtoU8(info.dataURL), transformation: { width: Math.round(wPt), height: Math.round(hPt) } })];
      const arr = [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: capt ? 20 : 90 }, children: kids })];
      if (capt) arr.push(para(run(capt, { italic: true, color: C.SUBTLE, size: 14 }), { align: AlignmentType.CENTER, after: 100 }));
      return arr;
    }

    const ss = extras.screenshots3d || {}, ch = extras.charts || {};
    const [iMom, iShe, iDef, iSec, i3m, i3s, i3d] = await Promise.all([
      imgInfo(ch.moment), imgInfo(ch.shear), imgInfo(ch.deflection),
      svgToPng(extras.seccionSVG), imgInfo(ss.moment), imgInfo(ss.shear), imgInfo(ss.defl),
    ]);

    const children = [];
    const push = (x) => { if (Array.isArray(x)) x.forEach(e => e && children.push(e)); else if (x) children.push(x); };

    // ── header band ──
    push(new Table({ width: { size: PW, type: WidthType.DXA }, columnWidths: [Math.round(PW * 0.58), PW - Math.round(PW * 0.58)],
      rows: [new TableRow({ children: [
        cell([
          para([run("CRÉER", { bold: true, color: C.WHITE, size: 40 }), run(" Ingeniería", { color: C.TEAL, size: 28 })], { after: 30 }),
          para(run("Estudios y Diseños Integrales · BIM · Estructuras · NSR-10", { color: "B0C8D8", size: 15 }), { after: 0 }),
        ], { fill: C.NAVY, borders: noBorders, w: Math.round(PW * 0.58) }),
        cell([
          para(run("MEMORIA DE CÁLCULO ESTRUCTURAL", { bold: true, color: C.TEAL, size: 16 }), { align: AlignmentType.RIGHT, after: 30 }),
          para(run("Losa maciza en una dirección · NSR-10 / ACI 318", { color: "B0C8D8", size: 14 }), { align: AlignmentType.RIGHT, after: 20 }),
          para(run(M.fecha, { color: "B0C8D8", size: 14 }), { align: AlignmentType.RIGHT, after: 0 }),
        ], { fill: C.NAVY, borders: noBorders, w: PW - Math.round(PW * 0.58) }),
      ] })] }));
    push(para(run("", {}), { after: 60 }));

    // 1 · alcance + datos
    push(h2("1 · ALCANCE Y CRITERIOS DE DISEÑO"));
    push(para(run("La presente memoria documenta el diseño a flexión, cortante, control de deflexiones a largo plazo, fisuración y refuerzo mínimo de una losa maciza en una dirección de " + M.n + " vano(s) continuo(s), según el Reglamento Colombiano NSR-10 (Título C, basado en ACI 318) y las disposiciones de carga alternada de C.8.11.2. El análisis se realiza por el método de los Tres Momentos (Clapeyron) sobre la envolvente de patrones de carga."), { justify: true }));
    push(table([{ t: "PROYECTO", a: "l", ca: "l" }, { t: "DATO", a: "l", ca: "l" }], [
      ["Proyecto", { t: M.proyecto, a: "l" }],
      ["Empresa / Profesional", { t: M.empresa + (M.ingeniero ? " — " + M.ingeniero : ""), a: "l" }],
      ["Matrícula / Título", { t: M.matricula || "—", a: "l" }],
      ["Ubicación", { t: M.ubicacion, a: "l" }],
      ["Fecha", { t: M.fecha, a: "l" }],
    ], [3200, 6506]));

    // 2 · materiales
    push(h2("2 · MATERIALES"));
    push(table([{ t: "PARÁMETRO", a: "l", ca: "l" }, { t: "VALOR", a: "c", ca: "c" }, { t: "REF.", a: "c", ca: "c" }],
      materialesRows(M).map(r => [{ t: r[0], a: "l" }, { t: r[1], a: "c", b: true }, { t: r[2], a: "c" }]), [5200, 2553, 1953]));

    // 3 · geometría
    push(h2("3 · GEOMETRÍA DE LA LOSA"));
    push(table([{ t: "PARÁMETRO", a: "l", ca: "l" }, { t: "VALOR", a: "l", ca: "l" }],
      geomRows(M).map(r => [{ t: r[0], a: "l" }, { t: r[1], a: "l", b: true }]), [4200, 5506]));
    push(h3("3.1 · Verificación de espesor mínimo — Tabla NSR-10 C.9.5(a)"));
    push(calcBlock([
      `h_min = L/factor · (0.4 + fy/700) = ${f2(R.h_min_req)} cm`,
      `h provisto = ${f1(R.h)} cm  >=  h_min = ${f2(R.h_min_req)} cm   ->  ${okx(R.cumple_h_min)}`,
    ]));

    // 4 · cargas
    push(h2("4 · ANÁLISIS DE CARGAS"));
    push(table([{ t: "CARGA", a: "l", ca: "l" }, { t: "VALOR", a: "c", ca: "c" }, { t: "TIPO", a: "c", ca: "c" }],
      cargasRows(M).map(r => [{ t: r[0], a: "l", b: r[2] === "—" }, { t: r[1], a: "c" }, { t: r[2], a: "c" }]), [6000, 2200, 1506]));
    push(h3("4.1 · Combinaciones de carga — NSR-10 B.2.4"));
    push(calcBlock(combLines(M)));

    // 5 · análisis
    push(h2("5 · ANÁLISIS ESTRUCTURAL"));
    push(para(run("Método de los Tres Momentos (Clapeyron) con envolventes de carga alternada (NSR-10 C.8.11.2). Patrones evaluados:"), { justify: true }));
    push(table([{ t: "#", a: "c", ca: "c" }, { t: "PATRÓN DE CARGA ALTERNADA", a: "l", ca: "l" }],
      (R.patrones || []).map((p, i) => [{ t: String(i + 1), a: "c" }, { t: p.nombre, a: "l" }]), [900, 8806]));
    push(calcBlock([
      `Momento ultimo positivo maximo:  Mu+ = ${f3(R.mu_pos)} kN.m`,
      `Momento ultimo negativo maximo:  Mu- = ${f3(R.mu_neg)} kN.m`,
      `Cortante ultimo (a 'd' del apoyo): Vu = ${f3(R.vu_max)} kN`,
    ]));

    // 6 · refuerzo
    push(h2("6 · REFUERZO PROVISTO"));
    push(table([{ t: "POSICIÓN", a: "l", ca: "l" }, { t: "MALLA", a: "c", ca: "c" }, { t: "GRAFIL", a: "c", ca: "c" }, { t: "As (cm²/m)", a: "c", ca: "c" }, { t: "db (mm)", a: "c", ca: "c" }],
      refuerzoRows(M).map(r => [{ t: r[0], a: "l" }, { t: r[1], a: "c", b: true }, { t: r[2], a: "c" }, { t: r[3], a: "c" }, { t: r[4], a: "c" }]), [3100, 2400, 2200, 1100, 906]));
    push(para(run("As mínimo por temperatura y retracción (C.7.12.2.1, 0.0018·b·h): " + f3(R.as_min_temp) + " cm²/m por cara.", { italic: true, color: C.SUBTLE, size: 15 })));

    // 7 · verificaciones paso a paso
    push(h2("7 · VERIFICACIONES PASO A PASO"));
    push(h3("7.1 · Flexión positiva (vanos · M⁺) — NSR-10 C.10"));
    push(calcBlock(flexPosLines(M).map(deAccent)));
    push(h3("7.2 · Flexión negativa (apoyos · M⁻) — NSR-10 C.10"));
    push(calcBlock(flexNegLines(M).map(deAccent)));
    push(h3("7.3 · Cortante a 'd' del apoyo — NSR-10 C.11.2"));
    push(calcBlock(shearLines(M).map(deAccent)));
    push(h3("7.4 · Deflexiones a largo plazo — NSR-10 C.9.5"));
    push(calcBlock(deflLines(M).map(deAccent)));
    push(h3("7.5 · Control de fisuración — NSR-10 C.10.6.4"));
    push(calcBlock(fisuraLines(M).map(deAccent)));
    push(h3("7.6 · Cuantía máxima — NSR-10 C.10.3.3"));
    push(calcBlock(cuantiaLines(M).map(deAccent)));

    // 8 · tabla resumen + dictamen
    push(h2("8 · TABLA RESUMEN DE VERIFICACIONES NSR-10"));
    push(table([{ t: "VERIFICACIÓN", a: "l", ca: "l" }, { t: "CALCULADO", a: "c", ca: "c" }, { t: "PERMISIBLE", a: "c", ca: "c" }, { t: "ESTADO", a: "c", ca: "c" }],
      verifRows(M).map(r => [{ t: r[0], a: "l" }, { t: r[1], a: "c" }, { t: r[2], a: "c" }, { ok: r[3], a: "c" }]), [4406, 1900, 1900, 1500]));
    const okFinal = R.estado === "CUMPLE";
    push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 160, after: 120 },
      border: { top: { style: BorderStyle.SINGLE, size: 18, color: okFinal ? "158042" : "C02020", space: 6 },
                bottom: { style: BorderStyle.SINGLE, size: 18, color: okFinal ? "158042" : "C02020", space: 6 } },
      children: [run((okFinal ? "✔ " : "✘ ") + "DICTAMEN FINAL: EL DISEÑO " + R.estado + " TODAS LAS VERIFICACIONES NSR-10",
        { bold: true, size: 24, color: okFinal ? "158042" : "C02020" })],
    }));

    // 9 · diagramas
    push(new Paragraph({ pageBreakBefore: true, children: [run("", {})] }));
    push(h2("9 · DIAGRAMAS DE SOLICITACIONES"));
    push(await imgPara(iMom, "Envolvente de momentos flectores"));
    push(await imgPara(iShe, "Envolvente de cortantes con φVc"));
    push(await imgPara(iDef, "Deflexiones (D+L y largo plazo)"));

    // 10 · sección
    push(h2("10 · SECCIÓN TRANSVERSAL Y ARMADO"));
    push(await imgPara(iSec, "Sección transversal y armado — losa maciza"));

    // 11 · 3D
    if (i3m || i3s || i3d) {
      push(new Paragraph({ pageBreakBefore: true, children: [run("", {})] }));
      push(h2("11 · VISOR 3D — MAPAS DE CALOR"));
      push(para(run("Modelo tridimensional con mapas de calor de demanda (azul → magenta: menor → mayor exigencia). La deformada se muestra con escala exagerada para visibilidad.", { size: 17 }), { justify: true }));
      push(await imgPara(i3m, "Demanda de momento |M| sobre el modelo 3D"));
      push(await imgPara(i3s, "Demanda de cortante |V| sobre el modelo 3D"));
      push(await imgPara(i3d, "Deformada largo plazo (escala exagerada)"));
    }

    // 12 · optimización
    const opt = extras.optimizacion;
    if (opt && opt.mejor) {
      const m = opt.mejor, co = m.costo || {}, pr = opt.precios || {};
      const fcop = n => "$ " + Math.round(n || 0).toLocaleString("es-CO") + " COP";
      push(h2("12 · OPTIMIZACIÓN ECONÓMICA (Auto-Calcular)"));
      push(para(run("El diseño se obtuvo por un barrido automático sobre el espesor constructivo y las mallas comerciales, minimizando el costo total (concreto + acero) sujeto al cumplimiento simultáneo de los estados límite NSR-10."), { justify: true }));
      push(table([{ t: "VARIABLE DE DISEÑO", a: "l", ca: "l" }, { t: "ÓPTIMO", a: "c", ca: "c" }], [
        ["Espesor h", { t: m.h + " cm", a: "c", b: true }],
        ["Malla inferior", { t: m.malla_inf, a: "c" }],
        ["Malla superior", { t: m.malla_sup, a: "c" }],
        ["Volumen de concreto", { t: f3(co.vol_concreto_m3) + " m³", a: "c" }],
        ["Peso de acero (c/desperdicio)", { t: f1(co.peso_acero_kg) + " kg", a: "c" }],
        ["Precio concreto / acero", { t: fcop(pr.concreto_m3) + " /m³  ·  " + fcop(pr.acero_kg) + " /kg", a: "c" }],
        ["COSTO TOTAL", { t: fcop(co.costo_total), a: "c", b: true }],
      ], [5800, 3906]));
    }

    // header / footer
    const footer = new Footer({ children: [new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.TEAL, space: 6 } },
      alignment: AlignmentType.CENTER, spacing: { before: 60 },
      children: [
        new TextRun({ text: "CRÉER Ingeniería · info@creeringenieria.com · www.creeringenieria.com    |    Losa maciza NSR-10 · " + M.fecha + "    |    Página ", font: FONT, size: 14, color: C.SUBTLE }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: C.SUBTLE }),
        new TextRun({ text: " de ", font: FONT, size: 14, color: C.SUBTLE }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 14, color: C.SUBTLE }),
      ],
    })] });
    const header = new Header({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT, spacing: { after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.TEAL, space: 4 } },
      children: [new TextRun({ text: "CRÉER Ingeniería — Memoria de cálculo · Losa maciza", font: FONT, size: 13, color: C.SUBTLE })],
    })] });

    const doc = new Document({
      styles: { default: { document: { run: { font: FONT, size: 19, color: C.TEXT } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 900, right: MARGIN, bottom: 1000, left: MARGIN } } },
        headers: { default: header }, footers: { default: footer },
        children,
      }],
    });
    return Packer.toBlob(doc);
  }

  // Word no siempre tiene los superíndices/símbolos raros en Consolas; quitamos
  // acentos problemáticos sólo de los bloques monoespaciados del Word.
  function deAccent(s) {
    return String(s)
      .replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/→/g, "->")
      .replace(/·/g, "·").replace(/√/g, "raiz").replace(/²/g, "2").replace(/³/g, "3")
      .replace(/⁺/g, "+").replace(/⁻/g, "-").replace(/Δ/g, "D").replace(/λ/g, "lambda")
      .replace(/ρ/g, "rho").replace(/ε/g, "e").replace(/φ/g, "phi").replace(/β/g, "beta")
      .replace(/ξ/g, "xi").replace(/×/g, "x");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  API pública
  // ═══════════════════════════════════════════════════════════════════════════
  async function exportWord(R, proy, extras) {
    if (!R) { alert("No hay resultados para la memoria."); return; }
    const blob = await buildWord(R, proy, extras);
    const base = (proy && proy.proyecto ? proy.proyecto : "Losa").replace(/[^\wÀ-ſ-]+/g, "_").slice(0, 40) || "Losa";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Memoria_Losa_CREER_" + base + ".docx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 6000);
  }

  function openMemoria(R, proy, extras) {
    if (!R) { alert("No hay resultados para la memoria."); return; }
    const html = buildHTML(R, proy, extras);
    const w = window.open("", "_blank");
    if (!w) { alert("El navegador bloqueó la ventana (revisa el bloqueador de pop-ups)."); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.__memWord = () => exportWord(R, proy, extras).catch(e => w.alert("Error al generar Word: " + e.message));
  }

  window.openMemoriaLosa = openMemoria;
  window.exportMemoriaLosaWord = exportWord;
})();
