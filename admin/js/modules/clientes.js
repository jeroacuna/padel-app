import { esc, fmtFecha, hh, money, waLink, ESTADO, badge, toast, abrirModal } from '../core/ui.js';
import * as api from '../core/api.js';

const TAM = 20, FRECUENTE = 5;
const F = { q: '', orden: 'ultima', frecuentes: false, pagina: 0 };

export function render(el) {
  const op = (v, t) => `<option value="${v}" ${F.orden === v ? 'selected' : ''}>${t}</option>`;
  el.innerHTML = `
    <h1>Clientes</h1><p class="sub">Se crean solos a partir de las reservas, sin duplicar a quien reserva varias veces (por teléfono o email)</p>
    <form class="filtros glass" id="filtros" onsubmit="return false">
      <label class="ancho">Buscar<input type="search" name="q" placeholder="Nombre, teléfono o email" value="${esc(F.q)}"></label>
      <label>Orden<select name="orden">${op('ultima', 'Última reserva')}${op('reservas', 'Más reservas')}${op('nuevos', 'Más nuevos')}${op('nombre', 'Nombre (A-Z)')}</select></label>
      <label class="check"><input type="checkbox" name="frecuentes" ${F.frecuentes ? 'checked' : ''}> Solo frecuentes (${FRECUENTE}+ reservas)</label>
    </form><div id="lista"></div>`;
  const form = el.querySelector('#filtros'); let t;
  form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { Object.assign(F, { q: form.q.value, orden: form.orden.value, frecuentes: form.frecuentes.checked, pagina: 0 }); cargar(); }, 300); });
  el.querySelector('#lista').addEventListener('click', (e) => {
    const p = e.target.closest('[data-pag]'); if (p) { F.pagina += +p.dataset.pag; cargar(); return; }
    const r = e.target.closest('tr[data-id]'); if (r) detalle(r.dataset.id);
  });
  el.querySelector('#lista').addEventListener('keydown', (e) => { const r = e.target.closest('tr[data-id]'); if (r && e.key === 'Enter') detalle(r.dataset.id); });
  cargar();
}

async function cargar() {
  const cont = document.getElementById('lista'); if (!cont) return;
  cont.innerHTML = '<p class="sub">Cargando clientes…</p>';
  try {
    const { filas, total } = await api.listarClientes({ ...F, tam: TAM });
    if (!filas.length) { cont.innerHTML = '<div class="glass vacio"><h2>No hay clientes</h2><p>Aparecen automáticamente cuando alguien reserva con teléfono o email.</p></div>'; return; }
    const ini = F.pagina * TAM + 1, fin = ini + filas.length - 1;
    cont.innerHTML = `<div class="tabla-wrap glass"><table class="tabla"><thead><tr><th>Cliente</th><th>Contacto</th><th class="num">Reservas</th><th class="num">Cancel.</th><th>Última reserva</th></tr></thead><tbody>
      ${filas.map((c) => `<tr data-id="${esc(c.id)}" tabindex="0"><td><b>${esc(c.nombre)} ${esc(c.apellido)}</b> ${c.reservas_total >= FRECUENTE ? badge('frecuente', 'Frecuente') : ''}</td>
        <td>${esc(c.telefono || '—')}<small>${esc(c.email || '')}</small></td><td class="num">${c.reservas_total}</td><td class="num">${c.canceladas}</td>
        <td>${c.ultima_reserva ? fmtFecha(c.ultima_reserva) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <div class="pag"><span>Mostrando ${ini}–${fin} de ${total}</span><div><button class="btn ghost" data-pag="-1" ${F.pagina === 0 ? 'disabled' : ''}>← Anterior</button><button class="btn ghost" data-pag="1" ${fin >= total ? 'disabled' : ''}>Siguiente →</button></div></div>`;
  } catch (e) { console.error(e); cont.innerHTML = `<p class="error-txt">No se pudieron cargar los clientes: ${esc(e.message)}</p>`; }
}

async function detalle(id) {
  const m = abrirModal('<p>Cargando…</p>');
  try { pintar(m, await api.obtenerCliente(id), await api.reservasDeCliente(id)); } catch (e) { m.el.innerHTML = `<p class="error-txt">${esc(e.message)}</p>`; }
}

function pintar(m, c, rs) {
  m.el.innerHTML = `
    <h2>${esc(c.nombre)} ${esc(c.apellido)} ${c.reservas_total >= FRECUENTE ? badge('frecuente', 'Frecuente') : ''}</h2>
    <p class="sub">${c.reservas_total} reservas · ${c.canceladas} canceladas · ${c.ultima_reserva ? 'última: ' + fmtFecha(c.ultima_reserva) : 'sin reservas'}${c.telefono ? ` · <a href="${esc(waLink(c.telefono))}" target="_blank" rel="noopener" style="color:var(--lime)">WhatsApp</a>` : ''}</p>
    <form id="fcl" novalidate><div class="form-grid">
      <label>Nombre<input name="nombre" maxlength="80" value="${esc(c.nombre)}"></label><label>Apellido<input name="apellido" maxlength="80" value="${esc(c.apellido)}"></label>
      <label>Teléfono<input name="telefono" type="tel" maxlength="25" value="${esc(c.telefono || '')}"></label><label>Email<input name="email" type="email" maxlength="120" value="${esc(c.email || '')}"></label></div>
      <label class="bloque">Notas administrativas (solo las ve el equipo)<textarea name="notas" rows="3" maxlength="500">${esc(c.notas_admin || '')}</textarea></label>
      <div class="acciones"><button class="btn" type="submit" id="gcl">Guardar cambios</button></div></form>
    <h3>Historial de reservas</h3>
    ${rs.length ? `<ul class="hist">${rs.map((r) => `<li><b>${fmtFecha(r.fecha)} · ${hh(r.hora)} · ${esc(r.canchas?.nombre || '')}</b> ${badge(r.estado, ESTADO[r.estado] || r.estado)}<small>${money(r.precio)}</small></li>`).join('')}</ul>` : '<p class="vacio-txt">Todavía no tiene reservas.</p>'}`;
  const f = m.el.querySelector('#fcl');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const b = m.el.querySelector('#gcl'); b.disabled = true;
    try { await api.guardarCliente({ id: c.id, nombre: f.elements.nombre.value, apellido: f.elements.apellido.value, telefono: f.elements.telefono.value, email: f.elements.email.value, notas: f.elements.notas.value });
      toast('Cliente actualizado'); pintar(m, await api.obtenerCliente(c.id), rs); cargar(); }
    catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });
}