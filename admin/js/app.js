import { disponible, obtenerPerfil, cerrarSesion } from './core/auth.js';
import { esc } from './core/ui.js';

// Módulos del panel. "fase" = cuándo se habilita; sin fase = ya funciona.
const RUTAS = {
  dashboard:     { t: 'Dashboard',     i: 'layout-dashboard', mod: 'dashboard' },
  reservas:      { t: 'Reservas',      i: 'calendar-check', mod: 'reservas' },
  calendario:    { t: 'Calendario',    i: 'calendar-days',  mod: 'calendario' },
  canchas:       { t: 'Canchas',       i: 'layers',         mod: 'canchas' },
  clientes:      { t: 'Clientes',      i: 'users',          mod: 'clientes' },
  pagos:         { t: 'Pagos',         i: 'wallet',         fase: 4, d: 'Señas, pagos parciales, saldos e ingresos por día, semana y mes.' },
  torneos:       { t: 'Torneos',       i: 'trophy',         fase: 5, d: 'Crear y publicar torneos, inscriptos y estados de pago.' },
  profesores:    { t: 'Profesores',    i: 'graduation-cap', fase: 5, d: 'Profesores, disponibilidad y clases reservadas.' },
  configuracion: { t: 'Configuración', i: 'settings',       fase: 5, d: 'Datos del complejo, horarios de atención y avisos.' },
};
const $ = (id) => document.getElementById(id);
let perfil = null;

function fallo(texto) {
  document.body.innerHTML = `<div class="fallo"><h1>No se puede abrir el panel</h1><p>${esc(texto)}</p><a class="btn" href="/admin/index.html">Ir al ingreso</a></div>`;
}

function pintarShell() {
  $('nav').innerHTML = Object.entries(RUTAS).map(([k, r]) =>
    `<a href="#/${k}" data-k="${k}"><i data-lucide="${r.i}"></i>${r.t}${r.fase ? `<em>Fase ${r.fase}</em>` : ''}</a>`).join('');
  $('uNombre').textContent = perfil.nombre;
  $('uRol').textContent = perfil.rol === 'owner' ? 'Propietario' : 'Staff';
  $('salir').onclick = cerrarSesion;
  const menu = (abrir) => { $('sidebar').classList.toggle('open', abrir); $('velo').hidden = !abrir; };
  $('abrirMenu').onclick = () => menu(true); $('velo').onclick = () => menu(false); $('nav').onclick = () => menu(false);
  $('cargando').hidden = true; $('shell').hidden = false;
  lucide.createIcons();
}

async function ir() {
  const k = location.hash.replace('#/', '') || 'dashboard', ruta = RUTAS[k] || RUTAS.dashboard, clave = RUTAS[k] ? k : 'dashboard';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.k === clave));
  document.title = `${ruta.t} · Panel Padel Arena`;
  const el = $('contenido');
  if (ruta.fase) {
    el.innerHTML = `<h1>${ruta.t}</h1><div class="glass vacio" style="margin-top:1.4rem"><h2>Disponible en la Fase ${ruta.fase}</h2><p>${ruta.d}</p></div>`;
    return;
  }
  try { (await import(`./modules/${ruta.mod}.js`)).render(el, { perfil }); }
  catch (e) { console.error(e); el.innerHTML = '<p>No se pudo cargar esta sección.</p>'; }
}

(async () => {
  if (!disponible()) return fallo('No hay conexión con el servidor o la web está en modo demo.');
  try { perfil = await obtenerPerfil(); } catch (e) { return fallo(e.message); }
  if (!perfil) return location.replace('/admin/index.html'); // sin sesión o sin permisos: afuera
  pintarShell();
  window.addEventListener('hashchange', ir);
  db.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.replace('/admin/index.html'); });
  ir();
})();