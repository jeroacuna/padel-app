import { esc, hoyAR, horaAR, fmtFecha, fmtFechaHora, hh, money, waLink, ESTADO, PAGO, badge, toast, abrirModal, sesion } from '../core/ui.js';
import * as api from '../core/api.js';
import { abrirAltaManual } from './reserva-manual.js';

let hook = null; // función a llamar cuando algo cambia (la usa el calendario para refrescarse)

const TAM = 20;
const F = { desde: '', hasta: '', cancha: '', estado: '', q: '', orden: 'asc', pagina: 0 };
let primera = true;

export async function render(el) {
  if (primera) { F.desde = hoyAR(); primera = false; } // por defecto: de hoy en adelante
  let canchas = []; try { canchas = await api.canchas(); } catch (e) { console.error(e); }
  const op = (v, t, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(t)}</option>`;
  el.innerHTML = `
    <div class="enc"><div><h1>Reservas</h1><p class="sub">Todas las reservas del complejo</p></div><button class="btn" id="nueva">+ Nueva reserva</button></div>
    <form class="filtros glass" id="filtros" onsubmit="return false">
      <label>Desde<input type="date" name="desde" value="${F.desde}"></label>
      <label>Hasta<input type="date" name="hasta" value="${F.hasta}"></label>
      <label>Cancha<select name="cancha">${op('', 'Todas', !F.cancha)}${canchas.map((c) => op(c.id, c.nombre, String(F.cancha) === String(c.id))).join('')}</select></label>
      <label>Estado<select name="estado">${op('', 'Todos', !F.estado)}${Object.entries(ESTADO).map(([k, v]) => op(k, v, F.estado === k)).join('')}</select></label>
      <label class="ancho">Buscar<input type="search" name="q" placeholder="Nombre, teléfono, email o código" value="${esc(F.q)}"></label>
      <label>Orden<select name="orden">${op('asc', 'Más próximas primero', F.orden === 'asc')}${op('desc', 'Más recientes primero', F.orden === 'desc')}</select></label>
      <button type="button" class="btn ghost" id="limpiar">Limpiar</button>
    </form>
    <div id="lista"></div>`;
  const form = el.querySelector('#filtros');
  let t; const leer = () => { Object.assign(F, Object.fromEntries(new FormData(form)), { pagina: 0 }); cargar(); };
  form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(leer, 300); });
  el.querySelector('#nueva').onclick = () => abrirAltaManual({}, cargar);
  el.querySelector('#limpiar').onclick = () => { Object.assign(F, { desde: '', hasta: '', cancha: '', estado: '', q: '', orden: 'asc', pagina: 0 }); render(el); };
  el.querySelector('#lista').addEventListener('click', (e) => {
    const pag = e.target.closest('[data-pag]'); if (pag) { F.pagina += +pag.dataset.pag; cargar(); return; }
    const fila = e.target.closest('tr[data-id]'); if (fila) abrirDetalle(fila.dataset.id);
  });
  el.querySelector('#lista').addEventListener('keydown', (e) => { const fila = e.target.closest('tr[data-id]'); if (fila && e.key === 'Enter') abrirDetalle(fila.dataset.id); });
  cargar();
}

async function cargar() {
  const cont = document.getElementById('lista'); if (!cont) return;
  cont.innerHTML = '<p class="sub">Cargando reservas…</p>';
  try {
    const { filas, total } = await api.listarReservas({ ...F, tam: TAM });
    if (!filas.length) { cont.innerHTML = '<div class="glass vacio"><h2>No hay reservas</h2><p>Probá cambiando o limpiando los filtros.</p></div>'; return; }
    const ini = F.pagina * TAM + 1, fin = ini + filas.length - 1;
    cont.innerHTML = `
      <div class="tabla-wrap glass"><table class="tabla"><thead><tr><th>Fecha</th><th>Hora</th><th>Cancha</th><th>Cliente</th><th>Estado</th><th>Pago</th><th class="num">Precio</th></tr></thead><tbody>
      ${filas.map((r) => `<tr data-id="${esc(r.id)}" tabindex="0">
        <td>${fmtFecha(r.fecha)}</td><td>${hh(r.hora)}</td><td>${esc(r.canchas?.nombre || '')}</td>
        <td><b>${esc(r.nombre)} ${esc(r.apellido)}</b><small>${esc(r.telefono)}</small></td>
        <td>${badge(r.estado, ESTADO[r.estado] || r.estado)}</td><td>${badge('p-' + r.pago_estado, PAGO[r.pago_estado] || r.pago_estado)}</td>
        <td class="num">${money(r.precio)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="pag"><span>Mostrando ${ini}–${fin} de ${total}</span>
        <div><button class="btn ghost" data-pag="-1" ${F.pagina === 0 ? 'disabled' : ''}>← Anterior</button>
        <button class="btn ghost" data-pag="1" ${fin >= total ? 'disabled' : ''}>Siguiente →</button></div></div>`;
  } catch (e) { console.error(e); cont.innerHTML = `<p class="error-txt">No se pudieron cargar las reservas: ${esc(e.message)}</p>`; }
}

/* ---------- Detalle ---------- */
const ACCIONES = {
  pendiente:  [['estado', 'confirmada', 'Confirmar', ''], ['cancelar', '', 'Cancelar reserva', 'peligro']],
  confirmada: [['estado', 'completada', 'Marcar completada', ''], ['cancelar', '', 'Cancelar reserva', 'peligro']],
  completada: [['estado', 'confirmada', 'Volver a confirmada', 'ghost']],
  cancelada:  [['estado', 'confirmada', 'Reactivar reserva', '']],
};
const ETIQ = { cambiar_estado: 'Cambio de estado', reprogramar: 'Reprogramada', crear_manual: 'Creada manualmente', pago_cobro: 'Cobro registrado', pago_reembolso: 'Reembolso registrado', anular_pago: 'Pago anulado' };
const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', mercadopago: 'Mercado Pago', otro: 'Otro' };
const cobradoDe = (pagos) => pagos.filter((p) => !p.anulado).reduce((s, p) => s + (p.tipo === 'cobro' ? p.monto : -p.monto), 0);
const cargarTodo = async (id) => { const [r, h, p] = await Promise.all([api.obtenerReserva(id), api.historial(id), api.pagosDeReserva(id).catch(() => null)]); return [r, h, p]; };

export async function abrirDetalle(id, alCambiar) {
  hook = alCambiar || null;
  const m = abrirModal('<p>Cargando…</p>');
  try { pintar(m, ...(await cargarTodo(id))); }
  catch (e) { m.el.innerHTML = `<p class="error-txt">${esc(e.message)}</p>`; }
}
async function refrescar(m, id) { pintar(m, ...(await cargarTodo(id))); cargar(); if (hook) hook(); }

function resumenCambio(h) {
  const d = h.detalle || {};
  if (h.accion === 'cambiar_estado') return `${ESTADO[d.de] || d.de} → ${ESTADO[d.a] || d.a}${d.nota ? ` · “${esc(d.nota)}”` : ''}`;
  if (h.accion === 'pago_cobro' || h.accion === 'pago_reembolso') return `${money(d.monto)} · ${METODOS[d.metodo] || esc(d.metodo)}`;
  if (h.accion === 'anular_pago') return `${money(d.monto)} · “${esc(d.motivo || '')}”`;
  if (h.accion === 'reprogramar') return `${d.de.fecha} ${hh(d.de.hora)} (cancha ${d.de.cancha}) → ${d.a.fecha} ${hh(d.a.hora)} (cancha ${d.a.cancha})`;
  return '';
}

function pagosHtml(r, pagos) {
  if (!pagos) return '<p class="hint">El módulo de pagos todavía no está activo (falta correr la migración 006 en Supabase).</p>';
  const cobrado = cobradoDe(pagos), saldo = r.precio - cobrado;
  const lineas = pagos.map((p) => `<li class="${p.anulado ? 'anulado' : ''}"><span><b>${p.tipo === 'cobro' ? '+' : '−'}${money(p.monto)}</b> ${METODOS[p.metodo] || esc(p.metodo)}${p.referencia ? ' · ' + esc(p.referencia) : ''}<small>${fmtFechaHora(p.created_at)}${p.quien ? ' · ' + esc(p.quien) : ''}${p.anulado ? ' · ANULADO: ' + esc(p.anulado_motivo || '') : ''}</small></span>${!p.anulado && sesion.rol === 'owner' ? `<button class="btn ghost chico" data-anular="${esc(p.id)}">Anular</button>` : ''}</li>`).join('');
  const aviso = r.estado === 'cancelada' && cobrado > 0 ? `<p class="aviso-caja">Esta reserva está cancelada y tiene ${money(cobrado)} cobrados: registrá el reembolso si corresponde.</p>` : '';
  return `<div class="pagos-box" id="pagosBox"><h3>Pagos</h3>
    <p class="resumen-pago"><b>${money(cobrado)}</b> cobrados de ${money(r.precio)} · <span class="${saldo > 0 ? 'debe' : 'ok-t'}">${saldo > 0 ? 'saldo ' + money(saldo) : 'saldado'}</span></p>
    ${aviso}${pagos.length ? `<ul class="pagos-lista">${lineas}</ul>` : '<p class="vacio-txt">Sin pagos registrados.</p>'}
    <div class="acciones">${r.estado !== 'cancelada' && saldo > 0 ? '<button class="btn" data-pago="cobro">Registrar pago</button>' : ''}${cobrado > 0 ? '<button class="btn ghost" data-pago="reembolso">Reembolsar</button>' : ''}</div></div>`;
}

function pintar(m, r, hist, pagos) {
  const acc = (ACCIONES[r.estado] || []).map(([tipo, est, txt, cls]) => `<button class="btn ${cls}" data-t="${tipo}" data-e="${est}">${txt}</button>`).join('');
  const reprog = ['pendiente', 'confirmada'].includes(r.estado) ? '<button class="btn ghost" data-t="reprogramar">Reprogramar</button>' : '';
  m.el.innerHTML = `
    <p class="cod">Reserva ${esc(r.codigo)}</p>
    <h2>${fmtFecha(r.fecha)} · ${hh(r.hora)} · ${esc(r.canchas?.nombre || '')}</h2>
    <p>${badge(r.estado, ESTADO[r.estado] || r.estado)} ${badge('p-' + r.pago_estado, PAGO[r.pago_estado] || r.pago_estado)}</p>
    <dl class="datos">
      <dt>Cliente</dt><dd>${esc(r.nombre)} ${esc(r.apellido)}</dd>
      <dt>Teléfono</dt><dd>${r.telefono ? `${esc(r.telefono)} · <a href="${esc(waLink(r.telefono))}" target="_blank" rel="noopener">WhatsApp</a>` : '—'}</dd>
      <dt>Email</dt><dd>${esc(r.email) || '—'}</dd>
      <dt>Precio</dt><dd>${money(r.precio)}</dd>
      <dt>Origen</dt><dd>${esc(r.origen)}</dd>
      <dt>Creada</dt><dd>${fmtFechaHora(r.created_at)}</dd>
      ${r.notas ? `<dt>Notas</dt><dd class="notas">${esc(r.notas)}</dd>` : ''}
    </dl>
    ${pagosHtml(r, pagos)}
    <div class="acciones" id="acciones">${acc}${reprog}</div>
    <div id="subpanel"></div>
    <h3>Historial de cambios</h3>
    ${hist.length ? `<ul class="hist">${hist.map((h) => `<li><b>${ETIQ[h.accion] || esc(h.accion)}</b> ${resumenCambio(h)}<small>${fmtFechaHora(h.created_at)}${h.quien ? ' · ' + esc(h.quien) : ''}</small></li>`).join('')}</ul>` : '<p class="vacio-txt">Sin cambios registrados.</p>'}`;
  const caja = m.el.querySelector('#pagosBox');
  if (caja) caja.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pago) panelPago(m, r, pagos, b.dataset.pago);
    else if (b.dataset.anular) panelAnular(m, r, b.dataset.anular);
  });
  m.el.querySelector('#acciones').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.t === 'estado') return aplicar(m, r.id, () => api.cambiarEstado(r.id, b.dataset.e), b);
    if (b.dataset.t === 'cancelar') return panelCancelar(m, r);
    if (b.dataset.t === 'reprogramar') return panelReprogramar(m, r);
  };
}

