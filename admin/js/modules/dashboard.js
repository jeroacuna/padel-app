import { esc } from '../core/ui.js';

export async function render(el, { perfil }) {
  el.innerHTML = `
    <h1>Hola, ${esc(perfil.nombre)}</h1>
    <p class="sub">Panel de administración de ${esc(CONFIG.nombre)}</p>
    <section class="cards">
      <article class="card glass">
        <h2>Estado del sistema</h2>
        <ul class="estado">
          <li>Sesión<b class="ok">${esc(perfil.email)}</b></li>
          <li>Permisos<b class="ok">${perfil.rol === 'owner' ? 'Propietario' : 'Staff'} verificado en la base</b></li>
          <li>Base de datos<b id="dbEstado">Comprobando…</b></li>
        </ul>
      </article>
      <article class="card glass">
        <h2>Lo que viene</h2>
        <ul class="proximos">
          <li><b>Fase 2</b>Reservas y calendario</li><li><b>Fase 3</b>Canchas y clientes</li>
          <li><b>Fase 4</b>Pagos y estadísticas</li><li><b>Fase 5</b>Torneos, profesores y configuración</li>
        </ul>
      </article>
    </section>`;
  // Dato real, no simulado: cuántas canchas hay cargadas en la base
  const { count, error } = await db.from('canchas').select('id', { count: 'exact', head: true });
  const b = document.getElementById('dbEstado'); if (!b) return;
  b.className = error ? 'mal' : 'ok';
  b.textContent = error ? 'Sin respuesta de la base' : `Conectada · ${count} canchas cargadas`;
}