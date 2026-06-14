/* ═══════════════════════════════════════════════════════════════════
   EnginePro Losas — CRÉER Ingeniería · v11 "HYPERION"
   · Visor 3D Three r146 + OrbitControls (auto-giro, suelo circular, cosmos)
   · Memoria 100% en el navegador: preview HTML + Word .docx (js/memoria.js)
   ═══════════════════════════════════════════════════════════════════ */

// Auto-detect backend: si la página se sirve desde un puerto distinto al backend
// (Live Server :5500, etc.) apunta a localhost:8000. En producción / cuando el
// propio FastAPI sirve el HTML, queda relativo (string vacío).
const API_BASE = (function () {
    if (window.API_BASE_URL) return window.API_BASE_URL;
    const loc = window.location;
    if (loc.protocol === 'file:') return 'http://localhost:8000';
    const devPorts = ['3000', '5500', '5501', '5173', '8080', '8081', '4200'];
    if (devPorts.includes(loc.port)) return 'http://localhost:8000';
    return '';
})();
console.info('[EnginePro] API_BASE =', API_BASE || '(mismo origen)');

/* ─── State ─── */
let catalogos = {};
let resultado = null;
let currentPatternIdx = 0;
let patternAnimInterval = null;
let numSpans = 2;
let unidades = 'KN';   // 'KN' | 'KGF'
let autoMode = false;
let liveValidateTimer = null;

/* ─── Three.js ─── */
let scene3D, camera3D, renderer3D, controls3D, animFrameId, ro3D = null;
let meshConcrete = null, barsGroup = null, deformGroup = null;
let resultado3D = null;
let showDeformed = false;
let heatMode = 'none';       // 'none' | 'moment' | 'shear' | 'defl'
let deflScaleMult = 100;     // multiplicador de exageración (slider)
let pulsingLight = null;
let holoTime = 0;
let userTouched3D = false;    // el usuario tocó la cámara → para el auto-giro

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', async () => {
    await loadCatalogos();
    setupEventListeners();
    updateSpans();
});

async function loadCatalogos() {
    try {
        const res = await fetch(`${API_BASE}/api/catalogos`);
        catalogos = await res.json();
        populateSelects();
    } catch (e) {
        showToast('Error cargando catálogos. Verifique conexión.', 'err');
    }
}

function populateSelects() {
    ['malla_sup', 'malla_inf'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        catalogos.mallas.forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.textContent = m; sel.appendChild(o);
        });
    });
    ['grafil_sup', 'grafil_inf'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        catalogos.grafiles.forEach(g => {
            const o = document.createElement('option');
            o.value = g; o.textContent = g; sel.appendChild(o);
        });
    });
    document.getElementById('malla_sup').value = catalogos.mallas[0];
    document.getElementById('malla_inf').value = catalogos.mallas[2];
    document.getElementById('grafil_sup').value = catalogos.grafiles[0];
    document.getElementById('grafil_inf').value = catalogos.grafiles[0];
}

function setupEventListeners() {
    document.getElementById('btn-add-span').addEventListener('click', () => changeSpans(1));
    document.getElementById('btn-rm-span').addEventListener('click', () => changeSpans(-1));
    document.getElementById('btn-calcular').addEventListener('click', calcular);
    document.getElementById('btn-memoria').addEventListener('click', () =>
        document.getElementById('modal-registro').classList.add('active'));
    document.getElementById('btn-unidades').addEventListener('click', toggleUnidades);

    /* Modo híbrido */
    document.getElementById('toggle-auto').addEventListener('change', e => setAutoMode(e.target.checked));
    document.getElementById('btn-opt-params').addEventListener('click', () => {
        const p = document.getElementById('opt-params');
        const btn = document.getElementById('btn-opt-params');
        const visible = p.style.display !== 'none';
        p.style.display = visible ? 'none' : 'flex';
        btn.classList.toggle('active', !visible);
    });

    /* Validación live en modo manual */
    const liveSel = '#h, #fc, #fy, #cv, #cm_adic, #malla_sup, #malla_inf, #grafil_sup, #grafil_inf';
    document.querySelectorAll(liveSel).forEach(el => {
        el.addEventListener('input', scheduleLiveValidate);
        el.addEventListener('change', scheduleLiveValidate);
    });
    document.getElementById('spans-container').addEventListener('input', scheduleLiveValidate);

    /* Slider de exageración de deformada */
    const sl = document.getElementById('defl-scale');
    if (sl) sl.addEventListener('input', e => {
        deflScaleMult = parseInt(e.target.value) || 100;
        document.getElementById('defl-scale-val').textContent = `×${deflScaleMult}`;
        if (resultado3D && renderer3D) buildSlab3D(resultado3D);
    });
}

/* ─── MODO HÍBRIDO ─── */
function setAutoMode(enabled) {
    autoMode = enabled;
    const bloqueados = ['h', 'malla_sup', 'malla_inf', 'grafil_sup', 'grafil_inf'];
    bloqueados.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = enabled;
        el.classList.toggle('locked', enabled);
    });
    document.querySelectorAll('.auto-card').forEach(c => c.classList.toggle('active', enabled));
    document.getElementById('btn-calcular').innerHTML = enabled
        ? '<span class="btn-icon">✦</span> OPTIMIZAR'
        : '<span class="btn-icon">⟐</span> CALCULAR';
    const badge = document.getElementById('opt-badge');
    const vb = document.getElementById('validity-badge');
    if (!enabled) { badge.style.display = 'none'; }
    else { vb.style.display = 'none'; clearLiveValidation(); }
}

function clearLiveValidation() {
    document.querySelectorAll('.form-input, .form-select').forEach(el => {
        el.classList.remove('valid-live', 'invalid-live');
    });
}

function scheduleLiveValidate() {
    if (autoMode) return;
    clearTimeout(liveValidateTimer);
    liveValidateTimer = setTimeout(runLiveValidate, 450);
}

async function runLiveValidate() {
    const inputs = document.querySelectorAll('.form-input, .form-select');
    try {
        const res = await fetch(`${API_BASE}/api/calcular`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload()),
        });
        if (!res.ok) throw new Error('calc-fail');
        const R = await res.json();
        const ok = R.estado === 'CUMPLE';
        const vb = document.getElementById('validity-badge');
        vb.style.display = 'flex';
        vb.className = 'validity-badge ' + (ok ? 'ok' : 'fail');
        if (ok) {
            vb.innerHTML = '<span class="v-icon">✔</span><span>Diseño cumple NSR-10</span>';
        } else {
            const fails = Object.entries(R.verificaciones || {})
                .filter(([_, v]) => !v).map(([k]) => k.split(' (')[0]);
            vb.innerHTML = `<span class="v-icon">✘</span><span>Falla: ${fails.slice(0, 2).join(' · ') || 'revisar'}</span>`;
        }
        inputs.forEach(el => {
            el.classList.remove('valid-live', 'invalid-live');
            if (!el.disabled) el.classList.add(ok ? 'valid-live' : 'invalid-live');
        });
    } catch (e) { /* silencioso */ }
}

/* ─── Unidades ─── */
function toggleUnidades() {
    unidades = unidades === 'KN' ? 'KGF' : 'KN';
    document.getElementById('btn-unidades').textContent = unidades === 'KN' ? 'KN → KGF' : 'KGF → KN';
    document.getElementById('btn-unidades').classList.toggle('on', unidades === 'KGF');
    if (resultado) renderResults();
}
function toU(valKN) { return unidades === 'KGF' ? valKN * 101.972 : valKN; }
function toUm(valKNm) { return unidades === 'KGF' ? valKNm * 101.972 : valKNm; }
function unitMom() { return unidades === 'KGF' ? 'kgf·m' : 'kN·m'; }
function unitF() { return unidades === 'KGF' ? 'kgf' : 'kN'; }
function unitDist() { return unidades === 'KGF' ? 'kgf/m' : 'kN/m'; }
function unitP() { return unidades === 'KGF' ? 'kgf/m²' : 'kN/m²'; }
function fmt2(v) { return toU(v).toFixed(2); }
function fmt2m(v) { return toUm(v).toFixed(2); }

