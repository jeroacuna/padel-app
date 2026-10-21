/* Autenticación del panel. Usa el cliente `db` de js/supabase.js (clave pública).
   La seguridad real está en la base (RLS + es_admin()); esto solo decide qué pantalla mostrar. */
export const disponible = () => !DEMO && !!db; // el panel nunca funciona en modo demo ni sin conexión

export async function obtenerPerfil() {
  const { data: { user } } = await db.auth.getUser(); // consulta al servidor: valida que la sesión sea real
  if (!user) return null;
  const { data: esAdmin, error } = await db.rpc('es_admin');
  if (error) throw new Error('No se pudo verificar tu permiso. ¿Corriste la migración 002 en Supabase?');
  if (!esAdmin) return null;
  const { data } = await db.from('perfiles_admin').select('nombre, rol').eq('user_id', user.id).maybeSingle();
  return { email: user.email, nombre: (data && data.nombre) || user.email, rol: (data && data.rol) || 'staff' };
}

export async function iniciarSesion(email, password) {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Email o contraseña incorrectos.'); // mismo mensaje siempre: no revela si el email existe
  const perfil = await obtenerPerfil();
  if (!perfil) { await db.auth.signOut(); throw new Error('Tu usuario no tiene permisos de administración.'); }
  return perfil;
}

export async function cerrarSesion() {
  await db.auth.signOut();
  location.replace('/admin/index.html');
}