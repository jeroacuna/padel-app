/* Acceso a datos del panel. La seguridad real está en la base: estas consultas solo devuelven algo si sos administrador. */
import { sumarDias } from './ui.js';

const lanzar = (error, status) => { // convierte el error de Supabase en un mensaje que se entienda
  if (!error) return;
  if (status === 401 || status === 403 || error.code === '42501') throw new Error('Sin permiso para leer o modificar estos datos. ¿Corriste la migración 003 en Supabase?');
  throw new Error(error.message || error.details || `Error inesperado${status ? ' (' + status + ')' : ''}`);
};

let _horario;
export async function horario() { // horario de atención desde la base (config_complejo)
  if (_horario) return _horario;
  const { data } = await db.from('config_complejo').select('clave, valor');
  const m = Object.fromEntries((data || []).map((r) => [r.clave, Number(r.valor)]));
  return (_horario = { ini: m.hora_inicio ?? 9, fin: m.hora_fin ?? 22 });
}

export async function canchas() {
  const { data, error } = await db.from('canchas').select('id, nombre, tipo, activa, precio').order('id'); lanzar(error); return data;
}

const limpiar = (t) => t.replace(/[,()%*\\]/g, ' ').trim(); // evita romper el filtro de búsqueda
export async function listarReservas({ desde, hasta, cancha, estado, q, orden = 'asc', pagina = 0, tam = 20 }) {
  let qb = db.from('reservas').select('*, canchas(nombre, tipo)', { count: 'exact' });
  if (desde) qb = qb.gte('fecha', desde);
  if (hasta) qb = qb.lte('fecha', hasta);
  if (cancha) qb = qb.eq('cancha_id', cancha);
  if (estado) qb = qb.eq('estado', estado);
  const t = limpiar(q || '');
  if (t) qb = qb.or(['nombre', 'apellido', 'telefono', 'email', 'codigo'].map((c) => `${c}.ilike.%${t}%`).join(','));
  const asc = orden === 'asc';
  const { data, count, error, status } = await qb.order('fecha', { ascending: asc }).order('hora', { ascending: asc }).range(pagina * tam, pagina * tam + tam - 1);
  lanzar(error, status); return { filas: data, total: count };
}

export async function obtenerReserva(id) {
  const { data, error, status } = await db.from('reservas').select('*, canchas(nombre, tipo)').eq('id', id).single(); lanzar(error, status); return data;
}
export async function historial(id) {
  const { data, error } = await db.from('auditoria').select('accion, detalle, quien, created_at').eq('tabla', 'reservas').eq('registro_id', id).order('created_at', { ascending: false });
  lanzar(error); return data;
}
export async function cambiarEstado(id, estado, nota) {
  const { error } = await db.rpc('admin_cambiar_estado', { p_id: id, p_estado: estado, p_nota: nota || null }); lanzar(error);
}
export async function reprogramar(id, fecha, hora, cancha) {
  const { error } = await db.rpc('admin_reprogramar', { p_id: id, p_fecha: fecha, p_hora: hora, p_cancha: cancha }); lanzar(error);
}
export async function ocupadosDia(fecha) { // función pública: devuelve solo hora y cancha de turnos no cancelados
  const { data, error } = await db.rpc('ocupados', { p_fecha: fecha }); lanzar(error); return data;
}

export async function resumenDashboard(hoy, hora) {
  const lunes = sumarDias(hoy, -((new Date(hoy + 'T12:00:00Z').getUTCDay() + 6) % 7)), domingo = sumarDias(lunes, 6);
  const contar = () => db.from('reservas').select('id', { count: 'exact', head: true }).neq('estado', 'cancelada');
  const [h, s, cs, prox, canc, hor] = await Promise.all([
    contar().eq('fecha', hoy),
    contar().gte('fecha', lunes).lte('fecha', domingo),
    canchas(),
    db.from('reservas').select('fecha, hora, nombre, apellido, estado, canchas(nombre)').neq('estado', 'cancelada')
      .or(`fecha.gt.${hoy},and(fecha.eq.${hoy},hora.gt.${hora})`).order('fecha').order('hora').limit(5),
    db.from('reservas').select('fecha, hora, nombre, apellido, updated_at, canchas(nombre)').eq('estado', 'cancelada').order('updated_at', { ascending: false }).limit(5),
    horario(),
  ]);
  [h, s, prox, canc].forEach((r) => lanzar(r.error, r.status));
  const activas = cs.filter((c) => c.activa).length, huecos = activas * (hor.fin - hor.ini + 1);
  return { hoy: h.count, semana: s.count, canchasActivas: activas, ocupacion: huecos ? Math.round((h.count / huecos) * 100) : 0, proximos: prox.data, cancelaciones: canc.data };
}

