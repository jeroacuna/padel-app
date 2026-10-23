import { esc, hoyAR, horaAR, fmtFecha, hh, money, ESTADO, badge, toast, abrirModal } from '../core/ui.js';
import * as api from '../core/api.js';

const TIPOS = { lluvia: 'Lluvia', mantenimiento: 'Mantenimiento', evento: 'Evento privado', otro: 'Otro' };

export async function render(el) {
  el.innerHTML = `
    <div class="enc"><div><h1>Canchas</h1><p class="sub">Precios, estado y bloqueos por lluvia, mantenimiento o eventos</p></div><button class="btn" id="nuevaCancha">+ Nueva cancha</button></div>
    <section class="tarjetas" id="canchasLista"><p class="sub">Cargando…</p></section>
    <div class="enc" style="margin-top:2rem"><div><h2>Bloqueos</h2><p class="sub" style="margin:0">Mientras una cancha esté bloqueada nadie puede reservarla, ni en la web ni desde el panel.</p></div>
      <div class="acciones" style="margin:0"><button class="btn peligro" id="lluvia">Cerrar hoy por lluvia</button><button class="btn" id="nuevoBloqueo">+ Nuevo bloqueo</button></div></div>
    <div id="bloqueosLista"></div>`;
  el.querySelector('#nuevaCancha').onclick = () => editarCancha(null, 0);
  el.querySelector('#nuevoBloqueo').onclick = () => formBloqueo();
  el.querySelector('#lluvia').onclick = cerrarPorLluvia;
  el.querySelector('#canchasLista').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) editarCancha(b.dataset.edit, +b.dataset.prox); });
  el.querySelector('#bloqueosLista').addEventListener('click', (e) => { const b = e.target.closest('[data-quitar]'); if (b) quitar(+b.dataset.quitar); });
  cargar();
}

let CACHE = [];
async function cargar() {
  const lista = document.getElementById('canchasLista'), bl = document.getElementById('bloqueosLista'); if (!lista) return;
  try {
    const hoy = hoyAR();
    const [cs, prox, bloqueos] = await Promise.all([api.canchas(), api.reservasProximasPorCancha(hoy), api.bloqueosVigentes(hoy)]);
    CACHE = cs;
    lista.innerHTML = cs.map((c) => `
      <article class="cancha-card glass ${c.activa ? '' : 'inactiva'}">
        <div><h3>${esc(c.nombre)}</h3><p>${esc(c.tipo)}</p></div>
        <b class="precio">${money(c.precio)}<small>por turno</small></b>
        <p>${badge(c.activa ? 'activa' : 'inactiva', c.activa ? 'Activa' : 'Inactiva')} <span class="prox">${prox[c.id] || 0} ${(prox[c.id] || 0) === 1 ? 'reserva próxima' : 'reservas próximas'}</span></p>
        <div class="acciones"><button class="btn ghost" data-edit="${c.id}" data-prox="${prox[c.id] || 0}">Editar</button></div>
      </article>`).join('');
    const nombre = (id) => (id == null ? 'Todas las canchas' : esc(cs.find((c) => c.id === id)?.nombre || `Cancha ${id}`));
    bl.innerHTML = bloqueos.length ? `<div class="tabla-wrap glass"><table class="tabla"><thead><tr><th>Cancha</th><th>Fechas</th><th>Horas</th><th>Tipo</th><th>Motivo</th><th></th></tr></thead><tbody>
      ${bloqueos.map((b) => `<tr><td>${nombre(b.cancha_id)}</td><td>${fmtFecha(b.fecha_desde)}${b.fecha_hasta !== b.fecha_desde ? ' → ' + fmtFecha(b.fecha_hasta) : ''}</td>
        <td>${b.hora_ini === 0 && b.hora_fin === 23 ? 'Todo el día' : `${hh(b.hora_ini)} a ${hh(b.hora_fin)}`}</td><td>${badge('t-' + b.tipo, TIPOS[b.tipo] || b.tipo)}</td>
        <td>${esc(b.motivo || '—')}</td><td class="num"><button class="btn ghost" data-quitar="${b.id}">Quitar</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="glass vacio"><h2>Sin bloqueos</h2><p>Todas las canchas están disponibles según su horario.</p></div>';
  } catch (e) { console.error(e); lista.innerHTML = `<p class="error-txt">No se pudieron cargar las canchas: ${esc(e.message)}</p>`; }
}

