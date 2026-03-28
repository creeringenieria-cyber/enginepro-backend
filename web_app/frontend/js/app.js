/* ═══════════════════════════════════════════════════════
   EnginePro Losas — CRÉER Ingeniería · v10.2
   Fixes: deformada adaptativa, concreto sin wireframe,
          unidades KN/KGF, catálogo ampliado, logo V2,
          validación email, correo local debug
   ═══════════════════════════════════════════════════════ */

const API_BASE = window.API_BASE_URL || '';

/* ─── State ─── */
let catalogos = {};
let resultado = null;
let currentPatternIdx = 0;
let patternAnimInterval = null;
let numSpans = 2;
let unidades = 'KN';   // 'KN' | 'KGF'

/* ─── Three.js ─── */
let scene3D, camera3D, renderer3D, animFrameId;
let isDragging = false, prevMouse = { x:0, y:0 };
let spherical = { theta: -0.4, phi: 1.0, radius: 12 };
let showDeformed = false, showWireframe = false;
let meshConcrete = null, barsGroup = null, deformGroup = null;
let resultado3D = null;

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
    } catch(e) {
        showToast('Error cargando catálogos. Verifique conexión.', 'err');
    }
}

function populateSelects() {
    ['malla_sup','malla_inf'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        catalogos.mallas.forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.textContent = m; sel.appendChild(o);
        });
    });
    ['grafil_sup','grafil_inf'].forEach(id => {
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
    document.getElementById('btn-export-word').addEventListener('click', () =>
        document.getElementById('modal-registro').classList.add('active'));
    document.getElementById('btn-unidades').addEventListener('click', toggleUnidades);
}

/* ─── Unidades ─── */
function toggleUnidades() {
    unidades = unidades === 'KN' ? 'KGF' : 'KN';
    document.getElementById('btn-unidades').textContent = unidades === 'KN' ? 'KN → KGF' : 'KGF → KN';
    document.getElementById('btn-unidades').classList.toggle('active', unidades === 'KGF');
    if (resultado) renderResults();
}

function toU(valKN) {
    return unidades === 'KGF' ? valKN * 101.972 : valKN;
}
function toUm(valKNm) {
    return unidades === 'KGF' ? valKNm * 101.972 : valKNm;
}
function unitMom() { return unidades === 'KGF' ? 'kgf·m' : 'kN·m'; }
function unitF()   { return unidades === 'KGF' ? 'kgf'   : 'kN';   }
function unitDist(){ return unidades === 'KGF' ? 'kgf/m' : 'kN/m'; }
function unitP()   { return unidades === 'KGF' ? 'kgf/m²': 'kN/m²';}
function fmt2(v)   { return toU(v).toFixed(2); }
function fmt2m(v)  { return toUm(v).toFixed(2); }

/* ─── Spans ─── */
function changeSpans(delta) {
    numSpans = Math.max(1, Math.min(6, numSpans+delta));
    updateSpans();
}
function updateSpans() {
    const c = document.getElementById('spans-container');
    const vals = Array.from(c.querySelectorAll('.span-input')).map(i => i.value);
    let html = '';
    for(let i=0; i<numSpans; i++) {
        const v = vals[i] || '4.00';
        html += `<div class="span-wrap"><span class="span-label">L${i+1}</span>
        <input type="number" class="form-input span-input" value="${v}" step="0.05" min="1" max="15"></div>`;
    }
    c.innerHTML = html;
    document.getElementById('spans-count').textContent = `${numSpans} vano${numSpans>1?'s':''}`;
}
function getSpanValues() {
    return Array.from(document.querySelectorAll('.span-input')).map(i => parseFloat(i.value)||4.0);
}

/* ─── Tabs ─── */
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    if (tabId==='tab-3d' && resultado3D && !renderer3D) init3DViewer(resultado3D);
}

/* ─── Payload ─── */
function buildPayload() {
    return {
        tipo_losa: 'Maciza',
        luces: getSpanValues(),
        h: parseFloat(document.getElementById('h').value)||15,
        fc: parseFloat(document.getElementById('fc').value)||21,
        fy: parseFloat(document.getElementById('fy').value)||420,
        cv: parseFloat(document.getElementById('cv').value)||180,
        cm_adic: parseFloat(document.getElementById('cm_adic').value)||150,
        malla_sup: document.getElementById('malla_sup').value,
        grafil_sup: document.getElementById('grafil_sup').value,
        malla_inf: document.getElementById('malla_inf').value,
        grafil_inf: document.getElementById('grafil_inf').value,
    };
}

/* ─── CALCULAR ─── */
async function calcular() {
    const btn = document.getElementById('btn-calcular');
    btn.classList.add('loading');
    btn.innerHTML = '<span class="btn-icon">⟳</span> Calculando...';
    try {
        const res = await fetch(`${API_BASE}/api/calcular`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(buildPayload()),
        });
        if(!res.ok) { const e=await res.json(); throw new Error(e.detail||'Error'); }
        resultado = await res.json();
        resultado3D = resultado;
        renderResults();
        document.getElementById('btn-export-word').disabled = false;
        showToast('Cálculo completado ✓', 'ok');
    } catch(e) {
        showToast('Error: '+e.message, 'err');
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '<span class="btn-icon">⟐</span> CALCULAR';
    }
}

