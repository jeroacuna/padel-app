const $ = s => document.querySelector(s);
const money = n => CONFIG.moneda + n.toLocaleString('es-AR');
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const app = $('#app');
const f2 = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hh = h => `${String(h).padStart(2, '0')}:00`;
const horasDe = (p, dow) => [...(p.horarios[dow] || [])].sort((a, b) => a - b);
const avatar = p => p.foto
  ? `<div class="avatar" style="background-image:url('${p.foto}')" role="img" aria-label="${p.nombre}"></div>`
  : `<div class="avatar" aria-hidden="true">${p.nombre.split(' ').map(x => x[0]).slice(0, 2).join('')}</div>`;

function lista(ps) {
  document.title = 'Profesores de pádel | Padel Arena Paraná';
  app.innerHTML = `<h2>Nuestros profesores</h2><div class="t-list">${ps.map(p => `
    <article class="prof-card glass">${avatar(p)}<small>${p.especialidad}</small><h3>${p.nombre}</h3>
      <p>${p.bio}</p><p><b>${money(p.precio)}</b> la clase de ${p.duracion} min</p>
      <a class="btn btn-lime" href="profesores.html?id=${p.id}">Ver horarios y reservar</a></article>`).join('')}</div>`;
}

function detalle(p) {
  document.title = `${p.nombre} · Clases de pádel | Padel Arena Paraná`;
  const hoy = new Date(), dias = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
    if (horasDe(p, d.getDay()).length) dias.push(d);
  }
  const sel = { fecha: null, hora: null };
  const semana = [1, 2, 3, 4, 5, 6, 0].filter(d => horasDe(p, d).length)
    .map(d => `<div><b>${DIAS[d]}</b>${horasDe(p, d).map(hh).join(' · ')}</div>`).join('');

  app.innerHTML = `<a class="back" href="profesores.html">← Todos los profesores</a>
  <div class="t-detail"><div>
    ${avatar(p)}<h2 style="margin-top:1rem">${p.nombre}</h2><p>${p.bio}</p>
    <div class="facts"><div><small>Especialidad</small><b>${p.especialidad}</b></div>
      <div><small>Clase</small><b>${p.duracion} minutos</b></div><div><small>Valor</small><b>${money(p.precio)}</b></div></div>
    <h3>Horarios semanales</h3><div class="week">${semana}</div>
  </div>
  <form class="t-form glass" id="formClase"><h3>Reservá tu clase</h3>
    <small>1. Elegí el día</small>
    <div class="days" id="days">${dias.map(d => `<button type="button" class="day" data-f="${f2(d)}"><small>${DIAS[d.getDay()]}</small><b>${d.getDate()}</b></button>`).join('')}</div>
    <small>2. Elegí el horario</small>
    <div class="slots" id="slotsP" style="margin:.6rem 0 1rem"><p class="mensaje-turnos">Primero elegí un día.</p></div>
    <input name="nombre" placeholder="Nombre y apellido" required>
    <input name="telefono" type="tel" placeholder="Teléfono" required>
    <input name="email" type="email" placeholder="Email" required>
    <button class="btn btn-lime" type="submit" id="btnClase" disabled>Reservar clase · ${money(p.precio)}</button>
  </form></div>`;

  async function elegirDia(fecha) {
    sel.fecha = fecha; sel.hora = null; $('#btnClase').disabled = true;
    document.querySelectorAll('.day').forEach(b => b.classList.toggle('sel', b.dataset.f === fecha));
    const box = $('#slotsP'); box.innerHTML = '<p class="mensaje-turnos">Cargando…</p>';
    let oc = [];
    try { oc = await ProfesoresAPI.ocupadas(p.id, fecha); }
    catch (e) { box.innerHTML = '<p class="mensaje-turnos">No se pudo cargar la disponibilidad.</p>'; return; }
    const ahora = new Date(), esHoy = fecha === f2(ahora);
    box.innerHTML = horasDe(p, new Date(fecha + 'T00:00').getDay()).map(h => {
      const pas = esHoy && h <= ahora.getHours(), res = oc.includes(h);
      return `<button type="button" class="slot ${pas ? 'no' : res ? 'res' : 'ok'}" data-h="${h}" ${pas || res ? 'disabled' : ''}><b>${hh(h)}</b><small>${pas ? 'No disponible' : res ? 'Reservado' : 'Libre'}</small></button>`;
    }).join('');
  }
  $('#days').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) elegirDia(b.dataset.f); });
  $('#slotsP').addEventListener('click', e => {
    const b = e.target.closest('[data-h]'); if (!b || b.disabled) return;
    sel.hora = +b.dataset.h;
    document.querySelectorAll('#slotsP .slot').forEach(s => s.classList.toggle('sel', s === b));
    $('#btnClase').disabled = false;
  });
  $('#formClase').addEventListener('submit', async e => {
    e.preventDefault();
    if (sel.fecha === null || sel.hora === null) return;
    const f = e.target, btn = $('#btnClase'); btn.disabled = true; btn.textContent = 'Reservando…';
    const d = { fecha: sel.fecha, hora: sel.hora, nombre: f.nombre.value, telefono: f.telefono.value, email: f.email.value };
    try { confirmar(p, d, await ProfesoresAPI.reservar(p, d)); }
    catch (err) { alert(err.message); btn.textContent = `Reservar clase · ${money(p.precio)}`; elegirDia(sel.fecha); }
  });
}

function confirmar(p, d, codigo) {
  const fecha = new Date(d.fecha + 'T00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#modalCard').innerHTML = `<i data-lucide="check-circle-2" class="ok-ico"></i><h3>¡Clase reservada!</h3>
    <p>Gracias ${d.nombre}, te esperamos.</p>
    <dl><dt>Código</dt><dd>${codigo}</dd><dt>Profe</dt><dd>${p.nombre}</dd><dt>Día</dt><dd>${fecha}</dd><dt>Hora</dt><dd>${hh(d.hora)}</dd><dt>Valor</dt><dd>${money(p.precio)}</dd></dl>
    <button class="btn btn-lime" id="cerrarModal">Listo</button>`;
  $('#modal').classList.add('open'); lucide.createIcons();
  $('#cerrarModal').onclick = () => { $('#modal').classList.remove('open'); iniciar(); };
}

async function iniciar() {
  const id = new URLSearchParams(location.search).get('id');
  try {
    if (id) {
      const p = await ProfesoresAPI.obtener(id);
      return p ? detalle(p) : (app.innerHTML = '<p>No encontramos a ese profesor. <a class="back" href="profesores.html">Ver todos</a></p>');
    }
    lista(await ProfesoresAPI.listar());
  } catch (err) { console.error(err); app.innerHTML = '<p>No se pudieron cargar los profesores. Intentá de nuevo en un rato.</p>'; }
}

document.querySelectorAll('[data-cfg]').forEach(el => el.textContent = CONFIG[el.dataset.cfg]);
$('#year').textContent = new Date().getFullYear();
$('#burger').onclick = () => $('#navbar').classList.toggle('open');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.classList.remove('open'); });
lucide.createIcons(); iniciar();