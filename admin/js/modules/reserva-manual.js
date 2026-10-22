import { esc, hoyAR, horaAR, hh, money, toast, abrirModal } from '../core/ui.js';
import * as api from '../core/api.js';

/* Formulario para anotar una reserva que llegó por WhatsApp, teléfono o en persona.
   inicial: { fecha, hora, cancha } para dejar elegido el hueco que se tocó en el calendario. */
export async function abrirAltaManual(inicial = {}, alCrear) {
  const m = abrirModal('<p>Cargando…</p>');
  let cs, hor;
  try { [cs, hor] = await Promise.all([api.canchas(), api.horario()]); }
  catch (e) { m.el.innerHTML = `<p class="error-txt">${esc(e.message)}</p>`; return; }
  cs = cs.filter((c) => c.activa);
  const hoy = hoyAR();
  m.el.innerHTML = `<h2>Nueva reserva</h2><p class="sub">Para anotar reservas que llegan por WhatsApp, teléfono o en persona.</p>
    <form id="fm" novalidate>
      <div class="form-grid">
        <label>Fecha<input type="date" name="fecha" min="${hoy}" value="${esc(inicial.fecha || hoy)}" required></label>
        <label>Cancha<select name="cancha">${cs.map((c) => `<option value="${c.id}" ${c.id === inicial.cancha ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.tipo)}</option>`).join('')}</select></label>
      </div>
      <p class="hint">Horario</p><div class="horas" id="mHoras"></div>
      <div class="form-grid" style="margin-top:1rem">
        <label>Nombre *<input name="nombre" maxlength="80" autocomplete="off"></label>
        <label>Apellido<input name="apellido" maxlength="80" autocomplete="off"></label>
        <label>Teléfono<input name="telefono" type="tel" maxlength="25"></label>
        <label>Email<input name="email" type="email" maxlength="120"></label>
        <label>Origen<select name="origen"><option value="whatsapp">WhatsApp</option><option value="telefono">Teléfono</option><option value="presencial">Presencial</option></select></label>
        <label>Estado<select name="estado"><option value="confirmada">Confirmada</option><option value="pendiente">Pendiente</option></select></label>
        <label>Precio ($)<input name="precio" type="number" min="0" max="1000000" step="100"></label>
      </div>
      <label class="bloque">Notas<textarea name="notas" rows="2" maxlength="300"></textarea></label>
      <div class="acciones"><button class="btn" type="submit" id="mOk" disabled>Crear reserva</button><button class="btn ghost" type="button" id="mNo">Cancelar</button></div>
    </form>`;
  const f = m.el.querySelector('#fm'), horas = m.el.querySelector('#mHoras'), ok = m.el.querySelector('#mOk');
  let hora = null, precioEditado = false;
  const cancha = () => cs.find((c) => c.id === +f.elements.cancha.value);
  const precioPorDefecto = () => { if (!precioEditado) { f.elements.precio.value = cancha()?.precio ?? ''; } };
  f.elements.precio.addEventListener('input', () => { precioEditado = true; });

  const pintarHoras = async (preferida) => {
    hora = null; ok.disabled = true; horas.innerHTML = 'Cargando…';
    if (!f.elements.fecha.value || f.elements.fecha.value < hoy) { horas.innerHTML = '<span class="hint">Elegí una fecha de hoy en adelante.</span>'; return; }
    let oc = []; try { oc = await api.ocupadosDia(f.elements.fecha.value); } catch (e) { toast(e.message, 'error'); }
    const c = +f.elements.cancha.value, ahora = horaAR(); let html = '';
    for (let h = hor.ini; h <= hor.fin; h++) {
      const ocupado = oc.some((o) => o.hora === h && o.cancha_id === c), pasado = f.elements.fecha.value === hoy && h < ahora;
      const nota = ocupado ? 'ocupado' : pasado ? 'pasó' : 'libre';
      html += `<button type="button" class="hora ${nota}" data-h="${h}" ${ocupado || pasado ? 'disabled' : ''}><b>${hh(h)}</b><small>${nota}</small></button>`;
    }
    horas.innerHTML = html;
    const b = preferida != null && horas.querySelector(`[data-h="${preferida}"]:not(:disabled)`); if (b) b.click();
  };
  horas.onclick = (e) => {
    const b = e.target.closest('[data-h]'); if (!b || b.disabled) return;
    hora = +b.dataset.h; horas.querySelectorAll('.hora').forEach((x) => x.classList.toggle('sel', x === b)); ok.disabled = false;
  };
  f.elements.fecha.onchange = () => pintarHoras(); f.elements.cancha.onchange = () => { precioPorDefecto(); pintarHoras(); };
  m.el.querySelector('#mNo').onclick = m.cerrar;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (f.elements.nombre.value.trim().length < 2) { toast('Escribí el nombre del cliente.', 'error'); f.elements.nombre.focus(); return; }
    if (hora === null) { toast('Elegí un horario libre.', 'error'); return; }
    ok.disabled = true; ok.textContent = 'Creando…';
    try {
      await api.crearReservaManual({
        fecha: f.elements.fecha.value, hora, cancha: +f.elements.cancha.value, nombre: f.elements.nombre.value, apellido: f.elements.apellido.value, telefono: f.elements.telefono.value,
        email: f.elements.email.value, origen: f.elements.origen.value, estado: f.elements.estado.value, precio: f.elements.precio.value === '' ? null : Math.round(+f.elements.precio.value), notas: f.elements.notas.value });
      toast('Reserva creada'); m.cerrar(); if (alCrear) alCrear();
    } catch (err) { toast(err.message, 'error'); ok.disabled = false; ok.textContent = 'Crear reserva'; pintarHoras(hora); }
  });
  precioPorDefecto(); pintarHoras(inicial.hora);
}