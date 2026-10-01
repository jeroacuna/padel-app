/* Animaciones extra. Se desactivan solas si el usuario pidió "reducir movimiento" y en pantallas táctiles. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

  // 1) Título del hero, palabra por palabra
  const h1 = document.querySelector('.hero h1');
  if (h1) {
    let i = 0;
    [...h1.childNodes].filter(n => n.nodeType === 3).forEach(n => {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(t => {
        if (!t.trim()) return frag.append(' ');
        const w = document.createElement('span'), s = document.createElement('span');
        w.className = 'w'; s.textContent = t; s.style.animationDelay = (0.9 + i++ * 0.12) + 's';
        w.append(s); frag.append(w);
      });
      n.replaceWith(frag);
    });
  }
  if (!fine) return;

  // 2) El hero reacciona al mouse (fondo, líneas y partículas se mueven distinto)
  const hero = document.querySelector('.hero');
  if (hero) {
    hero.addEventListener('mousemove', e => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width - .5) * 2);
      hero.style.setProperty('--my', ((e.clientY - r.top) / r.height - .5) * 2);
    });
    hero.addEventListener('mouseleave', () => { hero.style.setProperty('--mx', 0); hero.style.setProperty('--my', 0); });
  }

  // 3) Inclinación 3D en cards de canchas, profes y torneos (delegado: funciona con cards creadas después)
  const SEL = '.court,.prof-card,.t-card';
  document.addEventListener('mousemove', e => {
    const el = e.target.closest && e.target.closest(SEL); if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    el.classList.add('tilting');
    el.style.transform = `perspective(800px) rotateX(${-y * 10}deg) rotateY(${x * 12}deg) translateY(-6px)`;
  });
  document.addEventListener('mouseout', e => {
    const el = e.target.closest && e.target.closest(SEL);
    if (el && !el.contains(e.relatedTarget)) { el.classList.remove('tilting'); el.style.transform = ''; }
  });

  // 4) Pelotita que sigue al cursor con retraso y rebota al frenar
  const ball = document.createElement('div');
  ball.className = 'ball'; ball.innerHTML = '<i></i>'; document.body.append(ball);
  let tx = 0, ty = 0, bx = 0, by = 0, moving = false, shown = false;
  addEventListener('mousemove', e => {
    tx = e.clientX; ty = e.clientY;
    if (!shown) { shown = true; bx = tx; by = ty; ball.classList.add('on'); }
  });
  document.documentElement.addEventListener('mouseleave', () => { shown = false; ball.classList.remove('on'); });
  (function loop() {
    const dx = tx - bx, dy = ty - by, v = Math.hypot(dx, dy);
    bx += dx * .14; by += dy * .14;
    ball.style.transform = `translate(${bx}px,${by}px)`;
    if (v > 40) moving = true;
    if (v < 1.2 && moving) { moving = false; ball.classList.remove('bounce'); void ball.offsetWidth; ball.classList.add('bounce'); }
    requestAnimationFrame(loop);
  })();
})();