/* ─── RENDER ─── */
function renderResults() {
    const R = resultado;
    document.getElementById('welcome-state').style.display = 'none';
    document.getElementById('results-content').style.display = 'block';

    const banner = document.getElementById('estado-banner');
    banner.className = 'estado-banner '+(R.estado==='CUMPLE'?'cumple':'no-cumple');
    banner.innerHTML = `<span>${R.estado==='CUMPLE'?'DISEÑO CUMPLE — NSR-10 / ACI 318':'DISEÑO NO CUMPLE — Revisar parámetros'}</span>
        <span class="estado-icon">${R.estado==='CUMPLE'?'✔':'✘'}</span>`;

    renderKPIs(R);
    renderMomentChart(R);
    renderShearChart(R);
    renderDeflectionChart(R);
    renderSectionSVG(R);
    renderPatternAnimation(R);
    renderVerifTable(R);

    // Rebuild 3D if visible
    if (renderer3D) buildSlab3D(R);
    else if (document.getElementById('tab-3d').classList.contains('active')) init3DViewer(R);
}

/* ─── KPIs ─── */
function renderKPIs(R) {
    const U = unidades;
    document.getElementById('kpi-grid').innerHTML = [
        { val: fmt2m(R.mu_pos),   unit: unitMom(),  label: 'Mu⁺ máx' },
        { val: fmt2m(R.mu_neg),   unit: unitMom(),  label: 'Mu⁻ máx' },
        { val: fmt2(R.vu_max),    unit: unitF(),    label: 'Vu máx' },
        { val: R.delta_LP_mm.toFixed(2), unit:'mm', label: 'δ Largo Plazo' },
        { val: fmt2(R.wu_max),    unit: unitDist(), label: 'Wu (1.2D+1.6L)' },
        { val: (unidades==='KGF'?R.pp_total:R.pp_total/101.972).toFixed(unidades==='KGF'?0:2),
          unit: unitP(), label: 'Peso propio' },
    ].map(k=>`<div class="kpi-card"><div class="kpi-value">${k.val}</div>
        <div class="kpi-unit">${k.unit}</div><div class="kpi-label">${k.label}</div></div>`).join('');
}

/* ─── PLOTLY ─── */
const PLY_LAYOUT = {
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(22,25,40,0.6)',
    font:{family:'JetBrains Mono,monospace',size:10.5,color:'#8A90A8'},
    margin:{l:62,r:20,t:14,b:44},
    xaxis:{gridcolor:'rgba(40,46,72,0.8)',zerolinecolor:'rgba(60,70,100,0.6)',
           zerolinewidth:1.5,title:{text:'Longitud (m)',font:{size:10.5,color:'#555D78'}},tickfont:{size:10}},
    yaxis:{gridcolor:'rgba(40,46,72,0.8)',zerolinecolor:'rgba(60,70,100,0.6)',zerolinewidth:1.5,tickfont:{size:10}},
    legend:{font:{size:10},bgcolor:'rgba(0,0,0,0)',orientation:'h',y:-0.18},
    hovermode:'x unified',
    hoverlabel:{bgcolor:'#10121C',bordercolor:'#E03030',font:{family:'JetBrains Mono',size:11}},
};
const PLY_CFG = {responsive:true,displayModeBar:'hover',
    modeBarButtonsToRemove:['lasso2d','select2d'],displaylogo:false};

function suppShapes(R) {
    let xp=0; const sh=[];
    [0,...R.L_list.map((_,i)=>R.L_list.slice(0,i+1).reduce((a,b)=>a+b,0))].forEach(x=>{
        sh.push({type:'line',x0:x,x1:x,y0:0,y1:0,xref:'x',yref:'paper',
                 line:{color:'rgba(100,116,139,0.5)',width:1.5,dash:'dot'}});
    });
    return sh;
}

function renderMomentChart(R) {
    const sc = unidades==='KGF'?101.972:1;
    const yLabel = `Mu (${unitMom()})`;
    const M_pos = R.M_env_max.map(v=>v*sc);
    const M_neg = R.M_env_min.map(v=>v*sc);
    const iMax = M_pos.indexOf(Math.max(...M_pos));
    const iMin = M_neg.indexOf(Math.min(...M_neg));
    const anns = [];
    if(Math.abs(M_pos[iMax])>0.01) anns.push({x:R.x_global[iMax],y:M_pos[iMax],
        text:`<b>${M_pos[iMax].toFixed(2)}</b>`,showarrow:true,arrowhead:2,arrowcolor:'#EF4444',
        font:{size:10,color:'#EF4444'},bgcolor:'rgba(16,18,28,0.9)',borderpad:3,ay:-28});
    if(Math.abs(M_neg[iMin])>0.01) anns.push({x:R.x_global[iMin],y:M_neg[iMin],
        text:`<b>${M_neg[iMin].toFixed(2)}</b>`,showarrow:true,arrowhead:2,arrowcolor:'#3B82F6',
        font:{size:10,color:'#3B82F6'},bgcolor:'rgba(16,18,28,0.9)',borderpad:3,ay:28});
    Plotly.newPlot('chart-moment',[
        {x:R.x_global,y:M_pos,name:'M⁺',line:{color:'#EF4444',width:2.5,shape:'spline'},
         fill:'tozeroy',fillcolor:'rgba(239,68,68,0.08)',hovertemplate:`M⁺=<b>%{y:.2f}</b> ${unitMom()}<extra></extra>`},
        {x:R.x_global,y:M_neg,name:'M⁻',line:{color:'#3B82F6',width:2.5,shape:'spline'},
         fill:'tozeroy',fillcolor:'rgba(59,130,246,0.08)',hovertemplate:`M⁻=<b>%{y:.2f}</b> ${unitMom()}<extra></extra>`},
    ],{...PLY_LAYOUT,yaxis:{...PLY_LAYOUT.yaxis,title:{text:yLabel,font:{size:10.5}},autorange:'reversed'},
       shapes:suppShapes(R),annotations:anns},PLY_CFG);
}