/* ─── Spans ─── */
function changeSpans(delta) {
    numSpans = Math.max(1, Math.min(6, numSpans + delta));
    updateSpans();
}
function updateSpans() {
    const c = document.getElementById('spans-container');
    const vals = Array.from(c.querySelectorAll('.span-input')).map(i => i.value);
    let html = '';
    for (let i = 0; i < numSpans; i++) {
        const v = vals[i] || '4.00';
        html += `<div class="span-wrap"><span class="span-label">L${i + 1}</span>
        <input type="number" class="form-input span-input" value="${v}" step="0.05" min="1" max="15"></div>`;
    }
    c.innerHTML = html;
    document.getElementById('spans-count').textContent = `${numSpans} vano${numSpans > 1 ? 's' : ''}`;
}
function getSpanValues() {
    return Array.from(document.querySelectorAll('.span-input')).map(i => parseFloat(i.value) || 4.0);
}

/* ─── Tabs ─── */
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'tab-3d' && resultado3D && !renderer3D) init3DViewer(resultado3D);
    if (tabId === 'tab-3d' && renderer3D) onResize3D();
    // Plotly necesita un resize al hacerse visible (se dibujó con la pestaña oculta).
    if (typeof Plotly !== 'undefined' && Plotly.Plots) {
        const ids = tabId === 'tab-diagramas' ? ['chart-moment', 'chart-shear', 'chart-deflection']
                  : tabId === 'tab-patrones' ? ['chart-patterns'] : [];
        ids.forEach(id => { const el = document.getElementById(id); if (el && el.data) Plotly.Plots.resize(el); });
    }
}

/* ─── Payload ─── */
function buildPayload() {
    return {
        tipo_losa: 'Maciza',
        luces: getSpanValues(),
        h: parseFloat(document.getElementById('h').value) || 15,
        fc: parseFloat(document.getElementById('fc').value) || 21,
        fy: parseFloat(document.getElementById('fy').value) || 420,
        cv: parseFloat(document.getElementById('cv').value) || 180,
        cm_adic: parseFloat(document.getElementById('cm_adic').value) || 150,
        malla_sup: document.getElementById('malla_sup').value,
        grafil_sup: document.getElementById('grafil_sup').value,
        malla_inf: document.getElementById('malla_inf').value,
        grafil_inf: document.getElementById('grafil_inf').value,
    };
}

/* ─── CALCULAR / OPTIMIZAR ─── */
async function calcular() {
    const btn = document.getElementById('btn-calcular');
    const origHTML = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = autoMode
        ? '<span class="btn-icon">⟳</span> Optimizando...'
        : '<span class="btn-icon">⟳</span> Calculando...';
    try {
        const url = autoMode ? `${API_BASE}/api/optimizar` : `${API_BASE}/api/calcular`;
        const body = autoMode ? buildOptimizarPayload() : buildPayload();
        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Error'); }
        resultado = await res.json();
        if (autoMode && resultado.optimizacion) {
            reflectOptimoEnForm(resultado);
            renderOptBadge(resultado.optimizacion);
        }
        resultado3D = resultado;
        renderResults();
        document.getElementById('btn-memoria').disabled = false;
        showToast(autoMode ? 'Optimización completada ✓' : 'Cálculo completado ✓', 'ok');
    } catch (e) {
        showToast('Error: ' + e.message, 'err');
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = origHTML;
    }
}

function buildOptimizarPayload() {
    return {
        luces: getSpanValues(),
        fc: parseFloat(document.getElementById('fc').value) || 21,
        fy: parseFloat(document.getElementById('fy').value) || 420,
        cv: parseFloat(document.getElementById('cv').value) || 180,
        cm_adic: parseFloat(document.getElementById('cm_adic').value) || 150,
        precio_concreto_m3: parseFloat(document.getElementById('precio_concreto').value) || 450000,
        precio_acero_kg: parseFloat(document.getElementById('precio_acero').value) || 4800,
        extra_cm: parseInt(document.getElementById('extra_cm').value) || 15,
        historial_completo: false,
    };
}

function reflectOptimoEnForm(R) {
    document.getElementById('h').value = R.h;
    if (document.querySelector(`#malla_sup option[value="${CSS.escape(R.malla_sup)}"]`))
        document.getElementById('malla_sup').value = R.malla_sup;
    if (document.querySelector(`#malla_inf option[value="${CSS.escape(R.malla_inf)}"]`))
        document.getElementById('malla_inf').value = R.malla_inf;
    if (document.querySelector(`#grafil_sup option[value="${CSS.escape(R.grafil_sup)}"]`))
        document.getElementById('grafil_sup').value = R.grafil_sup;
    if (document.querySelector(`#grafil_inf option[value="${CSS.escape(R.grafil_inf)}"]`))
        document.getElementById('grafil_inf').value = R.grafil_inf;
}

function renderOptBadge(opt) {
    const m = opt.mejor;
    const badge = document.getElementById('opt-badge');
    const fmt = n => Math.round(n).toLocaleString('es-CO');
    badge.style.display = 'block';
    badge.innerHTML = `
        <div class="opt-badge-title">✦ Diseño óptimo</div>
        <div class="opt-badge-row"><span>Espesor</span><b>${m.h} cm</b></div>
        <div class="opt-badge-row"><span>Malla inf</span><b>${m.malla_inf}</b></div>
        <div class="opt-badge-row"><span>Malla sup</span><b>${m.malla_sup}</b></div>
        <div class="opt-badge-row"><span>Concreto</span><b>${m.costo.vol_concreto_m3} m³</b></div>
        <div class="opt-badge-row"><span>Acero</span><b>${fmt(m.costo.peso_acero_kg)} kg</b></div>
        <div class="opt-cost"><span>Costo total</span><span>$ ${fmt(m.costo.costo_total)}</span></div>
    `;
}

/* ─── RENDER ─── */
function renderResults() {
    const R = resultado;
    document.getElementById('welcome-state').style.display = 'none';
    document.getElementById('results-content').style.display = 'flex';

    renderVerdictBar(R);
    renderKpiStrip(R);
    renderMomentChart(R);
    renderShearChart(R);
    renderDeflectionChart(R);
    renderSectionSVG(R);
    renderPatternAnimation(R);
    renderVerifTable(R);

    if (renderer3D) buildSlab3D(R);
    else if (document.getElementById('tab-3d').classList.contains('active')) init3DViewer(R);
}

/* ─── Veredicto compacto (siempre visible, sin clic) ─── */
function renderVerdictBar(R) {
    const checks = [
        { k: 'M⁺', ok: R.cumple_pos, full: 'Flexión positiva φMn≥Mu⁺' },
        { k: 'M⁻', ok: R.cumple_neg, full: 'Flexión negativa φMn≥Mu⁻' },
        { k: 'V', ok: R.cumple_cortante, full: 'Cortante φVc≥Vu' },
        { k: 'δL', ok: R.cumple_delta_L, full: 'Deflexión viva L/360' },
        { k: 'δLP', ok: R.cumple_delta_LP, full: 'Deflexión largo plazo L/480' },
        { k: 'As⁺', ok: R.cumple_as_min_inf, full: 'As mínimo inferior' },
        { k: 'As⁻', ok: R.cumple_as_min_sup, full: 'As mínimo superior' },
        { k: 'h', ok: R.cumple_h_min, full: 'Espesor mínimo' },
        { k: 'z⁺', ok: R.cumple_fisura_pos, full: 'Fisuración positiva z≤31000' },
        { k: 'z⁻', ok: R.cumple_fisura_neg, full: 'Fisuración negativa z≤31000' },
        { k: 'ρ', ok: R.cumple_rho_max, full: 'Cuantía máxima' },
    ];
    const overall = R.estado === 'CUMPLE';
    const nFail = checks.filter(c => !c.ok).length;
    const pill = `<div class="verdict-pill ${overall ? 'cumple' : 'no-cumple'}">${overall ? '✔ CUMPLE NSR-10' : `✘ NO CUMPLE · ${nFail} falla${nFail > 1 ? 's' : ''}`}</div>`;
    const dots = checks.map(c =>
        `<span class="check-chip ${c.ok ? 'ok' : 'fail'}" title="${c.full}: ${c.ok ? 'cumple' : 'NO cumple'}" onclick="switchTab('tab-verificaciones')"><span class="cd"></span>${c.k}</span>`).join('');
    document.getElementById('verdict-bar').innerHTML = pill + `<div class="check-dots">${dots}</div>`;
}

