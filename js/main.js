// ============================
// Óptica Cristal – Dashboard
// main.js (consumo de histUltimos/histBuscar)
// ============================

// PONÉ ACÁ tu URL /exec de la COPIA publicada:
const API_URL = 'https://script.google.com/macros/s/AKfycbw2bdTcdrve8uUGHpSZRbQp7wcv3kUWVAOyvfgQ-okZytBFGYcj0DvwkKpqNvr0ks2UlQ/exec';

// ---- helpers
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
let state = { items:[], total:0, limitLoaded:0, pageStep:100, query:'', loading:false };

// ---- URL
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

// ---- fetch
async function fetchTrabajos(){
  if(state.loading) return;
  state.loading = true; toggleProgress(true);
  try{
    const url = buildURL();
    const res = await fetch(url, { method:'GET', cache:'no-store' });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const items = Array.isArray(data) ? data : (Array.isArray(data.items)?data.items:[]);
    state.items = items.map(mapFromAPI);
    state.total  = items.length;
    sortItems();
    render();
  }catch(err){
    console.error('[fetchTrabajos] error', err);
    $('hint').textContent = 'No pude cargar los trabajos. Revisá la consola.';
  }finally{
    state.loading = false; toggleProgress(false);
  }
}

// ---- mapeo
function mapFromAPI(it){
  return {
    estado: safe(it.estado),
    fecha:  safe(it.fecha),           // FECHA QUE ENCARGA
    retira: safe(it.retira),          // FECHA QUE RETIRA
    numero: safe(it.numero),          // NUMERO DE TRABAJO
    dni:    safe(it.dni),             // DOCUMENTO
    nombre: safe(it.nombre),          // APELLIDO Y NOMBRE
    cristal:safe(it.cristal),         // CRISTAL
    vendedor: safe(it.vendedor),      // VENDEDOR
    telefono: safe(it.telefono),      // TELEFONO

    // opcionales (no están en tu hoja hoy)
    det_armazon: safe(it.det_armazon || ''),
    total: safe(it.total || ''),
    sena:  safe(it.sena  || ''),
    saldo: safe(it.saldo || ''),
    pdf:   safe(it.pdf   || ''),

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

// ---- render + semáforo por fecha/estado
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
  const tbody = $('tbody'); tbody.innerHTML = '';
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
      <td class="right mono">${safe(it.total)}</td>
      <td class="right mono">${safe(it.sena)}</td>
      <td class="right mono">${safe(it.saldo)}</td>
      <td><span class="state ${it.ready ? 'OK' : (it.dLeft<=1?'PEND':'LAB')}">${safe(it.estado|| (it.ready?'LISTO':'PEND.'))}</span></td>
      <td class="mono">${safe(it.retira)} ${badge?`<span class="pill" style="margin-left:6px">${badge}</span>`:''}</td>
      <td>${safe(it.vendedor)}</td>
    `;
    tr.title = 'Click para copiar N° de trabajo';
    tr.addEventListener('click', ()=> navigator.clipboard?.writeText(String(it.numero||'')));
    tbody.appendChild(tr);
  }
  $('count').textContent = String(state.items.length);
  $('total').textContent = state.total ? String(state.total) : '—';
  $('pageInfo').textContent = `Cargados: ${state.limitLoaded}`;
}

// ---- UI
const toggleProgress = (on)=> $('progress').classList.toggle('show', !!on);
$('btnLoad').addEventListener('click', ()=>{ state.query=$('q').value.trim(); resetAndLoad(); });
$('btnClear').addEventListener('click', ()=>{ $('q').value=''; state.query=''; resetAndLoad(); });
$('limit').addEventListener('change', ()=>{ state.pageStep = Number($('limit').value||100); resetAndLoad(); });
$('sort').addEventListener('change', ()=>{ render(); });
$('q').addEventListener('keyup', (e)=>{ if(e.key==='Enter'){ state.query=$('q').value.trim(); resetAndLoad(); } });

function resetAndLoad(){ state.limitLoaded = state.pageStep; fetchTrabajos(); }

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