async function aplicar(m, id, fn, boton) {
  if (boton) boton.disabled = true;
  try { await fn(); toast('Reserva actualizada'); await refrescar(m, id); }
  catch (e) { toast(e.message, 'error'); if (boton) boton.disabled = false; }
}

function panelCancelar(m, r) { // confirmación antes de una acción destructiva
  const sp = m.el.querySelector('#subpanel');
  sp.innerHTML = `<div class="sub-caja"><h3>¿Cancelar esta reserva?</h3><p>El turno vuelve a quedar libre. Podés dejar un motivo.</p>
    <textarea id="motivo" rows="2" maxlength="300" placeholder="Motivo (opcional)"></textarea>
    <div class="acciones"><button class="btn peligro" id="si">Sí, cancelar</button><button class="btn ghost" id="no">Volver</button></div></div>`;
  sp.querySelector('#no').onclick = () => { sp.innerHTML = ''; };
  sp.querySelector('#si').onclick = (e) => aplicar(m, r.id, () => api.cambiarEstado(r.id, 'cancelada', sp.querySelector('#motivo').value), e.target);
}

async function panelReprogramar(m, r) {
  const sp = m.el.querySelector('#subpanel');
  sp.innerHTML = '<p>Cargando…</p>';
  const [hor, canchas] = await Promise.all([api.horario(), api.canchas()]);
  sp.innerHTML = `<div class="sub-caja"><h3>Reprogramar</h3>
    <div class="form-grid"><label>Fecha<input type="date" id="rpFecha" min="${hoyAR()}" value="${r.fecha}"></label>
    <label>Cancha<select id="rpCancha">${canchas.filter((c) => c.activa).map((c) => `<option value="${c.id}" ${c.id === r.cancha_id ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.tipo)}</option>`).join('')}</select></label></div>
    <p class="hint">Elegí un horario libre:</p><div class="horas" id="rpHoras"></div>
    <div class="acciones"><button class="btn" id="rpOk" disabled>Guardar cambio</button><button class="btn ghost" id="rpNo">Volver</button></div></div>`;
  const fecha = sp.querySelector('#rpFecha'), cancha = sp.querySelector('#rpCancha'), horas = sp.querySelector('#rpHoras'), ok = sp.querySelector('#rpOk');
  let hora = null;
  const pintarHoras = async () => {
    hora = null; ok.disabled = true; horas.innerHTML = 'Cargando…';
    if (!fecha.value) { horas.innerHTML = ''; return; }
    let oc = []; try { oc = await api.ocupadosDia(fecha.value); } catch (e) { toast(e.message, 'error'); }
    const c = +cancha.value, hoy = hoyAR(), ahora = horaAR(); let html = '';
    for (let h = hor.ini; h <= hor.fin; h++) {
      const propio = fecha.value === r.fecha && h === r.hora && c === r.cancha_id;
      const ocupado = !propio && oc.some((o) => o.hora === h && o.cancha_id === c), pasado = fecha.value < hoy || (fecha.value === hoy && h <= ahora);
      const nota = propio ? 'actual' : ocupado ? 'ocupado' : pasado ? 'pasó' : 'libre';
      html += `<button type="button" class="hora ${nota}" data-h="${h}" ${propio || ocupado || pasado ? 'disabled' : ''}><b>${hh(h)}</b><small>${nota}</small></button>`;
    }
    horas.innerHTML = html;
  };
  horas.onclick = (e) => { const b = e.target.closest('[data-h]'); if (!b || b.disabled) return; hora = +b.dataset.h; horas.querySelectorAll('.hora').forEach((x) => x.classList.toggle('sel', x === b)); ok.disabled = false; };
  fecha.onchange = pintarHoras; cancha.onchange = pintarHoras;
  sp.querySelector('#rpNo').onclick = () => { sp.innerHTML = ''; };
  ok.onclick = () => aplicar(m, r.id, () => api.reprogramar(r.id, fecha.value, hora, +cancha.value), ok);
  pintarHoras();
}

