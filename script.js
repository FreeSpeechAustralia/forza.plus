const canvas = document.getElementById('nebula-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.header-nav');
const revealEls = document.querySelectorAll('.reveal');
const counter = document.querySelector('.counter');
const SOCIAL_PROFILES_URL = 'social-profiles.json';
const SOCIAL_PROFILES_FALLBACK = {
  forza__777: {
    displayName: 'Forza',
    platforms: {
      x: {
        handle: 'forza__777',
        followers: 355,
      },
      instagram: [
        {
          handle: 'forza__777',
          followers: 34500,
          type: 'primary',
        },
        {
          handle: 'goytogoy',
          followers: 1676,
          type: 'backup',
        },
      ],
      kick: {
        handle: 'forzzza',
        followers: 8,
      },
      rumble: {
        channel: null,
        followers: 0,
      },
    },
    updatedAt: '2026-03-02',
  },
};

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

function totalFollowersFromProfile(profile) {
  const platforms = profile && profile.platforms ? profile.platforms : {};
  let total = 0;

  Object.values(platforms).forEach((platform) => {
    if (Array.isArray(platform)) {
      platform.forEach((entry) => {
        total += Number(entry.followers) || 0;
      });
      return;
    }

    if (platform && typeof platform === 'object') {
      total += Number(platform.followers) || 0;
    }
  });

  return total;
}

async function getPulseTarget() {
  const fallback = Number((counter && counter.dataset.target) || 0);
  const profileKey = (counter && counter.dataset.profileKey) || 'forza__777';

  try {
    const response = await fetch(SOCIAL_PROFILES_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load ${SOCIAL_PROFILES_URL}`);

    const profiles = await response.json();
    const profile = profiles[profileKey];
    const total = totalFollowersFromProfile(profile);

    return total > 0 ? total : fallback;
  } catch (error) {
    const localProfile = SOCIAL_PROFILES_FALLBACK[profileKey];
    const localTotal = totalFollowersFromProfile(localProfile);
    if (localTotal > 0) return localTotal;

    console.warn('Pulse total fallback used (social-profiles.json not loaded).', error);
    return fallback;
  }
}

async function animatePulseCounter() {
  if (!counter) return;

  const target = await getPulseTarget();
  counter.dataset.target = String(target);
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

animatePulseCounter();

if (canvas && ctx) {
  resizeCanvas();
  drawStars();
  window.addEventListener('resize', resizeCanvas);
}
