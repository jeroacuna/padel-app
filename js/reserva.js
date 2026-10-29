/* Consulta y cancelación de una reserva con código + email o teléfono.
   Toda la validación (datos correctos, plazo de cancelación, tope de intentos) la hace la base de datos. */
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => CONFIG.moneda + Number(n || 0).toLocaleString('es-AR');
const hh = h => `${String(h).padStart(2, '0')}:00`;
const ESTADO = { pendiente: 'Pendiente', confirmada: 'Confirmada', cancelada: 'Cancelada', completada: 'Completada' };
const PAGO = { pendiente: 'Pago pendiente', parcial: 'Pago parcial', pagado: 'Pagado', reembolsado: 'Reembolsado' };
const wsp = `https://wa.me/${CONFIG.whatsapp}`;
let ULTIMA = null; // { codigo, contacto } de la última consulta correcta

const consultar = async (codigo, contacto) => {
  exigirDb();
  if (DEMO) throw new Error('La consulta de reservas no está disponible en el modo demo.');
  const { data, error } = await db.rpc('consultar_reserva', { p_codigo: codigo, p_contacto: contacto });
  if (error) throw new Error(error.message);
  return data;
};

function formulario(msg = '', codigo = '', contacto = '') {
  document.title = 'Mi reserva | Padel Arena Paraná';
  app.innerHTML = `<h2>Mi reserva</h2>
    <p class="sub">Ingresá el código que te dimos al reservar y el email o teléfono que usaste. Desde acá podés ver tu turno y cancelarlo.</p>
    <form class="caja glass" id="formConsulta" novalidate>
      <input name="codigo" aria-label="Código de reserva (6 caracteres)" placeholder="Código de reserva (6 caracteres)" maxlength="6" autocomplete="off" autocapitalize="characters" value="${esc(codigo)}" required>
      <input name="contacto" aria-label="Email o teléfono con el que reservaste" placeholder="Email o teléfono con el que reservaste" maxlength="120" autocomplete="email" value="${esc(contacto)}" required>
      <p class="msg error" role="alert" aria-live="assertive">${esc(msg)}</p>
      <button class="btn btn-lime" type="submit">Consultar</button>
    </form>
    <p class="sub" style="margin-top:1.2rem">¿Perdiste tu código? <a href="${wsp}" target="_blank" rel="noopener" style="color:var(--lime)">Escribinos por WhatsApp</a>.</p>`;
  const f = $('#formConsulta');
  f.codigo.addEventListener('input', () => { f.codigo.value = f.codigo.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const cod = f.codigo.value.trim(), con = f.contacto.value.trim(), b = f.querySelector('button'), m = f.querySelector('.msg');
    if (cod.length !== 6 || con.length < 5) { m.textContent = 'Completá el código (6 caracteres) y tu email o teléfono.'; return; }
    b.disabled = true; b.textContent = 'Buscando…'; m.textContent = '';
    try {
      const r = await consultar(cod, con);
      if (!r.ok) { m.textContent = r.mensaje; b.disabled = false; b.textContent = 'Consultar'; return; }
      ULTIMA = { codigo: cod, contacto: con };
      detalle(r);
    } catch (err) { m.textContent = err.message; b.disabled = false; b.textContent = 'Consultar'; }
  });
}

