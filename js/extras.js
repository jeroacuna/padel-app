/* Se carga en todas las páginas: botón flotante de WhatsApp + barra de avisos urgentes. */
const AvisosAPI = {
  async listar() { // solo avisos activos, los más nuevos primero
    exigirDb();
    if (DEMO) return AVISOS.filter(a => a.activo).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const { data, error } = await db.from('avisos').select('*').eq('activo', true).order('fecha', { ascending: false });
    if (error) throw error;
    return data;
  }
};

(() => {
  // Botón de WhatsApp (colores de la web)
  const a = document.createElement('a');
  a.className = 'wsp'; a.target = '_blank'; a.rel = 'noopener';
  a.setAttribute('aria-label', 'Escribinos por WhatsApp');
  a.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent('Hola! Quiero consultar por una cancha.')}`;
  a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9 9.5c.5 2.200 2.300 4 4.500 4.500l1.500-1.200-2-1-.8.800c-.8-.3-1.800-1.300-2.100-2.100l.8-.8-1-2Z"/></svg>';
  document.body.append(a);

  // Barra de aviso urgente (ej. cierre por lluvia): solo si hay uno activo
  AvisosAPI.listar().then(as => {
    const u = as.find(x => x.tipo === 'urgente'); if (!u) return;
    const bar = document.createElement('div');
    bar.className = 'aviso-bar'; bar.setAttribute('role', 'alert');
    bar.textContent = `⚠ ${u.titulo}. ${u.texto}`;
    document.body.prepend(bar); document.body.classList.add('has-aviso');
  }).catch(() => {});
})();