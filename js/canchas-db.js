/* Sincroniza la web pública con la base: nombre, precio y si una cancha está activa, y también el horario de
   atención, salen de lo que el administrador cargó en el panel (y no de lo escrito en config.js).
   En modo demo no hace nada. Las fotos y características siguen viniendo de config.js. */
async function cargarCanchasDB() {
  if (DEMO || !db) return;
  const [cs, cfg] = await Promise.all([
    db.from('canchas').select('id, nombre, tipo, precio, activa').order('id'),
    db.from('config_complejo').select('clave, valor'),
  ]);

  // Horario de atención (config_complejo). Si falla, queda lo de config.js
  if (!cfg.error && cfg.data) {
    const m = Object.fromEntries(cfg.data.map((r) => [r.clave, Number(r.valor)]));
    if (Number.isInteger(m.hora_inicio) && Number.isInteger(m.hora_fin) && m.hora_fin >= m.hora_inicio) {
      const hh = (h) => `${String(h % 24).padStart(2, '0')}:00`;
      CONFIG.horaInicio = m.hora_inicio;
      CONFIG.horaFin = m.hora_fin;
      CONFIG.horarios = `Todos los días de ${hh(m.hora_inicio)} a ${hh(m.hora_fin + 1)}`; // el último turno dura 1 hora
    }
  }

  // Canchas
  const { data, error } = cs;
  if (error || !data || !data.length) return; // si falla, queda lo de config.js
  const base = CANCHAS.slice();
  CANCHAS.length = 0;
  data.filter((c) => c.activa).forEach((c) => {
    const previa = base.find((x) => x.id === c.id) || { tags: [], img: '' };
    CANCHAS.push({ ...previa, id: c.id, nombre: c.nombre, tipo: c.tipo, precio: c.precio });
  });
}