function renderShearChart(R) {
    const sc = unidades==='KGF'?101.972:1;
    Plotly.newPlot('chart-shear',[
        {x:R.x_global,y:R.V_env_max.map(v=>v*sc),name:'V máx',line:{color:'#22C55E',width:2.5},
         fill:'tozeroy',fillcolor:'rgba(34,197,94,0.08)',hovertemplate:`V⁺=<b>%{y:.2f}</b> ${unitF()}<extra></extra>`},
        {x:R.x_global,y:R.V_env_min.map(v=>v*sc),name:'V mín',line:{color:'#22C55E',width:2,dash:'dash'},
         fill:'tozeroy',fillcolor:'rgba(34,197,94,0.05)',hovertemplate:`V⁻=<b>%{y:.2f}</b> ${unitF()}<extra></extra>`},
        {x:[R.x_global[0],R.x_global[R.x_global.length-1]],y:[R.phi_vc*sc,R.phi_vc*sc],
         name:`φVc=${fmt2(R.phi_vc)} ${unitF()}`,line:{color:'#F59E0B',width:1.5,dash:'dashdot'},
         hovertemplate:`φVc=${fmt2(R.phi_vc)} ${unitF()}<extra></extra>`},
    ],{...PLY_LAYOUT,yaxis:{...PLY_LAYOUT.yaxis,title:{text:`Vu (${unitF()})`,font:{size:10.5}}},
       shapes:suppShapes(R)},PLY_CFG);
}

function renderDeflectionChart(R) {
    const traces=[];
    if(R.delta_DL_x&&R.delta_DL_x.length>0)
        traces.push({x:R.x_global,y:R.delta_DL_x.map(v=>v*1000),name:`δ(D+L)=${R.delta_DL_mm.toFixed(2)}mm`,
            line:{color:'#A78BFA',width:2,dash:'dash',shape:'spline'},
            hovertemplate:'δ(D+L)=<b>%{y:.3f}</b> mm<extra></extra>'});
    if(R.delta_LP_x&&R.delta_LP_x.length>0)
        traces.push({x:R.x_global,y:R.delta_LP_x.map(v=>v*1000),name:`δLP=${R.delta_LP_mm.toFixed(2)}mm`,
            line:{color:'#F87171',width:2.5,shape:'spline'},fill:'tozeroy',fillcolor:'rgba(248,113,113,0.07)',
            hovertemplate:'δLP=<b>%{y:.3f}</b> mm<extra></extra>'});
    if(!traces.length) return;
    Plotly.newPlot('chart-deflection',traces,{...PLY_LAYOUT,
        yaxis:{...PLY_LAYOUT.yaxis,title:{text:'δ (mm)',font:{size:10.5}},autorange:'reversed'},
        shapes:suppShapes(R)},PLY_CFG);
}