/* ─── KPIs pequeños (abajo, sin estorbar) ─── */
function renderKpiStrip(R) {
    document.getElementById('kpi-strip').innerHTML = [
        { val: fmt2m(R.mu_pos), unit: unitMom(), label: 'Mu⁺ máx' },
        { val: fmt2m(R.mu_neg), unit: unitMom(), label: 'Mu⁻ máx' },
        { val: fmt2(R.vu_max), unit: unitF(), label: 'Vu máx' },
        { val: R.delta_LP_mm.toFixed(2), unit: 'mm', label: 'δ Largo Plazo' },
        { val: fmt2(R.wu_max), unit: unitDist(), label: 'Wu (1.2D+1.6L)' },
        { val: (unidades === 'KGF' ? R.pp_total : R.pp_total / 101.972).toFixed(unidades === 'KGF' ? 0 : 2),
          unit: unitP(), label: 'Peso propio' },
    ].map(k => `<div class="kpi-chip"><div class="kv">${k.val}<span>${k.unit}</span></div><div class="kl">${k.label}</div></div>`).join('');
}

/* ─── PLOTLY (tema HYPERION) ─── */
const PLY_LAYOUT = {
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(8,12,24,0.45)',
    font: { family: 'JetBrains Mono,monospace', size: 10.5, color: '#b7c5dc' },
    margin: { l: 62, r: 20, t: 14, b: 44 },
    xaxis: { gridcolor: 'rgba(170,220,255,0.08)', zerolinecolor: 'rgba(170,220,255,0.25)',
             zerolinewidth: 1.5, title: { text: 'Longitud (m)', font: { size: 10.5, color: '#7a8aa3' } }, tickfont: { size: 10 } },
    yaxis: { gridcolor: 'rgba(170,220,255,0.08)', zerolinecolor: 'rgba(170,220,255,0.25)', zerolinewidth: 1.5, tickfont: { size: 10 } },
    legend: { font: { size: 10 }, bgcolor: 'rgba(0,0,0,0)', orientation: 'h', y: -0.18 },
    hovermode: 'x unified',
    hoverlabel: { bgcolor: '#0d1426', bordercolor: '#00e5ff', font: { family: 'JetBrains Mono', size: 11 } },
};
const PLY_CFG = { responsive: true, displayModeBar: 'hover', modeBarButtonsToRemove: ['lasso2d', 'select2d'], displaylogo: false };

function suppShapes(R) {
    const sh = [];
    [0, ...R.L_list.map((_, i) => R.L_list.slice(0, i + 1).reduce((a, b) => a + b, 0))].forEach(x => {
        sh.push({ type: 'line', x0: x, x1: x, y0: 0, y1: 0, xref: 'x', yref: 'paper',
                  line: { color: 'rgba(170,220,255,0.30)', width: 1.5, dash: 'dot' } });
    });
    return sh;
}

function renderMomentChart(R) {
    const sc = unidades === 'KGF' ? 101.972 : 1;
    const M_pos = R.M_env_max.map(v => v * sc);
    const M_neg = R.M_env_min.map(v => v * sc);
    const iMax = M_pos.indexOf(Math.max(...M_pos));
    const iMin = M_neg.indexOf(Math.min(...M_neg));
    const anns = [];
    if (Math.abs(M_pos[iMax]) > 0.01) anns.push({ x: R.x_global[iMax], y: M_pos[iMax],
        text: `<b>${M_pos[iMax].toFixed(2)}</b>`, showarrow: true, arrowhead: 2, arrowcolor: '#ff3b5c',
        font: { size: 10, color: '#ff3b5c' }, bgcolor: 'rgba(13,20,38,0.9)', borderpad: 3, ay: -28 });
    if (Math.abs(M_neg[iMin]) > 0.01) anns.push({ x: R.x_global[iMin], y: M_neg[iMin],
        text: `<b>${M_neg[iMin].toFixed(2)}</b>`, showarrow: true, arrowhead: 2, arrowcolor: '#3D7EFF',
        font: { size: 10, color: '#3D7EFF' }, bgcolor: 'rgba(13,20,38,0.9)', borderpad: 3, ay: 28 });
    Plotly.newPlot('chart-moment', [
        { x: R.x_global, y: M_pos, name: 'M⁺', line: { color: '#ff3b5c', width: 2.5, shape: 'spline' },
          fill: 'tozeroy', fillcolor: 'rgba(255,59,92,0.08)', hovertemplate: `M⁺=<b>%{y:.2f}</b> ${unitMom()}<extra></extra>` },
        { x: R.x_global, y: M_neg, name: 'M⁻', line: { color: '#3D7EFF', width: 2.5, shape: 'spline' },
          fill: 'tozeroy', fillcolor: 'rgba(61,126,255,0.08)', hovertemplate: `M⁻=<b>%{y:.2f}</b> ${unitMom()}<extra></extra>` },
    ], { ...PLY_LAYOUT, yaxis: { ...PLY_LAYOUT.yaxis, title: { text: `Mu (${unitMom()})`, font: { size: 10.5 } }, autorange: 'reversed' },
        shapes: suppShapes(R), annotations: anns }, PLY_CFG);
}

function renderShearChart(R) {
    const sc = unidades === 'KGF' ? 101.972 : 1;
    const vcVal = R.phi_vc * sc;
    const Vmax = R.V_env_max.map(v => v * sc);
    const Vmin = R.V_env_min.map(v => v * sc);
    const iMax = Vmax.indexOf(Math.max(...Vmax));
    const iMin = Vmin.indexOf(Math.min(...Vmin));
    const anns = [];
    if (Math.abs(Vmax[iMax]) > 0.01) anns.push({ x: R.x_global[iMax], y: Vmax[iMax],
        text: `<b>${Vmax[iMax].toFixed(2)}</b>`, showarrow: true, arrowhead: 2, arrowcolor: '#39ff14',
        font: { size: 10, color: '#39ff14' }, bgcolor: 'rgba(13,20,38,0.9)', borderpad: 3, ay: -28 });
    if (Math.abs(Vmin[iMin]) > 0.01) anns.push({ x: R.x_global[iMin], y: Vmin[iMin],
        text: `<b>${Vmin[iMin].toFixed(2)}</b>`, showarrow: true, arrowhead: 2, arrowcolor: '#39ff14',
        font: { size: 10, color: '#39ff14' }, bgcolor: 'rgba(13,20,38,0.9)', borderpad: 3, ay: 28 });
    const xLim = [R.x_global[0], R.x_global[R.x_global.length - 1]];
    Plotly.newPlot('chart-shear', [
        { x: R.x_global, y: Vmax, name: 'V máx', line: { color: '#39ff14', width: 2.5 },
          fill: 'tozeroy', fillcolor: 'rgba(57,255,20,0.07)', hovertemplate: `V⁺=<b>%{y:.2f}</b> ${unitF()}<extra></extra>` },
        { x: R.x_global, y: Vmin, name: 'V mín', line: { color: '#39ff14', width: 2, dash: 'dash' },
          fill: 'tozeroy', fillcolor: 'rgba(57,255,20,0.04)', hovertemplate: `V⁻=<b>%{y:.2f}</b> ${unitF()}<extra></extra>` },
        { x: xLim, y: [vcVal, vcVal], name: `φVc=${vcVal.toFixed(2)} ${unitF()}`, mode: 'lines+markers',
          line: { color: '#ffc233', width: 2, dash: 'dashdot' }, marker: { symbol: 'diamond', size: 6, color: '#ffc233' },
          hovertemplate: `+φVc=<b>${vcVal.toFixed(2)}</b> ${unitF()}<extra></extra>` },
        { x: xLim, y: [-vcVal, -vcVal], name: `-φVc`, mode: 'lines+markers', showlegend: false,
          line: { color: '#ffc233', width: 2, dash: 'dashdot' }, marker: { symbol: 'diamond', size: 6, color: '#ffc233' },
          hovertemplate: `-φVc=<b>${(-vcVal).toFixed(2)}</b> ${unitF()}<extra></extra>` },
    ], { ...PLY_LAYOUT, yaxis: { ...PLY_LAYOUT.yaxis, title: { text: `Vu (${unitF()})`, font: { size: 10.5 } } },
        shapes: suppShapes(R), annotations: anns }, PLY_CFG);
}

