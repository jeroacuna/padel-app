/* Sincroniza las canchas de la web pública con la base: así el nombre, el precio y si una cancha está
   activa salen de lo que el administrador cargó en el panel (y no de lo escrito en config.js).
   En modo demo no hace nada. Las fotos y características siguen viniendo de config.js. */
async function cargarCanchasDB() {
  if (DEMO || !db) return;
  const { data, error } = await db.from('canchas').select('id, nombre, tipo, precio, activa').order('id');
  if (error || !data || !data.length) return; // si falla, queda lo de config.js
  const base = CANCHAS.slice();
  CANCHAS.length = 0;
  data.filter((c) => c.activa).forEach((c) => {
    const previa = base.find((x) => x.id === c.id) || { tags: [], img: '' };
    CANCHAS.push({ ...previa, id: c.id, nombre: c.nombre, tipo: c.tipo, precio: c.precio });
  });
}