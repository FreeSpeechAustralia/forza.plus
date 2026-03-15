const appRoot = document.getElementById('app-root');

const ROUTES = {
  '/': {
    key: 'home',
    path: '/',
    title: 'Forza | Home',
    fragmentPath: '/fragments/home.html?v=20260312-spa',
    mainClass: '',
  },
  '/watch': {
    key: 'watch',
    path: '/watch',
    title: 'Forza | Watch',
    fragmentPath: '/fragments/watch.html?v=20260312-spa',
    mainClass: 'streams-main',
    scriptPath: '/watch.js?v=20260312-spa-route',
  },
  '/posts': {
    key: 'posts',
    path: '/posts',
    title: 'Forza | Posts',
    fragmentPath: '/fragments/posts.html?v=20260312-spa',
    mainClass: 'posts-main',
  },
  '/exclusive': {
    key: 'exclusive',
    path: '/exclusive',
    title: 'Forza | Exclusive',
    fragmentPath: '/fragments/exclusive.html?v=20260312-spa',
    mainClass: 'exclusive-main',
    scriptPath: '/exclusive.js?v=20260315-stripe-return-fix',
  },
  '/donate': {
    key: 'donate',
    path: '/donate',
    title: 'Forza | Donate',
    fragmentPath: '/fragments/donate.html?v=20260312-spa',
    mainClass: 'donate-main',
  },
  '/accounts': {
    key: 'accounts',
    path: '/accounts',
    title: 'Forza | Accounts',
    fragmentPath: '/fragments/accounts.html?v=20260312-spa',
    mainClass: 'accounts-main',
    scriptPath: '/accounts.js?v=20260315-stripe-return-fix',
  },
};

const routeContainers = new Map();
const loadedScripts = new Set();
const LEGACY_PATH_ALIASES = {
  '/index.html': '/',
  '/watch.html': '/watch',
  '/posts.html': '/posts',
  '/exclusive.html': '/exclusive',
  '/donate.html': '/donate',
  '/accounts.html': '/accounts',
};
const notFoundRoute = {
  title: 'Forza | Not Found',
  mainClass: '',
};
let notFoundContainer = null;

function normalizePath(pathname) {
  if (!pathname) return '/';

  const cleaned = pathname.replace(/\/+$/, '');
  if (!cleaned) return '/';
  if (LEGACY_PATH_ALIASES[cleaned]) return LEGACY_PATH_ALIASES[cleaned];
  return cleaned;
}

function getRouteByPath(pathname) {
  const normalizedPath = normalizePath(pathname);
  return ROUTES[normalizedPath] || null;
}

function setActiveNav(routePath) {
  const navLinks = document.querySelectorAll('.header-nav a');
  navLinks.forEach((link) => {
    link.removeAttribute('aria-current');
  });

  const accountsLink = document.querySelector('.accounts');
  if (accountsLink) {
    accountsLink.removeAttribute('aria-current');
  }

  if (routePath === '/accounts') {
    if (accountsLink) {
      accountsLink.setAttribute('aria-current', 'page');
    }
    return;
  }

  const activeNavLink = Array.from(navLinks).find((link) => normalizePath(link.getAttribute('href')) === routePath);
  if (activeNavLink) {
    activeNavLink.setAttribute('aria-current', 'page');
  }
}

function applyRouteFrame(route) {
  appRoot.className = route.mainClass || '';
  document.title = route.title;
  setActiveNav(route.path || '');

  if (window.ForzaShared && typeof window.ForzaShared.closeNavigationMenu === 'function') {
    window.ForzaShared.closeNavigationMenu();
  }
}

function safeHydrate(container) {
  if (!window.ForzaShared || typeof window.ForzaShared.hydrate !== 'function') {
    return;
  }

  try {
    window.ForzaShared.hydrate(container);
  } catch (error) {
    console.error('Route hydration failed.', error);
    const revealEls = container ? container.querySelectorAll('.reveal') : [];
    revealEls.forEach((item) => {
      item.classList.add('visible');
    });
  }
}

async function loadScriptOnce(scriptPath) {
  if (!scriptPath || loadedScripts.has(scriptPath)) return;

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptPath;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Unable to load script: ${scriptPath}`));
    document.body.appendChild(script);
  });

  loadedScripts.add(scriptPath);
}

async function loadRouteContainer(route) {
  if (routeContainers.has(route.path)) {
    return routeContainers.get(route.path);
  }

  const response = await fetch(route.fragmentPath, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load route fragment for ${route.path}`);
  }

  const html = await response.text();
  const container = document.createElement('section');
  container.dataset.routePage = route.path;
  container.hidden = true;
  container.innerHTML = html;
  appRoot.appendChild(container);

  routeContainers.set(route.path, container);

  if (route.scriptPath) {
    await loadScriptOnce(route.scriptPath);
  }

  return container;
}

function hideAllRouteContainers() {
  routeContainers.forEach((container) => {
    container.hidden = true;
  });

  if (notFoundContainer) {
    notFoundContainer.hidden = true;
  }
}

function showNotFound(pathname) {
  hideAllRouteContainers();

  if (!notFoundContainer) {
    notFoundContainer = document.createElement('section');
    notFoundContainer.className = 'glass reveal';
    notFoundContainer.dataset.routePage = 'not-found';
    appRoot.appendChild(notFoundContainer);
  }

  notFoundContainer.innerHTML = `
    <article class="glass account-panel account-feedback-panel">
      <p class="label">Not Found</p>
      <h2>Page unavailable</h2>
      <p class="account-message">No page exists at <code>${pathname}</code>.</p>
      <p><a class="btn primary" href="/">Go Home</a></p>
    </article>
  `;
  notFoundContainer.hidden = false;

  safeHydrate(notFoundContainer);

  applyRouteFrame(notFoundRoute);
}

async function renderCurrentRoute() {
  const currentUrl = new URL(window.location.href);
  const normalizedPath = normalizePath(currentUrl.pathname);
  if (normalizedPath !== currentUrl.pathname) {
    window.history.replaceState({}, '', `${normalizedPath}${currentUrl.search}${currentUrl.hash}`);
  }

  const route = getRouteByPath(normalizedPath);
  if (!route) {
    showNotFound(normalizedPath);
    return;
  }

  try {
    const container = await loadRouteContainer(route);
    hideAllRouteContainers();
    container.hidden = false;
    applyRouteFrame(route);

    safeHydrate(container);
  } catch (error) {
    console.error(error);
    showNotFound(normalizedPath);
  }
}

function shouldHandleClientNavigation(anchor) {
  if (!anchor) return false;
  if (anchor.hasAttribute('download')) return false;
  if (anchor.getAttribute('target') && anchor.getAttribute('target') !== '_self') return false;

  const href = anchor.getAttribute('href');
  if (!href) return false;
  if (href.startsWith('#')) return false;
  if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  return Boolean(getRouteByPath(url.pathname));
}

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href]');
  if (!shouldHandleClientNavigation(anchor)) {
    return;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  const nextPath = normalizePath(nextUrl.pathname);
  const currentPath = normalizePath(window.location.pathname);
  const sameDestination = nextPath === currentPath
    && nextUrl.search === window.location.search
    && nextUrl.hash === window.location.hash;

  if (sameDestination) {
    return;
  }

  event.preventDefault();
  window.history.pushState({}, '', `${nextPath}${nextUrl.search}${nextUrl.hash}`);
  void renderCurrentRoute();
});

window.addEventListener('popstate', () => {
  void renderCurrentRoute();
});

void renderCurrentRoute();