function renderDeflectionChart(R) {
    const traces = [];
    if (R.delta_DL_x && R.delta_DL_x.length > 0)
        traces.push({ x: R.x_global, y: R.delta_DL_x.map(v => v * 1000), name: `δ(D+L)=${R.delta_DL_mm.toFixed(2)}mm`,
            line: { color: '#b983ff', width: 2, dash: 'dash', shape: 'spline' }, hovertemplate: 'δ(D+L)=<b>%{y:.3f}</b> mm<extra></extra>' });
    if (R.delta_LP_x && R.delta_LP_x.length > 0)
        traces.push({ x: R.x_global, y: R.delta_LP_x.map(v => v * 1000), name: `δLP=${R.delta_LP_mm.toFixed(2)}mm`,
            line: { color: '#ff3b5c', width: 2.5, shape: 'spline' }, fill: 'tozeroy', fillcolor: 'rgba(255,59,92,0.07)',
            hovertemplate: 'δLP=<b>%{y:.3f}</b> mm<extra></extra>' });
    if (!traces.length) return;
    Plotly.newPlot('chart-deflection', traces, { ...PLY_LAYOUT,
        yaxis: { ...PLY_LAYOUT.yaxis, title: { text: 'δ (mm)', font: { size: 10.5 } }, autorange: 'reversed' },
        shapes: suppShapes(R) }, PLY_CFG);
}

/* ─── SECTION SVG ─── */
function renderSectionSVG(R) {
    document.getElementById('section-svg').innerHTML = buildSectionSVG(R);
}
/* SVG de la sección transversal — también lo consume la memoria. Devuelve string. */
function buildSectionSVG(R) {
    const H_MIN = 80, H_MAX = 200, B_BASE = 260;
    let px_per_cm = B_BASE / 100;
    const h_natural = R.h * px_per_cm;
    if (h_natural < H_MIN) px_per_cm = H_MIN / R.h;
    if (h_natural > H_MAX) px_per_cm = H_MAX / R.h;

    const px_per_mm = px_per_cm / 10;
    const b_draw = 100 * px_per_cm;
    const hd = R.h * px_per_cm;
    const rec = 3 * px_per_cm;

    const x0 = 75, y0 = 70;
    const W = Math.round(x0 + b_draw + 90);
    const H = Math.round(y0 + hd + 80);

    const colSup = '#3D7EFF', colSupDk = '#1D4ED8', colInf = '#ff6b35', colInfDk = '#B91C1C';
    const colDim = '#7a8aa3', colBg = '#0d1426', colConc = '#aeb6c6', colEdge = '#3D4A5C';

    const sep_inf_px = (R.sep_malla_inf || 15) * px_per_cm;
    const sep_sup_px = (R.sep_malla_sup || 15) * px_per_cm;
    const nInf = Math.max(2, Math.min(Math.floor(b_draw / Math.max(sep_inf_px, 3)), 20));
    const nSup = Math.max(2, Math.min(Math.floor(b_draw / Math.max(sep_sup_px, 3)), 20));
    const spInfPx = b_draw / (nInf + 1);
    const spSupPx = b_draw / (nSup + 1);

    const barR = (db_mm, sp_px) => Math.min((db_mm / 2) * px_per_mm, sp_px * 0.42);
    const rMI = barR(R.db_malla_inf || 5, spInfPx);
    const rMS = barR(R.db_malla_sup || 4, spSupPx);
    const rGI = R.db_grafil_inf > 0 ? barR(R.db_grafil_inf, spInfPx * 0.5) : 0;
    const rGS = R.db_grafil_sup > 0 ? barR(R.db_grafil_sup, spSupPx * 0.5) : 0;

    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
        style="max-width:100%;height:auto;background:${colBg};border-radius:8px">
    <defs>
      <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="8" stroke="${colEdge}" stroke-width="0.4" opacity="0.5"/>
      </pattern>
      <filter id="gs"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="gi"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;

    svg += `<rect x="${x0}" y="${y0}" width="${b_draw}" height="${hd}" fill="${colConc}" rx="2"/>`;
    svg += `<rect x="${x0}" y="${y0}" width="${b_draw}" height="${hd}" fill="url(#hatch)" opacity="0.55"/>`;
    svg += `<rect x="${x0}" y="${y0}" width="${b_draw}" height="${hd}" fill="none" stroke="${colEdge}" stroke-width="2" rx="2"/>`;

    svg += `<line x1="${x0 + 4}" y1="${y0}" x2="${x0 + 4}" y2="${y0 + rec}" stroke="${colDim}" stroke-width="0.8" stroke-dasharray="3,2"/>`;
    svg += `<line x1="${x0 + 4}" y1="${y0 + hd}" x2="${x0 + 4}" y2="${y0 + hd - rec}" stroke="${colDim}" stroke-width="0.8" stroke-dasharray="3,2"/>`;
    svg += `<text x="${x0 + 8}" y="${y0 + hd - rec / 2 + 3}" fill="${colDim}" font-size="8.5" font-family="Inter,sans-serif">r=3cm</text>`;

    svg += `<line x1="${x0 + 6}" y1="${y0 + rec}" x2="${x0 + b_draw - 6}" y2="${y0 + rec}" stroke="${colSup}" stroke-width="0.5" stroke-dasharray="4,3" opacity="0.2"/>`;
    svg += `<line x1="${x0 + 6}" y1="${y0 + hd - rec}" x2="${x0 + b_draw - 6}" y2="${y0 + hd - rec}" stroke="${colInf}" stroke-width="0.5" stroke-dasharray="4,3" opacity="0.2"/>`;

    for (let i = 0; i < nInf; i++) {
        const bx = x0 + (i + 1) * spInfPx, by = y0 + hd - rec;
        svg += `<circle cx="${bx}" cy="${by}" r="${rMI}" fill="${colInf}" stroke="${colInfDk}" stroke-width="1" filter="url(#gi)"/>`;
    }
    if (rGI > 0) for (let i = 0; i < nInf - 1; i++) {
        const bx = x0 + (i + 1) * spInfPx + spInfPx / 2, by = y0 + hd - rec;
        if (bx < x0 + b_draw - rGI) svg += `<circle cx="${bx}" cy="${by}" r="${rGI}" fill="${colInf}" stroke="${colInfDk}" stroke-width="0.8" opacity="0.8"/>`;
    }
    for (let i = 0; i < nSup; i++) {
        const bx = x0 + (i + 1) * spSupPx, by = y0 + rec;
        svg += `<circle cx="${bx}" cy="${by}" r="${rMS}" fill="${colSup}" stroke="${colSupDk}" stroke-width="1" filter="url(#gs)"/>`;
    }
    if (rGS > 0) for (let i = 0; i < nSup - 1; i++) {
        const bx = x0 + (i + 1) * spSupPx + spSupPx / 2, by = y0 + rec;
        if (bx < x0 + b_draw - rGS) svg += `<circle cx="${bx}" cy="${by}" r="${rGS}" fill="${colSup}" stroke="${colSupDk}" stroke-width="0.8" opacity="0.8"/>`;
    }

    svg += dimV(x0 + b_draw + 22, y0, y0 + hd, `h=${R.h}cm`, colDim);
    svg += dimV(x0 + b_draw + 52, y0, y0 + hd - rec, `d=${R.d}cm`, colDim);
    svg += dimH(x0, x0 + b_draw, y0 + hd + 42, 'b=100cm', colDim);

    const lblSup = rebarLabel(R.malla_sup, R.grafil_sup);
    const lblInf = rebarLabel(R.malla_inf, R.grafil_inf);
    const pw = Math.min(lblSup.length * 6.2 + 20, b_draw);
    svg += `<rect x="${x0 + (b_draw - pw) / 2}" y="${y0 - 30}" width="${pw}" height="18" fill="rgba(61,126,255,0.14)" stroke="rgba(61,126,255,0.5)" stroke-width="1" rx="4"/>`;
    svg += `<text x="${x0 + b_draw / 2}" y="${y0 - 17}" fill="${colSup}" font-size="9" font-weight="700" font-family="Inter,sans-serif" text-anchor="middle">SUP: ${lblSup}</text>`;
    const iw = Math.min(lblInf.length * 6.2 + 20, b_draw);
    svg += `<rect x="${x0 + (b_draw - iw) / 2}" y="${y0 + hd + 14}" width="${iw}" height="18" fill="rgba(255,107,53,0.14)" stroke="rgba(255,107,53,0.5)" stroke-width="1" rx="4"/>`;
    svg += `<text x="${x0 + b_draw / 2}" y="${y0 + hd + 27}" fill="${colInf}" font-size="9" font-weight="700" font-family="Inter,sans-serif" text-anchor="middle">INF: ${lblInf}</text>`;
    svg += '</svg>';
    return svg;
}

