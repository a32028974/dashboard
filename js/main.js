// ============================
// Óptica Cristal – Tablero Semáforo (8 columnas)
// ============================

// PONÉ ACA tu /exec vigente de "Carga de trabajos"
const API_URL = 'https://script.google.com/macros/s/AKfycbzagB_jZ7niXARSbnqCVfZp3e6X9oMxSlO-u-zJCfReguIe2cXf63uZFIpSSdBvMi86rA/exec';

const $ = (id) => document.getElementById(id);
const debounce = (fn, ms=300) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); } };
const todayLocal = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const safe = (v) => (v??'').toString().trim();

function parseDMY(s){
  s = safe(s); if(!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(!m) return null;
  let [_, dd, mm, yy] = m; if(yy.length===2) yy='20'+yy;
  const d = new Date(+yy, +mm-1, +dd); d.setHours(0,0,0,0);
  return isNaN(d) ? null : d;
}
function daysUntil(dateStr){
  const d = parseDMY(dateStr); if(!d) return Number.POSITIVE_INFINITY;
  const base = todayLocal();
  return Math.floor((d - base)/86400000);
}
function isReady(estado){ return /\bLISTO\b/i.test(String(estado||'')); }

// === estado
let state = { items:[], total:0, limitLoaded:0, pageStep:100, query:'', loading:false };

// === URL (compat: histUltimos / histBuscar)
function buildURL(){
  const qp = new URLSearchParams();
  if(state.query){
    qp.set('histBuscar', state.query);
    qp.set('limit', String(state.limitLoaded||state.pageStep));
  } else {
    qp.set('histUltimos', String(state.limitLoaded||state.pageStep));
  }
  return API_URL + '?' + qp.toString();
}

// === fetch
async function fetchTrabajos(){
  if(state.loading) return;
  state.loading = true; toggleProgress(true);
  try{
    const res = await fetch(buildURL(), { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (Array.isArray(data.items)?data.items:[]);
    // Mapeo a tus 8 columnas con equivalencias:
    // C = retira, B = fecha (encarga), D = numero, F = nombre,
    // G = cristal, K = estado, AF = sena, AG = saldo
    state.items = arr.map(it => ({
      C: safe(it.retira),
      B: safe(it.fecha),
      D: safe(it.numero),
      F: safe(it.nombre),
      G: safe(it.cristal),
      K: safe(it.estado),
      AF: safe(it.sena || ''),
      AG: safe(it.saldo || ''),

      dLeft: daysUntil(it.retira),
      ready: isReady(it.estado)
    }));
    state.total = state.items.length;
    sortItems();
    render();
  }catch(e){
    console.error(e);
    $('hint').textContent = 'No pude cargar los trabajos. Revisá la consola.';
  }finally{
    state.loading=false; toggleProgress(false);
  }
}

// === orden
function sortItems(){
  const mode = $('sort').value;
  const by = {
    retira_asc:  (a,b)=> cmpDate(a.C,b.C),
    retira_desc: (a,b)=> cmpDate(b.C,a.C),
    encargo_asc: (a,b)=> cmpDate(a.B,b.B),
    encargo_desc:(a,b)=> cmpDate(b.B,a.B),
  }[mode] || ((a,b)=> (a.dLeft - b.dLeft));
  state.items.sort(by);
}
function cmpDate(a,b){
  const A = parseDMY(a)?.getTime() ?? 9e15;
  const B = parseDMY(b)?.getTime() ?? 9e15;
  return A - B;
}

// === semáforo
function rowClass(it){
  if (it.ready) return 'verde';
  const d = it.dLeft;
  if (!isFinite(d)) return 'gris';
  if (d <= 0) return 'rojo';        // hoy o vencido
  if (d <= 2) return 'amarillo';    // 1–2 días
  return 'celeste';                 // 3+ días
}

// === render
function render(){
  const tbody = $('tbody'); tbody.innerHTML = '';
  const q = $('q').value.trim().toUpperCase();
  const filtered = q
    ? state.items.filter(x =>
        (x.D+x.F+x.G).toUpperCase().includes(q) || String(x.D).includes(q))
    : state.items;

  for(const it of filtered){
    const tr = document.createElement('tr');
    tr.className = rowClass(it);
    tr.innerHTML = `
      <td class="mono">${it.C||''}</td>
      <td class="mono">${it.B||''}</td>
      <td class="mono"><strong>${it.D||''}</strong></td>
      <td>${it.F||''}</td>
      <td>${it.G||''}</td>
      <td>${it.K||''}</td>
      <td class="right mono">${it.AF||''}</td>
      <td class="right mono">${it.AG||''}</td>
    `;
    tr.title = 'Click para copiar N° de trabajo';
    tr.addEventListener('click', ()=> navigator.clipboard?.writeText(String(it.D||'')));
    tbody.appendChild(tr);
  }
  $('count').textContent = String(filtered.length);
  $('total').textContent = String(state.total||'—');
  $('pageInfo').textContent = `Cargados: ${state.limitLoaded}`;
}

// === UI
const toggleProgress = (on)=> $('progress').classList.toggle('show', !!on);
$('btnLoad').addEventListener('click', ()=>{ state.query=$('q').value.trim(); resetAndLoad(); });
$('btnClear').addEventListener('click', ()=>{ $('q').value=''; state.query=''; resetAndLoad(); });
$('limit').addEventListener('change', ()=>{ state.pageStep = Number($('limit').value||100); resetAndLoad(); });
$('sort').addEventListener('change', ()=>{ sortItems(); render(); });
$('q').addEventListener('keyup', (e)=>{ if(e.key==='Enter'){ state.query=$('q').value.trim(); resetAndLoad(); } });

function resetAndLoad(){ state.limitLoaded = state.pageStep; fetchTrabajos(); }

// scroll infinito
document.getElementById('scroller').addEventListener('scroll', debounce(()=>{
  const el = document.getElementById('scroller');
  if (state.loading) return;
  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
  if (nearBottom){ state.limitLoaded += state.pageStep; fetchTrabajos(); }
}, 120));

// boot
document.getElementById('limit').value = '100';
state.pageStep = 100;
resetAndLoad();
