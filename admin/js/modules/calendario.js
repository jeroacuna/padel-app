import { esc, hoyAR, horaAR, sumarDias, hh, ESTADO } from '../core/ui.js';
import * as api from '../core/api.js';
import { abrirDetalle } from './reservas.js';
import { abrirAltaManual } from './reserva-manual.js';

const S = { vista: 'dia', fecha: '' };
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const lunesDe = (f) => sumarDias(f, -((new Date(f + 'T12:00:00Z').getUTCDay() + 6) % 7));
const diaSem = (f) => new Date(f + 'T12:00:00Z').getUTCDay();
const titulo = () => {
  const f = (x) => new Date(x + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  if (S.vista === 'dia') return `${DIAS[diaSem(S.fecha)]} ${f(S.fecha)}`;
  const l = lunesDe(S.fecha); return `Semana del ${f(l)} al ${f(sumarDias(l, 6))}`;
};

export async function render(el) {
  if (!S.fecha) S.fecha = hoyAR();
  el.innerHTML = `
    <div class="enc"><div><h1>Calendario</h1><p class="sub">Ocupación de las canchas. Tocá un hueco libre para anotar una reserva.</p></div><button class="btn" id="nueva">+ Nueva reserva</button></div>
    <div class="cal-barra glass">
      <div class="seg"><button data-v="dia">Día</button><button data-v="semana">Semana</button></div>
      <div class="navs"><button class="btn ghost" data-n="-1" aria-label="Anterior">←</button><button class="btn ghost" data-n="0">Hoy</button><button class="btn ghost" data-n="1" aria-label="Siguiente">→</button></div>
      <input type="date" id="calFecha" value="${S.fecha}"><b id="calTitulo"></b>
    </div>
    <div class="leyenda"><span><i class="e-confirmada"></i>Confirmada</span><span><i class="e-pendiente"></i>Pendiente</span><span><i class="e-completada"></i>Completada</span><span><i class="libre-pt"></i>Libre</span><span><i class="bloq-pt"></i>Bloqueada</span></div>
    <div id="calCuerpo"></div>`;
  const barra = el.querySelector('.cal-barra');
  barra.addEventListener('click', (e) => {
    const v = e.target.closest('[data-v]'), n = e.target.closest('[data-n]');
    if (v) S.vista = v.dataset.v;
    if (n) S.fecha = n.dataset.n === '0' ? hoyAR() : sumarDias(S.fecha, +n.dataset.n * (S.vista === 'dia' ? 1 : 7));
    if (v || n) pintar();
  });
  el.querySelector('#calFecha').onchange = (e) => { if (e.target.value) { S.fecha = e.target.value; pintar(); } };
  el.querySelector('#nueva').onclick = () => abrirAltaManual({ fecha: S.fecha < hoyAR() ? hoyAR() : S.fecha }, pintar);
  el.querySelector('#calCuerpo').addEventListener('click', (e) => {
    const r = e.target.closest('[data-id]'), l = e.target.closest('[data-libre]'), d = e.target.closest('[data-f]');
    if (r) abrirDetalle(r.dataset.id, pintar);
    else if (l) abrirAltaManual({ fecha: S.fecha, hora: +l.dataset.h, cancha: +l.dataset.c }, pintar);
    else if (d) { S.fecha = d.dataset.f; S.vista = 'dia'; pintar(); }
  });
  pintar();
}

async function pintar() {
  const cuerpo = document.getElementById('calCuerpo'); if (!cuerpo) return;
  document.querySelectorAll('.cal-barra [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === S.vista));
  document.getElementById('calTitulo').textContent = titulo(); document.getElementById('calFecha').value = S.fecha;
  cuerpo.innerHTML = '<p class="sub">Cargando calendario…</p>';
  try {
    const dia = S.vista === 'dia', desde = dia ? S.fecha : lunesDe(S.fecha), hasta = dia ? S.fecha : sumarDias(desde, 6);
    const [res, canchas, hor, bl] = await Promise.all([api.reservasRango(desde, hasta), api.canchas(), api.horario(), api.bloqueosRango(desde, hasta)]);
    const horas = Array.from({ length: hor.fin - hor.ini + 1 }, (_, i) => hor.ini + i);
    cuerpo.innerHTML = dia ? vistaDia(res, canchas, horas, bl) : vistaSemana(res, canchas, horas, desde, bl);
  } catch (e) { console.error(e); cuerpo.innerHTML = `<p class="error-txt">No se pudo cargar el calendario: ${esc(e.message)}</p>`; }
}

const TIPO_B = { lluvia: 'Lluvia', mantenimiento: 'Mantenim.', evento: 'Evento', otro: 'Bloqueada' };
const bloqueo = (bl, f, h, c) => bl.find((b) => f >= b.fecha_desde && f <= b.fecha_hasta && h >= b.hora_ini && h <= b.hora_fin && (b.cancha_id == null || b.cancha_id === c));

function vistaDia(res, canchas, horas, bl) {
  const hoy = hoyAR(), ahora = horaAR(), cols = canchas.filter((c) => c.activa || res.some((r) => r.cancha_id === c.id));
  const mapa = new Map(res.map((r) => [`${r.hora}-${r.cancha_id}`, r]));
  if (!cols.length) return '<div class="glass vacio"><h2>No hay canchas activas</h2></div>';
  const celda = (h, c) => {
    const r = mapa.get(`${h}-${c.id}`);
    if (r) return `<td><button class="res e-${esc(r.estado)}" data-id="${esc(r.id)}"><b>${esc(r.nombre)} ${esc(r.apellido)}</b><small>${esc(ESTADO[r.estado] || r.estado)}</small></button></td>`;
    const b = bloqueo(bl, S.fecha, h, c.id);
    if (b) return `<td class="bloq" title="${esc(b.motivo || '')}"><span>🔒 ${TIPO_B[b.tipo] || 'Bloqueada'}</span></td>`;
    const pasado = S.fecha < hoy || (S.fecha === hoy && h < ahora);
    return pasado || !c.activa ? '<td class="pasado">—</td>' : `<td><button class="libre" data-libre data-h="${h}" data-c="${c.id}" aria-label="Reservar ${hh(h)} en ${esc(c.nombre)}">+</button></td>`;
  };
  return `<div class="cal-wrap glass"><table class="cal-tabla"><thead><tr><th></th>${cols.map((c) => `<th>${esc(c.nombre)}<small>${esc(c.tipo)}${c.activa ? '' : ' · inactiva'}</small></th>`).join('')}</tr></thead>
    <tbody>${horas.map((h) => `<tr class="${S.fecha === hoy && h === ahora ? 'ahora' : ''}"><th>${hh(h)}</th>${cols.map((c) => celda(h, c)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function vistaSemana(res, canchas, horas, lunes, bl) {
  const hoy = hoyAR(), act = canchas.filter((c) => c.activa), activas = act.length || 1, dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const reservado = new Set(res.map((r) => `${r.fecha}-${r.hora}-${r.cancha_id}`));
  const ocupadas = (f, h) => act.filter((c) => reservado.has(`${f}-${h}-${c.id}`) || bloqueo(bl, f, h, c.id)).length; // reservadas o bloqueadas
  const total = (f) => res.filter((r) => r.fecha === f).length;
  const celda = (f, h) => { const n = ocupadas(f, h), k = n === 0 ? 'vacio' : n >= activas ? 'lleno' : 'parcial'; return `<td><button class="sem ${k}" data-f="${f}" aria-label="${n} de ${activas} canchas ocupadas">${n ? `${n}/${activas}` : ''}</button></td>`; };
  return `<div class="cal-wrap glass"><table class="cal-tabla semana"><thead><tr><th></th>${dias.map((f) => `<th class="${f === hoy ? 'hoy' : ''}"><button class="dia-h" data-f="${f}">${DIAS[diaSem(f)]} ${+f.slice(8)}<small>${total(f)} reservas</small></button></th>`).join('')}</tr></thead>
    <tbody>${horas.map((h) => `<tr><th>${hh(h)}</th>${dias.map((f) => celda(f, h)).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="nota">Cada celda muestra cuántas canchas están ocupadas (reservadas o bloqueadas) en ese horario. Tocá un día o una celda para verlo en detalle.</p>`;
}