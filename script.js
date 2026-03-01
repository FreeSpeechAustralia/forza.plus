const canvas = document.getElementById('nebula-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.header-nav');
const revealEls = document.querySelectorAll('.reveal');
const counter = document.querySelector('.counter');

const stars = Array.from({ length: 70 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.7 + 0.4,
  o: Math.random() * 0.6 + 0.2,
  v: Math.random() * 0.0007 + 0.0002,
}));

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function drawStars() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  stars.forEach((star) => {
    star.y += star.v;
    if (star.y > 1.02) star.y = -0.02;

    ctx.beginPath();
    ctx.arc(star.x * canvas.width, star.y * canvas.height, star.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(183, 222, 255, ${star.o})`;
    ctx.fill();
  });

  requestAnimationFrame(drawStars);
}

if (navToggle) {
  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
}

const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.18 });

revealEls.forEach((item) => io.observe(item));

if (counter) {
  const target = Number(counter.dataset.target || 0);
  let frame = 0;
  const frames = 80;
  const tick = () => {
    frame += 1;
    const value = Math.round((target * frame) / frames);
    counter.textContent = value.toLocaleString();
    if (frame < frames) requestAnimationFrame(tick);
  };
  tick();
}

if (canvas && ctx) {
  resizeCanvas();
  drawStars();
  window.addEventListener('resize', resizeCanvas);
}