/* ─── SECTION SVG ─── */
function renderSectionSVG(R) {
    const container = document.getElementById('section-svg');
    const W=580, H=380;
    // Drawing scale: b_draw px = 100 cm → px_per_cm
    // h_draw is proportional to real h
    const b_draw=260;
    const px_per_cm = b_draw / 100;            // px por cm
    const px_per_mm = px_per_cm / 10;          // px por mm
    const h_draw = Math.round(R.h * px_per_cm); // altura REAL a escala
    // Clamp for extreme cases (very thin or very thick)
    const h_draw_clamped = Math.max(50, Math.min(200, h_draw));
    const scale_factor = h_draw_clamped / h_draw; // si se clampeó, ajustar barras también
    const x0=75, y0=70, rec=Math.round(3*px_per_cm); // recubrimiento 3cm a escala
    const colSup='#3B82F6', colSupDk='#1D4ED8', colInf='#EF4444', colInfDk='#B91C1C';
    const colDim='#64748B', colBg='#161928', colConc='#C8CDD8', colEdge='#3D4A5C';

    const sep_inf_px = (R.sep_malla_inf||15)*px_per_cm;
    const sep_sup_px = (R.sep_malla_sup||15)*px_per_cm;
    const nInf = Math.max(2, Math.min(Math.floor(b_draw/Math.max(sep_inf_px,4)), 20));
    const nSup = Math.max(2, Math.min(Math.floor(b_draw/Math.max(sep_sup_px,4)), 20));
    const spInfPx = b_draw/(nInf+1);
    const spSupPx = b_draw/(nSup+1);
    const barR = (db_mm, sp_px) => Math.min((db_mm/2)*px_per_mm*scale_factor, sp_px*0.38);
    const rMI = barR(R.db_malla_inf||5, spInfPx);
    const rMS = barR(R.db_malla_sup||4, spSupPx);
    const rGI = R.db_grafil_inf>0 ? barR(R.db_grafil_inf, spInfPx*0.5) : 0;
    const rGS = R.db_grafil_sup>0 ? barR(R.db_grafil_sup, spSupPx*0.5) : 0;
    const hd = h_draw_clamped;

    let svg=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
        style="max-width:100%;height:auto;background:${colBg};border-radius:8px">
    <defs>
      <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="8" stroke="${colEdge}" stroke-width="0.4" opacity="0.5"/>
      </pattern>
      <filter id="gs"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="gi"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;

    // Concrete block
    svg+=`<rect x="${x0}" y="${y0}" width="${b_draw}" height="${hd}" fill="${colConc}" rx="2"/>`;
    svg+=`<rect x="${x0}" y="${y0}" width="${b_draw}" height="${hd}" fill="url(#hatch)" opacity="0.55"/>`;
    svg+=`<rect x="${x0}" y="${y0}" width="${b_draw}" height="${hd}" fill="none" stroke="${colEdge}" stroke-width="2.5" rx="2"/>`;

    // Cover indicator
    svg+=`<line x1="${x0+5}" y1="${y0+hd}" x2="${x0+5}" y2="${y0+hd-rec}" stroke="${colDim}" stroke-width="0.8" stroke-dasharray="3,2"/>`;
    svg+=`<line x1="${x0+5}" y1="${y0}" x2="${x0+5}" y2="${y0+rec}" stroke="${colDim}" stroke-width="0.8" stroke-dasharray="3,2"/>`;
    svg+=`<text x="${x0+9}" y="${y0+hd-rec/2+3}" fill="${colDim}" font-size="8.5" font-family="Inter,sans-serif">r=3cm</text>`;

    // Guide lines at bar positions
    svg+=`<line x1="${x0+8}" y1="${y0+rec}" x2="${x0+b_draw-8}" y2="${y0+rec}" stroke="${colSup}" stroke-width="0.5" stroke-dasharray="4,3" opacity="0.25"/>`;
    svg+=`<line x1="${x0+8}" y1="${y0+hd-rec}" x2="${x0+b_draw-8}" y2="${y0+hd-rec}" stroke="${colInf}" stroke-width="0.5" stroke-dasharray="4,3" opacity="0.25"/>`;

    // INF bars
    for(let i=0;i<nInf;i++){
        const bx=x0+(i+1)*spInfPx, by=y0+hd-rec;
        svg+=`<circle cx="${bx}" cy="${by}" r="${rMI}" fill="${colInf}" stroke="${colInfDk}" stroke-width="1" filter="url(#gi)"/>`;
    }
    if(rGI>0){
        for(let i=0;i<nInf-1;i++){
            const bx=x0+(i+1)*spInfPx+spInfPx/2, by=y0+hd-rec;
            if(bx<x0+b_draw-rGI) svg+=`<circle cx="${bx}" cy="${by}" r="${rGI}" fill="${colInf}" stroke="${colInfDk}" stroke-width="0.8" opacity="0.8"/>`;
        }
    }
    // SUP bars
    for(let i=0;i<nSup;i++){
        const bx=x0+(i+1)*spSupPx, by=y0+rec;
        svg+=`<circle cx="${bx}" cy="${by}" r="${rMS}" fill="${colSup}" stroke="${colSupDk}" stroke-width="1" filter="url(#gs)"/>`;
    }
    if(rGS>0){
        for(let i=0;i<nSup-1;i++){
            const bx=x0+(i+1)*spSupPx+spSupPx/2, by=y0+rec;
            if(bx<x0+b_draw-rGS) svg+=`<circle cx="${bx}" cy="${by}" r="${rGS}" fill="${colSup}" stroke="${colSupDk}" stroke-width="0.8" opacity="0.8"/>`;
        }
    }

    // Dimensions
    svg+=dimV(x0+b_draw+22,y0,y0+hd,`h=${R.h}cm`,colDim);
    svg+=dimV(x0+b_draw+52,y0,y0+hd-rec,`d=${R.d}cm`,colDim);
    svg+=dimH(x0,x0+b_draw,y0+hd+42,'b=100cm',colDim);

    // Labels
    const lblSup=rebarLabel(R.malla_sup,R.grafil_sup);
    const lblInf=rebarLabel(R.malla_inf,R.grafil_inf);
    const pw=Math.min(lblSup.length*6.2+20,b_draw);
    svg+=`<rect x="${x0+(b_draw-pw)/2}" y="${y0-30}" width="${pw}" height="18" fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.4)" stroke-width="1" rx="4"/>`;
    svg+=`<text x="${x0+b_draw/2}" y="${y0-17}" fill="${colSup}" font-size="9" font-weight="700" font-family="Inter,sans-serif" text-anchor="middle">SUP: ${lblSup}</text>`;
    const iw=Math.min(lblInf.length*6.2+20,b_draw);
    svg+=`<rect x="${x0+(b_draw-iw)/2}" y="${y0+hd+14}" width="${iw}" height="18" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.4)" stroke-width="1" rx="4"/>`;
    svg+=`<text x="${x0+b_draw/2}" y="${y0+hd+27}" fill="${colInf}" font-size="9" font-weight="700" font-family="Inter,sans-serif" text-anchor="middle">INF: ${lblInf}</text>`;
    svg+='</svg>';
    container.innerHTML = svg;
}
function rebarLabel(m,g){let l=m;if(g&&g!=='Sin Grafil')l+=' + '+g;return l;}
function dimH(x1,x2,y,label,col){const aw=5,ah=3;let s='';
    s+=`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="0.9"/>`;
    s+=`<polygon points="${x1},${y} ${x1+aw},${y-ah} ${x1+aw},${y+ah}" fill="${col}"/>`;
    s+=`<polygon points="${x2},${y} ${x2-aw},${y-ah} ${x2-aw},${y+ah}" fill="${col}"/>`;
    s+=`<line x1="${x1}" y1="${y-5}" x2="${x1}" y2="${y+5}" stroke="${col}" stroke-width="0.7"/>`;
    s+=`<line x1="${x2}" y1="${y-5}" x2="${x2}" y2="${y+5}" stroke="${col}" stroke-width="0.7"/>`;
    s+=`<text x="${(x1+x2)/2}" y="${y+13}" fill="${col}" font-size="9.5" text-anchor="middle" font-family="Inter,sans-serif" font-weight="500">${label}</text>`;return s;}
function dimV(x,y1,y2,label,col){const aw=3,ah=5;let s='';
    s+=`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${col}" stroke-width="0.9"/>`;
    s+=`<polygon points="${x},${y1} ${x-aw},${y1+ah} ${x+aw},${y1+ah}" fill="${col}"/>`;
    s+=`<polygon points="${x},${y2} ${x-aw},${y2-ah} ${x+aw},${y2-ah}" fill="${col}"/>`;
    s+=`<line x1="${x-5}" y1="${y1}" x2="${x+5}" y2="${y1}" stroke="${col}" stroke-width="0.7"/>`;
    s+=`<line x1="${x-5}" y1="${y2}" x2="${x+5}" y2="${y2}" stroke="${col}" stroke-width="0.7"/>`;
    s+=`<text x="${x+9}" y="${(y1+y2)/2+4}" fill="${col}" font-size="9.5" font-family="Inter,sans-serif" font-weight="500">${label}</text>`;return s;}

