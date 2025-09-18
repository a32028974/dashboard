// ============================
// Tablero semáforo (robusto con diagnósticos)
// ============================

// <<< CAMBIAR SOLO ESTA LÍNEA SI TENÉS OTRO /exec >>>
const API_URL = 'https://script.google.com/macros/s/AKfycbybza1V9Om8MHI04iFBF4XM8I6am4QG3QOSr6tPnXV3vJwx5FhAzD21Iy8z6FJ1-3v3SQ/exec';

const $ = (id) => document.getElementById(id);
const logUI = (msg) => { const el = $('hint'); if (el) el.textContent = msg; };
const safe = (v) => (v ?? '').toString().trim();

function todayLocal(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function fmtDMY(d){ const dd=String(d.getDate()).padStart(2,'0'); const mm=String(d.getMonth()+1).padStart(2,'0'); return `${dd}/${mm}/${d.getFullYear()}`; }
function parseAnyToDate(s){
  if (s instanceof Date && !isNaN(s)) return new Date(s.getTime());
  if (typeof s === 'number'){ const d=new Date(s); if(!isNaN(d)) { d.setHours(0,0,0,0); return d; } }
  const str=safe(s); if(!str) return null;
  const m=str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){ let[,dd,mm,yy]=m; if(yy.length===2) yy='20'+yy; const d=new Date(+yy,+mm-1,+dd); d.setHours(0,0,0,0); return isNaN(d)?null:d; }
  const d=new Date(str); if(!isNaN(d)) { d.setHours(0,0,0,0); return d; }
  return null;
}
function toDMY(s){ const d=parseAnyToDate(s); return d?fmtDMY(d):''; }
function daysUntil(s){ const d=parseAnyToDate(s); if(!d) return Infinity; return Math.floor((d - todayLocal())/86400000); }
function rowClass(it){
  if (/\bLISTO\b/i.test(it.A)) return 'verde';
  const d = it._dLeft;
  if (!isFinite(d)) return 'gris';
  if (d <= 0) return 'rojo';
  if (d <= 2) return 'amarillo';
  return 'celeste';
}

// Estado
let state = { items: [], total: 0, page: 100, query: '' };

function normalizeRecord(r){
  // C,B,D,F,G,K,AF,AG + A
  const C  = toDMY(r.retira   ?? r.C  ?? r.c  ?? r.fechaRetira ?? '');
  const B  = toDMY(r.fecha    ?? r.B  ?? r.b  ?? r.fechaEncargo ?? '');
  const D  = safe(r.numero    ?? r.D  ?? r.d  ?? '');
  const F  = safe(r.nombre    ?? r.F  ?? r.f  ?? '');
  const G  = safe(r.cristal   ?? r.G  ?? r.g  ?? '');
  const K  = safe(r.armazon   ?? r.K  ?? r.k  ?? r.detalle ?? '');
  const AF = safe(r.vendedor  ?? r.AF ?? r.af ?? '');
  const AG = safe(r.telefono  ?? r.AG ?? r.ag ?? r.tel ?? '');
  const A  = safe(r.estado    ?? r.A  ?? r.a  ?? '');

  return { A,B,C,D,F,G,K,AF,AG, _dLeft: daysUntil(C) };
}

function cmpDateStr(a,b){
  const A = parseAnyToDate(a)?.getTime() ?? 9e15;
  const B = parseAnyToDate(b)?.getTime() ?? 9e15;
  return A-B;
}

function sortItems(){
  const mode = $('sort')?.value || 'retira_asc';
  const by = {
    retira_asc:  (a,b)=> cmpDateStr(a.C,b.C),
    retira_desc: (a,b)=> cmpDateStr(b.C,a.C),
    encargo_asc: (a,b)=> cmpDateStr(a.B,b.B),
    encargo_desc:(a,b)=> cmpDateStr(b.B,a.B),
  }[mode] || ((a,b)=> a._dLeft - b._dLeft);
  state.items.sort(by);
}