function editarCancha(id, prox) {
  const c = id ? CACHE.find((x) => String(x.id) === String(id)) : { nombre: '', tipo: '', precio: '', activa: true };
  const m = abrirModal(`<h2>${id ? 'Editar cancha' : 'Nueva cancha'}</h2>
    <form id="fc" novalidate>
      <div class="form-grid"><label>Nombre<input name="nombre" maxlength="40" value="${esc(c.nombre)}"></label>
        <label>Tipo<input name="tipo" maxlength="30" list="tipos" value="${esc(c.tipo)}" placeholder="Panorámica, Indoor…"></label>
        <label>Precio por turno ($)<input name="precio" type="number" min="0" max="1000000" step="100" value="${esc(c.precio)}"></label>
        <label class="check"><input type="checkbox" name="activa" ${c.activa ? 'checked' : ''}> Cancha activa</label></div>
      <datalist id="tipos"><option>Panorámica</option><option>Indoor</option><option>Outdoor</option></datalist>
      <p class="hint">El nuevo precio vale para las reservas que se hagan de ahora en adelante. Las ya hechas conservan el suyo.</p>
      <div id="aviso"></div>
      <div class="acciones"><button class="btn" type="submit" id="gc">Guardar</button><button class="btn ghost" type="button" id="cc">Cancelar</button></div>
    </form>`);
  const f = m.el.querySelector('#fc'), btn = m.el.querySelector('#gc'); let confirmado = false;
  m.el.querySelector('#cc').onclick = m.cerrar;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const desactiva = id && c.activa && !f.elements.activa.checked;
    if (desactiva && prox > 0 && !confirmado) { // confirmación antes de una acción con consecuencias
      confirmado = true; btn.textContent = 'Sí, desactivar';
      m.el.querySelector('#aviso').innerHTML = `<div class="sub-caja"><p>Esta cancha tiene <b>${prox} reservas próximas</b>. Si la desactivás nadie podrá reservarla, pero las que ya existen siguen en pie: revisalas en el calendario.</p></div>`;
      return;
    }
    btn.disabled = true;
    try {
      await api.guardarCancha({ id: id ? +id : null, nombre: f.elements.nombre.value, tipo: f.elements.tipo.value, precio: Math.round(+f.elements.precio.value), activa: f.elements.activa.checked });
      toast('Cancha guardada'); m.cerrar(); cargar();
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
}

async function formBloqueo(pre = {}) {
  const m = abrirModal('<p>Cargando…</p>'); let cs, hor;
  try { [cs, hor] = await Promise.all([api.canchas(), api.horario()]); } catch (e) { m.el.innerHTML = `<p class="error-txt">${esc(e.message)}</p>`; return; }
  const hoy = hoyAR(), horas = (sel) => Array.from({ length: hor.fin - hor.ini + 1 }, (_, i) => hor.ini + i).map((h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${hh(h)}</option>`).join('');
  m.el.innerHTML = `<h2>Nuevo bloqueo</h2>
    <form id="fb" novalidate><div class="form-grid">
      <label>Cancha<select name="cancha"><option value="">Todas las canchas</option>${cs.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select></label>
      <label>Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Desde<input type="date" name="desde" min="${hoy}" value="${hoy}"></label>
      <label>Hasta<input type="date" name="hasta" min="${hoy}" value="${hoy}"></label>
      <label class="check"><input type="checkbox" name="todo" checked> Todo el día</label><span></span>
      <label>Hora desde<select name="hini" disabled>${horas(hor.ini)}</select></label>
      <label>Hora hasta<select name="hfin" disabled>${horas(hor.fin)}</select></label></div>
      <label class="bloque">Motivo (opcional)<input name="motivo" maxlength="200" placeholder="Ej: reparación del vidrio"></label>
      <div class="acciones"><button class="btn" type="submit" id="gb">Crear bloqueo</button><button class="btn ghost" type="button" id="cb">Cancelar</button></div></form>`;
  const f = m.el.querySelector('#fb'), E = f.elements;
  E.todo.onchange = () => { E.hini.disabled = E.hfin.disabled = E.todo.checked; };
  E.desde.onchange = () => { if (E.hasta.value < E.desde.value) E.hasta.value = E.desde.value; E.hasta.min = E.desde.value; };
  m.el.querySelector('#cb').onclick = m.cerrar;
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const b = m.el.querySelector('#gb'); b.disabled = true;
    try { await guardarBloqueo({ cancha: E.cancha.value ? +E.cancha.value : null, desde: E.desde.value, hasta: E.hasta.value, horaIni: E.todo.checked ? 0 : +E.hini.value, horaFin: E.todo.checked ? 23 : +E.hfin.value, tipo: E.tipo.value, motivo: E.motivo.value }); m.cerrar(); }
    catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });
}

async function guardarBloqueo(b) {
  const r = await api.crearBloqueo(b);
  toast(r.afectadas ? `Bloqueo creado. Atención: hay ${r.afectadas} reservas en ese período, revisalas en el calendario.` : 'Bloqueo creado', r.afectadas ? 'aviso' : 'ok');
  cargar();
}

async function cerrarPorLluvia() {
  const m = abrirModal('<p>Cargando…</p>'); let hor;
  try { hor = await api.horario(); } catch (e) { m.el.innerHTML = `<p class="error-txt">${esc(e.message)}</p>`; return; }
  const ini = Math.max(horaAR(), hor.ini);
  if (ini > hor.fin) { m.el.innerHTML = '<h2>Ya cerró por hoy</h2><p class="sub">No quedan horarios para bloquear hoy.</p>'; return; }
  m.el.innerHTML = `<h2>Cerrar hoy por lluvia</h2><p class="sub">Se bloquean <b>todas las canchas</b> de hoy desde las ${hh(ini)} hasta el cierre (${hh(hor.fin)}). Nadie podrá reservar esos turnos. Las reservas que ya existan <b>no se cancelan solas</b>: las revisás vos después.</p>
    <div class="acciones"><button class="btn peligro" id="si">Sí, cerrar por lluvia</button><button class="btn ghost" id="no">Volver</button></div>`;
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelector('#si').onclick = async (e) => {
    e.target.disabled = true;
    try { await guardarBloqueo({ cancha: null, desde: hoyAR(), hasta: hoyAR(), horaIni: ini, horaFin: hor.fin, tipo: 'lluvia', motivo: 'Cierre por lluvia' }); m.cerrar(); }
    catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
  };
}

function quitar(id) {
  const m = abrirModal(`<h2>¿Quitar este bloqueo?</h2><p class="sub">Los turnos vuelven a estar disponibles para reservar.</p>
    <div class="acciones"><button class="btn peligro" id="si">Sí, quitar</button><button class="btn ghost" id="no">Volver</button></div>`);
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelector('#si').onclick = async (e) => {
    e.target.disabled = true;
    try { await api.quitarBloqueo(id); toast('Bloqueo quitado'); m.cerrar(); cargar(); } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
  };
}