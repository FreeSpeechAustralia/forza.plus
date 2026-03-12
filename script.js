const SOCIAL_PROFILES_URL = 'social-profiles.json?v=20260303-followers-65184';
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
          followers: 63145,
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
    updatedAt: '2026-03-03',
  },
};

const stars = Array.from({ length: 70 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.7 + 0.4,
  o: Math.random() * 0.6 + 0.2,
  v: Math.random() * 0.0007 + 0.0002,
}));

let canvas = null;
let ctx = null;
let io = null;
let socialProfilesPromise = null;
let canvasStarted = false;

function initRevealObserver() {
  if (io) return;

  io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18 });
}

function observeRevealElements(root = document) {
  initRevealObserver();
  const revealEls = root.querySelectorAll('.reveal');
  revealEls.forEach((item) => {
    if (item.classList.contains('visible')) return;
    io.observe(item);
  });
}

function closeNavigationMenu() {
  const nav = document.querySelector('.header-nav');
  const navToggle = document.querySelector('.nav-toggle');
  if (!nav || !navToggle) return;

  nav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}

function initNavigationToggle() {
  const nav = document.querySelector('.header-nav');
  const navToggle = document.querySelector('.nav-toggle');
  if (!nav || !navToggle) return;
  if (navToggle.dataset.bound === 'true') return;

  navToggle.dataset.bound = 'true';
  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
}

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

async function loadSocialProfiles() {
  if (socialProfilesPromise) {
    return socialProfilesPromise;
  }

  socialProfilesPromise = (async () => {
    const response = await fetch(SOCIAL_PROFILES_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to load ${SOCIAL_PROFILES_URL}`);
    }

    return response.json();
  })();

  return socialProfilesPromise;
}

async function getPulseTarget(counter) {
  const fallback = Number((counter && counter.dataset.target) || 0);
  const profileKey = (counter && counter.dataset.profileKey) || 'forza__777';

  try {
    const profiles = await loadSocialProfiles();
    const profile = profiles[profileKey];
    const total = totalFollowersFromProfile(profile);
    if (total > 0) return total;
  } catch (error) {
    console.warn('Pulse total fallback used (social-profiles.json not loaded).', error);
  }

  const localProfile = SOCIAL_PROFILES_FALLBACK[profileKey];
  const localTotal = totalFollowersFromProfile(localProfile);
  if (localTotal > 0) return localTotal;

  return fallback;
}

async function animatePulseCounter(counter) {
  if (!counter) return;
  if (counter.dataset.counterHydrated === 'true') return;

  counter.dataset.counterHydrated = 'true';
  const target = await getPulseTarget(counter);
  counter.dataset.target = String(target);
  let frame = 0;
  const frames = 80;

  const tick = () => {
    if (!counter.isConnected) return;
    frame += 1;
    const value = Math.round((target * frame) / frames);
    counter.textContent = value.toLocaleString();
    if (frame < frames) requestAnimationFrame(tick);
  };

  tick();
}

function setSolanaCopyStatus(statusEl, message, tone = 'info') {
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
  statusEl.hidden = false;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  helper.style.pointerEvents = 'none';
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  helper.setSelectionRange(0, helper.value.length);

  let copied = false;

  try {
    copied = document.execCommand('copy');
  } finally {
    document.body.removeChild(helper);
  }

  return copied;
}

async function handleSolanaCopyAddress(walletAddressEl, statusEl) {
  if (!walletAddressEl) return;
  const walletAddress = walletAddressEl.textContent ? walletAddressEl.textContent.trim() : '';
  if (!walletAddress) {
    setSolanaCopyStatus(statusEl, 'Wallet address unavailable.', 'error');
    return;
  }

  try {
    const copied = await copyTextToClipboard(walletAddress);
    if (!copied) throw new Error('Copy command was not successful.');
    setSolanaCopyStatus(statusEl, 'Wallet address copied.', 'success');
  } catch (error) {
    console.warn('Unable to copy Solana wallet address.', error);
    setSolanaCopyStatus(statusEl, 'Unable to copy automatically. Please copy the address manually.', 'error');
  }
}

function bindSolanaCopy(root = document) {
  const copyButton = root.querySelector('#copySolanaAddress');
  const walletAddress = root.querySelector('#solanaWalletAddress');
  const copyStatus = root.querySelector('#solanaCopyStatus');
  if (!copyButton || !walletAddress) return;
  if (copyButton.dataset.copyBound === 'true') return;

  copyButton.dataset.copyBound = 'true';
  copyButton.addEventListener('click', () => {
    void handleSolanaCopyAddress(walletAddress, copyStatus);
  });
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function drawStars() {
  if (!canvas || !ctx) return;

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

function initCanvas() {
  if (canvasStarted) return;

  canvas = document.getElementById('nebula-canvas');
  ctx = canvas ? canvas.getContext('2d') : null;
  if (!canvas || !ctx) return;

  canvasStarted = true;
  resizeCanvas();
  drawStars();
  window.addEventListener('resize', resizeCanvas);
}

function hydrateRoute(root = document) {
  observeRevealElements(root);
  const counter = root.querySelector('.counter');
  if (counter) {
    void animatePulseCounter(counter);
  }
  bindSolanaCopy(root);
}

function initSharedShell() {
  initNavigationToggle();
  initCanvas();
}

initSharedShell();

window.ForzaShared = {
  hydrate: hydrateRoute,
  closeNavigationMenu,
};
