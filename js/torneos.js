const $ = s => document.querySelector(s);
const money = n => CONFIG.moneda + n.toLocaleString('es-AR');
const app = $('#app');

function lista(ts) {
  document.title = 'Torneos y eventos | Padel Arena Paraná';
  app.innerHTML = `<h2>Torneos y eventos</h2><div class="t-list">${ts.map(t => {
    const libres = t.cupos - t.inscriptos;
    return `<article class="t-card glass"><small>${fechaCorta(t.fecha)} · ${t.hora} hs</small><h3>${t.titulo}</h3>
      <p>${t.categorias.join(' / ')}</p>
      <p><b>${money(t.precio)}</b> por pareja</p>
      <div class="bar"><i style="width:${Math.min(100, t.inscriptos / t.cupos * 100)}%"></i></div>
      <p>${libres > 0 ? `Quedan ${libres} de ${t.cupos} cupos` : 'Cupos completos'}</p>
      <a class="btn btn-lime" href="torneos.html?id=${t.id}">Ver detalle e inscribirme</a></article>`;
  }).join('')}</div>`;
}

function detalle(t) {
  document.title = `${t.titulo} | Padel Arena Paraná`;
  const libres = t.cupos - t.inscriptos, lleno = libres <= 0, pos = ['1°', '2°', '3°'];
  app.innerHTML = `<a class="back" href="torneos.html">← Todos los torneos</a>
  <div class="t-detail"><div>
    <h2>${t.titulo}</h2><p>${t.descripcion || ''}</p>
    <div class="facts">
      <div><small>Fecha</small><b>${fechaLarga(t.fecha)}</b></div><div><small>Hora</small><b>${t.hora} hs</b></div>
      <div><small>Lugar</small><b>${t.lugar}</b></div><div><small>Categorías</small><b>${t.categorias.join(' / ')}</b></div>
      <div><small>Inscripción</small><b>${money(t.precio)} por pareja</b></div>
      <div><small>Cupos</small><b>${lleno ? 'Completos' : `${libres} de ${t.cupos} libres`}</b><div class="bar"><i style="width:${Math.min(100, t.inscriptos / t.cupos * 100)}%"></i></div></div>
    </div>
    <h3>Formato</h3><p>${t.formato || ''}</p>
    <h3>Premios</h3><div class="podio">${(t.premios || []).map((p, i) => `<div><b>${pos[i] || ''}</b>${p}</div>`).join('')}</div>
    <h3>Reglamento</h3><ul>${(t.reglamento || []).map(r => `<li>${r}</li>`).join('')}</ul>
  </div>
  <form class="t-form glass" id="formInsc"><h3>Inscribite</h3>
    <select name="categoria" required><option value="">Categoría</option>${t.categorias.map(c => `<option>${c}</option>`).join('')}</select>
    <input name="jugador1" placeholder="Jugador 1 (nombre y apellido)" required>
    <input name="jugador2" placeholder="Jugador 2 (nombre y apellido)" required>
    <input name="telefono" type="tel" placeholder="Teléfono de contacto" required>
    <input name="email" type="email" placeholder="Email" required>
    <button class="btn btn-lime" type="submit" ${lleno ? 'disabled' : ''}>${lleno ? 'Cupos completos' : `Inscribirme · ${money(t.precio)}`}</button>
  </form></div>`;
  $('#formInsc').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Inscribiendo…';
    try {
      const codigo = await TorneosAPI.inscribir(t, Object.fromEntries(new FormData(f)));
      confirmar(t, codigo, f.jugador1.value, f.jugador2.value);
    } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = `Inscribirme · ${money(t.precio)}`; }
  });
}

function confirmar(t, codigo, j1, j2) {
  const wsp = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(`Hola! Pago de inscripción ${t.titulo}. Código ${codigo}. Pareja: ${j1} y ${j2}.`)}`;
  $('#modalCard').innerHTML = `<i data-lucide="trophy" class="ok-ico"></i><h3>¡Inscripción recibida!</h3>
    <p>${j1} y ${j2}, ya tienen lugar en ${t.titulo}.</p>
    <dl><dt>Código</dt><dd>${codigo}</dd><dt>Fecha</dt><dd>${fechaLarga(t.fecha)}</dd><dt>Estado</dt><dd>Pendiente de pago</dd></dl>
    <div class="pay"><b>Para confirmar, transferí ${money(t.precio)}</b><br>Alias: ${CONFIG.pagoAlias}<br>Titular: ${CONFIG.pagoTitular}<br>Después mandanos el comprobante por WhatsApp.</div>
    <a class="btn btn-lime" href="${wsp}" target="_blank" rel="noopener">Enviar comprobante</a>
    <button class="btn btn-ghost" id="cerrarModal" style="margin-top:.6rem">Cerrar</button>`;
  $('#modal').classList.add('open'); lucide.createIcons();
  $('#cerrarModal').onclick = () => { $('#modal').classList.remove('open'); iniciar(); };
}

async function iniciar() {
  const id = new URLSearchParams(location.search).get('id');
  try {
    if (id) {
      const t = await TorneosAPI.obtener(id);
      return t ? detalle(t) : (app.innerHTML = '<p>No encontramos ese torneo. <a class="back" href="torneos.html">Ver todos</a></p>');
    }
    lista(await TorneosAPI.listar());
  } catch (err) { console.error(err); app.innerHTML = '<p>No se pudieron cargar los torneos. Intentá de nuevo en un rato.</p>'; }
}

document.querySelectorAll('[data-cfg]').forEach(el => el.textContent = CONFIG[el.dataset.cfg]);
$('#year').textContent = new Date().getFullYear();
$('#burger').onclick = () => $('#navbar').classList.toggle('open');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.classList.remove('open'); });
lucide.createIcons(); iniciar();