export async function reservasRango(desde, hasta) { // reservas no canceladas entre dos fechas (para el calendario)
  const { data, error, status } = await db.from('reservas').select('id, fecha, hora, cancha_id, estado, pago_estado, nombre, apellido')
    .neq('estado', 'cancelada').gte('fecha', desde).lte('fecha', hasta).order('fecha').order('hora');
  lanzar(error, status); return data;
}
export async function crearReservaManual(d) {
  const { data, error, status } = await db.rpc('admin_crear_reserva', {
    p_fecha: d.fecha, p_hora: d.hora, p_cancha: d.cancha, p_nombre: d.nombre, p_apellido: d.apellido, p_telefono: d.telefono,
    p_email: d.email, p_origen: d.origen, p_estado: d.estado, p_precio: d.precio, p_notas: d.notas });
  lanzar(error, status); return data;
}

/* ---------- Fase 3: canchas, bloqueos, clientes ---------- */
export async function guardarCancha(c) {
  const { data, error, status } = await db.rpc('admin_guardar_cancha', { p_id: c.id ?? null, p_nombre: c.nombre, p_tipo: c.tipo, p_precio: c.precio, p_activa: c.activa });
  lanzar(error, status); return data;
}
export async function reservasProximasPorCancha(hoy) { // { cancha_id: cantidad } de reservas no canceladas desde hoy
  const { data, error, status } = await db.from('reservas').select('cancha_id').neq('estado', 'cancelada').gte('fecha', hoy); lanzar(error, status);
  return data.reduce((m, r) => ((m[r.cancha_id] = (m[r.cancha_id] || 0) + 1), m), {});
}
export async function bloqueosVigentes(hoy) {
  const { data, error, status } = await db.from('bloqueos_cancha').select('*').gte('fecha_hasta', hoy).order('fecha_desde'); lanzar(error, status); return data;
}
export async function bloqueosRango(desde, hasta) {
  const { data, error, status } = await db.from('bloqueos_cancha').select('*').lte('fecha_desde', hasta).gte('fecha_hasta', desde); lanzar(error, status); return data;
}
export async function crearBloqueo(b) { // devuelve { id, afectadas }
  const { data, error, status } = await db.rpc('admin_crear_bloqueo', { p_cancha: b.cancha ?? null, p_desde: b.desde, p_hasta: b.hasta, p_hora_ini: b.horaIni, p_hora_fin: b.horaFin, p_tipo: b.tipo, p_motivo: b.motivo || null });
  lanzar(error, status); return data;
}
export async function quitarBloqueo(id) { const { error, status } = await db.rpc('admin_quitar_bloqueo', { p_id: id }); lanzar(error, status); }

export async function listarClientes({ q, orden = 'ultima', frecuentes = false, pagina = 0, tam = 20 }) {
  let qb = db.from('clientes_resumen').select('*', { count: 'exact' });
  const t = limpiar(q || '');
  if (t) qb = qb.or(['nombre', 'apellido', 'telefono', 'email'].map((c) => `${c}.ilike.%${t}%`).join(','));
  if (frecuentes) qb = qb.gte('reservas_total', 5);
  if (orden === 'nombre') qb = qb.order('nombre');
  else if (orden === 'reservas') qb = qb.order('reservas_total', { ascending: false });
  else if (orden === 'nuevos') qb = qb.order('created_at', { ascending: false });
  else qb = qb.order('ultima_reserva', { ascending: false, nullsFirst: false });
  const { data, count, error, status } = await qb.range(pagina * tam, pagina * tam + tam - 1);
  lanzar(error, status); return { filas: data, total: count };
}
export async function obtenerCliente(id) {
  const { data, error, status } = await db.from('clientes_resumen').select('*').eq('id', id).single(); lanzar(error, status); return data;
}
export async function reservasDeCliente(id) {
  const { data, error, status } = await db.from('reservas').select('id, fecha, hora, estado, pago_estado, precio, canchas(nombre)').eq('cliente_id', id).order('fecha', { ascending: false }).order('hora', { ascending: false }).limit(30);
  lanzar(error, status); return data;
}
export async function guardarCliente(c) {
  const { error, status } = await db.rpc('admin_guardar_cliente', { p_id: c.id, p_nombre: c.nombre, p_apellido: c.apellido, p_telefono: c.telefono, p_email: c.email, p_notas: c.notas });
  lanzar(error, status);
}

