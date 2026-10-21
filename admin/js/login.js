import { disponible, iniciarSesion, obtenerPerfil } from './core/auth.js';

const form = document.getElementById('formLogin'), msg = document.getElementById('msg'), btn = form.querySelector('button[type=submit]');
const decir = (t) => { msg.textContent = t; msg.className = t ? 'error' : ''; };

if (!disponible()) {
  decir('El panel no está disponible: no hay conexión con el servidor o la web está en modo demo.');
  btn.disabled = true;
} else {
  obtenerPerfil().then((p) => { if (p) location.replace('app.html'); }).catch(() => {}); // si ya hay sesión, entra directo
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.email.value.trim() || !form.password.value) return decir('Completá tu email y tu contraseña.');
  btn.disabled = true; btn.textContent = 'Ingresando…'; decir('');
  try {
    await iniciarSesion(form.email.value.trim(), form.password.value);
    location.replace('app.html');
  } catch (err) {
    decir(err.message); btn.disabled = false; btn.textContent = 'Ingresar';
  }
});

document.getElementById('verPass').addEventListener('click', (e) => {
  const p = document.getElementById('password'), ver = p.type === 'password';
  p.type = ver ? 'text' : 'password'; e.target.textContent = ver ? 'Ocultar' : 'Ver';
});