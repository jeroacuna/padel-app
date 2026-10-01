/* ===== CAPA DE DATOS =====
   Es lo ÚNICO que hay que reemplazar para usar Supabase/Firebase/API.
   Mantené los mismos nombres y que devuelvan promesas. */
const ReservasAPI = {
  KEY: 'padelarena_reservas',
  _all() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  async porFecha(fecha) { return this._all().filter(r => r.fecha === fecha); },
  async crear(r) {
    const all = this._all();
    if (all.some(x => x.fecha === r.fecha && x.hora === r.hora && x.canchaId === r.canchaId))
      throw new Error('Ese turno ya fue reservado. Elegí otro.');
    const nueva = { ...r, id: Date.now().toString(36).toUpperCase() };
    all.push(nueva);
    localStorage.setItem(this.KEY, JSON.stringify(all));
    return nueva;
  }
};

/* Ocupación simulada (para que haya turnos reservados de ejemplo). Se borra al usar backend real. */
function ocupadoSim(fecha, canchaId, hora) {
  let s = 0;
  for (const c of `${fecha}|${canchaId}|${hora}`) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return s % 100 < 30;
}

/* ===== UI DE RESERVAS ===== */
const Reserva = {
  estado: { fecha: null, hora: null, cancha: null, mes: new Date(), guardadas: [] },
  $: id => document.getElementById(id),
  fmt: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  horas() { const h = []; for (let i = CONFIG.horaInicio; i <= CONFIG.horaFin; i++) h.push(i); return h; },
  hh: h => `${String(h).padStart(2, '0')}:00`,
  ocupada(c, h) {
    const e = this.estado;
    return ocupadoSim(e.fecha, c.id, h) || e.guardadas.some(r => r.hora === h && r.canchaId === c.id);
  },
  pasada(h) {
    const hoy = new Date();
    return this.estado.fecha === this.fmt(hoy) && h <= hoy.getHours();
  },
  desbloquear(id) { this.$(id).classList.remove('locked'); },
  bloquear(...ids) { ids.forEach(id => this.$(id).classList.add('locked')); },
  marcarPaso(n) { [...this.$('stepsBar').children].forEach((s, i) => s.classList.toggle('on', i < n)); },

  calendario() {
    const e = this.estado, m = e.mes, cal = this.$('cal');
    const nombre = m.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const primero = new Date(m.getFullYear(), m.getMonth(), 1);
    const offset = (primero.getDay() + 6) % 7; // semana arranca en lunes
    const dias = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let html = `<div class="cal-head"><button data-nav="-1" aria-label="Mes anterior">‹</button><b>${nombre}</b><button data-nav="1" aria-label="Mes siguiente">›</button></div><div class="cal-grid">`;
    html += ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<small>${d}</small>`).join('');
    html += '<span></span>'.repeat(offset);
    for (let d = 1; d <= dias; d++) {
      const f = new Date(m.getFullYear(), m.getMonth(), d), s = this.fmt(f);
      html += `<button data-fecha="${s}" class="${s === e.fecha ? 'sel' : ''}" ${f < hoy ? 'disabled' : ''}>${d}</button>`;
    }
    cal.innerHTML = html + '</div>';
  },

  async elegirFecha(fecha) {
    const e = this.estado;
    e.fecha = fecha; e.hora = null; e.cancha = null;
    e.guardadas = await ReservasAPI.porFecha(fecha);
    this.calendario(); this.horarios(); this.desbloquear('stepHora');
    this.bloquear('stepCancha', 'stepResumen'); this.resumen(); this.marcarPaso(1);
  },

  horarios() {
    this.$('slots').innerHTML = this.horas().map(h => {
      const libres = CANCHAS.filter(c => !this.ocupada(c, h)).length;
      let cls = 'ok', txt = `${libres} libres`, dis = '';
      if (this.pasada(h)) { cls = 'no'; txt = 'No disponible'; dis = 'disabled'; }
      else if (!libres) { cls = 'res'; txt = 'Reservado'; dis = 'disabled'; }
      return `<button class="slot ${cls} ${h === this.estado.hora ? 'sel' : ''}" data-hora="${h}" ${dis}><b>${this.hh(h)}</b><small>${txt}</small></button>`;
    }).join('');
  },

  elegirHora(h) {
    this.estado.hora = h; this.estado.cancha = null;
    this.horarios(); this.canchas(); this.desbloquear('stepCancha');
    this.bloquear('stepResumen'); this.resumen(); this.marcarPaso(2);
  },

  canchas() {
    this.$('courtPick').innerHTML = CANCHAS.map(c => {
      const oc = this.ocupada(c, this.estado.hora);
      return `<button class="court-opt ${this.estado.cancha === c.id ? 'sel' : ''}" data-cancha="${c.id}" ${oc ? 'disabled' : ''}>
        <b>${c.nombre}</b><small>${c.tipo}</small><span>${oc ? 'Ocupada' : CONFIG.moneda + c.precio.toLocaleString('es-AR')}</span></button>`;
    }).join('');
  },

  elegirCancha(id) {
    this.estado.cancha = id; this.canchas(); this.desbloquear('stepResumen');
    this.resumen(); this.$('btnConfirmar').disabled = false; this.marcarPaso(4);
  },

  datos() {
    const e = this.estado, c = CANCHAS.find(x => x.id === e.cancha);
    if (!c || e.hora === null) return null;
    const f = new Date(e.fecha + 'T00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return { fecha: e.fecha, fechaTxt: f, hora: e.hora, horaTxt: this.hh(e.hora), canchaId: c.id, cancha: c.nombre, tipo: c.tipo, duracion: CONFIG.duracion, precio: c.precio };
  },

  resumen() {
    const d = this.datos(), dl = this.$('resumen');
    if (!d) { dl.innerHTML = '<dt>Todavía no elegiste turno</dt><dd></dd>'; return; }
    dl.innerHTML = `<dt>Fecha</dt><dd>${d.fechaTxt}</dd><dt>Hora</dt><dd>${d.horaTxt}</dd><dt>Cancha</dt><dd>${d.cancha} · ${d.tipo}</dd><dt>Duración</dt><dd>${d.duracion}</dd><dt>Precio</dt><dd>${CONFIG.moneda}${d.precio.toLocaleString('es-AR')}</dd>`;
  },

  async enviar(form) {
    const d = this.datos(), fd = Object.fromEntries(new FormData(form));
    try {
      const r = await ReservasAPI.crear({ ...d, ...fd });
      this.modal(r);
      form.reset(); form.hidden = true;
      await this.elegirFecha(d.fecha);
    } catch (err) { alert(err.message); await this.elegirFecha(d.fecha); }
  },

  modal(r) {
    this.$('modalCard').innerHTML = `<i data-lucide="check-circle-2" class="ok-ico"></i><h3>¡Reserva confirmada!</h3>
      <p>Gracias ${r.nombre}, te esperamos.</p>
      <dl><dt>Código</dt><dd>${r.id}</dd><dt>Fecha</dt><dd>${r.fechaTxt}</dd><dt>Hora</dt><dd>${r.horaTxt}</dd><dt>Cancha</dt><dd>${r.cancha} · ${r.tipo}</dd><dt>Duración</dt><dd>${r.duracion}</dd><dt>Precio</dt><dd>${CONFIG.moneda}${r.precio.toLocaleString('es-AR')}</dd></dl>
      <button class="btn btn-lime" id="cerrarModal">Listo</button>`;
    this.$('modal').classList.add('open'); lucide.createIcons();
    this.$('cerrarModal').onclick = () => this.$('modal').classList.remove('open');
  },

  init() {
    this.calendario(); this.resumen();
    this.$('cal').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.nav) { const m = this.estado.mes; this.estado.mes = new Date(m.getFullYear(), m.getMonth() + +b.dataset.nav, 1); this.calendario(); }
      else if (b.dataset.fecha) this.elegirFecha(b.dataset.fecha);
    });
    this.$('slots').addEventListener('click', ev => { const b = ev.target.closest('[data-hora]'); if (b && !b.disabled) this.elegirHora(+b.dataset.hora); });
    this.$('courtPick').addEventListener('click', ev => { const b = ev.target.closest('[data-cancha]'); if (b && !b.disabled) this.elegirCancha(+b.dataset.cancha); });
    this.$('btnConfirmar').onclick = () => { this.$('formReserva').hidden = false; this.$('btnConfirmar').hidden = true; this.$('formReserva').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    this.$('formReserva').addEventListener('submit', ev => { ev.preventDefault(); this.enviar(ev.target); });
    this.$('modal').addEventListener('click', ev => { if (ev.target.id === 'modal') ev.target.classList.remove('open'); });
  },
  /* Los botones "Reservar" de las canchas llaman a esto */
  preseleccionarCancha(id) { this.estado.preCancha = id; }
};