function rebarLabel(m, g) { let l = m; if (g && g !== 'Sin Grafil') l += ' + ' + g; return l; }
function dimH(x1, x2, y, label, col) { const aw = 5, ah = 3; let s = '';
    s += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="0.9"/>`;
    s += `<polygon points="${x1},${y} ${x1 + aw},${y - ah} ${x1 + aw},${y + ah}" fill="${col}"/>`;
    s += `<polygon points="${x2},${y} ${x2 - aw},${y - ah} ${x2 - aw},${y + ah}" fill="${col}"/>`;
    s += `<line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}" stroke="${col}" stroke-width="0.7"/>`;
    s += `<line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}" stroke="${col}" stroke-width="0.7"/>`;
    s += `<text x="${(x1 + x2) / 2}" y="${y + 13}" fill="${col}" font-size="9.5" text-anchor="middle" font-family="Inter,sans-serif" font-weight="500">${label}</text>`; return s; }
function dimV(x, y1, y2, label, col) { const aw = 3, ah = 5; let s = '';
    s += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${col}" stroke-width="0.9"/>`;
    s += `<polygon points="${x},${y1} ${x - aw},${y1 + ah} ${x + aw},${y1 + ah}" fill="${col}"/>`;
    s += `<polygon points="${x},${y2} ${x - aw},${y2 - ah} ${x + aw},${y2 - ah}" fill="${col}"/>`;
    s += `<line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}" stroke="${col}" stroke-width="0.7"/>`;
    s += `<line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}" stroke="${col}" stroke-width="0.7"/>`;
    s += `<text x="${x + 9}" y="${(y1 + y2) / 2 + 4}" fill="${col}" font-size="9.5" font-family="Inter,sans-serif" font-weight="500">${label}</text>`; return s; }

/* ═══════════════════════════════════════════════════════════════════
   THREE.JS 3D VIEWER — HYPERION (suelo circular + auto-giro + cosmos)
   ═══════════════════════════════════════════════════════════════════ */
function init3DViewer(R) {
    const container = document.getElementById('viewer-3d');
    if (!container) return;
    if (typeof THREE === 'undefined') { container.innerHTML = '<div style="padding:30px;color:#ff3b5c;font-family:monospace">Three.js no cargó (revisa tu conexión).</div>'; return; }
    dispose3D();
    container.innerHTML = '';
    holoTime = 0; userTouched3D = false;

    const W = container.clientWidth || 800, H = container.clientHeight || 560;

    scene3D = new THREE.Scene();
    scene3D.background = null;                         // cosmos detrás (renderer alpha)
    scene3D.fog = new THREE.Fog(0x060912, 28, 120);

    camera3D = new THREE.PerspectiveCamera(45, W / H, 0.1, 400);

    renderer3D = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer3D.setSize(W, H);
    renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer3D.outputColorSpace = THREE.SRGBColorSpace || renderer3D.outputColorSpace;
    renderer3D.shadowMap.enabled = true;
    renderer3D.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer3D.toneMapping = THREE.ACESFilmicToneMapping;
    renderer3D.toneMappingExposure = 1.12;
    renderer3D.setClearColor(0x000000, 0);
    container.appendChild(renderer3D.domElement);

    /* ── Iluminación cinematográfica (los “reflejos” espaciales) ── */
    scene3D.add(new THREE.AmbientLight('#1a1a3a', 0.42));
    scene3D.add(new THREE.HemisphereLight('#3a4a77', '#0a0a18', 0.55));

    const keyLight = new THREE.DirectionalLight('#ffeedd', 2.4);
    keyLight.position.set(4, 11, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 90;
    keyLight.shadow.camera.left = -18; keyLight.shadow.camera.right = 18;
    keyLight.shadow.camera.top = 12; keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0001; keyLight.shadow.normalBias = 0.02;
    scene3D.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#3355aa', 0.6);
    fillLight.position.set(-4, 3, -4);
    scene3D.add(fillLight);

    pulsingLight = new THREE.PointLight('#b983ff', 2.4, 22);
    pulsingLight.position.set(1, 3.5, -6);
    scene3D.add(pulsingLight);

    const accentLight = new THREE.PointLight('#00e5ff', 1.2, 14);
    accentLight.position.set(2, 0.4, -2);
    scene3D.add(accentLight);

    /* ── OrbitControls: auto-giro hasta que el usuario toca ── */
    controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement);
    controls3D.enableDamping = true;
    controls3D.dampingFactor = 0.08;
    controls3D.rotateSpeed = 0.9;
    controls3D.zoomSpeed = 1.0;
    controls3D.minDistance = 2;
    controls3D.maxDistance = 80;
    controls3D.maxPolarAngle = Math.PI * 0.92;
    controls3D.autoRotate = true;
    controls3D.autoRotateSpeed = 0.65;
    const rb = document.getElementById('btn-rotate'); if (rb) rb.classList.add('active');
    controls3D.addEventListener('start', () => {
        userTouched3D = true;
        controls3D.autoRotate = false;
        const b = document.getElementById('btn-rotate'); if (b) b.classList.remove('active');
    });

    buildSlab3D(R);

    ro3D = new ResizeObserver(onResize3D);
    ro3D.observe(container);

    (function animate(ts) {
        animFrameId = requestAnimationFrame(animate);
        holoTime = (ts || 0) * 0.001;
        if (pulsingLight) pulsingLight.intensity = 2.4 + Math.sin(holoTime * 2.3) * 0.8;
        if (controls3D) controls3D.update();
        renderer3D.render(scene3D, camera3D);
    })();
}

function onResize3D() {
    const container = document.getElementById('viewer-3d');
    if (!container || !renderer3D || !camera3D) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer3D.setSize(w, h);
    camera3D.aspect = w / h;
    camera3D.updateProjectionMatrix();
}

function dispose3D() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (ro3D) { ro3D.disconnect(); ro3D = null; }
    if (controls3D) { controls3D.dispose(); controls3D = null; }
    if (renderer3D) { renderer3D.dispose(); renderer3D = null; }
    scene3D = camera3D = null;
    meshConcrete = barsGroup = deformGroup = pulsingLight = null;
}