/* ═══════════════════════════════════════════════════════
   THREE.JS 3D VIEWER
   ═══════════════════════════════════════════════════════ */
function init3DViewer(R) {
    const container = document.getElementById('viewer-3d');
    if(!container) return;
    if(renderer3D){ renderer3D.dispose(); renderer3D=null; if(animFrameId) cancelAnimationFrame(animFrameId); }
    container.innerHTML='';

    const W=container.clientWidth||800, H=container.clientHeight||480;
    scene3D = new THREE.Scene();
    scene3D.background = new THREE.Color(0x0a0c18);
    scene3D.fog = new THREE.Fog(0x0a0c18,25,70);

    camera3D = new THREE.PerspectiveCamera(45,W/H,0.1,200);
    updateCamPos();

    renderer3D = new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer3D.setSize(W,H);
    renderer3D.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer3D.shadowMap.enabled = true;
    renderer3D.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer3D.domElement);

    // Lights
    scene3D.add(new THREE.AmbientLight(0xffffff,0.4));
    const dl = new THREE.DirectionalLight(0xffffff,1.1);
    dl.position.set(8,14,8); dl.castShadow=true; dl.shadow.mapSize.set(2048,2048); scene3D.add(dl);
    const fl = new THREE.DirectionalLight(0x3B82F6,0.25); fl.position.set(-6,4,-4); scene3D.add(fl);
    const rl = new THREE.PointLight(0xE03030,0.4,30); rl.position.set(0,6,-8); scene3D.add(rl);

    // Grid
    const grid = new THREE.GridHelper(50,50,0x1a1f35,0x161928);
    grid.position.y=-0.05; scene3D.add(grid);

    buildSlab3D(R);
    setupMouseControls3D(container);

    new ResizeObserver(()=>{
        const w=container.clientWidth,h=container.clientHeight;
        camera3D.aspect=w/h; camera3D.updateProjectionMatrix(); renderer3D.setSize(w,h);
    }).observe(container);

    (function animate(){ animFrameId=requestAnimationFrame(animate); renderer3D.render(scene3D,camera3D); })();
}

function buildSlab3D(R) {
    // Remove old
    [meshConcrete,barsGroup,deformGroup].forEach(o=>{ if(o&&scene3D) scene3D.remove(o); });
    meshConcrete=barsGroup=deformGroup=null;
    scene3D.children.filter(c=>c.userData.slab).forEach(c=>scene3D.remove(c));

    const L_total = R.L_list.reduce((a,b)=>a+b,0);
    const h_m = R.h/100;
    const width = 3.0;
    const cx = -L_total/2;

    /* ── CONCRETE — sin wireframe, transparencia suave ── */
    const geomConc = new THREE.BoxGeometry(L_total, h_m, width, 1, 1, 1);
    const matConc = new THREE.MeshStandardMaterial({
        color: 0xB8BEC9, roughness:0.72, metalness:0.04,
        transparent:true, opacity:0.62,
        depthWrite:false,
    });
    meshConcrete = new THREE.Mesh(geomConc, matConc);
    meshConcrete.position.set(cx+L_total/2, h_m/2, 0);
    meshConcrete.castShadow=true; meshConcrete.receiveShadow=true;
    meshConcrete.userData.slab=true;
    scene3D.add(meshConcrete);

    /* Subtle edge lines only on outer border */
    const edgeGeo = new THREE.EdgesGeometry(geomConc);
    const edgeMat = new THREE.LineBasicMaterial({color:0x4A5568,transparent:true,opacity:0.4});
    const edgeLines = new THREE.LineSegments(edgeGeo,edgeMat);
    meshConcrete.add(edgeLines);

    /* ── SUPPORTS ── */
    let apoyosX=[0];
    R.L_list.forEach(L=>{ apoyosX.push(apoyosX[apoyosX.length-1]+L); });
    apoyosX.forEach(xa=>{
        const sg=new THREE.BoxGeometry(0.10,0.30,width+0.15);
        const sm=new THREE.MeshStandardMaterial({color:0x334155,roughness:0.85});
        const s=new THREE.Mesh(sg,sm); s.position.set(cx+xa,-0.15,0);
        s.userData.slab=true; scene3D.add(s);
    });

    /* ── REBAR BARS ── */
    barsGroup = new THREE.Group(); barsGroup.userData.slab=true;
    const cover=0.03;
    const y_inf=cover, y_sup=h_m-cover;
    const db_inf=(R.db_malla_inf||5)/1000, db_sup=(R.db_malla_sup||4)/1000;
    const db_gi=(R.db_grafil_inf||0)/1000, db_gs=(R.db_grafil_sup||0)/1000;

    const matInf=new THREE.MeshStandardMaterial({color:0xEF4444,roughness:0.25,metalness:0.9,emissive:0x2D0000});
    const matSup=new THREE.MeshStandardMaterial({color:0x3B82F6,roughness:0.25,metalness:0.9,emissive:0x00102D});
    const matGrf=new THREE.MeshStandardMaterial({color:0xF59E0B,roughness:0.3,metalness:0.85});

    // Use real separation from result
    const sep_inf = (R.sep_malla_inf||15)/100;   // cm→m
    const sep_sup = (R.sep_malla_sup||15)/100;
    const nLong_inf = Math.max(3, Math.round(width/sep_inf));
    const nLong_sup = Math.max(3, Math.round(width/sep_sup));

    // Longitudinal INF
    for(let i=0;i<nLong_inf;i++){
        const z=-width/2+(i+0.5)*width/nLong_inf;
        addBar(barsGroup,cx,cx+L_total,y_inf,z,db_inf/2,matInf);
    }
    // Longitudinal SUP
    for(let i=0;i<nLong_sup;i++){
        const z=-width/2+(i+0.5)*width/nLong_sup;
        addBar(barsGroup,cx,cx+L_total,y_sup,z,db_sup/2,matSup);
    }
    // Grafil INF (interleaved z)
    if(db_gi>0){
        const nGI=Math.max(2,Math.round(width/(sep_inf*0.5)));
        for(let i=0;i<nGI;i++){
            const z=-width/2+(i+0.5)*width/nGI+width/(nGI*2);
            if(Math.abs(z)<width/2) addBar(barsGroup,cx,cx+L_total,y_inf,z,db_gi/2,matGrf);
        }
    }
    // Grafil SUP
    if(db_gs>0){
        const nGS=Math.max(2,Math.round(width/(sep_sup*0.5)));
        for(let i=0;i<nGS;i++){
            const z=-width/2+(i+0.5)*width/nGS+width/(nGS*2);
            if(Math.abs(z)<width/2) addBar(barsGroup,cx,cx+L_total,y_sup,z,db_gs/2,matGrf);
        }
    }
    // Transverse bars (stirrups / ties)
    const nT=Math.min(80,Math.round(L_total/0.15));
    const matT_inf=matInf.clone(); matT_inf.transparent=true; matT_inf.opacity=0.45;
    const matT_sup=matSup.clone(); matT_sup.transparent=true; matT_sup.opacity=0.45;
    for(let i=0;i<nT;i++){
        const x=cx+(i+0.5)*L_total/nT;
        addTransBar(barsGroup,x,-width/2,width/2,y_inf,db_inf/2*0.6,matT_inf);
        addTransBar(barsGroup,x,-width/2,width/2,y_sup,db_sup/2*0.6,matT_sup);
    }

    scene3D.add(barsGroup);

    /* ── DEFORMED SHAPE — escala adaptativa ── */
    if(showDeformed && R.delta_LP_x && R.delta_LP_x.length>0) {
        buildDeformed(R, cx, h_m, width, L_total);
    }

    /* Camera distance */
    spherical.radius = Math.max(8, L_total*1.7+h_m*2);
    updateCamPos();
}

