/* Usa Supabase si está configurado; si no, datos locales (config.js) y localStorage. */
const ProfesoresAPI = {
  KEY: 'padelarena_clases',
  _loc() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  async listar() {
    if (!db) return PROFESORES;
    const { data, error } = await db.from('profesores').select('*').order('id');
    if (error) throw error;
    return data;
  },
  async obtener(id) { return (await this.listar()).find(p => p.id === +id); },
  async ocupadas(profId, fecha) { // devuelve las horas ya tomadas
    if (!db) return this._loc().filter(c => c.profesor_id === profId && c.fecha === fecha).map(c => c.hora);
    const { data, error } = await db.rpc('clases_ocupadas', { p_prof: profId, p_fecha: fecha });
    if (error) throw error;
    return data.map(r => r.hora);
  },
  async reservar(p, d) { // d: fecha, hora, nombre, telefono, email
    if (!db) {
      const all = this._loc();
      if (all.some(c => c.profesor_id === p.id && c.fecha === d.fecha && c.hora === d.hora)) throw new Error('Ese horario ya fue reservado. Elegí otro.');
      const codigo = Date.now().toString(36).toUpperCase().slice(-6);
      all.push({ ...d, profesor_id: p.id, codigo });
      localStorage.setItem(this.KEY, JSON.stringify(all));
      return codigo;
    }
    const { data, error } = await db.rpc('reservar_clase', { p_prof: p.id, p_fecha: d.fecha, p_hora: d.hora, p_nombre: d.nombre, p_telefono: d.telefono, p_email: d.email });
    if (error) throw new Error(error.message);
    db.functions.invoke('enviar-email', { body: { codigo: data } }); // aviso por email; no frena la reserva si falla
    return data;
  }
};