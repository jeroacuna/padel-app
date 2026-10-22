import { esc, hoyAR, horaAR, fmtFecha, fmtFechaHora, hh } from '../core/ui.js';
import { resumenDashboard } from '../core/api.js';

const fila = (r, extra) => `<li><b>${fmtFecha(r.fecha)} · ${hh(r.hora)}</b><span>${esc(r.canchas?.nombre || '')} · ${esc(r.nombre)} ${esc(r.apellido)}</span>${extra || ''}</li>`;

export async function render(el, { perfil }) {
  el.innerHTML = `
    <h1>Hola, ${esc(perfil.nombre)}</h1>
    <p class="sub">Panel de administración de ${esc(CONFIG.nombre)}</p>
    <section class="stats" id="stats"><p class="sub">Cargando datos…</p></section>
    <section class="cards" id="listas"></section>
    <p class="nota">Ingresos y pagos pendientes se habilitan en la Fase 4, cuando existan los pagos registrados.</p>`;
  try {
    const d = await resumenDashboard(hoyAR(), horaAR());
    document.getElementById('stats').innerHTML = `
      <article class="stat glass"><span>Reservas hoy</span><b>${d.hoy}</b></article>
      <article class="stat glass"><span>Esta semana</span><b>${d.semana}</b></article>
      <article class="stat glass"><span>Ocupación de hoy</span><b>${d.ocupacion}%</b></article>
      <article class="stat glass"><span>Canchas activas</span><b>${d.canchasActivas}</b></article>`;
    document.getElementById('listas').innerHTML = `
      <article class="card glass"><h2>Próximos turnos</h2>${d.proximos.length ? `<ul class="lista">${d.proximos.map((r) => fila(r)).join('')}</ul>` : '<p class="vacio-txt">No hay turnos próximos.</p>'}</article>
      <article class="card glass"><h2>Cancelaciones recientes</h2>${d.cancelaciones.length ? `<ul class="lista">${d.cancelaciones.map((r) => fila(r, `<small>${fmtFechaHora(r.updated_at)}</small>`)).join('')}</ul>` : '<p class="vacio-txt">Sin cancelaciones.</p>'}</article>`;
  } catch (e) {
    console.error(e);
    document.getElementById('stats').innerHTML = `<p class="error-txt">No se pudieron cargar los datos: ${esc(e.message)}</p>`;
  }
}