function buildDeformed(R, cx, h_m, width, L_total) {
    /* Escala adaptativa:
       - Calcula la deflexión máxima real en metros
       - La escala visual objetivo es ~15% del alto de la losa visible
       - Nunca más de L/30 de exageración visual */
    const deflMax = Math.max(...R.delta_LP_x.map(Math.abs));
    if(deflMax < 1e-8) return;

    const targetVisual = h_m * 0.4;   // 40% del alto de losa como máximo visual
    const naturalScale = targetVisual / deflMax;
    // Cap: no más de L_total*0.05 visual aunque la deflexión sea pequeña
    const scale = Math.min(naturalScale, L_total * 0.05 / deflMax);

    deformGroup = new THREE.Group(); deformGroup.userData.slab=true;

    const x_pts = R.x_global, d_pts = R.delta_LP_x;
    const pts=[];
    x_pts.forEach((x,i)=>{
        const defl=(d_pts[i]||0)*scale;
        pts.push(new THREE.Vector3(cx+x, h_m+defl+0.005, -width/2-0.08));
        pts.push(new THREE.Vector3(cx+x, h_m+defl+0.005,  width/2+0.08));
    });

    const verts=[];
    for(let i=0;i<pts.length-2;i+=2){
        verts.push(pts[i].x,pts[i].y,pts[i].z,   pts[i+1].x,pts[i+1].y,pts[i+1].z, pts[i+2].x,pts[i+2].y,pts[i+2].z);
        verts.push(pts[i+1].x,pts[i+1].y,pts[i+1].z, pts[i+3].x,pts[i+3].y,pts[i+3].z, pts[i+2].x,pts[i+2].y,pts[i+2].z);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    geo.computeVertexNormals();
    const mat=new THREE.MeshBasicMaterial({color:0xA78BFA,transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false});
    deformGroup.add(new THREE.Mesh(geo,mat));

    // Also draw a center line for clarity
    const linePts=x_pts.map((x,i)=>new THREE.Vector3(cx+x, h_m+(d_pts[i]||0)*scale+0.006, 0));
    const lineGeo=new THREE.BufferGeometry().setFromPoints(linePts);
    deformGroup.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({color:0xC4B5FD,linewidth:2})));

    scene3D.add(deformGroup);
}

function addBar(group,x0,x1,y,z,r,mat){
    const len=x1-x0;
    const geo=new THREE.CylinderGeometry(r,r,len,8,1);
    geo.rotateZ(Math.PI/2);
    const m=new THREE.Mesh(geo,mat); m.position.set((x0+x1)/2,y,z);
    m.castShadow=true; group.add(m);
}
function addTransBar(group,x,z0,z1,y,r,mat){
    const len=z1-z0;
    const geo=new THREE.CylinderGeometry(r,r,len,6,1); geo.rotateX(Math.PI/2);
    const m=new THREE.Mesh(geo,mat); m.position.set(x,y,(z0+z1)/2); group.add(m);
}

/* ─── Camera ─── */
function updateCamPos(){
    if(!camera3D) return;
    camera3D.position.x=spherical.radius*Math.sin(spherical.phi)*Math.sin(spherical.theta);
    camera3D.position.y=spherical.radius*Math.cos(spherical.phi);
    camera3D.position.z=spherical.radius*Math.sin(spherical.phi)*Math.cos(spherical.theta);
    camera3D.lookAt(0,h_m_current()/2,0);
}
function h_m_current(){ return resultado3D ? resultado3D.h/100 : 0.15; }