/* ---------- Fase 4: pagos y estadísticas ---------- */
export async function pagosDeReserva(id) {
  const { data, error, status } = await db.from('pagos').select('id, tipo, monto, metodo, referencia, quien, anulado, anulado_motivo, created_at').eq('reserva_id', id).order('created_at');
  lanzar(error, status); return data;
}
export async function registrarPago(d) { // devuelve { cobrado, saldo, pago_estado }
  const { data, error, status } = await db.rpc('admin_registrar_pago', { p_reserva: d.reserva, p_monto: d.monto, p_metodo: d.metodo, p_tipo: d.tipo, p_referencia: d.referencia || null, p_nota: d.nota || null });
  lanzar(error, status); return data;
}
export async function anularPago(id, motivo) { const { error, status } = await db.rpc('admin_anular_pago', { p_pago: id, p_motivo: motivo }); lanzar(error, status); }
export async function resumenFinanzas(desde, hasta) { const { data, error, status } = await db.rpc('admin_resumen_finanzas', { p_desde: desde, p_hasta: hasta }); lanzar(error, status); return data; }
export async function estadisticas(desde, hasta) { const { data, error, status } = await db.rpc('admin_estadisticas', { p_desde: desde, p_hasta: hasta }); lanzar(error, status); return data; }
export async function movimientos({ desde, hasta, pagina = 0, tam = 20 }) {
  const { data, count, error, status } = await db.from('pagos').select('id, tipo, monto, metodo, referencia, fecha, anulado, quien, reservas(codigo, nombre, apellido)', { count: 'exact' })
    .gte('fecha', desde).lte('fecha', hasta).order('created_at', { ascending: false }).range(pagina * tam, pagina * tam + tam - 1);
  lanzar(error, status); return { filas: data, total: count };
}
export async function impagas(hoy, pagina = 0, tam = 20) { // reservas de hoy o anteriores con saldo pendiente
  const { data, count, error, status } = await db.from('reservas_saldo').select('*', { count: 'exact' }).neq('estado', 'cancelada').gt('saldo', 0).lte('fecha', hoy)
    .order('fecha').order('hora').range(pagina * tam, pagina * tam + tam - 1);
  lanzar(error, status); return { filas: data, total: count };
}
export async function resumenFinancieroDashboard(hoy, desdeMes, hastaMes) {
  const [dia, mes, imp] = await Promise.all([resumenFinanzas(hoy, hoy), resumenFinanzas(desdeMes, hastaMes), impagas(hoy, 0, 1)]);
  return { dia, mes, impagas: imp.total };
}

/* ---------- Fase 5: torneos, profesores, avisos y configuración ---------- */
export async function listarTorneos() {
  const { data, error, status } = await db.from('torneos').select('*').order('fecha', { ascending: false }); lanzar(error, status); return data;
}
export async function resumenInscripciones() { // { torneo_id: { activas, pagadas } }
  const { data, error, status } = await db.from('inscripciones').select('torneo_id, estado'); lanzar(error, status);
  return data.reduce((m, i) => {
    const x = (m[i.torneo_id] = m[i.torneo_id] || { activas: 0, pagadas: 0 });
    if (i.estado !== 'cancelada') x.activas++;
    if (i.estado === 'pagada') x.pagadas++;
    return m;
  }, {});
}
export async function inscripcionesTorneo(id) {
  const { data, error, status } = await db.from('inscripciones').select('id, codigo, categoria, jugador1, jugador2, telefono, email, estado, created_at').eq('torneo_id', id).order('created_at');
  lanzar(error, status); return data;
}
export async function guardarTorneo(t) { // devuelve el id del torneo
  const { data, error, status } = await db.rpc('admin_guardar_torneo', {
    p_id: t.id ?? null, p_titulo: t.titulo, p_fecha: t.fecha, p_hora: t.hora, p_lugar: t.lugar, p_categorias: t.categorias, p_precio: t.precio, p_cupos: t.cupos,
    p_descripcion: t.descripcion || null, p_formato: t.formato || null, p_premios: t.premios, p_reglamento: t.reglamento, p_imagen: t.imagen || null,
    p_estado: t.estado, p_publicado: t.publicado });
  lanzar(error, status); return data;
}
export async function estadoInscripcion(id, estado) {
  const { error, status } = await db.rpc('admin_estado_inscripcion', { p_id: id, p_estado: estado }); lanzar(error, status);
}

export async function listarProfesores() {
  const { data, error, status } = await db.from('profesores').select('*').order('id'); lanzar(error, status); return data;
}
export async function guardarProfesor(p) { // devuelve { id, afectadas }
  const { data, error, status } = await db.rpc('admin_guardar_profesor', {
    p_id: p.id ?? null, p_nombre: p.nombre, p_especialidad: p.especialidad, p_bio: p.bio || null, p_precio: p.precio, p_duracion: p.duracion,
    p_foto: p.foto || null, p_horarios: p.horarios, p_etiquetas: p.etiquetas, p_activo: p.activo });
  lanzar(error, status); return data;
}
export async function clasesProximas(hoy) {
  const { data, error, status } = await db.from('clases').select('id, codigo, fecha, hora, nombre, telefono, email, estado, profesores(nombre)')
    .gte('fecha', hoy).order('fecha').order('hora').limit(200);
  lanzar(error, status); return data;
}
export async function estadoClase(id, estado) {
  const { error, status } = await db.rpc('admin_estado_clase', { p_id: id, p_estado: estado }); lanzar(error, status);
}

export async function listarAvisos() {
  const { data, error, status } = await db.from('avisos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }); lanzar(error, status); return data;
}
export async function guardarAviso(a) {
  const { data, error, status } = await db.rpc('admin_guardar_aviso', { p_id: a.id ?? null, p_tipo: a.tipo, p_titulo: a.titulo, p_texto: a.texto, p_enlace: a.enlace || null, p_activo: a.activo });
  lanzar(error, status); return data;
}
export async function guardarConfig(ini, fin) { // devuelve { afectadas }
  const { data, error, status } = await db.rpc('admin_guardar_config', { p_hora_ini: ini, p_hora_fin: fin }); lanzar(error, status);
  _horario = undefined; // se borra la copia guardada para que el panel lea el horario nuevo
  return data;
}