function panelPago(m, r, pagos, tipo) {
  const cobrado = cobradoDe(pagos), max = tipo === 'cobro' ? r.precio - cobrado : cobrado, sp = m.el.querySelector('#subpanel');
  sp.innerHTML = `<div class="sub-caja"><h3>${tipo === 'cobro' ? 'Registrar pago' : 'Registrar reembolso'}</h3>
    <form id="fp" novalidate><div class="form-grid"><label>Monto ($)<input name="monto" type="number" min="1" max="${max}" value="${max}"></label>
      <label>Método<select name="metodo">${Object.entries(METODOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Referencia (opcional)<input name="ref" maxlength="100" placeholder="Nº de transferencia, etc."></label>
      <label>Nota (opcional)<input name="nota" maxlength="300"></label></div>
    <p class="hint">${tipo === 'cobro' ? `Saldo pendiente: ${money(max)}. Podés cobrar una seña o un pago parcial.` : `Máximo a reembolsar: ${money(max)}.`}</p>
    <div class="acciones"><button class="btn ${tipo === 'cobro' ? '' : 'peligro'}" type="submit" id="gp">Confirmar</button><button class="btn ghost" type="button" id="np">Volver</button></div></form></div>`;
  const f = sp.querySelector('#fp');
  sp.querySelector('#np').onclick = () => { sp.innerHTML = ''; };
  f.addEventListener('submit', (e) => { e.preventDefault(); aplicar(m, r.id, async () => { await api.registrarPago({ reserva: r.id, monto: Math.round(+f.elements.monto.value), metodo: f.elements.metodo.value, tipo, referencia: f.elements.ref.value, nota: f.elements.nota.value }); }, sp.querySelector('#gp')); });
}

function panelAnular(m, r, pagoId) { // solo el propietario (la base lo exige)
  const sp = m.el.querySelector('#subpanel');
  sp.innerHTML = `<div class="sub-caja"><h3>¿Anular este movimiento?</h3><p>No se borra: queda registrado como anulado, con tu nombre y el motivo.</p>
    <textarea id="motivoA" rows="2" maxlength="200" placeholder="Motivo (obligatorio)"></textarea>
    <div class="acciones"><button class="btn peligro" id="sa">Sí, anular</button><button class="btn ghost" id="na">Volver</button></div></div>`;
  sp.querySelector('#na').onclick = () => { sp.innerHTML = ''; };
  sp.querySelector('#sa').onclick = (e) => aplicar(m, r.id, () => api.anularPago(pagoId, sp.querySelector('#motivoA').value), e.target);
}