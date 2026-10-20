/* Conexión con Supabase y modo de la app.
   - PRODUCCIÓN (por defecto): usa Supabase. Si no hay conexión, la web avisa y NO guarda nada en el navegador.
   - DEMO (solo a propósito): datos locales de ejemplo; nunca toca la base real.
     Se activa con CONFIG.modo = 'demo' o entrando con ?demo=1 (se apaga con ?demo=0). */
const SUPABASE_URL = 'https://dibxatuqcqzacoxcbmli.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6rbeSiMalf4jcZM_jRKA0Q_ySyEqDnB'; // clave pública (publishable). NUNCA pegar acá la service_role / secret.

const DEMO = (() => {
  try {
    const q = new URLSearchParams(location.search).get('demo');
    if (q === '1') sessionStorage.setItem('padelarena_demo', '1');
    if (q === '0') sessionStorage.removeItem('padelarena_demo');
    return CONFIG.modo === 'demo' || sessionStorage.getItem('padelarena_demo') === '1';
  } catch { return CONFIG.modo === 'demo'; }
})();

const db = (!DEMO && SUPABASE_URL && SUPABASE_KEY && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const SIN_CONEXION = !DEMO && !db; // p. ej. falló la CDN de supabase-js

function exigirDb() { // cada llamada a datos pasa por acá: sin conexión se corta, no se simula
  if (SIN_CONEXION) throw new Error('No hay conexión con el servidor. Probá de nuevo en un momento o escribinos por WhatsApp.');
}

document.addEventListener('DOMContentLoaded', () => { // cartel visible cuando NO estamos en producción normal
  if (!DEMO && !SIN_CONEXION) return;
  const b = document.createElement('div');
  b.className = DEMO ? 'modo-demo' : 'modo-error';
  b.textContent = DEMO ? 'MODO DEMO · los datos de ejemplo se guardan solo en este navegador' : 'Sin conexión con el servidor · las reservas no están disponibles por ahora';
  document.body.append(b);
});