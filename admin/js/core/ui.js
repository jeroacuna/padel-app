/* Ayudas de interfaz y de fechas. Todo dato que viene de usuarios se pasa por esc() antes de usar innerHTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TZ = 'America/Argentina/Buenos_Aires';
export const hoyAR = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });                 // AAAA-MM-DD en hora argentina
export const horaAR = () => parseInt(new Date().toLocaleString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TZ }), 10);
export const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const fmtFecha = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const fmtFechaHora = (iso) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ });
export const hh = (h) => `${String(h).padStart(2, '0')}:00`;
export const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
export const waLink = (tel) => { const d = String(tel).replace(/\D/g, ''); return 'https://wa.me/' + (d.length === 10 ? '549' + d : d); };

export const ESTADO = { pendiente: 'Pendiente', confirmada: 'Confirmada', cancelada: 'Cancelada', completada: 'Completada' };
export const PAGO = { pendiente: 'Pago pendiente', parcial: 'Pago parcial', pagado: 'Pagado', reembolsado: 'Reembolsado' };
export const badge = (clase, texto) => `<span class="badge b-${esc(clase)}">${esc(texto)}</span>`;

export function toast(msg, tipo = 'ok') {
  let c = document.getElementById('toasts');
  if (!c) { c = document.createElement('div'); c.id = 'toasts'; c.setAttribute('aria-live', 'polite'); document.body.append(c); }
  const t = document.createElement('div'); t.className = `toast ${tipo}`; t.textContent = msg; c.append(t);
  setTimeout(() => t.remove(), tipo === 'ok' ? 3200 : 7000);
}

export function abrirModal(html) {
  const velo = document.createElement('div'); velo.className = 'modal-velo';
  velo.innerHTML = `<div class="modal-caja" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Cerrar">×</button><div class="modal-cuerpo">${html}</div></div>`;
  document.body.append(velo); document.body.classList.add('sin-scroll');
  const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
  const cerrar = () => { velo.remove(); document.body.classList.remove('sin-scroll'); document.removeEventListener('keydown', tecla); };
  document.addEventListener('keydown', tecla);
  velo.addEventListener('click', (e) => { if (e.target === velo || e.target.closest('.modal-x')) cerrar(); });
  return { el: velo.querySelector('.modal-cuerpo'), cerrar };
}

export const sesion = { rol: 'staff' }; // se completa al entrar al panel; la base igual valida los permisos

export function barras(items, formato = (v) => v) { // gráfico de barras simple: items = [{ etiqueta, valor }]
  const max = Math.max(1, ...items.map((i) => i.valor));
  return `<ul class="barras">${items.map((i) => `<li><span class="b-et">${esc(i.etiqueta)}</span><span class="b-pista"><i style="width:${Math.max(0, Math.round((i.valor / max) * 100))}%"></i></span><span class="b-val">${esc(formato(i.valor))}</span></li>`).join('')}</ul>`;
}