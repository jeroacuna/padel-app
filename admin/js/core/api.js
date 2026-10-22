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
  const { data, error } = await db.from('canchas').select('id, nombre, tipo, activa').order('id'); lanzar(error); return data;
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