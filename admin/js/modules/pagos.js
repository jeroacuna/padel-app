import { esc, hoyAR, sumarDias, fmtFecha, fmtFechaHora, money, hh, badge, barras } from '../core/ui.js';
import * as api from '../core/api.js';
import { abrirDetalle } from './reservas.js';

const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', mercadopago: 'Mercado Pago', otro: 'Otro' };
const T = { tab: 'resumen', rango: 'mes', desde: '', hasta: '', pagMov: 0, pagImp: 0 };
const TAM = 20;

function rango(r) {
  const hoy = hoyAR();
  if (r === 'hoy') return [hoy, hoy];
  if (r === 'semana') { const l = sumarDias(hoy, -((new Date(hoy + 'T12:00:00Z').getUTCDay() + 6) % 7)); return [l, sumarDias(l, 6)]; }
  if (r === 'mes') { const [y, m] = hoy.split('-').map(Number); return [`${hoy.slice(0, 8)}01`, `${hoy.slice(0, 8)}${new Date(Date.UTC(y, m, 0)).getUTCDate()}`]; }
  return [T.desde || hoy, T.hasta || hoy];
}

export function render(el) {
  el.innerHTML = `<h1>Pagos</h1><p class="sub">Cobros registrados a mano (efectivo, transferencia, tarjeta). Ya está preparado para sumar Mercado Pago más adelante.</p>
    <div class="tabs" id="tabs"><button data-t="resumen">Resumen</button><button data-t="impagas">Impagas</button><button data-t="movs">Movimientos</button></div>
    <div id="pagosCuerpo"></div>`;
  el.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { T.tab = b.dataset.t; mostrar(); } };
  mostrar();
}

function mostrar() {
  document.querySelectorAll('#tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === T.tab));
  ({ resumen, impagas, movs })[T.tab]();
}

function selectorRango(onChange) {
  return `<div class="rangos"><div class="seg" id="rg">${[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['custom', 'Elegir fechas']].map(([k, v]) => `<button data-r="${k}" class="${T.rango === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    ${T.rango === 'custom' ? `<input type="date" id="rgD" value="${T.desde || hoyAR()}"><span>a</span><input type="date" id="rgH" value="${T.hasta || hoyAR()}">` : ''}</div>`;
}
function engancharRango(cont, recargar) {
  cont.querySelector('#rg').onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { T.rango = b.dataset.r; recargar(); } };
  const d = cont.querySelector('#rgD'), h = cont.querySelector('#rgH');
  if (d) d.onchange = () => { T.desde = d.value; if (T.hasta < T.desde) T.hasta = T.desde; recargar(); };
  if (h) h.onchange = () => { T.hasta = h.value; recargar(); };
}

async function resumen() {
  const c = document.getElementById('pagosCuerpo'); if (!c) return;
  c.onclick = null;
  const [desde, hasta] = rango(T.rango); if (T.rango === 'custom') { T.desde = desde; T.hasta = hasta; }
  c.innerHTML = selectorRango() + '<p class="sub">Cargando…</p>'; engancharRango(c, resumen);
  try {
    const d = await api.resumenFinanzas(desde, hasta);
    const cuerpo = `
      <section class="stats">
        <article class="stat glass"><span>Cobrado (caja)</span><b>${money(d.cobrado)}</b></article>
        <article class="stat glass"><span>Reservado (valor de los turnos)</span><b>${money(d.reservado)}</b></article>
        <article class="stat glass"><span>Por cobrar</span><b>${money(d.pendiente)}</b></article>
        <article class="stat glass"><span>Reembolsos</span><b>${money(d.reembolsos)}</b></article></section>
      <p class="nota" style="margin:0 0 1rem"><b>Cobrado</b> es la plata que entró en esas fechas. <b>Reservado</b> es el valor de los turnos que caen en esas fechas, estén cobrados o no. <b>Por cobrar</b> es lo que falta cobrar de esos turnos.</p>
      <section class="cards">
        <article class="card glass"><h2>Por método</h2>${d.por_metodo.length ? barras(d.por_metodo.map((x) => ({ etiqueta: METODOS[x.metodo] || x.metodo, valor: x.monto })), money) : '<p class="vacio-txt">Sin cobros en este período.</p>'}</article>
        <article class="card glass"><h2>Por cancha</h2>${d.por_cancha.length ? barras(d.por_cancha.map((x) => ({ etiqueta: x.cancha, valor: x.monto })), money) : '<p class="vacio-txt">Sin cobros en este período.</p>'}</article>
        <article class="card glass" style="grid-column:1/-1"><h2>Por día</h2>${d.por_dia.length ? barras(d.por_dia.map((x) => ({ etiqueta: fmtFecha(x.fecha), valor: x.monto })), money) : '<p class="vacio-txt">Sin cobros en este período.</p>'}</article></section>`;
    c.querySelector('.sub').outerHTML = cuerpo;
  } catch (e) { console.error(e); c.querySelector('.sub').outerHTML = `<p class="error-txt">No se pudo cargar el resumen: ${esc(e.message)}</p>`; }
}