function setupMouseControls3D(c){
    c.addEventListener('mousedown',e=>{isDragging=true;prevMouse={x:e.clientX,y:e.clientY};});
    window.addEventListener('mouseup',()=>isDragging=false);
    window.addEventListener('mousemove',e=>{
        if(!isDragging) return;
        const dx=(e.clientX-prevMouse.x)*0.007, dy=(e.clientY-prevMouse.y)*0.007;
        spherical.theta-=dx; spherical.phi=Math.max(0.1,Math.min(Math.PI*0.85,spherical.phi-dy));
        prevMouse={x:e.clientX,y:e.clientY}; updateCamPos();
    });
    c.addEventListener('wheel',e=>{e.preventDefault();
        spherical.radius=Math.max(2,Math.min(50,spherical.radius+e.deltaY*0.02));updateCamPos();
    },{passive:false});
    let ltd=0;
    c.addEventListener('touchstart',e=>{
        if(e.touches.length===1){isDragging=true;prevMouse={x:e.touches[0].clientX,y:e.touches[0].clientY};}
        if(e.touches.length===2) ltd=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    });
    c.addEventListener('touchmove',e=>{e.preventDefault();
        if(e.touches.length===1&&isDragging){
            const dx=(e.touches[0].clientX-prevMouse.x)*0.007,dy=(e.touches[0].clientY-prevMouse.y)*0.007;
            spherical.theta-=dx;spherical.phi=Math.max(0.1,Math.min(Math.PI*0.85,spherical.phi-dy));
            prevMouse={x:e.touches[0].clientX,y:e.touches[0].clientY};updateCamPos();}
        if(e.touches.length===2){
            const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
            spherical.radius=Math.max(2,Math.min(50,spherical.radius-(d-ltd)*0.04));ltd=d;updateCamPos();}
    },{passive:false});
    c.addEventListener('touchend',()=>isDragging=false);
}

function resetCamera3D(){
    spherical={theta:-0.4,phi:1.0,radius:resultado3D?Math.max(8,resultado3D.L_list.reduce((a,b)=>a+b,0)*1.7):12};
    updateCamPos();
}
function toggleDeformed(){
    showDeformed=!showDeformed;
    document.getElementById('btn-deform').classList.toggle('active',showDeformed);
    if(resultado3D) buildSlab3D(resultado3D);
}
function toggleWireframe(){
    showWireframe=!showWireframe;
    document.getElementById('btn-wire').classList.toggle('active',showWireframe);
    // Wireframe removido — toggle no hace nada visual ahora para mantener legibilidad
    showToast(showWireframe?'Modo wireframe activado (barras visibles)':'Modo sólido',showWireframe?'ok':'ok');
}

/* ─── PATTERNS ─── */
function renderPatternAnimation(R){
    if(!R.patrones||!R.patrones.length) return;
    currentPatternIdx=0;
    document.getElementById('pattern-controls').innerHTML=`
        <button class="btn-pattern active" id="btn-play-patterns" onclick="togglePatternAnim()">▶ Animar</button>
        <button class="btn-pattern" onclick="prevPattern()">◀</button>
        <button class="btn-pattern" onclick="nextPattern()">▶</button>
        <span class="pattern-name" id="pattern-name">${R.patrones[0].nombre}</span>`;
    renderPatternTrace(0);
}
function renderPatternTrace(idx){
    const R=resultado; if(!R||!R.patrones) return;
    idx=Math.max(0,Math.min(idx,R.patrones.length-1)); currentPatternIdx=idx;
    const pat=R.patrones[idx];
    document.getElementById('pattern-name').textContent=`${idx+1}/${R.patrones.length}: ${pat.nombre}`;
    const x=R.x_global, step=Math.max(1,Math.floor(pat.M.length/x.length));
    const sc=unidades==='KGF'?101.972:1;
    const M=x.map((_,i)=>((pat.M[Math.min(i*step,pat.M.length-1)])||0)*sc);
    Plotly.newPlot('chart-patterns',[
        {x,y:R.M_env_max.map(v=>v*sc),name:'Env M⁺',line:{color:'rgba(239,68,68,0.2)',width:1},hoverinfo:'skip'},
        {x,y:R.M_env_min.map(v=>v*sc),name:'Env M⁻',line:{color:'rgba(59,130,246,0.2)',width:1},hoverinfo:'skip'},
        {x,y:M,name:pat.nombre,line:{color:'#F59E0B',width:2.5,shape:'spline'},
         fill:'tozeroy',fillcolor:'rgba(245,158,11,0.1)',hovertemplate:`M=<b>%{y:.2f}</b> ${unitMom()}<extra></extra>`},
    ],{...PLY_LAYOUT,yaxis:{...PLY_LAYOUT.yaxis,title:{text:`M (${unitMom()})`,font:{size:10.5}},autorange:'reversed'},
       shapes:suppShapes(R)},PLY_CFG);
}
function nextPattern(){if(!resultado)return;currentPatternIdx=(currentPatternIdx+1)%resultado.patrones.length;renderPatternTrace(currentPatternIdx);}
function prevPattern(){if(!resultado)return;currentPatternIdx=(currentPatternIdx-1+resultado.patrones.length)%resultado.patrones.length;renderPatternTrace(currentPatternIdx);}
function togglePatternAnim(){
    const btn=document.getElementById('btn-play-patterns');
    if(patternAnimInterval){clearInterval(patternAnimInterval);patternAnimInterval=null;btn.textContent='▶ Animar';btn.classList.remove('active');}
    else{btn.textContent='⏸ Pausar';btn.classList.add('active');patternAnimInterval=setInterval(nextPattern,1400);}
}

