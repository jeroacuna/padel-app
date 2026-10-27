import { esc, hoyAR, fmtFecha, fmtFechaHora, money, waLink, badge, toast, abrirModal } from '../core/ui.js';
import * as api from '../core/api.js';

const ESTADO_T = { abierto: 'Abierto', cerrado: 'Inscripción cerrada', finalizado: 'Finalizado' };
const ESTADO_I = { pendiente: 'Pendiente de pago', pagada: 'Pagada', cancelada: 'Cancelada' };
const ACC_I = { // acciones posibles según el estado de la inscripción: [estado destino, texto, clase]
  pendiente: [['pagada', 'Marcar pagada', ''], ['cancelada', 'Cancelar', 'peligro']],
  pagada: [['pendiente', 'Volver a pendiente', 'ghost'], ['cancelada', 'Cancelar', 'peligro']],
  cancelada: [['pendiente', 'Reactivar', '']],
};
const lineas = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const comas = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
let CACHE = [];

export function render(el) {
  el.innerHTML = `
    <div class="enc"><div><h1>Torneos</h1><p class="sub">Creá torneos, controlá los cupos y los pagos de las inscripciones</p></div><button class="btn" id="nuevoT">+ Nuevo torneo</button></div>
    <div id="torneosLista"><p class="sub">Cargando…</p></div>`;
  el.querySelector('#nuevoT').onclick = () => formTorneo(null);
  const lista = el.querySelector('#torneosLista');
  lista.addEventListener('click', (e) => { const f = e.target.closest('tr[data-id]'); if (f) detalle(+f.dataset.id); });
  lista.addEventListener('keydown', (e) => { const f = e.target.closest('tr[data-id]'); if (f && e.key === 'Enter') detalle(+f.dataset.id); });
  cargar();
}

async function cargar() {
  const cont = document.getElementById('torneosLista'); if (!cont) return;
  try {
    const [ts, res] = await Promise.all([api.listarTorneos(), api.resumenInscripciones()]);
    CACHE = ts;
    if (!ts.length) { cont.innerHTML = '<div class="glass vacio"><h2>No hay torneos</h2><p>Creá el primero con el botón de arriba.</p></div>'; return; }
    cont.innerHTML = `<div class="tabla-wrap glass"><table class="tabla"><thead><tr><th>Torneo</th><th>Fecha</th><th class="num">Inscriptos</th><th>Estado</th><th>Visibilidad</th></tr></thead><tbody>
      ${ts.map((t) => { const n = res[t.id] || { activas: 0, pagadas: 0 }; return `<tr data-id="${esc(t.id)}" tabindex="0">
        <td><b>${esc(t.titulo)}</b><small>${esc((t.categorias || []).join(' / '))}</small></td>
        <td>${fmtFecha(t.fecha)}<small>${esc(t.hora || '')} hs</small></td>
        <td class="num">${n.activas} / ${t.cupos}<small>${n.pagadas} pagadas</small></td>
        <td>${badge(t.estado, ESTADO_T[t.estado] || t.estado)}</td>
        <td>${t.publicado ? badge('activa', 'Publicado') : badge('inactiva', 'Oculto')}</td></tr>`; }).join('')}</tbody></table></div>`;
  } catch (e) { console.error(e); cont.innerHTML = `<p class="error-txt">No se pudieron cargar los torneos: ${esc(e.message)}</p>`; }
}

async function detalle(id, m) {
  m = m || abrirModal('<p>Cargando…</p>');
  try {
    const t = CACHE.find((x) => x.id === id);
    if (!t) throw new Error('No se encontró el torneo. Recargá la página.');
    const ins = await api.inscripcionesTorneo(id);
    const activas = ins.filter((i) => i.estado !== 'cancelada').length, pagadas = ins.filter((i) => i.estado === 'pagada').length;
    m.el.innerHTML = `
      <p class="cod">Torneo</p><h2>${esc(t.titulo)}</h2>
      <p>${badge(t.estado, ESTADO_T[t.estado] || t.estado)} ${t.publicado ? badge('activa', 'Publicado') : badge('inactiva', 'Oculto en la web')}</p>
      <dl class="datos">
        <dt>Fecha</dt><dd>${fmtFecha(t.fecha)} · ${esc(t.hora || '')} hs</dd>
        <dt>Lugar</dt><dd>${esc(t.lugar)}</dd>
        <dt>Categorías</dt><dd>${esc((t.categorias || []).join(' / '))}</dd>
        <dt>Inscripción</dt><dd>${money(t.precio)} por pareja</dd>
        <dt>Cupos</dt><dd>${activas} de ${t.cupos} ocupados · ${pagadas} pagadas</dd>
      </dl>
      <div class="acciones"><button class="btn" id="editarT">Editar torneo</button></div>
      <h3>Inscripciones</h3>
      ${ins.length ? `<ul class="insc-lista">${ins.map((i) => `<li>
        <span><b>${esc(i.jugador1)} y ${esc(i.jugador2)}</b> ${badge(i.estado, ESTADO_I[i.estado] || i.estado)}</span>
        <small>${esc(i.categoria)} · ${esc(i.telefono)} · <a href="${esc(waLink(i.telefono))}" target="_blank" rel="noopener" style="color:var(--lime)">WhatsApp</a> · ${esc(i.email)}<br>${fmtFechaHora(i.created_at)} · código ${esc(i.codigo)}</small>
        <div class="acciones" style="margin:0">${(ACC_I[i.estado] || []).map(([est, txt, cls]) => `<button class="btn chico ${cls}" data-i="${esc(i.id)}" data-e="${est}">${txt}</button>`).join('')}</div></li>`).join('')}</ul>`
        : '<p class="vacio-txt">Todavía no hay inscripciones.</p>'}`;
    m.el.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'editarT') return formTorneo(t, m);
      if (!b.dataset.i) return;
      if (b.dataset.e === 'cancelada' && !b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Tocá de nuevo'; return; } // confirmación antes de cancelar
      b.disabled = true;
      try { await api.estadoInscripcion(b.dataset.i, b.dataset.e); toast('Inscripción actualizada'); await cargar(); detalle(id, m); }
      catch (err) { toast(err.message, 'error'); b.disabled = false; }
    };
  } catch (e) { console.error(e); m.el.innerHTML = `<p class="error-txt">${esc(e.message)}</p>`; }
}

