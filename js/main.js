// ============================
// Óptica Cristal – Tablero Semáforo (C,B,D,F,G,K,AF,AG) + A (LISTO)
// ============================

// 🔗 PONÉ ACA tu /exec vigente (el que estás usando para historial)
const API_URL = 'https://script.google.com/macros/s/AKfycby6SzAgXhtctDbYEGETB6Ku8X_atugp7Mld5QvimnDpXMmHU9IxW9XRqDkRI0rGONr85Q/exec';

const $ = (id) => document.getElementById(id);
const debounce = (fn, ms=300) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); } };
const todayLocal = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const safe = (v) => (v??'').toString().trim();

// ====== Fechas ======
function fmtDMY(date){
  // dd/mm/aaaa
  const dd = String(date.getDate()).padStart(2,'0');
  const mm = String(date.getMonth()+1).padStart(2,'0');
  const yy = date.getFullYear();
  return `${dd}/${mm}/${yy}`;
}
function parseAnyToDate(s){
  if (s == null || s === '') return null;
  if (s instanceof Date && !isNaN(s)) return new Date(s.getTime());
  const t = typeof s;
  if (t === 'number') { // serial/epoch
    const d = new Date(s); if(!isNaN(d)) { d.setHours(0,0,0,0); return d; }
  }
  // strings: "17/09/2025" o "Wed Sep 24 2025 00:00:00 GMT-0300 ..."
  const str = String(s).trim();
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [_, dd, mm, yy] = m; if(yy.length===2) yy = '20'+yy;
    const d = new Date(+yy, +mm-1, +dd); d.setHours(0,0,0,0);
    return isNaN(d) ? null : d;
  }
  const d = new Date(str);
  if (!isNaN(d)) { d.setHours(0,0,0,0); return d; }
  return null;
}
function toDMY(s){
  const d = parseAnyToDate(s);
  return d ? fmtDMY(d) : '';
}
function daysUntil(s){
  const d = parseAnyToDate(s);
  if (!d) return Number.POSITIVE_INFINITY;
  return Math.floor((d.getTime() - todayLocal().getTime())/86400000);
}

// ====== Semáforo ======
function rowClass(item){
  if (/\bLISTO\b/i.test(item.A)) return 'verde'; // columna A manda
  const d = item._dLeft;
  if (!isFinite(d)) return 'gris';
  if (d <= 0) return 'rojo';     // hoy o vencido
  if (d <= 2) return 'amarillo'; // 1–2 días
  return 'celeste';              // 3+ días
}

// ====== Estado global ======
let state = { items:[], total:0, limitLoaded:0, pageStep:100, query:'', loading:false };

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

// Mapeamos a tus columnas destino, admitiendo distintos nombres del backend
function normalizeRecord(r){
  // Fechas
  const C = toDMY(r.retira ?? r.C ?? r.c ?? r.fechaRetira ?? '');
  const B = toDMY(r.fecha  ?? r.B ?? r.b ?? r.fechaEncargo ?? '');

  // Campos directos
  const D = safe(r.numero   ?? r.D ?? r.d ?? '');
  const F = safe(r.nombre   ?? r.F ?? r.f ?? '');
  const G = safe(r.cristal  ?? r.G ?? r.g ?? '');

  // Reasignación que pediste:
  // K = Armazón, AF = Vendedor, AG = Teléfono
  const K  = safe(r.armazon  ?? r.K  ?? r.k  ?? r.detalle ?? '');
  const AF = safe(r.vendedor ?? r.AF ?? r.af ?? '');
  const AG = safe(r.telefono ?? r.AG ?? r.ag ?? r.tel ?? '');

  // Columna A (LISTO / vacío)
  const A = safe(r.estado ?? r.A ?? r.a ?? '');

  return {
    A, B, C, D, F, G, K, AF, AG,
    _dLeft: daysUntil(C)
  };
}

// ====== Fetch ======
async function fetchTrabajos(){
  if(state.loading) return;
  state.loading = true; toggleProgress(true);
  try{
    const res = await fetch(buildURL(), { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (Array.isArray(data.items)?data.items:[]);
    state.items = arr.map(normalizeRecord);
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

// ====== Orden ======
function cmpDateStr(da, db){
  const A = parseAnyToDate(da)?.getTime() ?? 9e15;
  const B = parseAnyToDate(db)?.getTime() ?? 9e15;
  return A - B;
}
function sortItems(){
  const mode = $('sort').value;
  const by = {
    retira_asc:  (a,b)=> cmpDateStr(a.C,b.C),
    retira_desc: (a,b)=> cmpDateStr(b.C,a.C),
    encargo_asc: (a,b)=> cmpDateStr(a.B,b.B),
    encargo_desc:(a,b)=> cmpDateStr(b.B,a.B),
  }[mode] || ((a,b)=> (a._dLeft - b._dLeft));
  state.items.sort(by);
}

// ====== Render ======
function render(){
  const tbody = $('tbody'); tbody.innerHTML = '';
  const q = $('q').value.trim().toUpperCase();
  const filtered = q
    ? state.items.filter(x => (`${x.D} ${x.F} ${x.G} ${x.K} ${x.AF} ${x.AG}`).toUpperCase().includes(q))
    : state.items;

  for(const it of filtered){
    const tr = document.createElement('tr');
    tr.className = rowClass(it);
    tr.innerHTML = `
      <td class="mono">${it.C}</td>
      <td class="mono">${it.B}</td>
      <td class="mono"><strong>${it.D}</strong></td>
      <td>${it.F}</td>
      <td>${it.G}</td>
      <td>${it.K}</td>
      <td>${it.AF}</td>
      <td class="mono">${it.AG}</td>
    `;
    tr.title = 'Click para copiar N° de trabajo';
    tr.addEventListener('click', ()=> navigator.clipboard?.writeText(String(it.D||'')));
    tbody.appendChild(tr);
  }
  $('count').textContent = String(filtered.length);
  $('total').textContent = String(state.total||'—');
  $('pageInfo').textContent = `Cargados: ${state.limitLoaded}`;
}

// ====== UI ======
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