async function impagas() {
  const c = document.getElementById('pagosCuerpo'); if (!c) return;
  c.onclick = null;
  c.innerHTML = '<p class="sub">Cargando…</p>';
  try {
    const [{ filas, total }, canchas] = await Promise.all([api.impagas(hoyAR(), T.pagImp, TAM), api.canchas()]);
    if (!filas.length) { c.innerHTML = '<div class="glass vacio"><h2>No hay reservas impagas</h2><p>Todas las reservas de hoy y anteriores están saldadas.</p></div>'; return; }
    const nom = (id) => esc(canchas.find((x) => x.id === id)?.nombre || '');
    const ini = T.pagImp * TAM + 1, fin = ini + filas.length - 1;
    c.innerHTML = `<p class="sub">${total} reservas de hoy o anteriores tienen saldo pendiente. Tocá una para registrar el pago.</p>
      <div class="tabla-wrap glass"><table class="tabla"><thead><tr><th>Fecha</th><th>Cancha</th><th>Cliente</th><th>Pago</th><th class="num">Precio</th><th class="num">Cobrado</th><th class="num">Saldo</th></tr></thead><tbody>
      ${filas.map((r) => `<tr data-id="${esc(r.id)}" tabindex="0"><td>${fmtFecha(r.fecha)} · ${hh(r.hora)}</td><td>${nom(r.cancha_id)}</td><td><b>${esc(r.nombre)} ${esc(r.apellido)}</b><small>${esc(r.telefono || '')}</small></td>
        <td>${badge('p-' + r.pago_estado, r.pago_estado)}</td><td class="num">${money(r.precio)}</td><td class="num">${money(r.cobrado)}</td><td class="num debe">${money(r.saldo)}</td></tr>`).join('')}</tbody></table></div>
      ${paginacion(ini, fin, total, T.pagImp)}`;
    c.onclick = (e) => {
      const p = e.target.closest('[data-pag]'); if (p) { T.pagImp += +p.dataset.pag; impagas(); return; }
      const f = e.target.closest('tr[data-id]'); if (f) abrirDetalle(f.dataset.id, impagas);
    };
  } catch (e) { console.error(e); c.innerHTML = `<p class="error-txt">No se pudieron cargar las impagas: ${esc(e.message)}</p>`; }
}

async function movs() {
  const c = document.getElementById('pagosCuerpo'); if (!c) return;
  c.onclick = null;
  const [desde, hasta] = rango(T.rango); if (T.rango === 'custom') { T.desde = desde; T.hasta = hasta; }
  c.innerHTML = selectorRango() + '<p class="sub">Cargando…</p>'; engancharRango(c, () => { T.pagMov = 0; movs(); });
  try {
    const { filas, total } = await api.movimientos({ desde, hasta, pagina: T.pagMov, tam: TAM });
    const zona = c.querySelector('.sub');
    if (!filas.length) { zona.outerHTML = '<div class="glass vacio"><h2>Sin movimientos</h2><p>No hay pagos registrados en este período.</p></div>'; return; }
    const ini = T.pagMov * TAM + 1, fin = ini + filas.length - 1;
    zona.outerHTML = `<div class="tabla-wrap glass"><table class="tabla"><thead><tr><th>Fecha</th><th>Reserva</th><th>Tipo</th><th>Método</th><th class="num">Monto</th><th>Registró</th></tr></thead><tbody>
      ${filas.map((p) => `<tr class="${p.anulado ? 'anulado' : ''}"><td>${fmtFecha(p.fecha)}</td><td><b>${esc(p.reservas?.codigo || '')}</b><small>${esc(p.reservas?.nombre || '')} ${esc(p.reservas?.apellido || '')}</small></td>
        <td>${p.anulado ? badge('cancelada', 'Anulado') : badge(p.tipo === 'cobro' ? 'completada' : 'pendiente', p.tipo === 'cobro' ? 'Cobro' : 'Reembolso')}</td><td>${METODOS[p.metodo] || esc(p.metodo)}${p.referencia ? `<small>${esc(p.referencia)}</small>` : ''}</td>
        <td class="num">${p.tipo === 'cobro' ? '' : '−'}${money(p.monto)}</td><td>${esc(p.quien || '—')}</td></tr>`).join('')}</tbody></table></div>${paginacion(ini, fin, total, T.pagMov)}`;
    c.onclick = (e) => { const p = e.target.closest('[data-pag]'); if (p) { T.pagMov += +p.dataset.pag; movs(); } };
  } catch (e) { console.error(e); c.querySelector('.sub').outerHTML = `<p class="error-txt">No se pudieron cargar los movimientos: ${esc(e.message)}</p>`; }
}

const paginacion = (ini, fin, total, pag) => `<div class="pag"><span>Mostrando ${ini}–${fin} de ${total}</span><div><button class="btn ghost" data-pag="-1" ${pag === 0 ? 'disabled' : ''}>← Anterior</button><button class="btn ghost" data-pag="1" ${fin >= total ? 'disabled' : ''}>Siguiente →</button></div></div>`;