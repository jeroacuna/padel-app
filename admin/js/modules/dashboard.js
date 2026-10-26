import { esc, hoyAR, horaAR, fmtFecha, fmtFechaHora, hh } from '../core/ui.js';
import { resumenDashboard, resumenFinancieroDashboard } from '../core/api.js';
import { money } from '../core/ui.js';

const fila = (r, extra) => `<li><b>${fmtFecha(r.fecha)} · ${hh(r.hora)}</b><span>${esc(r.canchas?.nombre || '')} · ${esc(r.nombre)} ${esc(r.apellido)}</span>${extra || ''}</li>`;

export async function render(el, { perfil }) {
  el.innerHTML = `
    <h1>Hola, ${esc(perfil.nombre)}</h1>
    <p class="sub">Panel de administración de ${esc(CONFIG.nombre)}</p>
    <section class="stats" id="stats"><p class="sub">Cargando datos…</p></section>
    <section class="stats" id="finanzas"></section>
    <section class="cards" id="listas"></section>
    `;
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
  finanzas();
}

export async function finanzas() {
  const el = document.getElementById('finanzas'); if (!el) return;
  try {
    const hoy = hoyAR(), [y, m] = hoy.split('-').map(Number), d = hoy.slice(0, 8);
    const f = await resumenFinancieroDashboard(hoy, `${d}01`, `${d}${new Date(Date.UTC(y, m, 0)).getUTCDate()}`);
    el.innerHTML = `
      <article class="stat glass"><span>Cobrado hoy</span><b>${money(f.dia.cobrado)}</b></article>
      <article class="stat glass"><span>Cobrado en el mes</span><b>${money(f.mes.cobrado)}</b></article>
      <article class="stat glass"><span>Por cobrar este mes</span><b>${money(f.mes.pendiente)}</b></article>
      <article class="stat glass"><span>Reservas impagas</span><b>${f.impagas}</b></article>`;
  } catch (e) { console.error(e); el.innerHTML = `<p class="nota">Los ingresos no están disponibles: ${esc(e.message)}</p>`; }
}