function detalle(r, aviso = '') {
  document.title = `Reserva ${r.codigo} | Padel Arena Paraná`;
  const fecha = new Date(r.fecha + 'T00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  app.innerHTML = `<h2>Tu reserva</h2>
    <div class="caja glass">
      <p><span class="estado ${esc(r.estado)}">${esc(ESTADO[r.estado] || r.estado)}</span></p>
      <dl style="margin-top:1rem">
        <dt>Código</dt><dd>${esc(r.codigo)}</dd>
        <dt>A nombre de</dt><dd>${esc(r.nombre)}</dd>
        <dt>Fecha</dt><dd>${esc(fecha)}</dd>
        <dt>Hora</dt><dd>${hh(r.hora)}</dd>
        <dt>Cancha</dt><dd>${esc(r.cancha)} · ${esc(r.tipo)}</dd>
        <dt>Precio</dt><dd>${money(r.precio)}</dd>
        <dt>Pago</dt><dd>${esc(PAGO[r.pago_estado] || r.pago_estado)}</dd>
      </dl>
      ${aviso ? `<div class="aviso">${esc(aviso)}</div>` : ''}
      ${r.puede_cancelar
        ? `<p class="sub" style="margin:1rem 0 0">Podés cancelarla sin costo hasta ${esc(r.horas_cancelacion)} hs antes del turno.</p>
           <div id="zonaCancelar"><button class="btn btn-ghost" id="btnCancelar" style="margin-top:.8rem">Cancelar esta reserva</button></div>`
        : (r.motivo ? `<div class="aviso">${esc(r.motivo)}</div>` : '')}
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.2rem">
        <button class="btn btn-ghost" id="otra">Consultar otra reserva</button>
        <a class="btn btn-ghost" href="${wsp}" target="_blank" rel="noopener">Hablar por WhatsApp</a>
      </div>
    </div>`;
  $('#otra').onclick = () => formulario();
  const bc = $('#btnCancelar');
  if (bc) bc.onclick = () => pedirConfirmacion(r);
}

function pedirConfirmacion(r) { // paso de confirmación antes de una acción que no se puede deshacer
  $('#zonaCancelar').innerHTML = `<div class="confirmar">
    <b>¿Seguro que querés cancelar?</b>
    <p class="sub" style="margin:.3rem 0 .6rem">El turno va a quedar libre para otras personas y no se puede deshacer.</p>
    <textarea id="motivo" rows="2" maxlength="300" aria-label="Motivo (opcional)" placeholder="Motivo (opcional)"></textarea>
    <div class="fila"><button class="btn btn-rojo" id="siCancelar">Sí, cancelar mi reserva</button><button class="btn btn-ghost" id="noCancelar">Volver</button></div>
    <p class="msg error" id="msgCancelar" role="alert"></p></div>`;
  $('#noCancelar').onclick = () => detalle(r);
  $('#siCancelar').onclick = async e => {
    const b = e.target, m = $('#msgCancelar'); b.disabled = true; b.textContent = 'Cancelando…'; m.textContent = '';
    try {
      const { data, error } = await db.rpc('cancelar_reserva_cliente', { p_codigo: ULTIMA.codigo, p_contacto: ULTIMA.contacto, p_motivo: $('#motivo').value });
      if (error) throw new Error(error.message);
      if (!data.ok) { m.textContent = data.mensaje; b.disabled = false; b.textContent = 'Sí, cancelar mi reserva'; return; }
      db.functions.invoke('enviar-email', { body: { tipo: 'cancelacion', codigo: ULTIMA.codigo } }).catch(() => {}); // aviso por email; no frena la cancelación si falla
      canceladaOk(r, data.reembolso_pendiente);
    } catch (err) { m.textContent = err.message; b.disabled = false; b.textContent = 'Sí, cancelar mi reserva'; }
  };
}

function canceladaOk(r, reembolso) {
  app.innerHTML = `<div class="caja glass ok-grande">
    <h2>Reserva cancelada</h2>
    <p>Tu reserva <b>${esc(r.codigo)}</b> fue cancelada y el turno quedó libre.</p>
    ${reembolso ? `<div class="aviso">Ya tenías un pago registrado: nos vamos a comunicar con vos para el reembolso. También podés escribirnos por WhatsApp.</div>` : ''}
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;margin-top:1rem">
      <a class="btn btn-lime" href="index.html#reservas">Hacer una nueva reserva</a>
      <button class="btn btn-ghost" id="otra">Consultar otra reserva</button>
    </div></div>`;
  $('#otra').onclick = () => formulario();
}

document.querySelectorAll('[data-cfg]').forEach(el => el.textContent = CONFIG[el.dataset.cfg]);
$('#year').textContent = new Date().getFullYear();
$('#burger').onclick = () => $('#navbar').classList.toggle('open');
const qs = new URLSearchParams(location.search).get('codigo'); // el email de confirmación trae el código en el link
formulario('', qs ? qs.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '');