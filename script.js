const canvas = document.getElementById('nebula-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.header-nav');
const revealEls = document.querySelectorAll('.reveal');
const counter = document.querySelector('.counter');
const xFeedShell = document.querySelector('[data-x-feed-shell]');
const xFeedEmbed = document.querySelector('[data-x-feed-embed]');
const xFeedLoading = document.querySelector('[data-x-feed-loading]');
const xFeedFallback = document.querySelector('[data-x-feed-fallback]');
const xFeedFallbackList = document.querySelector('[data-x-feed-fallback-list]');
const rssList = document.querySelector('.rss-list');

const X_WIDGETS_SCRIPT_SRC = 'https://platform.twitter.com/widgets.js';

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

function setXFeedState(state) {
  if (xFeedShell) {
    xFeedShell.dataset.feedState = state;
  }
}

function populateXFallbackList() {
  if (!xFeedFallbackList || !rssList) {
    return;
  }

  const sourceItems = Array.from(rssList.querySelectorAll('li')).slice(0, 5);
  if (!sourceItems.length) {
    return;
  }

  xFeedFallbackList.innerHTML = '';
  sourceItems.forEach((item) => {
    xFeedFallbackList.appendChild(item.cloneNode(true));
  });
}

function showXFallback() {
  setXFeedState('fallback');

  if (xFeedLoading) {
    xFeedLoading.hidden = true;
  }

  if (xFeedFallback) {
    xFeedFallback.hidden = false;
  }
}

function showXEmbedReady() {
  setXFeedState('ready');

  if (xFeedLoading) {
    xFeedLoading.hidden = true;
  }

  if (xFeedFallback) {
    xFeedFallback.hidden = true;
  }
}

function waitForXEmbedIframe(timeoutMs = 6500) {
  return new Promise((resolve, reject) => {
    if (!xFeedShell) {
      reject(new Error('X feed shell not found'));
      return;
    }

    const existingIframe = xFeedShell.querySelector('iframe');
    if (existingIframe) {
      resolve(existingIframe);
      return;
    }

    const observer = new MutationObserver(() => {
      const iframe = xFeedShell.querySelector('iframe');
      if (iframe) {
        window.clearTimeout(timeoutId);
        observer.disconnect();
        resolve(iframe);
      }
    });

    observer.observe(xFeedShell, {
      childList: true,
      subtree: true,
    });

    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('Timed out waiting for X embed'));
    }, timeoutMs);
  });
}

function loadXWidgetsScript() {
  return new Promise((resolve, reject) => {
    if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
      resolve(window.twttr);
      return;
    }

    const existingScript = document.querySelector('script[data-x-widgets-script], script[src*="platform.twitter.com/widgets.js"]');

    const handleLoad = () => {
      if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
        resolve(window.twttr);
        return;
      }

      reject(new Error('X widgets API unavailable after script load'));
    };

    const handleError = () => {
      reject(new Error('Failed to load X widgets script'));
    };

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = X_WIDGETS_SCRIPT_SRC;
    script.async = true;
    script.charset = 'utf-8';
    script.dataset.xWidgetsScript = 'true';
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    document.head.appendChild(script);
  });
}

function initXFeed() {
  if (!xFeedShell || !xFeedEmbed) {
    return;
  }

  populateXFallbackList();
  setXFeedState('loading');

  let feedResolved = false;

  const resolveFallback = () => {
    if (feedResolved) {
      return;
    }

    feedResolved = true;
    showXFallback();
  };

  const fallbackTimeout = window.setTimeout(() => {
    resolveFallback();
  }, 7000);

  loadXWidgetsScript()
    .then((twttr) => {
      twttr.widgets.load(xFeedShell);
      return waitForXEmbedIframe();
    })
    .then(() => {
      if (feedResolved) {
        return;
      }

      feedResolved = true;
      window.clearTimeout(fallbackTimeout);
      showXEmbedReady();
    })
    .catch(() => {
      window.clearTimeout(fallbackTimeout);
      resolveFallback();
    });
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

initXFeed();
