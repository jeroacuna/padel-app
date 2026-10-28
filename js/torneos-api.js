/* Compartido por index.html y torneos.html. Usa Supabase si está configurado, si no, datos locales. */
const fechaCorta = f => new Date(f + 'T00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const fechaLarga = f => new Date(f + 'T00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const TorneosAPI = {
  KEY: 'padelarena_inscripciones',
  _loc() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  async listar() {
    exigirDb();
    if (DEMO) return TORNEOS.map(t => ({ ...t, inscriptos: t.inscriptos + this._loc().filter(i => i.torneo_id === t.id).length }));
    // La vista solo trae torneos publicados; los finalizados no se muestran para que no aparezcan como "próximo torneo"
    const { data, error } = await db.from('torneos_info').select('*').neq('estado', 'finalizado').order('fecha');
    if (error) throw error;
    return data;
  },
  async obtener(id) { return (await this.listar()).find(t => t.id === +id); },
  async inscribir(t, d) { // d: categoria, jugador1, jugador2, telefono, email
    exigirDb();
    if (DEMO) {
      const actual = (await this.obtener(t.id));
      if (actual.inscriptos >= actual.cupos) throw new Error('Los cupos de este torneo están completos.');
      const codigo = Date.now().toString(36).toUpperCase().slice(-6);
      const all = this._loc(); all.push({ ...d, torneo_id: t.id, codigo, estado: 'pendiente' });
      localStorage.setItem(this.KEY, JSON.stringify(all));
      return codigo;
    }
    const { data, error } = await db.rpc('inscribir', { p_torneo: t.id, p_categoria: d.categoria, p_j1: d.jugador1, p_j2: d.jugador2, p_tel: d.telefono, p_email: d.email });
    if (error) throw new Error(error.message);
    db.functions.invoke('enviar-email', { body: { tipo: 'inscripcion', codigo: data } }).catch(() => {}); // aviso por email; no frena la inscripción si falla
    return data;
  }
};

/* Ayudas visuales compartidas */
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const badge = f => { const d = new Date(f + 'T00:00'); return `<div class="date-badge"><b>${d.getDate()}</b><span>${MESES[d.getMonth()]}</span></div>`; };
const portada = t => `background-image:linear-gradient(180deg,rgba(7,18,46,.15),rgba(7,18,46,.88)),${t.imagen ? `url('${t.imagen}'),` : ''}linear-gradient(135deg,#0b1f4d,#2563ff 60%,#16a34a)`;
function iniciarCuentas() { // contador regresivo para todos los .countdown de la página
  const pintar = () => document.querySelectorAll('.countdown').forEach(el => {
    const ms = new Date(`${el.dataset.fecha}T${el.dataset.hora || '00:00'}`) - new Date();
    if (ms <= 0) { el.textContent = '¡Ya empezó!'; return; }
    const v = [[Math.floor(ms / 864e5), 'días'], [Math.floor(ms % 864e5 / 36e5), 'hs'], [Math.floor(ms % 36e5 / 6e4), 'min'], [Math.floor(ms % 6e4 / 1e3), 'seg']];
    el.innerHTML = v.map(([n, l]) => `<span><b>${String(n).padStart(2, '0')}</b>${l}</span>`).join('');
  });
  pintar(); clearInterval(window._cuenta); window._cuenta = setInterval(pintar, 1000);
}