/* Compartido por index.html y torneos.html. Usa Supabase si está configurado, si no, datos locales. */
const fechaCorta = f => new Date(f + 'T00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const fechaLarga = f => new Date(f + 'T00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const TorneosAPI = {
  KEY: 'padelarena_inscripciones',
  _loc() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  async listar() {
    if (!db) return TORNEOS.map(t => ({ ...t, inscriptos: t.inscriptos + this._loc().filter(i => i.torneo_id === t.id).length }));
    const { data, error } = await db.from('torneos_info').select('*').order('fecha');
    if (error) throw error;
    return data;
  },
  async obtener(id) { return (await this.listar()).find(t => t.id === +id); },
  async inscribir(t, d) { // d: categoria, jugador1, jugador2, telefono, email
    if (!db) {
      const actual = (await this.obtener(t.id));
      if (actual.inscriptos >= actual.cupos) throw new Error('Los cupos de este torneo están completos.');
      const codigo = Date.now().toString(36).toUpperCase().slice(-6);
      const all = this._loc(); all.push({ ...d, torneo_id: t.id, codigo, estado: 'pendiente' });
      localStorage.setItem(this.KEY, JSON.stringify(all));
      return codigo;
    }
    const { data, error } = await db.rpc('inscribir', { p_torneo: t.id, p_categoria: d.categoria, p_j1: d.jugador1, p_j2: d.jugador2, p_tel: d.telefono, p_email: d.email });
    if (error) throw new Error(error.message);
    return data;
  }
};