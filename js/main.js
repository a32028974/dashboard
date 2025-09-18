// ============================
// Tablero semáforo + Auto-Refresh
// ============================

// <<< CAMBIAR SOLO ESTA LÍNEA SI TENÉS OTRO /exec >>>
const API_URL = 'https://script.google.com/macros/s/AKfycbybza1V9Om8MHI04iFBF4XM8I6am4QG3QOSr6tPnXV3vJwx5FhAzD21Iy8z6FJ1-3v3SQ/exec';

// ===== Config de actualización en tiempo real =====
const REFRESH_MS = 15000;         // intervalo base 15s
const REFRESH_MAX_MS = 60000;     // backoff máx 60s

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

  // dd/mm/aa | dd-mm-aa | dd/mm/aaaa ...
  const m=str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){
    let[,dd,mm,yy]=m;
    if(yy.length===2) yy='20'+yy;
    const d=new Date(+yy,+mm-1,+dd);
    d.setHours(0,0,0,0);
    return isNaN(d)?null:d;
  }
  const d=new Date(str);
  if(!isNaN(d)){ d.setHours(0,0,0,0); return d; }
  return null;
}
function toDMY(s){ const d=parseAnyToDate(s); return d?fmtDMY(d):''; }
function daysUntil(s){ const d=parseAnyToDate(s); if(!d) return Infinity; return Math.floor((d - todayLocal())/86400000); }

// ===== Normalización texto =====
function cleanInvisible(s){
  return safe(s)
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const norm = (s)=> cleanInvisible(s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // sin acentos
  .toUpperCase();

function isListo(estadoRaw){
  const e = norm(estadoRaw);
  return e.includes('LISTO') || e.includes('ENTREGADO');
}

// ===== Estado global =====
let state = {
  items: [],
  total: 0,
  page: 100,
  query: '',
  timer: null,
  backoff: REFRESH_MS,
  lastHash: ''
};

window._state = state; // <- para inspeccionarlo desde la consola


// ===== Mapear registros a columnas =====
// C,B,D,F,G,K,AF,AG + A (estado)
function normalizeRecord(r){
  const C  = toDMY(r.retira   ?? r.C  ?? r.c  ?? r.fechaRetira ?? r['Fecha retira'] ?? '');
  const B  = toDMY(r.fecha    ?? r.B  ?? r.b  ?? r.fechaEncargo ?? r['Fecha encargo'] ?? '');
  const D  = safe(r.numero    ?? r.D  ?? r.d  ?? r['N° Trabajo'] ?? r.num ?? r.numeroTrabajo ?? '');
  const F  = safe(r.nombre    ?? r.F  ?? r.f  ?? r['Apellido y Nombre'] ?? r.apellidoNombre ?? '');
  const G  = safe(r.cristal   ?? r.G  ?? r.g  ?? r['Cristal'] ?? '');
  const K  = safe(r.armazon   ?? r.K  ?? r.k  ?? r.detalle ?? r['Armazón'] ?? '');
  const AF = safe(r.vendedor  ?? r.AF ?? r.af ?? r['Vendedor'] ?? '');
  const AG = safe(r.telefono  ?? r.AG ?? r.ag ?? r.tel ?? r['Teléfono'] ?? '');

  const estadoRaw = r.estado ?? r.Estado ?? r.status ?? r.STATUS ??
                    r.A ?? r.a ?? r.E ?? r.e ?? r['Estado'] ?? '';
  const A = cleanInvisible(estadoRaw);

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
function rowClass(it){
  const dLeft  = it._dLeft;
  const estado = it.A;

  if (!isFinite(dLeft)) return 'gris';
  if (isListo(estado))  return 'verde';
  if (dLeft <= 0)       return 'rojo';
  if (dLeft <= 2)       return 'amarillo';
  return 'celeste';
}

// ===== Hash rápido del dataset para evitar re-render si no cambió =====
function computeHash(arr){
  // solo campos clave para estabilidad
  let s = arr.map(x => `${x.C}|${x.B}|${x.D}|${x.F}|${x.G}|${x.K}|${x.AF}|${x.AG}|${x.A}`).join('||');
  // djb2
  let h = 5381;
  for (let i=0;i<s.length;i++) h = ((h<<5)+h) ^ s.charCodeAt(i);
  return (h>>>0).toString(36);
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

  // 2) formato nuevo: action=tablero
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

// ===== Cargar (manual o por auto-refresh) =====
async function cargar(){
  try{
    $('progress')?.classList.add('show');
    const q = $('q')?.value.trim() || '';
    const data = await fetchHistorial(state.page, q);
    window._lastData = data; // <- crudo que vino del backend
    const mapped = data.map(normalizeRecord);

    // ordenar y render solo si cambió
    sortItemsFrom(mapped);
  }catch(err){
    logUI(`Error: ${err.message}`);
    console.error(err);
  }finally{
    $('progress')?.classList.remove('show');
  }
}

function sortItemsFrom(arr){
  // calcular hash y evitar re-render si es igual
  const h = computeHash(arr);
  if (h === state.lastHash) {
    logUI(`Sin cambios. Reg: ${state.items.length}`);
    return;
  }
  state.items = arr;
  state.lastHash = h;
  sortItems();
  render();
  logUI(`OK. Registros: ${state.items.length}`);
}

// ===== Auto-Refresh =====
function scheduleNextRefresh(ok){
  if (ok) state.backoff = REFRESH_MS;
  else state.backoff = Math.min(REFRESH_MAX_MS, state.backoff * 2);

  clearTimeout(state.timer);
  state.timer = setTimeout(tick, state.backoff);
}

async function tick(){
  // no refrescar si la pestaña está oculta (ahorra cuotas)
  if (document.hidden) { scheduleNextRefresh(true); return; }

  try{
    const q = $('q')?.value.trim() || '';
    const data = await fetchHistorial(state.page, q);
    sortItemsFrom(data.map(normalizeRecord));
    scheduleNextRefresh(true);
  }catch(err){
    console.error('Auto-refresh error:', err);
    logUI(`Reintentando en ${Math.round(state.backoff/1000)}s…`);
    scheduleNextRefresh(false);
  }
}

function startAutoRefresh(){
  clearTimeout(state.timer);
  state.backoff = REFRESH_MS;
  scheduleNextRefresh(true);
}

// Pausar cuando no está visible
document.addEventListener('visibilitychange', ()=>{
  if (document.hidden) {
    clearTimeout(state.timer);
  } else {
    startAutoRefresh();
  }
});

// ===== Eventos =====
$('btnLoad')  ?.addEventListener('click', cargar);
$('btnClear') ?.addEventListener('click', ()=>{ const iq=$('q'); if(iq) iq.value=''; cargar(); });
$('sort')     ?.addEventListener('change', ()=>{ sortItems(); render(); });
$('limit')    ?.addEventListener('change', (e)=>{ state.page = Number(e.target.value||100); cargar(); });
$('q')        ?.addEventListener('keyup', (e)=>{ if(e.key==='Enter') cargar(); });

// ===== Init =====
window.addEventListener('DOMContentLoaded', ()=>{
  state.page = Number($('limit')?.value || 100);
  logUI('Listo. Clic en Cargar o esperá la sincronización…');
  cargar();             // primera carga
  startAutoRefresh();   // y arranca el “tiempo real”
});

// ===== Debug =====
window._debug = { cargar, fetchHistorial, parseAnyToDate, daysUntil, rowClass, normalizeRecord, computeHash };