function formTorneo(t, previo) {
  if (previo) previo.cerrar();
  const nuevo = !t, hoy = hoyAR();
  t = t || { titulo: '', fecha: hoy, hora: '16:00', lugar: 'Padel Arena · ', categorias: [], precio: '', cupos: 16, descripcion: '', formato: '', premios: [], reglamento: [], imagen: '', estado: 'abierto', publicado: false };
  const m = abrirModal(`<h2>${nuevo ? 'Nuevo torneo' : 'Editar torneo'}</h2>
    <form id="ft" novalidate>
      <div class="form-grid">
        <label class="ancho">Título<input name="titulo" maxlength="80" value="${esc(t.titulo)}"></label>
        <label>Fecha<input type="date" name="fecha" ${nuevo ? `min="${hoy}"` : ''} value="${esc(t.fecha)}"></label>
        <label>Hora<input type="time" name="hora" value="${esc(t.hora || '16:00')}"></label>
        <label class="ancho">Lugar<input name="lugar" maxlength="120" value="${esc(t.lugar)}"></label>
        <label class="ancho">Categorías (separadas por coma)<input name="categorias" placeholder="6ta, 7ma, 8va" value="${esc((t.categorias || []).join(', '))}"></label>
        <label>Precio por pareja ($)<input name="precio" type="number" min="0" max="1000000" step="100" value="${esc(t.precio)}"></label>
        <label>Cupos (parejas)<input name="cupos" type="number" min="1" max="500" value="${esc(t.cupos)}"></label>
        <label>Estado<select name="estado">${Object.entries(ESTADO_T).map(([k, v]) => `<option value="${k}" ${t.estado === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="publicado" ${t.publicado ? 'checked' : ''}> Publicado en la web</label>
        <label class="ancho">Imagen de portada (assets/images/... o link https)<input name="imagen" maxlength="300" value="${esc(t.imagen || '')}"></label>
      </div>
      <label class="bloque">Descripción<textarea name="descripcion" rows="2" maxlength="600">${esc(t.descripcion || '')}</textarea></label>
      <label class="bloque">Formato<textarea name="formato" rows="2" maxlength="400">${esc(t.formato || '')}</textarea></label>
      <label class="bloque">Premios (uno por línea, el primero es el 1°)<textarea name="premios" rows="3">${esc((t.premios || []).join('\n'))}</textarea></label>
      <label class="bloque">Reglamento (uno por línea)<textarea name="reglamento" rows="4">${esc((t.reglamento || []).join('\n'))}</textarea></label>
      <p class="hint">Si lo dejás sin publicar, se guarda pero no aparece en la web. Cerrá la inscripción cuando quieras frenar anotaciones sin ocultar el torneo.</p>
      <div class="acciones"><button class="btn" type="submit" id="gt">Guardar</button><button class="btn ghost" type="button" id="ct">Cancelar</button></div>
    </form>`);
  const f = m.el.querySelector('#ft'), E = f.elements, btn = m.el.querySelector('#gt');
  m.el.querySelector('#ct').onclick = m.cerrar;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!E.fecha.value) { toast('Elegí la fecha del torneo.', 'error'); return; }
    if (!E.hora.value) { toast('Elegí la hora del torneo.', 'error'); return; }
    btn.disabled = true;
    try {
      await api.guardarTorneo({
        id: nuevo ? null : t.id, titulo: E.titulo.value, fecha: E.fecha.value, hora: E.hora.value, lugar: E.lugar.value,
        categorias: comas(E.categorias.value), precio: Math.round(+E.precio.value), cupos: Math.round(+E.cupos.value),
        descripcion: E.descripcion.value, formato: E.formato.value, premios: lineas(E.premios.value), reglamento: lineas(E.reglamento.value),
        imagen: E.imagen.value, estado: E.estado.value, publicado: E.publicado.checked });
      toast('Torneo guardado'); m.cerrar(); cargar();
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
}