function render(){
  const tbody = $('tbody'); if(!tbody) return;
  const q = $('q')?.value.trim().toUpperCase() || '';
  const filtered = q
    ? state.items.filter(x => (`${x.D} ${x.F} ${x.G} ${x.K} ${x.AF} ${x.AG}`).toUpperCase().includes(q))
    : state.items;

  tbody.innerHTML = filtered.map(it => `
    <tr class="${rowClass(it)}">
      <td class="mono">${it.C}</td>
      <td class="mono">${it.B}</td>
      <td class="mono"><strong>${it.D}</strong></td>
      <td>${it.F}</td>
      <td>${it.G}</td>
      <td>${it.K}</td>
      <td>${it.AF}</td>
      <td class="mono">${it.AG}</td>
    </tr>
  `).join('') || `<tr><td colspan="8" class="empty">Sin resultados</td></tr>`;

  $('count').textContent = String(filtered.length);
  $('total').textContent = String(state.items.length);
  $('pageInfo').textContent = `Cargados: ${state.page}`;
}

// ---- FETCH con fallback ----
async function fetchHistorial(limit, query){
  // 1) formato viejo: histUltimos / histBuscar
  const qp = new URLSearchParams();
  if (query) { qp.set('histBuscar', query); qp.set('limit', String(limit)); }
  else { qp.set('histUltimos', String(limit)); }
  const url1 = `${API_URL}?${qp.toString()}`;

  // 2) formato nuevo: action=tablero
  const url2 = `${API_URL}?action=tablero`;

  // intentamos url1 -> si falla/JSON invalido -> url2
  try {
    logUI('Cargando… (formato historial)');
    const r1 = await fetch(url1, { cache:'no-store' });
    const t1 = await r1.text();
    try {
      const j1 = JSON.parse(t1);
      const arr = Array.isArray(j1) ? j1 : (Array.isArray(j1.items) ? j1.items : []);
      if (arr.length) return arr;
      // si vino vacío, probamos el tablero igual
      console.warn('Historial vacío, pruebo "tablero"');
    } catch(parseErr){
      console.warn('No pude parsear historial:', parseErr);
    }
  } catch(e){ console.warn('Fallo historial:', e); }

  try {
    logUI('Cargando… (formato tablero)');
    const r2 = await fetch(url2, { cache:'no-store' });
    const j2 = await r2.json();
    const arr2 = Array.isArray(j2) ? j2 : (Array.isArray(j2.items) ? j2.items : []);
    return arr2;
  } catch(e2){
    throw new Error('No pude cargar datos (historial ni tablero).');
  }
}

async function cargar(){
  try{
    $('progress')?.classList.add('show');
    const q = $('q')?.value.trim() || '';
    const data = await fetchHistorial(state.page, q);
    state.items = data.map(normalizeRecord);
    sortItems();
    render();
    logUI(`OK. Registros: ${state.items.length}`);
  }catch(err){
    logUI(`Error: ${err.message}`);
    console.error(err);
  }finally{
    $('progress')?.classList.remove('show');
  }
}

// Eventos
$('btnLoad')?.addEventListener('click', cargar);
$('btnClear')?.addEventListener('click', ()=>{ if($('q')) $('q').value=''; cargar(); });
$('sort')?.addEventListener('change', ()=>{ sortItems(); render(); });
$('limit')?.addEventListener('change', (e)=>{ state.page = Number(e.target.value||100); cargar(); });
$('q')?.addEventListener('keyup', (e)=>{ if(e.key==='Enter') cargar(); });

// Auto-load al abrir
window.addEventListener('DOMContentLoaded', ()=>{
  state.page = Number($('limit')?.value || 100);
  logUI('Listo. Hacé clic en Cargar.');
  // si querés auto-cargar, descomentá:
  // cargar();
});

// Exponer para debug rápido desde la consola
window._debug = { cargar, fetchHistorial };
