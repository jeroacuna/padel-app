import { esc, fmtFecha, hh, badge, toast, abrirModal, sesion } from '../core/ui.js';
import * as api from '../core/api.js';

const TIPOS = { urgente: 'Urgente (barra arriba de todo)', info: 'Novedad', torneo: 'Torneo' };
const CORTO = { urgente: 'Urgente', info: 'Novedad', torneo: 'Torneo' };
let AVISOS = [];

export function render(el) {
  el.innerHTML = `
    <h1>Configuración</h1><p class="sub">Horario de atención y avisos que se muestran en la web</p>
    <section class="card glass" id="cfgHorario"><p class="sub">Cargando…</p></section>
    <div class="enc" style="margin-top:2rem"><div><h2>Avisos y novedades</h2><p class="sub" style="margin:0">Los "urgentes" aparecen en una barra arriba de toda la web (ej. cierre por lluvia). Los demás se muestran como tarjetas en el inicio.</p></div><button class="btn" id="nuevoAviso">+ Nuevo aviso</button></div>
    <div id="avisosLista"></div>`;
  el.querySelector('#nuevoAviso').onclick = () => formAviso(null);
  el.querySelector('#avisosLista').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'); if (ed) return formAviso(+ed.dataset.edit);
    const tg = e.target.closest('[data-toggle]'); if (!tg) return;
    const a = AVISOS.find((x) => x.id === +tg.dataset.toggle); if (!a) return;
    tg.disabled = true;
    try { await api.guardarAviso({ id: a.id, tipo: a.tipo, titulo: a.titulo, texto: a.texto, enlace: a.enlace, activo: !a.activo }); toast(a.activo ? 'Aviso desactivado' : 'Aviso activado'); avisos(); }
    catch (err) { toast(err.message, 'error'); tg.disabled = false; }
  });
  horario(); avisos();
}

async function horario() {
  const box = document.getElementById('cfgHorario'); if (!box) return;
  try {
    const h = await api.horario(), owner = sesion.rol === 'owner';
    const op = (sel) => Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${hh(i)}</option>`).join('');
    box.innerHTML = `<h2>Horario de atención</h2>
      <form id="fh" novalidate>
        <div class="form-grid">
          <label>Primer turno<select name="ini" ${owner ? '' : 'disabled'}>${op(h.ini)}</select></label>
          <label>Último turno<select name="fin" ${owner ? '' : 'disabled'}>${op(h.fin)}</select></label>
        </div>
        <p class="hint">Cada turno dura 1 hora: si el último turno es a las 22:00, el complejo cierra a las 23:00. Las reservas que ya existen no se tocan.${owner ? '' : ' Solo el propietario puede cambiar el horario.'}</p>
        <div class="acciones"><button class="btn" type="submit" id="gh" ${owner ? '' : 'disabled'}>Guardar horario</button></div>
      </form>`;
    const f = box.querySelector('#fh');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ini = +f.elements.ini.value, fin = +f.elements.fin.value, b = box.querySelector('#gh');
      if (fin < ini) { toast('El último turno no puede ser antes que el primero.', 'error'); return; }
      b.disabled = true;
      try {
        const r = await api.guardarConfig(ini, fin);
        toast(r && r.afectadas ? `Horario guardado. Atención: hay ${r.afectadas} reservas próximas fuera del nuevo horario, revisalas en el calendario.` : 'Horario guardado', r && r.afectadas ? 'aviso' : 'ok');
        horario();
      } catch (err) { toast(err.message, 'error'); b.disabled = false; }
    });
  } catch (e) { console.error(e); box.innerHTML = `<p class="error-txt">No se pudo cargar el horario: ${esc(e.message)}</p>`; }
}

async function avisos() {
  const c = document.getElementById('avisosLista'); if (!c) return;
  try {
    AVISOS = await api.listarAvisos();
    if (!AVISOS.length) { c.innerHTML = '<div class="glass vacio"><h2>No hay avisos</h2><p>Creá uno con el botón de arriba.</p></div>'; return; }
    c.innerHTML = `<div class="tabla-wrap glass"><table class="tabla"><thead><tr><th>Tipo</th><th>Aviso</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>
      ${AVISOS.map((a) => `<tr><td>${badge(a.tipo, CORTO[a.tipo] || a.tipo)}</td>
        <td><b>${esc(a.titulo)}</b><small>${esc(a.texto)}</small>${a.enlace ? `<small>→ ${esc(a.enlace)}</small>` : ''}</td>
        <td>${fmtFecha(a.fecha)}</td><td>${a.activo ? badge('activa', 'Visible') : badge('inactiva', 'Oculto')}</td>
        <td class="num"><button class="btn chico ghost" data-edit="${esc(a.id)}">Editar</button> <button class="btn chico ${a.activo ? 'ghost' : ''}" data-toggle="${esc(a.id)}">${a.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}</tbody></table></div>`;
  } catch (e) { console.error(e); c.innerHTML = `<p class="error-txt">No se pudieron cargar los avisos: ${esc(e.message)}</p>`; }
}

function formAviso(id) {
  const a = id ? AVISOS.find((x) => x.id === id) : { tipo: 'info', titulo: '', texto: '', enlace: '', activo: true };
  if (!a) return toast('No se encontró el aviso. Recargá la página.', 'error');
  const m = abrirModal(`<h2>${id ? 'Editar aviso' : 'Nuevo aviso'}</h2>
    <form id="fa" novalidate>
      <div class="form-grid">
        <label>Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${a.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="activo" ${a.activo ? 'checked' : ''}> Visible en la web</label>
        <label class="ancho">Título<input name="titulo" maxlength="80" value="${esc(a.titulo)}"></label>
        <label class="ancho">Enlace (opcional: torneos.html o un link https)<input name="enlace" maxlength="300" value="${esc(a.enlace || '')}"></label>
      </div>
      <label class="bloque">Texto<textarea name="texto" rows="3" maxlength="300">${esc(a.texto)}</textarea></label>
      <div class="acciones"><button class="btn" type="submit" id="ga">Guardar</button><button class="btn ghost" type="button" id="ca">Cancelar</button></div>
    </form>`);
  const f = m.el.querySelector('#fa'), E = f.elements, btn = m.el.querySelector('#ga');
  m.el.querySelector('#ca').onclick = m.cerrar;
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); btn.disabled = true;
    try {
      await api.guardarAviso({ id: id || null, tipo: E.tipo.value, titulo: E.titulo.value, texto: E.texto.value, enlace: E.enlace.value, activo: E.activo.checked });
      toast('Aviso guardado'); m.cerrar(); avisos();
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
}