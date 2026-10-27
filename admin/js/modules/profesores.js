import { esc, hoyAR, fmtFecha, hh, money, waLink, badge, toast, abrirModal } from '../core/ui.js';
import * as api from '../core/api.js';

const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];
const CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const comas = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
let tab = 'profes', CACHE = [];

export function render(el) {
  el.innerHTML = `
    <div class="enc"><div><h1>Profesores</h1><p class="sub">Profesores, horarios de clase y clases reservadas</p></div><button class="btn" id="nuevoP">+ Nuevo profesor</button></div>
    <div class="tabs" id="tabsP"><button data-t="profes">Profesores</button><button data-t="clases">Clases reservadas</button></div>
    <div id="profCuerpo"></div>`;
  el.querySelector('#nuevoP').onclick = () => formProfesor(null);
  el.querySelector('#tabsP').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; mostrar(); } };
  el.querySelector('#profCuerpo').addEventListener('click', onClick);
  mostrar();
}

function mostrar() {
  document.querySelectorAll('#tabsP [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  const nuevo = document.getElementById('nuevoP'); if (nuevo) nuevo.hidden = tab !== 'profes';
  (tab === 'profes' ? profes : clases)();
}

async function onClick(e) {
  const ed = e.target.closest('[data-edit]'); if (ed) return formProfesor(+ed.dataset.edit);
  const b = e.target.closest('[data-c]'); if (!b) return;
  if (b.dataset.e === 'cancelada' && !b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Tocá de nuevo'; return; } // confirmación antes de cancelar
  b.disabled = true;
  try { await api.estadoClase(b.dataset.c, b.dataset.e); toast('Clase actualizada'); clases(); }
  catch (err) { toast(err.message, 'error'); b.disabled = false; }
}

async function profes() {
  const c = document.getElementById('profCuerpo'); if (!c) return;
  c.innerHTML = '<p class="sub">Cargando…</p>';
  try {
    CACHE = await api.listarProfesores();
    if (!CACHE.length) { c.innerHTML = '<div class="glass vacio"><h2>No hay profesores</h2><p>Creá el primero con el botón de arriba.</p></div>'; return; }
    c.innerHTML = `<section class="tarjetas">${CACHE.map((p) => `
      <article class="cancha-card glass ${p.activo ? '' : 'inactiva'}">
        <div><h3>${esc(p.nombre)}</h3><p>${esc(p.especialidad)}</p></div>
        <b class="precio">${money(p.precio)}<small>por clase de ${esc(p.duracion)} min</small></b>
        <p>${badge(p.activo ? 'activa' : 'inactiva', p.activo ? 'Activo' : 'Oculto')} <span class="prox">${esc(DIAS.filter(([d]) => ((p.horarios || {})[d] || []).length).map(([d]) => CORTO[d]).join(' · ') || 'Sin horarios')}</span></p>
        <div class="acciones"><button class="btn ghost" data-edit="${esc(p.id)}">Editar</button></div>
      </article>`).join('')}</section>`;
  } catch (e) { console.error(e); c.innerHTML = `<p class="error-txt">No se pudieron cargar los profesores: ${esc(e.message)}</p>`; }
}

async function clases() {
  const c = document.getElementById('profCuerpo'); if (!c) return;
  c.innerHTML = '<p class="sub">Cargando…</p>';
  try {
    const cs = await api.clasesProximas(hoyAR());
    if (!cs.length) { c.innerHTML = '<div class="glass vacio"><h2>No hay clases próximas</h2><p>Acá aparecen las clases reservadas desde hoy en adelante.</p></div>'; return; }
    c.innerHTML = `<div class="tabla-wrap glass"><table class="tabla"><thead><tr><th>Cuándo</th><th>Profesor</th><th>Alumno</th><th>Estado</th><th></th></tr></thead><tbody>
      ${cs.map((x) => `<tr><td>${fmtFecha(x.fecha)} · ${hh(x.hora)}<small>${esc(x.codigo)}</small></td><td>${esc(x.profesores?.nombre || '')}</td>
        <td><b>${esc(x.nombre)}</b><small>${esc(x.telefono)} · <a href="${esc(waLink(x.telefono))}" target="_blank" rel="noopener" style="color:var(--lime)">WhatsApp</a></small></td>
        <td>${badge(x.estado, x.estado === 'cancelada' ? 'Cancelada' : 'Confirmada')}</td>
        <td class="num">${x.estado === 'cancelada'
          ? `<button class="btn chico" data-c="${esc(x.id)}" data-e="confirmada">Reactivar</button>`
          : `<button class="btn chico peligro" data-c="${esc(x.id)}" data-e="cancelada">Cancelar</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  } catch (e) { console.error(e); c.innerHTML = `<p class="error-txt">No se pudieron cargar las clases: ${esc(e.message)}</p>`; }
}

function formProfesor(id) {
  const p = id ? CACHE.find((x) => x.id === id) : { nombre: '', especialidad: '', bio: '', precio: '', duracion: 60, foto: '', etiquetas: [], horarios: {}, activo: true };
  if (!p) return toast('No se encontró el profesor. Recargá la página.', 'error');
  const m = abrirModal(`<h2>${id ? 'Editar profesor' : 'Nuevo profesor'}</h2>
    <form id="fp" novalidate>
      <div class="form-grid">
        <label>Nombre<input name="nombre" maxlength="80" value="${esc(p.nombre)}"></label>
        <label>Especialidad<input name="especialidad" maxlength="80" value="${esc(p.especialidad)}"></label>
        <label>Precio por clase ($)<input name="precio" type="number" min="0" max="1000000" step="100" value="${esc(p.precio)}"></label>
        <label>Duración (minutos)<input name="duracion" type="number" min="30" max="180" step="15" value="${esc(p.duracion)}"></label>
        <label class="ancho">Foto (assets/images/... o link https, opcional)<input name="foto" maxlength="300" value="${esc(p.foto || '')}"></label>
        <label class="ancho">Etiquetas (separadas por coma, máx. 5)<input name="etiquetas" placeholder="Principiantes, Técnica" value="${esc((p.etiquetas || []).join(', '))}"></label>
        <label class="check"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> Activo (visible en la web)</label>
      </div>
      <label class="bloque">Bio<textarea name="bio" rows="3" maxlength="600">${esc(p.bio || '')}</textarea></label>
      <h3>Horarios de clase</h3>
      <p class="hint">Horas de inicio de cada día, separadas por coma (por ejemplo 9, 10, 17). Dejá vacío los días que no da clases.</p>
      <div class="horarios-edit">${DIAS.map(([d, n]) => `<label>${n}<input data-dia="${d}" placeholder="9, 10, 11" value="${esc(((p.horarios || {})[d] || []).slice().sort((a, b) => a - b).join(', '))}"></label>`).join('')}</div>
      <div class="acciones"><button class="btn" type="submit" id="gp">Guardar</button><button class="btn ghost" type="button" id="cp">Cancelar</button></div>
    </form>`);
  const f = m.el.querySelector('#fp'), E = f.elements, btn = m.el.querySelector('#gp');
  m.el.querySelector('#cp').onclick = m.cerrar;
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); btn.disabled = true;
    try {
      const horarios = {};
      for (const inp of f.querySelectorAll('[data-dia]')) {
        const hs = comas(inp.value).map(Number);
        if (hs.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) throw new Error('Revisá las horas: números del 0 al 23 separados por coma.');
        if (hs.length) horarios[inp.dataset.dia] = [...new Set(hs)].sort((a, b) => a - b);
      }
      const r = await api.guardarProfesor({
        id: id || null, nombre: E.nombre.value, especialidad: E.especialidad.value, bio: E.bio.value, precio: Math.round(+E.precio.value),
        duracion: Math.round(+E.duracion.value), foto: E.foto.value, horarios, etiquetas: comas(E.etiquetas.value), activo: E.activo.checked });
      toast(r && r.afectadas ? `Profesor guardado. Atención: tiene ${r.afectadas} clases próximas reservadas, revisalas en la pestaña de clases.` : 'Profesor guardado', r && r.afectadas ? 'aviso' : 'ok');
      m.cerrar(); mostrar();
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
}