function buildSlab3D(R) {
    // Limpia geometría anterior marcada como slab
    scene3D.children.filter(c => c.userData.slab).forEach(c => scene3D.remove(c));
    meshConcrete = barsGroup = deformGroup = null;

    const L_total = R.L_list.reduce((a, b) => a + b, 0);
    const h_m = R.h / 100;
    const width = 3.0;
    const cx = -L_total / 2;

    /* ── SUELO CIRCULAR + anillo de acento cyan (estilo DESPIECE) ── */
    const floorR = Math.max(L_total, width) * 0.72 + 2.6;
    const floorGeom = new THREE.CircleGeometry(floorR, 96);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x0A0F1E, roughness: 0.45, metalness: 0.6,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.32;
    floor.receiveShadow = true;
    floor.userData.slab = true;
    scene3D.add(floor);

    const ringGeom = new THREE.RingGeometry(floorR - 0.07, floorR, 96);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00E5FF, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.318;
    ring.userData.slab = true;
    scene3D.add(ring);

    /* ── LOSA — vidrio ahumado translúcido + heatmap ── */
    const N_SEG = 80;
    const geomConc = new THREE.BoxGeometry(L_total, h_m, width, N_SEG, 1, 1);
    applyHeatmapColors(geomConc, R, L_total);

    if (heatMode === 'none') {
        const matConc = new THREE.MeshStandardMaterial({
            color: '#8899bb', roughness: 0.25, metalness: 0.15,
            transparent: true, opacity: 0.45, depthWrite: false,
        });
        meshConcrete = new THREE.Mesh(geomConc, matConc);

        const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(L_total, h_m, width, 1, 1, 1));
        meshConcrete.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.3, depthWrite: false })));
        const haloGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(L_total * 1.012, h_m * 1.012, width * 1.012, 1, 1, 1));
        meshConcrete.add(new THREE.LineSegments(haloGeo, new THREE.LineBasicMaterial({ color: '#b983ff', transparent: true, opacity: 0.12, depthWrite: false })));
    } else {
        const matConc = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF, vertexColors: true, roughness: 0.3, metalness: 0.08,
            transparent: true, opacity: 0.88, depthWrite: false,
        });
        meshConcrete = new THREE.Mesh(geomConc, matConc);
        const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(L_total, h_m, width, 1, 1, 1));
        meshConcrete.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.18, depthWrite: false })));
    }
    meshConcrete.position.set(0, h_m / 2, 0);
    meshConcrete.castShadow = true;
    meshConcrete.receiveShadow = true;
    meshConcrete.userData.slab = true;
    scene3D.add(meshConcrete);

    updateHeatLegend(R);

    /* ── Pedestales metálicos en apoyos ── */
    let apoyosX = [0];
    R.L_list.forEach(L => apoyosX.push(apoyosX[apoyosX.length - 1] + L));
    apoyosX.forEach(xa => {
        const sg = new THREE.BoxGeometry(0.10, 0.30, width + 0.15);
        const s = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#667788', roughness: 0.35, metalness: 0.8 }));
        s.position.set(cx + xa, -0.15, 0);
        s.castShadow = true; s.receiveShadow = true; s.userData.slab = true;
        s.add(new THREE.LineSegments(new THREE.EdgesGeometry(sg), new THREE.LineBasicMaterial({ color: '#889999', transparent: true, opacity: 0.2, depthWrite: false })));
        scene3D.add(s);
    });

    /* ── Refuerzo — cilindros metálicos de alto reflejo ── */
    barsGroup = new THREE.Group();
    barsGroup.userData.slab = true;
    const cover = 0.03;
    const y_inf = cover, y_sup = h_m - cover;
    const db_inf = (R.db_malla_inf || 5) / 1000;
    const db_sup = (R.db_malla_sup || 4) / 1000;
    const db_gi = (R.db_grafil_inf || 0) / 1000;
    const db_gs = (R.db_grafil_sup || 0) / 1000;

    const matInf = new THREE.MeshStandardMaterial({ color: '#00e5ff', roughness: 0.2, metalness: 0.95, emissive: '#003344' });
    const matSup = new THREE.MeshStandardMaterial({ color: '#ff8c00', roughness: 0.2, metalness: 0.95, emissive: '#331100' });
    const matGrf = new THREE.MeshStandardMaterial({ color: '#ff44aa', roughness: 0.2, metalness: 0.95, emissive: '#220022' });
    const matTrans = new THREE.MeshStandardMaterial({ color: '#88ccff', roughness: 0.2, metalness: 0.95, emissive: '#001122' });

    const sep_inf = (R.sep_malla_inf || 15) / 100;
    const sep_sup = (R.sep_malla_sup || 15) / 100;
    const nLong_inf = Math.max(3, Math.round(width / sep_inf));
    const nLong_sup = Math.max(3, Math.round(width / sep_sup));

    for (let i = 0; i < nLong_inf; i++) {
        const z = -width / 2 + (i + 0.5) * width / nLong_inf;
        addBar(barsGroup, cx, cx + L_total, y_inf, z, db_inf / 2, matInf);
    }
    for (let i = 0; i < nLong_sup; i++) {
        const z = -width / 2 + (i + 0.5) * width / nLong_sup;
        addBar(barsGroup, cx, cx + L_total, y_sup, z, db_sup / 2, matSup);
    }
    if (db_gi > 0) { const nGI = Math.max(2, Math.round(width / (sep_inf * 0.5)));
        for (let i = 0; i < nGI; i++) { const z = -width / 2 + (i + 0.5) * width / nGI + width / (nGI * 2);
            if (Math.abs(z) < width / 2) addBar(barsGroup, cx, cx + L_total, y_inf, z, db_gi / 2, matGrf); } }
    if (db_gs > 0) { const nGS = Math.max(2, Math.round(width / (sep_sup * 0.5)));
        for (let i = 0; i < nGS; i++) { const z = -width / 2 + (i + 0.5) * width / nGS + width / (nGS * 2);
            if (Math.abs(z) < width / 2) addBar(barsGroup, cx, cx + L_total, y_sup, z, db_gs / 2, matGrf); } }
    const nT = Math.min(80, Math.round(L_total / 0.15));
    const matT_inf = matTrans.clone(); matT_inf.transparent = true; matT_inf.opacity = 0.55;
    const matT_sup = matTrans.clone(); matT_sup.transparent = true; matT_sup.opacity = 0.55;
    for (let i = 0; i < nT; i++) {
        const x = cx + (i + 0.5) * L_total / nT;
        addTransBar(barsGroup, x, -width / 2, width / 2, y_inf, db_inf / 2 * 0.6, matT_inf);
        addTransBar(barsGroup, x, -width / 2, width / 2, y_sup, db_sup / 2 * 0.6, matT_sup);
    }
    scene3D.add(barsGroup);

    buildTextLabels(R, cx, L_total, h_m);

    if (showDeformed && R.delta_LP_x && R.delta_LP_x.length > 0) buildDeformed(R, cx, h_m, width, L_total);

    /* Encuadre de cámara — solo si el usuario no ha tomado el control */
    if (controls3D && !userTouched3D) frameModel3D(L_total, h_m);
}

/* Encuadra el modelo: target al centro, cámara en iso agradable. */
function frameModel3D(L_total, h_m, opts) {
    opts = opts || {};
    const r = Math.max(8, L_total * 1.35 + h_m * 2) * (opts.zoom || 1);
    controls3D.target.set(0, h_m / 2, 0);
    camera3D.position.set(r * (opts.fx ?? 0.55), r * (opts.fy ?? 0.42) + 1.2, r * (opts.fz ?? 0.78));
    controls3D.update();
}

function buildTextLabels(R, cx, L_total, h_m) {
    const labels = [];
    let cumX = 0;
    R.L_list.forEach((L, idx) => {
        const midX = cumX + L / 2;
        labels.push({ text: `VANO ${idx + 1}`, x: cx + midX, y: h_m + 0.35, z: 0, color: '#00e5ff' });
        labels.push({ text: `${L.toFixed(2)} m`, x: cx + midX, y: h_m + 0.15, z: 0, color: '#8899bb' });
        cumX += L;
    });
    let supX = 0;
    for (let i = 0; i <= R.L_list.length; i++) {
        labels.push({ text: `AP${i + 1}`, x: cx + supX, y: -0.5, z: 0, color: '#b983ff' });
        if (i < R.L_list.length) supX += R.L_list[i];
    }
    labels.forEach(l => {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 22px "JetBrains Mono", monospace';
        const tw = ctx.measureText(l.text).width || 100;
        ctx.fillStyle = 'rgba(6,9,18,0.78)';
        roundRect(ctx, 128 - tw / 2 - 14, 8, tw + 28, 40, 4); ctx.fill();
        ctx.strokeStyle = l.color; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = l.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(l.text, 128, 30);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
        sprite.position.set(l.x, l.y, l.z);
        sprite.scale.set(2.5, 0.625, 1);
        sprite.userData.slab = true;
        scene3D.add(sprite);
    });
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function buildDeformed(R, cx, h_m, width, L_total) {
    const deflMax = Math.max(...R.delta_LP_x.map(Math.abs));
    if (deflMax < 1e-8) return;
    const refScale = (h_m * 0.3) / deflMax;
    const scale = refScale * (deflScaleMult / 100);
    deformGroup = new THREE.Group(); deformGroup.userData.slab = true;
    const x_pts = R.x_global, d_pts = R.delta_LP_x;
    const pts = [];
    x_pts.forEach((x, i) => {
        const defl = (d_pts[i] || 0) * scale;
        pts.push(new THREE.Vector3(cx + x, h_m + defl + 0.005, -width / 2 - 0.08));
        pts.push(new THREE.Vector3(cx + x, h_m + defl + 0.005, width / 2 + 0.08));
    });
    const verts = [];
    for (let i = 0; i < pts.length - 2; i += 2) {
        verts.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, pts[i + 2].x, pts[i + 2].y, pts[i + 2].z);
        verts.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, pts[i + 3].x, pts[i + 3].y, pts[i + 3].z, pts[i + 2].x, pts[i + 2].y, pts[i + 2].z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    deformGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })));
    const linePts = x_pts.map((x, i) => new THREE.Vector3(cx + x, h_m + (d_pts[i] || 0) * scale + 0.006, 0));
    deformGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: '#ff44aa' })));
    scene3D.add(deformGroup);
}