/* ─── VERIF TABLE ─── */
function renderVerifTable(R){
    const sc=unidades==='KGF'?101.972:1;
    const um=unitMom(), uf=unitF();
    const checks=[
        {name:'Flexión positiva (φMn ≥ Mu⁺)',calc:`${(R.phi_mn_pos*sc).toFixed(2)} ${um}`,perm:`${(R.mu_pos*sc).toFixed(2)} ${um}`,ok:R.cumple_pos},
        {name:'Flexión negativa (φMn ≥ Mu⁻)',calc:`${(R.phi_mn_neg*sc).toFixed(2)} ${um}`,perm:`${(R.mu_neg*sc).toFixed(2)} ${um}`,ok:R.cumple_neg},
        {name:'Cortante (φVc ≥ Vu)',calc:`${(R.phi_vc*sc).toFixed(2)} ${uf}`,perm:`${(R.vu_max*sc).toFixed(2)} ${uf}`,ok:R.cumple_cortante},
        {name:'Deflexión viva (L/360)',calc:`${R.delta_L_mm.toFixed(2)} mm`,perm:`${R.perm_L.toFixed(2)} mm`,ok:R.cumple_delta_L},
        {name:'Deflexión LP (L/480)',calc:`${R.delta_LP_mm.toFixed(2)} mm`,perm:`${R.perm_LP.toFixed(2)} mm`,ok:R.cumple_delta_LP},
        {name:'As mínimo superior',calc:`${R.as_sup.toFixed(2)} cm²/m`,perm:`${R.as_min_temp.toFixed(2)} cm²/m`,ok:R.cumple_as_min_sup},
        {name:'As mínimo inferior',calc:`${R.as_inf.toFixed(2)} cm²/m`,perm:`${R.as_min_temp.toFixed(2)} cm²/m`,ok:R.cumple_as_min_inf},
        {name:'Espesor mínimo',calc:`${R.h.toFixed(1)} cm`,perm:`${R.h_min_req.toFixed(2)} cm`,ok:R.cumple_h_min},
        {name:'Fisuración (+) z ≤ 31000',calc:`z=${R.z_pos.toFixed(0)}`,perm:'31000',ok:R.cumple_fisura_pos},
        {name:'Fisuración (−) z ≤ 31000',calc:`z=${R.z_neg.toFixed(0)}`,perm:'31000',ok:R.cumple_fisura_neg},
        {name:'Cuantía máxima',calc:`ρ=${(R.rho_provisto*100).toFixed(3)}%`,perm:`${(R.rho_max*100).toFixed(3)}%`,ok:R.cumple_rho_max},
    ];
    document.getElementById('verif-table-container').innerHTML=
        `<table class="verif-table"><thead><tr><th>Verificación</th><th>Calculado</th><th>Permisible</th><th>Estado</th></tr></thead><tbody>`+
        checks.map(c=>`<tr><td>${c.name}</td><td>${c.calc}</td><td>${c.perm}</td>
            <td>${c.ok?'<span class="badge-ok">CUMPLE</span>':'<span class="badge-fail">NO CUMPLE</span>'}</td></tr>`).join('')+
        '</tbody></table>';
}

/* ═══════════════════════════════════════════════════════
   MODAL REGISTRO + DESCARGA
   ═══════════════════════════════════════════════════════ */
function closeModalRegistro(){ document.getElementById('modal-registro').classList.remove('active'); }

async function doDescargarMemoria(){
    const nombre=document.getElementById('reg-nombre').value.trim();
    const empresa=document.getElementById('reg-empresa').value.trim();
    const correo=document.getElementById('reg-correo').value.trim();
    const pais=document.getElementById('reg-pais').value.trim();
    const proyecto=document.getElementById('reg-proyecto').value.trim();
    const matricula=document.getElementById('reg-matricula').value.trim();
    const consent=document.getElementById('reg-consent').checked;

    if(!nombre||!empresa||!correo){showToast('Complete nombre, empresa y correo.','err');return;}
    // Validación estricta de email
    const emailOk=/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(correo);
    if(!emailOk){showToast('El correo no tiene un formato válido. Ej: usuario@empresa.com','err');return;}
    if(!consent){showToast('Debe aceptar la autorización de datos.','err');return;}

    const btn=document.getElementById('btn-descargar-final');
    btn.disabled=true; btn.textContent='Generando...';

    try {
        // Registro — no bloquea la descarga si falla
        fetch(`${API_BASE}/api/registrar_descarga`,{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({nombre,empresa,correo,pais,proyecto,matricula,entrada:buildPayload()}),
        }).catch(e=>console.warn('Registro no enviado:',e));

        // Descarga
        const res=await fetch(`${API_BASE}/api/exportar_word`,{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                entrada:{...buildPayload(), unidades},
                proyecto:{nombre:empresa,matricula,proyecto,ubicacion:pais,fecha:''},
            }),
        });
        if(!res.ok) throw new Error('Error generando memoria Word');
        const blob=await res.blob();
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url; a.download=`Memoria_Losa_CREER_${(proyecto||'Proyecto').replace(/\s+/g,'_')}.docx`;
        a.click(); URL.revokeObjectURL(url);
        closeModalRegistro();
        showToast('Memoria descargada ✓','ok');
    } catch(e){
        showToast('Error: '+e.message,'err');
    } finally {
        btn.disabled=false; btn.textContent='↓ Descargar Memoria Word';
    }
}

/* ─── Toast ─── */
function showToast(msg,type='ok'){
    const t=document.getElementById('toast');
    t.textContent=msg; t.className=`toast ${type} show`;
    setTimeout(()=>t.classList.remove('show'),3800);
}
