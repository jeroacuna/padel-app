const $ = s => document.querySelector(s);
const PH = 'linear-gradient(135deg,#0b1f4d,#1d4ed8 55%,#84cc16)'; // degradé si falta la foto
const bg = url => `background-image:url('${url}'),${PH}`;
const card = (ico, t, p) => `<article class="card reveal glass"><i data-lucide="${ico}"></i><h3>${t}</h3><p>${p}</p></article>`;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Render desde config ---------- */
function render() {
  document.querySelectorAll('[data-cfg]').forEach(el => el.textContent = CONFIG[el.dataset.cfg]);
  $('#year').textContent = new Date().getFullYear();
  $('#heroBg').style.cssText = bg(IMAGES.hero);
  $('#amenidades').innerHTML = AMENIDADES.map(a => card(...a)).join('');
  $('#serviciosGrid').innerHTML = SERVICIOS.map(a => card(...a)).join('');
  $('#canchasGrid').innerHTML = CANCHAS.map(c => `
    <article class="court reveal">
      <div class="court-img" style="${bg(c.img)}"></div>
      <div class="court-body"><h3>${c.nombre}</h3><span class="chip">${c.tipo}</span>
        <ul>${c.tags.map(t => `<li>${t}</li>`).join('')}</ul>
        <p class="price">Desde ${CONFIG.moneda}${c.precio.toLocaleString('es-AR')} <small>/ turno</small></p>
        <a href="#reservas" class="btn btn-lime magnetic">Reservar</a></div>
    </article>`).join('');
  $('#galleryGrid').innerHTML = IMAGES.galeria.map((u, i) => `<button class="g-item g${i % 6} reveal" data-img="${u}" style="${bg(u)}" aria-label="Ver foto ${i + 1}"></button>`).join('');
  TorneosAPI.listar().then(ts => {
    $('#eventosGrid').innerHTML = ts.slice(0, 3).map((e, i) => `
      <article class="event reveal in ${i ? '' : 'big'}"><small>${fechaCorta(e.fecha)}</small><h3>${e.titulo}</h3><p>${e.categorias.join(' / ')}</p>
      <a href="torneos.html?id=${e.id}" class="btn ${i ? 'btn-ghost' : 'btn-lime'}">Ver evento</a></article>`).join('');
  }).catch(() => {});
  $('#infoList').innerHTML = [['map-pin', CONFIG.direccion], ['clock', CONFIG.horarios], ['phone', CONFIG.telefono], ['message-circle', 'WhatsApp: ' + CONFIG.telefono]]
    .map(([i, t]) => `<li><i data-lucide="${i}"></i>${t}</li>`).join('');
  const q = encodeURIComponent(CONFIG.direccion || CONFIG.mapsQuery);
  $('#btnMaps').href = `https://www.google.com/maps/search/?api=1&query=${q}`;
  $('#btnWsp').href = $('#fWsp').href = `https://wa.me/${CONFIG.whatsapp}`;
  $('#fIg').href = CONFIG.instagram;
  $('#mapa').src = `https://maps.google.com/maps?q=${encodeURIComponent(CONFIG.mapsQuery)}&output=embed`;
  $('#slider').innerHTML = TESTIMONIOS.map((t, i) => `<figure class="slide ${i ? '' : 'on'}"><div class="stars">★★★★★</div><blockquote>“${t.texto}”</blockquote><figcaption><b>${t.nombre}</b> · ${t.rol}</figcaption></figure>`).join('');
  $('#sliderDots').innerHTML = TESTIMONIOS.map((_, i) => `<button aria-label="Testimonio ${i + 1}" class="${i ? '' : 'on'}"></button>`).join('');
  $('#particles').innerHTML = Array.from({ length: 22 }, () => `<i style="left:${Math.random() * 100}%;animation-delay:${Math.random() * 8}s;animation-duration:${8 + Math.random() * 8}s"></i>`).join('');
}

/* ---------- Efectos ---------- */
function efectos() {
  const nav = $('#navbar'), top = $('#toTop'), hero = $('#heroBg');
  addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', scrollY > 40);
    top.classList.toggle('show', scrollY > 700);
    if (!reduce && scrollY < innerHeight) hero.style.transform = `translateY(${scrollY * 0.25}px) scale(1.1)`;
  }, { passive: true });
  top.onclick = () => scrollTo({ top: 0, behavior: 'smooth' });
  $('#burger').onclick = () => nav.classList.toggle('open');
  $('#menu').onclick = $('#navbar .btn').onclick = () => nav.classList.remove('open');

  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in'); io.unobserve(e.target);
    e.target.querySelectorAll?.('[data-count]').forEach(contar);
  }), { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });

  // Cursor y botones magnéticos (solo con mouse)
  if (matchMedia('(hover:hover) and (pointer:fine)').matches && !reduce) {
    const cur = $('#cursor'); document.body.classList.add('has-cursor');
    addEventListener('mousemove', e => { cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; });
    document.addEventListener('mouseover', e => cur.classList.toggle('big', !!e.target.closest('a,button')));
    document.querySelectorAll('.magnetic').forEach(b => {
      b.addEventListener('mousemove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .2}px,${(e.clientY - r.top - r.height / 2) * .3}px)`; });
      b.addEventListener('mouseleave', () => b.style.transform = '');
    });
  }
}
function contar(el) {
  const fin = +el.dataset.count, t0 = performance.now();
  (function paso(t) { const p = Math.min((t - t0) / 1400, 1); el.textContent = Math.round(fin * (1 - Math.pow(1 - p, 3))).toLocaleString('es-AR'); if (p < 1) requestAnimationFrame(paso); })(t0);
}

/* ---------- Lightbox, slider, formulario ---------- */
function interacciones() {
  const lb = $('#lightbox');
  $('#galleryGrid').addEventListener('click', e => { const b = e.target.closest('[data-img]'); if (!b) return; lb.querySelector('.lb-img').style.cssText = bg(b.dataset.img); lb.classList.add('open'); });
  lb.onclick = () => lb.classList.remove('open');
  addEventListener('keydown', e => { if (e.key === 'Escape') { lb.classList.remove('open'); $('#modal').classList.remove('open'); } });

  let i = 0; const slides = [...document.querySelectorAll('.slide')], dots = [...$('#sliderDots').children];
  const ir = n => { i = (n + slides.length) % slides.length; slides.forEach((s, k) => s.classList.toggle('on', k === i)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
  dots.forEach((d, k) => d.onclick = () => ir(k));
  setInterval(() => ir(i + 1), 6000);

  $('#formContacto').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, txt = `Hola! Soy ${f.nombre.value} (${f.email.value}).\n${f.mensaje.value}`;
    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
    f.reset();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  render(); lucide.createIcons(); efectos(); interacciones(); Reserva.init();
});
addEventListener('load', () => setTimeout(() => $('#loader').classList.add('done'), 700));