/* ─── HEATMAP (vertex colors) ─── */
function heatColor(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [
        [0.00, 0x00, 0xE5, 0xFF], [0.33, 0x10, 0xB9, 0x81],
        [0.66, 0xF5, 0x9E, 0x0B], [1.00, 0xFF, 0x44, 0xAA],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (t <= b[0]) {
            const u = (t - a[0]) / (b[0] - a[0] || 1);
            return [(a[1] + (b[1] - a[1]) * u) / 255, (a[2] + (b[2] - a[2]) * u) / 255, (a[3] + (b[3] - a[3]) * u) / 255];
        }
    }
    return [1, 0, 0];
}
function heatSeries(R, mode) {
    if (!R.x_global || !R.x_global.length) return null;
    let y;
    if (mode === 'moment') y = R.x_global.map((_, i) => Math.max(Math.abs(R.M_env_max[i] || 0), Math.abs(R.M_env_min[i] || 0)));
    else if (mode === 'shear') y = R.x_global.map((_, i) => Math.max(Math.abs(R.V_env_max[i] || 0), Math.abs(R.V_env_min[i] || 0)));
    else if (mode === 'defl') { if (!R.delta_LP_x || !R.delta_LP_x.length) return null; y = R.delta_LP_x.map(v => Math.abs(v)); }
    else return null;
    return { y, min: Math.min(...y), max: Math.max(...y) };
}
function applyHeatmapColors(geom, R, L_total) {
    const s = heatMode === 'none' ? null : heatSeries(R, heatMode);
    const pos = geom.attributes.position;
    const nVerts = pos.count;
    const colors = new Float32Array(nVerts * 3);
    if (!s || (s.max - s.min) < 1e-10) {
        for (let i = 0; i < nVerts; i++) { colors[i * 3] = 0.72; colors[i * 3 + 1] = 0.75; colors[i * 3 + 2] = 0.79; }
    } else {
        const xLen = R.x_global.length;
        for (let i = 0; i < nVerts; i++) {
            const xv = pos.getX(i);
            const tx = (xv + L_total / 2) / L_total;
            const idx = Math.max(0, Math.min(xLen - 1, Math.round(tx * (xLen - 1))));
            const t = (s.y[idx] - s.min) / (s.max - s.min);
            const [r, g, b] = heatColor(t);
            colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
        }
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
function updateHeatLegend(R) {
    const el = document.getElementById('heat-legend');
    if (!el) return;
    if (heatMode === 'none') { el.style.display = 'none'; return; }
    const s = heatSeries(R, heatMode);
    if (!s) { el.style.display = 'none'; return; }
    const unit = heatMode === 'moment' ? 'kN·m' : heatMode === 'shear' ? 'kN' : 'mm';
    const title = heatMode === 'moment' ? 'Demanda de Momento |M|' : heatMode === 'shear' ? 'Demanda de Cortante |V|' : 'Deflexión largo plazo |δLP|';
    el.style.display = 'block';
    el.innerHTML = `<div class="hl-title">${title}</div><div class="hl-bar"></div>
        <div class="hl-ticks"><span>${s.min.toFixed(2)} ${unit}</span><span>${((s.min + s.max) / 2).toFixed(2)}</span><span>${s.max.toFixed(2)} ${unit}</span></div>`;
}
function setHeatMode(mode) {
    heatMode = mode;
    document.querySelectorAll('.heat-btn').forEach(b => b.classList.toggle('active', b.dataset.heat === mode));
    if (resultado3D && renderer3D) buildSlab3D(resultado3D);
}

function addBar(group, x0, x1, y, z, r, mat) {
    const geo = new THREE.CylinderGeometry(r, r, x1 - x0, 8, 1);
    geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat); m.position.set((x0 + x1) / 2, y, z); m.castShadow = true; group.add(m);
}
function addTransBar(group, x, z0, z1, y, r, mat) {
    const geo = new THREE.CylinderGeometry(r, r, z1 - z0, 6, 1); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, (z0 + z1) / 2); group.add(m);
}

/* ─── Controles del visor ─── */
function resetCamera3D() {
    if (!controls3D || !resultado3D) return;
    userTouched3D = false;
    frameModel3D(resultado3D.L_list.reduce((a, b) => a + b, 0), resultado3D.h / 100);
}
function toggleAutoRotate() {
    if (!controls3D) return;
    controls3D.autoRotate = !controls3D.autoRotate;
    if (controls3D.autoRotate) userTouched3D = false;
    document.getElementById('btn-rotate').classList.toggle('active', controls3D.autoRotate);
}
function toggleDeformed() {
    showDeformed = !showDeformed;
    document.getElementById('btn-deform').classList.toggle('active', showDeformed);
    if (resultado3D && renderer3D) buildSlab3D(resultado3D);
}

/* ─── PATTERNS ─── */
function renderPatternAnimation(R) {
    if (!R.patrones || !R.patrones.length) return;
    currentPatternIdx = 0;
    if (patternAnimInterval) { clearInterval(patternAnimInterval); patternAnimInterval = null; }
    document.getElementById('pattern-controls').innerHTML = `
        <button class="btn-pattern active" id="btn-play-patterns" onclick="togglePatternAnim()">▶ Animar</button>
        <button class="btn-pattern" onclick="prevPattern()">◀</button>
        <button class="btn-pattern" onclick="nextPattern()">▶</button>
        <span class="pattern-name" id="pattern-name">${R.patrones[0].nombre}</span>`;
    renderPatternTrace(0);
}
function renderPatternTrace(idx) {
    const R = resultado; if (!R || !R.patrones) return;
    idx = Math.max(0, Math.min(idx, R.patrones.length - 1)); currentPatternIdx = idx;
    const pat = R.patrones[idx];
    document.getElementById('pattern-name').textContent = `${idx + 1}/${R.patrones.length}: ${pat.nombre}`;
    const x = R.x_global, step = Math.max(1, Math.floor(pat.M.length / x.length));
    const sc = unidades === 'KGF' ? 101.972 : 1;
    const M = x.map((_, i) => ((pat.M[Math.min(i * step, pat.M.length - 1)]) || 0) * sc);
    Plotly.newPlot('chart-patterns', [
        { x, y: R.M_env_max.map(v => v * sc), name: 'Env M⁺', line: { color: 'rgba(255,59,92,0.2)', width: 1 }, hoverinfo: 'skip' },
        { x, y: R.M_env_min.map(v => v * sc), name: 'Env M⁻', line: { color: 'rgba(61,126,255,0.2)', width: 1 }, hoverinfo: 'skip' },
        { x, y: M, name: pat.nombre, line: { color: '#ffc233', width: 2.5, shape: 'spline' },
          fill: 'tozeroy', fillcolor: 'rgba(255,194,51,0.1)', hovertemplate: `M=<b>%{y:.2f}</b> ${unitMom()}<extra></extra>` },
    ], { ...PLY_LAYOUT, yaxis: { ...PLY_LAYOUT.yaxis, title: { text: `M (${unitMom()})`, font: { size: 10.5 } }, autorange: 'reversed' },
        shapes: suppShapes(R) }, PLY_CFG);
}
function nextPattern() { if (!resultado) return; currentPatternIdx = (currentPatternIdx + 1) % resultado.patrones.length; renderPatternTrace(currentPatternIdx); }
function prevPattern() { if (!resultado) return; currentPatternIdx = (currentPatternIdx - 1 + resultado.patrones.length) % resultado.patrones.length; renderPatternTrace(currentPatternIdx); }
function togglePatternAnim() {
    const btn = document.getElementById('btn-play-patterns');
    if (patternAnimInterval) { clearInterval(patternAnimInterval); patternAnimInterval = null; btn.textContent = '▶ Animar'; btn.classList.remove('active'); }
    else { btn.textContent = '⏸ Pausar'; btn.classList.add('active'); patternAnimInterval = setInterval(nextPattern, 1400); }
}

