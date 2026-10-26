import { esc, hoyAR, sumarDias, barras } from '../core/ui.js';
import * as api from '../core/api.js';

const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];
let periodo = '30';

function rango() {
  const hoy = hoyAR();
  if (periodo === 'mes') { const [y, m] = hoy.split('-').map(Number); return [`${hoy.slice(0, 8)}01`, `${hoy.slice(0, 8)}${new Date(Date.UTC(y, m, 0)).getUTCDate()}`]; }
  return [sumarDias(hoy, -(+periodo - 1)), hoy];
}

export async function render(el) {
  el.innerHTML = `<div class="enc"><div><h1>Estadísticas</h1><p class="sub">Cómo se está usando el complejo</p></div>
    <label class="filtros-mini">Período<select id="per"><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="mes">Este mes</option></select></label></div>
    <div id="estCuerpo"><p class="sub">Cargando…</p></div>`;
  const sel = el.querySelector('#per'); sel.value = periodo; sel.onchange = () => { periodo = sel.value; cargar(); };
  cargar();
}

async function cargar() {
  const c = document.getElementById('estCuerpo'); if (!c) return;
  c.innerHTML = '<p class="sub">Cargando…</p>';
  try {
    const [desde, hasta] = rango();
    const [d, hor] = await Promise.all([api.estadisticas(desde, hasta), api.horario()]);
    if (!d.reservas && !d.canceladas) { c.innerHTML = '<div class="glass vacio"><h2>Todavía no hay datos</h2><p>No hay reservas en este período.</p></div>'; return; }
    const porHora = new Map(d.por_hora.map((x) => [x.hora, x.reservas])), porDia = new Map(d.por_dia_semana.map((x) => [x.dia, x.reservas]));
    const horas = Array.from({ length: hor.fin - hor.ini + 1 }, (_, i) => hor.ini + i);
    c.innerHTML = `
      <section class="stats">
        <article class="stat glass"><span>Reservas</span><b>${d.reservas}</b></article>
        <article class="stat glass"><span>Ocupación</span><b>${d.ocupacion}%</b></article>
        <article class="stat glass"><span>Canceladas</span><b>${d.canceladas}</b></article>
        <article class="stat glass"><span>Tasa de cancelación</span><b>${d.tasa_cancelacion}%</b></article></section>
      <p class="nota" style="margin:0 0 1rem">Ocupación = turnos reservados sobre los turnos posibles (canchas activas × horario × días del período). No descuenta los bloqueos.</p>
      <section class="cards">
        <article class="card glass"><h2>Horarios más pedidos</h2>${barras(horas.map((h) => ({ etiqueta: `${String(h).padStart(2, '0')}:00`, valor: porHora.get(h) || 0 })))}</article>
        <article class="card glass"><h2>Días de la semana</h2>${barras(DIAS.map(([n, t]) => ({ etiqueta: t, valor: porDia.get(n) || 0 })))}</article>
        <article class="card glass" style="grid-column:1/-1"><h2>Uso por cancha</h2>${d.por_cancha.length ? barras(d.por_cancha.map((x) => ({ etiqueta: x.cancha, valor: x.reservas })), (v) => `${v} reservas`) : '<p class="vacio-txt">Sin reservas.</p>'}
          <p class="nota">${d.por_cancha.map((x) => `${esc(x.cancha)}: ${x.ocupacion}% de ocupación`).join(' · ')}</p></article></section>`;
  } catch (e) { console.error(e); c.innerHTML = `<p class="error-txt">No se pudieron cargar las estadísticas: ${esc(e.message)}</p>`; }
}