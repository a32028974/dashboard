// ============================
// Tablero semáforo (robusto con diagnósticos)
// ============================

// <<< CAMBIAR SOLO ESTA LÍNEA SI TENÉS OTRO /exec >>>
const API_URL = 'https://script.google.com/macros/s/AKfycbybza1V9Om8MHI04iFBF4XM8I6am4QG3QOSr6tPnXV3vJwx5FhAzD21Iy8z6FJ1-3v3SQ/exec';

// ===== Helpers DOM / UI =====
const $ = (id) => document.getElementById(id);
const logUI = (msg) => { const el = $('hint'); if (el) el.textContent = msg; };
const safe = (v) => (v ?? '').toString().trim();

// ===== Fechas =====
function todayLocal(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function fmtDMY(d){ const dd=String(d.getDate()).padStart(2,'0'); const mm=String(d.getMonth()+1).padStart(2,'0'); return `${dd}/${mm}/${d.getFullYear()}`; }

function parseAnyToDate(s){
  if (s instanceof Date && !isNaN(s)) { const d=new Date(s.getTime()); d.setHours(0,0,0,0); return d; }
  if (typeof s === 'number'){ const d=new Date(s); if(!isNaN(d)) { d.setHours(0,0,0,0); return d; } }
  const str=safe(s); if(!str) return null;

  // dd/mm/aa, dd-mm-aa, dd/mm/aaaa...
  const m=str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){
    let[,dd,mm,yy]=m;
    if(yy.length===2) yy='20'+yy;
    const d=new Date(+yy,+mm-1,+dd);
    d.setHours(0,0,0,0);
    return isNaN(d)?null:d;
  }
  // fallback Date()
  const d=new Date(str);
  if(!isNaN(d)){ d.setHours(0,0,0,0); return d; }
  return null;
}

function toDMY(s){ const d=parseAnyToDate(s); return d?fmtDMY(d):''; }
function daysUntil(s){ const d=parseAnyToDate(s); if(!d) return Infinity; return Math.floor((d - todayLocal())/86400000); }

// ===== Normalización texto =====
const norm = (s)=> safe(s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // sin acentos
  .toUpperCase();

function isListo(estadoRaw){
  const e = norm(estadoRaw);
  // lista de variantes comunes
  return /^LISTO\b/.test(e) || e.includes('ENTREGADO');
}

// ===== Estado global =====
let state = { items: [], total: 0, page: 100, query: '' };

// ===== Mapear registros a las columnas que usás en la tabla =====
// C,B,D,F,G,K,AF,AG + A (estado)
function normalizeRecord(r){
  const C  = toDMY(r.retira   ?? r.C  ?? r.c  ?? r.fechaRetira ?? r['Fecha retira'] ?? '');
  const B  = toDMY(r.fecha    ?? r.B  ?? r.b  ?? r.fechaEncargo ?? r['Fecha encargo'] ?? '');
  const D  = safe(r.numero    ?? r.D  ?? r.d  ?? r['N° Trabajo'] ?? r.num ?? '');
  const F  = safe(r.nombre    ?? r.F  ?? r.f  ?? r['Apellido y Nombre'] ?? '');
  const G  = safe(r.cristal   ?? r.G  ?? r.g  ?? r['Cristal'] ?? '');
  const K  = safe(r.armazon   ?? r.K  ?? r.k  ?? r.detalle ?? r['Armazón'] ?? '');
  const AF = safe(r.vendedor  ?? r.AF ?? r.af ?? r['Vendedor'] ?? '');
  const AG = safe(r.telefono  ?? r.AG ?? r.ag ?? r.tel ?? r['Teléfono'] ?? '');
  const A  = safe(r.estado    ?? r.A  ?? r.a  ?? r['Estado'] ?? '');

  return { A,B,C,D,F,G,K,AF,AG, _dLeft: daysUntil(C) };
}

// ===== Orden =====
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

// ===== Semáforo =====
// Regla pedida:
//  - ROJO si Retira es hoy/ayer/antes y NO está LISTO
//  - VERDE si LISTO
//  - AMARILLO si faltan ≤2 días
//  - CELESTE si faltan >2 días
//  - GRIS si no hay fecha
function rowClass(it){
  const dLeft = it._dLeft;              // días hasta "retira" (neg/0 = vencido/hoy)
  const estado = it.A;

  if (!isFinite(dLeft)) return 'gris';
  if (isListo(estado))  return 'verde';
  if (dLeft <= 0)       return 'rojo';
  if (dLeft <= 2)       return 'amarillo';
  return 'celeste';
}

// ===== Render =====
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

  $('count') && ($('count').textContent = String(filtered.length));
  $('total') && ($('total').textContent = String(state.items.length));
  $('pageInfo') && ($('pageInfo').textContent = `Cargados: ${state.page}`);
}

// ===== FETCH con fallback =====
async function fetchHistorial(limit, query){
  // 1) formato viejo: histUltimos / histBuscar
  const qp = new URLSearchParams();
  if (query) { qp.set('histBuscar', query); qp.set('limit', String(limit)); }
  else       { qp.set('histUltimos', String(limit)); }
  const url1 = `${API_URL}?${qp.toString()}`;

  // 2) formato nuevo: action=tablero (si tu Apps Script lo soporta)
  const url2 = `${API_URL}?action=tablero`;

  try {
    logUI('Cargando… (formato historial)');
    const r1 = await fetch(url1, { cache:'no-store' });
    const t1 = await r1.text();
    try {
      const j1 = JSON.parse(t1);
      const arr = Array.isArray(j1) ? j1 : (Array.isArray(j1.items) ? j1.items : []);
      if (arr.length) return arr;
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

// ===== Cargar =====
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

// ===== Eventos =====
$('btnLoad')  ?.addEventListener('click', cargar);
$('btnClear') ?.addEventListener('click', ()=>{ const iq=$('q'); if(iq) iq.value=''; cargar(); });
$('sort')     ?.addEventListener('change', ()=>{ sortItems(); render(); });
$('limit')    ?.addEventListener('change', (e)=>{ state.page = Number(e.target.value||100); cargar(); });
$('q')        ?.addEventListener('keyup', (e)=>{ if(e.key==='Enter') cargar(); });

// ===== Auto-load al abrir =====
window.addEventListener('DOMContentLoaded', ()=>{
  state.page = Number($('limit')?.value || 100);
  logUI('Listo. Hacé clic en Cargar.');
  // Si querés auto-cargar al abrir, descomentá:
  // cargar();
});

// ===== Debug en consola =====
window._debug = { cargar, fetchHistorial, parseAnyToDate, daysUntil, rowClass, normalizeRecord };