/* ─── VERIF TABLE ─── */
function renderVerifTable(R) {
    const sc = unidades === 'KGF' ? 101.972 : 1;
    const um = unitMom(), uf = unitF();
    const checks = [
        { name: 'Flexión positiva (φMn ≥ Mu⁺)', calc: `${(R.phi_mn_pos * sc).toFixed(2)} ${um}`, perm: `${(R.mu_pos * sc).toFixed(2)} ${um}`, ok: R.cumple_pos },
        { name: 'Flexión negativa (φMn ≥ Mu⁻)', calc: `${(R.phi_mn_neg * sc).toFixed(2)} ${um}`, perm: `${(R.mu_neg * sc).toFixed(2)} ${um}`, ok: R.cumple_neg },
        { name: 'Cortante (φVc ≥ Vu)', calc: `${(R.phi_vc * sc).toFixed(2)} ${uf}`, perm: `${(R.vu_max * sc).toFixed(2)} ${uf}`, ok: R.cumple_cortante },
        { name: 'Deflexión viva (L/360)', calc: `${R.delta_L_mm.toFixed(2)} mm`, perm: `${R.perm_L.toFixed(2)} mm`, ok: R.cumple_delta_L },
        { name: 'Deflexión LP (L/480)', calc: `${R.delta_LP_mm.toFixed(2)} mm`, perm: `${R.perm_LP.toFixed(2)} mm`, ok: R.cumple_delta_LP },
        { name: 'As mínimo superior', calc: `${R.as_sup.toFixed(2)} cm²/m`, perm: `${R.as_min_temp.toFixed(2)} cm²/m`, ok: R.cumple_as_min_sup },
        { name: 'As mínimo inferior', calc: `${R.as_inf.toFixed(2)} cm²/m`, perm: `${R.as_min_temp.toFixed(2)} cm²/m`, ok: R.cumple_as_min_inf },
        { name: 'Espesor mínimo', calc: `${R.h.toFixed(1)} cm`, perm: `${R.h_min_req.toFixed(2)} cm`, ok: R.cumple_h_min },
        { name: 'Fisuración (+) z ≤ 31000', calc: `z=${R.z_pos.toFixed(0)}`, perm: '31000', ok: R.cumple_fisura_pos },
        { name: 'Fisuración (−) z ≤ 31000', calc: `z=${R.z_neg.toFixed(0)}`, perm: '31000', ok: R.cumple_fisura_neg },
        { name: 'Cuantía máxima', calc: `ρ=${(R.rho_provisto * 100).toFixed(3)}%`, perm: `${(R.rho_max * 100).toFixed(3)}%`, ok: R.cumple_rho_max },
    ];
    document.getElementById('verif-table-container').innerHTML =
        `<table class="verif-table"><thead><tr><th>Verificación</th><th>Calculado</th><th>Permisible</th><th>Estado</th></tr></thead><tbody>` +
        checks.map(c => `<tr><td>${c.name}</td><td>${c.calc}</td><td>${c.perm}</td>
            <td>${c.ok ? '<span class="badge-ok">CUMPLE</span>' : '<span class="badge-fail">NO CUMPLE</span>'}</td></tr>`).join('') +
        '</tbody></table>';
}

/* ═══════════════════════════════════════════════════════════════════
   MEMORIA — modal de datos → preview HTML → (en preview) descargar Word
   ═══════════════════════════════════════════════════════════════════ */
function closeModalRegistro() { document.getElementById('modal-registro').classList.remove('active'); }

/* Captura las 3 vistas 3D (momento / cortante / deflexión) para la memoria.
   Fija cámara, heatMode y deformada → render → toDataURL. Restaura al final. */
async function capture3DViews(R) {
    const prevHeat = heatMode, prevDefl = deflScaleMult, prevShowDef = showDeformed, prevTouched = userTouched3D;
    const prevAuto = controls3D ? controls3D.autoRotate : false;
    if (controls3D) controls3D.autoRotate = false;
    const camPos = camera3D.position.clone(), target = controls3D.target.clone();

    const L_total = R.L_list.reduce((a, b) => a + b, 0);
    const h_m = R.h / 100;
    const captures = { moment: null, shear: null, defl: null };

    async function snap(mode, withDeformed) {
        heatMode = mode;
        showDeformed = !!withDeformed;
        if (withDeformed) deflScaleMult = 300;
        userTouched3D = false;
        buildSlab3D(R);                          // reconstruye + reencuadra
        frameModel3D(L_total, h_m, { zoom: 0.92 });
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        renderer3D.render(scene3D, camera3D);
        const b64 = renderer3D.domElement.toDataURL('image/png');
        return (b64 && b64.length > 500) ? b64 : null;
    }

    try {
        captures.moment = await snap('moment', false);
        captures.shear = await snap('shear', false);
        captures.defl = await snap('defl', true);
    } finally {
        heatMode = prevHeat; deflScaleMult = prevDefl; showDeformed = prevShowDef; userTouched3D = prevTouched;
        buildSlab3D(R);
        camera3D.position.copy(camPos); controls3D.target.copy(target);
        controls3D.autoRotate = prevAuto; controls3D.update();
    }
    return captures;
}

/* Captura los diagramas Plotly (momento / cortante / deflexión) como PNG. */
async function captureChartsForMemoria() {
    if (typeof Plotly === 'undefined' || !Plotly.toImage) return {};
    const out = {};
    const grab = async (id, key) => {
        const el = document.getElementById(id);
        if (!el || !el.data) return;
        try {
            // Fondo opaco oscuro para que las etiquetas (claras) se lean en la memoria.
            await Plotly.relayout(el, { paper_bgcolor: '#0d1426', plot_bgcolor: '#0d1426' });
            out[key] = await Plotly.toImage(el, { format: 'png', width: 1000, height: 460, scale: 2 });
            await Plotly.relayout(el, { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(8,12,24,0.45)' });
        } catch (e) {}
    };
    await grab('chart-moment', 'moment');
    await grab('chart-shear', 'shear');
    await grab('chart-deflection', 'deflection');
    return out;
}

async function doVerMemoria() {
    const nombre = document.getElementById('reg-nombre').value.trim();
    const empresa = document.getElementById('reg-empresa').value.trim();
    const correo = document.getElementById('reg-correo').value.trim();
    const pais = document.getElementById('reg-pais').value.trim();
    const proyecto = document.getElementById('reg-proyecto').value.trim();
    const matricula = document.getElementById('reg-matricula').value.trim();
    const consent = document.getElementById('reg-consent').checked;

    if (!nombre || !empresa || !correo) { showToast('Complete nombre, empresa y correo.', 'err'); return; }
    const emailOk = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(correo);
    if (!emailOk) { showToast('El correo no tiene un formato válido. Ej: usuario@empresa.com', 'err'); return; }
    if (!consent) { showToast('Debe aceptar la autorización de datos.', 'err'); return; }
    if (!resultado) { showToast('Primero calcule la losa.', 'err'); return; }

    const btn = document.getElementById('btn-ver-memoria-final');
    btn.disabled = true; btn.textContent = 'Preparando...';

    try {
        // Registro — no bloquea la apertura de la memoria si falla
        fetch(`${API_BASE}/api/registrar_descarga`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, empresa, correo, pais, proyecto, matricula, entrada: buildPayload() }),
        }).catch(e => console.warn('Registro no enviado:', e));

        // Asegura el visor 3D montado para poder capturar las vistas
        let screenshots3d = null;
        try {
            if (resultado3D && !renderer3D) {
                const prevTab = document.querySelector('.tab-btn.active')?.dataset?.tab;
                switchTab('tab-3d');
                init3DViewer(resultado3D);
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                if (prevTab && prevTab !== 'tab-3d') switchTab(prevTab);
            }
            if (renderer3D && scene3D && camera3D && resultado3D) screenshots3d = await capture3DViews(resultado3D);
        } catch (err) { console.warn('screenshots 3D fallaron:', err); }

        const charts = await captureChartsForMemoria();
        const seccionSVG = buildSectionSVG(resultado);

        const proy = { nombre: empresa, ingeniero: nombre, matricula, proyecto, ubicacion: pais, fecha: '' };
        const optimizacion = (resultado && resultado.optimizacion) ? resultado.optimizacion : null;

        closeModalRegistro();
        if (window.openMemoriaLosa) {
            window.openMemoriaLosa(resultado, proy, { screenshots3d, charts, seccionSVG, optimizacion });
            showToast('Memoria lista — revísela y descargue el Word cuando quiera ✓', 'ok');
        } else {
            showToast('Módulo de memoria no cargó. Recargue la página.', 'err');
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'err');
    } finally {
        btn.disabled = false; btn.textContent = '▤ Ver Memoria';
    }
}

/* ─── Toast ─── */
function showToast(msg, type = 'ok') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3800);
}
