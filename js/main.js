// ============================
// Óptica Cristal – Dashboard
// main.js (mod con logs)
// ============================

console.log('[dashboard] boot');

const API_URL = 'https://script.google.com/macros/s/AKfycbzlfk45TlruCwMFobbtQ8E_BtiVXUvAGMqXA0OSLvFwgDZlXWHDCBunVJ38Nk-rOcGceg/exec'; // <- poné acá la URL /exec vigente

// ---- helpers DOM
const $ = (id) => document.getElementById(id);
const debounce = (fn, ms=300) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); } };
const todayLocal = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
const safe = (v) => (v??'').toString().trim();

function parseDateDMY(str){
  const s = (str||'').trim(); if(!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(!m) return null;
  let dd=+m[1], mm=+m[2], yy=+m[3]; if(yy<100) yy+=2000;
  const d = new Date(yy, mm-1, dd, 0,0,0,0);
  return Number.isNaN(d.getTime()) ? null : d;
}
function daysUntil(dateStr){
  const d = parseDateDMY(dateStr); if(!d) return Number.POSITIVE_INFINITY;
  const base = todayLocal();
  const ms = d.getTime() - base.getTime();
  return Math.floor(ms / 86400000);
}
function isReady(estado){ return /\bLISTO\b/i.test(String(estado||'')); }

// ---- estado
let state = {
  items: [],
  total: 0,
  limitLoaded: 0,
  pageStep: 100,
  query: '',
  loading: false
};

// ---- armado de URL (usa histUltimos/histBuscar como acordamos en GAS)
function buildURL(){
  if (!API_URL || !/^https?:\/\//.test(API_URL)) {
    throw new Error('API_URL inválida o vacía');
  }
  const qp = new URLSearchParams();
  if (state.query) {
    qp.set('histBuscar', state.query);
    qp.set('limit', String(state.limitLoaded||state.pageStep));
  } else {
    qp.set('histUltimos', String(state.limitLoaded||state.pageStep));
  }
  const url = API_URL + '?' + qp.toString();
  console.debug('[GET url]', url);
  return url;
}

// ---- fetch principal
async function fetchTrabajos(){
  if(state.loading) return;
  state.loading = true; toggleProgress(true);
  try{
    const url = buildURL();
    const res = await fetch(url, { method:'GET', cache:'no-store' });
    console.debug('[HTTP]', res.status, res.statusText);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    console.debug('[DATA len]', Array.isArray(data) ? data.length : 'no-array', data);
    const items = Array.isArray(data) ? data : (Array.isArray(data.items)?data.items:[]);
    state.items = items.map(mapFromAPI);
    state.total  = items.length;
    sortItems();
    render();
  }catch(err){
    console.error('[fetchTrabajos] error', err);
    showHint('No pude cargar los trabajos. Revisá la consola (F12 → Consola/Red).');
  }finally{
    state.loading = false; toggleProgress(false);
  }
}

// ---- mapeo desde API
function mapFromAPI(it){
  return {
    estado: safe(it.estado),
    fecha:  safe(it.fecha),
    retira: safe(it.retira),
    numero: safe(it.numero),
    dni:    safe(it.dni),
    nombre: safe(it.nombre),
    cristal:safe(it.cristal),
    n_armazon: safe(it.n_armazon),
    det_armazon: safe(it.det_armazon),
    dist_focal: safe(it.dist_focal),
    vendedor: safe(it.vendedor),
    telefono: safe(it.telefono),
    pdf: safe(it.pdf),
    dLeft: daysUntil(it.retira),
    ready: isReady(it.estado)
  };
}

// ---- orden
function sortItems(){
  state.items.sort((a,b)=>{
    if(a.ready !== b.ready) return a.ready ? 1 : -1;
    const da = a.dLeft, db = b.dLeft;
    return (da - db) || cmpDate(a.retira, b.retira) || cmpStr(a.numero, b.numero);
  });
}
function cmpStr(a,b){ return String(a).localeCompare(String(b), 'es'); }
function cmpDate(a,b){
  const da = parseDateDMY(a)?.getTime() ?? 9e15;
  const db = parseDateDMY(b)?.getTime() ?? 9e15;
  return da - db;
}

// ---- render + clases por estado/fecha
function rowClass(it){
  if(it.ready) return 'ready';
  const d = it.dLeft;
  if (d <= 1) return 'alert-red';
  if (d <= 3) return 'alert-orange';
  return '';
}
function badgeTexto(it){
  if(it.ready) return 'LISTO';
  const d = it.dLeft;
  if (!isFinite(d)) return '';
  if (d < 0) return `VENCIDO ${Math.abs(d)}d`;
  if (d === 0) return 'HOY';
  if (d === 1) return 'MAÑANA';
  return `EN ${d}d`;
}

function render(){
  const tbody = $('tbody');
  if (!tbody) { console.error('Falta <tbody id="tbody">'); return; }
  tbody.innerHTML = '';
  for(const it of state.items){
    const tr = document.createElement('tr');
    tr.className = rowClass(it);
    const badge = badgeTexto(it);
    tr.innerHTML = `
      <td class="mono">${safe(it.fecha)}</td>
      <td class="mono">${safe(it.numero)}</td>
      <td>${safe(it.nombre)}</td>
      <td class="mono">${safe(it.dni)}</td>
      <td class="mono">${safe(it.telefono)}</td>
      <td>${safe(it.det_armazon)}</td>
      <td>${safe(it.cristal)}</td>
      <td class="right mono"></td>
      <td class="right mono"></td>
      <td class="right mono"></td>
      <td><span class="state ${it.ready ? 'OK' : (it.dLeft<=1?'PEND':'LAB')}">${safe(it.estado|| (it.ready?'LISTO':'PEND.'))}</span></td>
      <td class="mono">${safe(it.retira)} ${badge?`<span class="pill" style="margin-left:6px">${badge}</span>`:''}</td>
      <td>${safe(it.vendedor)}</td>
    `;
    tr.title = 'Click para copiar N° de trabajo';
    tr.addEventListener('click', ()=> copyNumero(it));
    tbody.appendChild(tr);
  }
  $('count').textContent = String(state.items.length);
  $('total').textContent = state.total ? String(state.total) : '—';
  $('pageInfo').textContent = `Cargados: ${state.limitLoaded}`;
}

function copyNumero(it){
  const nro = it.numero || '';
  if(!nro) return;
  navigator.clipboard?.writeText(String(nro));
}

const toggleProgress = (on)=> $('progress').classList.toggle('show', !!on);
const showHint = (msg)=> { const el=$('hint'); if(el) el.textContent = msg; };

// ---- events
window.addEventListener('error', (e)=>{
  console.error('[window.onerror]', e.message || e);
});

$('btnLoad').addEventListener('click', ()=>{
  state.query = $('q').value.trim();
  resetAndLoad();
});
$('btnClear').addEventListener('click', ()=>{
  $('q').value = '';
  state.query = '';
  resetAndLoad();
});
$('limit').addEventListener('change', ()=>{
  state.pageStep = Number($('limit').value||100);
  resetAndLoad();
});
$('sort').addEventListener('change', ()=>{ render(); });
$('q').addEventListener('keyup', (e)=>{ if(e.key==='Enter'){ state.query=$('q').value.trim(); resetAndLoad(); } });

function resetAndLoad(){
  state.limitLoaded = state.pageStep;
  fetchTrabajos();
}

// scroll infinito
document.getElementById('scroller').addEventListener('scroll', debounce(()=>{
  const el = document.getElementById('scroller');
  if (state.loading) return;
  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
  if (nearBottom){
    state.limitLoaded += state.pageStep;
    fetchTrabajos();
  }
}, 120));

// ---- boot
document.getElementById('limit').value = '100';
state.pageStep = 100;
console.log('[dashboard] init → resetAndLoad()');
resetAndLoad();
